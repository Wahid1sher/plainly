import type { TraceStep } from '../lib/pipeline';

const LABEL = { 'on-device': 'On-device', cloud: 'Cloud', rules: 'Local rules' } as const;
const ICON = { 'on-device': '📱', cloud: '☁️', rules: '⚙️' } as const;

export function WhereBadge({ where, ms }: { where: TraceStep['where']; ms?: number }) {
  return (
    <span className={`badge badge-${where}`} title={where === 'cloud' ? 'Ran in the cloud on text with personal details hidden' : 'Ran on this device'}>
      {ICON[where]} {LABEL[where]}
      {ms !== undefined && ms > 0 ? ` · ${ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`}` : ''}
    </span>
  );
}
