import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getDocsFromServer,
  getCountFromServer,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
  increment,
  type QueryConstraint,
  type WhereFilterOp,
} from 'firebase/firestore';
import { auth, db, isFirestoreOfflineError, isServerBridgeConfigError, isSessionExpiredError } from '../firebase';
import {
  getApiUserToken,
  getUserAuthHeaders,
  setApiUserToken,
  refreshFirebaseBackedUserToken,
  waitForAuthStateReady,
} from './api';

export { isServerBridgeConfigError, isSessionExpiredError };

export interface FsSentinel {
  __fsType: 'serverTimestamp' | 'increment';
  delta?: number;
}

export function fsServerTimestamp(): any {
  return { __fsType: 'serverTimestamp' } satisfies FsSentinel;
}

export function fsIncrement(delta: number): any {
  return { __fsType: 'increment', delta: Number(delta) || 0 } satisfies FsSentinel;
}

export interface FsWhereClause {
  field: string;
  op: WhereFilterOp;
  value: any;
}

export interface FsOrderByClause {
  field: string;
  dir?: 'asc' | 'desc';
}

export interface FsQuerySpec {
  wheres?: FsWhereClause[];
  orderBys?: FsOrderByClause[];
  limitCount?: number;
  startAfterCursor?: any;
  startAfterDocId?: string;
}

export interface FsDocSnapshot {
  id: string;
  exists: () => boolean;
  data: () => Record<string, any> | undefined;
  _rawSnap?: any;
}

export interface FsQueryDoc {
  id: string;
  data: () => Record<string, any>;
  _rawSnap?: any;
}

export interface FsQuerySnapshot {
  empty: boolean;
  size: number;
  docs: FsQueryDoc[];
}

const ADMIN_EMAILS = new Set(['vuedevo@gmail.com', 'adnanzaki65@admin.sd.belajar.id']);

export function sanitizeFsUid(raw: string | null | undefined): string {
  return String(raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_\-]/g, '_');
}

function getActiveStoredUserUid(): string {
  try {
    const raw = localStorage.getItem('sisa_uang_active_user');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.uid) return String(parsed.uid).trim();
    }
  } catch {
    // Ignore parse error
  }
  return '';
}

function isVerifiedAdminSessionActive(): boolean {
  try {
    const token = localStorage.getItem('sisa_uang_admin_token');
    const otpVerified = localStorage.getItem('sisa_uang_otp_verified') === 'true';
    return Boolean(token && otpVerified);
  } catch {
    return false;
  }
}

export function isDirectFirestoreAuthorized(ownerUid?: string): boolean {
  const fbUser = auth.currentUser;
  if (!fbUser || fbUser.isAnonymous) return false;

  const fbEmail = String(fbUser.email || '').trim().toLowerCase();
  if (ADMIN_EMAILS.has(fbEmail) && isVerifiedAdminSessionActive()) {
    return true;
  }

  const normalizedOwner = sanitizeFsUid(ownerUid || getActiveStoredUserUid());
  const normalizedFbUid = sanitizeFsUid(fbUser.uid);
  if (!normalizedOwner || !normalizedFbUid) return false;

  return normalizedOwner === normalizedFbUid && !ADMIN_EMAILS.has(fbEmail);
}

export function hasActiveFirestoreAccess(ownerUid?: string): boolean {
  if (isDirectFirestoreAuthorized(ownerUid)) return true;
  if (getApiUserToken()) return true;
  if (isVerifiedAdminSessionActive()) return true;
  return Boolean(auth.currentUser && !auth.currentUser.isAnonymous);
}

function shouldFallbackDirectSdkToBridge(err: unknown): boolean {
  const anyErr = err as any;
  const code = String(anyErr?.code || '').toLowerCase();
  const msg = String(anyErr?.message || err || '').toLowerCase();
  if (
    code.includes('permission-denied') ||
    code.includes('resource-exhausted') ||
    code.includes('unauthenticated') ||
    isSessionExpiredError(err)
  ) {
    return false;
  }
  const hasBridgeAuth = Boolean(
    getApiUserToken() || isVerifiedAdminSessionActive() || (auth.currentUser && !auth.currentUser.isAnonymous)
  );
  if (!hasBridgeAuth) return false;
  return (
    isFirestoreOfflineError(err) ||
    code.includes('internal') ||
    code.includes('unknown') ||
    code.includes('deadline-exceeded') ||
    code.includes('aborted') ||
    msg.includes('network') ||
    msg.includes('fetch') ||
    msg.includes('timeout')
  );
}

function translateSentinelsToSdk(value: any): any {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((item) => translateSentinelsToSdk(item));
  }
  if (typeof value === 'object') {
    if (value.__fsType === 'serverTimestamp') {
      return serverTimestamp();
    }
    if (value.__fsType === 'increment') {
      return increment(Number(value.delta || 0));
    }
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) {
        out[k] = translateSentinelsToSdk(v);
      }
    }
    return out;
  }
  return value;
}

async function buildBridgeHeaders(
  ownerUid?: string,
  forceRefreshIdToken = false
): Promise<Record<string, string>> {
  if (!auth.currentUser) {
    await waitForAuthStateReady();
  }
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...getUserAuthHeaders(),
  };
  const resolvedOwner = String(ownerUid || getActiveStoredUserUid() || '').trim();
  if (resolvedOwner) {
    headers['x-owner-uid'] = resolvedOwner;
  }
  if (auth.currentUser && !auth.currentUser.isAnonymous) {
    try {
      const idToken = await auth.currentUser.getIdToken(forceRefreshIdToken);
      if (idToken) {
        headers.Authorization = `Bearer ${idToken}`;
      }
    } catch {
      // Ignore Firebase ID token fetch failure when using userToken
    }
  }
  return headers;
}

function emitUserSessionExpired(message: string, status = 401) {
  setApiUserToken(null);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('sisauang:user-session-expired', {
        detail: { message, status },
      })
    );
  }
}

function emitAdminSessionExpired(message: string, status = 403) {
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem('sisa_uang_admin_token');
      localStorage.setItem('sisa_uang_otp_verified', 'false');
    } catch {
      // Ignore
    }
    window.dispatchEvent(
      new CustomEvent('sisauang:admin-session-expired', {
        detail: { message, status },
      })
    );
  }
}

function tryParseJsonObject(rawText: string): Record<string, any> | null {
  const trimmed = rawText.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, any>) : null;
  } catch {
    return null;
  }
}

async function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callUserDbApi<T = any>(path: string, body: Record<string, any>, ownerUid?: string): Promise<T> {
  let headers = await buildBridgeHeaders(ownerUid, false);
  if (!headers['x-user-token'] && !headers['x-admin-token'] && !headers.Authorization) {
    const refreshed = await refreshFirebaseBackedUserToken();
    if (refreshed) {
      headers = await buildBridgeHeaders(ownerUid, false);
    }
  }

  if (!headers['x-user-token'] && !headers['x-admin-token'] && !headers.Authorization) {
    const expiredMsg = 'Sesi login Anda tidak ditemukan atau telah kedaluwarsa. Silakan masuk kembali.';
    emitUserSessionExpired(expiredMsg, 401);
    const missingErr: any = new Error(expiredMsg);
    missingErr.code = 'SESSION_EXPIRED';
    missingErr.status = 401;
    missingErr.isSessionExpired = true;
    throw missingErr;
  }

  const MAX_TRANSIENT_RETRIES = 2;
  let res!: Response;
  let rawText = '';
  let data: Record<string, any> | null = null;

  for (let attempt = 0; attempt <= MAX_TRANSIENT_RETRIES; attempt++) {
    res = await fetch(`/api/user-db/${path}`, {
      method: 'POST',
      headers,
      cache: 'no-store',
      body: JSON.stringify(body),
    });

    if (res.status === 401) {
      const refreshed = await refreshFirebaseBackedUserToken();
      if (refreshed) {
        headers = await buildBridgeHeaders(ownerUid, false);
        res = await fetch(`/api/user-db/${path}`, {
          method: 'POST',
          headers,
          cache: 'no-store',
          body: JSON.stringify(body),
        });
      }
    }

    rawText = await res.text().catch(() => '');
    data = tryParseJsonObject(rawText);

    const isNonJson200 = res.ok && !data;
    const isTransientGateway = res.status === 502 || res.status === 504;
    if ((isNonJson200 || isTransientGateway) && attempt < MAX_TRANSIENT_RETRIES) {
      await waitMs(650 * (attempt + 1));
      continue;
    }
    break;
  }

  if (!res.ok || !data?.success) {
    const isHtmlResponse = rawText.trim().startsWith('<');
    const errMsg =
      data?.error ||
      (res.ok && !data
        ? isHtmlResponse
          ? 'Server mengembalikan halaman HTML alih-alih data JSON (kemungkinan server sedang restart atau proxy cache belum diperbarui). Silakan muat ulang halaman.'
          : 'Respons data dari server kosong atau bukan format JSON yang valid. Silakan coba muat ulang.'
        : `Permintaan sinkronisasi database gagal (${res.status}).`);
    const errCode = String(data?.code || '').toUpperCase();
    const isAdmin2FAErr =
      Boolean(headers['x-admin-token']) &&
      res.status === 403 &&
      (errCode === 'ADMIN_2FA_REQUIRED' ||
        errMsg.toLowerCase().includes('2fa') ||
        errMsg.toLowerCase().includes('super admin'));

    if (isAdmin2FAErr) {
      emitAdminSessionExpired(errMsg, res.status);
    }

    const isSessionErr = res.status === 401 || errCode === 'SESSION_EXPIRED';
    if (isSessionErr) {
      emitUserSessionExpired(errMsg, res.status);
    }

    const bridgeErr: any = new Error(errMsg);
    if (data?.code) {
      bridgeErr.code = data.code;
    } else if (isSessionErr) {
      bridgeErr.code = 'SESSION_EXPIRED';
    }
    bridgeErr.status = res.status;
    if (isSessionErr) {
      bridgeErr.isSessionExpired = true;
    }
    throw bridgeErr;
  }
  return data as T;
}

function buildSdkConstraints(spec?: FsQuerySpec): QueryConstraint[] {
  const constraints: QueryConstraint[] = [];
  if (spec?.wheres) {
    for (const w of spec.wheres) {
      constraints.push(where(w.field, w.op, w.value));
    }
  }
  if (spec?.orderBys) {
    for (const o of spec.orderBys) {
      constraints.push(orderBy(o.field, o.dir || 'asc'));
    }
  }
  if (spec?.startAfterCursor) {
    const raw = spec.startAfterCursor._rawSnap || spec.startAfterCursor;
    constraints.push(startAfter(raw));
  }
  if (typeof spec?.limitCount === 'number' && spec.limitCount > 0) {
    constraints.push(limit(spec.limitCount));
  }
  return constraints;
}

export async function fsGetDoc(
  collectionName: string,
  docId: string,
  ownerUid?: string,
  fromServer = false
): Promise<FsDocSnapshot> {
  const effectiveOwner = ownerUid || (collectionName === 'users' ? docId : getActiveStoredUserUid());
  if (isDirectFirestoreAuthorized(effectiveOwner)) {
    try {
      const ref = doc(db, collectionName, docId);
      const snap = fromServer ? await getDocFromServer(ref) : await getDoc(ref);
      return {
        id: snap.id,
        exists: () => snap.exists(),
        data: () => snap.data() as Record<string, any> | undefined,
        _rawSnap: snap,
      };
    } catch (sdkErr) {
      if (!shouldFallbackDirectSdkToBridge(sdkErr)) {
        throw sdkErr;
      }
    }
  }

  const res = await callUserDbApi<{
    success: true;
    exists: boolean;
    id: string;
    data: Record<string, any> | null;
  }>(
    'doc',
    {
      collection: collectionName,
      docId,
      ownerUid: effectiveOwner,
    },
    effectiveOwner
  );

  return {
    id: res.id || docId,
    exists: () => Boolean(res.exists),
    data: () => (res.exists && res.data ? res.data : undefined),
  };
}

export async function fsGetDocs(
  collectionName: string,
  spec: FsQuerySpec = {},
  ownerUid?: string,
  fromServer = false
): Promise<FsQuerySnapshot> {
  const effectiveOwner = ownerUid || getActiveStoredUserUid();
  if (isDirectFirestoreAuthorized(effectiveOwner)) {
    try {
      const constraints = buildSdkConstraints(spec);
      const q = query(collection(db, collectionName), ...constraints);
      const snap = fromServer ? await getDocsFromServer(q) : await getDocs(q);
      return {
        empty: snap.empty,
        size: snap.size,
        docs: snap.docs.map((d) => ({
          id: d.id,
          data: () => d.data() as Record<string, any>,
          _rawSnap: d,
        })),
      };
    } catch (sdkErr) {
      if (!shouldFallbackDirectSdkToBridge(sdkErr)) {
        throw sdkErr;
      }
    }
  }

  const startAfterDocId =
    spec.startAfterDocId ||
    (spec.startAfterCursor && typeof spec.startAfterCursor.id === 'string'
      ? spec.startAfterCursor.id
      : undefined);

  const res = await callUserDbApi<{
    success: true;
    docs: Array<{ id: string; data: Record<string, any> }>;
  }>(
    'query',
    {
      collection: collectionName,
      ownerUid: effectiveOwner,
      wheres: spec.wheres || [],
      orderBys: spec.orderBys || [],
      limitCount: spec.limitCount,
      startAfterDocId,
    },
    effectiveOwner
  );

  const docsList = Array.isArray(res.docs) ? res.docs : [];
  return {
    empty: docsList.length === 0,
    size: docsList.length,
    docs: docsList.map((d) => ({
      id: d.id,
      data: () => d.data,
    })),
  };
}

export async function fsGetCount(
  collectionName: string,
  spec: FsQuerySpec = {},
  ownerUid?: string
): Promise<number> {
  const effectiveOwner = ownerUid || getActiveStoredUserUid();
  if (isDirectFirestoreAuthorized(effectiveOwner)) {
    try {
      const constraints = buildSdkConstraints(spec);
      const q = query(collection(db, collectionName), ...constraints);
      const snap = await getCountFromServer(q);
      return Number(snap.data().count || 0);
    } catch (sdkErr) {
      if (!shouldFallbackDirectSdkToBridge(sdkErr)) {
        throw sdkErr;
      }
    }
  }

  const res = await callUserDbApi<{
    success: true;
    count: number;
  }>(
    'count',
    {
      collection: collectionName,
      ownerUid: effectiveOwner,
      wheres: spec.wheres || [],
    },
    effectiveOwner
  );

  return Number(res.count || 0);
}

export async function fsSetDoc(
  collectionName: string,
  docId: string,
  data: Record<string, any>,
  options?: { merge?: boolean },
  ownerUid?: string
): Promise<void> {
  const effectiveOwner =
    ownerUid ||
    (typeof data?.ownerId === 'string' ? data.ownerId : '') ||
    (collectionName === 'users' ? docId : getActiveStoredUserUid());

  if (isDirectFirestoreAuthorized(effectiveOwner)) {
    const ref = doc(db, collectionName, docId);
    const translated = translateSentinelsToSdk(data);
    if (options?.merge) {
      await setDoc(ref, translated, { merge: true });
    } else {
      await setDoc(ref, translated);
    }
    return;
  }

  await callUserDbApi(
    'mutate',
    {
      ownerUid: effectiveOwner,
      ops: [
        {
          op: 'set',
          collection: collectionName,
          docId,
          data,
          merge: Boolean(options?.merge),
        },
      ],
    },
    effectiveOwner
  );
}

export async function fsUpdateDoc(
  collectionName: string,
  docId: string,
  data: Record<string, any>,
  ownerUid?: string
): Promise<void> {
  const effectiveOwner =
    ownerUid ||
    (typeof data?.ownerId === 'string' ? data.ownerId : '') ||
    (collectionName === 'users' ? docId : getActiveStoredUserUid());

  if (isDirectFirestoreAuthorized(effectiveOwner)) {
    const ref = doc(db, collectionName, docId);
    await updateDoc(ref, translateSentinelsToSdk(data));
    return;
  }

  await callUserDbApi(
    'mutate',
    {
      ownerUid: effectiveOwner,
      ops: [
        {
          op: 'update',
          collection: collectionName,
          docId,
          data,
        },
      ],
    },
    effectiveOwner
  );
}

export async function fsDeleteDoc(
  collectionName: string,
  docId: string,
  ownerUid?: string
): Promise<void> {
  const effectiveOwner = ownerUid || getActiveStoredUserUid();

  if (isDirectFirestoreAuthorized(effectiveOwner)) {
    await deleteDoc(doc(db, collectionName, docId));
    return;
  }

  await callUserDbApi(
    'mutate',
    {
      ownerUid: effectiveOwner,
      ops: [
        {
          op: 'delete',
          collection: collectionName,
          docId,
        },
      ],
    },
    effectiveOwner
  );
}

export interface FsBatchWriter {
  set: (
    collectionName: string,
    docId: string,
    data: Record<string, any>,
    options?: { merge?: boolean }
  ) => void;
  update: (collectionName: string, docId: string, data: Record<string, any>) => void;
  delete: (collectionName: string, docId: string) => void;
  commit: () => Promise<void>;
}

export function createFsBatch(ownerUid?: string): FsBatchWriter {
  const effectiveOwner = ownerUid || getActiveStoredUserUid();
  const directAuthorized = isDirectFirestoreAuthorized(effectiveOwner);
  const directBatch = directAuthorized ? writeBatch(db) : null;
  const queuedOps: Array<{
    op: 'set' | 'update' | 'delete';
    collection: string;
    docId: string;
    data?: Record<string, any>;
    merge?: boolean;
  }> = [];

  return {
    set(collectionName, docId, data, options) {
      if (directBatch) {
        const ref = doc(db, collectionName, docId);
        const translated = translateSentinelsToSdk(data);
        if (options?.merge) {
          directBatch.set(ref, translated, { merge: true });
        } else {
          directBatch.set(ref, translated);
        }
      } else {
        queuedOps.push({
          op: 'set',
          collection: collectionName,
          docId,
          data,
          merge: Boolean(options?.merge),
        });
      }
    },
    update(collectionName, docId, data) {
      if (directBatch) {
        directBatch.update(doc(db, collectionName, docId), translateSentinelsToSdk(data));
      } else {
        queuedOps.push({
          op: 'update',
          collection: collectionName,
          docId,
          data,
        });
      }
    },
    delete(collectionName, docId) {
      if (directBatch) {
        directBatch.delete(doc(db, collectionName, docId));
      } else {
        queuedOps.push({
          op: 'delete',
          collection: collectionName,
          docId,
        });
      }
    },
    async commit() {
      if (directBatch) {
        await directBatch.commit();
        return;
      }
      if (queuedOps.length === 0) return;
      await callUserDbApi(
        'mutate',
        {
          ownerUid: effectiveOwner,
          ops: queuedOps,
        },
        effectiveOwner
      );
    },
  };
}
