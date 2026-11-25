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
import { auth, db } from '../firebase';
import { getApiUserToken, getUserAuthHeaders } from './api';

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

async function buildBridgeHeaders(ownerUid?: string): Promise<Record<string, string>> {
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
      const idToken = await auth.currentUser.getIdToken();
      if (idToken) {
        headers.Authorization = `Bearer ${idToken}`;
      }
    } catch {
      // Ignore Firebase ID token fetch failure when using userToken
    }
  }
  return headers;
}

async function callUserDbApi<T = any>(path: string, body: Record<string, any>, ownerUid?: string): Promise<T> {
  const headers = await buildBridgeHeaders(ownerUid);
  if (!headers['x-user-token'] && !headers['x-admin-token'] && !headers.Authorization) {
    throw new Error('Missing authenticated session token for Firestore access');
  }

  const res = await fetch(`/api/user-db/${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || `Firestore bridge request failed (${res.status})`);
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
    const ref = doc(db, collectionName, docId);
    const snap = fromServer ? await getDocFromServer(ref) : await getDoc(ref);
    return {
      id: snap.id,
      exists: () => snap.exists(),
      data: () => snap.data() as Record<string, any> | undefined,
      _rawSnap: snap,
    };
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
    const constraints = buildSdkConstraints(spec);
    const q = query(collection(db, collectionName), ...constraints);
    const snap = await getCountFromServer(q);
    return Number(snap.data().count || 0);
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
