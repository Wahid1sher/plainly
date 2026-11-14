/**
 * Plainly's pipeline:
 *   1. Privacy Shield  - rules + Gemini Nano (ONLY_ON_DEVICE) find personal details; they are swapped for placeholders.
 *   2. Privacy Router  - picks an InferenceMode from privacy mode, device state, length, language and connectivity.
 *   3. Explain         - Firebase AI Logic hybrid call on the redacted text (or on-device map-reduce for long docs).
 * Results are re-hydrated locally, so the user sees their own details and the cloud never does.
 */
import { generateJSON, generateText, InferenceMode, ON_DEVICE_LANGS, type DeviceState, type Mode, type Where } from './ai';
import type { RuntimeConfig } from './firebase';
import {
  askPrompt,
  chunkNotesPrompt,
  EXPLAIN_SCHEMA,
  explainPrompt,
  NOTES_SCHEMA,
  PII_SCHEMA,
  piiPrompt,
  replyPrompt,
  TRANSCRIBE_PROMPT,
  type Explanation,
  type ReadingLevel,
  type ReplyKind,
} from './prompts';
import { applyRedaction, detectWithRules, locate, mergeFindings, type Vault } from './redact';
import { chunkText, decideRoute, type PrivacyMode, type Route } from './router';

export interface TraceStep {
  id: string;
  label: string;
  where: Where | 'rules';
  ms: number;
  detail: string;
}

export interface QA {
  q: string;
  a: string;
  where: Where;
}

export interface Analysis {
  id: string;
  createdAt: number;
  title: string;
  redacted: string;
  vault: Vault;
  explanation: Explanation;
  trace: TraceStep[];
  route: Route;
  privacy: PrivacyMode;
  level: ReadingLevel;
  outLang: string;
  qa: QA[];
  reply?: { kind: ReplyKind; text: string; where: Where };
}

export interface Settings {
  privacy: PrivacyMode;
  level: ReadingLevel;
  outLang: string;
  device: DeviceState;
  online: boolean;
  config: RuntimeConfig;
}

export type Progress = (step: { id: string; label: string; status: 'running' | 'done'; detail?: string; where?: TraceStep['where'] }) => void;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function normalise(e: Partial<Explanation>): Explanation {
  const arr = <T,>(v: T[] | undefined) => (Array.isArray(v) ? v : []);
  return {
    title: e.title || 'Your document',
    docType: e.docType || '',
    sender: e.sender || '',
    urgency: e.urgency === 'high' || e.urgency === 'low' ? e.urgency : 'medium',
    summary: e.summary || '',
    keyPoints: arr(e.keyPoints),
    actions: arr(e.actions).map((a) => ({ task: a.task || '', deadline: /^\d{4}-\d{2}-\d{2}$/.test(a.deadline || '') ? a.deadline : '', why: a.why || '' })),
    money: arr(e.money),
    questions: arr(e.questions),
    watchOut: arr(e.watchOut),
  };
}

// ---------- 1. Privacy Shield ----------

export async function shield(text: string, s: Settings, progress: Progress) {
  const steps: TraceStep[] = [];
  progress({ id: 'shield', label: 'Hiding personal details', status: 'running' });

  let t0 = performance.now();
  const ruleFindings = detectWithRules(text);
  steps.push({ id: 'shield-rules', label: 'Pattern check', where: 'rules', ms: Math.round(performance.now() - t0), detail: `${ruleFindings.length} details found by local pattern rules` });

  let modelFindings: ReturnType<typeof locate> = [];
  if (s.config.onDeviceShield && s.device === 'available') {
    t0 = performance.now();
    try {
      // Always ONLY_ON_DEVICE: the raw document must never be sent to the cloud.
      const partial = applyRedaction(text, ruleFindings).redacted;
      for (const chunk of chunkText(partial, s.config.localChunkChars)) {
        const r = await generateJSON<{ entities: { text: string; type: string }[] }>('pii', piiPrompt(chunk), {
          mode: InferenceMode.ONLY_ON_DEVICE,
          schema: PII_SCHEMA,
          temperature: 0,
        });
        modelFindings.push(...locate(text, r.data.entities ?? []));
      }
      steps.push({ id: 'shield-nano', label: 'Gemini Nano check', where: 'on-device', ms: Math.round(performance.now() - t0), detail: `Gemini Nano found ${modelFindings.length} more` });
    } catch (err) {
      modelFindings = [];
      steps.push({ id: 'shield-nano', label: 'Gemini Nano check', where: 'on-device', ms: Math.round(performance.now() - t0), detail: `Skipped (${(err as Error).message}). Pattern rules still applied.` });
    }
  } else {
    steps.push({ id: 'shield-nano', label: 'Gemini Nano check', where: 'rules', ms: 0, detail: 'Gemini Nano not ready, so only pattern rules were used. Review what will be sent below.' });
  }

  const result = applyRedaction(text, mergeFindings(ruleFindings, modelFindings));
  progress({ id: 'shield', label: 'Hiding personal details', status: 'done', detail: `${Object.keys(result.vault).length} personal details hidden`, where: modelFindings.length || s.device === 'available' ? 'on-device' : 'rules' });
  return { ...result, steps };
}

// ---------- 2 + 3. Route and explain ----------

export function route(redacted: string, s: Settings): Route {
  return decideRoute({
    privacy: s.privacy,
    device: s.device,
    chars: redacted.length,
    maxOnDeviceChars: s.config.onDeviceMaxChars,
    outLang: s.outLang,
    onDeviceLangs: ON_DEVICE_LANGS,
    online: s.online,
  });
}

async function withCloudRetry<T>(r: Route, run: (mode: Mode) => Promise<T>, onRetry: () => void): Promise<T> {
  try {
    return await run(r.mode);
  } catch (err) {
    // Balanced mode only: if Gemini Nano fails mid-request (e.g. malformed JSON), retry in the cloud on the redacted text.
    if (r.mode === InferenceMode.PREFER_ON_DEVICE) {
      onRetry();
      return run(InferenceMode.ONLY_IN_CLOUD);
    }
    throw err;
  }
}

export async function explain(redacted: string, r: Route, s: Settings, progress: Progress) {
  const steps: TraceStep[] = [];
  const level = s.level;
  if (r.strategy === 'blocked') throw new Error(r.reason);

  let source = redacted;
  if (r.strategy === 'local-map-reduce') {
    const chunks = chunkText(redacted, s.config.localChunkChars);
    const notes: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      progress({ id: 'explain', label: `Reading part ${i + 1} of ${chunks.length} on-device`, status: 'running' });
      const t0 = performance.now();
      const res = await generateJSON<{ notes: string[] }>('notes', chunkNotesPrompt(chunks[i], i + 1, chunks.length), {
        mode: InferenceMode.ONLY_ON_DEVICE,
        schema: NOTES_SCHEMA,
      });
      notes.push(...(res.data.notes ?? []));
      steps.push({ id: `notes-${i}`, label: `Part ${i + 1}/${chunks.length}`, where: res.where, ms: res.ms, detail: `${res.data.notes?.length ?? 0} notes` });
    }
    source = `(Notes taken from a longer document, in order.)\n- ${notes.join('\n- ')}`.slice(0, s.config.onDeviceMaxChars);
  }

  progress({ id: 'explain', label: 'Explaining in plain language', status: 'running' });
  let retried = false;
  const res = await withCloudRetry(
    r,
    (mode) => generateJSON<Explanation>('explain', explainPrompt(source, level, r.outLang, today()), { mode, schema: EXPLAIN_SCHEMA, outLang: r.outLang }),
    () => {
      retried = true;
      progress({ id: 'explain', label: 'Gemini Nano had trouble, retrying in the cloud (details still hidden)', status: 'running' });
    }
  );
  steps.push({
    id: 'explain',
    label: 'Plain-language explanation',
    where: res.where,
    ms: res.ms,
    detail: retried ? 'Retried in the cloud after an on-device error' : res.where === 'on-device' ? 'Gemini Nano' : 'Gemini in the cloud',
  });
  progress({ id: 'explain', label: 'Explaining in plain language', status: 'done', where: res.where, detail: `${(res.ms / 1000).toFixed(1)}s` });
  return { explanation: normalise(res.data), steps };
}

export async function analyze(text: string, s: Settings, progress: Progress): Promise<Analysis> {
  const sh = await shield(text, s, progress);
  const r = route(sh.redacted, s);
  progress({ id: 'route', label: 'Choosing where to run', status: 'done', detail: r.reason, where: r.strategy === 'blocked' ? undefined : r.expected });
  const ex = await explain(sh.redacted, r, s, progress);
  return {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    title: ex.explanation.title,
    redacted: sh.redacted,
    vault: sh.vault,
    explanation: ex.explanation,
    trace: [...sh.steps, { id: 'route', label: 'Privacy Router', where: 'rules', ms: 0, detail: r.reason }, ...ex.steps],
    route: r,
    privacy: s.privacy,
    level: s.level,
    outLang: r.outLang,
    qa: [],
  };
}

// ---------- Follow-ups ----------

export async function ask(a: Analysis, question: string, s: Settings, onChunk: (t: string) => void) {
  const r = route(a.redacted, { ...s, outLang: a.outLang });
  if (r.strategy === 'blocked') throw new Error(r.reason);
  // Questions use the full document when it fits on-device; in map-reduce mode they use the summary only.
  const doc = r.strategy === 'local-map-reduce' ? a.explanation.keyPoints.join('\n') : a.redacted;
  return withCloudRetry(
    { ...r, mode: r.mode },
    (mode) => generateText('ask', askPrompt(doc, a.explanation.summary, a.qa, question, a.level, a.outLang), { mode, outLang: a.outLang, temperature: 0.3 }, onChunk),
    () => onChunk('')
  );
}

export async function draftReply(a: Analysis, kind: ReplyKind, note: string, s: Settings, onChunk: (t: string) => void) {
  const r = route(a.redacted, { ...s, outLang: a.outLang });
  if (r.strategy === 'blocked') throw new Error(r.reason);
  const doc = r.strategy === 'local-map-reduce' ? a.explanation.keyPoints.join('\n') : a.redacted;
  return withCloudRetry(
    r,
    (mode) => generateText('reply', replyPrompt(doc, a.explanation.summary, kind, note, a.outLang), { mode, outLang: a.outLang, temperature: 0.4 }, onChunk),
    () => onChunk('')
  );
}

/** Reads a photo of a letter. On-device by default; the cloud is used only if the user explicitly agrees. */
export async function transcribePhoto(file: File, allowCloud: boolean, onChunk: (t: string) => void) {
  const base64 = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',')[1]);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
  const mode = allowCloud ? InferenceMode.PREFER_ON_DEVICE : InferenceMode.ONLY_ON_DEVICE;
  return generateText(
    'transcribe',
    [TRANSCRIBE_PROMPT, { type: 'inlineData', inlineData: { data: base64, mimeType: file.type || 'image/jpeg' } }],
    { mode, image: true, temperature: 0 },
    onChunk
  );
}
