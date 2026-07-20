import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS, handleToolCall } from '../lib/tools.mjs';
import { buildAnalyticsBody } from '../lib/analytics.mjs';
import { sanitize, describeError } from '../lib/util/errors.mjs';

function fakeGsc(overrides = {}) {
  const calls = [];
  const rec =
    (name, fn) =>
    async (...args) => {
      calls.push({ name, args });
      return fn(...args);
    };
  return {
    calls,
    listSites: rec(
      'listSites',
      overrides.listSites ??
        (async () => [{ siteUrl: 'sc-domain:example.com' }]),
    ),
    searchAnalytics: rec(
      'searchAnalytics',
      overrides.searchAnalytics ?? (async () => ({ rows: [] })),
    ),
    inspectUrl: rec(
      'inspectUrl',
      overrides.inspectUrl ?? (async () => ({ inspectionResult: {} })),
    ),
    listSitemaps: rec(
      'listSitemaps',
      overrides.listSitemaps ?? (async () => []),
    ),
  };
}

function parse(res) {
  return JSON.parse(res.content[0].text);
}

function pagedGsc(total) {
  const calls = [];
  return {
    calls,
    listSites: async () => [],
    inspectUrl: async () => ({}),
    listSitemaps: async () => [],
    searchAnalytics: async (site, body) => {
      calls.push(body);
      const remaining = Math.max(0, total - body.startRow);
      const n = Math.min(body.rowLimit, remaining);
      const rows = Array.from({ length: n }, (_, i) => ({ keys: [`k${body.startRow + i}`], clicks: 1 }));
      return { rows, responseAggregationType: 'byProperty' };
    },
  };
}

test('TOOLS exposes exactly the read-only tools', () => {
  assert.deepEqual(TOOLS.map((t) => t.name).sort(), [
    'compare_search_performance',
    'find_seo_opportunities',
    'gsc_inspect_url',
    'gsc_inspect_urls',
    'gsc_list_sitemaps',
    'gsc_list_sites',
    'gsc_search_analytics',
  ]);
});

test('gsc_list_sites returns the site list', async () => {
  const gsc = fakeGsc();
  const res = await handleToolCall('gsc_list_sites', {}, gsc);
  assert.equal(res.isError, undefined);
  assert.deepEqual(parse(res), [{ siteUrl: 'sc-domain:example.com' }]);
});

test('gsc_search_analytics builds a default request body', async () => {
  const gsc = fakeGsc();
  await handleToolCall(
    'gsc_search_analytics',
    { site: 'sc-domain:example.com' },
    gsc,
  );
  const call = gsc.calls.find((c) => c.name === 'searchAnalytics');
  assert.equal(call.args[0], 'sc-domain:example.com');
  const body = call.args[1];
  assert.deepEqual(body.dimensions, ['query']);
  assert.equal(body.rowLimit, 1000);
  assert.equal(body.type, 'web');
  assert.equal(body.dataState, 'final');
  assert.equal(body.aggregationType, 'auto');
  assert.equal(body.startRow, 0);
  assert.match(body.startDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(body.endDate, /^\d{4}-\d{2}-\d{2}$/);
});

test('gsc_search_analytics honours explicit dates, dimensions and filterPage', async () => {
  const body = buildAnalyticsBody({
    site: 'sc-domain:example.com',
    startDate: '2026-06-01',
    endDate: '2026-06-30',
    dimensions: ['query', 'page'],
    rowLimit: 5000,
    searchType: 'image',
    filterPage: '/blog/',
  });
  assert.deepEqual(body, {
    startDate: '2026-06-01',
    endDate: '2026-06-30',
    dimensions: ['query', 'page'],
    type: 'image',
    dataState: 'final',
    aggregationType: 'auto',
    rowLimit: 5000,
    startRow: 0,
    dimensionFilterGroups: [
      {
        groupType: 'and',
        filters: [
          { dimension: 'page', operator: 'contains', expression: '/blog/' },
        ],
      },
    ],
  });
});

test('gsc_inspect_url forwards site and url', async () => {
  const gsc = fakeGsc();
  await handleToolCall(
    'gsc_inspect_url',
    { site: 'sc-domain:example.com', url: 'https://example.com/post/' },
    gsc,
  );
  const call = gsc.calls.find((c) => c.name === 'inspectUrl');
  assert.deepEqual(call.args, [
    'sc-domain:example.com',
    'https://example.com/post/',
  ]);
});

test('gsc_list_sitemaps forwards the site', async () => {
  const gsc = fakeGsc();
  await handleToolCall(
    'gsc_list_sitemaps',
    { site: 'sc-domain:example.com' },
    gsc,
  );
  assert.deepEqual(gsc.calls.find((c) => c.name === 'listSitemaps').args, [
    'sc-domain:example.com',
  ]);
});

test('missing required site is a useful error, not a crash', async () => {
  const res = await handleToolCall('gsc_search_analytics', {}, fakeGsc());
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /required argument "site"/);
});

test('gsc_inspect_url requires url', async () => {
  const res = await handleToolCall(
    'gsc_inspect_url',
    { site: 'sc-domain:example.com' },
    fakeGsc(),
  );
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /required argument "url"/);
});

test('invalid dimension is rejected before calling Google', async () => {
  const gsc = fakeGsc();
  const res = await handleToolCall(
    'gsc_search_analytics',
    { site: 'sc-domain:example.com', dimensions: ['nonsense'] },
    gsc,
  );
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /Unknown dimension/);
  assert.equal(gsc.calls.length, 0);
});

test('a non-integer rowLimit is rejected', async () => {
  const res = await handleToolCall(
    'gsc_search_analytics',
    { site: 'sc-domain:example.com', rowLimit: 1.5 },
    fakeGsc(),
  );
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /rowLimit/);
});

test('malformed date is rejected', async () => {
  const res = await handleToolCall(
    'gsc_search_analytics',
    { site: 'sc-domain:example.com', startDate: 'June 1st' },
    fakeGsc(),
  );
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /YYYY-MM-DD/);
});

test('unknown searchType is rejected', async () => {
  const res = await handleToolCall(
    'gsc_search_analytics',
    { site: 'sc-domain:example.com', searchType: 'audio' },
    fakeGsc(),
  );
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /searchType/);
});

test('accepts siteUrl as an alias for site', async () => {
  const gsc = fakeGsc();
  const res = await handleToolCall(
    'gsc_search_analytics',
    { siteUrl: 'sc-domain:example.com' },
    gsc,
  );
  assert.equal(res.isError, undefined);
  assert.equal(
    gsc.calls.find((c) => c.name === 'searchAnalytics').args[0],
    'sc-domain:example.com',
  );
});

test('maps filters into a single AND group with a default operator', async () => {
  const gsc = fakeGsc();
  await handleToolCall(
    'gsc_search_analytics',
    {
      site: 'sc-domain:example.com',
      filters: [
        { dimension: 'country', expression: 'ind' },
        { dimension: 'device', operator: 'notEquals', expression: 'DESKTOP' },
      ],
    },
    gsc,
  );
  const body = gsc.calls.find((c) => c.name === 'searchAnalytics').args[1];
  assert.deepEqual(body.dimensionFilterGroups, [
    {
      groupType: 'and',
      filters: [
        { dimension: 'country', operator: 'equals', expression: 'ind' },
        { dimension: 'device', operator: 'notEquals', expression: 'DESKTOP' },
      ],
    },
  ]);
});

test('filterPage still works and combines with filters', async () => {
  const gsc = fakeGsc();
  await handleToolCall(
    'gsc_search_analytics',
    {
      site: 'sc-domain:example.com',
      filters: [{ dimension: 'country', expression: 'ind' }],
      filterPage: '/blog/',
    },
    gsc,
  );
  const body = gsc.calls.find((c) => c.name === 'searchAnalytics').args[1];
  assert.deepEqual(body.dimensionFilterGroups[0].filters, [
    { dimension: 'country', operator: 'equals', expression: 'ind' },
    { dimension: 'page', operator: 'contains', expression: '/blog/' },
  ]);
});

test('rejects a filter with an unknown operator', async () => {
  const res = await handleToolCall(
    'gsc_search_analytics',
    { site: 'sc-domain:example.com', filters: [{ dimension: 'query', operator: 'wat', expression: 'x' }] },
    fakeGsc(),
  );
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /operator/);
});

test('rejects a filter missing its expression', async () => {
  const res = await handleToolCall(
    'gsc_search_analytics',
    { site: 'sc-domain:example.com', filters: [{ dimension: 'query' }] },
    fakeGsc(),
  );
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /expression/);
});

test('passes dataState and aggregationType through to the request', async () => {
  const gsc = fakeGsc();
  await handleToolCall(
    'gsc_search_analytics',
    { site: 'sc-domain:example.com', dataState: 'all', aggregationType: 'byPage' },
    gsc,
  );
  const body = gsc.calls.find((c) => c.name === 'searchAnalytics').args[1];
  assert.equal(body.dataState, 'all');
  assert.equal(body.aggregationType, 'byPage');
});

test('rejects an unknown dataState', async () => {
  const res = await handleToolCall(
    'gsc_search_analytics',
    { site: 'sc-domain:example.com', dataState: 'draft' },
    fakeGsc(),
  );
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /dataState/);
});

const yesterday = () => new Date(Date.now() - 864e5).toISOString().slice(0, 10);
const spanDays = (b) => Math.round((Date.parse(`${b.endDate}T00:00:00Z`) - Date.parse(`${b.startDate}T00:00:00Z`)) / 864e5) + 1;

test('datePreset resolves to a rolling window ending yesterday', () => {
  const week = buildAnalyticsBody({ datePreset: 'last_7_days' });
  assert.equal(week.endDate, yesterday());
  assert.equal(spanDays(week), 7);
  assert.equal(spanDays(buildAnalyticsBody({ datePreset: 'last_3_months' })), 90);
  assert.equal(spanDays(buildAnalyticsBody({ datePreset: 'last_16_months' })), 480);
});

test('an explicit startDate overrides datePreset', () => {
  const body = buildAnalyticsBody({ datePreset: 'last_7_days', startDate: '2026-01-01', endDate: '2026-01-31' });
  assert.equal(body.startDate, '2026-01-01');
  assert.equal(body.endDate, '2026-01-31');
});

test('datePreset takes precedence over days', () => {
  assert.equal(spanDays(buildAnalyticsBody({ datePreset: 'last_7_days', days: 28 })), 7);
});

test('an unknown datePreset is rejected', async () => {
  const res = await handleToolCall('gsc_search_analytics', { site: 's', datePreset: 'last_year' }, fakeGsc());
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /datePreset/);
});

test('wraps rows with request metadata', async () => {
  const gsc = pagedGsc(3);
  const res = await handleToolCall(
    'gsc_search_analytics',
    { site: 'sc-domain:example.com', startDate: '2026-06-01', endDate: '2026-06-30', dimensions: ['query', 'page'] },
    gsc,
  );
  const out = parse(res);
  assert.equal(out.siteUrl, 'sc-domain:example.com');
  assert.deepEqual(out.period, { startDate: '2026-06-01', endDate: '2026-06-30' });
  assert.deepEqual(out.dimensions, ['query', 'page']);
  assert.equal(out.rowCount, 3);
  assert.equal(out.rows.length, 3);
  assert.equal(out.hasMore, false);
  assert.equal(out.aggregationType, 'byProperty');
  assert.deepEqual(out.warnings, []);
});

test('stops paging when the API returns a short page', async () => {
  const gsc = pagedGsc(100);
  const out = parse(await handleToolCall('gsc_search_analytics', { site: 's', rowLimit: 25000 }, gsc));
  assert.equal(out.rowCount, 100);
  assert.equal(out.hasMore, false);
  assert.equal(gsc.calls.length, 1);
});

test('auto-paginates across API page boundaries then stops at end of data', async () => {
  const gsc = pagedGsc(26000);
  const out = parse(await handleToolCall('gsc_search_analytics', { site: 's', rowLimit: 40000, maxRows: 40000 }, gsc));
  assert.equal(out.rowCount, 26000);
  assert.equal(out.hasMore, false);
  assert.equal(gsc.calls.length, 2);
  assert.equal(gsc.calls[0].startRow, 0);
  assert.equal(gsc.calls[0].rowLimit, 25000);
  assert.equal(gsc.calls[1].startRow, 25000);
});

test('clamps rowLimit to maxRows and warns', async () => {
  const gsc = pagedGsc(1000);
  const out = parse(await handleToolCall('gsc_search_analytics', { site: 's', rowLimit: 50000, maxRows: 100 }, gsc));
  assert.equal(out.rowCount, 100);
  assert.equal(gsc.calls[0].rowLimit, 100);
  assert.ok(out.warnings.some((w) => /maxRows/.test(w)));
});

test('honours startRow for manual pagination', async () => {
  const gsc = pagedGsc(500);
  const out = parse(await handleToolCall('gsc_search_analytics', { site: 's', rowLimit: 50, startRow: 200 }, gsc));
  assert.equal(out.startRow, 200);
  assert.equal(gsc.calls[0].startRow, 200);
  assert.equal(out.rowCount, 50);
});

test('unknown tool name returns an error result', async () => {
  const res = await handleToolCall('gsc_delete_everything', {}, fakeGsc());
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /Unknown tool/);
});

const failures = [
  {
    label: 'permission (403)',
    message:
      "User does not have sufficient permission for site 'sc-domain:example.com'.",
  },
  {
    label: 'quota (429)',
    message: 'Quota exceeded for quota metric requests.',
  },
  {
    label: 'invalid property',
    message: "Requested entity was not found: 'sc-domain:not-a-site.com'.",
  },
  {
    label: 'unavailable URL',
    message: 'The requested URL was not found on this site.',
  },
];

for (const f of failures) {
  test(`Google ${f.label} failure surfaces the message`, async () => {
    const gsc = fakeGsc({
      searchAnalytics: async () => {
        throw new Error(f.message);
      },
    });
    const res = await handleToolCall(
      'gsc_search_analytics',
      { site: 'sc-domain:example.com' },
      gsc,
    );
    assert.equal(res.isError, true);
    assert.ok(res.content[0].text.includes(f.message.split(':')[0]));
  });
}

test('a leaked credential in an error is redacted', async () => {
  const leaky =
    'auth failed with private_key: -----BEGIN PRIVATE KEY-----\nSECRETMATERIAL\n-----END PRIVATE KEY-----';
  const gsc = fakeGsc({
    listSites: async () => {
      throw new Error(leaky);
    },
  });
  const res = await handleToolCall('gsc_list_sites', {}, gsc);
  assert.equal(res.isError, true);
  assert.doesNotMatch(res.content[0].text, /SECRETMATERIAL/);
  assert.doesNotMatch(res.content[0].text, /BEGIN PRIVATE KEY/);
  assert.match(res.content[0].text, /REDACTED/);
});

test('describeError adds a quota hint and keeps the original message', () => {
  const out = describeError({ code: 429, message: 'Quota exceeded for quota metric requests.' });
  assert.match(out, /quota or rate limit/i);
  assert.match(out, /original: Quota exceeded/);
});

test('describeError adds a permission hint', () => {
  assert.match(describeError({ code: 403, message: 'User does not have sufficient permission for site.' }), /Users and permissions/);
});

test('describeError reports a disabled API even when the status is 403', () => {
  const out = describeError({ code: 403, message: 'Search Console API has not been used in project 123 or it is disabled.' });
  assert.match(out, /gcloud services enable searchconsole/);
});

test('describeError adds an auth hint', () => {
  assert.match(describeError({ message: 'invalid_grant: Invalid JWT Signature.' }), /doctor/);
});

test('describeError adds a not-found hint for a missing property', () => {
  assert.match(describeError({ message: 'Requested entity was not found.' }), /gsc_list_sites/);
});

test('describeError adds a network hint', () => {
  assert.match(describeError({ code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND www.googleapis.com' }), /network/i);
});

test('describeError does not mistake a missing key file for a missing property', () => {
  const out = describeError({ message: 'Service-account key not found at /x/key.json. Set GSC_KEY_PATH or create the key (see README).' });
  assert.doesNotMatch(out, /gsc_list_sites/);
  assert.match(out, /Service-account key not found/);
});

test('describeError passes an unrecognized error through unchanged', () => {
  assert.equal(describeError({ message: 'weird thing happened' }), 'weird thing happened');
});

test('sanitize strips PEM blocks and secret fields', () => {
  assert.match(
    sanitize('x -----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY----- y'),
    /\[REDACTED\]/,
  );
  assert.match(
    sanitize('access_token: ya29.abcdef'),
    /access_token: \[REDACTED\]/,
  );
  assert.equal(sanitize('a normal error message'), 'a normal error message');
});
