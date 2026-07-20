import { DATE_PRESETS } from './constants.mjs';

export const DAY_MS = 864e5;

export const ago = (d) => new Date(Date.now() - d * DAY_MS).toISOString().slice(0, 10);
export const parseDate = (s) => Date.parse(`${s}T00:00:00Z`);
export const formatDate = (ms) => new Date(ms).toISOString().slice(0, 10);
export const inclusiveDays = (start, end) => Math.round((parseDate(end) - parseDate(start)) / DAY_MS) + 1;

export const round = (n, digits = 2) => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

export const changePercent = (current, previous) => {
  if (previous === 0) return current === 0 ? 0 : null;
  return round(((current - previous) / previous) * 100);
};

export function resolvePeriod(a) {
  const days = a.datePreset != null ? DATE_PRESETS[a.datePreset] : (a.days ?? 28);
  return { startDate: a.startDate ?? ago(days), endDate: a.endDate ?? ago(1) };
}
