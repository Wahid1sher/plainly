import { useRef, useState } from 'react';
import type { DeviceState } from '../lib/ai';
import { transcribePhoto } from '../lib/pipeline';
import { LANGUAGES, type ReadingLevel } from '../lib/prompts';
import type { PrivacyMode } from '../lib/router';
import { SAMPLES } from '../lib/samples';

interface Props {
  busy: boolean;
  device: DeviceState;
  online: boolean;
  level: ReadingLevel;
  onLevel: (l: ReadingLevel) => void;
  outLang: string;
  onLang: (l: string) => void;
  privacy: PrivacyMode;
  onSubmit: (text: string) => void;
}

export function Composer(p: Props) {
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoState, setPhotoState] = useState<'idle' | 'consent' | 'reading'>('idle');
  const [photoErr, setPhotoErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const readPhoto = async (file: File, allowCloud: boolean) => {
    setPhotoState('reading');
    setPhotoErr(null);
    try {
      const r = await transcribePhoto(file, allowCloud, (t) => setText(t));
      setText(r.data.trim());
    } catch (e) {
      setPhotoErr(`Couldn't read the photo: ${(e as Error).message}`);
    } finally {
      setPhotoState('idle');
      setPhoto(null);
    }
  };

  const onFile = async (file: File) => {
    if (file.type.startsWith('image/')) {
      if (p.device === 'available') return readPhoto(file, false);
      if (p.privacy === 'local') {
        setPhotoErr('Strict local is on and Gemini Nano is not ready, so photos cannot be read. Paste the text instead.');
        return;
      }
      setPhoto(file);
      setPhotoState('consent');
      return;
    }
    setText(await file.text());
  };

  const chars = text.trim().length;

  return (
    <section className="composer card">
      <div className="hero">
        <h1>Understand any letter, bill or notice.</h1>
        <p>
          Paste it below. Plainly hides your personal details <strong>on this device</strong> first, then explains what it means, what you need to do and by
          when.
        </p>
      </div>

      <div className="samples">
        <span className="muted">Try an example:</span>
        {SAMPLES.map((s) => (
          <button key={s.id} className="pill" onClick={() => setText(s.text)} disabled={p.busy}>
            {s.emoji} {s.label}
          </button>
        ))}
      </div>

      <label className="sr-only" htmlFor="doc">
        Document text
      </label>
      <textarea
        id="doc"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste the text of your letter, bill, lease or notice here…"
        rows={12}
        disabled={p.busy || photoState === 'reading'}
      />

      {photoState === 'consent' && photo && (
        <div className="notice notice-warn" role="alertdialog" aria-label="Photo needs the cloud">
          <p>
            <strong>Gemini Nano isn't ready on this device</strong>, so the photo can't be read locally. Reading it in the cloud means the{' '}
            <strong>unredacted image</strong> is sent to Google's Gemini API. Personal details in it will not be hidden.
          </p>
          <div className="row">
            <button className="btn btn-small" onClick={() => readPhoto(photo, true)}>
              Send photo to cloud
            </button>
            <button className="btn btn-ghost btn-small" onClick={() => (setPhoto(null), setPhotoState('idle'))}>
              Cancel, I'll paste the text
            </button>
          </div>
        </div>
      )}
      {photoErr && <div className="notice notice-error">{photoErr}</div>}

      <div className="composer-bar">
        <div className="row wrap">
          <button className="btn btn-ghost btn-small" onClick={() => fileRef.current?.click()} disabled={p.busy || photoState === 'reading'}>
            {photoState === 'reading' ? 'Reading photo on-device…' : '📷 Photo or file'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,.txt,.md,text/plain"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = '';
            }}
          />
          <label className="field">
            <span>Reading level</span>
            <select value={p.level} onChange={(e) => p.onLevel(e.target.value as ReadingLevel)}>
              <option value="standard">Standard</option>
              <option value="simple">Very simple</option>
            </select>
          </label>
          <label className="field">
            <span>Explain in</span>
            <select value={p.outLang} onChange={(e) => p.onLang(e.target.value)}>
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="row">
          <span className="muted small">{chars ? `${chars.toLocaleString()} characters` : ''}</span>
          <button className="btn btn-primary" disabled={!chars || p.busy} onClick={() => p.onSubmit(text.trim())}>
            {p.busy ? 'Working…' : 'Explain it'}
          </button>
        </div>
      </div>
    </section>
  );
}
