export const DIMENSIONS = ['date', 'query', 'page', 'country', 'device', 'searchAppearance'];
export const FILTER_DIMENSIONS = ['query', 'page', 'country', 'device', 'searchAppearance'];
export const GROUP_BY_DIMENSIONS = ['page', 'query', 'country', 'device'];
export const SEARCH_TYPES = ['web', 'image', 'video', 'news', 'discover'];
export const OPERATORS = ['equals', 'notEquals', 'contains', 'notContains', 'includingRegex', 'excludingRegex'];
export const DATA_STATES = ['final', 'all'];
export const AGGREGATION_TYPES = ['auto', 'byProperty', 'byPage'];
export const DATE_PRESETS = {
  last_7_days: 7,
  last_28_days: 28,
  last_3_months: 90,
  last_6_months: 180,
  last_12_months: 365,
  last_16_months: 480,
};

export const API_MAX_ROWS_PER_REQUEST = 25000;
export const DEFAULT_ROW_LIMIT = 1000;
export const DEFAULT_MAX_ROWS = 25000;
export const DEFAULT_COMPARE_ROW_LIMIT = 5000;
export const DEFAULT_TOP_N = 10;
