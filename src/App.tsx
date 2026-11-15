import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { getDeviceState, onDeviceStall, setCloudModel, setOnDeviceTimeout, type DeviceState } from './lib/ai';
import { DEFAULT_CONFIG, IS_CONFIGURED, loadRuntimeConfig, MOCK_AI, watchUser, type RuntimeConfig } from './lib/firebase';
import { analyze, type Analysis, type Progress as ProgressFn, type Settings } from './lib/pipeline';
import type { ReadingLevel } from './lib/prompts';
import type { PrivacyMode } from './lib/router';
import { deleteAnalysis, listAnalyses, saveAnalysis } from './lib/store';
import { Header } from './components/Header';
import { Composer } from './components/Composer';
import { ProgressView, type LiveStep } from './components/ProgressView';
import { ResultView } from './components/ResultView';
import { HistoryList } from './components/HistoryList';
import { SetupScreen } from './components/SetupScreen';

function usePref<T extends string>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      return (localStorage.getItem(key) as T) || initial;
    } catch {
      return initial;
    }
  });
  const set = (nv: T) => {
    setV(nv);
    try {
      localStorage.setItem(key, nv);
    } catch {
      /* ignore */
    }
  };
  return [v, set];
}

export default function App() {
  const [config, setConfig] = useState<RuntimeConfig>(DEFAULT_CONFIG);
  const [device, setDevice] = useState<DeviceState>('unsupported');
  const [online, setOnline] = useState(navigator.onLine);
  const [user, setUser] = useState<User | null>(null);
  const [privacy, setPrivacy] = usePref<PrivacyMode>('plainly:privacy', DEFAULT_CONFIG.defaultPrivacyMode);
  const [level, setLevel] = usePref<ReadingLevel>('plainly:level', 'standard');
  const [outLang, setOutLang] = usePref<string>('plainly:lang', 'en');

  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<LiveStep[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<Analysis | null>(null);
  const [history, setHistory] = useState<Analysis[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const refreshDevice = useCallback(() => getDeviceState().then(setDevice), []);

  useEffect(() => {
    refreshDevice();
    loadRuntimeConfig().then((c) => {
      setConfig(c);
      setCloudModel(c.cloudModel);
      setOnDeviceTimeout(c.onDeviceTimeoutMs);
      if (!localStorage.getItem('plainly:privacy')) setPrivacy(c.defaultPrivacyMode);
    });
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    const unsub = watchUser(setUser);
    const unsubStall = onDeviceStall(() => setDevice('stalled'));
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      unsub();
      unsubStall();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const uid = user?.uid ?? null;
  useEffect(() => {
    listAnalyses(uid).then(setHistory).catch(() => setHistory([]));
  }, [uid]);

  const settings: Settings = useMemo(() => ({ privacy, level, outLang, device, online, config }), [privacy, level, outLang, device, online, config]);

  const currentRef = useRef<Analysis | null>(null);
  currentRef.current = current;

  const persist = useCallback(
    (a: Analysis) => {
      currentRef.current = a;
      setCurrent(a);
      setHistory((h) => [a, ...h.filter((x) => x.id !== a.id)]);
      saveAnalysis(uid, a).catch((e) => console.warn('Save failed', e));
    },
    [uid]
  );

  /** Applies a change to the open analysis using its latest state, so parallel updates (Q&A + reply) don't overwrite each other. */
  const update = useCallback(
    (fn: (a: Analysis) => Analysis) => {
      if (currentRef.current) persist(fn(currentRef.current));
    },
    [persist]
  );

  const run = async (text: string) => {
    setBusy(true);
    setError(null);
    setCurrent(null);
    setSteps([]);
    const progress: ProgressFn = (s) =>
      setSteps((prev) => {
        const i = prev.findIndex((p) => p.id === s.id);
        const next: LiveStep = { ...s };
        if (i === -1) return [...prev, next];
        const copy = [...prev];
        copy[i] = next;
        return copy;
      });
    try {
      const a = await analyze(text, settings, progress);
      persist(a);
    } catch (e) {
      setError((e as Error).message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  if (!IS_CONFIGURED && !MOCK_AI) return <SetupScreen />;

  return (
    <div className="app">
      <Header
        device={device}
        online={online}
        privacy={privacy}
        onPrivacy={setPrivacy}
        onDeviceChanged={refreshDevice}
        historyCount={history.length}
        onHistory={() => setShowHistory((v) => !v)}
        onHome={() => {
          setCurrent(null);
          setSteps([]);
          setError(null);
        }}
      />
      {showHistory && (
        <HistoryList
          items={history}
          onOpen={(a) => {
            setCurrent(a);
            setSteps([]);
            setShowHistory(false);
          }}
          onDelete={async (id) => {
            await deleteAnalysis(uid, id).catch(() => {});
            setHistory((h) => h.filter((x) => x.id !== id));
            if (current?.id === id) setCurrent(null);
          }}
          onClose={() => setShowHistory(false)}
        />
      )}
      <main className="main">
        {!current && (
          <Composer
            busy={busy}
            device={device}
            online={online}
            level={level}
            onLevel={setLevel}
            outLang={outLang}
            onLang={setOutLang}
            privacy={privacy}
            onSubmit={run}
          />
        )}
        {(busy || error || (steps.length > 0 && !current)) && <ProgressView steps={steps} busy={busy} error={error} />}
        {current && <ResultView key={current.id} analysis={current} settings={settings} onUpdate={update} onNew={() => setCurrent(null)} />}
      </main>
      <footer className="footer">
        <span>
          Plainly explains documents; it does not give legal, medical or financial advice. Built with Firebase AI Logic hybrid inference
          {MOCK_AI ? ' · DEMO MODE (fake AI)' : ''}.
        </span>
      </footer>
    </div>
  );
}
