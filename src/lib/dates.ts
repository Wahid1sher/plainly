/**
 * Deadline guard. Models (especially small on-device ones) sometimes invent or mis-calculate dates.
 * A wrong deadline on a benefits or legal notice can cost someone their rights, so Plainly only shows a
 * deadline when that exact calendar date is written in the document itself.
 */

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

function iso(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return dt.toISOString().slice(0, 10);
}

function monthIndex(name: string): number {
  const n = name.toLowerCase().replace('.', '');
  const i = MONTHS.findIndex((m) => m === n || m.slice(0, 3) === n.slice(0, 3));
  return i + 1;
}

/** Every calendar date written in the text, as YYYY-MM-DD. US-style numeric dates (MM/DD/YYYY) are assumed. */
export function extractDates(text: string): Set<string> {
  const out = new Set<string>();
  const add = (v: string | null) => v && out.add(v);
  for (const m of text.matchAll(/\b([A-Z][a-z]{2,8})\.? (\d{1,2})(?:st|nd|rd|th)?,? (\d{4})\b/g)) {
    const mi = monthIndex(m[1]);
    if (mi) add(iso(+m[3], mi, +m[2]));
  }
  for (const m of text.matchAll(/\b(\d{1,2}) ([A-Z][a-z]{2,8})\.? (\d{4})\b/g)) {
    const mi = monthIndex(m[2]);
    if (mi) add(iso(+m[3], mi, +m[1]));
  }
  for (const m of text.matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/g)) add(iso(+m[3], +m[1], +m[2]));
  for (const m of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) add(iso(+m[1], +m[2], +m[3]));
  return out;
}
