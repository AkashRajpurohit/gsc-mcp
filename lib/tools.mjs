import {
  DIMENSIONS,
  FILTER_DIMENSIONS,
  GROUP_BY_DIMENSIONS,
  SEARCH_TYPES,
  OPERATORS,
  DATA_STATES,
  AGGREGATION_TYPES,
  DATE_PRESETS,
  API_MAX_ROWS_PER_REQUEST,
  DEFAULT_ROW_LIMIT,
  DEFAULT_MAX_ROWS,
  DEFAULT_COMPARE_ROW_LIMIT,
  DEFAULT_TOP_N,
  OPPORTUNITY_TYPES,
  OPPORTUNITY_DIMENSIONS,
  DEFAULT_OPPORTUNITY_ROW_LIMIT,
  DEFAULT_OPPORTUNITY_MIN_IMPRESSIONS,
  DEFAULT_OPPORTUNITY_LIMIT,
  DEFAULT_INSPECT_CONCURRENCY,
  MAX_INSPECT_CONCURRENCY,
  DEFAULT_INSPECT_MAX_URLS,
} from './util/constants.mjs';
import { ToolError, sanitize, describeError } from './util/errors.mjs';
import { requireString, validateAnalytics, validateCompare, validateOpportunities, validateInspectUrls } from './util/validation.mjs';
import { runSearchAnalytics } from './analytics.mjs';
import { runCompare } from './compare.mjs';
import { runOpportunities } from './opportunities.mjs';
import { runInspectUrls } from './inspect.mjs';
import * as gscApi from './gsc.mjs';

const ok = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });
const err = (msg) => ({ content: [{ type: 'text', text: `Error: ${sanitize(msg)}` }], isError: true });

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
    name: 'find_seo_opportunities',
    description:
      'Find quick-win SEO opportunities from Search Console data, computed in code and sorted by impressions (biggest potential first). type "striking_distance" (default) surfaces queries or pages ranking just off page 1 (positions 11 to 20 by default) with real impressions, where a small ranking gain could win clicks. type "low_ctr" surfaces queries or pages already ranking on page 1 that get few clicks for their impressions, pointing to title and description improvements.',
    inputSchema: {
      type: 'object',
      properties: {
        site: { type: 'string', description: 'siteUrl from gsc_list_sites. Alias: "siteUrl".' },
        siteUrl: { type: 'string', description: 'Alias for "site".' },
        type: { type: 'string', enum: OPPORTUNITY_TYPES, description: 'Analysis to run (default "striking_distance").' },
        dimension: { type: 'string', enum: OPPORTUNITY_DIMENSIONS, description: 'Analyze by "query" (default) or "page".' },
        days: { type: 'number', description: 'Lookback window in days from yesterday (default 28). Ignored if startDate given.' },
        datePreset: { type: 'string', enum: Object.keys(DATE_PRESETS), description: 'Rolling window ending yesterday, instead of days or startDate/endDate.' },
        startDate: { type: 'string', description: 'YYYY-MM-DD (overrides days and datePreset).' },
        endDate: { type: 'string', description: 'YYYY-MM-DD (default yesterday).' },
        searchType: { type: 'string', enum: SEARCH_TYPES, description: 'Search surface (default web).' },
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
        minImpressions: { type: 'number', description: `Only consider rows with at least this many impressions (default ${DEFAULT_OPPORTUNITY_MIN_IMPRESSIONS}).` },
        minPosition: { type: 'number', description: 'striking_distance only: lowest average position to include (default 11).' },
        maxPosition: { type: 'number', description: 'Highest average position to include (default 20 for striking_distance, 10 for low_ctr).' },
        maxCtr: { type: 'number', description: 'low_ctr only: only flag rows with CTR at or below this (0 to 1, default 0.02).' },
        rowLimit: { type: 'number', description: `How many rows to scan (default ${DEFAULT_OPPORTUNITY_ROW_LIMIT}).` },
        limit: { type: 'number', description: `Max opportunities to return (default ${DEFAULT_OPPORTUNITY_LIMIT}).` },
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
    name: 'gsc_inspect_urls',
    description:
      'URL Inspection API in batch: check the index status of many URLs at once, with bounded concurrency. Returns a compact status per URL (verdict, coverage state, indexing state, canonical, last crawl). For the full detail of a single URL, use gsc_inspect_url. An individual URL that fails is reported with an error field and does not fail the whole batch.',
    inputSchema: {
      type: 'object',
      properties: {
        site: { type: 'string', description: 'siteUrl, e.g. "sc-domain:example.com". Alias: "siteUrl".' },
        siteUrl: { type: 'string', description: 'Alias for "site".' },
        urls: { type: 'array', items: { type: 'string' }, description: 'Full URLs to inspect, e.g. ["https://example.com/a/", "https://example.com/b/"].' },
        concurrency: { type: 'number', description: `Max parallel requests (default ${DEFAULT_INSPECT_CONCURRENCY}, max ${MAX_INSPECT_CONCURRENCY}).` },
        maxUrls: { type: 'number', description: `Safety cap on how many URLs to inspect (default ${DEFAULT_INSPECT_MAX_URLS}).` },
      },
      required: ['site', 'urls'],
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

function requireSite(a) {
  const site = a.site ?? a.siteUrl;
  if (typeof site !== 'string' || site.trim() === '') {
    throw new ToolError('Missing or invalid required argument "site" (or "siteUrl") (expected a non-empty string).');
  }
  return site;
}

export async function handleToolCall(name, args = {}, gsc = gscApi) {
  const a = args ?? {};
  try {
    if (name === 'gsc_list_sites') return ok(await gsc.listSites());
    if (name === 'gsc_search_analytics') {
      const site = requireSite(a);
      validateAnalytics(a);
      return ok(await runSearchAnalytics(gsc, site, a));
    }
    if (name === 'compare_search_performance') {
      const site = requireSite(a);
      validateCompare(a);
      return ok(await runCompare(gsc, site, a));
    }
    if (name === 'find_seo_opportunities') {
      const site = requireSite(a);
      validateOpportunities(a);
      return ok(await runOpportunities(gsc, site, a));
    }
    if (name === 'gsc_inspect_url') {
      requireString(a, 'site');
      requireString(a, 'url');
      return ok(await gsc.inspectUrl(a.site, a.url));
    }
    if (name === 'gsc_inspect_urls') {
      const site = requireSite(a);
      validateInspectUrls(a);
      return ok(await runInspectUrls(gsc, site, a));
    }
    if (name === 'gsc_list_sitemaps') {
      requireString(a, 'site');
      return ok(await gsc.listSitemaps(a.site));
    }
    return err(`Unknown tool: ${name}`);
  } catch (e) {
    return err(describeError(e));
  }
}
