import { DEFAULT_INSPECT_CONCURRENCY, DEFAULT_INSPECT_MAX_URLS } from './util/constants.mjs';
import { sanitize } from './util/errors.mjs';

function summarize(data) {
  const r = data?.inspectionResult?.indexStatusResult ?? {};
  return {
    verdict: r.verdict,
    coverageState: r.coverageState,
    indexingState: r.indexingState,
    robotsTxtState: r.robotsTxtState,
    lastCrawlTime: r.lastCrawlTime,
    googleCanonical: r.googleCanonical,
  };
}

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next;
      next += 1;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function runInspectUrls(gsc, site, a) {
  const warnings = [];
  const maxUrls = a.maxUrls ?? DEFAULT_INSPECT_MAX_URLS;
  const concurrency = a.concurrency ?? DEFAULT_INSPECT_CONCURRENCY;

  let urls = a.urls;
  if (urls.length > maxUrls) {
    warnings.push(`Received ${urls.length} URLs; inspecting the first ${maxUrls}. Raise maxUrls to inspect more.`);
    urls = urls.slice(0, maxUrls);
  }

  const results = await mapWithConcurrency(urls, concurrency, async (url) => {
    try {
      return { url, ...summarize(await gsc.inspectUrl(site, url)) };
    } catch (e) {
      return { url, error: sanitize(e?.message ?? String(e)) };
    }
  });

  return { siteUrl: site, count: results.length, results, warnings };
}
