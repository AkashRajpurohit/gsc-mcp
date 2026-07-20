import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleToolCall } from '../lib/tools.mjs';

function inspectResult(verdict) {
  return { inspectionResult: { indexStatusResult: { verdict, coverageState: 'Submitted and indexed', indexingState: 'INDEXING_ALLOWED', googleCanonical: 'g' } } };
}

const parse = (res) => JSON.parse(res.content[0].text);

test('inspects each URL and returns a compact status, in input order', async () => {
  const gsc = { inspectUrl: async (site, url) => inspectResult(url.includes('bad') ? 'FAIL' : 'PASS') };
  const out = parse(await handleToolCall('gsc_inspect_urls', { site: 's', urls: ['https://x/a', 'https://x/bad', 'https://x/c'] }, gsc));
  assert.equal(out.count, 3);
  assert.deepEqual(out.results.map((r) => r.url), ['https://x/a', 'https://x/bad', 'https://x/c']);
  assert.deepEqual(out.results.map((r) => r.verdict), ['PASS', 'FAIL', 'PASS']);
  assert.equal(out.results[0].coverageState, 'Submitted and indexed');
});

test('an individual URL failure is captured and does not fail the batch', async () => {
  const gsc = {
    inspectUrl: async (site, url) => {
      if (url.includes('boom')) throw new Error('not found on this property');
      return inspectResult('PASS');
    },
  };
  const out = parse(await handleToolCall('gsc_inspect_urls', { site: 's', urls: ['https://x/ok', 'https://x/boom'] }, gsc));
  assert.equal(out.results[0].verdict, 'PASS');
  assert.match(out.results[1].error, /not found/);
  assert.equal(out.results[1].verdict, undefined);
});

test('maxUrls caps the batch and warns', async () => {
  const gsc = { inspectUrl: async () => inspectResult('PASS') };
  const out = parse(await handleToolCall('gsc_inspect_urls', { site: 's', urls: ['a', 'b', 'c'], maxUrls: 2 }, gsc));
  assert.equal(out.count, 2);
  assert.ok(out.warnings.some((w) => /maxUrls/.test(w)));
});

test('respects the concurrency limit', async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  const gsc = {
    inspectUrl: async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return inspectResult('PASS');
    },
  };
  await handleToolCall('gsc_inspect_urls', { site: 's', urls: ['a', 'b', 'c', 'd', 'e'], concurrency: 2 }, gsc);
  assert.ok(maxInFlight <= 2, `max in flight was ${maxInFlight}`);
});

test('requires a non-empty urls array', async () => {
  const gsc = { inspectUrl: async () => inspectResult('PASS') };
  const res = await handleToolCall('gsc_inspect_urls', { site: 's', urls: [] }, gsc);
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /urls/);
});

test('rejects an out-of-range concurrency', async () => {
  const gsc = { inspectUrl: async () => inspectResult('PASS') };
  const res = await handleToolCall('gsc_inspect_urls', { site: 's', urls: ['a'], concurrency: 99 }, gsc);
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /concurrency/);
});

test('requires a site', async () => {
  const res = await handleToolCall('gsc_inspect_urls', { urls: ['a'] }, { inspectUrl: async () => ({}) });
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /site/);
});
