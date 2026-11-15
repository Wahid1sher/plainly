/**
 * Privacy Shield: finds personal details in a document and swaps them for
 * placeholders like [NAME_1] before any text can leave the device.
 *
 * Two detectors feed it:
 *   1. Deterministic rules (this file): emails, phones, card numbers, IBANs,
 *      SSNs, labelled IDs, street addresses, salutation names, dates of birth.
 *   2. Gemini Nano on-device (see pipeline.ts), which catches names and
 *      addresses the rules miss. Its findings are merged in with mergeFindings().
 *
 * The placeholder -> original map (the "vault") never leaves the device.
 * Model output is re-hydrated locally with rehydrate() so the user still sees
 * their own details, while the cloud only ever saw placeholders.
 */

export type EntityType = 'NAME' | 'ADDRESS' | 'EMAIL' | 'PHONE' | 'ID' | 'CARD' | 'DOB' | 'GOV_ID';

export interface Finding {
  start: number;
  end: number;
  text: string;
  type: EntityType;
  source: 'rules' | 'on-device';
}

export interface Vault {
  [placeholder: string]: { original: string; type: EntityType };
}

export interface RedactionResult {
  redacted: string;
  vault: Vault;
  findings: Finding[];
}

interface Rule {
  type: EntityType;
  re: RegExp;
  /** Capture group holding the sensitive part (0 = whole match). */
  group?: number;
  validate?: (s: string) => boolean;
}

function luhn(raw: string): boolean {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

const STREET =
  '(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Way|Place|Pl|Terrace|Ter|Circle|Cir|Parkway|Pkwy|Highway|Hwy|Close|Crescent|Square|Sq)';

const RULES: Rule[] = [
  { type: 'EMAIL', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g },
  { type: 'GOV_ID', re: /\b\d{3}-\d{2}-\d{4}\b/g },
  { type: 'CARD', re: /\b(?:\d[ -]?){12,18}\d\b/g, validate: luhn },
  { type: 'ID', re: /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,4})?\b/g }, // IBAN
  {
    type: 'PHONE',
    re: /(?<![\w$.,])(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(?![\w])/g,
  },
  {
    type: 'DOB',
    re: /\b(?:date of birth|d\.?o\.?b\.?|born(?: on)?)\s*[:\-]?\s*((?:\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})|(?:[A-Z][a-z]+ \d{1,2},? \d{4})|(?:\d{1,2} [A-Z][a-z]+ \d{4}))/gi,
    group: 1,
  },
  {
    type: 'ID',
    re: /\b(?:account|acct|member|policy|patient|case|claim|reference|ref|invoice|mrn|tenant|customer|subscriber|group|nhs|medicare|medicaid|alien|uscis|a-number|receipt|license|licence|passport|student|employee|client|file|ssn|social security)\s*(?:no\.?|number|num\.?|#|id)?\s*[:#.]?\s*((?=[A-Z0-9-]*\d)[A-Z0-9][A-Z0-9-]{3,})/gi,
    group: 1,
  },
  {
    type: 'ADDRESS',
    re: new RegExp(
      `\\b\\d{1,6}\\s+(?:[A-Z][A-Za-z'.]*\\s){1,4}${STREET}\\b\\.?(?:,?\\s*(?:Apt|Apartment|Unit|Suite|Ste|#)\\.?\\s*[A-Za-z0-9-]+)?(?:,\\s*[A-Z][A-Za-z ]+,?\\s+[A-Z]{2}\\s+\\d{5}(?:-\\d{4})?)?`,
      'g'
    ),
  },
  {
    type: 'NAME',
    re: /\b(?:Dear|Mr\.?|Mrs\.?|Ms\.?|Mx\.?|Miss|Patient(?: name)?:|Name:|Tenant(?: name)?:|Applicant:|Beneficiary:|Insured:|Guarantor:|Resident:|To:)\s+((?:[A-Z][a-z'-]+)(?:\s+[A-Z]\.)?(?:\s+[A-Z][a-z'-]+){0,2})/g,
    group: 1,
  },
];

/** Words that look like names after a salutation but aren't personal. */
const NOT_NAMES = new Set(['Sir', 'Madam', 'Customer', 'Patient', 'Resident', 'Tenant', 'Member', 'Valued', 'Applicant', 'Friend', 'Policyholder']);
/** Words that mark an organisation or department rather than a person. */
const ORG_WORDS = /\b(?:Services?|Department|Dept|Office|Center|Centre|Hospital|Clinic|Bank|Insurance|Management|Company|Team|Agency|Group|Billing|Support|Program|Authority|Council|University|LLC|Inc)\b/;
/** Toll-free numbers belong to businesses, not people; keep them so the AI can tell the user who to call. */
const TOLL_FREE = /^(?:\+?1[\s.-]?)?\(?8(?:00|33|44|55|66|77|88)\)?/;

export function detectWithRules(text: string): Finding[] {
  const out: Finding[] = [];
  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.re.exec(text))) {
      const g = rule.group ?? 0;
      const value = m[g];
      if (!value) continue;
      if (rule.validate && !rule.validate(value)) continue;
      if (rule.type === 'NAME' && (NOT_NAMES.has(value.split(/\s+/)[0]) || ORG_WORDS.test(value))) continue;
      if (rule.type === 'PHONE' && TOLL_FREE.test(value.trim())) continue;
      const offset = g === 0 ? 0 : m[0].indexOf(value);
      const start = m.index + offset;
      out.push({ start, end: start + value.length, text: value, type: rule.type, source: 'rules' });
    }
  }
  return resolveOverlaps(out);
}

/** Turns model-reported strings (no offsets) into findings at every place they occur. */
export function locate(text: string, entities: { text: string; type: string }[]): Finding[] {
  const out: Finding[] = [];
  for (const e of entities) {
    const needle = e.text?.trim();
    if (!needle || needle.length < 3) continue;
    if (/^\[[A-Z_]+_\d+\]$/.test(needle)) continue;
    const type = normaliseType(e.type);
    if (!plausible(needle, type)) continue;
    let from = 0;
    let idx: number;
    while ((idx = text.indexOf(needle, from)) !== -1) {
      // A date is only a date of birth when the document labels it as one; otherwise it's a deadline we must keep.
      const labelled = type !== 'DOB' || /(birth|d\.?o\.?b|born)[^\n]{0,25}$/i.test(text.slice(Math.max(0, idx - 40), idx));
      if (labelled) out.push({ start: idx, end: idx + needle.length, text: needle, type, source: 'on-device' });
      from = idx + needle.length;
    }
    // A full name found by the model also hides its parts when they appear alone ("Dear Maria").
    if (type === 'NAME' && /\s/.test(needle)) {
      for (const part of needle.split(/\s+/)) {
        if (part.length < 3 || !/^[A-Z]/.test(part)) continue;
        const re = new RegExp(`\\b${escapeRe(part)}\\b`, 'g');
        let m: RegExpExecArray | null;
        while ((m = re.exec(text))) out.push({ start: m.index, end: m.index + part.length, text: part, type, source: 'on-device' });
      }
    }
  }
  return out;
}

const DATE_LIKE = /^(?:\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|[A-Z][a-z]+\.? \d{1,2},? \d{4}|\d{1,2} [A-Z][a-z]+ \d{4}|\d{4}-\d{2}-\d{2})$/;

/**
 * Small models over-redact. Drop findings that would remove meaning the explanation needs:
 * money, percentages, dates mistaken for names or IDs, organisations, and toll-free business numbers.
 */
function plausible(needle: string, type: EntityType): boolean {
  if (/[$€£%]/.test(needle)) return false;
  if (type !== 'DOB' && DATE_LIKE.test(needle)) return false;
  const orgLike = new RegExp(ORG_WORDS.source, 'i').test(needle);
  if (type === 'NAME' && (orgLike || /\d/.test(needle))) return false;
  if (type === 'ADDRESS' && (orgLike || !/\d/.test(needle))) return false;
  if (type === 'PHONE' && (TOLL_FREE.test(needle) || needle.replace(/\D/g, '').length < 7)) return false;
  if (type === 'ID' && !/\d/.test(needle)) return false;
  return true;
}

function normaliseType(t: string): EntityType {
  const u = (t || '').toUpperCase();
  if (u.includes('ADDR')) return 'ADDRESS';
  if (u.includes('MAIL')) return 'EMAIL';
  if (u.includes('PHONE')) return 'PHONE';
  if (u.includes('BIRTH') || u === 'DOB') return 'DOB';
  if (u.includes('NAME') || u.includes('PERSON')) return 'NAME';
  return 'ID';
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Keeps the longest finding when two overlap. */
export function resolveOverlaps(findings: Finding[]): Finding[] {
  const sorted = [...findings].sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const out: Finding[] = [];
  for (const f of sorted) {
    const last = out[out.length - 1];
    if (last && f.start < last.end) {
      const longer = f.end - f.start > last.end - last.start;
      const sameSpanButLabelled = f.start === last.start && f.end === last.end && f.type === 'ID' && last.type === 'PHONE';
      if (longer || sameSpanButLabelled) out[out.length - 1] = f;
      continue;
    }
    out.push(f);
  }
  return out;
}

export function mergeFindings(...lists: Finding[][]): Finding[] {
  return resolveOverlaps(lists.flat());
}

/** Replaces findings with stable placeholders. The same original text always gets the same placeholder. */
export function applyRedaction(text: string, findings: Finding[]): RedactionResult {
  const vault: Vault = {};
  const byOriginal = new Map<string, string>();
  const counters: Partial<Record<EntityType, number>> = {};
  let out = '';
  let cursor = 0;
  for (const f of resolveOverlaps(findings)) {
    out += text.slice(cursor, f.start);
    const key = `${f.type}:${f.text.toLowerCase()}`;
    let ph = byOriginal.get(key);
    if (!ph) {
      counters[f.type] = (counters[f.type] ?? 0) + 1;
      ph = `[${f.type}_${counters[f.type]}]`;
      byOriginal.set(key, ph);
      vault[ph] = { original: f.text, type: f.type };
    }
    out += ph;
    cursor = f.end;
  }
  out += text.slice(cursor);
  return { redacted: out, vault, findings };
}

/** Puts the user's real details back into model output, locally. */
export function rehydrate(text: string, vault: Vault): string {
  if (!text) return text;
  return text.replace(/\[([A-Z_]+_\d+)\]/g, (m) => vault[m]?.original ?? m);
}

/** Deep re-hydration for structured results. */
export function rehydrateDeep<T>(value: T, vault: Vault): T {
  if (typeof value === 'string') return rehydrate(value, vault) as T;
  if (Array.isArray(value)) return value.map((v) => rehydrateDeep(v, vault)) as T;
  if (value && typeof value === 'object') {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) o[k] = rehydrateDeep(v, vault);
    return o as T;
  }
  return value;
}

export function redactWithRules(text: string): RedactionResult {
  return applyRedaction(text, detectWithRules(text));
}
