import { readFileSync } from 'node:fs';

export type Label = string | { en: string; es?: string };
export type Adult = { username: string; role: 'owner' | 'caregiver'; label?: Label };
const USERNAME = /^[A-Za-z0-9._@+-]{1,150}$/;

// A label is one text, or { en, es } when the screens show a different text in Spanish.
function cleanLabel(username: string, label: unknown): Label {
  const text = (value: unknown) => typeof value === 'string' && value.trim() && value.length <= 100 ? value.trim() : null;
  if (text(label)) return text(label)!;
  if (label && typeof label === 'object' && !Array.isArray(label) && Object.keys(label).every(key => key === 'en' || key === 'es') && text((label as any).en) && Object.values(label).every(text)) {
    return Object.fromEntries(Object.entries(label).map(([key, value]) => [key, text(value)])) as { en: string; es?: string };
  }
  throw new Error(`The label for ${username} in the household file must be 1 to 100 characters, or an object with en and optional es.`);
}

// The household file lists each adult: `username`, `role` (owner or caregiver), and an optional `label` that the screens show.
// deploy/bootstrap_household.py reads the same file and applies the same rules.
export function parseHouseholdFile(value: unknown): Adult[] {
  const rows = value && typeof value === 'object' && !Array.isArray(value) ? (value as { adults?: unknown }).adults : null;
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('The household file needs an "adults" list with at least one adult.');
  const adults = rows.map((row): Adult => {
    if (!row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).some(key => !['username', 'role', 'label'].includes(key))) throw new Error('Each adult in the household file needs only username, role, and an optional label.');
    const { username, role, label } = row as Record<string, unknown>;
    if (typeof username !== 'string' || !USERNAME.test(username)) throw new Error('Each adult in the household file needs a username of letters, digits, and . _ @ + - only.');
    if (role !== 'owner' && role !== 'caregiver') throw new Error(`The role for ${username} in the household file must be owner or caregiver.`);
    return { username, role, ...(label === undefined ? {} : { label: cleanLabel(username, label) }) };
  });
  if (new Set(adults.map(adult => adult.username)).size !== adults.length) throw new Error('The household file lists a username twice.');
  if (!adults.some(adult => adult.role === 'owner')) throw new Error('The household needs at least one owner.');
  return adults;
}

export function readHouseholdFile(path: string): Adult[] {
  try { return parseHouseholdFile(JSON.parse(readFileSync(path, 'utf8'))); }
  catch (error) { throw new Error(error instanceof SyntaxError ? 'The household file is not valid JSON.' : (error as Error).message); }
}
