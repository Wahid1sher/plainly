import { describe, expect, it } from 'vitest';
import { chunkText, decideRoute, type RouteInput } from './router';

const base: RouteInput = {
  privacy: 'balanced',
  device: 'available',
  chars: 2000,
  maxOnDeviceChars: 6000,
  outLang: 'en',
  onDeviceLangs: ['en', 'es', 'ja'],
  online: true,
};

describe('Privacy Router', () => {
  it('Balanced + short + Nano ready → prefer on-device', () => {
    expect(decideRoute(base)).toMatchObject({ mode: 'prefer_on_device', expected: 'on-device' });
  });
  it('Balanced + long → cloud', () => {
    expect(decideRoute({ ...base, chars: 9000 })).toMatchObject({ mode: 'only_in_cloud', expected: 'cloud' });
  });
  it('Balanced + language Nano cannot write → cloud', () => {
    expect(decideRoute({ ...base, outLang: 'fa' })).toMatchObject({ mode: 'only_in_cloud' });
  });
  it('Balanced + no Nano → cloud', () => {
    expect(decideRoute({ ...base, device: 'unsupported' })).toMatchObject({ mode: 'only_in_cloud' });
  });
  it('Balanced + offline → on-device only', () => {
    expect(decideRoute({ ...base, online: false })).toMatchObject({ mode: 'only_on_device', strategy: 'single' });
  });
  it('Strict local + long → on-device map-reduce, never cloud', () => {
    expect(decideRoute({ ...base, privacy: 'local', chars: 20000 })).toMatchObject({ mode: 'only_on_device', strategy: 'local-map-reduce' });
  });
  it('Strict local + no Nano → blocked', () => {
    expect(decideRoute({ ...base, privacy: 'local', device: 'downloadable' }).strategy).toBe('blocked');
  });
  it('Strict local + unsupported language → English on-device', () => {
    expect(decideRoute({ ...base, privacy: 'local', outLang: 'fa' })).toMatchObject({ outLang: 'en', mode: 'only_on_device' });
  });
  it('Best quality → prefer cloud', () => {
    expect(decideRoute({ ...base, privacy: 'cloud' }).mode).toBe('prefer_in_cloud');
  });
});

describe('chunkText', () => {
  it('splits on paragraphs and respects size', () => {
    const text = Array.from({ length: 10 }, (_, i) => `Paragraph ${i} `.repeat(20)).join('\n\n');
    const chunks = chunkText(text, 700);
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((c) => c.length <= 700)).toBe(true);
    expect(chunks.join('\n\n')).toBe(text);
  });
});
