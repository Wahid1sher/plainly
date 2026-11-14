/**
 * Saved explanations.
 * - Firestore (per anonymous user) stores ONLY the redacted text and results.
 * - The vault (placeholder -> real detail) stays in this browser's localStorage, so
 *   saved items re-hydrate on this device but personal details never reach the server.
 */
import { collection, deleteDoc, doc, getDocs, limit, orderBy, query, setDoc } from 'firebase/firestore';
import { getDb } from './firebase';
import type { Analysis } from './pipeline';
import type { Vault } from './redact';

const LOCAL_KEY = 'plainly:history';
const vaultKey = (id: string) => `plainly:vault:${id}`;

function safeGet<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function safeSet(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage full or blocked */
  }
}

type Stored = Omit<Analysis, 'vault'>;

function strip(a: Analysis): Stored {
  const { vault: _vault, ...rest } = a;
  return JSON.parse(JSON.stringify(rest));
}

export async function saveAnalysis(uid: string | null, a: Analysis) {
  safeSet(vaultKey(a.id), a.vault);
  const db = getDb();
  if (db && uid) {
    await setDoc(doc(db, 'users', uid, 'analyses', a.id), strip(a));
  } else {
    const list = safeGet<Stored[]>(LOCAL_KEY, []).filter((x) => x.id !== a.id);
    safeSet(LOCAL_KEY, [strip(a), ...list].slice(0, 50));
  }
}

export async function listAnalyses(uid: string | null): Promise<Analysis[]> {
  const db = getDb();
  let items: Stored[];
  if (db && uid) {
    const snap = await getDocs(query(collection(db, 'users', uid, 'analyses'), orderBy('createdAt', 'desc'), limit(50)));
    items = snap.docs.map((d) => d.data() as Stored);
  } else {
    items = safeGet<Stored[]>(LOCAL_KEY, []);
  }
  return items.map((s) => ({ ...s, vault: safeGet<Vault>(vaultKey(s.id), {}) }));
}

export async function deleteAnalysis(uid: string | null, id: string) {
  try {
    localStorage.removeItem(vaultKey(id));
  } catch {
    /* ignore */
  }
  const db = getDb();
  if (db && uid) await deleteDoc(doc(db, 'users', uid, 'analyses', id));
  else safeSet(LOCAL_KEY, safeGet<Stored[]>(LOCAL_KEY, []).filter((x) => x.id !== id));
}
