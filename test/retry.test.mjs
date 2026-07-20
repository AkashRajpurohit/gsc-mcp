import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withRetry, isTransient } from '../lib/util/retry.mjs';

const noop = async () => {};

test('isTransient recognizes retryable failures', () => {
  assert.equal(isTransient({ code: 429 }), true);
  assert.equal(isTransient({ code: 503 }), true);
  assert.equal(isTransient({ response: { status: 502 } }), true);
  assert.equal(isTransient({ code: 'ECONNRESET' }), true);
  assert.equal(isTransient({ isTimeout: true }), true);
  assert.equal(isTransient({ message: 'socket hang up' }), true);
});

test('isTransient rejects permanent failures', () => {
  assert.equal(isTransient({ code: 403 }), false);
  assert.equal(isTransient({ code: 404 }), false);
  assert.equal(isTransient({ code: 400 }), false);
  assert.equal(isTransient({ message: 'boom' }), false);
  assert.equal(isTransient(null), false);
});

test('withRetry returns the value on first success', async () => {
  let calls = 0;
  const value = await withRetry(async () => { calls += 1; return 'ok'; }, { sleep: noop });
  assert.equal(value, 'ok');
  assert.equal(calls, 1);
});

test('withRetry retries a transient failure then succeeds', async () => {
  let calls = 0;
  const value = await withRetry(
    async () => {
      calls += 1;
      if (calls < 3) throw Object.assign(new Error('rate limited'), { code: 429 });
      return 'ok';
    },
    { sleep: noop, timeoutMs: 0 },
  );
  assert.equal(value, 'ok');
  assert.equal(calls, 3);
});

test('withRetry does not retry a permanent failure', async () => {
  let calls = 0;
  await assert.rejects(
    () => withRetry(async () => { calls += 1; throw Object.assign(new Error('forbidden'), { code: 403 }); }, { sleep: noop, timeoutMs: 0 }),
    /forbidden/,
  );
  assert.equal(calls, 1);
});

test('withRetry gives up after the configured retries', async () => {
  let calls = 0;
  await assert.rejects(
    () => withRetry(async () => { calls += 1; throw Object.assign(new Error('unavailable'), { code: 503 }); }, { retries: 2, sleep: noop, timeoutMs: 0 }),
    /unavailable/,
  );
  assert.equal(calls, 3);
});

test('withRetry uses exponential backoff with jitter', async () => {
  const delays = [];
  let calls = 0;
  await assert.rejects(
    () => withRetry(
      async () => { calls += 1; throw Object.assign(new Error('x'), { code: 503 }); },
      { retries: 3, baseMs: 100, random: () => 0.5, sleep: async (ms) => { delays.push(ms); }, timeoutMs: 0 },
    ),
  );
  assert.deepEqual(delays, [150, 250, 450]);
});

test('withRetry times out a hanging call', async () => {
  await assert.rejects(
    () => withRetry(() => new Promise(() => {}), { timeoutMs: 20, retries: 0, sleep: noop }),
    (e) => { assert.equal(e.isTimeout, true); assert.match(e.message, /timed out/); return true; },
  );
});
