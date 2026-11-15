/**
 * The Privacy Router: decides, per request, which Firebase AI Logic InferenceMode to use.
 * Pure function, so the policy is easy to read, test and explain to users.
 */
import type { DeviceState, Mode } from './ai';

export type PrivacyMode = 'local' | 'balanced' | 'cloud';

export const PRIVACY_MODES: { id: PrivacyMode; label: string; blurb: string }[] = [
  { id: 'local', label: 'Strict local', blurb: 'Nothing leaves this device. Uses Gemini Nano only.' },
  { id: 'balanced', label: 'Balanced', blurb: 'On-device first. Long or complex jobs go to the cloud with personal details hidden.' },
  { id: 'cloud', label: 'Best quality', blurb: 'Cloud first, still with personal details hidden. Falls back to the device when offline.' },
];

export interface RouteInput {
  privacy: PrivacyMode;
  device: DeviceState;
  chars: number;
  maxOnDeviceChars: number;
  outLang: string;
  onDeviceLangs: string[];
  online: boolean;
}

export type Strategy = 'single' | 'local-map-reduce' | 'blocked';

export interface Route {
  mode: Mode;
  strategy: Strategy;
  /** Where we expect it to run; the SDK reports where it actually ran. */
  expected: 'on-device' | 'cloud';
  reason: string;
  /** Output language actually used (may fall back to English in Strict local). */
  outLang: string;
}

const M = {
  PREFER_ON_DEVICE: 'prefer_on_device',
  ONLY_ON_DEVICE: 'only_on_device',
  ONLY_IN_CLOUD: 'only_in_cloud',
  PREFER_IN_CLOUD: 'prefer_in_cloud',
} as const;

export function decideRoute(i: RouteInput): Route {
  const deviceReady = i.device === 'available';
  const fits = i.chars <= i.maxOnDeviceChars;
  const langOk = i.onDeviceLangs.includes(i.outLang);

  if (i.privacy === 'local') {
    if (!deviceReady) {
      return {
        mode: M.ONLY_ON_DEVICE,
        strategy: 'blocked',
        expected: 'on-device',
        reason:
          i.device === 'stalled'
            ? 'Gemini Nano stopped responding in this browser. Restart Chrome, or switch to Balanced to use the cloud with personal details hidden.'
            : 'Strict local needs Gemini Nano, which is not ready on this device. Turn it on, or switch to Balanced.',
        outLang: i.outLang,
      };
    }
    const outLang = langOk ? i.outLang : 'en';
    const langNote = langOk ? '' : ' Gemini Nano cannot write this language yet, so the answer is in English.';
    if (!fits) {
      return {
        mode: M.ONLY_ON_DEVICE,
        strategy: 'local-map-reduce',
        expected: 'on-device',
        reason: `Long document (${i.chars.toLocaleString()} chars). Splitting it into parts and reading each one on-device, so nothing leaves this device.${langNote}`,
        outLang,
      };
    }
    return { mode: M.ONLY_ON_DEVICE, strategy: 'single', expected: 'on-device', reason: `Strict local: explained by Gemini Nano on this device.${langNote}`, outLang };
  }

  if (i.privacy === 'cloud') {
    return {
      mode: M.PREFER_IN_CLOUD,
      strategy: 'single',
      expected: i.online ? 'cloud' : 'on-device',
      reason: i.online
        ? 'Best quality: sent to the cloud with personal details already hidden.'
        : 'Offline, so the SDK falls back to Gemini Nano on this device.',
      outLang: i.outLang,
    };
  }

  // Balanced
  if (!i.online) {
    return {
      mode: M.ONLY_ON_DEVICE,
      strategy: deviceReady ? (fits ? 'single' : 'local-map-reduce') : 'blocked',
      expected: 'on-device',
      reason: deviceReady ? 'Offline: explained on-device.' : 'Offline and Gemini Nano is not ready on this device, so this cannot run right now.',
      outLang: langOk ? i.outLang : 'en',
    };
  }
  if (deviceReady && fits && langOk) {
    return {
      mode: M.PREFER_ON_DEVICE,
      strategy: 'single',
      expected: 'on-device',
      reason: `Short document (${i.chars.toLocaleString()} chars): Gemini Nano on this device. If it can't run, the SDK falls back to the cloud.`,
      outLang: i.outLang,
    };
  }
  const why = !deviceReady
    ? i.device === 'stalled'
      ? 'Gemini Nano stopped responding in this browser'
      : 'Gemini Nano is not ready on this device'
    : !fits
      ? `the document is long (${i.chars.toLocaleString()} chars, on-device limit ${i.maxOnDeviceChars.toLocaleString()})`
      : 'Gemini Nano cannot write this language yet';
  return {
    mode: M.ONLY_IN_CLOUD,
    strategy: 'single',
    expected: 'cloud',
    reason: `Cloud, because ${why}. Only the version with personal details hidden is sent.`,
    outLang: i.outLang,
  };
}

/** Splits text on paragraph boundaries into chunks of roughly `size` characters. */
export function chunkText(text: string, size: number): string[] {
  const paras = text.split(/\n\s*\n/);
  const chunks: string[] = [];
  let cur = '';
  for (const p of paras) {
    if (cur && cur.length + p.length + 2 > size) {
      chunks.push(cur);
      cur = '';
    }
    if (p.length > size) {
      for (let i = 0; i < p.length; i += size) chunks.push(p.slice(i, i + size));
      continue;
    }
    cur = cur ? `${cur}\n\n${p}` : p;
  }
  if (cur) chunks.push(cur);
  return chunks;
}
