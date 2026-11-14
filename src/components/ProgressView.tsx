import { WhereBadge } from './WhereBadge';
import type { TraceStep } from '../lib/pipeline';

export interface LiveStep {
  id: string;
  label: string;
  status: 'running' | 'done';
  detail?: string;
  where?: TraceStep['where'];
}

export function ProgressView({ steps, busy, error }: { steps: LiveStep[]; busy: boolean; error: string | null }) {
  return (
    <section className="card progress" aria-live="polite">
      <ol className="steps">
        {steps.map((s) => (
          <li key={s.id} className={s.status}>
            <span className="step-icon">{s.status === 'done' ? '✓' : <span className="spinner" />}</span>
            <div>
              <div className="step-label">
                {s.label} {s.where && <WhereBadge where={s.where} />}
              </div>
              {s.detail && <div className="muted small">{s.detail}</div>}
            </div>
          </li>
        ))}
        {busy && steps.length === 0 && (
          <li className="running">
            <span className="step-icon">
              <span className="spinner" />
            </span>
            <div className="step-label">Starting…</div>
          </li>
        )}
      </ol>
      {error && (
        <div className="notice notice-error" role="alert">
          {error}
        </div>
      )}
    </section>
  );
}
