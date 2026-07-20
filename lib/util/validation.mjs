import {
  DIMENSIONS,
  FILTER_DIMENSIONS,
  GROUP_BY_DIMENSIONS,
  SEARCH_TYPES,
  OPERATORS,
  DATA_STATES,
  AGGREGATION_TYPES,
  DATE_PRESETS,
  OPPORTUNITY_TYPES,
  OPPORTUNITY_DIMENSIONS,
} from './constants.mjs';
import { ToolError } from './errors.mjs';

export function requireString(args, key) {
  if (typeof args[key] !== 'string' || args[key].trim() === '') {
    throw new ToolError(`Missing or invalid required argument "${key}" (expected a non-empty string).`);
  }
}

function positiveInt(a, key, { min = 1 } = {}) {
  if (a[key] != null && (!Number.isInteger(a[key]) || a[key] < min)) {
    throw new ToolError(`"${key}" must be an integer >= ${min}.`);
  }
}

function validateDate(a, key) {
  if (a[key] != null && (typeof a[key] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(a[key]))) {
    throw new ToolError(`"${key}" must be a date string in YYYY-MM-DD format.`);
  }
}

function validateDatePreset(a) {
  if (a.datePreset != null && !Object.hasOwn(DATE_PRESETS, a.datePreset)) {
    throw new ToolError(`Unknown datePreset "${a.datePreset}". Allowed: ${Object.keys(DATE_PRESETS).join(', ')}.`);
  }
}

function validateFilters(a) {
  if (a.filters != null) {
    if (!Array.isArray(a.filters)) {
      throw new ToolError('"filters" must be an array of { dimension, operator, expression }.');
    }
    for (const f of a.filters) {
      if (!f || typeof f !== 'object' || Array.isArray(f)) {
        throw new ToolError('Each filter must be an object with { dimension, operator, expression }.');
      }
      if (!FILTER_DIMENSIONS.includes(f.dimension)) {
        throw new ToolError(`Filter has unknown dimension "${f.dimension}". Allowed: ${FILTER_DIMENSIONS.join(', ')}.`);
      }
      if (f.operator != null && !OPERATORS.includes(f.operator)) {
        throw new ToolError(`Filter has unknown operator "${f.operator}". Allowed: ${OPERATORS.join(', ')}.`);
      }
      if (typeof f.expression !== 'string' || f.expression === '') {
        throw new ToolError('Each filter needs a non-empty "expression" string.');
      }
    }
  }
  if (a.filterPage != null && typeof a.filterPage !== 'string') {
    throw new ToolError('"filterPage" must be a string.');
  }
}

export function validateAnalytics(a) {
  if (a.days != null && (typeof a.days !== 'number' || !Number.isFinite(a.days) || a.days <= 0)) {
    throw new ToolError('"days" must be a positive number.');
  }
  validateDate(a, 'startDate');
  validateDate(a, 'endDate');
  validateDatePreset(a);
  if (a.dimensions != null) {
    if (!Array.isArray(a.dimensions) || a.dimensions.length === 0) {
      throw new ToolError('"dimensions" must be a non-empty array.');
    }
    for (const d of a.dimensions) {
      if (!DIMENSIONS.includes(d)) {
        throw new ToolError(`Unknown dimension "${d}". Allowed: ${DIMENSIONS.join(', ')}.`);
      }
    }
  }
  validateFilters(a);
  if (a.searchType != null && !SEARCH_TYPES.includes(a.searchType)) {
    throw new ToolError(`Unknown searchType "${a.searchType}". Allowed: ${SEARCH_TYPES.join(', ')}.`);
  }
  if (a.dataState != null && !DATA_STATES.includes(a.dataState)) {
    throw new ToolError(`Unknown dataState "${a.dataState}". Allowed: ${DATA_STATES.join(', ')}.`);
  }
  if (a.aggregationType != null && !AGGREGATION_TYPES.includes(a.aggregationType)) {
    throw new ToolError(`Unknown aggregationType "${a.aggregationType}". Allowed: ${AGGREGATION_TYPES.join(', ')}.`);
  }
  positiveInt(a, 'rowLimit');
  positiveInt(a, 'maxRows');
  positiveInt(a, 'startRow', { min: 0 });
}

export function validateCompare(a) {
  if (a.days != null && (typeof a.days !== 'number' || !Number.isFinite(a.days) || a.days <= 0)) {
    throw new ToolError('"days" must be a positive number.');
  }
  for (const key of ['startDate', 'endDate', 'previousStartDate', 'previousEndDate']) {
    validateDate(a, key);
  }
  validateDatePreset(a);
  if ((a.previousStartDate == null) !== (a.previousEndDate == null)) {
    throw new ToolError('Provide both "previousStartDate" and "previousEndDate", or neither.');
  }
  if (a.groupBy != null && !GROUP_BY_DIMENSIONS.includes(a.groupBy)) {
    throw new ToolError(`Unknown groupBy "${a.groupBy}". Allowed: ${GROUP_BY_DIMENSIONS.join(', ')}.`);
  }
  validateFilters(a);
  if (a.searchType != null && !SEARCH_TYPES.includes(a.searchType)) {
    throw new ToolError(`Unknown searchType "${a.searchType}". Allowed: ${SEARCH_TYPES.join(', ')}.`);
  }
  if (a.dataState != null && !DATA_STATES.includes(a.dataState)) {
    throw new ToolError(`Unknown dataState "${a.dataState}". Allowed: ${DATA_STATES.join(', ')}.`);
  }
  positiveInt(a, 'rowLimit');
  positiveInt(a, 'limit');
}

export function validateOpportunities(a) {
  if (a.days != null && (typeof a.days !== 'number' || !Number.isFinite(a.days) || a.days <= 0)) {
    throw new ToolError('"days" must be a positive number.');
  }
  validateDate(a, 'startDate');
  validateDate(a, 'endDate');
  validateDatePreset(a);
  validateFilters(a);
  if (a.type != null && !OPPORTUNITY_TYPES.includes(a.type)) {
    throw new ToolError(`Unknown type "${a.type}". Allowed: ${OPPORTUNITY_TYPES.join(', ')}.`);
  }
  if (a.dimension != null && !OPPORTUNITY_DIMENSIONS.includes(a.dimension)) {
    throw new ToolError(`Unknown dimension "${a.dimension}". Allowed: ${OPPORTUNITY_DIMENSIONS.join(', ')}.`);
  }
  if (a.searchType != null && !SEARCH_TYPES.includes(a.searchType)) {
    throw new ToolError(`Unknown searchType "${a.searchType}". Allowed: ${SEARCH_TYPES.join(', ')}.`);
  }
  if (a.dataState != null && !DATA_STATES.includes(a.dataState)) {
    throw new ToolError(`Unknown dataState "${a.dataState}". Allowed: ${DATA_STATES.join(', ')}.`);
  }
  for (const key of ['minPosition', 'maxPosition']) {
    if (a[key] != null && (typeof a[key] !== 'number' || !Number.isFinite(a[key]) || a[key] < 1)) {
      throw new ToolError(`"${key}" must be a number >= 1.`);
    }
  }
  if (a.maxCtr != null && (typeof a.maxCtr !== 'number' || a.maxCtr < 0 || a.maxCtr > 1)) {
    throw new ToolError('"maxCtr" must be a number between 0 and 1.');
  }
  positiveInt(a, 'minImpressions', { min: 0 });
  positiveInt(a, 'rowLimit');
  positiveInt(a, 'limit');
}
