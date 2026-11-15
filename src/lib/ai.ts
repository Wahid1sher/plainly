/**
 * Hybrid inference engine. Every AI call in Plainly goes through Firebase AI Logic's
 * getGenerativeModel() with an explicit InferenceMode, and we record where it actually
 * ran (response.inferenceSource) so the UI can show an honest trace.
 */
import { getGenerativeModel, InferenceMode, type GenerativeModel, type Part } from 'firebase/ai';
import { getAIInstance, MOCK_AI } from './firebase';
import { mockJSON, mockStream } from './mock';

export type Mode = (typeof InferenceMode)[keyof typeof InferenceMode];
export { InferenceMode };

export type Where = 'on-device' | 'cloud';

export interface CallResult<T> {
  data: T;
  where: Where;
  ms: number;
}

/** Output languages Gemini Nano in Chrome can currently write. Others are routed to the cloud. */
export const ON_DEVICE_LANGS = ['en', 'es', 'ja'];

export type DeviceState = 'available' | 'downloadable' | 'downloading' | 'unavailable' | 'unsupported' | 'stalled';

// ---------- Stall protection ----------
// Chrome can report Gemini Nano as "available" while its on-device service is hung. Every call that may
// run on-device is raced against a timeout; after a stall, Nano is skipped for the rest of the session so
// Balanced mode goes straight to the cloud (still on redacted text) instead of making the user wait again.

export class OnDeviceTimeoutError extends Error {
  constructor(seconds: number) {
    super(`Gemini Nano did not respond within ${seconds}s. Restarting Chrome usually fixes this.`);
    this.name = 'OnDeviceTimeoutError';
  }
}

let onDeviceTimeoutMs = 45_000;
export function setOnDeviceTimeout(ms: number) {
  if (ms > 0) onDeviceTimeoutMs = ms;
}

let stalled = false;
const stallListeners = new Set<() => void>();
export function isDeviceStalled() {
  return stalled;
}
export function onDeviceStall(cb: () => void) {
  stallListeners.add(cb);
  return () => stallListeners.delete(cb);
}
function markStalled() {
  if (stalled) return;
  stalled = true;
  stallListeners.forEach((cb) => cb());
}

/** Resolves with the promise, or rejects if no progress is reported within the on-device budget. */
function guard<T>(mode: Mode, run: (progress: () => void) => Promise<T>): Promise<T> {
  if (mode === 'only_in_cloud') return run(() => {});
  return new Promise<T>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        markStalled();
        reject(new OnDeviceTimeoutError(Math.round(onDeviceTimeoutMs / 1000)));
      }, onDeviceTimeoutMs);
    };
    arm();
    run(arm).then(
      (v) => (clearTimeout(timer), resolve(v)),
      (e) => (clearTimeout(timer), reject(e))
    );
  });
}

interface LanguageModelStatic {
  availability(opts?: object): Promise<string>;
}

function languageModelApi(): LanguageModelStatic | undefined {
  return (globalThis as unknown as { LanguageModel?: LanguageModelStatic }).LanguageModel;
}

/** Asks Chrome directly whether Gemini Nano is ready, so the UI can show status before any call. */
export async function getDeviceState(): Promise<DeviceState> {
  if (MOCK_AI) return (localStorage.getItem('plainly:mockDevice') as DeviceState) || 'available';
  const lm = languageModelApi();
  if (!lm) return 'unsupported';
  if (stalled) return 'stalled';
  try {
    const a = await lm.availability({
      expectedInputs: [{ type: 'text', languages: ['en'] }],
      expectedOutputs: [{ type: 'text', languages: ['en'] }],
    });
    if (a === 'available' || a === 'downloadable' || a === 'downloading') return a;
    return 'unavailable';
  } catch {
    return 'unavailable';
  }
}

let cloudModel = 'gemini-3.5-flash-lite';
export function setCloudModel(name: string) {
  cloudModel = name;
}

interface ModelOptions {
  mode: Mode;
  /** JSON schema used both as the cloud responseJsonSchema and the on-device responseConstraint. */
  schema?: object;
  outLang?: string;
  image?: boolean;
  temperature?: number;
}

/**
 * Models are cached per configuration. Each GenerativeModel's Chrome adapter keeps its last Gemini Nano
 * session alive and destroys it only when that same model creates the next one. Building a fresh model per
 * call leaked one live on-device session per request, and after a few runs Chrome's on-device service hung.
 */
const modelCache = new Map<string, GenerativeModel>();

function buildModel(o: ModelOptions): GenerativeModel {
  const lang = o.outLang && ON_DEVICE_LANGS.includes(o.outLang) ? o.outLang : 'en';
  const key = JSON.stringify([o.mode, lang, !!o.image, o.temperature ?? 0.2, cloudModel, o.schema ?? null]);
  const cached = modelCache.get(key);
  if (cached) return cached;
  const model = createModel(o, lang);
  modelCache.set(key, model);
  return model;
}

function createModel(o: ModelOptions, lang: string): GenerativeModel {
  return getGenerativeModel(getAIInstance(), {
    mode: o.mode,
    inCloudParams: {
      model: cloudModel,
      generationConfig: {
        temperature: o.temperature ?? 0.2,
        ...(o.schema ? { responseMimeType: 'application/json', responseJsonSchema: o.schema as Record<string, unknown> } : {}),
      },
    },
    onDeviceParams: {
      createOptions: {
        expectedInputs: o.image ? [{ type: 'text', languages: ['en'] }, { type: 'image' }] : [{ type: 'text', languages: ['en'] }],
        expectedOutputs: [{ type: 'text', languages: [lang] }],
      },
      promptOptions: o.schema ? { responseConstraint: o.schema } : undefined,
    },
  });
}

/** Downloads Gemini Nano. Must be called from a user gesture (Chrome requirement). */
export async function enableOnDevice(onProgress: (p: number) => void): Promise<void> {
  if (MOCK_AI) {
    for (let i = 1; i <= 10; i++) {
      await new Promise((r) => setTimeout(r, 120));
      onProgress(i / 10);
    }
    localStorage.setItem('plainly:mockDevice', 'available');
    return;
  }
  await buildModel({ mode: InferenceMode.PREFER_ON_DEVICE }).initializeDeviceModel(onProgress);
}

function whereFrom(source: string | undefined, mode: Mode): Where {
  if (source === 'on_device') return 'on-device';
  if (source === 'in_cloud') return 'cloud';
  return mode === InferenceMode.ONLY_ON_DEVICE ? 'on-device' : 'cloud';
}

export function parseJSON<T>(text: string): T {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1)) as T;
    throw new Error('The model returned something that was not valid JSON.');
  }
}

/** One structured call. */
export async function generateJSON<T>(task: string, prompt: string | (string | Part)[], o: ModelOptions): Promise<CallResult<T>> {
  const t0 = performance.now();
  if (MOCK_AI) return mockJSON<T>(task, prompt, o.mode);
  const res = await guard(o.mode, () => buildModel(o).generateContent(prompt));
  const data = parseJSON<T>(res.response.text());
  return { data, where: whereFrom(res.response.inferenceSource, o.mode), ms: Math.round(performance.now() - t0) };
}

/** One free-text call, streamed. */
export async function generateText(
  task: string,
  prompt: string | (string | Part)[],
  o: ModelOptions,
  onChunk: (textSoFar: string) => void
): Promise<CallResult<string>> {
  const t0 = performance.now();
  if (MOCK_AI) return mockStream(task, prompt, o.mode, onChunk);
  // Idle timeout: each streamed chunk resets the clock, so long answers are fine; a hung model is not.
  let text = '';
  const final = await guard(o.mode, async (progress) => {
    const res = await buildModel({ ...o, schema: undefined }).generateContentStream(prompt);
    for await (const chunk of res.stream) {
      progress();
      text += chunk.text();
      onChunk(text);
    }
    return res.response;
  });
  return { data: text, where: whereFrom(final.inferenceSource, o.mode), ms: Math.round(performance.now() - t0) };
}
