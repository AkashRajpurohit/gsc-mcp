#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import * as gscApi from './gsc.mjs';

const VERSION = '0.1.0';

const ago = (d) => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
const ok = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });
const err = (msg) => ({ content: [{ type: 'text', text: `Error: ${sanitize(msg)}` }], isError: true });

const DIMENSIONS = ['date', 'query', 'page', 'country', 'device', 'searchAppearance'];
const SEARCH_TYPES = ['web', 'image', 'video', 'news', 'discover'];

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
      'Google Search Console Search Analytics: clicks, impressions, CTR, average position. Group by any dimensions (date, query, page, country, device, searchAppearance). Use this for "top pages", "top queries", traffic over time, etc.',
    inputSchema: {
      type: 'object',
      properties: {
        site: { type: 'string', description: 'siteUrl from gsc_list_sites, e.g. "sc-domain:example.com"' },
        days: { type: 'number', description: 'Lookback window in days from yesterday (default 28). Ignored if startDate given.' },
        startDate: { type: 'string', description: 'YYYY-MM-DD (overrides days)' },
        endDate: { type: 'string', description: 'YYYY-MM-DD (default yesterday)' },
        dimensions: {
          type: 'array',
          items: { type: 'string' },
          description: 'e.g. ["query"], ["page"], ["date"], ["page","query"], ["country"]. Default ["query"].',
        },
        rowLimit: { type: 'number', description: 'Max rows (default 100, max 25000)' },
        searchType: { type: 'string', description: 'web | image | video | news | discover (default web)' },
        filterPage: { type: 'string', description: 'Optional: only rows for pages containing this substring' },
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
  if (a.rowLimit != null) {
    if (typeof a.rowLimit !== 'number' || !Number.isInteger(a.rowLimit) || a.rowLimit < 1 || a.rowLimit > 25000) {
      throw new ToolError('"rowLimit" must be an integer between 1 and 25000.');
    }
  }
  if (a.searchType != null && !SEARCH_TYPES.includes(a.searchType)) {
    throw new ToolError(`Unknown searchType "${a.searchType}". Allowed: ${SEARCH_TYPES.join(', ')}.`);
  }
  if (a.filterPage != null && typeof a.filterPage !== 'string') {
    throw new ToolError('"filterPage" must be a string.');
  }
}

export function buildAnalyticsBody(a) {
  const body = {
    startDate: a.startDate ?? ago(a.days ?? 28),
    endDate: a.endDate ?? ago(1),
    dimensions: a.dimensions ?? ['query'],
    rowLimit: a.rowLimit ?? 100,
    type: a.searchType ?? 'web',
  };
  if (a.filterPage) {
    body.dimensionFilterGroups = [
      { filters: [{ dimension: 'page', operator: 'contains', expression: a.filterPage }] },
    ];
  }
  return body;
}

export async function handleToolCall(name, args = {}, gsc = gscApi) {
  const a = args ?? {};
  try {
    if (name === 'gsc_list_sites') return ok(await gsc.listSites());
    if (name === 'gsc_search_analytics') {
      requireString(a, 'site');
      validateAnalytics(a);
      return ok(await gsc.searchAnalytics(a.site, buildAnalyticsBody(a)));
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
