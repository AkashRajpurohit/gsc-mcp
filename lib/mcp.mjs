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
const SEARCH_TYPES = ['web', 'image', 'video', 'news', 'discover'];
const OPERATORS = ['equals', 'notEquals', 'contains', 'notContains', 'includingRegex', 'excludingRegex'];
const DATA_STATES = ['final', 'all'];
const AGGREGATION_TYPES = ['auto', 'byProperty', 'byPage'];

const API_MAX_ROWS_PER_REQUEST = 25000;
const DEFAULT_ROW_LIMIT = 1000;
const DEFAULT_MAX_ROWS = 25000;

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
        startDate: { type: 'string', description: 'YYYY-MM-DD (overrides days).' },
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

function validateAnalytics(a) {
  if (a.days != null && (typeof a.days !== 'number' || !Number.isFinite(a.days) || a.days <= 0)) {
    throw new ToolError('"days" must be a positive number.');
  }
  for (const key of ['startDate', 'endDate']) {
    if (a[key] != null && (typeof a[key] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(a[key]))) {
      throw new ToolError(`"${key}" must be a date string in YYYY-MM-DD format.`);
    }
  }
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

export function buildAnalyticsBody(a, page = {}) {
  const body = {
    startDate: a.startDate ?? ago(a.days ?? 28),
    endDate: a.endDate ?? ago(1),
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

  const rows = [];
  let aggregation;
  let hasMore = false;
  while (rows.length < target) {
    const perPage = Math.min(target - rows.length, API_MAX_ROWS_PER_REQUEST);
    const body = buildAnalyticsBody(a, { startRow: baseStart + rows.length, rowLimit: perPage });
    const data = await gsc.searchAnalytics(site, body);
    const batch = data?.rows ?? [];
    if (data?.responseAggregationType) aggregation = data.responseAggregationType;
    rows.push(...batch);
    if (batch.length < perPage) break;
    if (rows.length >= target) {
      hasMore = true;
      break;
    }
  }

  if (a.aggregationType && a.aggregationType !== 'auto' && aggregation && aggregation.toLowerCase() !== a.aggregationType.toLowerCase()) {
    warnings.push(`Requested aggregationType "${a.aggregationType}" but the API aggregated "${aggregation}".`);
  }
  if (hasMore) {
    warnings.push('More rows are available beyond the returned set; increase rowLimit/maxRows or use startRow to page further.');
  }

  return {
    siteUrl: site,
    period: { startDate: a.startDate ?? ago(a.days ?? 28), endDate: a.endDate ?? ago(1) },
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
