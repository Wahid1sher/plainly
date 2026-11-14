export const LANGUAGES: { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'ja', label: '日本語' },
  { code: 'fr', label: 'Français' },
  { code: 'pt', label: 'Português' },
  { code: 'zh', label: '中文' },
  { code: 'ar', label: 'العربية' },
  { code: 'fa', label: 'فارسی' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'tl', label: 'Tagalog' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'uk', label: 'Українська' },
];

export type ReadingLevel = 'simple' | 'standard';

export function languageName(code: string) {
  return LANGUAGES.find((l) => l.code === code)?.label ?? 'English';
}

const PLACEHOLDER_RULE =
  'Some personal details were replaced with placeholders such as [NAME_1], [ADDRESS_1] or [ID_2]. Never guess what they hide. When you need to refer to one, copy the placeholder exactly, including the brackets.';

// ---------- Privacy Shield (on-device only) ----------

export const PII_SCHEMA = {
  type: 'object',
  properties: {
    entities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          type: { type: 'string', enum: ['person name', 'home address', 'id number', 'date of birth', 'phone', 'email'] },
        },
        required: ['text', 'type'],
      },
    },
  },
  required: ['entities'],
};

export function piiPrompt(text: string) {
  return `Find personal details about private individuals in the document below.
Return each exact substring as it appears in the document.
Include: people's names, home or mailing addresses, personal ID numbers (account, member, case, policy, patient, tenant, client numbers), dates of birth, personal phone numbers and emails.
Do NOT include: company, hospital, agency or landlord business names, money amounts, or dates that are not birth dates.
Text already shown as [SOMETHING_1] is already hidden; skip it.

DOCUMENT:
"""
${text}
"""`;
}

// ---------- Explanation ----------

export interface ActionItem {
  task: string;
  deadline: string; // YYYY-MM-DD or ''
  why: string;
}

export interface Explanation {
  title: string;
  docType: string;
  sender: string;
  urgency: 'low' | 'medium' | 'high';
  summary: string;
  keyPoints: string[];
  actions: ActionItem[];
  money: { label: string; amount: string }[];
  questions: string[];
  watchOut: string[];
}

export const EXPLAIN_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Short title, e.g. "Hospital bill from Riverside General"' },
    docType: { type: 'string' },
    sender: { type: 'string' },
    urgency: { type: 'string', enum: ['low', 'medium', 'high'] },
    summary: { type: 'string' },
    keyPoints: { type: 'array', items: { type: 'string' } },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          task: { type: 'string' },
          deadline: { type: 'string', description: 'YYYY-MM-DD, or empty string if none' },
          why: { type: 'string' },
        },
        required: ['task', 'deadline', 'why'],
      },
    },
    money: {
      type: 'array',
      items: { type: 'object', properties: { label: { type: 'string' }, amount: { type: 'string' } }, required: ['label', 'amount'] },
    },
    questions: { type: 'array', items: { type: 'string' } },
    watchOut: { type: 'array', items: { type: 'string' } },
  },
  required: ['title', 'docType', 'sender', 'urgency', 'summary', 'keyPoints', 'actions', 'money', 'questions', 'watchOut'],
};

function style(level: ReadingLevel, lang: string) {
  const lvl =
    level === 'simple'
      ? 'Write for someone reading at a 5th-grade level: short sentences, everyday words, no jargon. If a technical term is unavoidable, explain it in brackets.'
      : 'Write in clear plain language for a general adult reader. Briefly explain any technical terms.';
  return `${lvl}\nWrite every text value in ${languageName(lang)}. Keep the JSON keys in English.`;
}

export function explainPrompt(doc: string, level: ReadingLevel, lang: string, today: string) {
  return `You help people understand confusing letters, bills and official notices. Today is ${today}.
${PLACEHOLDER_RULE}
${style(level, lang)}

Read the document and return JSON with:
- title: a short title naming the kind of document and who sent it
- docType, sender
- urgency: "high" if there is a deadline within 30 days or a risk of losing money, housing, benefits or legal rights; otherwise "medium" or "low"
- summary: 2 to 4 sentences on what this document means for the reader
- keyPoints: 3 to 6 short facts the reader must know
- actions: what the reader should do, most urgent first, with a deadline as YYYY-MM-DD when the document gives one (else "")
- money: every amount that matters to the reader (what they owe, changes, fees)
- questions: 2 to 4 good questions the reader could ask the sender
- watchOut: rights, options, risks or fine print the reader might miss (for example financial help, appeal rights, legal limits)
Only use facts from the document. Do not give legal or medical advice; you may suggest who to contact.

DOCUMENT:
"""
${doc}
"""`;
}

// ---------- Strict-local map-reduce for long documents ----------

export const NOTES_SCHEMA = {
  type: 'object',
  properties: { notes: { type: 'array', items: { type: 'string' } } },
  required: ['notes'],
};

export function chunkNotesPrompt(chunk: string, i: number, n: number) {
  return `This is part ${i} of ${n} of a longer document. ${PLACEHOLDER_RULE}
List every important fact in this part as short notes: who sent it, amounts, dates, deadlines, required actions, rights, options, warnings. Keep exact numbers and dates.

PART ${i}/${n}:
"""
${chunk}
"""`;
}

// ---------- Follow-up questions ----------

export function askPrompt(doc: string, summary: string, history: { q: string; a: string }[], question: string, level: ReadingLevel, lang: string) {
  const past = history.map((h) => `Q: ${h.q}\nA: ${h.a}`).join('\n\n');
  return `You answer questions about one document the user received. ${PLACEHOLDER_RULE}
${style(level, lang).split('\n')[0]} Answer in ${languageName(lang)}, in at most 120 words.
If the document does not say, say so plainly and suggest who to ask. Do not give legal or medical advice.

DOCUMENT:
"""
${doc}
"""

SUMMARY: ${summary}
${past ? `\nEARLIER QUESTIONS:\n${past}\n` : ''}
QUESTION: ${question}`;
}

// ---------- Draft a reply ----------

export const REPLY_KINDS = [
  { id: 'payment-plan', label: 'Ask for a payment plan or more time' },
  { id: 'itemized', label: 'Ask for details or an itemized bill' },
  { id: 'dispute', label: 'Dispute or appeal this' },
  { id: 'financial-help', label: 'Ask about financial help or exemptions' },
  { id: 'confirm', label: 'Confirm I received it and will act' },
] as const;

export type ReplyKind = (typeof REPLY_KINDS)[number]['id'];

export function replyPrompt(doc: string, summary: string, kind: ReplyKind, note: string, lang: string) {
  const goal = REPLY_KINDS.find((k) => k.id === kind)?.label ?? 'Reply';
  return `Write a short, polite, firm letter from the recipient of the document below to its sender. ${PLACEHOLDER_RULE}
Use placeholders for the sender's own name, address and ID numbers where they belong (for example sign it with the person's name placeholder and quote the account or case number placeholder).
Goal: ${goal}.
${note ? `Extra details from the user: ${note}\n` : ''}Refer to specific facts from the document (dates, amounts, rights it mentions). Keep it under 220 words. Write it in ${languageName(lang)}. Output only the letter text.

DOCUMENT SUMMARY: ${summary}

DOCUMENT:
"""
${doc}
"""`;
}

// ---------- Photo transcription ----------

export const TRANSCRIBE_PROMPT =
  'Transcribe all of the text in this photo of a document exactly as written, keeping line breaks. Output only the text, nothing else.';
