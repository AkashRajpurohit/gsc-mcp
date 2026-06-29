#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { inspectUrl, listSitemaps, listSites, searchAnalytics } from './gsc.mjs';

const ago = (d) => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
const ok = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });

const TOOLS = [
  {
    name: 'gsc_list_sites',
    description:
      'List all Google Search Console properties this credential can read (datahyena, catchintent, eternalvault, memorycrow, etc.). Returns the exact siteUrl to pass to other tools (domain properties look like "sc-domain:datahyena.com").',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'gsc_search_analytics',
    description:
      'Google Search Console Search Analytics: clicks, impressions, CTR, average position. Group by any dimensions (date, query, page, country, device, searchAppearance). Use this for "top pages", "top queries", traffic over time, etc.',
    inputSchema: {
      type: 'object',
      properties: {
        site: { type: 'string', description: 'siteUrl from gsc_list_sites, e.g. "sc-domain:datahyena.com"' },
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
        site: { type: 'string', description: 'siteUrl, e.g. "sc-domain:datahyena.com"' },
        url: { type: 'string', description: 'Full URL to inspect, e.g. https://datahyena.com/funding-rounds/by-month/april-2026/' },
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

const server = new Server({ name: 'gsc', version: '0.1.0' }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: a = {} } = req.params;
  try {
    if (name === 'gsc_list_sites') return ok(await listSites());
    if (name === 'gsc_search_analytics') {
      const body = {
        startDate: a.startDate ?? ago(a.days ?? 28),
        endDate: a.endDate ?? ago(1),
        dimensions: a.dimensions ?? ['query'],
        rowLimit: a.rowLimit ?? 100,
        type: a.searchType ?? 'web',
      };
      if (a.filterPage)
        body.dimensionFilterGroups = [
          { filters: [{ dimension: 'page', operator: 'contains', expression: a.filterPage }] },
        ];
      return ok(await searchAnalytics(a.site, body));
    }
    if (name === 'gsc_inspect_url') return ok(await inspectUrl(a.site, a.url));
    if (name === 'gsc_list_sitemaps') return ok(await listSitemaps(a.site));
    return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
  } catch (e) {
    return { content: [{ type: 'text', text: `Error: ${e?.message || e}` }], isError: true };
  }
});

await server.connect(new StdioServerTransport());
