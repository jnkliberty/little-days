// Baby Buddy refuses a period entry (sleep, feed, pump, tummy time) that crosses another saved entry of the same kind.
// Its refusal text follows the account language, so this file reads the saved entries instead: a crossing entry proves the
// cause. Read-only: nothing here changes or deletes a saved entry.
import { HttpError } from './http.ts';
import { getZone } from './zone.ts';

export type Conflict = { id: string; start: string; end: string };
type Row = Record<string, unknown>;
type Ask = (input: { resource: string; method: string; query?: Record<string, string | number> }) => Promise<unknown>;

function isRow(value: unknown): value is Row {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

// The saved entries of this child and resource that cross start..end, without `exclude` (the entry being edited). Null when the list cannot be read.
export async function findConflicts(ask: Ask, resource: string, childId: number, start: string, end: string, exclude?: string): Promise<Conflict[] | null> {
  let value: unknown;
  try { value = await ask({ resource, method: 'GET', query: { child: childId, end_min: start, start_max: end, limit: 20 } }); }
  catch { return null; }
  const rows = Array.isArray(value) ? value : isRow(value) && Array.isArray(value.results) ? value.results : null;
  if (!rows) return null;
  const from = Date.parse(start), to = Date.parse(end);
  return rows.filter(isRow)
    .filter(row => (row.child == null || Number(row.child) === childId) && `${resource}:${row.id}` !== exclude && Date.parse(String(row.start)) < to && Date.parse(String(row.end)) > from)
    .map(row => ({ id: `${resource}:${row.id}`, start: String(row.start), end: String(row.end) }));
}

function clock(value: string, period: boolean): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: getZone(), hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(new Date(value));
  const pick = (type: string) => parts.find(part => part.type === type)?.value ?? '';
  return `${pick('hour')}:${pick('minute')}${period ? ` ${pick('dayPeriod')}` : ''}`;
}

// "9:39 to 9:45 AM", or "11:50 AM to 12:05 PM" when the period changes.
export function sleepSpan(item: { start: string; end: string }): string {
  const samePeriod = clock(item.start, true).slice(-2) === clock(item.end, true).slice(-2);
  return `${clock(item.start, !samePeriod)} to ${clock(item.end, true)}`;
}

export function overlapMessage(conflicts: Conflict[]): string {
  const spans = conflicts.map(sleepSpan);
  const what = spans.length === 1 ? `the sleep saved from ${spans[0]}` : `${spans.length} saved sleeps (${spans.join(', ')})`;
  return `This time overlaps ${what}. Change the start or end, or delete that sleep in the timeline.`;
}

// The browser words its own sentence from `conflicts`; the English message is for any older page.
export function overlapDetails(conflicts: Conflict[]): Record<string, unknown> {
  return { code: 'sleep_overlap', conflicts };
}

export function overlapError(conflicts: Conflict[]): HttpError {
  return new HttpError(400, overlapMessage(conflicts), overlapDetails(conflicts));
}
