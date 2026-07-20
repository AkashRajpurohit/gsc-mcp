import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TOOLS,
  handleToolCall,
  buildAnalyticsBody,
  sanitize,
} from '../mcp.mjs';

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

test('TOOLS exposes exactly the four read-only tools', () => {
  assert.deepEqual(TOOLS.map((t) => t.name).sort(), [
    'gsc_inspect_url',
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
  assert.equal(body.rowLimit, 100);
  assert.equal(body.type, 'web');
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
    rowLimit: 5000,
    type: 'image',
    dimensionFilterGroups: [
      {
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

test('rowLimit out of range is rejected', async () => {
  const res = await handleToolCall(
    'gsc_search_analytics',
    { site: 'sc-domain:example.com', rowLimit: 999999 },
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
