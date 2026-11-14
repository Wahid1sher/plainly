import type { Analysis } from '../lib/pipeline';
import { rehydrate } from '../lib/redact';

interface Props {
  items: Analysis[];
  onOpen: (a: Analysis) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export function HistoryList({ items, onOpen, onDelete, onClose }: Props) {
  return (
    <aside className="history card" aria-label="Saved documents">
      <div className="row space">
        <h3>Saved documents</h3>
        <button className="btn btn-ghost btn-small" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <p className="muted small">Saved to your private Firestore space with personal details hidden. The details themselves stay on this device.</p>
      {items.length === 0 && <p className="muted">Nothing saved yet.</p>}
      <ul>
        {items.map((a) => (
          <li key={a.id}>
            <button className="history-item" onClick={() => onOpen(a)}>
              <span className={`dot dot-${a.explanation.urgency === 'high' ? 'red' : a.explanation.urgency === 'medium' ? 'amber' : 'green'}`} />
              <span>
                <strong>{rehydrate(a.title, a.vault)}</strong>
                <span className="muted small"> · {new Date(a.createdAt).toLocaleDateString()}</span>
              </span>
            </button>
            <button className="btn btn-ghost btn-small" onClick={() => onDelete(a.id)} aria-label={`Delete ${a.title}`}>
              Delete
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
