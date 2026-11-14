import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { buildICS, download } from '../lib/ics';
import { ask, draftReply, type Analysis, type QA, type Settings } from '../lib/pipeline';
import { REPLY_KINDS, type ReplyKind } from '../lib/prompts';
import { rehydrate, type Vault } from '../lib/redact';
import type { Where } from '../lib/ai';
import { WhereBadge } from './WhereBadge';

const Ctx = createContext<{ vault: Vault; reveal: boolean }>({ vault: {}, reveal: true });

/** Renders model text, swapping placeholders for the user's real details (locally) and highlighting them. */
function T({ children }: { children: string }) {
  const { vault, reveal } = useContext(Ctx);
  const parts = children.split(/(\[[A-Z_]+_\d+\])/g);
  return (
    <>
      {parts.map((part, i) => {
        if (!/^\[[A-Z_]+_\d+\]$/.test(part)) return part;
        const hit = vault[part];
        if (!hit) return part;
        return (
          <mark key={i} className={reveal ? 'pii' : 'ph'} title={reveal ? `Shown from this device only. The AI saw ${part}.` : 'Hidden personal detail'}>
            {reveal ? hit.original : part}
          </mark>
        );
      })}
    </>
  );
}

function daysUntil(iso: string) {
  const d = new Date(iso + 'T23:59:59');
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000);
}

function formatDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function Section({ title, children, icon }: { title: string; icon: string; children: ReactNode }) {
  return (
    <section className="card section">
      <h3>
        <span aria-hidden>{icon}</span> {title}
      </h3>
      {children}
    </section>
  );
}

interface Props {
  analysis: Analysis;
  settings: Settings;
  onUpdate: (fn: (a: Analysis) => Analysis) => void;
  onNew: () => void;
}

export function ResultView({ analysis: a, settings, onUpdate, onNew }: Props) {
  const [reveal, setReveal] = useState(true);
  const [done, setDone] = useState<Record<number, boolean>>({});
  const e = a.explanation;
  const ics = useMemo(() => buildICS(rehydrate(e.title, a.vault), e.actions.map((x) => ({ ...x, task: rehydrate(x.task, a.vault) }))), [e, a.vault]);
  const explainStep = a.trace.find((s) => s.id === 'explain');

  return (
    <Ctx.Provider value={{ vault: a.vault, reveal }}>
      <div className="result">
        <div className="result-head">
          <div>
            <div className="row wrap gap-s">
              <span className={`urgency urgency-${e.urgency}`}>{e.urgency === 'high' ? 'Act soon' : e.urgency === 'medium' ? 'Needs attention' : 'For your information'}</span>
              {explainStep && <WhereBadge where={explainStep.where} ms={explainStep.ms} />}
            </div>
            <h2>
              <T>{e.title}</T>
            </h2>
            {(e.docType || e.sender) && (
              <p className="muted">
                <T>{[e.docType, e.sender].filter(Boolean).join(' · ')}</T>
              </p>
            )}
          </div>
          <div className="row gap-s">
            <label className="toggle">
              <input type="checkbox" checked={reveal} onChange={(ev) => setReveal(ev.target.checked)} />
              <span>Show my details</span>
            </label>
            <button className="btn btn-ghost btn-small" onClick={onNew}>
              New document
            </button>
          </div>
        </div>

        <section className="card summary">
          <p>
            <T>{e.summary}</T>
          </p>
        </section>

        <div className="grid">
          <Section title="What to do" icon="✅">
            {e.actions.length === 0 ? (
              <p className="muted">No actions found in this document.</p>
            ) : (
              <ul className="actions">
                {e.actions.map((x, i) => {
                  const left = x.deadline ? daysUntil(x.deadline) : null;
                  return (
                    <li key={i} className={done[i] ? 'is-done' : ''}>
                      <input type="checkbox" aria-label="Mark done" checked={!!done[i]} onChange={() => setDone((d) => ({ ...d, [i]: !d[i] }))} />
                      <div>
                        <div className="action-task">
                          <T>{x.task}</T>
                        </div>
                        {x.why && (
                          <div className="muted small">
                            <T>{x.why}</T>
                          </div>
                        )}
                        {x.deadline && (
                          <div className={`deadline ${left !== null && left <= 7 ? 'soon' : ''}`}>
                            📅 {formatDate(x.deadline)}
                            {left !== null && (left < 0 ? ' · passed' : left === 0 ? ' · today' : ` · ${left} day${left === 1 ? '' : 's'} left`)}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {ics && (
              <button className="btn btn-small" onClick={() => download('plainly-deadlines.ics', ics, 'text/calendar')}>
                Add deadlines to my calendar
              </button>
            )}
          </Section>

          <Section title="Money" icon="💵">
            {e.money.length === 0 ? (
              <p className="muted">No amounts mentioned.</p>
            ) : (
              <table className="money">
                <tbody>
                  {e.money.map((m, i) => (
                    <tr key={i}>
                      <td>
                        <T>{m.label}</T>
                      </td>
                      <td className="amount">{m.amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          <Section title="Key points" icon="📌">
            <ul className="bullets">
              {e.keyPoints.map((k, i) => (
                <li key={i}>
                  <T>{k}</T>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Don't miss" icon="⚠️">
            <ul className="bullets">
              {e.watchOut.map((k, i) => (
                <li key={i}>
                  <T>{k}</T>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Questions you could ask them" icon="💬">
            <ul className="bullets">
              {e.questions.map((k, i) => (
                <li key={i}>
                  <T>{k}</T>
                </li>
              ))}
            </ul>
          </Section>
        </div>

        <AskPanel a={a} settings={settings} onUpdate={onUpdate} />
        <ReplyPanel a={a} settings={settings} onUpdate={onUpdate} />
        <PrivacyReceipt a={a} />
      </div>
    </Ctx.Provider>
  );
}

function AskPanel({ a, settings, onUpdate }: { a: Analysis; settings: Settings; onUpdate: (fn: (a: Analysis) => Analysis) => void }) {
  const [q, setQ] = useState('');
  const [live, setLive] = useState<{ q: string; a: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    const question = q.trim();
    if (!question) return;
    setQ('');
    setErr(null);
    setLive({ q: question, a: '' });
    try {
      const r = await ask(a, question, settings, (t) => setLive({ q: question, a: t }));
      const qa: QA = { q: question, a: r.data, where: r.where };
      onUpdate((cur) => ({ ...cur, qa: [...cur.qa, qa] }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLive(null);
    }
  };

  return (
    <section className="card section">
      <h3>
        <span aria-hidden>🙋</span> Ask about this document
      </h3>
      <div className="chat">
        {a.qa.map((x, i) => (
          <QABlock key={i} q={x.q} a={x.a} where={x.where} />
        ))}
        {live && <QABlock q={live.q} a={live.a || '…'} />}
      </div>
      {err && <div className="notice notice-error">{err}</div>}
      <form
        className="row"
        onSubmit={(ev) => {
          ev.preventDefault();
          submit();
        }}
      >
        <input className="input" value={q} onChange={(ev) => setQ(ev.target.value)} placeholder="e.g. What happens if I can't pay by the deadline?" disabled={!!live} />
        <button className="btn btn-primary" disabled={!q.trim() || !!live}>
          Ask
        </button>
      </form>
    </section>
  );
}

function QABlock({ q, a, where }: { q: string; a: string; where?: Where }) {
  return (
    <div className="qa">
      <div className="q">{q}</div>
      <div className="a">
        <T>{a}</T> {where && <WhereBadge where={where} />}
      </div>
    </div>
  );
}

function ReplyPanel({ a, settings, onUpdate }: { a: Analysis; settings: Settings; onUpdate: (fn: (a: Analysis) => Analysis) => void }) {
  const [kind, setKind] = useState<ReplyKind>(a.reply?.kind ?? 'payment-plan');
  const [note, setNote] = useState('');
  const [text, setText] = useState(a.reply?.text ?? '');
  const [where, setWhere] = useState<Where | undefined>(a.reply?.where);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const go = async () => {
    setBusy(true);
    setErr(null);
    setText('');
    try {
      const r = await draftReply(a, kind, note, settings, setText);
      setWhere(r.where);
      onUpdate((cur) => ({ ...cur, reply: { kind, text: r.data, where: r.where } }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(rehydrate(text, a.vault));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <section className="card section">
      <h3>
        <span aria-hidden>✉️</span> Write a reply
      </h3>
      <div className="row wrap">
        <select value={kind} onChange={(ev) => setKind(ev.target.value as ReplyKind)} aria-label="Kind of reply">
          {REPLY_KINDS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
        <input className="input input-wide" value={note} onChange={(ev) => setNote(ev.target.value)} placeholder="Anything to add? (optional, e.g. I lost my job in August)" />
        <button className="btn" onClick={go} disabled={busy}>
          {busy ? 'Writing…' : text ? 'Rewrite' : 'Draft it'}
        </button>
      </div>
      {err && <div className="notice notice-error">{err}</div>}
      {text && (
        <div className="letter">
          <pre>
            <T>{text}</T>
          </pre>
          <div className="row gap-s">
            {where && <WhereBadge where={where} />}
            <button className="btn btn-small btn-ghost" onClick={copy} disabled={busy}>
              {copied ? 'Copied ✓' : 'Copy with my details'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function PrivacyReceipt({ a }: { a: Analysis }) {
  const sentToCloud = a.trace.some((s) => s.where === 'cloud') || a.qa.some((x) => x.where === 'cloud') || a.reply?.where === 'cloud';
  const hidden = Object.entries(a.vault);
  return (
    <details className="card section receipt">
      <summary>
        <span aria-hidden>🧾</span> Privacy receipt:{' '}
        {sentToCloud ? `${hidden.length} details hidden before anything went to the cloud` : 'nothing left this device'}
      </summary>
      <h4>Where each step ran</h4>
      <table className="trace">
        <tbody>
          {a.trace.map((s) => (
            <tr key={s.id}>
              <td>{s.label}</td>
              <td>
                <WhereBadge where={s.where} ms={s.ms} />
              </td>
              <td className="muted small">{s.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h4>Kept on this device only ({hidden.length})</h4>
      <div className="vault">
        {hidden.length === 0 && <span className="muted">No personal details were found.</span>}
        {hidden.map(([ph, v]) => (
          <span key={ph} className="vault-item">
            <code>{ph}</code> → {v.original}
          </span>
        ))}
      </div>
      <h4>{sentToCloud ? 'Exactly what the AI saw' : 'The text the AI read'}</h4>
      <pre className="redacted">
        {a.redacted.split(/(\[[A-Z_]+_\d+\])/g).map((p, i) =>
          /^\[[A-Z_]+_\d+\]$/.test(p) ? (
            <mark key={i} className="ph">
              {p}
            </mark>
          ) : (
            p
          )
        )}
      </pre>
    </details>
  );
}
