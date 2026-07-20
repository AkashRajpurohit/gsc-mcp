import { API_MAX_ROWS_PER_REQUEST, DEFAULT_ROW_LIMIT, DEFAULT_MAX_ROWS } from './util/constants.mjs';
import { resolvePeriod } from './util/dates.mjs';

function buildFilters(a) {
  const filters = [];
  if (Array.isArray(a.filters)) {
    for (const f of a.filters) {
      filters.push({ dimension: f.dimension, operator: f.operator ?? 'equals', expression: f.expression });
    }
  }
  if (a.filterPage) {
    filters.push({ dimension: 'page', operator: 'contains', expression: a.filterPage });
  }
  return filters;
}

export function buildAnalyticsBody(a, page = {}) {
  const period = resolvePeriod(a);
  const body = {
    startDate: period.startDate,
    endDate: period.endDate,
    dimensions: a.dimensions ?? ['query'],
    type: a.searchType ?? 'web',
    dataState: a.dataState ?? 'final',
    aggregationType: a.aggregationType ?? 'auto',
    rowLimit: page.rowLimit ?? Math.min(a.rowLimit ?? DEFAULT_ROW_LIMIT, API_MAX_ROWS_PER_REQUEST),
    startRow: page.startRow ?? a.startRow ?? 0,
  };
  const filters = buildFilters(a);
  if (filters.length) {
    body.dimensionFilterGroups = [{ groupType: 'and', filters }];
  }
  return body;
}

export async function pageRows(gsc, site, buildBody, target, startAt = 0) {
  const rows = [];
  let aggregation;
  let hasMore = false;
  while (rows.length < target) {
    const perPage = Math.min(target - rows.length, API_MAX_ROWS_PER_REQUEST);
    const data = await gsc.searchAnalytics(site, buildBody(startAt + rows.length, perPage));
    const batch = data?.rows ?? [];
    if (data?.responseAggregationType) aggregation = data.responseAggregationType;
    rows.push(...batch);
    if (batch.length < perPage) break;
    if (rows.length >= target) {
      hasMore = true;
      break;
    }
  }
  return { rows, aggregation, hasMore };
}

export async function runSearchAnalytics(gsc, site, a) {
  const warnings = [];
  const requested = a.rowLimit ?? DEFAULT_ROW_LIMIT;
  const maxRows = a.maxRows ?? DEFAULT_MAX_ROWS;
  const baseStart = a.startRow ?? 0;

  let target = requested;
  if (target > maxRows) {
    warnings.push(`rowLimit ${requested} exceeds maxRows ${maxRows}; returning at most ${maxRows} rows. Increase maxRows to fetch more.`);
    target = maxRows;
  }

  const { rows, aggregation, hasMore } = await pageRows(
    gsc,
    site,
    (startRow, rowLimit) => buildAnalyticsBody(a, { startRow, rowLimit }),
    target,
    baseStart,
  );

  if (a.aggregationType && a.aggregationType !== 'auto' && aggregation && aggregation.toLowerCase() !== a.aggregationType.toLowerCase()) {
    warnings.push(`Requested aggregationType "${a.aggregationType}" but the API aggregated "${aggregation}".`);
  }
  if (hasMore) {
    warnings.push('More rows are available beyond the returned set; increase rowLimit/maxRows or use startRow to page further.');
  }

  return {
    siteUrl: site,
    period: resolvePeriod(a),
    dimensions: a.dimensions ?? ['query'],
    searchType: a.searchType ?? 'web',
    dataState: a.dataState ?? 'final',
    aggregationType: aggregation ?? a.aggregationType ?? 'auto',
    startRow: baseStart,
    rowCount: rows.length,
    hasMore,
    rows,
    warnings,
  };
}
