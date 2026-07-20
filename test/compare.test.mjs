import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleToolCall } from '../lib/tools.mjs';

function makeGsc(byStart = {}) {
  const calls = [];
  return {
    calls,
    listSites: async () => [],
    inspectUrl: async () => ({}),
    listSitemaps: async () => [],
    searchAnalytics: async (site, body) => {
      calls.push(body);
      const cfg = byStart[body.startDate] ?? {};
      if (!body.dimensions || body.dimensions.length === 0) {
        return { rows: cfg.totals ? [cfg.totals] : [] };
      }
      return { rows: cfg.rows ?? [], responseAggregationType: 'byProperty' };
    },
  };
}

function parse(res) {
  return JSON.parse(res.content[0].text);
}

const CURRENT = { site: 's', startDate: '2026-06-01', endDate: '2026-06-30' };
const withPrev = (extra) => ({ ...CURRENT, previousStartDate: '2026-05-01', previousEndDate: '2026-05-31', ...extra });

test('computes summary deltas and percentages in code', async () => {
  const gsc = makeGsc({
    '2026-06-01': { totals: { clicks: 1840, impressions: 50000, ctr: 0.0368, position: 12.3 } },
    '2026-05-01': { totals: { clicks: 2160, impressions: 52000, ctr: 0.0415, position: 11.8 } },
  });
  const out = parse(await handleToolCall('compare_search_performance', withPrev(), gsc));
  assert.deepEqual(out.summary.clicks, { current: 1840, previous: 2160, change: -320, changePercent: -14.81 });
  assert.deepEqual(out.summary.impressions, { current: 50000, previous: 52000, change: -2000, changePercent: -3.85 });
  assert.equal(out.summary.ctr.changePercent, -11.33);
  assert.deepEqual(out.summary.position, { current: 12.3, previous: 11.8, change: 0.5, changePercent: 4.24 });
});

test('defaults the previous period to the equal-length window before the current one', async () => {
  const gsc = makeGsc({});
  const out = parse(await handleToolCall('compare_search_performance', { site: 's', startDate: '2026-06-10', endDate: '2026-06-16' }, gsc));
  assert.deepEqual(out.current, { startDate: '2026-06-10', endDate: '2026-06-16' });
  assert.deepEqual(out.previous, { startDate: '2026-06-03', endDate: '2026-06-09' });
});

test('totals are fetched with no dimensions and there are exactly two calls without groupBy', async () => {
  const gsc = makeGsc({});
  await handleToolCall('compare_search_performance', withPrev(), gsc);
  assert.equal(gsc.calls.length, 2);
  assert.deepEqual(gsc.calls[0].dimensions, []);
  assert.deepEqual(gsc.calls[1].dimensions, []);
});

test('groupBy produces sorted declines and gains and handles new/dropped keys', async () => {
  const gsc = makeGsc({
    '2026-06-01': {
      totals: { clicks: 760, impressions: 5400, ctr: 0.1, position: 5 },
      rows: [
        { keys: ['https://ex/docs'], clicks: 210, impressions: 2000 },
        { keys: ['https://ex/blog'], clicks: 500, impressions: 3000 },
        { keys: ['https://ex/new'], clicks: 50, impressions: 400 },
      ],
    },
    '2026-05-01': {
      totals: { clicks: 940, impressions: 6200, ctr: 0.12, position: 4 },
      rows: [
        { keys: ['https://ex/docs'], clicks: 390, impressions: 2500 },
        { keys: ['https://ex/blog'], clicks: 450, impressions: 2800 },
        { keys: ['https://ex/gone'], clicks: 100, impressions: 900 },
      ],
    },
  });
  const out = parse(await handleToolCall('compare_search_performance', withPrev({ groupBy: 'page' }), gsc));

  assert.equal(out.groupBy, 'page');
  assert.equal(out.rowCount, 4);

  assert.deepEqual(out.largestDeclines[0], {
    page: 'https://ex/docs',
    currentClicks: 210,
    previousClicks: 390,
    change: -180,
    changePercent: -46.15,
    currentImpressions: 2000,
    previousImpressions: 2500,
  });
  assert.equal(out.largestDeclines[1].page, 'https://ex/gone');
  assert.equal(out.largestDeclines[1].currentClicks, 0);
  assert.equal(out.largestDeclines[1].changePercent, -100);

  assert.equal(out.largestGains[0].page, 'https://ex/blog');
  assert.equal(out.largestGains[0].change, 50);
  assert.equal(out.largestGains[1].page, 'https://ex/new');
  assert.equal(out.largestGains[1].previousClicks, 0);
  assert.equal(out.largestGains[1].changePercent, null);
});

test('limit caps the number of movers returned', async () => {
  const gsc = makeGsc({
    '2026-06-01': {
      rows: [
        { keys: ['a'], clicks: 1 },
        { keys: ['b'], clicks: 1 },
        { keys: ['c'], clicks: 1 },
      ],
    },
    '2026-05-01': {
      rows: [
        { keys: ['a'], clicks: 100 },
        { keys: ['b'], clicks: 100 },
        { keys: ['c'], clicks: 100 },
      ],
    },
  });
  const out = parse(await handleToolCall('compare_search_performance', withPrev({ groupBy: 'query', limit: 2 }), gsc));
  assert.equal(out.largestDeclines.length, 2);
});

test('filters are applied to both periods', async () => {
  const gsc = makeGsc({});
  await handleToolCall('compare_search_performance', withPrev({ filters: [{ dimension: 'country', expression: 'ind' }] }), gsc);
  for (const body of gsc.calls) {
    assert.deepEqual(body.dimensionFilterGroups, [
      { groupType: 'and', filters: [{ dimension: 'country', operator: 'equals', expression: 'ind' }] },
    ]);
  }
});

test('accepts siteUrl as an alias', async () => {
  const gsc = makeGsc({});
  const res = await handleToolCall('compare_search_performance', { siteUrl: 'sc-domain:example.com', startDate: '2026-06-01', endDate: '2026-06-30' }, gsc);
  assert.equal(res.isError, undefined);
  assert.equal(parse(res).siteUrl, 'sc-domain:example.com');
});

test('rejects an unknown groupBy', async () => {
  const res = await handleToolCall('compare_search_performance', { site: 's', groupBy: 'url' }, makeGsc());
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /groupBy/);
});

test('requires both previous dates or neither', async () => {
  const res = await handleToolCall('compare_search_performance', { site: 's', previousStartDate: '2026-05-01' }, makeGsc());
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /previousStartDate|previousEndDate|both/);
});

test('rejects a malformed date', async () => {
  const res = await handleToolCall('compare_search_performance', { site: 's', startDate: 'June' }, makeGsc());
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /YYYY-MM-DD/);
});

test('datePreset sets the current period and the previous period mirrors its length', async () => {
  const gsc = makeGsc({});
  await handleToolCall('compare_search_performance', { site: 's', datePreset: 'last_7_days' }, gsc);
  const span = (b) => Math.round((Date.parse(`${b.endDate}T00:00:00Z`) - Date.parse(`${b.startDate}T00:00:00Z`)) / 864e5) + 1;
  const [current, previous] = gsc.calls;
  assert.equal(span(current), 7);
  assert.equal(span(previous), 7);
  assert.equal(Date.parse(`${previous.endDate}T00:00:00Z`), Date.parse(`${current.startDate}T00:00:00Z`) - 864e5);
});

test('rejects an unknown datePreset', async () => {
  const res = await handleToolCall('compare_search_performance', { site: 's', datePreset: 'nope' }, makeGsc());
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /datePreset/);
});

test('errors without a site', async () => {
  const res = await handleToolCall('compare_search_performance', {}, makeGsc());
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /site/);
});
