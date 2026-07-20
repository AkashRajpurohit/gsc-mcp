import { DEFAULT_COMPARE_ROW_LIMIT, DEFAULT_TOP_N } from './util/constants.mjs';
import { DAY_MS, parseDate, formatDate, inclusiveDays, resolvePeriod, round, changePercent } from './util/dates.mjs';
import { buildAnalyticsBody, pageRows } from './analytics.mjs';

function metric(current, previous, digits) {
  const cur = digits == null ? current : round(current, digits);
  const prev = digits == null ? previous : round(previous, digits);
  const change = digits == null ? cur - prev : round(cur - prev, digits);
  return { current: cur, previous: prev, change, changePercent: changePercent(current, previous) };
}

async function fetchTotals(gsc, site, periodArgs) {
  const body = buildAnalyticsBody({ ...periodArgs, dimensions: [] }, { startRow: 0, rowLimit: 1 });
  const data = await gsc.searchAnalytics(site, body);
  const r = data?.rows?.[0] ?? {};
  return { clicks: r.clicks ?? 0, impressions: r.impressions ?? 0, ctr: r.ctr ?? 0, position: r.position ?? 0 };
}

export async function runCompare(gsc, site, a) {
  const warnings = [];
  const { startDate: curStart, endDate: curEnd } = resolvePeriod(a);

  let prevStart;
  let prevEnd;
  if (a.previousStartDate && a.previousEndDate) {
    prevStart = a.previousStartDate;
    prevEnd = a.previousEndDate;
  } else {
    const length = inclusiveDays(curStart, curEnd);
    const pe = parseDate(curStart) - DAY_MS;
    prevStart = formatDate(pe - (length - 1) * DAY_MS);
    prevEnd = formatDate(pe);
  }

  const shared = { searchType: a.searchType, dataState: a.dataState, filters: a.filters, filterPage: a.filterPage };
  const currentArgs = { ...shared, startDate: curStart, endDate: curEnd };
  const previousArgs = { ...shared, startDate: prevStart, endDate: prevEnd };

  const [curTotals, prevTotals] = [await fetchTotals(gsc, site, currentArgs), await fetchTotals(gsc, site, previousArgs)];

  const summary = {
    clicks: metric(curTotals.clicks, prevTotals.clicks, null),
    impressions: metric(curTotals.impressions, prevTotals.impressions, null),
    ctr: metric(curTotals.ctr, prevTotals.ctr, 4),
    position: metric(curTotals.position, prevTotals.position, 2),
  };

  const result = {
    siteUrl: site,
    current: { startDate: curStart, endDate: curEnd },
    previous: { startDate: prevStart, endDate: prevEnd },
    searchType: a.searchType ?? 'web',
    summary,
    warnings,
  };

  if (a.groupBy) {
    const target = a.rowLimit ?? DEFAULT_COMPARE_ROW_LIMIT;
    const limit = a.limit ?? DEFAULT_TOP_N;
    const build = (periodArgs) => (startRow, rowLimit) =>
      buildAnalyticsBody({ ...periodArgs, dimensions: [a.groupBy] }, { startRow, rowLimit });
    const cur = await pageRows(gsc, site, build(currentArgs), target);
    const prev = await pageRows(gsc, site, build(previousArgs), target);

    const curMap = new Map(cur.rows.map((r) => [r.keys[0], r]));
    const prevMap = new Map(prev.rows.map((r) => [r.keys[0], r]));
    const keys = new Set([...curMap.keys(), ...prevMap.keys()]);

    const rows = [];
    for (const key of keys) {
      const c = curMap.get(key);
      const p = prevMap.get(key);
      const currentClicks = c?.clicks ?? 0;
      const previousClicks = p?.clicks ?? 0;
      rows.push({
        [a.groupBy]: key,
        currentClicks,
        previousClicks,
        change: currentClicks - previousClicks,
        changePercent: changePercent(currentClicks, previousClicks),
        currentImpressions: c?.impressions ?? 0,
        previousImpressions: p?.impressions ?? 0,
      });
    }

    const byKey = (x, y) => String(x[a.groupBy]).localeCompare(String(y[a.groupBy]));
    result.groupBy = a.groupBy;
    result.rowCount = keys.size;
    result.largestDeclines = rows.filter((r) => r.change < 0).sort((x, y) => x.change - y.change || byKey(x, y)).slice(0, limit);
    result.largestGains = rows.filter((r) => r.change > 0).sort((x, y) => y.change - x.change || byKey(x, y)).slice(0, limit);

    if (cur.hasMore || prev.hasMore) {
      warnings.push(`Only the first ${target} rows per period were compared; increase rowLimit for fuller coverage.`);
    }
  }

  return result;
}
