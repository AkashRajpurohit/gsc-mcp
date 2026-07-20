const DEFAULT_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_BASE_MS = 500;

const TRANSIENT_STATUS = new Set([429, 500, 502, 503, 504]);
const TRANSIENT_ERRNOS = new Set(['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE']);

export function isTransient(e) {
  if (!e) return false;
  if (e.isTimeout) return true;
  const status = Number(e.code ?? e.status ?? e.response?.status);
  if (TRANSIENT_STATUS.has(status)) return true;
  if (typeof e.code === 'string' && TRANSIENT_ERRNOS.has(e.code)) return true;
  return /socket hang up|network timeout|econnreset|etimedout|eai_again/i.test(e.message ?? '');
}

function toNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function resolveConfig(overrides) {
  return {
    retries: overrides.retries ?? toNumber(process.env.GSC_MAX_RETRIES, DEFAULT_RETRIES),
    timeoutMs: overrides.timeoutMs ?? toNumber(process.env.GSC_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    baseMs: overrides.baseMs ?? toNumber(process.env.GSC_RETRY_BASE_MS, DEFAULT_BASE_MS),
    sleep: overrides.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
    random: overrides.random ?? Math.random,
  };
}

function withTimeout(promise, timeoutMs) {
  if (!timeoutMs) return promise;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const e = new Error(`Request timed out after ${timeoutMs}ms.`);
      e.isTimeout = true;
      reject(e);
    }, timeoutMs);
    if (timer.unref) timer.unref();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export async function withRetry(fn, overrides = {}) {
  const { retries, timeoutMs, baseMs, sleep, random } = resolveConfig(overrides);
  let attempt = 0;
  for (;;) {
    try {
      return await withTimeout(Promise.resolve().then(fn), timeoutMs);
    } catch (e) {
      if (attempt >= retries || !isTransient(e)) throw e;
      const backoff = baseMs * 2 ** attempt + Math.floor(random() * baseMs);
      attempt += 1;
      await sleep(backoff);
    }
  }
}
