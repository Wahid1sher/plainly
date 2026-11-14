/**
 * Fake AI used only when VITE_MOCK_AI=true, so the UI can be developed without a
 * Firebase project. It is never used in a configured build.
 */
import type { Part } from 'firebase/ai';
import type { CallResult, Mode, Where } from './ai';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function whereFor(mode: Mode): Where {
  const device = localStorage.getItem('plainly:mockDevice') ?? 'available';
  if (mode === 'only_on_device') return 'on-device';
  if (mode === 'only_in_cloud') return 'cloud';
  if (mode === 'prefer_on_device') return device === 'available' ? 'on-device' : 'cloud';
  return navigator.onLine ? 'cloud' : 'on-device';
}

function promptText(p: string | (string | Part)[]): string {
  return typeof p === 'string' ? p : p.map((x) => (typeof x === 'string' ? x : '')).join('\n');
}

function docOf(p: string) {
  const m = p.match(/"""\n([\s\S]*?)\n"""/);
  return m ? m[1] : p;
}

export async function mockJSON<T>(task: string, prompt: string | (string | Part)[], mode: Mode): Promise<CallResult<T>> {
  const t0 = performance.now();
  const where = whereFor(mode);
  await sleep(where === 'on-device' ? 500 : 900);
  const doc = docOf(promptText(prompt));
  let data: unknown;
  if (task === 'pii') {
    const names = [...doc.matchAll(/caseworker, Ms\. ([A-Z][a-z]+ [A-Z][a-z]+)/g)].map((m) => ({ text: m[1], type: 'person name' }));
    data = { entities: names };
  } else if (task === 'notes') {
    data = { notes: doc.split(/\n+/).filter((l) => /\$|\d{4}|must|deadline|right/i.test(l)).slice(0, 6) };
  } else {
    const amounts = [...doc.matchAll(/([A-Za-z ,()]{4,40}?)[:\s]+(\$[\d,]+\.\d{2})/g)].slice(-4);
    const dueDates = [...doc.matchAll(/((?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, \d{4})/g)].map((m) => m[1]);
    const iso = (d: string) => new Date(d + ' 12:00').toISOString().slice(0, 10);
    const first = doc.split('\n').find((l) => l.trim().length > 6)?.trim() ?? 'Document';
    data = {
      title: first.length > 60 ? first.slice(0, 57) + '…' : first,
      docType: 'Letter',
      sender: first.split('—')[0].trim(),
      urgency: dueDates.length ? 'high' : 'medium',
      summary: '(Demo mode: this is a fake explanation so the interface can be tried without Firebase.) This letter asks you to take action before a deadline. Read the steps below and contact the sender if anything is unclear. [NAME_1] is how the letter refers to you.',
      keyPoints: doc.split('\n').filter((l) => /\$|must|may|right/i.test(l)).slice(0, 4).map((l) => l.trim()),
      actions: dueDates.slice(-2).map((d, i) => ({ task: i === 0 ? 'Respond or pay by this date' : 'Check this second date', deadline: iso(d), why: 'The letter names this date.' })),
      money: amounts.map((m) => ({ label: m[1].trim(), amount: m[2] })),
      questions: ['Can I get an itemized breakdown?', 'Is there a payment plan or financial help?'],
      watchOut: ['Look for appeal or hearing rights and their deadlines.'],
    };
  }
  return { data: data as T, where, ms: Math.round(performance.now() - t0) };
}

export async function mockStream(task: string, prompt: string | (string | Part)[], mode: Mode, onChunk: (t: string) => void): Promise<CallResult<string>> {
  const t0 = performance.now();
  const where = whereFor(mode);
  const text =
    task === 'reply'
      ? `Dear Sir or Madam,\n\nI am writing about account [ID_1]. I received your letter and would like to discuss my options, including a payment plan and any financial assistance you offer.\n\nPlease send me an itemized statement and information about how to apply.\n\nSincerely,\n[NAME_1]\n[ADDRESS_1]`
      : task === 'transcribe'
        ? 'Demo mode: photo transcription needs Gemini Nano or the cloud.'
        : '(Demo mode answer.) Based on the letter, the most important thing is the deadline. If you cannot meet it, call the number on the letter and ask about your options.';
  let out = '';
  for (const word of text.split(/(\s+)/)) {
    out += word;
    onChunk(out);
    await sleep(where === 'on-device' ? 12 : 20);
  }
  return { data: out, where, ms: Math.round(performance.now() - t0) };
}
