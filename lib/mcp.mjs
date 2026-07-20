#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import pkg from '../package.json' with { type: 'json' };
import * as gscApi from './gsc.mjs';

const VERSION = pkg.version;

const ago = (d) => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
const ok = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });
const err = (msg) => ({ content: [{ type: 'text', text: `Error: ${sanitize(msg)}` }], isError: true });

const DIMENSIONS = ['date', 'query', 'page', 'country', 'device', 'searchAppearance'];
const FILTER_DIMENSIONS = ['query', 'page', 'country', 'device', 'searchAppearance'];
const GROUP_BY_DIMENSIONS = ['page', 'query', 'country', 'device'];
const SEARCH_TYPES = ['web', 'image', 'video', 'news', 'discover'];
const OPERATORS = ['equals', 'notEquals', 'contains', 'notContains', 'includingRegex', 'excludingRegex'];
const DATA_STATES = ['final', 'all'];
const AGGREGATION_TYPES = ['auto', 'byProperty', 'byPage'];
const DATE_PRESETS = {
  last_7_days: 7,
  last_28_days: 28,
  last_3_months: 90,
  last_6_months: 180,
  last_12_months: 365,
  last_16_months: 480,
};

const API_MAX_ROWS_PER_REQUEST = 25000;
const DEFAULT_ROW_LIMIT = 1000;
const DEFAULT_MAX_ROWS = 25000;
const DEFAULT_COMPARE_ROW_LIMIT = 5000;
const DEFAULT_TOP_N = 10;

const DAY_MS = 864e5;
const parseDate = (s) => Date.parse(`${s}T00:00:00Z`);
const formatDate = (ms) => new Date(ms).toISOString().slice(0, 10);
const inclusiveDays = (start, end) => Math.round((parseDate(end) - parseDate(start)) / DAY_MS) + 1;
const round = (n, digits = 2) => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};
const changePercent = (current, previous) => {
  if (previous === 0) return current === 0 ? 0 : null;
  return round(((current - previous) / previous) * 100);
};

export const TOOLS = [
  {
    name: 'gsc_list_sites',
    description:
      'List all Google Search Console properties this credential can read. Returns the exact siteUrl to pass to other tools (domain properties look like "sc-domain:example.com", URL-prefix properties look like "https://example.com/").',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'gsc_search_analytics',
    description:
      'Google Search Console Search Analytics: clicks, impressions, CTR, average position. Group by any dimensions (date, query, page, country, device, searchAppearance), filter by dimension, and page through large result sets automatically. Use this for "top pages", "top queries", traffic over time, filtered breakdowns, etc. Returns the rows plus metadata describing the request (period, dimensions, rowCount, hasMore, warnings).',
    inputSchema: {
      type: 'object',
      properties: {
        site: { type: 'string', description: 'siteUrl from gsc_list_sites, e.g. "sc-domain:example.com". Alias: "siteUrl".' },
        siteUrl: { type: 'string', description: 'Alias for "site".' },
        days: { type: 'number', description: 'Lookback window in days from yesterday (default 28). Ignored if startDate given.' },
        datePreset: { type: 'string', enum: Object.keys(DATE_PRESETS), description: 'Rolling window ending yesterday, instead of days or startDate/endDate. Takes precedence over days.' },
        startDate: { type: 'string', description: 'YYYY-MM-DD (overrides days and datePreset).' },
        endDate: { type: 'string', description: 'YYYY-MM-DD (default yesterday).' },
        dimensions: {
          type: 'array',
          items: { type: 'string', enum: DIMENSIONS },
          description: 'Group by, e.g. ["query"], ["page"], ["date"], ["page","query"], ["country"]. Default ["query"].',
        },
        filters: {
          type: 'array',
          description: 'Dimension filters, all combined with AND. Each: { dimension, operator, expression }.',
          items: {
            type: 'object',
            properties: {
              dimension: { type: 'string', enum: FILTER_DIMENSIONS },
              operator: { type: 'string', enum: OPERATORS, description: 'default "equals"' },
              expression: { type: 'string' },
            },
            required: ['dimension', 'expression'],
          },
        },
        filterPage: { type: 'string', description: 'Convenience: only rows for pages containing this substring (a shorthand page "contains" filter).' },
        searchType: { type: 'string', enum: SEARCH_TYPES, description: 'Search surface (default web).' },
        dataState: { type: 'string', enum: DATA_STATES, description: '"final" (default) or "all" to include fresh, not-yet-finalized data.' },
        aggregationType: { type: 'string', enum: AGGREGATION_TYPES, description: 'How to aggregate: "auto" (default), "byProperty", or "byPage".' },
        rowLimit: { type: 'number', description: `Total rows to return (default ${DEFAULT_ROW_LIMIT}). Values above ${API_MAX_ROWS_PER_REQUEST} are fetched by paging automatically, up to maxRows.` },
        maxRows: { type: 'number', description: `Safety ceiling on total rows fetched (default ${DEFAULT_MAX_ROWS}). Protects against accidentally huge pulls.` },
        startRow: { type: 'number', description: 'Zero-based offset to start from (default 0), for manual pagination.' },
      },
      required: ['site'],
    },
  },
  {
    name: 'compare_search_performance',
    description:
      'Compare Search Console performance between two date periods. Computes clicks, impressions, CTR, and average position for each period plus the absolute and percentage change, all deterministically in code. Optionally group by page, query, country, or device to get the biggest declines and gains. If the previous period is not given, it defaults to the equal-length window immediately before the current one. Note: for position, lower is better, so a positive change means the average rank got worse.',
    inputSchema: {
      type: 'object',
      properties: {
        site: { type: 'string', description: 'siteUrl from gsc_list_sites. Alias: "siteUrl".' },
        siteUrl: { type: 'string', description: 'Alias for "site".' },
        days: { type: 'number', description: 'Length of the current period in days ending yesterday (default 28). Ignored if startDate given.' },
        datePreset: { type: 'string', enum: Object.keys(DATE_PRESETS), description: 'Rolling current period ending yesterday, instead of days or startDate/endDate. Takes precedence over days.' },
        startDate: { type: 'string', description: 'Current period start, YYYY-MM-DD (overrides days and datePreset).' },
        endDate: { type: 'string', description: 'Current period end, YYYY-MM-DD (default yesterday).' },
        previousStartDate: { type: 'string', description: 'Previous period start, YYYY-MM-DD. Defaults to the equal-length window before the current period.' },
        previousEndDate: { type: 'string', description: 'Previous period end, YYYY-MM-DD. Required if previousStartDate is given.' },
        groupBy: { type: 'string', enum: GROUP_BY_DIMENSIONS, description: 'Break the comparison down by this dimension to find the biggest movers.' },
        filters: {
          type: 'array',
          description: 'Dimension filters applied to both periods, combined with AND. Each: { dimension, operator, expression }.',
          items: {
            type: 'object',
            properties: {
              dimension: { type: 'string', enum: FILTER_DIMENSIONS },
              operator: { type: 'string', enum: OPERATORS, description: 'default "equals"' },
              expression: { type: 'string' },
            },
            required: ['dimension', 'expression'],
          },
        },
        searchType: { type: 'string', enum: SEARCH_TYPES, description: 'Search surface (default web).' },
        dataState: { type: 'string', enum: DATA_STATES, description: '"final" (default) or "all".' },
        rowLimit: { type: 'number', description: `When grouping, how many rows to fetch per period (default ${DEFAULT_COMPARE_ROW_LIMIT}).` },
        limit: { type: 'number', description: `How many rows to return in largestDeclines / largestGains (default ${DEFAULT_TOP_N}).` },
      },
      required: ['site'],
    },
  },
  {
    name: 'gsc_inspect_url',
    description:
      'URL Inspection API: index status of a specific URL (is it indexed, last crawl, coverage state, mobile usability, canonical). Use to answer "is this page indexed by Google?".',
    inputSchema: {
      type: 'object',
      properties: {
        site: { type: 'string', description: 'siteUrl, e.g. "sc-domain:example.com"' },
        url: { type: 'string', description: 'Full URL to inspect, e.g. https://example.com/blog/my-post/' },
      },
      required: ['site', 'url'],
    },
  },
  {
    name: 'gsc_list_sitemaps',
    description: 'List submitted sitemaps for a property with their submitted/indexed counts and errors.',
    inputSchema: {
      type: 'object',
      properties: { site: { type: 'string' } },
      required: ['site'],
    },
  },
];

export function sanitize(text) {
  let s = String(text ?? '');
  s = s.replace(
    /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    '[REDACTED]',
  );
  s = s.replace(
    /("?(?:private_key|access_token|refresh_token|client_secret|id_token|api_key)"?\s*[:=]\s*)"?[^"\s,}]+"?/gi,
    '$1[REDACTED]',
  );
  return s;
}

class ToolError extends Error {}

function requireString(args, key) {
  if (typeof args[key] !== 'string' || args[key].trim() === '') {
    throw new ToolError(`Missing or invalid required argument "${key}" (expected a non-empty string).`);
  }
}

function positiveInt(a, key, { min = 1 } = {}) {
  if (a[key] != null && (!Number.isInteger(a[key]) || a[key] < min)) {
    throw new ToolError(`"${key}" must be an integer >= ${min}.`);
  }
}

function validateDate(a, key) {
  if (a[key] != null && (typeof a[key] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(a[key]))) {
    throw new ToolError(`"${key}" must be a date string in YYYY-MM-DD format.`);
  }
}

function validateDatePreset(a) {
  if (a.datePreset != null && !Object.hasOwn(DATE_PRESETS, a.datePreset)) {
    throw new ToolError(`Unknown datePreset "${a.datePreset}". Allowed: ${Object.keys(DATE_PRESETS).join(', ')}.`);
  }
}

function validateFilters(a) {
  if (a.filters != null) {
    if (!Array.isArray(a.filters)) {
      throw new ToolError('"filters" must be an array of { dimension, operator, expression }.');
    }
    for (const f of a.filters) {
      if (!f || typeof f !== 'object' || Array.isArray(f)) {
        throw new ToolError('Each filter must be an object with { dimension, operator, expression }.');
      }
      if (!FILTER_DIMENSIONS.includes(f.dimension)) {
        throw new ToolError(`Filter has unknown dimension "${f.dimension}". Allowed: ${FILTER_DIMENSIONS.join(', ')}.`);
      }
      if (f.operator != null && !OPERATORS.includes(f.operator)) {
        throw new ToolError(`Filter has unknown operator "${f.operator}". Allowed: ${OPERATORS.join(', ')}.`);
      }
      if (typeof f.expression !== 'string' || f.expression === '') {
        throw new ToolError('Each filter needs a non-empty "expression" string.');
      }
    }
  }
  if (a.filterPage != null && typeof a.filterPage !== 'string') {
    throw new ToolError('"filterPage" must be a string.');
  }
}

function validateAnalytics(a) {
  if (a.days != null && (typeof a.days !== 'number' || !Number.isFinite(a.days) || a.days <= 0)) {
    throw new ToolError('"days" must be a positive number.');
  }
  validateDate(a, 'startDate');
  validateDate(a, 'endDate');
  validateDatePreset(a);
  if (a.dimensions != null) {
    if (!Array.isArray(a.dimensions) || a.dimensions.length === 0) {
      throw new ToolError('"dimensions" must be a non-empty array.');
    }
    for (const d of a.dimensions) {
      if (!DIMENSIONS.includes(d)) {
        throw new ToolError(`Unknown dimension "${d}". Allowed: ${DIMENSIONS.join(', ')}.`);
      }
    }
  }
  validateFilters(a);
  if (a.searchType != null && !SEARCH_TYPES.includes(a.searchType)) {
    throw new ToolError(`Unknown searchType "${a.searchType}". Allowed: ${SEARCH_TYPES.join(', ')}.`);
  }
  if (a.dataState != null && !DATA_STATES.includes(a.dataState)) {
    throw new ToolError(`Unknown dataState "${a.dataState}". Allowed: ${DATA_STATES.join(', ')}.`);
  }
  if (a.aggregationType != null && !AGGREGATION_TYPES.includes(a.aggregationType)) {
    throw new ToolError(`Unknown aggregationType "${a.aggregationType}". Allowed: ${AGGREGATION_TYPES.join(', ')}.`);
  }
  positiveInt(a, 'rowLimit');
  positiveInt(a, 'maxRows');
  positiveInt(a, 'startRow', { min: 0 });
}

function buildFilters(a) {
  const filters = [];
  if (Array.isArray(a.filters)) {
    for (const f of a.filters) {
      filters.push({ dimension: f.dimension, operator: f.operator ?? 'equals', expression: f.expression });
    }
  }
  if (a.filterPage) {
    filters.push({ dimension: 'page', operator: 'contains', expression: a.filterPage });
  }
  return filters;
}

function resolvePeriod(a) {
  const days = a.datePreset != null ? DATE_PRESETS[a.datePreset] : (a.days ?? 28);
  return { startDate: a.startDate ?? ago(days), endDate: a.endDate ?? ago(1) };
}

export function buildAnalyticsBody(a, page = {}) {
  const period = resolvePeriod(a);
  const body = {
    startDate: period.startDate,
    endDate: period.endDate,
    dimensions: a.dimensions ?? ['query'],
    type: a.searchType ?? 'web',
    dataState: a.dataState ?? 'final',
    aggregationType: a.aggregationType ?? 'auto',
    rowLimit: page.rowLimit ?? Math.min(a.rowLimit ?? DEFAULT_ROW_LIMIT, API_MAX_ROWS_PER_REQUEST),
    startRow: page.startRow ?? a.startRow ?? 0,
  };
  const filters = buildFilters(a);
  if (filters.length) {
    body.dimensionFilterGroups = [{ groupType: 'and', filters }];
  }
  return body;
}

async function pageRows(gsc, site, buildBody, target, startAt = 0) {
  const rows = [];
  let aggregation;
  let hasMore = false;
  while (rows.length < target) {
    const perPage = Math.min(target - rows.length, API_MAX_ROWS_PER_REQUEST);
    const data = await gsc.searchAnalytics(site, buildBody(startAt + rows.length, perPage));
    const batch = data?.rows ?? [];
    if (data?.responseAggregationType) aggregation = data.responseAggregationType;
    rows.push(...batch);
    if (batch.length < perPage) break;
    if (rows.length >= target) {
      hasMore = true;
      break;
    }
  }
  return { rows, aggregation, hasMore };
}

async function runSearchAnalytics(gsc, site, a) {
  const warnings = [];
  const requested = a.rowLimit ?? DEFAULT_ROW_LIMIT;
  const maxRows = a.maxRows ?? DEFAULT_MAX_ROWS;
  const baseStart = a.startRow ?? 0;

  let target = requested;
  if (target > maxRows) {
    warnings.push(`rowLimit ${requested} exceeds maxRows ${maxRows}; returning at most ${maxRows} rows. Increase maxRows to fetch more.`);
    target = maxRows;
  }

  const { rows, aggregation, hasMore } = await pageRows(
    gsc,
    site,
    (startRow, rowLimit) => buildAnalyticsBody(a, { startRow, rowLimit }),
    target,
    baseStart,
  );

  if (a.aggregationType && a.aggregationType !== 'auto' && aggregation && aggregation.toLowerCase() !== a.aggregationType.toLowerCase()) {
    warnings.push(`Requested aggregationType "${a.aggregationType}" but the API aggregated "${aggregation}".`);
  }
  if (hasMore) {
    warnings.push('More rows are available beyond the returned set; increase rowLimit/maxRows or use startRow to page further.');
  }

  return {
    siteUrl: site,
    period: resolvePeriod(a),
    dimensions: a.dimensions ?? ['query'],
    searchType: a.searchType ?? 'web',
    dataState: a.dataState ?? 'final',
    aggregationType: aggregation ?? a.aggregationType ?? 'auto',
    startRow: baseStart,
    rowCount: rows.length,
    hasMore,
    rows,
    warnings,
  };
}

function validateCompare(a) {
  if (a.days != null && (typeof a.days !== 'number' || !Number.isFinite(a.days) || a.days <= 0)) {
    throw new ToolError('"days" must be a positive number.');
  }
  for (const key of ['startDate', 'endDate', 'previousStartDate', 'previousEndDate']) {
    validateDate(a, key);
  }
  validateDatePreset(a);
  if ((a.previousStartDate == null) !== (a.previousEndDate == null)) {
    throw new ToolError('Provide both "previousStartDate" and "previousEndDate", or neither.');
  }
  if (a.groupBy != null && !GROUP_BY_DIMENSIONS.includes(a.groupBy)) {
    throw new ToolError(`Unknown groupBy "${a.groupBy}". Allowed: ${GROUP_BY_DIMENSIONS.join(', ')}.`);
  }
  validateFilters(a);
  if (a.searchType != null && !SEARCH_TYPES.includes(a.searchType)) {
    throw new ToolError(`Unknown searchType "${a.searchType}". Allowed: ${SEARCH_TYPES.join(', ')}.`);
  }
  if (a.dataState != null && !DATA_STATES.includes(a.dataState)) {
    throw new ToolError(`Unknown dataState "${a.dataState}". Allowed: ${DATA_STATES.join(', ')}.`);
  }
  positiveInt(a, 'rowLimit');
  positiveInt(a, 'limit');
}

function metric(current, previous, digits) {
  const cur = digits == null ? current : round(current, digits);
  const prev = digits == null ? previous : round(previous, digits);
  const change = digits == null ? cur - prev : round(cur - prev, digits);
  return { current: cur, previous: prev, change, changePercent: changePercent(current, previous) };
}

async function fetchTotals(gsc, site, periodArgs) {
  const body = buildAnalyticsBody({ ...periodArgs, dimensions: [] }, { startRow: 0, rowLimit: 1 });
  const data = await gsc.searchAnalytics(site, body);
  const r = data?.rows?.[0] ?? {};
  return { clicks: r.clicks ?? 0, impressions: r.impressions ?? 0, ctr: r.ctr ?? 0, position: r.position ?? 0 };
}

async function runCompare(gsc, site, a) {
  const warnings = [];
  const { startDate: curStart, endDate: curEnd } = resolvePeriod(a);

  let prevStart;
  let prevEnd;
  if (a.previousStartDate && a.previousEndDate) {
    prevStart = a.previousStartDate;
    prevEnd = a.previousEndDate;
  } else {
    const length = inclusiveDays(curStart, curEnd);
    const pe = parseDate(curStart) - DAY_MS;
    prevStart = formatDate(pe - (length - 1) * DAY_MS);
    prevEnd = formatDate(pe);
  }

  const shared = { searchType: a.searchType, dataState: a.dataState, filters: a.filters, filterPage: a.filterPage };
  const currentArgs = { ...shared, startDate: curStart, endDate: curEnd };
  const previousArgs = { ...shared, startDate: prevStart, endDate: prevEnd };

  const [curTotals, prevTotals] = [await fetchTotals(gsc, site, currentArgs), await fetchTotals(gsc, site, previousArgs)];

  const summary = {
    clicks: metric(curTotals.clicks, prevTotals.clicks, null),
    impressions: metric(curTotals.impressions, prevTotals.impressions, null),
    ctr: metric(curTotals.ctr, prevTotals.ctr, 4),
    position: metric(curTotals.position, prevTotals.position, 2),
  };

  const result = {
    siteUrl: site,
    current: { startDate: curStart, endDate: curEnd },
    previous: { startDate: prevStart, endDate: prevEnd },
    searchType: a.searchType ?? 'web',
    summary,
    warnings,
  };

  if (a.groupBy) {
    const target = a.rowLimit ?? DEFAULT_COMPARE_ROW_LIMIT;
    const limit = a.limit ?? DEFAULT_TOP_N;
    const build = (periodArgs) => (startRow, rowLimit) =>
      buildAnalyticsBody({ ...periodArgs, dimensions: [a.groupBy] }, { startRow, rowLimit });
    const cur = await pageRows(gsc, site, build(currentArgs), target);
    const prev = await pageRows(gsc, site, build(previousArgs), target);

    const curMap = new Map(cur.rows.map((r) => [r.keys[0], r]));
    const prevMap = new Map(prev.rows.map((r) => [r.keys[0], r]));
    const keys = new Set([...curMap.keys(), ...prevMap.keys()]);

    const rows = [];
    for (const key of keys) {
      const c = curMap.get(key);
      const p = prevMap.get(key);
      const currentClicks = c?.clicks ?? 0;
      const previousClicks = p?.clicks ?? 0;
      rows.push({
        [a.groupBy]: key,
        currentClicks,
        previousClicks,
        change: currentClicks - previousClicks,
        changePercent: changePercent(currentClicks, previousClicks),
        currentImpressions: c?.impressions ?? 0,
        previousImpressions: p?.impressions ?? 0,
      });
    }

    const byKey = (x, y) => String(x[a.groupBy]).localeCompare(String(y[a.groupBy]));
    result.groupBy = a.groupBy;
    result.rowCount = keys.size;
    result.largestDeclines = rows.filter((r) => r.change < 0).sort((x, y) => x.change - y.change || byKey(x, y)).slice(0, limit);
    result.largestGains = rows.filter((r) => r.change > 0).sort((x, y) => y.change - x.change || byKey(x, y)).slice(0, limit);

    if (cur.hasMore || prev.hasMore) {
      warnings.push(`Only the first ${target} rows per period were compared; increase rowLimit for fuller coverage.`);
    }
  }

  return result;
}

export async function handleToolCall(name, args = {}, gsc = gscApi) {
  const a = args ?? {};
  try {
    if (name === 'gsc_list_sites') return ok(await gsc.listSites());
    if (name === 'gsc_search_analytics') {
      const site = a.site ?? a.siteUrl;
      if (typeof site !== 'string' || site.trim() === '') {
        throw new ToolError('Missing or invalid required argument "site" (or "siteUrl") (expected a non-empty string).');
      }
      validateAnalytics(a);
      return ok(await runSearchAnalytics(gsc, site, a));
    }
    if (name === 'compare_search_performance') {
      const site = a.site ?? a.siteUrl;
      if (typeof site !== 'string' || site.trim() === '') {
        throw new ToolError('Missing or invalid required argument "site" (or "siteUrl") (expected a non-empty string).');
      }
      validateCompare(a);
      return ok(await runCompare(gsc, site, a));
    }
    if (name === 'gsc_inspect_url') {
      requireString(a, 'site');
      requireString(a, 'url');
      return ok(await gsc.inspectUrl(a.site, a.url));
    }
    if (name === 'gsc_list_sitemaps') {
      requireString(a, 'site');
      return ok(await gsc.listSitemaps(a.site));
    }
    return err(`Unknown tool: ${name}`);
  } catch (e) {
    return err(e?.message || String(e));
  }
}

export function start() {
  const server = new Server({ name: 'gsc', version: VERSION }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, async (req) =>
    handleToolCall(req.params.name, req.params.arguments),
  );
  return server.connect(new StdioServerTransport());
}

function isMain(metaUrl) {
  try {
    return realpathSync(fileURLToPath(metaUrl)) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}

if (isMain(import.meta.url)) await start();
