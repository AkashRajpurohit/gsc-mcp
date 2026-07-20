import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  __setClientFactory,
  listSites,
  searchAnalytics,
  inspectUrl,
  listSitemaps,
} from '../gsc.mjs';

function fakeClient(data) {
  const calls = {};
  const client = {
    sites: {
      list: async (args) => (
        (calls.sites = args ?? {}), { data: data.sites ?? {} }
      ),
    },
    searchanalytics: {
      query: async (args) => (
        (calls.searchanalytics = args), { data: data.searchanalytics ?? {} }
      ),
    },
    urlInspection: {
      index: {
        inspect: async (args) => (
          (calls.inspect = args), { data: data.inspect ?? {} }
        ),
      },
    },
    sitemaps: {
      list: async (args) => (
        (calls.sitemaps = args), { data: data.sitemaps ?? {} }
      ),
    },
  };
  return { client, calls };
}

function useFake(data) {
  const { client, calls } = fakeClient(data);
  __setClientFactory(async () => client);
  return calls;
}

afterEach(() => {
  __setClientFactory(async () => {
    throw new Error('no client factory set for this test');
  });
});

test('listSites returns the siteEntry array', async () => {
  useFake({
    sites: {
      siteEntry: [
        { siteUrl: 'sc-domain:example.com', permissionLevel: 'siteOwner' },
      ],
    },
  });
  const sites = await listSites();
  assert.deepEqual(sites, [
    { siteUrl: 'sc-domain:example.com', permissionLevel: 'siteOwner' },
  ]);
});

test('listSites returns [] when the API omits siteEntry', async () => {
  useFake({ sites: {} });
  assert.deepEqual(await listSites(), []);
});

test('searchAnalytics passes siteUrl and requestBody through and returns data', async () => {
  const calls = useFake({
    searchanalytics: { rows: [{ keys: ['seo'], clicks: 5 }] },
  });
  const body = {
    startDate: '2026-06-01',
    endDate: '2026-06-30',
    dimensions: ['query'],
    rowLimit: 10,
    type: 'web',
  };
  const data = await searchAnalytics('sc-domain:example.com', body);
  assert.deepEqual(calls.searchanalytics, {
    siteUrl: 'sc-domain:example.com',
    requestBody: body,
  });
  assert.deepEqual(data.rows, [{ keys: ['seo'], clicks: 5 }]);
});

test('inspectUrl sends the correct inspection request body', async () => {
  const calls = useFake({
    inspect: { inspectionResult: { indexStatusResult: { verdict: 'PASS' } } },
  });
  const data = await inspectUrl(
    'sc-domain:example.com',
    'https://example.com/post/',
  );
  assert.deepEqual(calls.inspect, {
    requestBody: {
      siteUrl: 'sc-domain:example.com',
      inspectionUrl: 'https://example.com/post/',
    },
  });
  assert.equal(data.inspectionResult.indexStatusResult.verdict, 'PASS');
});

test('listSitemaps returns the sitemap array, or [] when absent', async () => {
  const calls = useFake({
    sitemaps: { sitemap: [{ path: 'https://example.com/sitemap.xml' }] },
  });
  assert.deepEqual(await listSitemaps('sc-domain:example.com'), [
    { path: 'https://example.com/sitemap.xml' },
  ]);
  assert.deepEqual(calls.sitemaps, { siteUrl: 'sc-domain:example.com' });

  useFake({ sitemaps: {} });
  assert.deepEqual(await listSitemaps('sc-domain:example.com'), []);
});

test('wrapper errors propagate to the caller', async () => {
  __setClientFactory(async () => {
    throw new Error('boom');
  });
  await assert.rejects(() => listSites(), /boom/);
});
