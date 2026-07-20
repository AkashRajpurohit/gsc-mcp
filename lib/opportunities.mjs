import {
  DEFAULT_OPPORTUNITY_ROW_LIMIT,
  DEFAULT_OPPORTUNITY_MIN_IMPRESSIONS,
  DEFAULT_OPPORTUNITY_LIMIT,
  STRIKING_MIN_POSITION,
  STRIKING_MAX_POSITION,
  LOW_CTR_MAX_POSITION,
  LOW_CTR_MAX_CTR,
} from './util/constants.mjs';
import { resolvePeriod, round } from './util/dates.mjs';
import { buildAnalyticsBody, pageRows } from './analytics.mjs';

export async function runOpportunities(gsc, site, a) {
  const type = a.type ?? 'striking_distance';
  const dimension = a.dimension ?? 'query';
  const minImpressions = a.minImpressions ?? DEFAULT_OPPORTUNITY_MIN_IMPRESSIONS;
  const limit = a.limit ?? DEFAULT_OPPORTUNITY_LIMIT;
  const target = a.rowLimit ?? DEFAULT_OPPORTUNITY_ROW_LIMIT;

  const periodArgs = {
    days: a.days,
    datePreset: a.datePreset,
    startDate: a.startDate,
    endDate: a.endDate,
    searchType: a.searchType,
    dataState: a.dataState,
    filters: a.filters,
    filterPage: a.filterPage,
  };
  const build = (startRow, rowLimit) => buildAnalyticsBody({ ...periodArgs, dimensions: [dimension] }, { startRow, rowLimit });
  const { rows, hasMore } = await pageRows(gsc, site, build, target);

  let criteria;
  let matches;
  if (type === 'low_ctr') {
    const maxPosition = a.maxPosition ?? LOW_CTR_MAX_POSITION;
    const maxCtr = a.maxCtr ?? LOW_CTR_MAX_CTR;
    criteria = { maxPosition, maxCtr, minImpressions };
    matches = rows.filter(
      (r) => (r.impressions ?? 0) >= minImpressions && (r.position ?? Infinity) <= maxPosition && (r.ctr ?? 0) <= maxCtr,
    );
  } else {
    const minPosition = a.minPosition ?? STRIKING_MIN_POSITION;
    const maxPosition = a.maxPosition ?? STRIKING_MAX_POSITION;
    criteria = { minPosition, maxPosition, minImpressions };
    matches = rows.filter(
      (r) => (r.impressions ?? 0) >= minImpressions && (r.position ?? 0) >= minPosition && (r.position ?? 0) <= maxPosition,
    );
  }

  const opportunities = matches
    .map((r) => ({
      [dimension]: r.keys[0],
      clicks: r.clicks ?? 0,
      impressions: r.impressions ?? 0,
      ctr: round(r.ctr ?? 0, 4),
      position: round(r.position ?? 0, 1),
    }))
    .sort((x, y) => y.impressions - x.impressions || String(x[dimension]).localeCompare(String(y[dimension])))
    .slice(0, limit);

  const warnings = [];
  if (hasMore) {
    warnings.push(`Only the first ${target} rows were scanned; increase rowLimit for fuller coverage.`);
  }

  return {
    siteUrl: site,
    period: resolvePeriod(a),
    type,
    dimension,
    criteria,
    count: opportunities.length,
    opportunities,
    warnings,
  };
}
