import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDocFromServer, initializeFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Blueprint validation constants (verbatim synced from firebase-blueprint.json)
export const VALID_ID_PATTERN = /^[a-zA-Z0-9_\-]+$/;
export const MAX_ID_LENGTH = 128;
export const MAX_EMAIL_LENGTH = 120;
export const MAX_DISPLAY_NAME_LENGTH = 80;
export const MAX_WALLET_NAME_LENGTH = 60;
export const MAX_CATEGORY_LENGTH = 50;
export const MAX_NOTE_LENGTH = 200;
export const MAX_LOG_DETAIL_LENGTH = 250;
export const MAX_ALERT_TITLE_LENGTH = 100;
export const MAX_ALERT_DESC_LENGTH = 300;

export function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, MAX_ID_LENGTH);
  return cleaned.length > 0 ? cleaned : `id_${Date.now()}`;
}

export function sanitizeString(raw: string | null | undefined, maxLen: number, fallback = ''): string {
  const trimmed = String(raw ?? '').trim();
  const val = trimmed.length > 0 ? trimmed : fallback;
  return val.slice(0, maxLen);
}

// Exact Firebase configuration provided by user for project "sisa-uang-dfb7b" and named database "sisa-uang"
const app = initializeApp(firebaseConfig);

// Connect specifically to named database "sisa-uang" (firebaseConfig.firestoreDatabaseId === "sisa-uang")
export const db = initializeFirestore(
  app,
  {
    experimentalForceLongPolling: true,
  },
  firebaseConfig.firestoreDatabaseId
);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Export aliases so all stores refer to the exact same "sisa-uang" database & auth instance
export const sisaUangDb = db;
export const sisaUangAuth = auth;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

testConnection();
