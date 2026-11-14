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

export type DeviceState = 'available' | 'downloadable' | 'downloading' | 'unavailable' | 'unsupported';

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

function buildModel(o: ModelOptions): GenerativeModel {
  const lang = o.outLang && ON_DEVICE_LANGS.includes(o.outLang) ? o.outLang : 'en';
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
  const res = await buildModel(o).generateContent(prompt);
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
  const res = await buildModel({ ...o, schema: undefined }).generateContentStream(prompt);
  let text = '';
  for await (const chunk of res.stream) {
    text += chunk.text();
    onChunk(text);
  }
  const final = await res.response;
  return { data: text, where: whereFrom(final.inferenceSource, o.mode), ms: Math.round(performance.now() - t0) };
}
