import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleToolCall } from '../lib/tools.mjs';

function makeGsc(rows) {
  const calls = [];
  return {
    calls,
    listSites: async () => [],
    inspectUrl: async () => ({}),
    listSitemaps: async () => [],
    searchAnalytics: async (site, body) => {
      calls.push(body);
      return { rows };
    },
  };
}

const parse = (res) => JSON.parse(res.content[0].text);

const ROWS = [
  { keys: ['q1'], clicks: 3, impressions: 1200, ctr: 0.0025, position: 14 },
  { keys: ['q5'], clicks: 2, impressions: 300, ctr: 0.005, position: 12 },
  { keys: ['q3'], clicks: 0, impressions: 50, ctr: 0.001, position: 18 },
  { keys: ['q2'], clicks: 50, impressions: 5000, ctr: 0.01, position: 8 },
  { keys: ['q4'], clicks: 120, impressions: 800, ctr: 0.15, position: 3 },
];

test('striking_distance surfaces off-page-1 queries with enough impressions, sorted by impressions', async () => {
  const out = parse(await handleToolCall('find_seo_opportunities', { site: 's' }, makeGsc(ROWS)));
  assert.equal(out.type, 'striking_distance');
  assert.equal(out.dimension, 'query');
  assert.deepEqual(out.opportunities.map((o) => o.query), ['q1', 'q5']);
  assert.equal(out.count, 2);
  assert.deepEqual(out.criteria, { minPosition: 11, maxPosition: 20, minImpressions: 100 });
});

test('low_ctr surfaces page-1 queries with low CTR', async () => {
  const out = parse(await handleToolCall('find_seo_opportunities', { site: 's', type: 'low_ctr' }, makeGsc(ROWS)));
  assert.equal(out.type, 'low_ctr');
  assert.deepEqual(out.opportunities.map((o) => o.query), ['q2']);
  assert.deepEqual(out.criteria, { maxPosition: 10, maxCtr: 0.02, minImpressions: 100 });
});

test('minImpressions raises the noise floor', async () => {
  const out = parse(await handleToolCall('find_seo_opportunities', { site: 's', minImpressions: 400 }, makeGsc(ROWS)));
  assert.deepEqual(out.opportunities.map((o) => o.query), ['q1']);
});

test('limit caps the number of opportunities', async () => {
  const out = parse(await handleToolCall('find_seo_opportunities', { site: 's', limit: 1 }, makeGsc(ROWS)));
  assert.equal(out.opportunities.length, 1);
  assert.equal(out.opportunities[0].query, 'q1');
});

test('dimension page analyzes and labels by page', async () => {
  const gsc = makeGsc([{ keys: ['https://ex/p'], clicks: 1, impressions: 500, ctr: 0.002, position: 15 }]);
  const out = parse(await handleToolCall('find_seo_opportunities', { site: 's', dimension: 'page' }, gsc));
  assert.equal(gsc.calls[0].dimensions[0], 'page');
  assert.equal(out.opportunities[0].page, 'https://ex/p');
});

test('a custom striking-distance position range is honoured', async () => {
  const out = parse(await handleToolCall('find_seo_opportunities', { site: 's', minPosition: 5, maxPosition: 15 }, makeGsc(ROWS)));
  assert.deepEqual(out.opportunities.map((o) => o.query).sort(), ['q1', 'q2', 'q5']);
});

test('rounds ctr and position in the output', async () => {
  const out = parse(await handleToolCall('find_seo_opportunities', { site: 's' }, makeGsc(ROWS)));
  const q1 = out.opportunities.find((o) => o.query === 'q1');
  assert.equal(q1.position, 14);
  assert.equal(q1.impressions, 1200);
});

test('rejects an unknown type', async () => {
  const res = await handleToolCall('find_seo_opportunities', { site: 's', type: 'magic' }, makeGsc(ROWS));
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /type/);
});

test('rejects an out-of-range maxCtr', async () => {
  const res = await handleToolCall('find_seo_opportunities', { site: 's', type: 'low_ctr', maxCtr: 5 }, makeGsc(ROWS));
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /maxCtr/);
});

test('requires a site', async () => {
  const res = await handleToolCall('find_seo_opportunities', {}, makeGsc(ROWS));
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /site/);
});
