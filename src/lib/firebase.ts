import { initializeApp, type FirebaseApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { getAI, GoogleAIBackend, type AI } from 'firebase/ai';
import { getAuth, onAuthStateChanged, signInAnonymously, type User } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, type Firestore } from 'firebase/firestore';
import { fetchAndActivate, getRemoteConfig, getValue, type RemoteConfig } from 'firebase/remote-config';

const env = import.meta.env;

export const MOCK_AI = env.VITE_MOCK_AI === 'true';

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

export const IS_CONFIGURED = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);

/** Values the team can tune live from the Firebase console, without shipping a new build. */
export interface RuntimeConfig {
  /** Longest document (in characters) we explain with Gemini Nano in one pass. */
  onDeviceMaxChars: number;
  /** Cloud model used when a request goes to the cloud. */
  cloudModel: string;
  /** Chunk size for on-device map-reduce in Strict Local mode. */
  localChunkChars: number;
  /** Default privacy mode for new users. */
  defaultPrivacyMode: 'local' | 'balanced' | 'cloud';
  /** Kill switch for the on-device PII pass (rules always run). */
  onDeviceShield: boolean;
}

export const DEFAULT_CONFIG: RuntimeConfig = {
  onDeviceMaxChars: 6000,
  cloudModel: 'gemini-3.5-flash-lite',
  localChunkChars: 3500,
  defaultPrivacyMode: 'balanced',
  onDeviceShield: true,
};

let app: FirebaseApp | null = null;
let ai: AI | null = null;
let db: Firestore | null = null;
let rc: RemoteConfig | null = null;

export function initFirebase() {
  if (!IS_CONFIGURED || app) return;
  app = initializeApp(firebaseConfig);

  // App Check is required by Firebase AI Logic. In development a debug token is
  // printed to the console; register it under App Check > Manage debug tokens.
  if (env.VITE_APPCHECK_DEBUG === 'true') {
    (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN: boolean | string }).FIREBASE_APPCHECK_DEBUG_TOKEN = env.VITE_APPCHECK_DEBUG_TOKEN || true;
  }
  if (env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY || env.VITE_APPCHECK_DEBUG === 'true') {
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY || 'debug'),
      isTokenAutoRefreshEnabled: true,
    });
  }

  ai = getAI(app, { backend: new GoogleAIBackend() });
  db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  rc = getRemoteConfig(app);
  rc.settings.minimumFetchIntervalMillis = env.DEV ? 60_000 : 3_600_000;
  rc.defaultConfig = {
    on_device_max_chars: DEFAULT_CONFIG.onDeviceMaxChars,
    cloud_model: DEFAULT_CONFIG.cloudModel,
    local_chunk_chars: DEFAULT_CONFIG.localChunkChars,
    default_privacy_mode: DEFAULT_CONFIG.defaultPrivacyMode,
    on_device_shield: DEFAULT_CONFIG.onDeviceShield,
  };
}

export function getAIInstance(): AI {
  if (!ai) throw new Error('Firebase is not configured. Copy .env.example to .env.local and fill it in.');
  return ai;
}

export function getDb(): Firestore | null {
  return db;
}

export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  if (!rc) return DEFAULT_CONFIG;
  try {
    await fetchAndActivate(rc);
  } catch {
    // Offline or blocked: Remote Config falls back to cached or default values.
  }
  const mode = getValue(rc, 'default_privacy_mode').asString();
  return {
    onDeviceMaxChars: getValue(rc, 'on_device_max_chars').asNumber() || DEFAULT_CONFIG.onDeviceMaxChars,
    cloudModel: getValue(rc, 'cloud_model').asString() || DEFAULT_CONFIG.cloudModel,
    localChunkChars: getValue(rc, 'local_chunk_chars').asNumber() || DEFAULT_CONFIG.localChunkChars,
    defaultPrivacyMode: mode === 'local' || mode === 'cloud' ? mode : 'balanced',
    onDeviceShield: getValue(rc, 'on_device_shield').asBoolean(),
  };
}

/** Anonymous sign-in, so each person's saved explanations are private to them in Firestore. */
export function watchUser(cb: (user: User | null) => void): () => void {
  if (!app) {
    cb(null);
    return () => {};
  }
  const auth = getAuth(app);
  const unsub = onAuthStateChanged(auth, (u) => {
    if (u) cb(u);
    else signInAnonymously(auth).catch(() => cb(null));
  });
  return unsub;
}
