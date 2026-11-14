import { useState } from 'react';
import { enableOnDevice, type DeviceState } from '../lib/ai';
import { PRIVACY_MODES, type PrivacyMode } from '../lib/router';

interface Props {
  device: DeviceState;
  online: boolean;
  privacy: PrivacyMode;
  onPrivacy: (p: PrivacyMode) => void;
  onDeviceChanged: () => void;
  historyCount: number;
  onHistory: () => void;
  onHome: () => void;
}

const DEVICE_TEXT: Record<DeviceState, string> = {
  available: 'Gemini Nano ready',
  downloadable: 'Gemini Nano can be turned on',
  downloading: 'Gemini Nano downloading…',
  unavailable: 'On-device AI not available',
  unsupported: 'On-device AI not supported in this browser',
};

export function Header(p: Props) {
  const [progress, setProgress] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const enable = async () => {
    setErr(null);
    setProgress(0);
    try {
      await enableOnDevice((v) => setProgress(v));
      p.onDeviceChanged();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setProgress(null);
    }
  };

  const ready = p.device === 'available';
  const canEnable = p.device === 'downloadable' || p.device === 'downloading';

  return (
    <header className="header">
      <button className="brand" onClick={p.onHome} aria-label="Plainly home">
        <img src="/icon.svg" alt="" width={32} height={32} />
        <span>Plainly</span>
      </button>

      <div className="header-mid">
        <div className="seg" role="radiogroup" aria-label="Privacy mode">
          {PRIVACY_MODES.map((m) => (
            <button key={m.id} role="radio" aria-checked={p.privacy === m.id} className={p.privacy === m.id ? 'on' : ''} title={m.blurb} onClick={() => p.onPrivacy(m.id)}>
              {m.id === 'local' ? '🔒 ' : m.id === 'balanced' ? '⚖️ ' : '☁️ '}
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="header-right">
        <span className={`chip ${ready ? 'chip-device' : 'chip-muted'}`} title={DEVICE_TEXT[p.device]}>
          <span className={`dot ${ready ? 'dot-green' : canEnable ? 'dot-amber' : 'dot-grey'}`} />
          {progress !== null ? `Downloading ${Math.round(progress * 100)}%` : DEVICE_TEXT[p.device]}
        </span>
        {canEnable && progress === null && (
          <button className="btn btn-small" onClick={enable}>
            Turn on
          </button>
        )}
        {!p.online && <span className="chip chip-warn">Offline</span>}
        <button className="btn btn-ghost btn-small" onClick={p.onHistory}>
          Saved{p.historyCount ? ` (${p.historyCount})` : ''}
        </button>
      </div>
      {err && <div className="header-err">Couldn't turn on Gemini Nano: {err}</div>}
      <div className="privacy-blurb">{PRIVACY_MODES.find((m) => m.id === p.privacy)?.blurb}</div>
    </header>
  );
}
