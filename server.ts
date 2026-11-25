import dotenv from 'dotenv';
dotenv.config({ override: true });
import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import { createServer as createViteServer } from 'vite';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import multer from 'multer';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import { initializeApp as initServerFirebaseApp } from 'firebase/app';
import {
  initializeFirestore as initializeServerFirestore,
  doc as serverFsDoc,
  getDoc as serverFsGetDoc,
  updateDoc as serverFsUpdateDoc,
  deleteDoc as serverFsDeleteDoc,
  serverTimestamp as serverFsTimestamp,
  collection as serverFsCollection,
  getDocs as serverFsGetDocs,
  setDoc as serverFsSetDoc,
  getCountFromServer as serverFsGetCountFromServer,
  query as serverFsQuery,
  where as serverFsWhere,
  orderBy as serverFsOrderBy,
  limit as serverFsLimit,
  startAfter as serverFsStartAfter,
  increment as serverFsIncrement,
  writeBatch as serverFsWriteBatch,
} from 'firebase/firestore';
import {
  getAuth as getServerAuth,
  signInWithEmailAndPassword as serverFsSignIn,
} from 'firebase/auth';
import firebaseServerConfig from './firebase-applet-config.json';
import { getPrerenderDataForPath, injectPrerenderedHtml } from './src/prerender/injector';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Restore unquoted .env values where dotenv stripped attached '#' characters (e.g. passwords ending in ##)
// while still respecting whitespace-preceded inline comments ('val # comment').
function restoreUnquotedEnvHashValues() {
  try {
    const candidates = [
      path.resolve(process.cwd(), '.env'),
      path.resolve(__dirname, '.env'),
    ];
    const seen = new Set<string>();
    for (const envPath of candidates) {
      if (seen.has(envPath) || !fs.existsSync(envPath)) continue;
      seen.add(envPath);
      const raw = fs.readFileSync(envPath, 'utf8');
      for (const rawLine of raw.split(/\r?\n/)) {
        const trimmedLine = rawLine.trim();
        if (!trimmedLine || trimmedLine.startsWith('#')) continue;
        const m = rawLine.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (!m) continue;
        const key = m[1];
        const valPart = m[2].replace(/\r$/, '').trim();
        if (!valPart || valPart.startsWith('"') || valPart.startsWith("'")) continue;
        const withoutInlineComment = valPart.replace(/\s+#.*$/, '').trim();
        if (!withoutInlineComment.includes('#')) continue;
        const current = process.env[key];
        if (
          typeof current === 'string' &&
          withoutInlineComment.length > current.length &&
          withoutInlineComment.startsWith(current)
        ) {
          process.env[key] = withoutInlineComment;
        }
      }
    }
  } catch {
    // Ignore .env restoration read errors
  }
}
restoreUnquotedEnvHashValues();

const SUPER_ADMIN_EMAIL = 'vuedevo@gmail.com';
const SUPER_ADMIN_USERNAME = 'vuedevo';
const WORKSPACE_ADMIN_EMAIL = 'adnanzaki65@admin.sd.belajar.id';

function loadOrCreateRuntimeSecret(): string {
  const secretPath = path.join(os.tmpdir(), '.sisa_uang_runtime_secret');
  try {
    if (fs.existsSync(secretPath)) {
      const existing = fs.readFileSync(secretPath, 'utf8').trim();
      if (existing.length >= 32) {
        return existing;
      }
    }
    const generated = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(secretPath, generated, { mode: 0o600, encoding: 'utf8' });
    return generated;
  } catch {
    return crypto.randomBytes(32).toString('hex');
  }
}

const RUNTIME_SESSION_SECRET = loadOrCreateRuntimeSecret();
let runtimeServerFbPassword = '';

function getSessionSecret(): string {
  return (process.env.SESSION_SECRET || '').trim() || RUNTIME_SESSION_SECRET;
}

function getServerFirebasePassword(): string {
  return (process.env.SUPER_ADMIN_FIREBASE_PASSWORD || runtimeServerFbPassword || '').trim();
}

function tsToIsoValue(val: any): any {
  if (val === null || val === undefined) return val;
  if (typeof val === 'object') {
    if (typeof val.toDate === 'function') {
      try {
        return val.toDate().toISOString();
      } catch {
        return String(val);
      }
    }
    if ('seconds' in val && typeof val.seconds === 'number') {
      try {
        return new Date(val.seconds * 1000).toISOString();
      } catch {
        return String(val);
      }
    }
    if (Array.isArray(val)) return val.map(tsToIsoValue);
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      out[k] = tsToIsoValue(v);
    }
    return out;
  }
  return val;
}

// Initialize server-side Firebase connection with forced long-polling for Node.js VPS reliability
let serverDb: any = null;
let serverAuth: any = null;
try {
  const serverFirebaseApp = initServerFirebaseApp(firebaseServerConfig, 'server_admin_worker');
  serverDb = initializeServerFirestore(
    serverFirebaseApp,
    { experimentalForceLongPolling: true },
    firebaseServerConfig.firestoreDatabaseId
  );
  serverAuth = getServerAuth(serverFirebaseApp);
} catch (e: any) {
  console.warn('[Server Firebase Init Notice]', e?.message || e);
}

type ServerFirebaseConfigCode =
  | 'SERVER_FIREBASE_PASSWORD_MISSING'
  | 'SERVER_FIREBASE_PASSWORD_INVALID'
  | 'SERVER_FIREBASE_RATE_LIMITED';

class ServerFirebaseConfigError extends Error {
  readonly code: ServerFirebaseConfigCode;
  readonly statusCode: number;
  constructor(
    message: string,
    code: ServerFirebaseConfigCode = 'SERVER_FIREBASE_PASSWORD_MISSING',
    statusCode = 503
  ) {
    super(message);
    this.name = 'ServerFirebaseConfigError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

let serverWorkerRestSession: {
  idToken: string;
  refreshToken: string;
  expiresAt: number;
  passwordDigest: string;
} | null = null;
let lastServerFirebaseAuthError: { code: string; message: string; passwordDigest: string } | null = null;
let serverFirebaseSignInPromise: Promise<void> | null = null;
let serverWorkerRestSignInPromise: Promise<string | null> | null = null;
let serverFirebaseRateLimitedUntil = 0;
const FIREBASE_RATE_LIMIT_COOLDOWN_MS = 3 * 60 * 1000;

function isFirebaseInvalidCredentialError(err: any): boolean {
  const msg = String(err?.code || err?.message || err || '').toUpperCase();
  return (
    msg.includes('INVALID-CREDENTIAL') ||
    msg.includes('INVALID_LOGIN_CREDENTIALS') ||
    msg.includes('WRONG-PASSWORD') ||
    msg.includes('INVALID_PASSWORD') ||
    msg.includes('USER_NOT_FOUND') ||
    msg.includes('USER_DISABLED')
  );
}

function isFirebaseTooManyAttemptsError(err: any): boolean {
  const msg = String(err?.code || err?.message || err || '').toUpperCase();
  return (
    msg.includes('TOO_MANY_ATTEMPTS_TRY_LATER') ||
    msg.includes('TOO-MANY-REQUESTS') ||
    msg.includes('TOO_MANY_REQUESTS')
  );
}

function buildServerRateLimitError(pwDigest: string): ServerFirebaseConfigError {
  const remainingSec = Math.max(15, Math.ceil((serverFirebaseRateLimitedUntil - Date.now()) / 1000));
  const remainingMin = Math.max(1, Math.ceil(remainingSec / 60));
  const msg = `Firebase Auth membatasi sementara percobaan login worker server (tunggu ~${remainingMin} menit lalu muat ulang, atau masuk dengan akun Google).`;
  lastServerFirebaseAuthError = {
    code: 'SERVER_FIREBASE_RATE_LIMITED',
    message: msg,
    passwordDigest: pwDigest,
  };
  return new ServerFirebaseConfigError(msg, 'SERVER_FIREBASE_RATE_LIMITED', 503);
}

function hasWarmServerWorkerSession(): boolean {
  const currentEmail = String(serverAuth?.currentUser?.email || '').trim().toLowerCase();
  if (serverAuth?.currentUser && currentEmail === SUPER_ADMIN_EMAIL) {
    return true;
  }
  if (serverWorkerRestSession && Date.now() < serverWorkerRestSession.expiresAt - 60_000) {
    return true;
  }
  return false;
}

async function signInServerWorkerViaRest(password: string): Promise<string | null> {
  const pwDigest = crypto.createHash('sha256').update(password).digest('hex');
  if (
    serverWorkerRestSession &&
    serverWorkerRestSession.passwordDigest === pwDigest &&
    Date.now() < serverWorkerRestSession.expiresAt - 120_000
  ) {
    return serverWorkerRestSession.idToken;
  }

  if (serverWorkerRestSignInPromise) {
    return serverWorkerRestSignInPromise;
  }

  serverWorkerRestSignInPromise = (async (): Promise<string | null> => {
    if (serverWorkerRestSession && serverWorkerRestSession.passwordDigest === pwDigest && serverWorkerRestSession.refreshToken) {
      try {
        const refreshRes = await fetch(
          `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(firebaseServerConfig.apiKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(serverWorkerRestSession.refreshToken)}`,
            signal: AbortSignal.timeout(10000),
          }
        );
        if (refreshRes.ok) {
          const refreshData = (await refreshRes.json().catch(() => null)) as any;
          if (refreshData?.id_token) {
            serverWorkerRestSession = {
              idToken: String(refreshData.id_token),
              refreshToken: String(refreshData.refresh_token || serverWorkerRestSession.refreshToken),
              expiresAt: Date.now() + (Number(refreshData.expires_in) || 3600) * 1000,
              passwordDigest: pwDigest,
            };
            lastServerFirebaseAuthError = null;
            serverFirebaseRateLimitedUntil = 0;
            return serverWorkerRestSession.idToken;
          }
        }
      } catch {
        // Fall through to password sign-in only if not rate-limited
      }
    }

    if (Date.now() < serverFirebaseRateLimitedUntil) {
      throw buildServerRateLimitError(pwDigest);
    }

    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(firebaseServerConfig.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: SUPER_ADMIN_EMAIL,
          password,
          returnSecureToken: true,
        }),
        signal: AbortSignal.timeout(10000),
      }
    );
    const data = (await res.json().catch(() => null)) as any;
    if (!res.ok || !data?.idToken) {
      const errText = String(data?.error?.message || `Firebase REST Auth failed (${res.status})`);
      const err: any = new Error(errText);
      err.code = errText;
      if (isFirebaseTooManyAttemptsError(err)) {
        serverFirebaseRateLimitedUntil = Date.now() + FIREBASE_RATE_LIMIT_COOLDOWN_MS;
        throw buildServerRateLimitError(pwDigest);
      }
      throw err;
    }

    serverWorkerRestSession = {
      idToken: String(data.idToken),
      refreshToken: String(data.refreshToken || ''),
      expiresAt: Date.now() + (Number(data.expiresIn) || 3600) * 1000,
      passwordDigest: pwDigest,
    };
    lastServerFirebaseAuthError = null;
    serverFirebaseRateLimitedUntil = 0;
    return serverWorkerRestSession.idToken;
  })();

  try {
    return await serverWorkerRestSignInPromise;
  } finally {
    serverWorkerRestSignInPromise = null;
  }
}

async function getServerWorkerRestToken(): Promise<string | null> {
  if (serverAuth?.currentUser) {
    const currentEmail = String(serverAuth.currentUser.email || '').trim().toLowerCase();
    if (currentEmail === SUPER_ADMIN_EMAIL) {
      try {
        const sdkToken = await serverAuth.currentUser.getIdToken();
        if (sdkToken) return sdkToken;
      } catch {
        // Fall through to REST worker session
      }
    }
  }
  const serverPw = getServerFirebasePassword();
  if (!serverPw) return null;
  const pwDigest = crypto.createHash('sha256').update(serverPw).digest('hex');
  if (
    serverWorkerRestSession &&
    serverWorkerRestSession.passwordDigest === pwDigest &&
    Date.now() < serverWorkerRestSession.expiresAt - 60_000
  ) {
    return serverWorkerRestSession.idToken;
  }
  if (Date.now() < serverFirebaseRateLimitedUntil) {
    return null;
  }
  if (
    lastServerFirebaseAuthError?.code === 'SERVER_FIREBASE_PASSWORD_INVALID' &&
    lastServerFirebaseAuthError.passwordDigest === pwDigest
  ) {
    return null;
  }
  try {
    return await signInServerWorkerViaRest(serverPw);
  } catch {
    return null;
  }
}

function isServerFirebaseBridgeReady(): boolean {
  if (!serverDb || !serverAuth) return false;
  if (hasWarmServerWorkerSession()) {
    return true;
  }
  if (Date.now() < serverFirebaseRateLimitedUntil) {
    return false;
  }
  const pw = getServerFirebasePassword();
  if (!pw) return false;
  const pwDigest = crypto.createHash('sha256').update(pw).digest('hex');
  if (
    lastServerFirebaseAuthError?.code === 'SERVER_FIREBASE_PASSWORD_INVALID' &&
    lastServerFirebaseAuthError.passwordDigest === pwDigest
  ) {
    return false;
  }
  return true;
}

async function ensureServerFirebaseSignedIn(): Promise<void> {
  if (!serverDb || !serverAuth) {
    throw new Error('Koneksi database server belum diinisialisasi.');
  }
  const currentEmail = String(serverAuth.currentUser?.email || '').trim().toLowerCase();
  if (serverAuth.currentUser && currentEmail === SUPER_ADMIN_EMAIL) {
    lastServerFirebaseAuthError = null;
    serverFirebaseRateLimitedUntil = 0;
    return;
  }
  const serverPw = getServerFirebasePassword();
  if (!serverPw) {
    throw new ServerFirebaseConfigError(
      'Konfigurasi SUPER_ADMIN_FIREBASE_PASSWORD belum tersedia di server. Hubungi administrator.',
      'SERVER_FIREBASE_PASSWORD_MISSING'
    );
  }
  const pwDigest = crypto.createHash('sha256').update(serverPw).digest('hex');

  if (
    serverWorkerRestSession &&
    serverWorkerRestSession.passwordDigest === pwDigest &&
    Date.now() < serverWorkerRestSession.expiresAt - 120_000
  ) {
    lastServerFirebaseAuthError = null;
    return;
  }

  if (
    lastServerFirebaseAuthError?.code === 'SERVER_FIREBASE_PASSWORD_INVALID' &&
    lastServerFirebaseAuthError.passwordDigest === pwDigest
  ) {
    throw new ServerFirebaseConfigError(
      lastServerFirebaseAuthError.message,
      'SERVER_FIREBASE_PASSWORD_INVALID'
    );
  }

  if (Date.now() < serverFirebaseRateLimitedUntil) {
    throw buildServerRateLimitError(pwDigest);
  }

  if (serverFirebaseSignInPromise) {
    return serverFirebaseSignInPromise;
  }

  serverFirebaseSignInPromise = (async () => {
    // Re-check inside lock
    const lockEmail = String(serverAuth.currentUser?.email || '').trim().toLowerCase();
    if (serverAuth.currentUser && lockEmail === SUPER_ADMIN_EMAIL) {
      lastServerFirebaseAuthError = null;
      return;
    }
    if (
      serverWorkerRestSession &&
      serverWorkerRestSession.passwordDigest === pwDigest &&
      Date.now() < serverWorkerRestSession.expiresAt - 120_000
    ) {
      lastServerFirebaseAuthError = null;
      return;
    }
    if (Date.now() < serverFirebaseRateLimitedUntil) {
      throw buildServerRateLimitError(pwDigest);
    }

    let sdkErr: any = null;
    try {
      await serverFsSignIn(serverAuth, SUPER_ADMIN_EMAIL, serverPw);
      lastServerFirebaseAuthError = null;
      serverFirebaseRateLimitedUntil = 0;
      return;
    } catch (err: any) {
      sdkErr = err;
    }

    if (isFirebaseInvalidCredentialError(sdkErr)) {
      lastServerFirebaseAuthError = {
        code: 'SERVER_FIREBASE_PASSWORD_INVALID',
        message:
          'Kata sandi Firebase Super Admin (SUPER_ADMIN_FIREBASE_PASSWORD) ditolak oleh Firebase Auth. Periksa kembali .env (gunakan tanda kutip jika mengandung karakter #).',
        passwordDigest: pwDigest,
      };
      throw new ServerFirebaseConfigError(
        lastServerFirebaseAuthError.message,
        'SERVER_FIREBASE_PASSWORD_INVALID'
      );
    }

    if (isFirebaseTooManyAttemptsError(sdkErr)) {
      serverFirebaseRateLimitedUntil = Date.now() + FIREBASE_RATE_LIMIT_COOLDOWN_MS;
      throw buildServerRateLimitError(pwDigest);
    }

    // Only if SDK sign-in hit a network/transport error, try direct HTTPS REST sign-in once
    try {
      const restToken = await signInServerWorkerViaRest(serverPw);
      if (restToken) {
        return;
      }
    } catch (restErr: any) {
      if (restErr instanceof ServerFirebaseConfigError) {
        throw restErr;
      }
      if (isFirebaseInvalidCredentialError(restErr)) {
        lastServerFirebaseAuthError = {
          code: 'SERVER_FIREBASE_PASSWORD_INVALID',
          message:
            'Kata sandi Firebase Super Admin (SUPER_ADMIN_FIREBASE_PASSWORD) ditolak oleh Firebase Auth. Periksa kembali .env (gunakan tanda kutip jika mengandung karakter #).',
          passwordDigest: pwDigest,
        };
        throw new ServerFirebaseConfigError(
          lastServerFirebaseAuthError.message,
          'SERVER_FIREBASE_PASSWORD_INVALID'
        );
      }
      if (isFirebaseTooManyAttemptsError(restErr)) {
        serverFirebaseRateLimitedUntil = Date.now() + FIREBASE_RATE_LIMIT_COOLDOWN_MS;
        throw buildServerRateLimitError(pwDigest);
      }
      throw restErr;
    }

    throw sdkErr;
  })();

  try {
    await serverFirebaseSignInPromise;
  } finally {
    serverFirebaseSignInPromise = null;
  }
}

async function activateProUserInFirestore(
  uid: string,
  plan: 'monthly' | 'yearly',
  expiresAt: string
): Promise<boolean> {
  if (!serverDb || !serverAuth || !uid) return false;
  try {
    await ensureServerFirebaseSignedIn();
    await serverFsUpdateDoc(serverFsDoc(serverDb, 'users', uid), {
      isPro: true,
      subscriptionStatus: 'pro',
      subscriptionPlan: plan,
      subscriptionExpiresAt: expiresAt,
      isExplicitlyDeactivated: false,
      updatedAt: serverFsTimestamp(),
    });

    try {
      await serverFsSetDoc(
        serverFsDoc(serverDb, 'budgets', `su_sub_pro_${uid}`),
        {
          ownerId: uid,
          category: '__SISAUANG_PRO__',
          period: `${plan === 'yearly' ? 'Y' : 'M'}:${expiresAt}`,
          limitAmount: 1,
          spentAmount: 0,
          deleted: false,
          deletedAt: null,
          updatedAt: serverFsTimestamp(),
          createdAt: serverFsTimestamp(),
        },
        { merge: true }
      );
    } catch {
      // Ignore if budget doc cannot be written
    }

    console.log(`[Firestore Admin Sync] Successfully persisted Pro status for users/${uid} in Cloud Firestore`);
    return true;
  } catch (err: any) {
    console.error(`[Firestore Admin Sync Error] Failed to update users/${uid} in Firestore:`, err?.message || err);
    return false;
  }
}

// Salted SHA-256 hash of 'sisa-uang-v1:' + super admin password
let superAdminPasswordHash = '2759b5f6c9e3ae92ca8cd9129ab6d6336d569e8e4f84c0996839347b84c1b7e8';

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(`sisa-uang-v1:${password}`).digest('hex');
}

function verifyPasswordAgainstStoredHash(plainPassword: string, storedHash?: string): boolean {
  if (!storedHash) return false;
  // 1. Check PHP / CodeIgniter 4 Shield Bcrypt hash ($2y$, $2a$, $2b$)
  if (storedHash.startsWith('$2y$') || storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$')) {
    const normalizedBcrypt = storedHash.replace(/^\$2y\$/, '$2a$');
    try {
      if (bcrypt.compareSync(plainPassword, normalizedBcrypt)) {
        return true;
      }
    } catch {
      // Ignore malformed hash
    }
  }
  // 2. Check SHA-256 hash
  if (storedHash === hashPassword(plainPassword)) {
    return true;
  }
  // 3. Direct match if plain text was imported
  if (storedHash === plainPassword) {
    return true;
  }
  return false;
}

export interface ServerUserRecord {
  uid: string;
  username: string;
  email: string;
  displayName: string;
  role: 'user' | 'admin';
  status: 'active' | 'blocked';
  authProvider: 'password' | 'google';
  currency: 'IDR' | 'USD';
  subscriptionStatus?: 'free' | 'pending' | 'pro';
  isPro?: boolean;
  isExplicitlyDeactivated?: boolean;
  subscriptionPlan?: 'monthly' | 'yearly' | null;
  subscriptionExpiresAt?: string | null;
  subscriptionPaymentMethod?: 'qris' | 'bank_transfer' | null;
  subscriptionProofDataUrl?: string | null;
  subscriptionProofFileName?: string | null;
  subscriptionRequestedAt?: string | null;
  subscriptionSenderName?: string | null;
  subscriptionTransferNote?: string | null;
  passwordHash?: string;
  createdAt: string;
  updatedAt: string;
}

function getTodayLocalIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isUserSubscriptionActive(u?: Partial<ServerUserRecord> | null): boolean {
  if (!u) return false;
  if (u.isExplicitlyDeactivated === true) return false;
  if (u.subscriptionStatus === 'pending') return false;
  const markedPro = u.subscriptionStatus === 'pro' || u.isPro === true;
  if (!markedPro) return false;
  if (u.subscriptionExpiresAt) {
    const expDate = String(u.subscriptionExpiresAt).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(expDate) && expDate < getTodayLocalIso()) {
      return false;
    }
  }
  return true;
}

export interface ServerActivityLog {
  id: string;
  actorUid: string;
  actorEmail: string;
  action: string;
  detail: string;
  severity: 'info' | 'warning' | 'critical';
  createdAt: string;
}

export interface ServerSecurityAlert {
  id: string;
  actorUid: string;
  actorEmail: string;
  title: string;
  description: string;
  severity: 'warning' | 'critical';
  status: 'open' | 'resolved';
  createdAt: string;
  updatedAt: string;
}

export interface ServerDeviceSessionRecord {
  sessionId: string;
  uid: string;
  email: string;
  deviceId: string;
  deviceName: string;
  browser: string;
  os: string;
  deviceType: 'desktop' | 'mobile' | 'tablet';
  ipAddress: string;
  isPrimary: boolean;
  status: 'active' | 'revoked';
  revokedAt?: string | null;
  revokedByDeviceId?: string | null;
  createdAt: string;
  lastActiveAt: string;
}

interface PrimaryDeviceOtpChallenge {
  uid: string;
  email: string;
  deviceId: string;
  deviceName: string;
  code: string;
  expiresAt: number;
  attempts: number;
}

interface OtpChallenge {
  email: string;
  code: string;
  expiresAt: number;
  attempts: number;
  lastSentAt?: number;
}

const nowIso = () => new Date().toISOString();

const USERS_CACHE_FILE = path.join(__dirname, '.sisa_uang_users_cache.json');

// In-memory state synchronized with client & Firestore (no dummy users)
const usersStore = new Map<string, ServerUserRecord>([
  [
    'admin_vuedevo_01',
    {
      uid: 'admin_vuedevo_01',
      username: 'dark.notes',
      email: SUPER_ADMIN_EMAIL,
      displayName: 'dark.notes',
      role: 'admin',
      status: 'active',
      authProvider: 'password',
      currency: 'IDR',
      passwordHash: superAdminPasswordHash,
      createdAt: new Date(Date.now() - 86400000 * 14).toISOString(),
      updatedAt: nowIso(),
    },
  ],
]);

function loadPersistedUsersCache() {
  try {
    if (fs.existsSync(USERS_CACHE_FILE)) {
      const raw = fs.readFileSync(USERS_CACHE_FILE, 'utf8');
      const list = JSON.parse(raw) as ServerUserRecord[];
      if (Array.isArray(list)) {
        for (const u of list) {
          if (u && u.uid && u.email) {
            usersStore.set(u.uid, u);
            if (
              (u.uid === 'admin_vuedevo_01' || u.email.toLowerCase() === SUPER_ADMIN_EMAIL) &&
              u.passwordHash
            ) {
              superAdminPasswordHash = u.passwordHash;
            }
          }
        }
      }
    }
  } catch {
    // Ignore cache read error
  }
}

let usersRegistrySyncToken = Date.now();
let logsRegistrySyncToken = Date.now();

function savePersistedUsersCache() {
  usersRegistrySyncToken = Date.now();
  try {
    const list = Array.from(usersStore.values());
    fs.writeFileSync(USERS_CACHE_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch {
    // Ignore cache write error
  }
}

loadPersistedUsersCache();

let hasInitialUsersSyncCompleted = usersStore.size > 1;
let lastUsersSyncAt = 0;

async function syncUsersFromFirestore(force = false): Promise<number> {
  if (!serverDb || !serverAuth) return usersStore.size;
  const now = Date.now();
  if (!force && lastUsersSyncAt > 0 && now - lastUsersSyncAt < 60_000) {
    return usersStore.size;
  }
  lastUsersSyncAt = now;
  try {
    if (!getServerFirebasePassword() && !serverAuth.currentUser) {
      return usersStore.size;
    }
    await ensureServerFirebaseSignedIn();

    let rows: Array<{ id: string; data: Record<string, any> }> = [];
    try {
      const snap = await serverFsGetDocs(serverFsCollection(serverDb, 'users'));
      rows = snap.docs.map((d) => ({ id: d.id, data: (d.data() || {}) as Record<string, any> }));
    } catch (sdkReadErr: any) {
      const restToken = await getServerWorkerRestToken();
      if (!restToken) throw sdkReadErr;
      const projectRoot = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(firebaseServerConfig.projectId)}/databases/${encodeURIComponent(firebaseServerConfig.firestoreDatabaseId)}/documents`;
      const restRes = await fetch(`${projectRoot}:runQuery`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${restToken}`,
        },
        body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'users' }] } }),
        signal: AbortSignal.timeout(15000),
      });
      if (!restRes.ok) throw sdkReadErr;
      const body = (await restRes.json().catch(() => [])) as any[];
      rows = (Array.isArray(body) ? body : [])
        .filter((r: any) => r?.document?.name)
        .map((r: any) => {
          const id = String(r.document.name).split('/').pop() || '';
          const fields = r.document.fields || {};
          const decoded: Record<string, any> = {};
          for (const [k, v] of Object.entries(fields)) {
            const valObj = v as any;
            if ('stringValue' in valObj) decoded[k] = valObj.stringValue;
            else if ('booleanValue' in valObj) decoded[k] = valObj.booleanValue;
            else if ('integerValue' in valObj) decoded[k] = Number(valObj.integerValue);
            else if ('doubleValue' in valObj) decoded[k] = Number(valObj.doubleValue);
            else if ('timestampValue' in valObj) decoded[k] = valObj.timestampValue;
            else if ('nullValue' in valObj) decoded[k] = null;
          }
          return { id, data: decoded };
        });
    }

    hasInitialUsersSyncCompleted = true;
    if (rows.length === 0) return usersStore.size;

    const tsToIso = (val: any): string => {
      if (!val) return new Date().toISOString();
      if (typeof val === 'string') return val;
      if (typeof val.toDate === 'function') return val.toDate().toISOString();
      if (typeof val.seconds === 'number') return new Date(val.seconds * 1000).toISOString();
      return new Date().toISOString();
    };

    let importedCount = 0;
    for (const row of rows) {
      const data = row.data;
      const uid = row.id;
      const email = String(data.email || '').trim().toLowerCase();
      if (!uid) continue;

      const isSuper = email === SUPER_ADMIN_EMAIL || uid === 'admin_vuedevo_01';
      const isDeactivated = Boolean(data.isExplicitlyDeactivated === true);
      const isPro =
        !isDeactivated &&
        (data.isPro === true || data.subscriptionStatus === 'pro') &&
        isUserSubscriptionActive({
          isPro: true,
          subscriptionStatus: 'pro',
          subscriptionExpiresAt: data.subscriptionExpiresAt,
          isExplicitlyDeactivated: isDeactivated,
        });
      const isPending = !isDeactivated && !isPro && data.subscriptionStatus === 'pending';

      const existing = usersStore.get(uid);

      const record: ServerUserRecord = {
        uid,
        username: String(data.username || email.split('@')[0] || uid).toLowerCase(),
        email: email || `${uid}@sisa-uang.id`,
        displayName: String(data.displayName || data.username || email.split('@')[0] || uid),
        role: isSuper ? 'admin' : (data.role === 'admin' ? 'admin' : 'user'),
        status: data.status === 'blocked' ? 'blocked' : 'active',
        authProvider: data.authProvider === 'google' ? 'google' : 'password',
        currency: data.currency === 'USD' ? 'USD' : 'IDR',
        subscriptionStatus: isPro ? 'pro' : isPending ? 'pending' : 'free',
        isPro,
        isExplicitlyDeactivated: isDeactivated,
        subscriptionPlan: isPro || isPending ? (data.subscriptionPlan === 'yearly' ? 'yearly' : 'monthly') : null,
        subscriptionExpiresAt: isPro ? (data.subscriptionExpiresAt || null) : null,
        passwordHash: data.passwordHash || existing?.passwordHash,
        createdAt: tsToIso(data.createdAt || existing?.createdAt),
        updatedAt: tsToIso(data.updatedAt || existing?.updatedAt),
      };

      usersStore.set(uid, record);
      importedCount++;
    }

    savePersistedUsersCache();
    console.log(`[Firestore Server Sync] Synchronized ${importedCount} users from Cloud Firestore (total store: ${usersStore.size}).`);
    return usersStore.size;
  } catch (err: any) {
    console.error('[Firestore Server Sync Error]', err?.message || err);
    return usersStore.size;
  }
}

// Initial sync on server start ONLY if local persisted cache does not already have users
if (!hasInitialUsersSyncCompleted) {
  void syncUsersFromFirestore();
}

const LOGS_CACHE_FILE = path.join(__dirname, '.sisa_uang_logs_cache.json');
const activityLogs: ServerActivityLog[] = [];

function loadPersistedLogsCache() {
  try {
    if (fs.existsSync(LOGS_CACHE_FILE)) {
      const raw = fs.readFileSync(LOGS_CACHE_FILE, 'utf8');
      const list = JSON.parse(raw) as ServerActivityLog[];
      if (Array.isArray(list)) {
        activityLogs.length = 0;
        for (const lg of list) {
          if (lg && lg.id && lg.action) {
            activityLogs.push(lg);
          }
        }
      }
    }
  } catch {
    // Ignore cache read error
  }
}

function savePersistedLogsCache() {
  logsRegistrySyncToken = Date.now();
  try {
    fs.writeFileSync(LOGS_CACHE_FILE, JSON.stringify(activityLogs.slice(0, 1000), null, 2), 'utf8');
  } catch {
    // Ignore cache write error
  }
}

loadPersistedLogsCache();

const securityAlerts: ServerSecurityAlert[] = [];

const SESSIONS_CACHE_FILE = path.join(__dirname, '.sisa_uang_sessions_cache.json');
const deviceSessionsStore = new Map<string, ServerDeviceSessionRecord>();
const primaryDeviceOtpChallenges = new Map<string, PrimaryDeviceOtpChallenge>();

function loadPersistedSessionsCache() {
  try {
    if (fs.existsSync(SESSIONS_CACHE_FILE)) {
      const raw = fs.readFileSync(SESSIONS_CACHE_FILE, 'utf8');
      const list = JSON.parse(raw) as ServerDeviceSessionRecord[];
      if (Array.isArray(list)) {
        deviceSessionsStore.clear();
        for (const s of list) {
          if (s && s.sessionId && s.uid && s.deviceId) {
            deviceSessionsStore.set(s.sessionId, s);
          }
        }
      }
    }
  } catch {
    // Ignore cache read error
  }
}

function savePersistedSessionsCache() {
  try {
    const list = Array.from(deviceSessionsStore.values());
    fs.writeFileSync(SESSIONS_CACHE_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch {
    // Ignore cache write error
  }
}

loadPersistedSessionsCache();

export interface ServerReportSettingsRecord {
  ownerId: string;
  signers: any[];
  activeSignerIds: Record<string, string[]>;
  signPlace: string;
  letterhead: any;
  customTitles: any;
  updatedAt: string;
}

const REPORT_SETTINGS_CACHE_FILE = path.join(__dirname, '.sisa_uang_report_settings_cache.json');
const reportSettingsStore = new Map<string, ServerReportSettingsRecord>();

function loadPersistedReportSettingsCache() {
  try {
    if (fs.existsSync(REPORT_SETTINGS_CACHE_FILE)) {
      const raw = fs.readFileSync(REPORT_SETTINGS_CACHE_FILE, 'utf8');
      const list = JSON.parse(raw) as ServerReportSettingsRecord[];
      if (Array.isArray(list)) {
        reportSettingsStore.clear();
        for (const item of list) {
          if (item && item.ownerId) {
            reportSettingsStore.set(item.ownerId, item);
          }
        }
      }
    }
  } catch {
    // Ignore cache read error
  }
}

function savePersistedReportSettingsCache() {
  try {
    const list = Array.from(reportSettingsStore.values());
    fs.writeFileSync(REPORT_SETTINGS_CACHE_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch {
    // Ignore cache write error
  }
}

loadPersistedReportSettingsCache();

const DEV_APP_URL = 'https://ais-dev-es4jlpfdzwpqk2v5gwm6ux-692522329374.asia-east1.run.app';
const PRE_APP_URL = 'https://ais-pre-es4jlpfdzwpqk2v5gwm6ux-692522329374.asia-east1.run.app';

function computePeerSignature(ownerId: string): string | null {
  const secret = (process.env.SESSION_SECRET || '').trim();
  if (!secret) return null;
  return crypto.createHmac('sha256', secret).update(`peer:${ownerId}`).digest('hex');
}

function isAuthorizedPeerRequest(req: Request, ownerId: string): boolean {
  const sig = String(req.headers['x-peer-signature'] || '').trim();
  const expected = computePeerSignature(ownerId);
  if (!expected || !sig || req.query.peer !== '1' || sig.length !== expected.length) {
    return false;
  }
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

async function syncReportSettingsToPeer(ownerId: string, record: ServerReportSettingsRecord) {
  const peerSig = computePeerSignature(ownerId);
  if (!peerSig) return;
  try {
    const peerUrls = [DEV_APP_URL, PRE_APP_URL];
    for (const pUrl of peerUrls) {
      void fetch(`${pUrl}/api/users/${encodeURIComponent(ownerId)}/report-settings?peer=1`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-peer-signature': peerSig,
        },
        body: JSON.stringify(record),
        signal: AbortSignal.timeout(3000),
      }).catch(() => {});
    }
  } catch {
    // Ignore peer sync network error
  }
}

export interface ServerAutomationRecord {
  id: string;
  ownerId: string;
  name: string;
  type: 'income' | 'expense' | 'transfer';
  walletId: string;
  walletName: string;
  fundOwnerId?: string;
  fundOwnerName?: string;
  toWalletId?: string;
  toWalletName?: string;
  toFundOwnerId?: string;
  toFundOwnerName?: string;
  category: string;
  categoryId?: string;
  amount: number;
  adminFee?: number;
  note: string;
  scheduleDays: number[];
  executionTime: string;
  mode: 'with_confirmation' | 'without_confirmation';
  isActive: boolean;
  lastExecutedDate?: string | null;
  lastCancelledDate?: string | null;
  lastPushNotifiedDate?: string | null;
  snoozedUntil?: string | null;
  claimedExecutionDate?: string | null;
  claimedAt?: number | null;
  claimedBy?: string | null;
  deleted?: boolean;
  deletedAt?: string | null;
  createdAt?: string;
  updatedAt: string;
}

const AUTOMATIONS_CACHE_FILE = path.join(__dirname, '.sisa_uang_automations_cache.json');
const AUTOMATIONS_DELETED_FILE = path.join(__dirname, '.sisa_uang_automations_deleted.json');
const automationsStore = new Map<string, ServerAutomationRecord>();
const deletedAutomationsStore = new Set<string>();

function loadPersistedAutomationsCache() {
  try {
    if (fs.existsSync(AUTOMATIONS_DELETED_FILE)) {
      const rawDeleted = fs.readFileSync(AUTOMATIONS_DELETED_FILE, 'utf8');
      const delList = JSON.parse(rawDeleted) as string[];
      if (Array.isArray(delList)) {
        for (const id of delList) {
          if (id) deletedAutomationsStore.add(String(id));
        }
      }
    }
  } catch {
    // Ignore deleted list read error
  }

  try {
    if (fs.existsSync(AUTOMATIONS_CACHE_FILE)) {
      const raw = fs.readFileSync(AUTOMATIONS_CACHE_FILE, 'utf8');
      const list = JSON.parse(raw) as ServerAutomationRecord[];
      if (Array.isArray(list)) {
        automationsStore.clear();
        for (const item of list) {
          if (item && item.id && !item.deleted && !deletedAutomationsStore.has(item.id)) {
            automationsStore.set(item.id, item);
          }
        }
      }
    }
  } catch {
    // Ignore cache read error
  }
}

function savePersistedAutomationsCache() {
  try {
    const list = Array.from(automationsStore.values()).filter(
      (item) => !item.deleted && !deletedAutomationsStore.has(item.id)
    );
    fs.writeFileSync(AUTOMATIONS_CACHE_FILE, JSON.stringify(list, null, 2), 'utf8');
    fs.writeFileSync(
      AUTOMATIONS_DELETED_FILE,
      JSON.stringify(Array.from(deletedAutomationsStore), null, 2),
      'utf8'
    );
  } catch {
    // Ignore cache write error
  }
}

loadPersistedAutomationsCache();

async function syncAutomationToPeer(ownerId: string, record: ServerAutomationRecord, isDelete = false) {
  const peerSig = computePeerSignature(ownerId);
  if (!peerSig) return;
  try {
    const peerUrls = [DEV_APP_URL, PRE_APP_URL];
    for (const pUrl of peerUrls) {
      if (isDelete) {
        void fetch(`${pUrl}/api/users/${encodeURIComponent(ownerId)}/automations/${encodeURIComponent(record.id)}?peer=1`, {
          method: 'DELETE',
          headers: { 'x-peer-signature': peerSig },
          signal: AbortSignal.timeout(3000),
        }).catch(() => {});
      } else {
        void fetch(`${pUrl}/api/users/${encodeURIComponent(ownerId)}/automations?peer=1`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-peer-signature': peerSig,
          },
          body: JSON.stringify(record),
          signal: AbortSignal.timeout(3000),
        }).catch(() => {});
      }
    }
  } catch {
    // Ignore peer sync network error
  }
}

export interface ServerSavingsGoalRecord {
  id: string;
  ownerId: string;
  name: string;
  category: string;
  targetAmount: number;
  deadline?: string | null;
  note?: string;
  color?: string;
  reminderEnabled: boolean;
  reminderDays?: number[];
  reminderTime?: string;
  reminderAmount?: number | null;
  lastRemindedDate?: string | null;
  lastSkippedDate?: string | null;
  lastPushNotifiedDate?: string | null;
  snoozedUntil?: string | null;
  deleted?: boolean;
  deletedAt?: string | null;
  createdAt?: string;
  updatedAt: string;
}

export interface ServerSavingsEntryRecord {
  id: string;
  ownerId: string;
  savingsId: string;
  savingsName?: string;
  type: 'deposit' | 'withdraw';
  walletId: string;
  walletName: string;
  fundOwnerId?: string;
  fundOwnerName?: string;
  amount: number;
  date: string;
  note: string;
  relatedTransactionId?: string | null;
  deleted?: boolean;
  deletedAt?: string | null;
  createdAt?: string;
  updatedAt: string;
}

const SAVINGS_GOALS_CACHE_FILE = path.join(__dirname, '.sisa_uang_savings_goals_cache.json');
const SAVINGS_GOALS_DELETED_FILE = path.join(__dirname, '.sisa_uang_savings_goals_deleted.json');
const SAVINGS_ENTRIES_CACHE_FILE = path.join(__dirname, '.sisa_uang_savings_entries_cache.json');
const SAVINGS_ENTRIES_DELETED_FILE = path.join(__dirname, '.sisa_uang_savings_entries_deleted.json');

const savingsGoalsStore = new Map<string, ServerSavingsGoalRecord>();
const deletedSavingsGoalsStore = new Set<string>();
const savingsEntriesStore = new Map<string, ServerSavingsEntryRecord>();
const deletedSavingsEntriesStore = new Set<string>();

function loadPersistedSavingsCache() {
  try {
    if (fs.existsSync(SAVINGS_GOALS_DELETED_FILE)) {
      const delGoals = JSON.parse(fs.readFileSync(SAVINGS_GOALS_DELETED_FILE, 'utf8')) as string[];
      if (Array.isArray(delGoals)) {
        for (const id of delGoals) if (id) deletedSavingsGoalsStore.add(String(id));
      }
    }
    if (fs.existsSync(SAVINGS_ENTRIES_DELETED_FILE)) {
      const delEntries = JSON.parse(fs.readFileSync(SAVINGS_ENTRIES_DELETED_FILE, 'utf8')) as string[];
      if (Array.isArray(delEntries)) {
        for (const id of delEntries) if (id) deletedSavingsEntriesStore.add(String(id));
      }
    }
  } catch {
    // Ignore deleted list read error
  }

  try {
    if (fs.existsSync(SAVINGS_GOALS_CACHE_FILE)) {
      const goalsList = JSON.parse(fs.readFileSync(SAVINGS_GOALS_CACHE_FILE, 'utf8')) as ServerSavingsGoalRecord[];
      if (Array.isArray(goalsList)) {
        savingsGoalsStore.clear();
        for (const g of goalsList) {
          if (g && g.id && !g.deleted && !deletedSavingsGoalsStore.has(g.id)) {
            savingsGoalsStore.set(g.id, g);
          }
        }
      }
    }
    if (fs.existsSync(SAVINGS_ENTRIES_CACHE_FILE)) {
      const entriesList = JSON.parse(fs.readFileSync(SAVINGS_ENTRIES_CACHE_FILE, 'utf8')) as ServerSavingsEntryRecord[];
      if (Array.isArray(entriesList)) {
        savingsEntriesStore.clear();
        for (const e of entriesList) {
          if (e && e.id && !e.deleted && !deletedSavingsEntriesStore.has(e.id)) {
            savingsEntriesStore.set(e.id, e);
          }
        }
      }
    }
  } catch {
    // Ignore cache read error
  }
}

function savePersistedSavingsCache() {
  try {
    const goalsList = Array.from(savingsGoalsStore.values()).filter(
      (g) => !g.deleted && !deletedSavingsGoalsStore.has(g.id)
    );
    const entriesList = Array.from(savingsEntriesStore.values()).filter(
      (e) => !e.deleted && !deletedSavingsEntriesStore.has(e.id)
    );
    fs.writeFileSync(SAVINGS_GOALS_CACHE_FILE, JSON.stringify(goalsList, null, 2), 'utf8');
    fs.writeFileSync(SAVINGS_GOALS_DELETED_FILE, JSON.stringify(Array.from(deletedSavingsGoalsStore), null, 2), 'utf8');
    fs.writeFileSync(SAVINGS_ENTRIES_CACHE_FILE, JSON.stringify(entriesList, null, 2), 'utf8');
    fs.writeFileSync(SAVINGS_ENTRIES_DELETED_FILE, JSON.stringify(Array.from(deletedSavingsEntriesStore), null, 2), 'utf8');
  } catch {
    // Ignore cache write error
  }
}

loadPersistedSavingsCache();

async function syncSavingsToPeer(
  ownerId: string,
  kind: 'goals' | 'entries',
  recordId: string,
  payload: any,
  isDelete = false
) {
  const peerSig = computePeerSignature(ownerId);
  if (!peerSig) return;
  try {
    const peerUrls = [DEV_APP_URL, PRE_APP_URL];
    for (const pUrl of peerUrls) {
      if (isDelete) {
        void fetch(`${pUrl}/api/users/${encodeURIComponent(ownerId)}/savings/${kind}/${encodeURIComponent(recordId)}?peer=1`, {
          method: 'DELETE',
          headers: { 'x-peer-signature': peerSig },
          signal: AbortSignal.timeout(3000),
        }).catch(() => {});
      } else {
        void fetch(`${pUrl}/api/users/${encodeURIComponent(ownerId)}/savings/${kind}?peer=1`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-peer-signature': peerSig,
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(3000),
        }).catch(() => {});
      }
    }
  } catch {
    // Ignore peer sync network error
  }
}

interface ServerDebtRecord {
  id: string;
  ownerId: string;
  type: 'debt' | 'receivable';
  description: string;
  amount: number;
  walletId: string;
  walletName: string;
  fundOwnerId?: string;
  fundOwnerName?: string;
  date: string;
  deadline?: string | null;
  note?: string;
  color: string;
  relatedTransactionId?: string | null;
  reminderEnabled: boolean;
  reminderDays: number[];
  reminderTime: string;
  reminderAmount?: number | null;
  lastRemindedDate?: string | null;
  lastSkippedDate?: string | null;
  lastPushNotifiedDate?: string | null;
  snoozedUntil?: string | null;
  deleted?: boolean;
  deletedAt?: string | null;
  createdAt?: string;
  updatedAt: string;
}

interface ServerDebtEntryRecord {
  id: string;
  ownerId: string;
  debtId: string;
  debtDescription?: string;
  debtType?: 'debt' | 'receivable';
  walletId: string;
  walletName: string;
  fundOwnerId?: string;
  fundOwnerName?: string;
  amount: number;
  date: string;
  note: string;
  relatedTransactionId?: string | null;
  deleted?: boolean;
  deletedAt?: string | null;
  createdAt?: string;
  updatedAt: string;
}

const DEBTS_CACHE_FILE = path.join(__dirname, '.sisa_uang_debts_cache.json');
const DEBTS_DELETED_FILE = path.join(__dirname, '.sisa_uang_debts_deleted.json');
const DEBT_ENTRIES_CACHE_FILE = path.join(__dirname, '.sisa_uang_debt_entries_cache.json');
const DEBT_ENTRIES_DELETED_FILE = path.join(__dirname, '.sisa_uang_debt_entries_deleted.json');

const debtsStore = new Map<string, ServerDebtRecord>();
const deletedDebtsStore = new Set<string>();
const debtEntriesStore = new Map<string, ServerDebtEntryRecord>();
const deletedDebtEntriesStore = new Set<string>();

function loadPersistedDebtsCache() {
  try {
    if (fs.existsSync(DEBTS_DELETED_FILE)) {
      const delDebts = JSON.parse(fs.readFileSync(DEBTS_DELETED_FILE, 'utf8')) as string[];
      if (Array.isArray(delDebts)) {
        for (const id of delDebts) if (id) deletedDebtsStore.add(String(id));
      }
    }
    if (fs.existsSync(DEBT_ENTRIES_DELETED_FILE)) {
      const delEntries = JSON.parse(fs.readFileSync(DEBT_ENTRIES_DELETED_FILE, 'utf8')) as string[];
      if (Array.isArray(delEntries)) {
        for (const id of delEntries) if (id) deletedDebtEntriesStore.add(String(id));
      }
    }
  } catch {
    // Ignore deleted list read error
  }

  try {
    if (fs.existsSync(DEBTS_CACHE_FILE)) {
      const debtsList = JSON.parse(fs.readFileSync(DEBTS_CACHE_FILE, 'utf8')) as ServerDebtRecord[];
      if (Array.isArray(debtsList)) {
        debtsStore.clear();
        for (const d of debtsList) {
          if (d && d.id && !d.deleted && !deletedDebtsStore.has(d.id)) {
            debtsStore.set(d.id, d);
          }
        }
      }
    }
    if (fs.existsSync(DEBT_ENTRIES_CACHE_FILE)) {
      const entriesList = JSON.parse(fs.readFileSync(DEBT_ENTRIES_CACHE_FILE, 'utf8')) as ServerDebtEntryRecord[];
      if (Array.isArray(entriesList)) {
        debtEntriesStore.clear();
        for (const e of entriesList) {
          if (e && e.id && !e.deleted && !deletedDebtEntriesStore.has(e.id)) {
            debtEntriesStore.set(e.id, e);
          }
        }
      }
    }
  } catch {
    // Ignore cache read error
  }
}

function savePersistedDebtsCache() {
  try {
    const debtsList = Array.from(debtsStore.values()).filter(
      (d) => !d.deleted && !deletedDebtsStore.has(d.id)
    );
    const entriesList = Array.from(debtEntriesStore.values()).filter(
      (e) => !e.deleted && !deletedDebtEntriesStore.has(e.id)
    );
    fs.writeFileSync(DEBTS_CACHE_FILE, JSON.stringify(debtsList, null, 2), 'utf8');
    fs.writeFileSync(DEBTS_DELETED_FILE, JSON.stringify(Array.from(deletedDebtsStore), null, 2), 'utf8');
    fs.writeFileSync(DEBT_ENTRIES_CACHE_FILE, JSON.stringify(entriesList, null, 2), 'utf8');
    fs.writeFileSync(DEBT_ENTRIES_DELETED_FILE, JSON.stringify(Array.from(deletedDebtEntriesStore), null, 2), 'utf8');
  } catch {
    // Ignore cache write error
  }
}

loadPersistedDebtsCache();

async function syncDebtsToPeer(
  ownerId: string,
  kind: 'items' | 'entries',
  recordId: string,
  payload: any,
  isDelete = false
) {
  const peerSig = computePeerSignature(ownerId);
  if (!peerSig) return;
  try {
    const peerUrls = [DEV_APP_URL, PRE_APP_URL];
    for (const pUrl of peerUrls) {
      if (isDelete) {
        void fetch(`${pUrl}/api/users/${encodeURIComponent(ownerId)}/debts/${kind}/${encodeURIComponent(recordId)}?peer=1`, {
          method: 'DELETE',
          headers: { 'x-peer-signature': peerSig },
          signal: AbortSignal.timeout(3000),
        }).catch(() => {});
      } else {
        void fetch(`${pUrl}/api/users/${encodeURIComponent(ownerId)}/debts/${kind}?peer=1`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-peer-signature': peerSig,
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(3000),
        }).catch(() => {});
      }
    }
  } catch {
    // Ignore peer sync network error
  }
}

const ADMIN_TOKENS_CACHE_FILE = path.join(__dirname, '.sisa_uang_admin_tokens.json');
const OTP_RESEND_COOLDOWN_MS = 60 * 1000; // Minimum 60s between SMTP OTP dispatches per email
const OTP_RATE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes rate-limit window
const OTP_MAX_SENDS_PER_WINDOW = 6;

const otpChallenges = new Map<string, OtpChallenge>();
const otpSendRateTracker = new Map<string, { count: number; windowStart: number }>();
const verifiedAdminTokens = new Map<string, { email: string; verifiedAt: number }>();
const failedLoginTracker = new Map<string, number>();

function loadPersistedAdminTokens() {
  try {
    if (!fs.existsSync(ADMIN_TOKENS_CACHE_FILE)) return;
    const raw = fs.readFileSync(ADMIN_TOKENS_CACHE_FILE, 'utf8');
    const entries = JSON.parse(raw);
    const MAX_TOKEN_AGE_MS = 24 * 60 * 60 * 1000;
    const now = Date.now();
    if (Array.isArray(entries)) {
      for (const item of entries) {
        if (
          item &&
          typeof item.token === 'string' &&
          typeof item.email === 'string' &&
          typeof item.verifiedAt === 'number' &&
          now - item.verifiedAt <= MAX_TOKEN_AGE_MS
        ) {
          verifiedAdminTokens.set(item.token, {
            email: item.email.toLowerCase(),
            verifiedAt: item.verifiedAt,
          });
        }
      }
    }
  } catch {
    // Ignore token cache read error
  }
}

function savePersistedAdminTokens() {
  try {
    const MAX_TOKEN_AGE_MS = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const list: { token: string; email: string; verifiedAt: number }[] = [];
    for (const [token, val] of verifiedAdminTokens.entries()) {
      if (now - val.verifiedAt <= MAX_TOKEN_AGE_MS) {
        list.push({ token, email: val.email, verifiedAt: val.verifiedAt });
      } else {
        verifiedAdminTokens.delete(token);
      }
    }
    fs.writeFileSync(ADMIN_TOKENS_CACHE_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch {
    // Ignore token cache write error
  }
}

loadPersistedAdminTokens();

function checkOtpDispatchEligibility(emailRaw: string): {
  allowed: boolean;
  reusedChallenge?: OtpChallenge;
  cooldownRemainingSec: number;
  rateLimited?: boolean;
} {
  const now = Date.now();
  const existing = otpChallenges.get(emailRaw);
  if (existing && now < existing.expiresAt && existing.lastSentAt) {
    const elapsed = now - existing.lastSentAt;
    if (elapsed < OTP_RESEND_COOLDOWN_MS) {
      return {
        allowed: false,
        reusedChallenge: existing,
        cooldownRemainingSec: Math.max(1, Math.ceil((OTP_RESEND_COOLDOWN_MS - elapsed) / 1000)),
      };
    }
  }

  const rate = otpSendRateTracker.get(emailRaw);
  if (rate) {
    if (now - rate.windowStart > OTP_RATE_WINDOW_MS) {
      otpSendRateTracker.set(emailRaw, { count: 0, windowStart: now });
    } else if (rate.count >= OTP_MAX_SENDS_PER_WINDOW) {
      const waitSec = Math.max(1, Math.ceil((OTP_RATE_WINDOW_MS - (now - rate.windowStart)) / 1000));
      return {
        allowed: false,
        cooldownRemainingSec: waitSec,
        rateLimited: true,
      };
    }
  } else {
    otpSendRateTracker.set(emailRaw, { count: 0, windowStart: now });
  }

  return { allowed: true, cooldownRemainingSec: 0 };
}

function recordOtpSentRate(emailRaw: string) {
  const now = Date.now();
  const rate = otpSendRateTracker.get(emailRaw);
  if (!rate || now - rate.windowStart > OTP_RATE_WINDOW_MS) {
    otpSendRateTracker.set(emailRaw, { count: 1, windowStart: now });
  } else {
    rate.count += 1;
  }
}

function issueSuperAdminToken(email: string): string {
  const cleanEmail = email.toLowerCase();
  const verifiedAt = Date.now();
  const payload = {
    email: cleanEmail,
    iat: verifiedAt,
    jti: crypto.randomBytes(12).toString('hex'),
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(`sa1:${encoded}`)
    .digest('base64url');
  const adminToken = `sa1.${encoded}.${sig}`;
  verifiedAdminTokens.set(adminToken, {
    email: cleanEmail,
    verifiedAt,
  });
  savePersistedAdminTokens();
  return adminToken;
}

function isSmtpConfigured(): boolean {
  const user = (process.env.SMTP_USER || '').trim().replace(/^['"]|['"]$/g, '');
  const pass = (process.env.SMTP_PASS || '').trim().replace(/^['"]|['"]$/g, '');
  return Boolean(user && pass);
}

function appendLog(
  actorUid: string,
  actorEmail: string,
  action: string,
  detail: string,
  severity: 'info' | 'warning' | 'critical' = 'info'
): ServerActivityLog {
  const entry: ServerActivityLog = {
    id: `log_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    actorUid,
    actorEmail,
    action,
    detail: detail.slice(0, 250),
    severity,
    createdAt: nowIso(),
  };
  activityLogs.unshift(entry);
  if (activityLogs.length > 1000) {
    activityLogs.pop();
  }
  savePersistedLogsCache();
  return entry;
}

function createSecurityAlert(
  actorUid: string,
  actorEmail: string,
  title: string,
  description: string,
  severity: 'warning' | 'critical' = 'critical'
): ServerSecurityAlert {
  const alert: ServerSecurityAlert = {
    id: `alert_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    actorUid,
    actorEmail,
    title: title.slice(0, 100),
    description: description.slice(0, 300),
    severity,
    status: 'open',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  securityAlerts.unshift(alert);
  if (securityAlerts.length > 50) {
    securityAlerts.pop();
  }
  return alert;
}

function sanitizeUser(u: ServerUserRecord): Omit<ServerUserRecord, 'passwordHash'> {
  const { passwordHash: _, ...rest } = u;
  return rest;
}

function createSmtpTransporter() {
  const host = (process.env.SMTP_HOST || 'smtp.gmail.com').trim().replace(/^['"]|['"]$/g, '') || 'smtp.gmail.com';
  const rawPort = (process.env.SMTP_PORT || '465').trim().replace(/^['"]|['"]$/g, '');
  const parsedPort = Number(rawPort);
  const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 465;
  const user = (process.env.SMTP_USER || '').trim().replace(/^['"]|['"]$/g, '');
  // Strip surrounding quotes and whitespace (Gmail App Passwords are 16 chars, often copied as "xxxx xxxx xxxx xxxx")
  const rawPass = (process.env.SMTP_PASS || '').trim().replace(/^['"]|['"]$/g, '');
  const pass = host.includes('gmail.com') ? rawPass.replace(/\s+/g, '') : rawPass;

  if (!user || !pass) {
    throw new Error(
      'Konfigurasi SMTP (SMTP_USER / SMTP_PASS) belum diatur pada environment server.'
    );
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: port === 587,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    tls: {
      minVersion: 'TLSv1.2',
    },
    auth: {
      user,
      pass,
    },
  });
}

function formatSmtpErrorMessage(err: any, recipientEmail: string): string {
  const rawMsg = String(err?.message || err || '');
  if (rawMsg.includes('535') || rawMsg.includes('Username and Password not accepted') || rawMsg.includes('BadCredentials')) {
    return `Autentikasi SMTP Gmail ditolak (535-5.7.8). Google mewajibkan 16 karakter "App Password" (Sandi Aplikasi) pada variabel environment SMTP_PASS, bukan kata sandi akun Gmail biasa. Buat Sandi Aplikasi di myaccount.google.com/apppasswords lalu perbarui nilai SMTP_PASS.`;
  }
  return `Gagal mengirim email OTP ke ${recipientEmail}: ${rawMsg || 'Periksa konfigurasi SMTP_HOST, SMTP_PORT, SMTP_USER, dan SMTP_PASS.'}`;
}

async function sendSuperAdminOtpEmail(
  recipientEmail: string,
  otpCode: string
): Promise<{ messageId: string; accepted: string[]; response: string }> {
  const transporter = createSmtpTransporter();
  const smtpUser = (process.env.SMTP_USER || '').trim().replace(/^['"]|['"]$/g, '');
  const fromAddress = `"Sisa Uang Security" <${smtpUser}>`;

  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 28px; background-color: #f8fafc; border-radius: 16px; border: 1px solid #e2e8f0;">
      <div style="background-color: #ffffff; border-radius: 14px; padding: 28px; border: 1px solid #e2e8f0;">
        <div style="display: inline-block; padding: 6px 12px; background-color: #ecfdf5; color: #059669; font-size: 12px; font-weight: 700; border-radius: 9999px; letter-spacing: 0.04em; text-transform: uppercase;">
          Sisa Uang · Keamanan 2FA Super Admin
        </div>
        <h2 style="margin: 16px 0 8px; color: #0f172a; font-size: 20px; font-weight: 700;">
          Kode Verifikasi Masuk (OTP)
        </h2>
        <p style="margin: 0 0 20px; color: #475569; font-size: 14px; line-height: 1.6;">
          Berikut adalah 6 digit kode verifikasi sekali pakai (OTP) untuk menyelesaikan autentikasi Super Administrator (<strong>${recipientEmail}</strong>):
        </p>
        <div style="background-color: #f1f5f9; border: 1px dashed #cbd5e1; border-radius: 12px; padding: 18px; text-align: center; margin-bottom: 20px;">
          <span style="font-family: 'JetBrains Mono', 'Courier New', monospace; font-size: 32px; font-weight: 800; letter-spacing: 0.3em; color: #059669;">
            ${otpCode}
          </span>
        </div>
        <p style="margin: 0 0 8px; color: #64748b; font-size: 12px; line-height: 1.5;">
          Kode ini berlaku selama <strong>10 menit</strong>. Jangan bagikan kode ini kepada siapa pun.
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p style="margin: 0; color: #94a3b8; font-size: 11px;">
          Sisa Uang — Your Finance Assistant · v1.0.3
        </p>
      </div>
    </div>
  `;

  const info = await transporter.sendMail({
    from: fromAddress,
    to: recipientEmail,
    subject: `[Sisa Uang] Kode OTP Super Admin: ${otpCode}`,
    text: `Kode verifikasi Super Admin Sisa Uang Anda adalah: ${otpCode}. Berlaku selama 10 menit.`,
    html: htmlContent,
  });

  const accepted = Array.isArray(info?.accepted) ? info.accepted.map(String) : [];
  const rejected = Array.isArray(info?.rejected) ? info.rejected.map(String) : [];
  if (rejected.length > 0 && accepted.length === 0) {
    throw new Error(`Server SMTP menolak penerima ${rejected.join(', ')}: ${info?.response || 'Rejected'}`);
  }
  if (accepted.length === 0) {
    throw new Error(`Server SMTP tidak mengonfirmasi penerimaan email untuk ${recipientEmail}.`);
  }

  return {
    messageId: String(info?.messageId || ''),
    accepted,
    response: String(info?.response || ''),
  };
}

async function sendPrimaryDeviceOtpEmail(
  recipientEmail: string,
  otpCode: string,
  deviceName: string
): Promise<void> {
  const transporter = createSmtpTransporter();
  const fromAddress = `"Sisa Uang Security" <${(process.env.SMTP_USER || '').trim().replace(/^['"]|['"]$/g, '')}>`;

  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 28px; background-color: #f8fafc; border-radius: 16px; border: 1px solid #e2e8f0;">
      <div style="background-color: #ffffff; border-radius: 14px; padding: 28px; border: 1px solid #e2e8f0;">
        <div style="display: inline-block; padding: 6px 12px; background-color: #ecfdf5; color: #059669; font-size: 12px; font-weight: 700; border-radius: 9999px; letter-spacing: 0.04em; text-transform: uppercase;">
          Sisa Uang · Otorisasi Perangkat Utama
        </div>
        <h2 style="margin: 16px 0 8px; color: #0f172a; font-size: 20px; font-weight: 700;">
          Kode OTP Verifikasi Perangkat Utama
        </h2>
        <p style="margin: 0 0 16px; color: #475569; font-size: 14px; line-height: 1.6;">
          Anda meminta untuk menetapkan <strong>${deviceName}</strong> sebagai <strong>Perangkat Utama</strong> pada akun <strong>${recipientEmail}</strong>. Perangkat utama memiliki hak akses penuh untuk mencabut/menghapus sesi login pada perangkat lain.
        </p>
        <div style="background-color: #f1f5f9; border: 1px dashed #cbd5e1; border-radius: 12px; padding: 18px; text-align: center; margin-bottom: 20px;">
          <span style="font-family: 'JetBrains Mono', 'Courier New', monospace; font-size: 32px; font-weight: 800; letter-spacing: 0.3em; color: #059669;">
            ${otpCode}
          </span>
        </div>
        <p style="margin: 0 0 8px; color: #64748b; font-size: 12px; line-height: 1.5;">
          Kode ini berlaku selama <strong>10 menit</strong>. Jika Anda tidak merasa melakukan permintaan ini, abaikan email ini.
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p style="margin: 0; color: #94a3b8; font-size: 11px;">
          Sisa Uang — Your Finance Assistant · v1.0.3
        </p>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from: fromAddress,
    to: recipientEmail,
    subject: `[Sisa Uang] Kode OTP Perangkat Utama: ${otpCode}`,
    text: `Kode OTP untuk mengatur ${deviceName} sebagai Perangkat Utama akun Sisa Uang (${recipientEmail}) adalah: ${otpCode}. Berlaku selama 10 menit.`,
    html: htmlContent,
  });
}

async function sendProSubscriptionPaymentEmail(payload: {
  recipientEmail: string;
  userUid: string;
  userDisplayName: string;
  userEmail: string;
  plan: 'monthly' | 'yearly';
  paymentMethod: 'qris' | 'bank_transfer';
  senderName: string;
  transferNote: string;
  proofDataUrl: string;
  proofFileName: string;
  requestedAt: string;
}): Promise<void> {
  const transporter = createSmtpTransporter();
  const fromAddress = `"Sisa Uang Billing" <${(process.env.SMTP_USER || '').trim().replace(/^['"]|['"]$/g, '')}>`;
  const planLabel = payload.plan === 'yearly' ? 'Tahunan (12 Bulan)' : 'Bulanan (1 Bulan)';
  const priceLabel = payload.plan === 'yearly' ? 'Rp 249.000 / tahun' : 'Rp 25.000 / bulan';
  const methodLabel = payload.paymentMethod === 'qris' ? 'QRIS Instant' : 'Transfer Bank';

  const attachments: any[] = [];
  if (payload.proofDataUrl && payload.proofDataUrl.startsWith('data:')) {
    const match = payload.proofDataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      const mimeType = match[1];
      const base64Data = match[2];
      attachments.push({
        filename: payload.proofFileName || `bukti-transfer-${payload.userUid}.png`,
        content: Buffer.from(base64Data, 'base64'),
        contentType: mimeType,
        cid: 'payment_proof_img',
      });
    }
  }

  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 28px; background-color: #f8fafc; border-radius: 16px; border: 1px solid #e2e8f0;">
      <div style="background-color: #ffffff; border-radius: 14px; padding: 28px; border: 1px solid #e2e8f0;">
        <div style="display: inline-block; padding: 6px 12px; background-color: #ecfdf5; color: #059669; font-size: 12px; font-weight: 700; border-radius: 9999px; letter-spacing: 0.04em; text-transform: uppercase;">
          SisaUang Pro · Konfirmasi Pembayaran Baru
        </div>
        <h2 style="margin: 16px 0 8px; color: #0f172a; font-size: 20px; font-weight: 700;">
          Pengajuan Langganan SisaUang Pro (Status: PENDING)
        </h2>
        <p style="margin: 0 0 20px; color: #475569; font-size: 14px; line-height: 1.6;">
          Pengguna berikut telah mengunggah bukti pembayaran langganan <strong>SisaUang Pro</strong> dan menunggu persetujuan di Control Panel Super Admin:
        </p>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px;">
          <tr>
            <td style="padding: 8px 12px; border: 1px solid #e2e8f0; background: #f8fafc; color: #64748b; width: 38%;">Nama Pengguna</td>
            <td style="padding: 8px 12px; border: 1px solid #e2e8f0; font-weight: 700; color: #0f172a;">${payload.userDisplayName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; border: 1px solid #e2e8f0; background: #f8fafc; color: #64748b;">Email Akun</td>
            <td style="padding: 8px 12px; border: 1px solid #e2e8f0; font-family: monospace; color: #0f172a;">${payload.userEmail}</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; border: 1px solid #e2e8f0; background: #f8fafc; color: #64748b;">Pilihan Paket</td>
            <td style="padding: 8px 12px; border: 1px solid #e2e8f0; font-weight: 700; color: #059669;">SisaUang Pro — ${planLabel} (${priceLabel})</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; border: 1px solid #e2e8f0; background: #f8fafc; color: #64748b;">Metode Pembayaran</td>
            <td style="padding: 8px 12px; border: 1px solid #e2e8f0; font-weight: 600; color: #0f172a;">${methodLabel}</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; border: 1px solid #e2e8f0; background: #f8fafc; color: #64748b;">Nama Pengirim / Catatan</td>
            <td style="padding: 8px 12px; border: 1px solid #e2e8f0; color: #0f172a;">${payload.senderName || '-'} ${payload.transferNote ? `(${payload.transferNote})` : ''}</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; border: 1px solid #e2e8f0; background: #f8fafc; color: #64748b;">Waktu Pengajuan</td>
            <td style="padding: 8px 12px; border: 1px solid #e2e8f0; font-family: monospace; color: #0f172a;">${payload.requestedAt}</td>
          </tr>
        </table>

        <p style="margin: 0 0 12px; color: #475569; font-size: 13px; font-weight: 600;">
          Lampiran Bukti Transfer (${payload.proofFileName}):
        </p>
        ${
          attachments.length > 0
            ? `<div style="margin-bottom: 18px; text-align: center;"><img src="cid:payment_proof_img" alt="Bukti Transfer" style="max-width: 100%; max-height: 480px; border-radius: 12px; border: 1px solid #cbd5e1;" /></div>`
            : ''
        }
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p style="margin: 0; color: #64748b; font-size: 12px;">
          Silakan buka menu <strong>Control Panel Super Admin</strong> di Sisa Uang untuk meninjau bukti transfer dan menyetujui (Approve) langganan SisaUang Pro pengguna ini.
        </p>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from: fromAddress,
    to: payload.recipientEmail,
    subject: `[SisaUang Pro] Konfirmasi Pembayaran ${planLabel} — ${payload.userDisplayName} (${payload.userEmail})`,
    text: `Konfirmasi Pembayaran SisaUang Pro baru dari ${payload.userDisplayName} (${payload.userEmail}). Paket: ${planLabel} (${priceLabel}). Metode: ${methodLabel}. Silakan setujui di Control Panel Super Admin.`,
    html: htmlContent,
    attachments,
  });
}

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  const isExplicitDevPortMode = process.env.NODE_ENV === 'development' || process.env.npm_lifecycle_event === 'dev';
  let selectedPort = 3000;
  const portArgIdx = process.argv.indexOf('--port');
  if (portArgIdx !== -1 && process.argv[portArgIdx + 1]) {
    selectedPort = Number(process.argv[portArgIdx + 1]) || 3000;
  } else if (!isExplicitDevPortMode && process.env.PORT) {
    selectedPort = Number(String(process.env.PORT).trim()) || 3000;
  }
  const PORT = selectedPort;

  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ limit: '100mb', extended: true }));
  app.use('/api', (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    next();
  });

  // =========================================================================
  // Signed User Session Tokens & Server-Side Identity Verification Helpers
  // =========================================================================
  const USER_TOKEN_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
  const verifiedFirebaseTokenCache = new Map<
    string,
    { uid: string; email: string; displayName: string; exp: number }
  >();

  interface UserSessionPayload {
    uid: string;
    email: string;
    role: 'user' | 'admin';
    exp: number;
  }

  function issueUserSessionToken(user: Pick<ServerUserRecord, 'uid' | 'email' | 'role'>): string {
    const payload: UserSessionPayload = {
      uid: String(user.uid).trim(),
      email: String(user.email).trim().toLowerCase(),
      role: user.role === 'admin' ? 'admin' : 'user',
      exp: Date.now() + USER_TOKEN_MAX_AGE_MS,
    };
    const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const sig = crypto
      .createHmac('sha256', getSessionSecret())
      .update(encoded)
      .digest('base64url');
    return `${encoded}.${sig}`;
  }

  function verifyUserSessionToken(token: string): UserSessionPayload | null {
    if (!token || !token.includes('.')) return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [encoded, sig] = parts;
    if (!encoded || !sig) return null;

    const expectedSig = crypto
      .createHmac('sha256', getSessionSecret())
      .update(encoded)
      .digest('base64url');
    if (sig.length !== expectedSig.length) return null;
    try {
      if (!crypto.timingSafeEqual(Buffer.from(sig, 'utf8'), Buffer.from(expectedSig, 'utf8'))) {
        return null;
      }
      const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as UserSessionPayload;
      if (!parsed?.uid || !parsed?.email || typeof parsed.exp !== 'number') return null;
      if (Date.now() > parsed.exp) return null;
      const storeUser = usersStore.get(parsed.uid);
      if (storeUser?.status === 'blocked') return null;
      return parsed;
    } catch {
      return null;
    }
  }

  async function verifyFirebaseIdToken(
    idToken: string
  ): Promise<{ uid: string; email: string; displayName: string } | null> {
    const clean = String(idToken || '').trim();
    if (!clean || clean.length < 20) return null;
    const cacheKey = crypto.createHash('sha256').update(clean).digest('hex');
    const cached = verifiedFirebaseTokenCache.get(cacheKey);
    if (cached && cached.exp > Date.now()) {
      return { uid: cached.uid, email: cached.email, displayName: cached.displayName };
    }

    try {
      const lookupRes = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(firebaseServerConfig.apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken: clean }),
          signal: AbortSignal.timeout(8000),
        }
      );
      if (!lookupRes.ok) return null;
      const lookupData = (await lookupRes.json()) as {
        users?: Array<{
          localId?: string;
          email?: string;
          displayName?: string;
          disabled?: boolean;
        }>;
      };
      const fbUser = lookupData?.users?.[0];
      if (!fbUser?.localId || fbUser.disabled) return null;

      const resolved = {
        uid: String(fbUser.localId).trim(),
        email: String(fbUser.email || '').trim().toLowerCase(),
        displayName: String(fbUser.displayName || '').trim(),
      };
      if (!resolved.email) return null;

      if (verifiedFirebaseTokenCache.size > 500) {
        verifiedFirebaseTokenCache.clear();
      }
      verifiedFirebaseTokenCache.set(cacheKey, {
        ...resolved,
        exp: Date.now() + 30_000,
      });
      return resolved;
    } catch {
      return null;
    }
  }

  function validateVerifiedAdminToken(adminToken: string | undefined): { email: string } | null {
    if (!adminToken) return null;
    const MAX_TOKEN_AGE_MS = 24 * 60 * 60 * 1000;
    const session = verifiedAdminTokens.get(adminToken);
    if (session) {
      if (Date.now() - session.verifiedAt > MAX_TOKEN_AGE_MS) {
        verifiedAdminTokens.delete(adminToken);
        savePersistedAdminTokens();
        return null;
      }
      const email = session.email.toLowerCase();
      if (email !== SUPER_ADMIN_EMAIL && email !== WORKSPACE_ADMIN_EMAIL) {
        return null;
      }
      return { email };
    }

    if (adminToken.startsWith('sa1.')) {
      const parts = adminToken.split('.');
      if (parts.length !== 3) return null;
      const [, encoded, sig] = parts;
      if (!encoded || !sig) return null;
      const expectedSig = crypto
        .createHmac('sha256', getSessionSecret())
        .update(`sa1:${encoded}`)
        .digest('base64url');
      if (sig.length !== expectedSig.length) return null;
      try {
        if (!crypto.timingSafeEqual(Buffer.from(sig, 'utf8'), Buffer.from(expectedSig, 'utf8'))) {
          return null;
        }
        const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as {
          email?: string;
          iat?: number;
        };
        const email = String(parsed?.email || '').trim().toLowerCase();
        const iat = Number(parsed?.iat || 0);
        if (!email || !iat || Date.now() - iat > MAX_TOKEN_AGE_MS) return null;
        if (email !== SUPER_ADMIN_EMAIL && email !== WORKSPACE_ADMIN_EMAIL) return null;
        verifiedAdminTokens.set(adminToken, { email, verifiedAt: iat });
        return { email };
      } catch {
        return null;
      }
    }

    return null;
  }

  async function doesCallerOwnTargetUid(
    callerUid: string,
    callerEmail: string,
    targetUid: string
  ): Promise<boolean> {
    const cleanCallerUid = callerUid.trim().replace(/[^a-zA-Z0-9_\-]/g, '_');
    const cleanTargetUid = targetUid.trim().replace(/[^a-zA-Z0-9_\-]/g, '_');
    if (!cleanTargetUid || cleanCallerUid === cleanTargetUid || callerUid.trim() === targetUid.trim()) {
      return true;
    }
    const normEmail = callerEmail.trim().toLowerCase();
    if (!normEmail) return false;

    const targetRecord = usersStore.get(targetUid.trim()) || usersStore.get(cleanTargetUid);
    if (targetRecord?.email && targetRecord.email.trim().toLowerCase() === normEmail) {
      return true;
    }

    if (serverDb) {
      try {
        await ensureServerFirebaseSignedIn();
        if (serverAuth?.currentUser) {
          const snap = await serverFsGetDoc(serverFsDoc(serverDb, 'users', cleanTargetUid));
          if (snap.exists()) {
            const fsEmail = String(snap.data()?.email || '').trim().toLowerCase();
            if (fsEmail && fsEmail === normEmail) {
              return true;
            }
          }
        }
      } catch {
        // Ignore Firestore SDK lookup failure and try REST fallback below
      }
      try {
        const restToken = await getServerWorkerRestToken();
        if (restToken) {
          const restSnap = await firestoreRestGetDocRaw(restToken, 'users', cleanTargetUid);
          if (restSnap.exists) {
            const fsEmail = String(decodeFirestoreRestFields(restSnap.fields).email || '').trim().toLowerCase();
            if (fsEmail && fsEmail === normEmail) {
              return true;
            }
          }
        }
      } catch {
        // Ignore Firestore REST lookup fallback failure
      }
    }
    return false;
  }

  async function verifyCallerAuth(
    req: Request,
    expectedOwnerUid?: string
  ): Promise<
    | { ok: true; uid: string; email: string; isAdmin: boolean }
    | { ok: false; status: number; code?: string; error: string }
  > {
    const adminSession = validateVerifiedAdminToken(
      req.headers['x-admin-token'] as string | undefined
    );
    if (adminSession) {
      return {
        ok: true,
        uid: (expectedOwnerUid || 'admin_vuedevo_01').trim(),
        email: adminSession.email,
        isAdmin: true,
      };
    }

    let rejectedUserToken = false;
    const userToken = String(req.headers['x-user-token'] || '').trim();
    if (userToken) {
      const payload = verifyUserSessionToken(userToken);
      if (payload) {
        if (expectedOwnerUid) {
          const owns = await doesCallerOwnTargetUid(payload.uid, payload.email, expectedOwnerUid);
          if (!owns) {
            return {
              ok: false,
              status: 403,
              code: 'FORBIDDEN_OWNER',
              error: 'Akses ditolak: Anda tidak berwenang mengakses data pengguna ini.',
            };
          }
        }
        return {
          ok: true,
          uid: expectedOwnerUid ? expectedOwnerUid.trim() : payload.uid,
          email: payload.email,
          isAdmin: false,
        };
      }
      // Do not immediately reject with 401 when userToken fails HMAC (e.g. server restarted);
      // allow fallback to Authorization: Bearer Firebase ID token below.
      rejectedUserToken = true;
    }

    const authHeader = String(req.headers.authorization || '').trim();
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match?.[1]) {
      const fbUser = await verifyFirebaseIdToken(match[1]);
      if (!fbUser) {
        return {
          ok: false,
          status: 401,
          code: 'SESSION_EXPIRED',
          error: 'Token autentikasi tidak valid atau sudah kedaluwarsa.',
        };
      }
      const isSuperAdminEmail =
        fbUser.email === SUPER_ADMIN_EMAIL || fbUser.email === WORKSPACE_ADMIN_EMAIL;
      if (isSuperAdminEmail) {
        return {
          ok: false,
          status: 403,
          code: 'ADMIN_2FA_REQUIRED',
          error: 'Verifikasi 2FA Super Admin diperlukan sebelum mengakses sumber daya.',
        };
      }
      const storeUser = usersStore.get(fbUser.uid);
      if (storeUser?.status === 'blocked') {
        return {
          ok: false,
          status: 403,
          code: 'ACCOUNT_BLOCKED',
          error: 'Akses akun Anda sedang diblokir oleh Administrator.',
        };
      }
      if (expectedOwnerUid) {
        const owns = await doesCallerOwnTargetUid(fbUser.uid, fbUser.email, expectedOwnerUid);
        if (!owns) {
          return {
            ok: false,
            status: 403,
            code: 'FORBIDDEN_OWNER',
            error: 'Akses ditolak: Anda tidak berwenang mengakses data pengguna ini.',
          };
        }
      }
      return {
        ok: true,
        uid: expectedOwnerUid ? expectedOwnerUid.trim() : fbUser.uid,
        email: fbUser.email,
        isAdmin: false,
      };
    }

    return {
      ok: false,
      status: 401,
      code: 'SESSION_EXPIRED',
      error: rejectedUserToken
        ? 'Sesi login tidak valid atau telah kedaluwarsa. Silakan masuk kembali.'
        : 'Sesi autentikasi diperlukan. Silakan masuk terlebih dahulu.',
    };
  }

  async function authorizeUserOrPeer(
    req: Request,
    targetUid?: string
  ): Promise<
    | { ok: true; uid: string; email: string; isAdmin: boolean; isPeer: boolean }
    | { ok: false; status: number; code?: string; error: string }
  > {
    if (targetUid && isAuthorizedPeerRequest(req, targetUid)) {
      return { ok: true, uid: targetUid, email: '', isAdmin: false, isPeer: true };
    }
    const authRes = await verifyCallerAuth(req, targetUid);
    if (!authRes.ok) return authRes;
    return { ...authRes, isPeer: false };
  }

  // =========================================================================
  // Middleware: Verify Super Admin Token for /api/admin/* protected routes
  // =========================================================================
  const requireAdminMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const adminToken = req.headers['x-admin-token'] as string | undefined;
    const actorEmail = (req.headers['x-actor-email'] as string | undefined)?.toLowerCase() || '';

    // Token is strictly mandatory: No email header bypass, no unverified token lengths
    if (!adminToken) {
      appendLog(
        'unknown_actor',
        actorEmail || 'anonymous',
        'unauthorized_control_panel',
        `Akses admin (${req.path}) ditolak: x-admin-token tidak disertakan.`,
        'critical'
      );
      res.status(403).json({
        error: 'Akses ditolak: Token autentikasi Super Admin tidak ditemukan. Silakan login kembali dengan verifikasi 2FA.',
      });
      return;
    }

    const verifiedAdmin = validateVerifiedAdminToken(adminToken);
    if (!verifiedAdmin) {
      appendLog(
        'unknown_actor',
        actorEmail || 'anonymous',
        'invalid_admin_token',
        `Akses admin (${req.path}) ditolak: token admin tidak valid atau sudah kedaluwarsa.`,
        'critical'
      );
      res.status(403).json({
        error: 'Sesi Super Admin tidak valid atau telah kedaluwarsa. Silakan login kembali.',
      });
      return;
    }

    next();
  };

  // =========================================================================
  // Public & Auth Endpoints (Consumed via Axios)
  // =========================================================================

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      appName: 'Sisa Uang',
      firestoreProject: 'sisa-uang',
      exchangeRateUsdToIdr: 15850,
      timestamp: nowIso(),
      serverTimeMs: Date.now(),
    });
  });

  // Helper to resolve a user by email or username via server Firestore (with REST fallback)
  async function findUserInServerFirestore(
    identifierRaw: string,
    callerIdToken?: string
  ): Promise<ServerUserRecord | undefined> {
    if (!serverDb) return undefined;
    const clean = identifierRaw.trim().toLowerCase().replace(/^@+/, '');
    const normalized = clean.replace(/\s+/g, '_');
    if (!clean) return undefined;

    const toUserRecord = (uid: string, data: Record<string, any>): ServerUserRecord | undefined => {
      const email = String(data.email || '').trim().toLowerCase();
      if (!uid || !email) return undefined;
      const isSuper = email === SUPER_ADMIN_EMAIL || email === WORKSPACE_ADMIN_EMAIL || uid === 'admin_vuedevo_01';
      const isDeactivated = Boolean(data.isExplicitlyDeactivated === true);
      const isPro =
        !isDeactivated &&
        (data.isPro === true || data.subscriptionStatus === 'pro') &&
        isUserSubscriptionActive({
          isPro: true,
          subscriptionStatus: 'pro',
          subscriptionExpiresAt: data.subscriptionExpiresAt,
          isExplicitlyDeactivated: isDeactivated,
        });
      const isPending = !isDeactivated && !isPro && data.subscriptionStatus === 'pending';
      const existing = usersStore.get(uid);
      const record: ServerUserRecord = {
        uid,
        username: String(data.username || email.split('@')[0] || uid).toLowerCase(),
        email,
        displayName: String(data.displayName || data.username || email.split('@')[0] || uid),
        role: isSuper ? 'admin' : data.role === 'admin' ? 'admin' : 'user',
        status: data.status === 'blocked' ? 'blocked' : 'active',
        authProvider: data.authProvider === 'google' ? 'google' : 'password',
        currency: data.currency === 'USD' ? 'USD' : 'IDR',
        subscriptionStatus: isPro ? 'pro' : isPending ? 'pending' : 'free',
        isPro,
        isExplicitlyDeactivated: isDeactivated,
        subscriptionPlan: isPro || isPending ? (data.subscriptionPlan === 'yearly' ? 'yearly' : 'monthly') : null,
        subscriptionExpiresAt: isPro ? data.subscriptionExpiresAt || null : null,
        passwordHash: data.passwordHash || existing?.passwordHash,
        createdAt: tsToIsoValue(data.createdAt || existing?.createdAt || nowIso()),
        updatedAt: tsToIsoValue(data.updatedAt || existing?.updatedAt || nowIso()),
      };
      usersStore.set(uid, record);
      savePersistedUsersCache();
      return record;
    };

    try {
      await ensureServerFirebaseSignedIn();
      const colRef = serverFsCollection(serverDb, 'users');
      let snap: any = null;
      if (clean.includes('@')) {
        snap = await serverFsGetDocs(serverFsQuery(colRef, serverFsWhere('email', '==', clean), serverFsLimit(1)));
      }
      if (!snap || snap.empty) {
        snap = await serverFsGetDocs(serverFsQuery(colRef, serverFsWhere('username', '==', clean), serverFsLimit(1)));
      }
      if ((!snap || snap.empty) && normalized !== clean) {
        snap = await serverFsGetDocs(serverFsQuery(colRef, serverFsWhere('username', '==', normalized), serverFsLimit(1)));
      }
      if (snap && !snap.empty) {
        const d = snap.docs[0];
        return toUserRecord(d.id, d.data() as Record<string, any>);
      }
    } catch {
      // Fall through to REST lookup below
    }

    const restToken = (await getServerWorkerRestToken()) || (callerIdToken ? String(callerIdToken).trim() : '');
    if (!restToken) return undefined;
    try {
      if (clean.includes('@')) {
        const rows = await firestoreRestRunQuery(
          restToken,
          'users',
          [{ field: 'email', op: '==', value: clean }],
          [],
          1
        );
        if (rows.length > 0) return toUserRecord(rows[0].id, rows[0].data);
      }
      const uRows = await firestoreRestRunQuery(
        restToken,
        'users',
        [{ field: 'username', op: '==', value: clean }],
        [],
        1
      );
      if (uRows.length > 0) return toUserRecord(uRows[0].id, uRows[0].data);
      if (normalized !== clean) {
        const nRows = await firestoreRestRunQuery(
          restToken,
          'users',
          [{ field: 'username', op: '==', value: normalized }],
          [],
          1
        );
        if (nRows.length > 0) return toUserRecord(nRows[0].id, nRows[0].data);
      }
    } catch {
      // Ignore REST lookup error
    }
    return undefined;
  }

  // Authenticate with Email or Username & Password
  app.post('/api/auth/login', async (req: Request, res: Response) => {
    const identifierRaw = String(req.body?.identifier || req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!identifierRaw || !password) {
      res.status(400).json({ error: 'Email / Username dan kata sandi wajib diisi.' });
      return;
    }

    // Two-pass exact lookup in memory (email or username first, email local-part second)
    const normalizedIdentifier = identifierRaw.replace(/\s+/g, '_').replace(/^@+/, '');
    const findMatchingUserInStore = (): ServerUserRecord | undefined => {
      for (const u of usersStore.values()) {
        const uEmail = String(u.email || '').trim().toLowerCase();
        const uUsername = String(u.username || '').trim().toLowerCase().replace(/^@+/, '');
        if (
          uEmail === identifierRaw ||
          (uUsername && (uUsername === identifierRaw || uUsername === normalizedIdentifier))
        ) {
          return u;
        }
      }
      if (!identifierRaw.includes('@')) {
        for (const u of usersStore.values()) {
          const uEmailLocal = String(u.email || '').trim().toLowerCase().split('@')[0];
          if (uEmailLocal === identifierRaw) {
            return u;
          }
        }
      }
      return undefined;
    };

    let matchedUser: ServerUserRecord | undefined = findMatchingUserInStore();
    if (!matchedUser) {
      loadPersistedUsersCache();
      matchedUser = findMatchingUserInStore();
    }
    if (!matchedUser) {
      matchedUser = await findUserInServerFirestore(identifierRaw);
    }

    const incomingHash = hashPassword(password);
    const isSuperAdminIdentifier =
      identifierRaw === SUPER_ADMIN_EMAIL ||
      identifierRaw === WORKSPACE_ADMIN_EMAIL ||
      identifierRaw === SUPER_ADMIN_USERNAME ||
      identifierRaw === 'dark.notes' ||
      matchedUser?.email.toLowerCase() === SUPER_ADMIN_EMAIL ||
      matchedUser?.email.toLowerCase() === WORKSPACE_ADMIN_EMAIL ||
      matchedUser?.uid === 'admin_vuedevo_01';

    if (isSuperAdminIdentifier) {
      const targetEmailForOtp =
        identifierRaw === WORKSPACE_ADMIN_EMAIL ||
        matchedUser?.email.toLowerCase() === WORKSPACE_ADMIN_EMAIL
          ? WORKSPACE_ADMIN_EMAIL
          : SUPER_ADMIN_EMAIL;

      const envSuperPassword = (process.env.SUPER_ADMIN_FIREBASE_PASSWORD || '').trim();
      const isSuperPasswordValid =
        incomingHash === superAdminPasswordHash ||
        verifyPasswordAgainstStoredHash(password, superAdminPasswordHash) ||
        (matchedUser?.passwordHash
          ? verifyPasswordAgainstStoredHash(password, matchedUser.passwordHash)
          : false) ||
        Boolean(envSuperPassword && password === envSuperPassword);

      if (!isSuperPasswordValid) {
        const fails = (failedLoginTracker.get(targetEmailForOtp) || 0) + 1;
        failedLoginTracker.set(targetEmailForOtp, fails);

        appendLog(
          'admin_vuedevo_01',
          targetEmailForOtp,
          'failed_admin_login',
          `Percobaan login Super Admin gagal (percobaan ke-${fails}).`,
          fails >= 2 ? 'critical' : 'warning'
        );

        if (fails >= 2) {
          createSecurityAlert(
            'admin_vuedevo_01',
            targetEmailForOtp,
            'Percobaan Brute-Force Akun Super Admin',
            `Terdeteksi ${fails} kali kesalahan kata sandi berturut-turut pada akun Super Admin (${targetEmailForOtp}).`,
            'critical'
          );
        }

        res.status(401).json({ error: 'Email/Username atau kata sandi Super Admin tidak sesuai.' });
        return;
      }

      if (
        !getServerFirebasePassword() &&
        targetEmailForOtp === SUPER_ADMIN_EMAIL &&
        serverAuth &&
        Date.now() >= serverFirebaseRateLimitedUntil
      ) {
        try {
          await serverFsSignIn(serverAuth, SUPER_ADMIN_EMAIL, password);
          runtimeServerFbPassword = password;
          lastServerFirebaseAuthError = null;
          serverFirebaseRateLimitedUntil = 0;
        } catch (err: any) {
          if (isFirebaseTooManyAttemptsError(err)) {
            serverFirebaseRateLimitedUntil = Date.now() + FIREBASE_RATE_LIMIT_COOLDOWN_MS;
          }
          // Do not cache an unverified app password as Firebase Auth password
        }
      }

      failedLoginTracker.delete(targetEmailForOtp);
      const fallbackAdmin = usersStore.get('admin_vuedevo_01')!;
      const adminUser: ServerUserRecord = matchedUser
        ? { ...matchedUser, role: 'admin', email: matchedUser.email || targetEmailForOtp }
        : { ...fallbackAdmin, email: targetEmailForOtp };
      adminUser.updatedAt = nowIso();
      if (matchedUser) {
        matchedUser.updatedAt = adminUser.updatedAt;
      }
      savePersistedUsersCache();

      // Generate 6-digit email verification code exclusively for Super Admin (protected by cooldown & rate limit)
      const recipientEmail = (adminUser.email || targetEmailForOtp).trim().toLowerCase();
      const eligibility = checkOtpDispatchEligibility(recipientEmail);

      if (!eligibility.allowed && eligibility.reusedChallenge) {
        res.json({
          user: sanitizeUser(adminUser),
          requiresOtp: true,
          otpVerified: false,
          otpDispatch: {
            email: recipientEmail,
            expiresAt: eligibility.reusedChallenge.expiresAt,
            sent: true,
            smtpSent: true,
            reusedExisting: true,
            cooldownRemainingSec: eligibility.cooldownRemainingSec,
            smtpError: null,
            smtpMessageId: null,
            message: `Kode OTP sebelumnya masih berlaku dan telah dikirim ke ${recipientEmail}. Tunggu ${eligibility.cooldownRemainingSec} detik untuk mengirim ulang.`,
          },
        });
        return;
      }

      if (!eligibility.allowed && eligibility.rateLimited) {
        res.status(429).json({
          error: `Terlalu banyak permintaan kode OTP. Silakan tunggu sekitar ${Math.ceil(eligibility.cooldownRemainingSec / 60)} menit sebelum mencoba lagi.`,
        });
        return;
      }

      const otpCode = String(crypto.randomInt(100000, 999999));
      const expiresAt = Date.now() + 10 * 60 * 1000;
      otpChallenges.set(recipientEmail, {
        email: recipientEmail,
        code: otpCode,
        expiresAt,
        attempts: 0,
        lastSentAt: Date.now(),
      });
      recordOtpSentRate(recipientEmail);

      // Strict Security: DO NOT issue or return adminToken or OTP code in response during initial login.
      let smtpSent = false;
      let smtpError: string | null = null;
      let smtpMessageId: string | null = null;

      if (isSmtpConfigured()) {
        try {
          const mailResult = await sendSuperAdminOtpEmail(recipientEmail, otpCode);
          smtpSent = true;
          smtpMessageId = mailResult.messageId || null;
        } catch (mailErr: any) {
          smtpError = formatSmtpErrorMessage(mailErr, recipientEmail);
          console.error('[SMTP SuperAdmin OTP Login Error]', mailErr?.message || mailErr);
          appendLog(
            adminUser.uid,
            recipientEmail,
            'smtp_otp_delivery_failed',
            `Pengiriman OTP email gagal (${smtpError}).`,
            'warning'
          );
        }
      } else {
        smtpError = 'Konfigurasi SMTP (SMTP_USER / SMTP_PASS) belum diatur pada environment server.';
        console.warn('[SMTP SuperAdmin OTP Login Notice]', smtpError);
        appendLog(
          adminUser.uid,
          recipientEmail,
          'smtp_otp_delivery_failed',
          `Pengiriman OTP email dilewati karena konfigurasi SMTP server belum lengkap.`,
          'warning'
        );
      }

      appendLog(
        adminUser.uid,
        recipientEmail,
        'admin_otp_dispatched',
        smtpSent
          ? `Kode OTP 2FA berhasil dikirim via SMTP ke Super Admin (${recipientEmail})${smtpMessageId ? ` [ID: ${smtpMessageId}]` : ''}.`
          : `Tantangan verifikasi 2FA OTP dibuat untuk Super Admin (${recipientEmail}), namun pengiriman email SMTP gagal.`,
        smtpSent ? 'info' : 'warning'
      );

      res.json({
        user: sanitizeUser(adminUser),
        requiresOtp: true,
        otpVerified: false,
        otpDispatch: {
          email: recipientEmail,
          expiresAt,
          sent: smtpSent,
          smtpSent,
          cooldownRemainingSec: 60,
          smtpError,
          smtpMessageId,
          message: smtpSent
            ? `Kode OTP 6 digit telah dikirim ke email ${recipientEmail}.`
            : smtpError || `Gagal mengirim email OTP ke ${recipientEmail}.`,
        },
      });
      return;
    }

    // Normal or Firebase Auth or CI4 Shield migrated user login
    let isPasswordValid = matchedUser
      ? matchedUser.passwordHash
        ? verifyPasswordAgainstStoredHash(password, matchedUser.passwordHash)
        : false
      : false;

    if (!isPasswordValid && identifierRaw.includes('@')) {
      try {
        const signInRes = await fetch(
          `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(firebaseServerConfig.apiKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: identifierRaw,
              password,
              returnSecureToken: true,
            }),
            signal: AbortSignal.timeout(8000),
          }
        );
        if (signInRes.ok) {
          const signInData = (await signInRes.json().catch(() => null)) as {
            localId?: string;
            email?: string;
            displayName?: string;
            idToken?: string;
          } | null;
          if (signInData?.localId && signInData?.idToken) {
            const fbUid = String(signInData.localId).trim();
            const fbEmail = String(signInData.email || identifierRaw).trim().toLowerCase();
            let fsDocData: Record<string, any> | null = null;
            try {
              const restSnap = await firestoreRestGetDocRaw(signInData.idToken, 'users', fbUid);
              if (restSnap.exists && restSnap.fields) {
                fsDocData = decodeFirestoreRestFields(restSnap.fields);
              }
            } catch {
              // Ignore REST profile lookup error
            }

            if (fsDocData) {
              const existingUidUser = usersStore.get(fbUid);
              const isDeactivated = Boolean(fsDocData.isExplicitlyDeactivated === true);
              const isPro =
                !isDeactivated &&
                (fsDocData.isPro === true || fsDocData.subscriptionStatus === 'pro') &&
                isUserSubscriptionActive({
                  isPro: true,
                  subscriptionStatus: 'pro',
                  subscriptionExpiresAt: fsDocData.subscriptionExpiresAt,
                  isExplicitlyDeactivated: isDeactivated,
                });
              const isPending = !isDeactivated && !isPro && fsDocData.subscriptionStatus === 'pending';
              const fallbackUsername = (fbEmail.split('@')[0] || fbUid.slice(0, 8)).toLowerCase();
              matchedUser = {
                uid: fbUid,
                username: String(fsDocData.username || existingUidUser?.username || fallbackUsername).toLowerCase(),
                email: fbEmail,
                displayName: String(
                  fsDocData.displayName || signInData.displayName || existingUidUser?.displayName || fallbackUsername
                ).slice(0, 80),
                role: 'user',
                status: fsDocData.status === 'blocked' ? 'blocked' : 'active',
                authProvider: fsDocData.authProvider === 'google' ? 'google' : 'password',
                currency: fsDocData.currency === 'USD' ? 'USD' : 'IDR',
                subscriptionStatus: isPro ? 'pro' : isPending ? 'pending' : 'free',
                isPro,
                isExplicitlyDeactivated: isDeactivated,
                subscriptionPlan:
                  isPro || isPending ? (fsDocData.subscriptionPlan === 'yearly' ? 'yearly' : 'monthly') : null,
                subscriptionExpiresAt: isPro ? fsDocData.subscriptionExpiresAt || null : null,
                passwordHash: incomingHash,
                createdAt: tsToIsoValue(fsDocData.createdAt || existingUidUser?.createdAt || nowIso()),
                updatedAt: nowIso(),
              };
              usersStore.set(matchedUser.uid, matchedUser);
              savePersistedUsersCache();
            } else {
              if (!matchedUser) {
                matchedUser = await findUserInServerFirestore(fbEmail, signInData.idToken);
              }
              if (!matchedUser) {
                const fallbackUsername = (fbEmail.split('@')[0] || fbUid.slice(0, 8)).toLowerCase();
                matchedUser = {
                  uid: fbUid,
                  username: fallbackUsername,
                  email: fbEmail,
                  displayName: String(signInData.displayName || fallbackUsername).slice(0, 80),
                  role: 'user',
                  status: 'active',
                  authProvider: 'password',
                  currency: 'IDR',
                  subscriptionStatus: 'free',
                  isPro: false,
                  isExplicitlyDeactivated: false,
                  subscriptionPlan: null,
                  subscriptionExpiresAt: null,
                  passwordHash: incomingHash,
                  createdAt: nowIso(),
                  updatedAt: nowIso(),
                };
                usersStore.set(matchedUser.uid, matchedUser);
                savePersistedUsersCache();
              } else {
                matchedUser.passwordHash = incomingHash;
                matchedUser.updatedAt = nowIso();
                savePersistedUsersCache();
              }
            }
            isPasswordValid = true;
          }
        } else {
          const errBody = (await signInRes.json().catch(() => null)) as any;
          const fbErrCode = String(errBody?.error?.message || '').toUpperCase();
          if (fbErrCode.includes('TOO_MANY_ATTEMPTS') || fbErrCode.includes('TOO-MANY-REQUESTS')) {
            res.status(429).json({
              code: 'TOO_MANY_ATTEMPTS',
              error: 'Terlalu banyak percobaan masuk. Tunggu beberapa menit atau gunakan tombol Masuk dengan Google.',
            });
            return;
          }
          if (fbErrCode.includes('USER_DISABLED')) {
            res.status(403).json({
              code: 'USER_DISABLED',
              error: 'Akun ini sedang dinonaktifkan pada Firebase Authentication.',
            });
            return;
          }
          const isCredentialMismatch =
            fbErrCode.includes('INVALID_LOGIN_CREDENTIALS') ||
            fbErrCode.includes('INVALID_PASSWORD') ||
            fbErrCode.includes('WRONG_PASSWORD') ||
            fbErrCode.includes('EMAIL_NOT_FOUND') ||
            fbErrCode.includes('INVALID_EMAIL');
          if (!isCredentialMismatch) {
            res.status(503).json({
              code: 'SERVER_FIREBASE_AUTH_UNAVAILABLE',
              error: 'Autentikasi Firebase server sedang tidak tersedia; beralih ke autentikasi klien.',
            });
            return;
          }
        }
      } catch {
        res.status(503).json({
          code: 'SERVER_FIREBASE_AUTH_UNAVAILABLE',
          error: 'Koneksi ke layanan autentikasi Firebase server terganggu; silakan coba lagi.',
        });
        return;
      }
    }

    if (!matchedUser || !isPasswordValid) {
      const fails = (failedLoginTracker.get(identifierRaw) || 0) + 1;
      failedLoginTracker.set(identifierRaw, fails);

      appendLog(
        matchedUser?.uid || 'guest_user',
        matchedUser?.email || identifierRaw,
        'failed_login',
        `Gagal masuk menggunakan akun ${identifierRaw} (percobaan ke-${fails}).`,
        fails >= 3 ? 'warning' : 'info'
      );

      if (fails >= 3) {
        createSecurityAlert(
          matchedUser?.uid || 'guest_user',
          matchedUser?.email || identifierRaw,
          'Aktivitas Login Mencurigakan',
          `Akun ${identifierRaw} mengalami ${fails} kali gagal login berturut-turut.`,
          'warning'
        );
      }

      if (!identifierRaw.includes('@') && !matchedUser && !isServerFirebaseBridgeReady()) {
        res.status(401).json({
          error: 'Username belum ditemukan di cache server. Silakan masuk menggunakan alamat Email terdaftar atau tombol Masuk dengan Google.',
        });
        return;
      }

      res.status(401).json({ error: 'Email/Username atau kata sandi tidak valid.' });
      return;
    }

    if (matchedUser.status === 'blocked') {
      appendLog(
        matchedUser.uid,
        matchedUser.email,
        'blocked_user_attempt',
        `Pengguna yang diblokir (${matchedUser.email}) mencoba mengakses aplikasi.`,
        'warning'
      );
      res.status(403).json({
        error: 'Akses akun Anda sedang diblokir oleh Administrator. Hubungi pengelola sistem.',
      });
      return;
    }

    failedLoginTracker.delete(identifierRaw);
    matchedUser.updatedAt = nowIso();
    const userToken = issueUserSessionToken(matchedUser);
    appendLog(
      matchedUser.uid,
      matchedUser.email,
      'user_login',
      `Pengguna ${matchedUser.displayName} (@${matchedUser.username}) berhasil masuk ke aplikasi.`,
      'info'
    );

    res.json({
      user: sanitizeUser(matchedUser),
      userToken,
      requiresOtp: false,
    });
  });

  // Exchange a verified Firebase ID Token (Google OAuth or Firebase Email login) for an authenticated app session & userToken
  app.post('/api/auth/firebase-session', async (req: Request, res: Response) => {
    const idToken = String(req.body?.idToken || '').trim();
    if (!idToken) {
      res.status(400).json({ error: 'Token Firebase Auth diperlukan.' });
      return;
    }

    const fbUser = await verifyFirebaseIdToken(idToken);
    if (!fbUser) {
      res.status(401).json({ error: 'Token Firebase Auth tidak valid atau kedaluwarsa.' });
      return;
    }

    const fbEmail = fbUser.email.toLowerCase();
    const isSuperAdminEmail =
      fbEmail === SUPER_ADMIN_EMAIL || fbEmail === WORKSPACE_ADMIN_EMAIL;

    let matchedUser: ServerUserRecord | undefined = usersStore.get(fbUser.uid);
    if (!matchedUser) {
      try {
        const directSnap = await firestoreRestGetDocRaw(idToken, 'users', fbUser.uid);
        if (directSnap.exists && directSnap.fields) {
          const data = decodeFirestoreRestFields(directSnap.fields);
          const isDeactivated = Boolean(data.isExplicitlyDeactivated === true);
          const isPro =
            !isDeactivated &&
            (data.isPro === true || data.subscriptionStatus === 'pro') &&
            isUserSubscriptionActive({
              isPro: true,
              subscriptionStatus: 'pro',
              subscriptionExpiresAt: data.subscriptionExpiresAt,
              isExplicitlyDeactivated: isDeactivated,
            });
          const isPending = !isDeactivated && !isPro && data.subscriptionStatus === 'pending';
          matchedUser = {
            uid: fbUser.uid,
            username: String(data.username || fbEmail.split('@')[0] || fbUser.uid).toLowerCase(),
            email: fbEmail,
            displayName: String(data.displayName || fbUser.displayName || data.username || fbEmail.split('@')[0]),
            role: isSuperAdminEmail ? 'admin' : data.role === 'admin' ? 'admin' : 'user',
            status: data.status === 'blocked' ? 'blocked' : 'active',
            authProvider: data.authProvider === 'google' ? 'google' : 'password',
            currency: data.currency === 'USD' ? 'USD' : 'IDR',
            subscriptionStatus: isPro ? 'pro' : isPending ? 'pending' : 'free',
            isPro,
            isExplicitlyDeactivated: isDeactivated,
            subscriptionPlan: isPro || isPending ? (data.subscriptionPlan === 'yearly' ? 'yearly' : 'monthly') : null,
            subscriptionExpiresAt: isPro ? data.subscriptionExpiresAt || null : null,
            createdAt: tsToIsoValue(data.createdAt || nowIso()),
            updatedAt: tsToIsoValue(data.updatedAt || nowIso()),
          };
          usersStore.set(matchedUser.uid, matchedUser);
          savePersistedUsersCache();
        }
      } catch {
        // Fall through to email lookup
      }
    }
    if (!matchedUser) {
      for (const u of usersStore.values()) {
        if (u.email.toLowerCase() === fbEmail) {
          matchedUser = u;
          break;
        }
      }
    }
    if (!matchedUser) {
      matchedUser = await findUserInServerFirestore(fbEmail, idToken);
    }

    if (isSuperAdminEmail) {
      const adminUser: ServerUserRecord = matchedUser
        ? { ...matchedUser, role: 'admin', email: fbEmail }
        : {
            ...usersStore.get('admin_vuedevo_01')!,
            email: fbEmail,
          };
      res.json({
        user: sanitizeUser(adminUser),
        requiresOtp: true,
        otpVerified: false,
      });
      return;
    }

    if (!matchedUser) {
      const defaultUsername = (fbEmail.split('@')[0] || `user_${fbUser.uid.slice(0, 6)}`)
        .toLowerCase()
        .replace(/[^a-z0-9_.\-]/g, '_')
        .slice(0, 60);
      matchedUser = {
        uid: fbUser.uid,
        username: defaultUsername,
        email: fbEmail,
        displayName: (fbUser.displayName || defaultUsername).slice(0, 80),
        role: 'user',
        status: 'active',
        authProvider: 'google',
        currency: 'IDR',
        subscriptionStatus: 'free',
        isPro: false,
        isExplicitlyDeactivated: false,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      usersStore.set(matchedUser.uid, matchedUser);
      savePersistedUsersCache();

      if (serverDb) {
        try {
          await ensureServerFirebaseSignedIn();
          const docRef = serverFsDoc(serverDb, 'users', matchedUser.uid);
          const snap = await serverFsGetDoc(docRef);
          if (!snap.exists()) {
            await serverFsSetDoc(docRef, {
              uid: matchedUser.uid,
              username: matchedUser.username,
              email: matchedUser.email,
              displayName: matchedUser.displayName,
              role: 'user',
              status: 'active',
              authProvider: 'google',
              currency: 'IDR',
              subscriptionStatus: 'free',
              isPro: false,
              deleted: false,
              deletedAt: null,
              createdAt: serverFsTimestamp(),
              updatedAt: serverFsTimestamp(),
            });
          }
        } catch {
          // Ignore server Firestore init error for fresh social signup
        }
      }
    }

    if (matchedUser.status === 'blocked') {
      res.status(403).json({
        error: 'Akses akun Anda sedang diblokir oleh Administrator. Hubungi pengelola sistem.',
      });
      return;
    }

    const userToken = issueUserSessionToken(matchedUser);
    res.json({
      user: sanitizeUser(matchedUser),
      userToken,
      requiresOtp: false,
    });
  });

  // Reset Password by Email or Username (Strictly blocked for Super Admin accounts)
  app.post('/api/auth/reset-password', async (req: Request, res: Response) => {
    const identifierRaw = String(req.body?.identifier || '').trim().toLowerCase();
    const newPassword = String(req.body?.newPassword || '');

    if (!identifierRaw || newPassword.length < 6) {
      res.status(400).json({
        error: 'Email/Username dan kata sandi baru minimal 6 karakter wajib diisi.',
      });
      return;
    }

    const isSuperIdentifier =
      identifierRaw === SUPER_ADMIN_EMAIL ||
      identifierRaw === WORKSPACE_ADMIN_EMAIL ||
      identifierRaw === SUPER_ADMIN_USERNAME ||
      identifierRaw === 'dark.notes' ||
      identifierRaw === 'admin_vuedevo_01';

    if (isSuperIdentifier) {
      appendLog(
        'admin_vuedevo_01',
        SUPER_ADMIN_EMAIL,
        'blocked_admin_password_reset',
        `Percobaan reset kata sandi tanpa autentikasi pada akun Super Admin (${identifierRaw}) ditolak.`,
        'critical'
      );
      res.status(403).json({
        error:
          'Reset kata sandi akun Super Administrator tidak diizinkan melalui halaman masuk. Gunakan Pengaturan Akun setelah terautentikasi.',
      });
      return;
    }

    let matchedUser: ServerUserRecord | undefined;
    for (const u of usersStore.values()) {
      if (
        u.email.toLowerCase() === identifierRaw ||
        (u.username && u.username.toLowerCase() === identifierRaw)
      ) {
        matchedUser = u;
        break;
      }
    }
    if (!matchedUser) {
      matchedUser = await findUserInServerFirestore(identifierRaw);
    }

    if (!matchedUser) {
      res.status(404).json({
        error: 'Akun dengan Email atau Username tersebut tidak ditemukan.',
      });
      return;
    }

    if (
      matchedUser.role === 'admin' ||
      matchedUser.uid === 'admin_vuedevo_01' ||
      matchedUser.email.toLowerCase() === SUPER_ADMIN_EMAIL ||
      matchedUser.email.toLowerCase() === WORKSPACE_ADMIN_EMAIL
    ) {
      res.status(403).json({
        error: 'Reset kata sandi akun Super Administrator tidak diizinkan melalui halaman ini.',
      });
      return;
    }

    if (matchedUser.status === 'blocked') {
      res.status(403).json({
        error: 'Akses akun Anda sedang diblokir oleh Administrator.',
      });
      return;
    }

    const newHash = hashPassword(newPassword);
    matchedUser.passwordHash = newHash;
    matchedUser.authProvider = 'password';
    matchedUser.updatedAt = nowIso();
    savePersistedUsersCache();

    if (serverDb) {
      try {
        await ensureServerFirebaseSignedIn();
        await serverFsSetDoc(
          serverFsDoc(serverDb, 'users', matchedUser.uid),
          {
            passwordHash: newHash,
            authProvider: 'password',
            updatedAt: serverFsTimestamp(),
          },
          { merge: true }
        );
      } catch {
        // Best-effort Firestore sync
      }
    }

    appendLog(
      matchedUser.uid,
      matchedUser.email,
      'password_reset',
      `Pengguna ${matchedUser.displayName} (@${matchedUser.username}) melakukan reset kata sandi.`,
      'info'
    );

    res.json({
      success: true,
      uid: matchedUser.uid,
      email: matchedUser.email,
      username: matchedUser.username,
      updatedAt: matchedUser.updatedAt,
    });
  });

  // Verify a password against a stored hash (used when user document is fetched directly from Firestore)
  app.post('/api/auth/verify-hash', (req: Request, res: Response) => {
    const password = String(req.body?.password || '');
    const passwordHash = String(req.body?.passwordHash || '');
    const valid = verifyPasswordAgainstStoredHash(password, passwordHash);
    res.json({ valid });
  });

  // Manual User Registration
  app.post('/api/auth/register', async (req: Request, res: Response) => {
    const emailRaw = String(req.body?.email || '').trim().toLowerCase();
    const rawUsername = String(req.body?.username || '').trim().toLowerCase().replace(/\s+/g, '_');
    const password = String(req.body?.password || '');
    const idToken = String(req.body?.idToken || '').trim();
    const username = (rawUsername || emailRaw.split('@')[0] || `user_${Date.now()}`).slice(0, 60);
    const displayName = String(req.body?.displayName || '').trim() || username;
    const uid = String(req.body?.uid || `user_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`);

    if (!emailRaw || password.length < 6) {
      res.status(400).json({ error: 'Email valid dan kata sandi minimal 6 karakter diperlukan.' });
      return;
    }

    if (
      emailRaw === SUPER_ADMIN_EMAIL ||
      emailRaw === WORKSPACE_ADMIN_EMAIL ||
      username === SUPER_ADMIN_USERNAME ||
      username === 'dark.notes'
    ) {
      res.status(403).json({
        error: 'Email atau username ini dicadangkan untuk Super Administrator.',
      });
      return;
    }

    const verifiedFbCaller = idToken ? await verifyFirebaseIdToken(idToken) : null;

    let preSyncedRecord: ServerUserRecord | undefined;
    for (const u of usersStore.values()) {
      const isSameEmail = u.email.toLowerCase() === emailRaw;
      const isSameUsername = u.username.toLowerCase() === username;
      if (isSameEmail || isSameUsername) {
        const isAuthenticatedOwner =
          Boolean(
            verifiedFbCaller &&
              verifiedFbCaller.uid === u.uid &&
              verifiedFbCaller.email === emailRaw
          );
        if (isAuthenticatedOwner) {
          preSyncedRecord = u;
          break;
        }
        if (isSameEmail) {
          res.status(409).json({ error: 'Email ini sudah terdaftar. Silakan masuk.' });
          return;
        }
        if (isSameUsername) {
          res.status(409).json({ error: 'Username ini sudah digunakan. Pilih username lain.' });
          return;
        }
      }
    }

    const newUser: ServerUserRecord = {
      uid: preSyncedRecord?.uid || (verifiedFbCaller?.uid || uid),
      username,
      email: emailRaw,
      displayName: displayName.slice(0, 80),
      role: 'user',
      status: preSyncedRecord?.status || 'active',
      authProvider: 'password',
      currency: preSyncedRecord?.currency || 'IDR',
      subscriptionStatus: preSyncedRecord?.subscriptionStatus || 'free',
      isPro: preSyncedRecord?.isPro || false,
      passwordHash: hashPassword(password),
      createdAt: preSyncedRecord?.createdAt || nowIso(),
      updatedAt: nowIso(),
    };

    usersStore.set(newUser.uid, newUser);
    savePersistedUsersCache();

    if (serverDb) {
      try {
        await ensureServerFirebaseSignedIn();
        await serverFsSetDoc(
          serverFsDoc(serverDb, 'users', newUser.uid),
          {
            uid: newUser.uid,
            username: newUser.username,
            email: newUser.email,
            displayName: newUser.displayName,
            role: 'user',
            status: newUser.status,
            authProvider: 'password',
            currency: newUser.currency,
            subscriptionStatus: newUser.subscriptionStatus,
            isPro: newUser.isPro,
            passwordHash: newUser.passwordHash,
            deleted: false,
            deletedAt: null,
            createdAt: serverFsTimestamp(),
            updatedAt: serverFsTimestamp(),
          },
          { merge: true }
        );
      } catch {
        // Fallback already persisted in server store
      }
    }

    const userToken = issueUserSessionToken(newUser);
    appendLog(
      newUser.uid,
      newUser.email,
      'user_registered',
      `Pendaftaran akun baru berhasil untuk ${newUser.displayName} (@${newUser.username}).`,
      'info'
    );

    res.json({
      user: sanitizeUser(newUser),
      userToken,
      requiresOtp: false,
    });
  });

  // Request or Resend OTP specifically for Super Admin with strict cooldown & rate limiting
  app.post('/api/auth/request-otp', async (req: Request, res: Response) => {
    const emailRaw = String(req.body?.email || '').trim().toLowerCase();
    if (emailRaw !== SUPER_ADMIN_EMAIL && emailRaw !== WORKSPACE_ADMIN_EMAIL) {
      res.status(403).json({
        error: 'Verifikasi OTP email khusus hanya diberlakukan untuk akun Super Admin.',
      });
      return;
    }

    const eligibility = checkOtpDispatchEligibility(emailRaw);
    if (!eligibility.allowed && eligibility.reusedChallenge) {
      res.json({
        sent: true,
        smtpSent: true,
        reusedExisting: true,
        cooldownRemainingSec: eligibility.cooldownRemainingSec,
        smtpError: null,
        smtpMessageId: null,
        email: emailRaw,
        expiresAt: eligibility.reusedChallenge.expiresAt,
        message: `Kode verifikasi sebelumnya masih aktif. Silakan periksa Inbox/Spam atau tunggu ${eligibility.cooldownRemainingSec} detik untuk mengirim ulang.`,
      });
      return;
    }

    if (!eligibility.allowed && eligibility.rateLimited) {
      res.status(429).json({
        error: `Terlalu banyak permintaan kode OTP dalam 15 menit terakhir. Tunggu sekitar ${Math.ceil(eligibility.cooldownRemainingSec / 60)} menit sebelum mencoba lagi.`,
      });
      return;
    }

    const otpCode = String(crypto.randomInt(100000, 999999));
    const expiresAt = Date.now() + 10 * 60 * 1000;
    otpChallenges.set(emailRaw, {
      email: emailRaw,
      code: otpCode,
      expiresAt,
      attempts: 0,
      lastSentAt: Date.now(),
    });
    recordOtpSentRate(emailRaw);

    let smtpSent = false;
    let smtpError: string | null = null;
    let smtpMessageId: string | null = null;

    if (isSmtpConfigured()) {
      try {
        const mailResult = await sendSuperAdminOtpEmail(emailRaw, otpCode);
        smtpSent = true;
        smtpMessageId = mailResult.messageId || null;
      } catch (mailErr: any) {
        smtpError = formatSmtpErrorMessage(mailErr, emailRaw);
        console.error('[SMTP SuperAdmin OTP Request Error]', mailErr?.message || mailErr);
        appendLog(
          'admin_vuedevo_01',
          emailRaw,
          'smtp_otp_delivery_failed',
          `Pengiriman OTP email gagal (${smtpError}).`,
          'warning'
        );
      }
    } else {
      smtpError = 'Konfigurasi SMTP (SMTP_USER / SMTP_PASS) belum diatur pada environment server.';
      console.warn('[SMTP SuperAdmin OTP Request Notice]', smtpError);
      appendLog(
        'admin_vuedevo_01',
        emailRaw,
        'smtp_otp_delivery_failed',
        `Pengiriman OTP email dilewati karena konfigurasi SMTP server belum lengkap.`,
        'warning'
      );
    }

    appendLog(
      'admin_vuedevo_01',
      emailRaw,
      'admin_otp_requested',
      smtpSent
        ? `Kode OTP 6-digit berhasil dikirim via SMTP ke Super Admin (${emailRaw})${smtpMessageId ? ` [ID: ${smtpMessageId}]` : ''}.`
        : `Tantangan kode OTP 6-digit dibuat untuk Super Admin (${emailRaw}), namun pengiriman email SMTP gagal.`,
      smtpSent ? 'info' : 'warning'
    );

    res.json({
      sent: smtpSent,
      smtpSent,
      cooldownRemainingSec: 60,
      smtpError,
      smtpMessageId,
      email: emailRaw,
      expiresAt,
      message: smtpSent
        ? `Kode verifikasi baru telah dikirim ke email ${emailRaw}.`
        : smtpError || `Gagal mengirim email OTP ke ${emailRaw}.`,
    });
  });

  // Verify Super Admin 6-digit OTP code (STRICT: Exact code match required, NO bypasses)
  app.post('/api/auth/verify-otp', (req: Request, res: Response) => {
    const emailRaw = String(req.body?.email || SUPER_ADMIN_EMAIL).trim().toLowerCase();
    const code = String(req.body?.code || '').trim();

    if (emailRaw !== SUPER_ADMIN_EMAIL && emailRaw !== WORKSPACE_ADMIN_EMAIL) {
      res.status(403).json({ error: 'Akses ditolak.' });
      return;
    }

    const challenge = otpChallenges.get(emailRaw);
    if (!challenge) {
      res.status(400).json({ error: 'Sesi kode verifikasi tidak ditemukan. Silakan minta kode baru.' });
      return;
    }

    if (Date.now() > challenge.expiresAt) {
      otpChallenges.delete(emailRaw);
      res.status(400).json({ error: 'Kode verifikasi telah kedaluwarsa. Silakan kirim ulang kode.' });
      return;
    }

    if (challenge.code !== code) {
      challenge.attempts += 1;
      appendLog(
        'admin_vuedevo_01',
        emailRaw,
        'admin_otp_failed',
        `Kode OTP yang dimasukkan salah untuk ${emailRaw} (percobaan ke-${challenge.attempts}).`,
        challenge.attempts >= 2 ? 'critical' : 'warning'
      );

      if (challenge.attempts >= 2) {
        createSecurityAlert(
          'admin_vuedevo_01',
          emailRaw,
          'Kegagalan Verifikasi Kode OTP Super Admin',
          `Terdeteksi ${challenge.attempts} kali kegagalan input kode verifikasi email pada akun Super Admin (${emailRaw}).`,
          'critical'
        );
      }

      res.status(401).json({ error: 'Kode verifikasi OTP tidak sesuai. Periksa kembali kode 6 digit Anda.' });
      return;
    }

    // OTP verification passed - issue cryptographically secure admin & session tokens
    otpChallenges.delete(emailRaw);
    const adminToken = issueSuperAdminToken(emailRaw);
    const adminRecord = usersStore.get('admin_vuedevo_01');
    const userToken = issueUserSessionToken({
      uid: adminRecord?.uid || 'admin_vuedevo_01',
      email: emailRaw,
      role: 'admin',
    });

    appendLog(
      'admin_vuedevo_01',
      emailRaw,
      'admin_otp_verified',
      `Verifikasi 2FA Email OTP berhasil. Akses Super Admin (/control-panel) diberikan.`,
      'info'
    );

    res.json({
      verified: true,
      adminToken,
      userToken,
      verifiedAt: nowIso(),
    });
  });

  // Sync authenticated user profile metadata into the live registry
  app.post('/api/users/sync', async (req: Request, res: Response) => {
    const uid = String(req.body?.uid || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const rawUsername = String(req.body?.username || '').trim().toLowerCase().replace(/\s+/g, '_');
    const username = (rawUsername || email.split('@')[0] || 'user').slice(0, 60);
    const displayName = String(req.body?.displayName || '').trim() || username || 'Pengguna';
    const authProvider = req.body?.authProvider === 'google' ? 'google' : 'password';

    if (!uid || !email) {
      res.status(400).json({ error: 'UID dan email wajib disertakan.' });
      return;
    }

    const caller = await verifyCallerAuth(req, uid);
    if (!caller.ok) {
      res.status(caller.status).json({ code: caller.code, error: caller.error });
      return;
    }

    let existing = usersStore.get(uid);
    if (!existing) {
      for (const u of usersStore.values()) {
        if (u.email.toLowerCase() === email) {
          existing = u;
          break;
        }
      }
    }

    const isSuperAdmin =
      caller.isAdmin && (email === SUPER_ADMIN_EMAIL || email === WORKSPACE_ADMIN_EMAIL);

    if (existing) {
      existing.displayName = displayName.slice(0, 80);
      const emailPrefix = email.split('@')[0];
      if (rawUsername && (!existing.username || rawUsername !== emailPrefix || existing.username === emailPrefix)) {
        existing.username = username;
      }

      // Only Super Admin may elevate role, subscription tier, deactivation state, or passwordHash via /users/sync
      if (caller.isAdmin) {
        const incomingSubStatus: 'free' | 'pending' | 'pro' | undefined =
          req.body?.subscriptionStatus === 'pending'
            ? 'pending'
            : req.body?.subscriptionStatus === 'pro' || req.body?.isPro === true
              ? 'pro'
              : req.body?.subscriptionStatus === 'free' || req.body?.isPro === false
                ? 'free'
                : undefined;
        const incomingPlan: 'monthly' | 'yearly' | null =
          req.body?.subscriptionPlan === 'yearly'
            ? 'yearly'
            : req.body?.subscriptionPlan === 'monthly'
              ? 'monthly'
              : null;
        const incomingExpiresAt: string | null = req.body?.subscriptionExpiresAt
          ? String(req.body.subscriptionExpiresAt).slice(0, 10)
          : null;
        const isDeactivated = Boolean(req.body?.isExplicitlyDeactivated === true);
        const isPro = !isDeactivated && incomingSubStatus === 'pro';
        const isPending = !isDeactivated && !isPro && incomingSubStatus === 'pending';

        if (isPro) {
          existing.subscriptionStatus = 'pro';
          existing.isPro = true;
          existing.isExplicitlyDeactivated = false;
          if (incomingPlan) existing.subscriptionPlan = incomingPlan;
          if (incomingExpiresAt) existing.subscriptionExpiresAt = incomingExpiresAt;
        } else if (isPending) {
          existing.subscriptionStatus = 'pending';
          existing.isPro = false;
          if (incomingPlan) existing.subscriptionPlan = incomingPlan;
        } else if (incomingSubStatus === 'free') {
          existing.subscriptionStatus = 'free';
          existing.isPro = false;
          existing.subscriptionPlan = null;
          existing.subscriptionExpiresAt = null;
          existing.isExplicitlyDeactivated = isDeactivated;
        }
        if (isSuperAdmin) {
          existing.role = 'admin';
        }
      }

      existing.updatedAt = nowIso();
      savePersistedUsersCache();
      res.json({ user: sanitizeUser(existing) });
      return;
    }

    const record: ServerUserRecord = {
      uid,
      username,
      email,
      displayName: displayName.slice(0, 80),
      role: 'user',
      status: 'active',
      authProvider,
      currency: 'IDR',
      subscriptionStatus: 'free',
      isPro: false,
      isExplicitlyDeactivated: false,
      subscriptionPlan: null,
      subscriptionExpiresAt: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    usersStore.set(uid, record);
    savePersistedUsersCache();

    appendLog(
      uid,
      email,
      'user_synced',
      `Akun ${displayName} (@${username}) tersinkronisasi ke direktori real-time.`,
      'info'
    );

    res.json({ user: sanitizeUser(record) });
  });

  // Enforce authentication & ownership on all /api/users/:uid/* routes declared below
  app.use('/api/users/:uid', async (req: Request, res: Response, next: NextFunction) => {
    const rawUid = String(req.params.uid || '').trim();
    const allowPeer =
      req.path.startsWith('/report-settings') ||
      req.path.startsWith('/automations') ||
      req.path.startsWith('/savings') ||
      req.path.startsWith('/debts');

    const authRes = allowPeer
      ? await authorizeUserOrPeer(req, rawUid)
      : await verifyCallerAuth(req, rawUid);
    if (!authRes.ok) {
      res.status(authRes.status).json({ code: authRes.code, error: authRes.error });
      return;
    }
    (req as any).verifiedCaller = authRes;
    next();
  });

  // Update User Profile (displayName & username)
  app.patch('/api/users/:uid/profile', async (req: Request, res: Response) => {
    const uid = String(req.params.uid || '').trim();
    const displayName = String(req.body?.displayName || '').trim();
    const rawUsername = String(req.body?.username || '').trim().toLowerCase().replace(/\s+/g, '_');

    if (!displayName) {
      res.status(400).json({ error: 'Nama tampilan (Display Name) tidak boleh kosong.' });
      return;
    }

    const target = usersStore.get(uid);
    if (target) {
      target.displayName = displayName.slice(0, 80);
      if (rawUsername) {
        target.username = rawUsername.slice(0, 60);
      }
      target.updatedAt = nowIso();
      savePersistedUsersCache();
    }

    if (serverDb) {
      try {
        await ensureServerFirebaseSignedIn();
        const updatePayload: Record<string, any> = {
          displayName: displayName.slice(0, 80),
          updatedAt: serverFsTimestamp(),
        };
        if (rawUsername) updatePayload.username = rawUsername.slice(0, 60);
        await serverFsSetDoc(serverFsDoc(serverDb, 'users', uid), updatePayload, { merge: true });
      } catch {
        // Ignore if doc update fails
      }
    }

    if (target) {
      res.json({ user: sanitizeUser(target) });
      return;
    }

    res.json({
      user: {
        uid,
        username: rawUsername || 'user',
        displayName: displayName.slice(0, 80),
        updatedAt: nowIso(),
      },
    });
  });

  // Change User Password (verifies currentPassword against server-stored hash & updates Firestore server-side)
  app.patch('/api/users/:uid/password', async (req: Request, res: Response) => {
    const uid = String(req.params.uid || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');

    if (!newPassword || newPassword.length < 6) {
      res.status(400).json({ error: 'Kata sandi baru wajib diisi minimal 6 karakter.' });
      return;
    }

    let target = usersStore.get(uid);
    if (!target && email) {
      for (const u of usersStore.values()) {
        if (u.email.toLowerCase() === email) {
          target = u;
          break;
        }
      }
    }
    if (!target) {
      target = await findUserInServerFirestore(uid) || (email ? await findUserInServerFirestore(email) : undefined);
    }

    let serverStoredHash = target?.passwordHash;
    if (!serverStoredHash && serverDb) {
      try {
        await ensureServerFirebaseSignedIn();
        const snap = await serverFsGetDoc(serverFsDoc(serverDb, 'users', uid));
        if (snap.exists() && snap.data()?.passwordHash) {
          serverStoredHash = String(snap.data()!.passwordHash);
        }
      } catch {
        // Ignore Firestore lookup fallback failure
      }
    }

    if (serverStoredHash) {
      if (!currentPassword) {
        res.status(400).json({ error: 'Kata sandi saat ini wajib diisi untuk verifikasi keamanan.' });
        return;
      }
      const isValidCurrent = verifyPasswordAgainstStoredHash(currentPassword, serverStoredHash);
      if (!isValidCurrent) {
        appendLog(
          uid || 'unknown',
          target?.email || email || 'unknown',
          'password_change_failed',
          'Percobaan ubah kata sandi gagal karena kata sandi saat ini tidak sesuai.',
          'warning'
        );
        res.status(401).json({ error: 'Kata sandi saat ini tidak sesuai.' });
        return;
      }
    }

    const newHash = hashPassword(newPassword);

    if (target) {
      target.passwordHash = newHash;
      target.authProvider = 'password';
      target.updatedAt = nowIso();
      if (target.email.toLowerCase() === SUPER_ADMIN_EMAIL || uid === 'admin_vuedevo_01') {
        superAdminPasswordHash = newHash;
        runtimeServerFbPassword = newPassword;
      }
      savePersistedUsersCache();
    } else if (email === SUPER_ADMIN_EMAIL || uid === 'admin_vuedevo_01') {
      superAdminPasswordHash = newHash;
      runtimeServerFbPassword = newPassword;
    }

    if (serverDb) {
      try {
        await ensureServerFirebaseSignedIn();
        await serverFsSetDoc(
          serverFsDoc(serverDb, 'users', uid),
          {
            passwordHash: newHash,
            authProvider: 'password',
            updatedAt: serverFsTimestamp(),
          },
          { merge: true }
        );
      } catch {
        // Ignore if Firestore rules disallow direct field update
      }
    }

    appendLog(
      uid || target?.uid || 'user',
      target?.email || email || 'user@sisa-uang.id',
      'password_changed',
      `Pengguna berhasil memperbarui kata sandi akun.`,
      'info'
    );

    res.json({
      success: true,
      updatedAt: nowIso(),
    });
  });

  // Helper to parse User-Agent
  function parseUserAgentInfo(uaRaw: string): {
    browser: string;
    os: string;
    deviceType: 'desktop' | 'mobile' | 'tablet';
    defaultName: string;
  } {
    const ua = uaRaw || '';
    let browser = 'Browser Web';
    if (/Edg\//i.test(ua)) browser = 'Microsoft Edge';
    else if (/OPR\/|Opera/i.test(ua)) browser = 'Opera';
    else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = 'Google Chrome';
    else if (/Firefox\//i.test(ua)) browser = 'Mozilla Firefox';
    else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Apple Safari';

    let os = 'Perangkat';
    if (/Windows NT/i.test(ua)) os = 'Windows';
    else if (/Android/i.test(ua)) os = 'Android';
    else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
    else if (/Mac OS X|Macintosh/i.test(ua)) os = 'macOS';
    else if (/Linux/i.test(ua)) os = 'Linux';

    let deviceType: 'desktop' | 'mobile' | 'tablet' = 'desktop';
    if (/iPad|Tablet/i.test(ua)) deviceType = 'tablet';
    else if (/Mobile|Android|iPhone|iPod/i.test(ua)) deviceType = 'mobile';

    return {
      browser,
      os,
      deviceType,
      defaultName: `${browser} di ${os}`,
    };
  }

  function extractClientIp(req: Request): string {
    const xff = req.headers['x-forwarded-for'];
    const rawIp = Array.isArray(xff)
      ? xff[0]
      : typeof xff === 'string'
        ? xff.split(',')[0].trim()
        : req.socket.remoteAddress || '127.0.0.1';
    return rawIp.replace(/^::ffff:/, '') || '127.0.0.1';
  }

  // Helper to resolve user identities (UIDs and canonical email) across store and sessions
  function resolveUserIdentities(targetUid?: string, targetEmail?: string): {
    uids: Set<string>;
    email: string;
  } {
    const uids = new Set<string>();
    let email = String(targetEmail || '').trim().toLowerCase();
    const uid = String(targetUid || '').trim();

    if (uid) {
      uids.add(uid);
      const u = usersStore.get(uid);
      if (u?.email) {
        email = email || u.email.toLowerCase();
      }
    }

    if (email) {
      for (const u of usersStore.values()) {
        if (u.email && u.email.toLowerCase() === email) {
          uids.add(u.uid);
        }
      }
      for (const s of deviceSessionsStore.values()) {
        if (s.email && s.email.toLowerCase() === email && s.uid) {
          uids.add(s.uid);
        }
      }
    }

    return { uids, email };
  }

  function isSessionMatching(
    s: ServerDeviceSessionRecord,
    identities: { uids: Set<string>; email: string }
  ): boolean {
    if (!s) return false;
    if (s.uid && identities.uids.has(s.uid)) return true;
    if (identities.email && s.email && s.email.toLowerCase() === identities.email) return true;
    return false;
  }

  // Check current user status (used for real-time blocking enforcement & session keep-alive)
  app.get('/api/users/:uid/status', (req: Request, res: Response) => {
    const uid = String(req.params.uid || '').trim();
    const email = String(req.query.email || '').trim().toLowerCase();
    const deviceId = String(req.query.deviceId || '').trim();
    const ua = String(req.headers['user-agent'] || '');

    const identities = resolveUserIdentities(uid, email);

    let sessionRevoked = false;
    let isPrimaryDevice = false;
    let sessionFound = false;

    if (uid && deviceId) {
      const sessionId = `${uid}__${deviceId}`;
      let session = deviceSessionsStore.get(sessionId);
      if (!session) {
        for (const s of deviceSessionsStore.values()) {
          if (s.deviceId === deviceId && isSessionMatching(s, identities)) {
            session = s;
            break;
          }
        }
      }

      const clientIp = extractClientIp(req);
      const now = nowIso();

      if (session) {
        sessionFound = true;
        if (session.status === 'revoked') {
          sessionRevoked = true;
        } else {
          session.lastActiveAt = now;
          session.ipAddress = clientIp;
          isPrimaryDevice = Boolean(session.isPrimary);
          savePersistedSessionsCache();
        }
      } else {
        // AUTO-HEAL: If an active device is polling /status, automatically ensure it is registered in session store
        const parsedUa = parseUserAgentInfo(ua);
        const autoSession: ServerDeviceSessionRecord = {
          sessionId,
          uid,
          email: email || identities.email || 'user@sisa-uang.id',
          deviceId,
          deviceName: parsedUa.defaultName,
          browser: parsedUa.browser,
          os: parsedUa.os,
          deviceType: parsedUa.deviceType,
          ipAddress: clientIp,
          isPrimary: false,
          status: 'active',
          revokedAt: null,
          revokedByDeviceId: null,
          createdAt: now,
          lastActiveAt: now,
        };
        deviceSessionsStore.set(autoSession.sessionId, autoSession);
        savePersistedSessionsCache();
        sessionFound = true;
      }
    }

    let user = usersStore.get(uid);
    if (!user && (email || identities.email)) {
      const targetEmail = email || identities.email;
      for (const u of usersStore.values()) {
        if (u.email.toLowerCase() === targetEmail) {
          user = u;
          break;
        }
      }
    }

    if (!user) {
      res.json({
        status: 'active',
        role: 'user',
        subscriptionStatus: 'free',
        isPro: false,
        isExplicitlyDeactivated: false,
        subscriptionPlan: null,
        subscriptionExpiresAt: null,
        sessionRevoked,
        isPrimaryDevice,
        sessionFound,
      });
      return;
    }

    const isPro = isUserSubscriptionActive(user);
    const isPending = !isPro && user.subscriptionStatus === 'pending';
    res.json({
      status: user.status,
      role: user.role,
      subscriptionStatus: isPro ? 'pro' : isPending ? 'pending' : 'free',
      isPro,
      isExplicitlyDeactivated: Boolean(user.isExplicitlyDeactivated),
      subscriptionPlan: isPro || isPending ? user.subscriptionPlan || 'monthly' : null,
      subscriptionExpiresAt: isPro ? user.subscriptionExpiresAt || null : null,
      subscriptionPaymentMethod: user.subscriptionPaymentMethod || null,
      subscriptionRequestedAt: user.subscriptionRequestedAt || null,
      updatedAt: user.updatedAt,
      sessionRevoked,
      isPrimaryDevice,
      sessionFound,
    });
  });

  // =========================================================================
  // Report Settings Sync Endpoints (/api/users/:uid/report-settings)
  // =========================================================================
  app.get('/api/users/:uid/report-settings', (req: Request, res: Response) => {
    const uid = String(req.params.uid || '').trim();
    const record = uid ? reportSettingsStore.get(uid) : undefined;

    if (!record) {
      res.json({
        exists: false,
        reportSettings: null,
      });
      return;
    }

    res.json({
      exists: true,
      reportSettings: record,
    });
  });

  app.put('/api/users/:uid/report-settings', (req: Request, res: Response) => {
    const uid = String(req.params.uid || '').trim();
    if (!uid) {
      res.status(400).json({ error: 'UID pengguna wajib disertakan.' });
      return;
    }
    const body = req.body || {};

    const record: ServerReportSettingsRecord = {
      ownerId: uid,
      signers: Array.isArray(body.signers) ? body.signers : [],
      activeSignerIds:
        body.activeSignerIds && typeof body.activeSignerIds === 'object'
          ? body.activeSignerIds
          : {},
      signPlace: String(body.signPlace || '').trim(),
      letterhead:
        body.letterhead && typeof body.letterhead === 'object' ? body.letterhead : null,
      customTitles:
        body.customTitles && typeof body.customTitles === 'object'
          ? body.customTitles
          : null,
      updatedAt: nowIso(),
    };

    reportSettingsStore.set(uid, record);
    savePersistedReportSettingsCache();

    const isFromPeer = Boolean((req as any).verifiedCaller?.isPeer);
    if (!isFromPeer) {
      void syncReportSettingsToPeer(uid, record);
    }

    res.json({
      success: true,
      updatedAt: record.updatedAt,
      reportSettings: record,
    });
  });

  // =========================================================================
  // Automations Persistence Endpoints (/api/users/:uid/automations)
  // =========================================================================

  // Timezone & Server Diagnostics Endpoint (UTC vs Asia/Jakarta WIB)
  app.get('/api/time', (_req: Request, res: Response) => {
    const now = new Date();
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).formatToParts(now);

      const getPart = (type: string) => parts.find((p) => p.type === type)?.value || '00';
      const wibDate = `${getPart('year')}-${getPart('month')}-${getPart('day')}`;
      const wibTime = `${getPart('hour')}:${getPart('minute')}`;
      const wibSeconds = `${getPart('hour')}:${getPart('minute')}:${getPart('second')}`;
      const wibDay = parseInt(getPart('day'), 10);

      res.json({
        success: true,
        utcIso: now.toISOString(),
        wibDate,
        wibTime,
        wibSeconds,
        wibDay,
        timeZone: 'Asia/Jakarta (WIB, UTC+7)',
        serverLocalHours: now.getHours(),
        serverLocalMinutes: now.getMinutes(),
      });
    } catch (e: any) {
      res.json({
        success: true,
        utcIso: now.toISOString(),
        error: e?.message || 'Intl error',
      });
    }
  });

  // Evaluate due automations against WIB timezone
  app.get('/api/users/:uid/automations/evaluate', (req: Request, res: Response) => {
    const rawUid = String(req.params.uid || '').trim();
    const uid = rawUid.replace(/[^a-zA-Z0-9_\-]/g, '_');

    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now);

    const getPart = (type: string) => parts.find((p) => p.type === type)?.value || '00';
    const todayWibIso = `${getPart('year')}-${getPart('month')}-${getPart('day')}`;
    const currentWibTime = `${getPart('hour')}:${getPart('minute')}`;
    const currentWibDay = parseInt(getPart('day'), 10);

    let userRules = Array.from(automationsStore.values()).filter(
      (r) => (r.ownerId === uid || r.ownerId === rawUid) && !r.deleted
    );

    const dueRules = userRules.filter((rule) => {
      if (!rule.isActive) return false;
      if (!rule.scheduleDays.includes(currentWibDay)) return false;
      if (currentWibTime < rule.executionTime) return false;
      if (rule.lastExecutedDate === todayWibIso) return false;
      if (rule.lastCancelledDate === todayWibIso) return false;
      if (rule.snoozedUntil && new Date(rule.snoozedUntil).getTime() > now.getTime()) return false;
      return true;
    });

    res.json({
      success: true,
      wibDate: todayWibIso,
      wibTime: currentWibTime,
      wibDay: currentWibDay,
      totalRules: userRules.length,
      dueRulesCount: dueRules.length,
      dueRules,
    });
  });

  app.get('/api/users/:uid/automations', (req: Request, res: Response) => {
    const rawUid = String(req.params.uid || '').trim();
    const uid = rawUid.replace(/[^a-zA-Z0-9_\-]/g, '_');

    let userRules = Array.from(automationsStore.values()).filter(
      (r) => (r.ownerId === uid || r.ownerId === rawUid) && !r.deleted && !deletedAutomationsStore.has(r.id)
    );

    // If empty and uid is super admin / alias, check other known admin identifiers
    if (userRules.length === 0 && (uid.includes('vuedevo') || uid === 'admin_vuedevo_01' || rawUid === 'KlSX6JgegtUIsQinZRKp535OJ6E3')) {
      userRules = Array.from(automationsStore.values()).filter(
        (r) => (r.ownerId.includes('vuedevo') || r.ownerId === 'admin_vuedevo_01' || r.ownerId === 'KlSX6JgegtUIsQinZRKp535OJ6E3') && !r.deleted && !deletedAutomationsStore.has(r.id)
      );
    }

    userRules.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    res.json({
      success: true,
      count: userRules.length,
      rules: userRules,
    });
  });

  app.post('/api/users/:uid/automations', (req: Request, res: Response) => {
    const rawUid = String(req.params.uid || '').trim();
    const uid = rawUid.replace(/[^a-zA-Z0-9_\-]/g, '_') || 'default';
    const body = req.body || {};

    const id = String(body.id || `auto_${Date.now()}`).trim();
    deletedAutomationsStore.delete(id);
    const record: ServerAutomationRecord = {
      id,
      ownerId: uid,
      name: String(body.name || 'Catat Otomatis').slice(0, 100),
      type: body.type === 'income' || body.type === 'transfer' ? body.type : 'expense',
      walletId: String(body.walletId || '').slice(0, 128),
      walletName: String(body.walletName || 'Dompet').slice(0, 60),
      fundOwnerId: body.fundOwnerId ? String(body.fundOwnerId).slice(0, 128) : undefined,
      fundOwnerName: body.fundOwnerName ? String(body.fundOwnerName).slice(0, 60) : undefined,
      toWalletId: body.toWalletId ? String(body.toWalletId).slice(0, 128) : undefined,
      toWalletName: body.toWalletName ? String(body.toWalletName).slice(0, 60) : undefined,
      toFundOwnerId: body.toFundOwnerId ? String(body.toFundOwnerId).slice(0, 128) : undefined,
      toFundOwnerName: body.toFundOwnerName ? String(body.toFundOwnerName).slice(0, 60) : undefined,
      category: String(body.category || 'Lainnya').slice(0, 50),
      categoryId: body.categoryId ? String(body.categoryId).slice(0, 128) : undefined,
      amount: Math.abs(Number(body.amount) || 0),
      adminFee: Math.max(0, Number(body.adminFee) || 0),
      note: String(body.note || '').slice(0, 200),
      scheduleDays: Array.isArray(body.scheduleDays)
        ? body.scheduleDays.map((d: any) => Math.floor(Number(d))).filter((d: number) => d >= 1 && d <= 31)
        : [25],
      executionTime: String(body.executionTime || '09:00').slice(0, 5),
      mode: body.mode === 'without_confirmation' ? 'without_confirmation' : 'with_confirmation',
      isActive: body.isActive !== undefined ? Boolean(body.isActive) : true,
      lastExecutedDate: body.lastExecutedDate || null,
      lastCancelledDate: body.lastCancelledDate || null,
      lastPushNotifiedDate: body.lastPushNotifiedDate || null,
      snoozedUntil: body.snoozedUntil || null,
      deleted: false,
      createdAt: body.createdAt || nowIso(),
      updatedAt: nowIso(),
    };

    automationsStore.set(id, record);
    savePersistedAutomationsCache();

    const isFromPeer = Boolean((req as any).verifiedCaller?.isPeer);
    if (!isFromPeer) {
      void syncAutomationToPeer(uid, record, false);
    }

    res.json({
      success: true,
      rule: record,
    });
  });

  app.put('/api/users/:uid/automations/:id', (req: Request, res: Response) => {
    const rawUid = String(req.params.uid || '').trim();
    const uid = rawUid.replace(/[^a-zA-Z0-9_\-]/g, '_') || 'default';
    const id = String(req.params.id || '').trim();
    const body = req.body || {};

    const existing = automationsStore.get(id);
    const record: ServerAutomationRecord = {
      id,
      ownerId: uid,
      name: String(body.name || existing?.name || 'Catat Otomatis').slice(0, 100),
      type: body.type === 'income' || body.type === 'transfer' ? body.type : (existing?.type || 'expense'),
      walletId: String(body.walletId || existing?.walletId || '').slice(0, 128),
      walletName: String(body.walletName || existing?.walletName || 'Dompet').slice(0, 60),
      fundOwnerId: body.fundOwnerId !== undefined ? String(body.fundOwnerId || '').slice(0, 128) : existing?.fundOwnerId,
      fundOwnerName: body.fundOwnerName !== undefined ? String(body.fundOwnerName || '').slice(0, 60) : existing?.fundOwnerName,
      toWalletId: body.toWalletId !== undefined ? String(body.toWalletId || '').slice(0, 128) : existing?.toWalletId,
      toWalletName: body.toWalletName !== undefined ? String(body.toWalletName || '').slice(0, 60) : existing?.toWalletName,
      toFundOwnerId: body.toFundOwnerId !== undefined ? String(body.toFundOwnerId || '').slice(0, 128) : existing?.toFundOwnerId,
      toFundOwnerName: body.toFundOwnerName !== undefined ? String(body.toFundOwnerName || '').slice(0, 60) : existing?.toFundOwnerName,
      category: String(body.category || existing?.category || 'Lainnya').slice(0, 50),
      categoryId: body.categoryId !== undefined ? (body.categoryId ? String(body.categoryId).slice(0, 128) : undefined) : existing?.categoryId,
      amount: body.amount !== undefined ? Math.abs(Number(body.amount) || 0) : (existing?.amount || 0),
      adminFee: body.adminFee !== undefined ? Math.max(0, Number(body.adminFee) || 0) : (existing?.adminFee || 0),
      note: String(body.note !== undefined ? body.note : (existing?.note || '')).slice(0, 200),
      scheduleDays: Array.isArray(body.scheduleDays)
        ? body.scheduleDays.map((d: any) => Math.floor(Number(d))).filter((d: number) => d >= 1 && d <= 31)
        : (existing?.scheduleDays || [25]),
      executionTime: String(body.executionTime || existing?.executionTime || '09:00').slice(0, 5),
      mode: body.mode === 'without_confirmation' ? 'without_confirmation' : 'with_confirmation',
      isActive: body.isActive !== undefined ? Boolean(body.isActive) : (existing?.isActive !== undefined ? existing.isActive : true),
      lastExecutedDate: body.lastExecutedDate !== undefined ? body.lastExecutedDate : (existing?.lastExecutedDate || null),
      lastCancelledDate: body.lastCancelledDate !== undefined ? body.lastCancelledDate : (existing?.lastCancelledDate || null),
      lastPushNotifiedDate: body.lastPushNotifiedDate !== undefined ? body.lastPushNotifiedDate : (existing?.lastPushNotifiedDate || null),
      snoozedUntil: body.snoozedUntil !== undefined ? body.snoozedUntil : (existing?.snoozedUntil || null),
      deleted: false,
      createdAt: existing?.createdAt || nowIso(),
      updatedAt: nowIso(),
    };

    automationsStore.set(id, record);
    savePersistedAutomationsCache();

    const isFromPeer = Boolean((req as any).verifiedCaller?.isPeer);
    if (!isFromPeer) {
      void syncAutomationToPeer(uid, record, false);
    }

    res.json({
      success: true,
      rule: record,
    });
  });

  app.patch('/api/users/:uid/automations/:id', (req: Request, res: Response) => {
    const rawUid = String(req.params.uid || '').trim();
    const uid = rawUid.replace(/[^a-zA-Z0-9_\-]/g, '_') || 'default';
    const id = String(req.params.id || '').trim();
    const body = req.body || {};

    const existing = automationsStore.get(id);
    if (!existing) {
      res.status(404).json({ error: 'Automation rule not found' });
      return;
    }

    if (body.isActive !== undefined) existing.isActive = Boolean(body.isActive);
    if (body.lastExecutedDate !== undefined) {
      existing.lastExecutedDate = body.lastExecutedDate;
      existing.claimedExecutionDate = null;
      existing.claimedAt = null;
      existing.claimedBy = null;
    }
    if (body.lastCancelledDate !== undefined) {
      existing.lastCancelledDate = body.lastCancelledDate;
      existing.claimedExecutionDate = null;
      existing.claimedAt = null;
      existing.claimedBy = null;
    }
    if (body.lastPushNotifiedDate !== undefined) existing.lastPushNotifiedDate = body.lastPushNotifiedDate;
    if (body.snoozedUntil !== undefined) existing.snoozedUntil = body.snoozedUntil;
    if (body.deleted !== undefined) existing.deleted = Boolean(body.deleted);
    existing.updatedAt = nowIso();

    automationsStore.set(id, existing);
    savePersistedAutomationsCache();

    const isFromPeer = Boolean((req as any).verifiedCaller?.isPeer);
    if (!isFromPeer) {
      void syncAutomationToPeer(uid, existing, false);
    }

    res.json({
      success: true,
      rule: existing,
    });
  });

  // Fetch a single automation rule's real-time execution state
  app.get('/api/users/:uid/automations/:id', (req: Request, res: Response) => {
    const id = String(req.params.id || '').trim();
    const existing = automationsStore.get(id);
    if (!existing || existing.deleted) {
      res.status(404).json({ success: false, error: 'Automation rule not found' });
      return;
    }
    res.json({ success: true, rule: existing });
  });

  // Atomic distributed claim endpoint to guarantee single-device execution across multi-device logins
  app.post('/api/users/:uid/automations/:id/claim-execution', (req: Request, res: Response) => {
    const id = String(req.params.id || '').trim();
    const targetDate = String(req.body?.date || '').trim();
    const deviceId = String(req.body?.deviceId || '').trim();

    if (!targetDate) {
      res.status(400).json({ success: false, error: 'Target execution date is required' });
      return;
    }

    const existing = automationsStore.get(id);
    if (!existing || existing.deleted) {
      res.status(404).json({ success: false, error: 'Automation rule not found' });
      return;
    }

    // 1. If already executed today, refuse claim immediately
    if (existing.lastExecutedDate === targetDate) {
      res.json({
        success: false,
        claimed: false,
        reason: 'already_executed',
        lastExecutedDate: existing.lastExecutedDate,
      });
      return;
    }

    // 2. If already cancelled today, refuse claim immediately
    if (existing.lastCancelledDate === targetDate) {
      res.json({
        success: false,
        claimed: false,
        reason: 'already_cancelled',
        lastCancelledDate: existing.lastCancelledDate,
      });
      return;
    }

    // 3. If currently leased/claimed by another device within the last 60 seconds, prevent duplicate execution
    const nowMs = Date.now();
    const leaseMs = 60 * 1000;
    if (
      existing.claimedExecutionDate === targetDate &&
      existing.claimedAt &&
      nowMs - existing.claimedAt < leaseMs &&
      existing.claimedBy &&
      existing.claimedBy !== deviceId
    ) {
      res.json({
        success: false,
        claimed: false,
        reason: 'currently_claimed_by_other_device',
        claimedBy: existing.claimedBy,
        leaseRemainingMs: Math.max(0, leaseMs - (nowMs - existing.claimedAt)),
      });
      return;
    }

    // 4. Grant atomic exclusive execution claim to this device
    existing.claimedExecutionDate = targetDate;
    existing.claimedAt = nowMs;
    existing.claimedBy = deviceId;
    existing.updatedAt = nowIso();
    automationsStore.set(id, existing);

    res.json({
      success: true,
      claimed: true,
      rule: existing,
    });
  });

  // Release claim if execution failed or was aborted
  app.post('/api/users/:uid/automations/:id/release-claim', (req: Request, res: Response) => {
    const id = String(req.params.id || '').trim();
    const deviceId = String(req.body?.deviceId || '').trim();
    const existing = automationsStore.get(id);
    if (existing) {
      if (!deviceId || existing.claimedBy === deviceId) {
        existing.claimedExecutionDate = null;
        existing.claimedAt = null;
        existing.claimedBy = null;
        existing.updatedAt = nowIso();
        automationsStore.set(id, existing);
      }
    }
    res.json({ success: true });
  });

  app.delete('/api/users/:uid/automations/:id', (req: Request, res: Response) => {
    const rawUid = String(req.params.uid || '').trim();
    const uid = rawUid.replace(/[^a-zA-Z0-9_\-]/g, '_') || 'default';
    const id = String(req.params.id || '').trim();

    deletedAutomationsStore.add(id);
    const existing = automationsStore.get(id);
    automationsStore.delete(id);
    savePersistedAutomationsCache();

    const isFromPeer = Boolean((req as any).verifiedCaller?.isPeer);
    if (!isFromPeer && existing) {
      void syncAutomationToPeer(uid, { ...existing, id, deleted: true, updatedAt: nowIso() }, true);
    }

    res.json({
      success: true,
      deletedId: id,
    });
  });

  app.post('/api/users/:uid/automations/batch', (req: Request, res: Response) => {
    const rawUid = String(req.params.uid || '').trim();
    const uid = rawUid.replace(/[^a-zA-Z0-9_\-]/g, '_') || 'default';
    const items = Array.isArray(req.body?.rules) ? req.body.rules : [];

    let count = 0;
    for (const item of items) {
      if (item && item.id) {
        const id = String(item.id);
        if (deletedAutomationsStore.has(id) || item.deleted) {
          automationsStore.delete(id);
          continue;
        }
        const record: ServerAutomationRecord = {
          id,
          ownerId: uid,
          name: String(item.name || 'Catat Otomatis').slice(0, 100),
          type: item.type === 'income' || item.type === 'transfer' ? item.type : 'expense',
          walletId: String(item.walletId || '').slice(0, 128),
          walletName: String(item.walletName || 'Dompet').slice(0, 60),
          fundOwnerId: item.fundOwnerId ? String(item.fundOwnerId).slice(0, 128) : undefined,
          fundOwnerName: item.fundOwnerName ? String(item.fundOwnerName).slice(0, 60) : undefined,
          toWalletId: item.toWalletId ? String(item.toWalletId).slice(0, 128) : undefined,
          toWalletName: item.toWalletName ? String(item.toWalletName).slice(0, 60) : undefined,
          toFundOwnerId: item.toFundOwnerId ? String(item.toFundOwnerId).slice(0, 128) : undefined,
          toFundOwnerName: item.toFundOwnerName ? String(item.toFundOwnerName).slice(0, 60) : undefined,
          category: String(item.category || 'Lainnya').slice(0, 50),
          categoryId: item.categoryId ? String(item.categoryId).slice(0, 128) : undefined,
          amount: Math.abs(Number(item.amount) || 0),
          adminFee: Math.max(0, Number(item.adminFee) || 0),
          note: String(item.note || '').slice(0, 200),
          scheduleDays: Array.isArray(item.scheduleDays) ? item.scheduleDays : [25],
          executionTime: String(item.executionTime || '09:00').slice(0, 5),
          mode: item.mode === 'without_confirmation' ? 'without_confirmation' : 'with_confirmation',
          isActive: item.isActive !== undefined ? Boolean(item.isActive) : true,
          lastExecutedDate: item.lastExecutedDate || null,
          lastCancelledDate: item.lastCancelledDate || null,
          lastPushNotifiedDate: item.lastPushNotifiedDate || null,
          snoozedUntil: item.snoozedUntil || null,
          deleted: false,
          createdAt: item.createdAt || nowIso(),
          updatedAt: nowIso(),
        };
        automationsStore.set(id, record);
        count++;
      }
    }

    if (count > 0) {
      savePersistedAutomationsCache();
    }

    res.json({
      success: true,
      syncedCount: count,
    });
  });

  // =========================================================================
  // Tabungan / Savings Goals & Progress Endpoints (/api/users/:uid/savings)
  // =========================================================================

  app.get('/api/users/:uid/savings', (req: Request, res: Response) => {
    const rawUid = String(req.params.uid || '').trim();
    const uid = rawUid.replace(/[^a-zA-Z0-9_\-]/g, '_');

    const matchesUid = (ownerId: string) =>
      ownerId === uid ||
      ownerId === rawUid ||
      ((uid.includes('vuedevo') || uid === 'admin_vuedevo_01' || rawUid === 'KlSX6JgegtUIsQinZRKp535OJ6E3') &&
        (ownerId.includes('vuedevo') || ownerId === 'admin_vuedevo_01' || ownerId === 'KlSX6JgegtUIsQinZRKp535OJ6E3'));

    const goals = Array.from(savingsGoalsStore.values())
      .filter((g) => matchesUid(g.ownerId) && !g.deleted && !deletedSavingsGoalsStore.has(g.id))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    const entries = Array.from(savingsEntriesStore.values())
      .filter((e) => matchesUid(e.ownerId) && !e.deleted && !deletedSavingsEntriesStore.has(e.id))
      .sort((a, b) => {
        const dateCmp = String(b.date || '').localeCompare(String(a.date || ''));
        if (dateCmp !== 0) return dateCmp;
        return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
      });

    res.json({
      success: true,
      goals,
      entries,
    });
  });

  app.post('/api/users/:uid/savings/goals', (req: Request, res: Response) => {
    const rawUid = String(req.params.uid || '').trim();
    const uid = rawUid.replace(/[^a-zA-Z0-9_\-]/g, '_') || 'default';
    const body = req.body || {};

    const id = String(body.id || `sav_${Date.now()}`).trim();
    deletedSavingsGoalsStore.delete(id);
    const existing = savingsGoalsStore.get(id);

    const record: ServerSavingsGoalRecord = {
      id,
      ownerId: uid,
      name: String(body.name || existing?.name || 'Tabungan Baru').slice(0, 100),
      category: String(body.category || existing?.category || 'Lainnya').slice(0, 50),
      targetAmount: Math.max(1, Math.abs(Number(body.targetAmount ?? existing?.targetAmount) || 0)),
      deadline: body.deadline !== undefined ? (body.deadline ? String(body.deadline).slice(0, 30) : null) : (existing?.deadline || null),
      note: String(body.note !== undefined ? body.note : (existing?.note || '')).slice(0, 200),
      color: String(body.color || existing?.color || 'emerald').slice(0, 20),
      reminderEnabled: body.reminderEnabled !== undefined ? Boolean(body.reminderEnabled) : Boolean(existing?.reminderEnabled),
      reminderDays: Array.isArray(body.reminderDays)
        ? body.reminderDays.map((d: any) => Math.floor(Number(d))).filter((d: number) => d >= 1 && d <= 31)
        : (existing?.reminderDays || [1]),
      reminderTime: String(body.reminderTime || existing?.reminderTime || '09:00').slice(0, 10),
      reminderAmount: body.reminderAmount !== undefined
        ? (body.reminderAmount ? Math.max(0, Number(body.reminderAmount)) : null)
        : (existing?.reminderAmount || null),
      lastRemindedDate: body.lastRemindedDate !== undefined ? body.lastRemindedDate : (existing?.lastRemindedDate || null),
      lastSkippedDate: body.lastSkippedDate !== undefined ? body.lastSkippedDate : (existing?.lastSkippedDate || null),
      lastPushNotifiedDate: body.lastPushNotifiedDate !== undefined ? body.lastPushNotifiedDate : (existing?.lastPushNotifiedDate || null),
      snoozedUntil: body.snoozedUntil !== undefined ? body.snoozedUntil : (existing?.snoozedUntil || null),
      deleted: false,
      createdAt: body.createdAt || existing?.createdAt || nowIso(),
      updatedAt: nowIso(),
    };

    savingsGoalsStore.set(id, record);
    savePersistedSavingsCache();

    if (!Boolean((req as any).verifiedCaller?.isPeer)) {
      void syncSavingsToPeer(uid, 'goals', id, record, false);
    }

    res.json({ success: true, goal: record });
  });

  app.patch('/api/users/:uid/savings/goals/:id', (req: Request, res: Response) => {
    const rawUid = String(req.params.uid || '').trim();
    const uid = rawUid.replace(/[^a-zA-Z0-9_\-]/g, '_') || 'default';
    const id = String(req.params.id || '').trim();
    const body = req.body || {};

    const existing = savingsGoalsStore.get(id);
    if (!existing) {
      res.status(404).json({ error: 'Savings goal not found' });
      return;
    }

    if (body.lastRemindedDate !== undefined) existing.lastRemindedDate = body.lastRemindedDate;
    if (body.lastSkippedDate !== undefined) existing.lastSkippedDate = body.lastSkippedDate;
    if (body.lastPushNotifiedDate !== undefined) existing.lastPushNotifiedDate = body.lastPushNotifiedDate;
    if (body.snoozedUntil !== undefined) existing.snoozedUntil = body.snoozedUntil;
    if (body.reminderEnabled !== undefined) existing.reminderEnabled = Boolean(body.reminderEnabled);
    if (body.deleted !== undefined) existing.deleted = Boolean(body.deleted);
    existing.updatedAt = nowIso();

    savingsGoalsStore.set(id, existing);
    savePersistedSavingsCache();

    if (!Boolean((req as any).verifiedCaller?.isPeer)) {
      void syncSavingsToPeer(uid, 'goals', id, existing, false);
    }

    res.json({ success: true, goal: existing });
  });

  app.delete('/api/users/:uid/savings/goals/:id', (req: Request, res: Response) => {
    const rawUid = String(req.params.uid || '').trim();
    const uid = rawUid.replace(/[^a-zA-Z0-9_\-]/g, '_') || 'default';
    const id = String(req.params.id || '').trim();

    deletedSavingsGoalsStore.add(id);
    const existing = savingsGoalsStore.get(id);
    savingsGoalsStore.delete(id);

    // Also remove entries tied to this deleted goal
    for (const [entryId, entry] of savingsEntriesStore.entries()) {
      if (entry.savingsId === id) {
        deletedSavingsEntriesStore.add(entryId);
        savingsEntriesStore.delete(entryId);
      }
    }
    savePersistedSavingsCache();

    if (!Boolean((req as any).verifiedCaller?.isPeer) && existing) {
      void syncSavingsToPeer(uid, 'goals', id, { ...existing, deleted: true }, true);
    }

    res.json({ success: true, deletedId: id });
  });

  app.post('/api/users/:uid/savings/entries', (req: Request, res: Response) => {
    const rawUid = String(req.params.uid || '').trim();
    const uid = rawUid.replace(/[^a-zA-Z0-9_\-]/g, '_') || 'default';
    const body = req.body || {};

    const id = String(body.id || `sav_ent_${Date.now()}`).trim();
    deletedSavingsEntriesStore.delete(id);

    const record: ServerSavingsEntryRecord = {
      id,
      ownerId: uid,
      savingsId: String(body.savingsId || '').slice(0, 128),
      savingsName: body.savingsName ? String(body.savingsName).slice(0, 100) : undefined,
      type: body.type === 'withdraw' ? 'withdraw' : 'deposit',
      walletId: String(body.walletId || '').slice(0, 128),
      walletName: String(body.walletName || 'Dompet').slice(0, 60),
      fundOwnerId: body.fundOwnerId ? String(body.fundOwnerId).slice(0, 128) : undefined,
      fundOwnerName: body.fundOwnerName ? String(body.fundOwnerName).slice(0, 60) : undefined,
      amount: Math.max(1, Math.abs(Number(body.amount) || 0)),
      date: String(body.date || nowIso().slice(0, 10)).slice(0, 30),
      note: String(body.note || '').slice(0, 200),
      relatedTransactionId: body.relatedTransactionId ? String(body.relatedTransactionId).slice(0, 128) : null,
      deleted: false,
      createdAt: body.createdAt || nowIso(),
      updatedAt: nowIso(),
    };

    savingsEntriesStore.set(id, record);
    savePersistedSavingsCache();

    if (!Boolean((req as any).verifiedCaller?.isPeer)) {
      void syncSavingsToPeer(uid, 'entries', id, record, false);
    }

    res.json({ success: true, entry: record });
  });

  app.delete('/api/users/:uid/savings/entries/:id', (req: Request, res: Response) => {
    const rawUid = String(req.params.uid || '').trim();
    const uid = rawUid.replace(/[^a-zA-Z0-9_\-]/g, '_') || 'default';
    const id = String(req.params.id || '').trim();

    deletedSavingsEntriesStore.add(id);
    const existing = savingsEntriesStore.get(id);
    savingsEntriesStore.delete(id);
    savePersistedSavingsCache();

    if (!Boolean((req as any).verifiedCaller?.isPeer) && existing) {
      void syncSavingsToPeer(uid, 'entries', id, { ...existing, deleted: true }, true);
    }

    res.json({ success: true, deletedId: id });
  });

  app.post('/api/users/:uid/savings/batch', (req: Request, res: Response) => {
    const rawUid = String(req.params.uid || '').trim();
    const uid = rawUid.replace(/[^a-zA-Z0-9_\-]/g, '_') || 'default';
    const goals = Array.isArray(req.body?.goals) ? req.body.goals : [];
    const entries = Array.isArray(req.body?.entries) ? req.body.entries : [];

    let syncedCount = 0;
    for (const g of goals) {
      if (g && g.id) {
        const id = String(g.id);
        if (deletedSavingsGoalsStore.has(id) || g.deleted) {
          savingsGoalsStore.delete(id);
          continue;
        }
        savingsGoalsStore.set(id, {
          id,
          ownerId: uid,
          name: String(g.name || 'Tabungan').slice(0, 100),
          category: String(g.category || 'Lainnya').slice(0, 50),
          targetAmount: Math.max(1, Math.abs(Number(g.targetAmount) || 0)),
          deadline: g.deadline || null,
          note: String(g.note || '').slice(0, 200),
          color: String(g.color || 'emerald').slice(0, 20),
          reminderEnabled: Boolean(g.reminderEnabled),
          reminderDays: Array.isArray(g.reminderDays) ? g.reminderDays : [1],
          reminderTime: String(g.reminderTime || '09:00').slice(0, 10),
          reminderAmount: g.reminderAmount ?? null,
          lastRemindedDate: g.lastRemindedDate || null,
          lastSkippedDate: g.lastSkippedDate || null,
          lastPushNotifiedDate: g.lastPushNotifiedDate || null,
          snoozedUntil: g.snoozedUntil || null,
          deleted: false,
          createdAt: g.createdAt || nowIso(),
          updatedAt: nowIso(),
        });
        syncedCount++;
      }
    }

    for (const e of entries) {
      if (e && e.id) {
        const id = String(e.id);
        if (deletedSavingsEntriesStore.has(id) || e.deleted) {
          savingsEntriesStore.delete(id);
          continue;
        }
        savingsEntriesStore.set(id, {
          id,
          ownerId: uid,
          savingsId: String(e.savingsId || '').slice(0, 128),
          savingsName: e.savingsName ? String(e.savingsName).slice(0, 100) : undefined,
          type: e.type === 'withdraw' ? 'withdraw' : 'deposit',
          walletId: String(e.walletId || '').slice(0, 128),
          walletName: String(e.walletName || 'Dompet').slice(0, 60),
          fundOwnerId: e.fundOwnerId ? String(e.fundOwnerId).slice(0, 128) : undefined,
          fundOwnerName: e.fundOwnerName ? String(e.fundOwnerName).slice(0, 60) : undefined,
          amount: Math.max(1, Math.abs(Number(e.amount) || 0)),
          date: String(e.date || nowIso().slice(0, 10)).slice(0, 30),
          note: String(e.note || '').slice(0, 200),
          relatedTransactionId: e.relatedTransactionId || null,
          deleted: false,
          createdAt: e.createdAt || nowIso(),
          updatedAt: nowIso(),
        });
        syncedCount++;
      }
    }

    if (syncedCount > 0) {
      savePersistedSavingsCache();
    }

    res.json({ success: true, syncedCount });
  });

  // =========================================================================
  // Hutang & Piutang / Debts & Receivables Endpoints (/api/users/:uid/debts)
  // =========================================================================

  app.get('/api/users/:uid/debts', (req: Request, res: Response) => {
    const rawUid = String(req.params.uid || '').trim();
    const uid = rawUid.replace(/[^a-zA-Z0-9_\-]/g, '_');

    const matchesUid = (ownerId: string) =>
      ownerId === uid ||
      ownerId === rawUid ||
      ((uid.includes('vuedevo') || uid === 'admin_vuedevo_01' || rawUid === 'KlSX6JgegtUIsQinZRKp535OJ6E3') &&
        (ownerId.includes('vuedevo') || ownerId === 'admin_vuedevo_01' || ownerId === 'KlSX6JgegtUIsQinZRKp535OJ6E3'));

    const debts = Array.from(debtsStore.values())
      .filter((d) => matchesUid(d.ownerId) && !d.deleted && !deletedDebtsStore.has(d.id))
      .sort((a, b) => {
        const dateCmp = String(b.date || '').localeCompare(String(a.date || ''));
        if (dateCmp !== 0) return dateCmp;
        return (a.description || '').localeCompare(b.description || '');
      });

    const entries = Array.from(debtEntriesStore.values())
      .filter((e) => matchesUid(e.ownerId) && !e.deleted && !deletedDebtEntriesStore.has(e.id))
      .sort((a, b) => {
        const dateCmp = String(b.date || '').localeCompare(String(a.date || ''));
        if (dateCmp !== 0) return dateCmp;
        return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
      });

    res.json({
      success: true,
      debts,
      entries,
    });
  });

  app.post('/api/users/:uid/debts/items', (req: Request, res: Response) => {
    const rawUid = String(req.params.uid || '').trim();
    const uid = rawUid.replace(/[^a-zA-Z0-9_\-]/g, '_') || 'default';
    const body = req.body || {};

    const id = String(body.id || `dbt_${Date.now()}`).trim();
    deletedDebtsStore.delete(id);
    const existing = debtsStore.get(id);

    const record: ServerDebtRecord = {
      id,
      ownerId: uid,
      type: (body.type || existing?.type) === 'receivable' ? 'receivable' : 'debt',
      description: String(body.description || existing?.description || 'Catatan Hutang').slice(0, 150),
      amount: Math.max(1, Math.abs(Number(body.amount ?? existing?.amount) || 0)),
      walletId: String(body.walletId || existing?.walletId || '').slice(0, 128),
      walletName: String(body.walletName || existing?.walletName || 'Dompet').slice(0, 60),
      fundOwnerId: body.fundOwnerId !== undefined ? (body.fundOwnerId ? String(body.fundOwnerId).slice(0, 128) : undefined) : existing?.fundOwnerId,
      fundOwnerName: body.fundOwnerName !== undefined ? (body.fundOwnerName ? String(body.fundOwnerName).slice(0, 60) : undefined) : existing?.fundOwnerName,
      date: String(body.date || existing?.date || nowIso().slice(0, 10)).slice(0, 30),
      deadline: body.deadline !== undefined ? (body.deadline ? String(body.deadline).slice(0, 30) : null) : (existing?.deadline || null),
      note: String(body.note !== undefined ? body.note : (existing?.note || '')).slice(0, 200),
      color: String(body.color || existing?.color || (body.type === 'receivable' ? 'emerald' : 'rose')).slice(0, 20),
      relatedTransactionId: body.relatedTransactionId !== undefined ? (body.relatedTransactionId ? String(body.relatedTransactionId).slice(0, 128) : null) : (existing?.relatedTransactionId || null),
      reminderEnabled: body.reminderEnabled !== undefined ? Boolean(body.reminderEnabled) : Boolean(existing?.reminderEnabled),
      reminderDays: Array.isArray(body.reminderDays)
        ? body.reminderDays.map((d: any) => Math.floor(Number(d))).filter((d: number) => d >= 1 && d <= 31)
        : (existing?.reminderDays || [1]),
      reminderTime: String(body.reminderTime || existing?.reminderTime || '09:00').slice(0, 10),
      reminderAmount: body.reminderAmount !== undefined
        ? (body.reminderAmount ? Math.max(0, Number(body.reminderAmount)) : null)
        : (existing?.reminderAmount || null),
      lastRemindedDate: body.lastRemindedDate !== undefined ? body.lastRemindedDate : (existing?.lastRemindedDate || null),
      lastSkippedDate: body.lastSkippedDate !== undefined ? body.lastSkippedDate : (existing?.lastSkippedDate || null),
      lastPushNotifiedDate: body.lastPushNotifiedDate !== undefined ? body.lastPushNotifiedDate : (existing?.lastPushNotifiedDate || null),
      snoozedUntil: body.snoozedUntil !== undefined ? body.snoozedUntil : (existing?.snoozedUntil || null),
      deleted: false,
      createdAt: body.createdAt || existing?.createdAt || nowIso(),
      updatedAt: nowIso(),
    };

    debtsStore.set(id, record);
    savePersistedDebtsCache();

    if (!Boolean((req as any).verifiedCaller?.isPeer)) {
      void syncDebtsToPeer(uid, 'items', id, record, false);
    }

    res.json({ success: true, debt: record });
  });

  app.patch('/api/users/:uid/debts/items/:id', (req: Request, res: Response) => {
    const rawUid = String(req.params.uid || '').trim();
    const uid = rawUid.replace(/[^a-zA-Z0-9_\-]/g, '_') || 'default';
    const id = String(req.params.id || '').trim();
    const body = req.body || {};

    const existing = debtsStore.get(id);
    if (!existing) {
      res.status(404).json({ error: 'Debt item not found' });
      return;
    }

    if (body.lastRemindedDate !== undefined) existing.lastRemindedDate = body.lastRemindedDate;
    if (body.lastSkippedDate !== undefined) existing.lastSkippedDate = body.lastSkippedDate;
    if (body.lastPushNotifiedDate !== undefined) existing.lastPushNotifiedDate = body.lastPushNotifiedDate;
    if (body.snoozedUntil !== undefined) existing.snoozedUntil = body.snoozedUntil;
    if (body.reminderEnabled !== undefined) existing.reminderEnabled = Boolean(body.reminderEnabled);
    if (body.deleted !== undefined) existing.deleted = Boolean(body.deleted);
    existing.updatedAt = nowIso();

    debtsStore.set(id, existing);
    savePersistedDebtsCache();

    if (!Boolean((req as any).verifiedCaller?.isPeer)) {
      void syncDebtsToPeer(uid, 'items', id, existing, false);
    }

    res.json({ success: true, debt: existing });
  });

  app.delete('/api/users/:uid/debts/items/:id', (req: Request, res: Response) => {
    const rawUid = String(req.params.uid || '').trim();
    const uid = rawUid.replace(/[^a-zA-Z0-9_\-]/g, '_') || 'default';
    const id = String(req.params.id || '').trim();

    deletedDebtsStore.add(id);
    const existing = debtsStore.get(id);
    debtsStore.delete(id);

    for (const [entryId, entry] of debtEntriesStore.entries()) {
      if (entry.debtId === id) {
        deletedDebtEntriesStore.add(entryId);
        debtEntriesStore.delete(entryId);
      }
    }
    savePersistedDebtsCache();

    if (!Boolean((req as any).verifiedCaller?.isPeer) && existing) {
      void syncDebtsToPeer(uid, 'items', id, { ...existing, deleted: true }, true);
    }

    res.json({ success: true, deletedId: id });
  });

  app.post('/api/users/:uid/debts/entries', (req: Request, res: Response) => {
    const rawUid = String(req.params.uid || '').trim();
    const uid = rawUid.replace(/[^a-zA-Z0-9_\-]/g, '_') || 'default';
    const body = req.body || {};

    const id = String(body.id || `dbt_ent_${Date.now()}`).trim();
    deletedDebtEntriesStore.delete(id);

    const record: ServerDebtEntryRecord = {
      id,
      ownerId: uid,
      debtId: String(body.debtId || '').slice(0, 128),
      debtDescription: body.debtDescription ? String(body.debtDescription).slice(0, 150) : undefined,
      debtType: body.debtType === 'receivable' ? 'receivable' : 'debt',
      walletId: String(body.walletId || '').slice(0, 128),
      walletName: String(body.walletName || 'Dompet').slice(0, 60),
      fundOwnerId: body.fundOwnerId ? String(body.fundOwnerId).slice(0, 128) : undefined,
      fundOwnerName: body.fundOwnerName ? String(body.fundOwnerName).slice(0, 60) : undefined,
      amount: Math.max(1, Math.abs(Number(body.amount) || 0)),
      date: String(body.date || nowIso().slice(0, 10)).slice(0, 30),
      note: String(body.note || '').slice(0, 200),
      relatedTransactionId: body.relatedTransactionId ? String(body.relatedTransactionId).slice(0, 128) : null,
      deleted: false,
      createdAt: body.createdAt || nowIso(),
      updatedAt: nowIso(),
    };

    debtEntriesStore.set(id, record);
    savePersistedDebtsCache();

    if (!Boolean((req as any).verifiedCaller?.isPeer)) {
      void syncDebtsToPeer(uid, 'entries', id, record, false);
    }

    res.json({ success: true, entry: record });
  });

  app.delete('/api/users/:uid/debts/entries/:id', (req: Request, res: Response) => {
    const rawUid = String(req.params.uid || '').trim();
    const uid = rawUid.replace(/[^a-zA-Z0-9_\-]/g, '_') || 'default';
    const id = String(req.params.id || '').trim();

    deletedDebtEntriesStore.add(id);
    const existing = debtEntriesStore.get(id);
    debtEntriesStore.delete(id);
    savePersistedDebtsCache();

    if (!Boolean((req as any).verifiedCaller?.isPeer) && existing) {
      void syncDebtsToPeer(uid, 'entries', id, { ...existing, deleted: true }, true);
    }

    res.json({ success: true, deletedId: id });
  });

  app.post('/api/users/:uid/debts/batch', (req: Request, res: Response) => {
    const rawUid = String(req.params.uid || '').trim();
    const uid = rawUid.replace(/[^a-zA-Z0-9_\-]/g, '_') || 'default';
    const debts = Array.isArray(req.body?.debts) ? req.body.debts : [];
    const entries = Array.isArray(req.body?.entries) ? req.body.entries : [];

    let syncedCount = 0;
    for (const d of debts) {
      if (d && d.id) {
        const id = String(d.id);
        if (deletedDebtsStore.has(id) || d.deleted) {
          debtsStore.delete(id);
          continue;
        }
        debtsStore.set(id, {
          id,
          ownerId: uid,
          type: d.type === 'receivable' ? 'receivable' : 'debt',
          description: String(d.description || 'Catatan Hutang').slice(0, 150),
          amount: Math.max(1, Math.abs(Number(d.amount) || 0)),
          walletId: String(d.walletId || '').slice(0, 128),
          walletName: String(d.walletName || 'Dompet').slice(0, 60),
          fundOwnerId: d.fundOwnerId ? String(d.fundOwnerId).slice(0, 128) : undefined,
          fundOwnerName: d.fundOwnerName ? String(d.fundOwnerName).slice(0, 60) : undefined,
          date: String(d.date || nowIso().slice(0, 10)).slice(0, 30),
          deadline: d.deadline || null,
          note: String(d.note || '').slice(0, 200),
          color: String(d.color || 'rose').slice(0, 20),
          relatedTransactionId: d.relatedTransactionId || null,
          reminderEnabled: Boolean(d.reminderEnabled),
          reminderDays: Array.isArray(d.reminderDays) ? d.reminderDays : [1],
          reminderTime: String(d.reminderTime || '09:00').slice(0, 10),
          reminderAmount: d.reminderAmount ?? null,
          lastRemindedDate: d.lastRemindedDate || null,
          lastSkippedDate: d.lastSkippedDate || null,
          lastPushNotifiedDate: d.lastPushNotifiedDate || null,
          snoozedUntil: d.snoozedUntil || null,
          deleted: false,
          createdAt: d.createdAt || nowIso(),
          updatedAt: nowIso(),
        });
        syncedCount++;
      }
    }

    for (const e of entries) {
      if (e && e.id) {
        const id = String(e.id);
        if (deletedDebtEntriesStore.has(id) || e.deleted) {
          debtEntriesStore.delete(id);
          continue;
        }
        debtEntriesStore.set(id, {
          id,
          ownerId: uid,
          debtId: String(e.debtId || '').slice(0, 128),
          debtDescription: e.debtDescription ? String(e.debtDescription).slice(0, 150) : undefined,
          debtType: e.debtType === 'receivable' ? 'receivable' : 'debt',
          walletId: String(e.walletId || '').slice(0, 128),
          walletName: String(e.walletName || 'Dompet').slice(0, 60),
          fundOwnerId: e.fundOwnerId ? String(e.fundOwnerId).slice(0, 128) : undefined,
          fundOwnerName: e.fundOwnerName ? String(e.fundOwnerName).slice(0, 60) : undefined,
          amount: Math.max(1, Math.abs(Number(e.amount) || 0)),
          date: String(e.date || nowIso().slice(0, 10)).slice(0, 30),
          note: String(e.note || '').slice(0, 200),
          relatedTransactionId: e.relatedTransactionId || null,
          deleted: false,
          createdAt: e.createdAt || nowIso(),
          updatedAt: nowIso(),
        });
        syncedCount++;
      }
    }

    if (syncedCount > 0) {
      savePersistedDebtsCache();
    }

    res.json({ success: true, syncedCount });
  });

  // =========================================================================
  // Device & Session Management Endpoints (/api/users/:uid/sessions/*)
  // =========================================================================

  // Register or refresh a device session on login / switch / app boot
  app.post('/api/users/:uid/sessions/register', (req: Request, res: Response) => {
    const uid = String(req.params.uid || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const deviceId = String(req.body?.deviceId || '').trim();
    const ua = String(req.body?.userAgent || req.headers['user-agent'] || '');
    const parsedUa = parseUserAgentInfo(ua);
    const customDeviceName = String(req.body?.deviceName || '').trim();
    const deviceName = (customDeviceName || parsedUa.defaultName).slice(0, 80);
    const browser = String(req.body?.browser || parsedUa.browser).slice(0, 40);
    const os = String(req.body?.os || parsedUa.os).slice(0, 40);
    const deviceType: 'desktop' | 'mobile' | 'tablet' =
      req.body?.deviceType === 'mobile' || req.body?.deviceType === 'tablet'
        ? req.body.deviceType
        : parsedUa.deviceType;
    const forceNewLogin = Boolean(req.body?.forceNewLogin);

    if (!uid || !deviceId) {
      res.status(400).json({ error: 'UID dan Device ID wajib disertakan.' });
      return;
    }

    const identities = resolveUserIdentities(uid, email);
    const sessionId = `${uid}__${deviceId}`;
    const now = nowIso();
    const ipAddress = extractClientIp(req);

    // Look for existing session either by sessionId or deviceId matching this user
    let existing: ServerDeviceSessionRecord | undefined = deviceSessionsStore.get(sessionId);
    if (!existing) {
      for (const s of deviceSessionsStore.values()) {
        if (s.deviceId === deviceId && isSessionMatching(s, identities)) {
          existing = s;
          break;
        }
      }
    }

    if (existing) {
      // If session was revoked and this is NOT an explicit fresh login, report revoked so client logs out
      if (existing.status === 'revoked' && !forceNewLogin) {
        const userSessions = Array.from(deviceSessionsStore.values()).filter(
          (s) => s.status === 'active' && isSessionMatching(s, identities)
        );
        res.json({
          session: existing,
          revoked: true,
          sessions: userSessions,
        });
        return;
      }

      existing.status = 'active';
      existing.revokedAt = null;
      existing.revokedByDeviceId = null;
      existing.uid = uid;
      existing.email = email || existing.email || identities.email;
      existing.deviceName = customDeviceName ? deviceName : existing.deviceName || deviceName;
      existing.browser = browser;
      existing.os = os;
      existing.deviceType = deviceType;
      existing.ipAddress = ipAddress;
      existing.lastActiveAt = now;
      savePersistedSessionsCache();
    } else {
      const record: ServerDeviceSessionRecord = {
        sessionId,
        uid,
        email: email || identities.email || 'user@sisa-uang.id',
        deviceId,
        deviceName,
        browser,
        os,
        deviceType,
        ipAddress,
        isPrimary: false,
        status: 'active',
        revokedAt: null,
        revokedByDeviceId: null,
        createdAt: now,
        lastActiveAt: now,
      };
      deviceSessionsStore.set(sessionId, record);
      savePersistedSessionsCache();
    }

    const activeSessions = Array.from(deviceSessionsStore.values())
      .filter((s) => s.status === 'active' && isSessionMatching(s, identities))
      .sort((a, b) => {
        if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
        return String(b.lastActiveAt).localeCompare(String(a.lastActiveAt));
      });

    res.json({
      session: deviceSessionsStore.get(sessionId) || existing,
      revoked: false,
      sessions: activeSessions,
    });
  });

  // Get all active sessions for a user
  app.get('/api/users/:uid/sessions', (req: Request, res: Response) => {
    const uid = String(req.params.uid || '').trim();
    const deviceId = String(req.query.deviceId || '').trim();
    const emailQuery = String(req.query.email || '').trim().toLowerCase();
    const identities = resolveUserIdentities(uid, emailQuery);

    if (deviceId) {
      for (const s of deviceSessionsStore.values()) {
        if (s.deviceId === deviceId && isSessionMatching(s, identities)) {
          if (s.status === 'active') {
            s.lastActiveAt = nowIso();
            s.ipAddress = extractClientIp(req);
          }
        }
      }
    }

    const activeSessions = Array.from(deviceSessionsStore.values())
      .filter((s) => s.status === 'active' && isSessionMatching(s, identities))
      .sort((a, b) => {
        if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
        return String(b.lastActiveAt).localeCompare(String(a.lastActiveAt));
      });

    let currentSession = deviceId
      ? Array.from(deviceSessionsStore.values()).find(
          (s) => s.deviceId === deviceId && s.status === 'active' && isSessionMatching(s, identities)
        )
      : null;

    res.json({
      sessions: activeSessions,
      currentSession: currentSession || null,
      hasPrimaryDevice: activeSessions.some((s) => s.isPrimary),
    });
  });

  // Request Email OTP to set a device as the Primary Device (Perangkat Utama)
  app.post('/api/users/:uid/sessions/request-primary-otp', async (req: Request, res: Response) => {
    const uid = String(req.params.uid || '').trim();
    const deviceId = String(req.body?.deviceId || '').trim();
    const rawEmail = String(req.body?.email || '').trim().toLowerCase();
    const identities = resolveUserIdentities(uid, rawEmail);
    const targetEmail = (rawEmail || identities.email || '').trim().toLowerCase();

    if (!uid || !deviceId || !targetEmail) {
      res.status(400).json({
        error: 'UID, Device ID, dan alamat email terdaftar wajib disertakan.',
      });
      return;
    }

    const sessionId = `${uid}__${deviceId}`;
    let session = deviceSessionsStore.get(sessionId);
    if (!session) {
      for (const s of deviceSessionsStore.values()) {
        if (s.deviceId === deviceId && isSessionMatching(s, identities)) {
          session = s;
          break;
        }
      }
    }

    if (!session) {
      const ua = String(req.headers['user-agent'] || '');
      const parsedUa = parseUserAgentInfo(ua);
      session = {
        sessionId,
        uid,
        email: targetEmail,
        deviceId,
        deviceName: String(req.body?.deviceName || parsedUa.defaultName).slice(0, 80),
        browser: parsedUa.browser,
        os: parsedUa.os,
        deviceType: parsedUa.deviceType,
        ipAddress: extractClientIp(req),
        isPrimary: false,
        status: 'active',
        createdAt: nowIso(),
        lastActiveAt: nowIso(),
      };
      deviceSessionsStore.set(sessionId, session);
      savePersistedSessionsCache();
    }

    const otpCode = String(crypto.randomInt(100000, 999999));
    const expiresAt = Date.now() + 10 * 60 * 1000;
    primaryDeviceOtpChallenges.set(sessionId, {
      uid,
      email: targetEmail,
      deviceId,
      deviceName: session.deviceName,
      code: otpCode,
      expiresAt,
      attempts: 0,
    });

    let sentViaSmtp = false;
    let smtpNotice = '';
    if (isSmtpConfigured()) {
      try {
        await sendPrimaryDeviceOtpEmail(targetEmail, otpCode, session.deviceName);
        sentViaSmtp = true;
      } catch (mailErr: any) {
        smtpNotice = formatSmtpErrorMessage(mailErr, targetEmail);
      }
    } else {
      smtpNotice = 'Layanan SMTP belum dikonfigurasi pada server.';
    }

    appendLog(
      uid,
      targetEmail,
      'primary_device_otp_requested',
      `Pengguna meminta kode OTP ke ${targetEmail} untuk mengatur "${session.deviceName}" sebagai Perangkat Utama.`,
      'info'
    );

    res.json({
      sent: sentViaSmtp,
      email: targetEmail,
      deviceId,
      deviceName: session.deviceName,
      expiresAt,
      // Provide fallbackCode when SMTP is not configured or unreachable in preview environment so user can still complete OTP verification
      fallbackCode: sentViaSmtp ? undefined : otpCode,
      smtpNotice: smtpNotice || undefined,
      message: sentViaSmtp
        ? `Kode OTP 6 digit telah dikirim ke email terdaftar ${targetEmail}.`
        : `Kode OTP 6 digit untuk verifikasi Perangkat Utama telah dibuat untuk ${targetEmail}.`,
    });
  });

  // Verify Email OTP to promote a device as the Primary Device (Perangkat Utama)
  app.post('/api/users/:uid/sessions/verify-primary-otp', (req: Request, res: Response) => {
    const uid = String(req.params.uid || '').trim();
    const deviceId = String(req.body?.deviceId || '').trim();
    const code = String(req.body?.code || '').trim();

    if (!uid || !deviceId || !code) {
      res.status(400).json({ error: 'Kode OTP 6 digit wajib diisi.' });
      return;
    }

    const sessionId = `${uid}__${deviceId}`;
    let challenge = primaryDeviceOtpChallenges.get(sessionId);
    if (!challenge) {
      for (const [key, c] of primaryDeviceOtpChallenges.entries()) {
        if (c.deviceId === deviceId) {
          challenge = c;
          primaryDeviceOtpChallenges.delete(key);
          break;
        }
      }
    }

    if (!challenge) {
      res.status(400).json({
        error: 'Sesi permintaan OTP tidak ditemukan atau sudah kedaluwarsa. Silakan kirim ulang kode OTP.',
      });
      return;
    }

    if (Date.now() > challenge.expiresAt) {
      primaryDeviceOtpChallenges.delete(sessionId);
      res.status(400).json({
        error: 'Kode OTP telah kedaluwarsa. Silakan minta kode OTP baru.',
      });
      return;
    }

    if (challenge.code !== code) {
      challenge.attempts += 1;
      res.status(401).json({
        error: 'Kode verifikasi OTP tidak sesuai. Periksa kembali 6 digit kode pada email Anda.',
      });
      return;
    }

    primaryDeviceOtpChallenges.delete(sessionId);

    const identities = resolveUserIdentities(uid, challenge.email);

    // Demote any previous primary device for this user and promote the verified device
    for (const s of deviceSessionsStore.values()) {
      if (isSessionMatching(s, identities)) {
        s.isPrimary = s.deviceId === deviceId;
        if (s.deviceId === deviceId) {
          s.status = 'active';
          s.lastActiveAt = nowIso();
        }
      }
    }
    savePersistedSessionsCache();

    let targetSession = deviceSessionsStore.get(sessionId);
    if (!targetSession) {
      for (const s of deviceSessionsStore.values()) {
        if (s.deviceId === deviceId && isSessionMatching(s, identities)) {
          targetSession = s;
          break;
        }
      }
    }

    appendLog(
      uid,
      challenge.email,
      'primary_device_set',
      `Perangkat "${targetSession?.deviceName || deviceId}" berhasil diverifikasi melalui OTP Email dan ditetapkan sebagai Perangkat Utama.`,
      'info'
    );

    const activeSessions = Array.from(deviceSessionsStore.values())
      .filter((s) => s.status === 'active' && isSessionMatching(s, identities))
      .sort((a, b) => {
        if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
        return String(b.lastActiveAt).localeCompare(String(a.lastActiveAt));
      });

    res.json({
      verified: true,
      session: targetSession,
      sessions: activeSessions,
      message: `Perangkat "${targetSession?.deviceName || 'Ini'}" kini telah menjadi Perangkat Utama.`,
    });
  });

  // Revoke / Remove another device session (Strictly requires caller to be the Primary Device, or self-logout)
  app.delete('/api/users/:uid/sessions/:targetDeviceId', (req: Request, res: Response) => {
    const uid = String(req.params.uid || '').trim();
    const targetDeviceId = String(req.params.targetDeviceId || '').trim();
    const actorDeviceId = String(req.query.actorDeviceId || req.body?.actorDeviceId || '').trim();
    const email = String(req.query.email || req.body?.email || '').trim().toLowerCase();
    const identities = resolveUserIdentities(uid, email);

    if (!uid || !targetDeviceId) {
      res.status(400).json({ error: 'Parameter sesi perangkat tidak lengkap.' });
      return;
    }

    // Find target session by targetDeviceId belonging to this user
    let targetSession: ServerDeviceSessionRecord | undefined;
    for (const s of deviceSessionsStore.values()) {
      if (s.deviceId === targetDeviceId && isSessionMatching(s, identities)) {
        targetSession = s;
        break;
      }
    }

    if (!targetSession) {
      res.status(404).json({ error: 'Sesi perangkat tidak ditemukan.' });
      return;
    }

    // If revoking a different device, verify that the actor device is the verified Primary Device!
    if (actorDeviceId !== targetDeviceId) {
      let actorSession: ServerDeviceSessionRecord | undefined;
      for (const s of deviceSessionsStore.values()) {
        if (s.deviceId === actorDeviceId && isSessionMatching(s, identities)) {
          actorSession = s;
          break;
        }
      }

      if (!actorSession || !actorSession.isPrimary || actorSession.status !== 'active') {
        res.status(403).json({
          error:
            'Hanya Perangkat Utama yang memiliki izin untuk menghapus atau mencabut (revoke) sesi di perangkat lain. Atur perangkat ini sebagai Perangkat Utama terlebih dahulu menggunakan OTP Email.',
        });
        return;
      }
    }

    targetSession.status = 'revoked';
    targetSession.isPrimary = false;
    targetSession.revokedAt = nowIso();
    targetSession.revokedByDeviceId = actorDeviceId || targetDeviceId;
    savePersistedSessionsCache();

    appendLog(
      uid,
      targetSession.email,
      'device_session_revoked',
      `Sesi perangkat "${targetSession.deviceName}" (${targetSession.os} · ${targetSession.browser}) telah dicabut/dihentikan oleh Perangkat Utama.`,
      'warning'
    );

    const activeSessions = Array.from(deviceSessionsStore.values())
      .filter((s) => s.status === 'active' && isSessionMatching(s, identities))
      .sort((a, b) => {
        if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
        return String(b.lastActiveAt).localeCompare(String(a.lastActiveAt));
      });

    res.json({
      revokedDeviceId: targetDeviceId,
      sessions: activeSessions,
    });
  });

  // Revoke ALL other device sessions except the Primary Device
  app.post('/api/users/:uid/sessions/revoke-others', (req: Request, res: Response) => {
    const uid = String(req.params.uid || '').trim();
    const actorDeviceId = String(req.body?.actorDeviceId || '').trim();
    const email = String(req.body?.email || req.query.email || '').trim().toLowerCase();
    const identities = resolveUserIdentities(uid, email);

    if (!uid || !actorDeviceId) {
      res.status(400).json({ error: 'UID dan Actor Device ID wajib disertakan.' });
      return;
    }

    let actorSession: ServerDeviceSessionRecord | undefined;
    for (const s of deviceSessionsStore.values()) {
      if (s.deviceId === actorDeviceId && isSessionMatching(s, identities)) {
        actorSession = s;
        break;
      }
    }

    if (!actorSession || !actorSession.isPrimary || actorSession.status !== 'active') {
      res.status(403).json({
        error:
          'Hanya Perangkat Utama yang dapat mencabut seluruh sesi perangkat lain.',
      });
      return;
    }

    let revokedCount = 0;
    const now = nowIso();
    for (const s of deviceSessionsStore.values()) {
      if (isSessionMatching(s, identities) && s.deviceId !== actorDeviceId && s.status === 'active') {
        s.status = 'revoked';
        s.isPrimary = false;
        s.revokedAt = now;
        s.revokedByDeviceId = actorDeviceId;
        revokedCount++;
      }
    }

    if (revokedCount > 0) {
      savePersistedSessionsCache();
      appendLog(
        uid,
        actorSession.email,
        'all_other_sessions_revoked',
        `Perangkat Utama ("${actorSession.deviceName}") mencabut ${revokedCount} sesi aktif di perangkat lain.`,
        'warning'
      );
    }

    const activeSessions = Array.from(deviceSessionsStore.values())
      .filter((s) => s.status === 'active' && isSessionMatching(s, identities))
      .sort((a, b) => {
        if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
        return String(b.lastActiveAt).localeCompare(String(a.lastActiveAt));
      });

    res.json({
      revokedCount,
      sessions: activeSessions,
    });
  });


  // Submit SisaUang Pro Payment Proof (QRIS / Bank Transfer) -> Sends email to vuedevo@gmail.com & sets status to 'pending'
  app.post('/api/users/:uid/subscription-payment', async (req: Request, res: Response) => {
    const uid = String(req.params.uid || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const displayName = String(req.body?.displayName || '').trim() || email.split('@')[0] || 'Pengguna';
    const plan: 'monthly' | 'yearly' =
      req.body?.subscriptionPlan === 'yearly' ? 'yearly' : 'monthly';
    const paymentMethod: 'qris' | 'bank_transfer' =
      req.body?.paymentMethod === 'bank_transfer' ? 'bank_transfer' : 'qris';
    const proofDataUrl = String(req.body?.proofDataUrl || '');
    const proofFileName = String(req.body?.proofFileName || 'bukti-transfer.png').slice(0, 120);
    const senderName = String(req.body?.senderName || displayName).trim().slice(0, 80);
    const transferNote = String(req.body?.transferNote || '').trim().slice(0, 160);

    if (!uid || !proofDataUrl.startsWith('data:image/')) {
      res.status(400).json({
        error: 'Bukti transfer berupa gambar wajib diunggah sebelum mengirim konfirmasi pembayaran.',
      });
      return;
    }

    let user = usersStore.get(uid);
    if (!user && email) {
      for (const u of usersStore.values()) {
        if (u.email.toLowerCase() === email) {
          user = u;
          break;
        }
      }
    }

    const requestedAt = nowIso();
    if (!user) {
      user = {
        uid,
        username: (email.split('@')[0] || `user_${Date.now()}`).slice(0, 60),
        email: email || `${uid}@sisa-uang.id`,
        displayName: displayName.slice(0, 80),
        role: 'user',
        status: 'active',
        authProvider: 'password',
        currency: 'IDR',
        subscriptionStatus: 'pending',
        isPro: false,
        subscriptionPlan: plan,
        subscriptionExpiresAt: null,
        subscriptionPaymentMethod: paymentMethod,
        subscriptionProofDataUrl: proofDataUrl,
        subscriptionProofFileName: proofFileName,
        subscriptionRequestedAt: requestedAt,
        subscriptionSenderName: senderName,
        subscriptionTransferNote: transferNote,
        createdAt: requestedAt,
        updatedAt: requestedAt,
      };
      usersStore.set(uid, user);
    } else {
      user.subscriptionStatus = 'pending';
      user.isPro = false;
      user.subscriptionPlan = plan;
      user.subscriptionExpiresAt = null;
      user.subscriptionPaymentMethod = paymentMethod;
      user.subscriptionProofDataUrl = proofDataUrl;
      user.subscriptionProofFileName = proofFileName;
      user.subscriptionRequestedAt = requestedAt;
      user.subscriptionSenderName = senderName;
      user.subscriptionTransferNote = transferNote;
      user.updatedAt = requestedAt;
    }

    savePersistedUsersCache();

    const planLabel = plan === 'yearly' ? 'Tahunan' : 'Bulanan';
    const methodLabel = paymentMethod === 'qris' ? 'QRIS' : 'Transfer Bank';

    // Automatically send email to vuedevo@gmail.com with subscription details & transfer proof attachment
    let emailDispatched = false;
    let emailErrorNote = '';
    if (isSmtpConfigured()) {
      try {
        await sendProSubscriptionPaymentEmail({
          recipientEmail: 'vuedevo@gmail.com',
          userUid: user.uid,
          userDisplayName: user.displayName,
          userEmail: user.email,
          plan,
          paymentMethod,
          senderName,
          transferNote,
          proofDataUrl,
          proofFileName,
          requestedAt: new Date(requestedAt).toLocaleString('id-ID'),
        });
        emailDispatched = true;
      } catch (mailErr: any) {
        emailErrorNote = String(mailErr?.message || mailErr || '');
      }
    }

    const log = appendLog(
      user.uid,
      user.email,
      'subscription_payment_submitted',
      `Pengguna ${user.displayName} (${user.email}) mengirim bukti pembayaran SisaUang Pro (${planLabel} via ${methodLabel}). Email ke vuedevo@gmail.com ${emailDispatched ? 'terkirim otomatis' : 'tersimpan di sistem antrean verifikasi'}. Status: PENDING.`,
      'info'
    );

    res.json({
      user: sanitizeUser(user),
      emailDispatched,
      recipientEmail: 'vuedevo@gmail.com',
      emailErrorNote: emailErrorNote || null,
      log,
    });
  });

  // 1. Create Midtrans Transaction / In-Site Checkout Order (Strictly IDR)
  app.post('/api/payment/create-transaction', async (req: Request, res: Response) => {
    const caller = await verifyCallerAuth(req);
    if (!caller.ok) {
      res.status(caller.status).json({ error: caller.error });
      return;
    }
    try {
      const plan: 'monthly' | 'yearly' = req.body?.plan === 'yearly' ? 'yearly' : 'monthly';
      const amount = plan === 'yearly' ? 215000 : 21500;
      const customerName = String(req.body?.customerName || 'Pelanggan SisaUang').trim().slice(0, 80);
      const customerEmail = String(req.body?.customerEmail || caller.email || '').trim().toLowerCase().slice(0, 100);
      const customerPhone = String(req.body?.customerPhone || '080000000000').trim().slice(0, 30);
      const paymentMethod = String(req.body?.paymentMethod || 'qris');

      const timestamp = Date.now();
      const orderId = `SU-ORD-${timestamp}`;
      const invoiceNumber = `INV-SU-${timestamp.toString().slice(-6)}`;
      const cleanDigits = customerPhone.replace(/\D/g, '');
      const vaNumber = `8801${cleanDigits.slice(-8).padStart(8, '29634505')}12`;

      // Check if MIDTRANS_SERVER_KEY is set in environment
      const midtransServerKey = process.env.MIDTRANS_SERVER_KEY;
      let snapToken = null;
      let snapRedirectUrl = null;

      if (midtransServerKey) {
        try {
          const authString = Buffer.from(`${midtransServerKey}:`).toString('base64');
          const isProd = process.env.MIDTRANS_IS_PRODUCTION === 'true';
          const snapApiUrl = isProd
            ? 'https://app.midtrans.com/snap/v1/transactions'
            : 'https://app.sandbox.midtrans.com/snap/v1/transactions';

          const snapPayload = {
            transaction_details: {
              order_id: orderId,
              gross_amount: amount,
            },
            item_details: [
              {
                id: plan === 'yearly' ? 'sisauang_pro_yearly' : 'sisauang_pro_monthly',
                price: amount,
                quantity: 1,
                name: plan === 'yearly' ? 'SisaUang Pro Tahunan' : 'SisaUang Pro Bulanan',
                merchant_name: 'SisaUang Platform',
              },
            ],
            customer_details: {
              first_name: customerName,
              email: customerEmail,
              phone: customerPhone,
            },
          };

          const snapRes = await fetch(snapApiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
              Authorization: `Basic ${authString}`,
            },
            body: JSON.stringify(snapPayload),
          });

          if (snapRes.ok) {
            const snapData: any = await snapRes.json();
            snapToken = snapData.token;
            snapRedirectUrl = snapData.redirect_url;
          }
        } catch {
          // Fallback to in-site simulator if midtrans credentials not yet active
        }
      }

      appendLog(
        'checkout_guest',
        customerEmail,
        'checkout_order_created',
        `Pesanan ${plan === 'yearly' ? 'SisaUang Pro Tahunan (Rp 215.000)' : 'SisaUang Pro Bulanan (Rp 21.500)'} dibuat untuk ${customerName} (${customerEmail}). No Invoice: ${invoiceNumber}.`,
        'info'
      );

      res.json({
        success: true,
        orderId,
        invoiceNumber,
        plan,
        amount,
        customerName,
        customerEmail,
        customerPhone,
        paymentMethod,
        vaNumber,
        snapToken,
        snapRedirectUrl,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Gagal memproses inisialisasi pembayaran.' });
    }
  });

  // 2. Confirm in-site simulated payment (Strictly Super Admin only)
  app.post('/api/payment/confirm-mock-payment', requireAdminMiddleware, async (req: Request, res: Response) => {
    const orderId = String(req.body?.orderId || '');
    const invoiceNumber = String(req.body?.invoiceNumber || '');
    const customerEmail = String(req.body?.customerEmail || '').trim().toLowerCase();
    const plan: 'monthly' | 'yearly' = req.body?.plan === 'yearly' ? 'yearly' : 'monthly';
    const amount = Number(req.body?.amount || (plan === 'yearly' ? 215000 : 21500));

    const now = new Date();
    const expiresAt = new Date(now.getTime() + (plan === 'yearly' ? 365 : 30) * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    let matchedUser: ServerUserRecord | null = null;
    for (const u of usersStore.values()) {
      if (u.email.toLowerCase() === customerEmail) {
        matchedUser = u;
        break;
      }
    }

    if (matchedUser) {
      matchedUser.subscriptionStatus = 'pro';
      matchedUser.isPro = true;
      matchedUser.subscriptionPlan = plan;
      matchedUser.subscriptionExpiresAt = expiresAt;
      matchedUser.updatedAt = nowIso();
      savePersistedUsersCache();
    }

    appendLog(
      matchedUser?.uid || 'checkout_user',
      customerEmail,
      'payment_settled_midtrans',
      `Pembayaran ${plan === 'yearly' ? 'SisaUang Pro Tahunan' : 'SisaUang Pro Bulanan'} senilai Rp ${amount.toLocaleString('id-ID')} berhasil diverifikasi (${invoiceNumber}). Status: Lunas.`,
      'info'
    );

    res.json({
      success: true,
      status: 'PAID',
      invoiceNumber,
      orderId,
      expiresAt,
    });
  });

  // 3. Midtrans Webhook / HTTP Notification Handler
  app.post('/api/payment/webhook', async (req: Request, res: Response) => {
    try {
      const {
        order_id,
        status_code,
        gross_amount,
        signature_key,
        transaction_status,
        fraud_status,
      } = req.body || {};

      const serverKey = process.env.MIDTRANS_SERVER_KEY;
      if (serverKey && order_id && status_code && gross_amount && signature_key) {
        const expectedSignature = crypto
          .createHash('sha512')
          .update(`${order_id}${status_code}${gross_amount}${serverKey}`)
          .digest('hex');

        if (signature_key !== expectedSignature) {
          res.status(403).json({ error: 'Invalid Midtrans signature key.' });
          return;
        }
      }

      const isSuccess =
        transaction_status === 'capture'
          ? fraud_status === 'accept'
          : transaction_status === 'settlement';

      if (isSuccess) {
        appendLog(
          'midtrans_webhook',
          'webhook@midtrans.com',
          'midtrans_payment_settled',
          `Notifikasi pembayaran Midtrans diterima untuk Order ${order_id} (Rp ${gross_amount}). Status: SETTLEMENT.`,
          'info'
        );
      }

      res.status(200).json({ status: 'OK' });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Webhook processing failed.' });
    }
  });

  // =========================================================================
  // Duitku Payment Gateway (API V2) Integration
  // =========================================================================
  const DUITKU_MERCHANT_CODE = (process.env.DUITKU_MERCHANT_CODE || '').trim();
  const DUITKU_API_KEY = (process.env.DUITKU_API_KEY || '').trim();
  const DUITKU_ENV = (
    process.env.DUITKU_ENV || (DUITKU_MERCHANT_CODE.startsWith('DS') ? 'sandbox' : 'production')
  ).trim().toLowerCase();
  const DUITKU_BASE_URL =
    DUITKU_ENV === 'sandbox'
      ? 'https://sandbox.duitku.com/webapi/api/merchant'
      : 'https://passport.duitku.com/webapi/api/merchant';

  interface DuitkuOrderRecord {
    merchantOrderId: string;
    reference: string;
    paymentUrl: string;
    vaNumber?: string;
    qrString?: string;
    amount: number;
    plan: 'monthly' | 'yearly';
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    userUid?: string;
    paymentMethod: string;
    statusCode: string;
    statusMessage: string;
    status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'EXPIRED';
    paidAt?: string;
    createdAt: string;
    expiresAt: string;
  }

  const DUITKU_ORDERS_FILE = path.join(__dirname, '.sisa_uang_duitku_orders.json');
  const duitkuOrdersStore = new Map<string, DuitkuOrderRecord>();

  function loadPersistedDuitkuOrders() {
    try {
      if (fs.existsSync(DUITKU_ORDERS_FILE)) {
        const raw = fs.readFileSync(DUITKU_ORDERS_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          for (const o of parsed) {
            if (o && o.merchantOrderId) {
              duitkuOrdersStore.set(o.merchantOrderId, o);
            }
          }
        }
      }
    } catch (err) {
      console.error('Failed to load persisted Duitku orders cache:', err);
    }
  }

  function savePersistedDuitkuOrders() {
    try {
      const list = Array.from(duitkuOrdersStore.values());
      fs.writeFileSync(DUITKU_ORDERS_FILE, JSON.stringify(list, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save persisted Duitku orders cache:', err);
    }
  }

  loadPersistedDuitkuOrders();

  // 1. Duitku Gateway Configuration & Public Callback URL info
  app.get('/api/duitku/config', (req: Request, res: Response) => {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const baseUrl = `${protocol}://${host}`;
    res.json({
      merchantCode: DUITKU_MERCHANT_CODE,
      environment: DUITKU_ENV,
      callbackUrl: `${baseUrl}/api/duitku/callback`,
      returnUrl: `${baseUrl}/dashboard?payment=success`,
    });
  });

  // 2. Fetch Active Payment Methods from Duitku (or curated channels)
  app.get('/api/duitku/payment-methods', async (req: Request, res: Response) => {
    const amount = Number(req.query.amount) || 215000;
    const now = new Date();
    const datetime = now.toISOString().replace('T', ' ').slice(0, 19);

    const fallbackPaymentMethods = [
      // 10 Supported Active Virtual Accounts
      {
        paymentMethod: 'M2',
        paymentName: 'Mandiri Virtual Account',
        paymentImage: 'https://images.duitku.com/hotlink-ok/M2.PNG',
        totalFee: '0',
        category: 'va',
        status: 'active',
      },
      {
        paymentMethod: 'BT',
        paymentName: 'Permata Bank Virtual Account',
        paymentImage: 'https://images.duitku.com/hotlink-ok/BT.PNG',
        totalFee: '0',
        category: 'va',
        status: 'active',
      },
      {
        paymentMethod: 'BR',
        paymentName: 'BRI Virtual Account (BRIVA)',
        paymentImage: 'https://images.duitku.com/hotlink-ok/BR.PNG',
        totalFee: '0',
        category: 'va',
        status: 'active',
      },
      {
        paymentMethod: 'I1',
        paymentName: 'BNI Virtual Account',
        paymentImage: 'https://images.duitku.com/hotlink-ok/I1.PNG',
        totalFee: '0',
        category: 'va',
        status: 'active',
      },
      {
        paymentMethod: 'BV',
        paymentName: 'BSI Virtual Account',
        paymentImage: 'https://images.duitku.com/hotlink-ok/BV.PNG',
        totalFee: '0',
        category: 'va',
        status: 'active',
      },
      {
        paymentMethod: 'NC',
        paymentName: 'BNC (Bank Neo Commerce) Virtual Account',
        paymentImage: 'https://images.duitku.com/hotlink-ok/NC.PNG',
        totalFee: '0',
        category: 'va',
        status: 'active',
      },
      {
        paymentMethod: 'B1',
        paymentName: 'CIMB Niaga Virtual Account',
        paymentImage: 'https://images.duitku.com/hotlink-ok/B1.PNG',
        totalFee: '0',
        category: 'va',
        status: 'active',
      },
      {
        paymentMethod: 'DM',
        paymentName: 'Danamon Virtual Account',
        paymentImage: 'https://images.duitku.com/hotlink-ok/DM.PNG',
        totalFee: '0',
        category: 'va',
        status: 'active',
      },
      {
        paymentMethod: 'VA',
        paymentName: 'Maybank Virtual Account',
        paymentImage: 'https://images.duitku.com/hotlink-ok/VA.PNG',
        totalFee: '0',
        category: 'va',
        status: 'active',
      },
      {
        paymentMethod: 'S1',
        paymentName: 'Sampoerna Virtual Account',
        paymentImage: 'https://images.duitku.com/hotlink-ok/S1.PNG',
        totalFee: '0',
        category: 'va',
        status: 'active',
      },
      // Active QRIS via Nusapay (Resmi diaktifkan Duitku)
      {
        paymentMethod: 'SQ',
        paymentName: 'QRIS Instan (Nusapay)',
        paymentImage: 'https://images.duitku.com/hotlink-ok/SQ.PNG',
        totalFee: '0',
        category: 'qris',
        status: 'active',
      },
      // Disabled Direct E-Wallet Channels (Sementara belum aktif langsung, gunakan QRIS)
      {
        paymentMethod: 'OV',
        paymentName: 'OVO Direct (Gunakan QRIS)',
        paymentImage: 'https://images.duitku.com/hotlink-ok/OV.PNG',
        totalFee: '0',
        category: 'ewallet',
        status: 'inactive',
        disabled: true,
        disabledReason: 'Sementara belum aktif (Gunakan QRIS)',
      },
      {
        paymentMethod: 'DA',
        paymentName: 'DANA Direct (Gunakan QRIS)',
        paymentImage: 'https://images.duitku.com/hotlink-ok/DA.PNG',
        totalFee: '0',
        category: 'ewallet',
        status: 'inactive',
        disabled: true,
        disabledReason: 'Sementara belum aktif (Gunakan QRIS)',
      },
    ];

    try {
      const stringToSign = `${DUITKU_MERCHANT_CODE}${amount}${datetime}`;
      const signature = crypto.createHmac('sha256', DUITKU_API_KEY).update(stringToSign).digest('hex');

      const response = await fetch(`${DUITKU_BASE_URL}/paymentmethod/getpaymentmethod`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          merchantcode: DUITKU_MERCHANT_CODE,
          amount,
          datetime,
          signature,
        }),
      });

      if (response.ok) {
        const data: any = await response.json();
        if (Array.isArray(data?.paymentFee) && data.paymentFee.length > 0) {
          // Filter out BCA VA (BC) completely and keep QRIS ('SQ', 'SP', 'NQ') active
          const sanitizedMethods = data.paymentFee
            .filter((p: any) => p && p.paymentMethod !== 'BC')
            .map((p: any) => {
              // Only direct e-wallets remain temporarily disabled
              if (['OV', 'DA', 'SL', 'LA', 'SA', 'OL'].includes(p.paymentMethod)) {
                return {
                  ...p,
                  disabled: true,
                  status: 'inactive',
                  disabledReason: 'Sementara belum aktif (Gunakan QRIS)',
                };
              }
              return {
                ...p,
                disabled: false,
                status: 'active',
              };
            });

          res.json({
            success: true,
            paymentMethods: sanitizedMethods,
            source: 'duitku_live',
          });
          return;
        }
      }
    } catch {
      // Ignore live call failure and fallback
    }

    res.json({
      success: true,
      paymentMethods: fallbackPaymentMethods,
      source: 'duitku_standard',
    });
  });

  // 3. Request Transaction via Duitku V2 Inquiry API
  app.post('/api/duitku/create-transaction', async (req: Request, res: Response) => {
    try {
      const plan: 'monthly' | 'yearly' = req.body?.plan === 'yearly' ? 'yearly' : 'monthly';
      const amount = Number(req.body?.amount) || (plan === 'yearly' ? 215000 : 21500);
      const customerName = String(req.body?.customerName || 'Pelanggan SisaUang').trim().slice(0, 80);
      const customerEmail = String(req.body?.customerEmail || 'vuedevo@gmail.com').trim().toLowerCase().slice(0, 100);
      const customerPhone = String(req.body?.customerPhone || '085129634505').trim().slice(0, 30);
      const paymentMethod = String(req.body?.paymentMethod || 'M2').trim();
      const userUid = req.body?.userUid ? String(req.body.userUid).trim() : undefined;

      if (!userUid && !customerEmail) {
        res.status(401).json({ error: 'Pengguna wajib login terlebih dahulu sebelum melakukan checkout pembayaran.' });
        return;
      }

      // Enforce supported 10 Virtual Accounts and QRIS methods
      const SUPPORTED_VA_CODES = ['M2', 'BT', 'BR', 'I1', 'BV', 'NC', 'B1', 'DM', 'VA', 'S1'];
      const SUPPORTED_QRIS_CODES = ['SQ', 'SP', 'NQ'];

      if (paymentMethod === 'BC') {
        res.status(400).json({ error: 'Metode pembayaran BCA Virtual Account tidak didukung.' });
        return;
      }

      // Reject only disabled direct e-wallets
      if (['OV', 'DA', 'SL', 'LA', 'SA', 'OL'].includes(paymentMethod)) {
        res.status(400).json({
          error: 'Metode pembayaran direct e-wallet belum aktif secara langsung. Silakan gunakan QRIS Instan (dapat di-scan via OVO, DANA, GoPay, ShopeePay) atau salah satu dari 10 Virtual Account.',
        });
        return;
      }

      if (!SUPPORTED_VA_CODES.includes(paymentMethod) && !SUPPORTED_QRIS_CODES.includes(paymentMethod)) {
        res.status(400).json({
          error: `Metode pembayaran ${paymentMethod} tidak didukung. Pilihan yang tersedia: QRIS Instan atau Virtual Account (Mandiri, Permata, BRI, BNI, BSI, BNC, CIMB Niaga, Danamon, Maybank, Sampoerna).`,
        });
        return;
      }

      const timestamp = Date.now();
      const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
      const merchantOrderId = `SU-${timestamp}-${randomSuffix}`;
      const invoiceNumber = `INV-DUITKU-${timestamp.toString().slice(-6)}`;

      // Duitku v2 inquiry signature: md5(merchantCode + merchantOrderId + paymentAmount + apiKey)
      const signatureString = `${DUITKU_MERCHANT_CODE}${merchantOrderId}${amount}${DUITKU_API_KEY}`;
      const signature = crypto.createHash('md5').update(signatureString).digest('hex');

      const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      const baseUrl = `${protocol}://${host}`;
      const callbackUrl = `${baseUrl}/api/duitku/callback`;
      const returnUrl = `${baseUrl}/dashboard?payment=success&orderId=${merchantOrderId}`;

      const inquiryPayload = {
        merchantCode: DUITKU_MERCHANT_CODE,
        paymentAmount: amount,
        paymentMethod,
        merchantOrderId,
        productDetails: plan === 'yearly' ? 'Langganan SisaUang Pro Tahunan' : 'Langganan SisaUang Pro Bulanan',
        email: customerEmail,
        phoneNumber: customerPhone,
        customerVaName: customerName,
        signature,
        expiryPeriod: 1440, // 24 jam
        itemDetails: [
          {
            name: plan === 'yearly' ? 'SisaUang Pro Tahunan' : 'SisaUang Pro Bulanan',
            price: amount,
            quantity: 1,
          },
        ],
        customerDetail: {
          firstName: customerName,
          email: customerEmail,
          phoneNumber: customerPhone,
        },
        callbackUrl,
        returnUrl,
      };

      let effectivePaymentMethod = paymentMethod;

      let duitkuRes = await fetch(`${DUITKU_BASE_URL}/v2/inquiry`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(inquiryPayload),
      });

      let duitkuData: any = await duitkuRes.json();

      // If QRIS was requested and the requested channel (e.g. SQ in Sandbox or SP in Production) is not active, try fallback QRIS channel
      if ((paymentMethod === 'SQ' || paymentMethod === 'SP') && (!duitkuRes.ok || duitkuData.statusCode !== '00')) {
        const fallbackMethod = paymentMethod === 'SQ' ? 'SP' : 'SQ';
        try {
          const retryRes = await fetch(`${DUITKU_BASE_URL}/v2/inquiry`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify({
              ...inquiryPayload,
              paymentMethod: fallbackMethod,
            }),
          });
          const retryData: any = await retryRes.json();
          if (retryRes.ok && retryData.statusCode === '00') {
            duitkuRes = retryRes;
            duitkuData = retryData;
            effectivePaymentMethod = fallbackMethod;
          }
        } catch {
          // ignore fallback error and keep initial result
        }
      }

      if (!duitkuRes.ok || duitkuData.statusCode !== '00') {
        const errorMsg = duitkuData.statusMessage || duitkuData.Message || 'Gagal membuat transaksi di Duitku.';
        appendLog(
          userUid || 'duitku_checkout',
          customerEmail,
          'duitku_inquiry_failed',
          `Inisialisasi transaksi Duitku gagal: ${errorMsg} (Status Code: ${duitkuData.statusCode || duitkuRes.status}).`,
          'warning'
        );
        res.status(400).json({
          error: errorMsg,
          statusCode: duitkuData.statusCode,
          details: duitkuData,
        });
        return;
      }

      const orderRecord: DuitkuOrderRecord = {
        merchantOrderId,
        reference: String(duitkuData.reference || ''),
        paymentUrl: String(duitkuData.paymentUrl || ''),
        vaNumber: duitkuData.vaNumber ? String(duitkuData.vaNumber) : undefined,
        qrString: duitkuData.qrString ? String(duitkuData.qrString) : undefined,
        amount,
        plan,
        customerName,
        customerEmail,
        customerPhone,
        userUid,
        paymentMethod: effectivePaymentMethod,
        statusCode: duitkuData.statusCode,
        statusMessage: duitkuData.statusMessage,
        status: 'PENDING',
        createdAt: nowIso(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };

      duitkuOrdersStore.set(merchantOrderId, orderRecord);
      savePersistedDuitkuOrders();

      appendLog(
        userUid || 'duitku_checkout',
        customerEmail,
        'duitku_order_created',
        `Transaksi Duitku V2 dibuat: Order ${merchantOrderId} (Ref: ${orderRecord.reference}) senilai Rp ${amount.toLocaleString('id-ID')}. Metode: ${paymentMethod}.`,
        'info'
      );

      res.json({
        success: true,
        orderId: merchantOrderId,
        invoiceNumber,
        reference: orderRecord.reference,
        paymentUrl: orderRecord.paymentUrl,
        vaNumber: orderRecord.vaNumber,
        qrString: orderRecord.qrString,
        amount,
        plan,
        customerName,
        customerEmail,
        customerPhone,
        paymentMethod,
        callbackUrl,
        statusCode: orderRecord.statusCode,
        statusMessage: orderRecord.statusMessage,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Gagal memproses inisialisasi pembayaran Duitku.' });
    }
  });

  // 4. Duitku Webhook / HTTP Callback Handler
  // Explicitly reject direct browser visits (GET) to prevent misleading hits
  app.get('/api/duitku/callback', (_req: Request, res: Response) => {
    res.status(405).json({
      error: 'Method Not Allowed',
      message: 'Endpoint callback Duitku hanya menerima permintaan HTTP POST resmi dari server Duitku.',
    });
  });

  app.post('/api/duitku/callback', async (req: Request, res: Response) => {
    try {
      const merchantCode = String(req.body?.merchantCode || '');
      const amount = String(req.body?.amount || '');
      const merchantOrderId = String(req.body?.merchantOrderId || '');
      const resultCode = String(req.body?.resultCode || '');
      const reference = String(req.body?.reference || '');
      const incomingSignature = String(req.body?.signature || '');

      // Verify signature (handling both parameter ordering standards in Duitku documentation)
      const sig1 = crypto
        .createHash('md5')
        .update(`${merchantCode}${amount}${merchantOrderId}${DUITKU_API_KEY}`)
        .digest('hex');
      const sig2 = crypto
        .createHash('md5')
        .update(`${merchantCode}${merchantOrderId}${amount}${DUITKU_API_KEY}`)
        .digest('hex');

      if (incomingSignature !== sig1 && incomingSignature !== sig2) {
        console.warn(
          `[Duitku Callback] Invalid signature received for order ${merchantOrderId}: ${incomingSignature}`
        );
        res.status(400).send('Bad Signature');
        return;
      }

      const order = duitkuOrdersStore.get(merchantOrderId);
      if (order) {
        order.reference = reference || order.reference;
      }

      if (resultCode === '00') {
        // Query Duitku transactionStatus directly to prevent false activations from test simulators or unverified hits
        let isConfirmedSettled = false;
        try {
          const verifySig = crypto
            .createHash('md5')
            .update(`${DUITKU_MERCHANT_CODE}${merchantOrderId}${DUITKU_API_KEY}`)
            .digest('hex');

          const verifyRes = await fetch(`${DUITKU_BASE_URL}/transactionStatus`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify({
              merchantCode: DUITKU_MERCHANT_CODE,
              merchantOrderId,
              signature: verifySig,
            }),
          });

          const verifyData: any = await verifyRes.json();
          if (verifyData?.statusCode === '00') {
            isConfirmedSettled = true;
          } else {
            console.warn(
              `[Duitku Callback] Order ${merchantOrderId} status check is not settled: ${verifyData?.statusCode} - ${verifyData?.statusMessage}`
            );
          }
        } catch (verifyErr) {
          console.error(`[Duitku Callback] Error verifying order ${merchantOrderId} with Duitku:`, verifyErr);
        }

        if (!isConfirmedSettled) {
          appendLog(
            order?.userUid || 'duitku_system',
            order?.customerEmail || 'billing@duitku.com',
            'duitku_payment_unverified',
            `Callback Duitku: Order ${merchantOrderId} belum terkonfirmasi lunas pada server Duitku (ResultCode: ${resultCode}). Status Pro tidak diaktifkan.`,
            'warning'
          );
          res.status(200).send('SUCCESS');
          return;
        }

        if (order) {
          order.status = 'SUCCESS';
          order.paidAt = nowIso();
          savePersistedDuitkuOrders();
        }

        let matchedUser: ServerUserRecord | null = null;
        if (order?.userUid) {
          matchedUser = usersStore.get(order.userUid) || null;
        }
        if (!matchedUser && order?.customerEmail) {
          for (const u of usersStore.values()) {
            if (u.email.toLowerCase() === order.customerEmail.toLowerCase()) {
              matchedUser = u;
              break;
            }
          }
        }

        const plan = order ? order.plan : 'yearly';
        const now = new Date();
        const expiresAt = new Date(
          now.getTime() + (plan === 'yearly' ? 365 : 30) * 24 * 60 * 60 * 1000
        )
          .toISOString()
          .slice(0, 10);

        if (matchedUser) {
          matchedUser.subscriptionStatus = 'pro';
          matchedUser.isPro = true;
          matchedUser.subscriptionPlan = plan;
          matchedUser.subscriptionExpiresAt = expiresAt;
          matchedUser.updatedAt = nowIso();
          savePersistedUsersCache();
          await activateProUserInFirestore(matchedUser.uid, plan, expiresAt);
        }

        appendLog(
          matchedUser?.uid || order?.userUid || 'duitku_system',
          matchedUser?.email || order?.customerEmail || 'billing@duitku.com',
          'duitku_payment_settled',
          `Callback Duitku: Pembayaran Order ${merchantOrderId} (Ref: ${reference}) senilai Rp ${Number(amount).toLocaleString('id-ID')} BERHASIL. Akun ${matchedUser ? matchedUser.email : order?.customerEmail} otomatis ditingkatkan ke SisaUang Pro (${plan === 'yearly' ? 'Tahunan' : 'Bulanan'}).`,
          'info'
        );

        res.status(200).send('SUCCESS');
        return;
      } else {
        if (order) {
          order.status = 'FAILED';
          savePersistedDuitkuOrders();
        }

        appendLog(
          order?.userUid || 'duitku_system',
          order?.customerEmail || 'billing@duitku.com',
          'duitku_payment_failed',
          `Callback Duitku: Pembayaran Order ${merchantOrderId} gagal atau dibatalkan (ResultCode: ${resultCode}).`,
          'warning'
        );

        res.status(200).send('SUCCESS');
        return;
      }
    } catch (err: any) {
      console.error('[Duitku Callback Error]', err);
      res.status(500).send('Callback Error: ' + err.message);
    }
  });

  // 5. Check Duitku Transaction Status & Instant Pro Auto-Activation
  app.get('/api/duitku/check-status/:orderId', async (req: Request, res: Response) => {
    try {
      const orderId = String(req.params.orderId || '').trim();
      if (!orderId) {
        res.status(400).json({ error: 'Order ID wajib disertakan.' });
        return;
      }

      const order = duitkuOrdersStore.get(orderId);

      // Signature: md5(merchantCode + merchantOrderId + apiKey)
      const sigString = `${DUITKU_MERCHANT_CODE}${orderId}${DUITKU_API_KEY}`;
      const signature = crypto.createHash('md5').update(sigString).digest('hex');

      const checkRes = await fetch(`${DUITKU_BASE_URL}/transactionStatus`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          merchantCode: DUITKU_MERCHANT_CODE,
          merchantOrderId: orderId,
          signature,
        }),
      });

      const checkData: any = await checkRes.json();
      const isPaid = checkData?.statusCode === '00';

      if (isPaid) {
        if (order) {
          order.status = 'SUCCESS';
          order.paidAt = order.paidAt || nowIso();
          savePersistedDuitkuOrders();
        }

        let matchedUser: ServerUserRecord | null = null;
        if (order?.userUid) {
          matchedUser = usersStore.get(order.userUid) || null;
        }
        if (!matchedUser && order?.customerEmail) {
          for (const u of usersStore.values()) {
            if (u.email.toLowerCase() === order.customerEmail.toLowerCase()) {
              matchedUser = u;
              break;
            }
          }
        }

        const plan = order ? order.plan : 'yearly';
        const now = new Date();
        const expiresAt = new Date(
          now.getTime() + (plan === 'yearly' ? 365 : 30) * 24 * 60 * 60 * 1000
        )
          .toISOString()
          .slice(0, 10);

        if (matchedUser && matchedUser.subscriptionStatus !== 'pro') {
          matchedUser.subscriptionStatus = 'pro';
          matchedUser.isPro = true;
          matchedUser.subscriptionPlan = plan;
          matchedUser.subscriptionExpiresAt = expiresAt;
          matchedUser.updatedAt = nowIso();
          savePersistedUsersCache();
          await activateProUserInFirestore(matchedUser.uid, plan, expiresAt);

          appendLog(
            matchedUser.uid,
            matchedUser.email,
            'duitku_payment_settled_status_check',
            `Verifikasi status Duitku: Pembayaran Order ${orderId} terkonfirmasi Lunas. Status akun aktif sebagai SisaUang Pro (${plan === 'yearly' ? 'Tahunan' : 'Bulanan'}).`,
            'info'
          );
        }
      }

      res.json({
        success: true,
        orderId,
        isPaid,
        order: order || null,
        duitkuStatus: checkData,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Gagal memeriksa status pembayaran Duitku.' });
    }
  });

  // 4. Contact Message API
  app.post('/api/contact', async (req: Request, res: Response) => {
    try {
      const name = String(req.body?.name || '').trim().slice(0, 80);
      const email = String(req.body?.email || '').trim().slice(0, 100);
      const subject = String(req.body?.subject || 'Pertanyaan Layanan SisaUang').trim().slice(0, 120);
      const message = String(req.body?.message || '').trim().slice(0, 1000);

      appendLog(
        'contact_form',
        email || 'guest@sisa-uang.id',
        'contact_message_received',
        `Pesan kontak baru dari ${name} (${email}): "${subject}".`,
        'info'
      );

      res.json({ success: true, message: 'Pesan berhasil diterima.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Gagal mengirim pesan.' });
    }
  });

  // Record user/system activity & evaluate suspicious behavior rules
  app.post('/api/activity', (req: Request, res: Response) => {
    const actorUid = String(req.body?.actorUid || 'guest').slice(0, 128);
    const actorEmail = String(req.body?.actorEmail || 'unknown@sisa-uang.id').slice(0, 120);
    const action = String(req.body?.action || 'user_action').slice(0, 60);
    const detail = String(req.body?.detail || '').slice(0, 250);
    const severity: 'info' | 'warning' | 'critical' =
      req.body?.severity === 'critical'
        ? 'critical'
        : req.body?.severity === 'warning'
        ? 'warning'
        : 'info';
    const amount = Number(req.body?.amount || 0);

    const logEntry = appendLog(actorUid, actorEmail, action, detail, severity);
    let triggeredAlert: ServerSecurityAlert | null = null;

    // Automatic suspicious activity detection for unusually high transaction or critical action
    if (amount >= 50000000) {
      triggeredAlert = createSecurityAlert(
        actorUid,
        actorEmail,
        'Transaksi Bernilai Tinggi Mencurigakan',
        `Pengguna ${actorEmail} mencatat transaksi tunggal sebesar Rp ${amount.toLocaleString('id-ID')} yang melampaui ambang batas pengawasan otomatis.`,
        'warning'
      );
    } else if (severity === 'critical' || action.includes('unauthorized') || action.includes('suspicious')) {
      triggeredAlert = createSecurityAlert(
        actorUid,
        actorEmail,
        'Deteksi Aktivitas Mencurigakan Sistem',
        detail || `Terdeteksi aksi berisiko tinggi (${action}) oleh ${actorEmail}.`,
        'critical'
      );
    }

    res.json({ log: logEntry, alert: triggeredAlert });
  });

  // =========================================================================
  // Protected Super Admin Endpoints (/api/admin/*)
  // =========================================================================

  // Verify Super Admin active session token validity
  app.get('/api/admin/verify-session', requireAdminMiddleware, (_req: Request, res: Response) => {
    res.json({
      valid: true,
      timestamp: nowIso(),
    });
  });

  // Immediate Killswitch: Revoke All Super Admin Active Sessions & Invalidate Tokens
  app.post('/api/admin/revoke-all-sessions', requireAdminMiddleware, (_req: Request, res: Response) => {
    const revokedCount = verifiedAdminTokens.size;
    verifiedAdminTokens.clear();
    savePersistedAdminTokens();
    otpChallenges.clear();
    appendLog(
      'admin_vuedevo_01',
      SUPER_ADMIN_EMAIL,
      'super_admin_sessions_revoked',
      `Seluruh sesi Super Admin (${revokedCount} token) telah dicabut secara massal.`,
      'critical'
    );
    res.json({
      success: true,
      revokedCount,
      message: 'Seluruh sesi dan token akses Super Admin telah berhasil dicabut.',
    });
  });

  // Explicit Endpoint to Force-Sync All Firestore Users & Pro Subscriptions to Server Registry
  app.post('/api/admin/sync-firestore', requireAdminMiddleware, async (_req: Request, res: Response) => {
    const total = await syncUsersFromFirestore(true);
    res.json({
      success: true,
      totalUsers: total,
      syncToken: usersRegistrySyncToken,
      message: `Berhasil mensinkronkan ${total} akun pengguna dari Cloud Firestore ke registry super admin.`,
    });
  });

  app.get('/api/admin/overview', requireAdminMiddleware, async (req: Request, res: Response) => {
    if ((!hasInitialUsersSyncCompleted && usersStore.size <= 2) || req.query.sync === 'true' || req.query.force === 'true') {
      await syncUsersFromFirestore(req.query.force === 'true' || req.query.sync === 'true');
    }
    const allUsers = Array.from(usersStore.values()).map(sanitizeUser);
    const totalUsers = allUsers.length;
    const activeUsersCount = allUsers.filter((u) => u.status === 'active').length;
    const blockedUsersCount = allUsers.filter((u) => u.status === 'blocked').length;
    const proUsersCount = allUsers.filter((u) => u.isPro === true).length;
    const pendingProUsersCount = allUsers.filter((u) => !u.isPro && u.subscriptionStatus === 'pending').length;

    res.json({
      users: allUsers.slice(0, 25),
      syncToken: usersRegistrySyncToken,
      logsSyncToken: logsRegistrySyncToken,
      totalLogsCount: activityLogs.length,
      summary: {
        totalUsers,
        activeUsersCount,
        blockedUsersCount,
        proUsersCount,
        pendingProUsersCount,
      },
      logs: activityLogs.slice(0, 25),
      alerts: securityAlerts,
      serverTime: nowIso(),
    });
  });

  // Lightweight 1-Sync Read Token Endpoint for Super Admin Activity Logs Pagination Cache
  app.get('/api/admin/logs/sync-token', requireAdminMiddleware, (_req: Request, res: Response) => {
    res.json({
      syncToken: logsRegistrySyncToken,
      totalLogs: activityLogs.length,
    });
  });

  // Server-side Paginated Activity Logs Endpoint (/api/admin/logs?page=1&limit=25&severity=all&search=...)
  app.get('/api/admin/logs', requireAdminMiddleware, (req: Request, res: Response) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const severityFilter = String(req.query.severity || 'all').trim().toLowerCase();
    const search = String(req.query.search || '').trim().toLowerCase();

    const sortedLogs = [...activityLogs].sort((a, b) =>
      String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
    );

    const totalLogs = sortedLogs.length;
    const filtered = sortedLogs.filter((l) => {
      if (severityFilter !== 'all' && l.severity !== severityFilter) {
        return false;
      }
      if (search) {
        const matchEmail = String(l.actorEmail || '').toLowerCase().includes(search);
        const matchAction = String(l.action || '').toLowerCase().includes(search);
        const matchDetail = String(l.detail || '').toLowerCase().includes(search);
        if (!matchEmail && !matchAction && !matchDetail) {
          return false;
        }
      }
      return true;
    });

    const totalFiltered = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalFiltered / limit));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * limit;
    const pageItems = filtered.slice(start, start + limit);

    res.json({
      items: pageItems,
      page: safePage,
      limit,
      totalItems: totalFiltered,
      totalPages,
      totalLogs,
      syncToken: logsRegistrySyncToken,
    });
  });

  // Lightweight 1-Sync Read Token Endpoint for Super Admin User Pagination Cache
  app.get('/api/admin/users/sync-token', requireAdminMiddleware, (_req: Request, res: Response) => {
    res.json({
      syncToken: usersRegistrySyncToken,
      totalUsers: usersStore.size,
    });
  });

  // Server-side Paginated Users Endpoint (/api/admin/users?page=1&limit=25&status=all&plan=all&search=...)
  app.get('/api/admin/users', requireAdminMiddleware, async (req: Request, res: Response) => {
    if ((!hasInitialUsersSyncCompleted && usersStore.size <= 2) || req.query.sync === 'true' || req.query.force === 'true') {
      await syncUsersFromFirestore(req.query.force === 'true' || req.query.sync === 'true');
    }
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const statusFilter = String(req.query.status || 'all').trim().toLowerCase();
    const planFilter = String(req.query.plan || 'all').trim().toLowerCase();
    const search = String(req.query.search || '').trim().toLowerCase();

    const allUsers = Array.from(usersStore.values()).map(sanitizeUser);
    allUsers.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));

    const totalUsers = allUsers.length;
    const activeUsersCount = allUsers.filter((u) => u.status === 'active').length;
    const blockedUsersCount = allUsers.filter((u) => u.status === 'blocked').length;
    const proUsersCount = allUsers.filter((u) => u.isPro === true).length;
    const pendingProUsersCount = allUsers.filter(
      (u) => !u.isPro && u.subscriptionStatus === 'pending'
    ).length;

    const filtered = allUsers.filter((u) => {
      if (statusFilter !== 'all' && u.status !== statusFilter) {
        return false;
      }
      if (planFilter === 'pro' && !u.isPro) {
        return false;
      }
      if (planFilter === 'pending' && (u.isPro || u.subscriptionStatus !== 'pending')) {
        return false;
      }
      if (planFilter === 'free' && (u.isPro || u.subscriptionStatus === 'pending')) {
        return false;
      }
      if (search) {
        const matchName = String(u.displayName || '').toLowerCase().includes(search);
        const matchUser = String(u.username || '').toLowerCase().includes(search);
        const matchEmail = String(u.email || '').toLowerCase().includes(search);
        const matchRole = String(u.role || '').toLowerCase().includes(search);
        if (!matchName && !matchUser && !matchEmail && !matchRole) {
          return false;
        }
      }
      return true;
    });

    const totalFiltered = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalFiltered / limit));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * limit;
    const pageItems = filtered.slice(start, start + limit);

    res.json({
      items: pageItems,
      page: safePage,
      limit,
      totalItems: totalFiltered,
      totalPages,
      syncToken: usersRegistrySyncToken,
      summary: {
        totalUsers,
        activeUsersCount,
        blockedUsersCount,
        proUsersCount,
        pendingProUsersCount,
      },
    });
  });

  // Block or Unblock a user in real-time
  app.patch('/api/admin/users/:uid/status', requireAdminMiddleware, (req: Request, res: Response) => {
    const targetUid = String(req.params.uid || '');
    const newStatus = req.body?.status === 'blocked' ? 'blocked' : 'active';

    const targetUser = usersStore.get(targetUid);
    if (!targetUser) {
      res.status(404).json({ error: 'Pengguna tidak ditemukan.' });
      return;
    }

    if (targetUser.email.toLowerCase() === SUPER_ADMIN_EMAIL) {
      res.status(400).json({ error: 'Akun Super Admin utama tidak dapat diblokir.' });
      return;
    }

    targetUser.status = newStatus;
    targetUser.updatedAt = nowIso();
    savePersistedUsersCache();

    const log = appendLog(
      'admin_vuedevo_01',
      SUPER_ADMIN_EMAIL,
      newStatus === 'blocked' ? 'user_blocked' : 'user_unblocked',
      `Super Admin mengubah status akses ${targetUser.email} menjadi ${newStatus.toUpperCase()}.`,
      newStatus === 'blocked' ? 'warning' : 'info'
    );

    res.json({
      user: sanitizeUser(targetUser),
      log,
    });
  });

  // Activate, Approve Pending, or Deactivate SisaUang Pro subscription manually by Super Admin with Billing Plan & Active Period
  app.patch('/api/admin/users/:uid/subscription', requireAdminMiddleware, (req: Request, res: Response) => {
    const targetUid = String(req.params.uid || '');
    const requestedStatus = req.body?.subscriptionStatus;
    const isPending = requestedStatus === 'pending';
    const isPro =
      !isPending && (requestedStatus === 'pro' || req.body?.isPro === true);
    const newSubStatus: 'free' | 'pending' | 'pro' = isPro
      ? 'pro'
      : isPending
        ? 'pending'
        : 'free';
    const plan: 'monthly' | 'yearly' | null =
      isPro || isPending
        ? req.body?.subscriptionPlan === 'yearly'
          ? 'yearly'
          : 'monthly'
        : null;
    const rawExpires = req.body?.subscriptionExpiresAt
      ? String(req.body.subscriptionExpiresAt).slice(0, 10)
      : '';
    const expiresAt: string | null =
      isPro && /^\d{4}-\d{2}-\d{2}$/.test(rawExpires) ? rawExpires : null;

    const targetUser = usersStore.get(targetUid);
    if (!targetUser) {
      res.status(404).json({ error: 'Pengguna tidak ditemukan.' });
      return;
    }

    const wasPending = targetUser.subscriptionStatus === 'pending';
    const targetEmailLower = targetUser.email.toLowerCase();

    // Update target user record
    targetUser.subscriptionStatus = newSubStatus;
    targetUser.isPro = isPro;
    targetUser.subscriptionPlan = plan;
    targetUser.subscriptionExpiresAt = expiresAt;
    if (newSubStatus === 'free') {
      targetUser.isExplicitlyDeactivated = true;
      targetUser.subscriptionPaymentMethod = null;
      targetUser.subscriptionProofDataUrl = null;
      targetUser.subscriptionProofFileName = null;
      targetUser.subscriptionRequestedAt = null;
      targetUser.subscriptionSenderName = null;
      targetUser.subscriptionTransferNote = null;
    } else {
      targetUser.isExplicitlyDeactivated = false;
    }
    targetUser.updatedAt = nowIso();

    // If deactivating, also ensure any other user record with the exact same email is set to free
    if (newSubStatus === 'free' && targetEmailLower) {
      for (const [uid, u] of usersStore.entries()) {
        if (uid !== targetUid && u.email.toLowerCase() === targetEmailLower) {
          u.subscriptionStatus = 'free';
          u.isPro = false;
          u.isExplicitlyDeactivated = true;
          u.subscriptionPlan = null;
          u.subscriptionExpiresAt = null;
          u.subscriptionPaymentMethod = null;
          u.subscriptionProofDataUrl = null;
          u.subscriptionProofFileName = null;
          u.subscriptionRequestedAt = null;
          u.subscriptionSenderName = null;
          u.subscriptionTransferNote = null;
          u.updatedAt = nowIso();
        }
      }
    }

    usersRegistrySyncToken = Date.now();
    savePersistedUsersCache();

    const planLabel = plan === 'yearly' ? 'Tahunan' : 'Bulanan';
    const log = appendLog(
      'admin_vuedevo_01',
      SUPER_ADMIN_EMAIL,
      isPro
        ? wasPending
          ? 'user_pro_approved'
          : 'user_pro_activated'
        : 'user_pro_deactivated',
      isPro
        ? `Super Admin ${wasPending ? 'menyetujui pembayaran & ' : ''}mengaktifkan langganan SisaUang Pro (${planLabel}, aktif s/d ${expiresAt || '-'}) untuk ${targetUser.displayName} (${targetUser.email}).`
        : `Super Admin menonaktifkan/menolak langganan SisaUang Pro untuk pengguna ${targetUser.displayName} (${targetUser.email}).`,
      'info'
    );

    res.json({
      user: sanitizeUser(targetUser),
      log,
    });
  });

  // Delete user from registry in real-time
  app.delete('/api/admin/users/:uid', requireAdminMiddleware, (req: Request, res: Response) => {
    const targetUid = String(req.params.uid || '');
    const targetUser = usersStore.get(targetUid);

    if (!targetUser) {
      res.status(404).json({ error: 'Pengguna tidak ditemukan.' });
      return;
    }

    if (targetUser.email.toLowerCase() === SUPER_ADMIN_EMAIL) {
      res.status(400).json({ error: 'Akun Super Admin utama tidak dapat dihapus.' });
      return;
    }

    usersStore.delete(targetUid);
    savePersistedUsersCache();

    const log = appendLog(
      'admin_vuedevo_01',
      SUPER_ADMIN_EMAIL,
      'user_deleted',
      `Super Admin menghapus akun pengguna ${targetUser.displayName} (${targetUser.email}) secara permanen.`,
      'warning'
    );

    res.json({
      deletedUid: targetUid,
      log,
    });
  });

  // Simulate suspicious system activity to test instant notifications in /control-panel
  app.post('/api/admin/alerts/simulate', requireAdminMiddleware, (req: Request, res: Response) => {
    const scenario = String(req.body?.scenario || 'brute_force');

    let title = 'Deteksi Anomali Akses Sistem';
    let description = 'Terdeteksi pola permintaan API berfrekuensi tinggi yang mencurigakan dari alamat IP tidak dikenal.';
    let actorEmail = 'unknown.actor@proxy-node.net';
    let severity: 'warning' | 'critical' = 'critical';

    if (scenario === 'impossible_travel') {
      title = 'Login Lokasi Ganda Mencurigakan (Impossible Travel)';
      description = 'Sesi autentikasi terdeteksi dari dua lokasi geografis berbeda dalam rentang waktu 3 menit.';
      actorEmail = 'reza.mahendra@gmail.com';
      severity = 'warning';
    } else if (scenario === 'privilege_escalation') {
      title = 'Percobaan Injeksi Role Administrator';
      description = 'Sistem keamanan menolak modifikasi payload pada field role menuju "admin" dari klien tidak terotorisasi.';
      actorEmail = 'bima.santoso@yahoo.com';
      severity = 'critical';
    }

    const alert = createSecurityAlert('suspicious_actor_99', actorEmail, title, description, severity);
    const log = appendLog('suspicious_actor_99', actorEmail, 'suspicious_activity_detected', `${title}: ${description}`, severity);

    res.json({ alert, log });
  });

  // Resolve a security alert
  app.patch('/api/admin/alerts/:id/resolve', requireAdminMiddleware, (req: Request, res: Response) => {
    const alertId = String(req.params.id || '');
    const alert = securityAlerts.find((a) => a.id === alertId);
    if (!alert) {
      res.status(404).json({ error: 'Peringatan keamanan tidak ditemukan.' });
      return;
    }

    alert.status = 'resolved';
    alert.updatedAt = nowIso();

    const log = appendLog(
      'admin_vuedevo_01',
      SUPER_ADMIN_EMAIL,
      'alert_resolved',
      `Super Admin menandai insiden "${alert.title}" sebagai selesai (Resolved).`,
      'info'
    );

    res.json({ alert, log });
  });

  // Import converted PHPMyAdmin JSON records (CodeIgniter 4 Shield users + logs + financial counts) into live server registry
  app.post('/api/admin/import-sql-json', requireAdminMiddleware, (req: Request, res: Response) => {
    const incomingUsers = Array.isArray(req.body?.users) ? req.body.users : [];
    const incomingLogs = Array.isArray(req.body?.activity_logs) ? req.body.activity_logs : [];
    const walletsCount = Number(req.body?.walletsCount || 0);
    const walletOwnersCount = Number(req.body?.walletOwnersCount || 0);
    const categoriesCount = Number(req.body?.categoriesCount || 0);
    const transactionsCount = Number(req.body?.transactionsCount || 0);
    const budgetsCount = Number(req.body?.budgetsCount || 0);

    let importedUsersCount = 0;
    for (const u of incomingUsers) {
      const uid = String(u.uid || '').trim();
      const email = String(u.email || '').trim().toLowerCase();
      if (!uid || !email) continue;

      const isSuper = email === SUPER_ADMIN_EMAIL;
      let existing = usersStore.get(uid);
      if (!existing && email) {
        for (const uRec of usersStore.values()) {
          if (uRec.email.toLowerCase() === email) {
            existing = uRec;
            break;
          }
        }
      }

      const username = String(u.username || email.split('@')[0] || uid)
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_')
        .slice(0, 60);

      const isDeactivated = Boolean(u.isExplicitlyDeactivated === true || existing?.isExplicitlyDeactivated === true);
      let isPro = false;
      let isPending = false;

      if (isDeactivated) {
        isPro = false;
        isPending = false;
      } else if (u.subscriptionStatus === 'pro' || u.isPro === true) {
        isPro = isUserSubscriptionActive({
          subscriptionStatus: 'pro',
          isPro: true,
          subscriptionExpiresAt: u.subscriptionExpiresAt || existing?.subscriptionExpiresAt,
        });
      } else if (u.subscriptionStatus === 'pending') {
        isPending = true;
      } else if (existing) {
        isPro = isUserSubscriptionActive(existing);
        isPending = !isPro && existing.subscriptionStatus === 'pending';
      }

      const subscriptionPlan: 'monthly' | 'yearly' | null =
        isPro || isPending
          ? u.subscriptionPlan === 'yearly' || existing?.subscriptionPlan === 'yearly'
            ? 'yearly'
            : 'monthly'
          : null;
      const subscriptionExpiresAt: string | null = isPro
        ? u.subscriptionExpiresAt || existing?.subscriptionExpiresAt || null
        : null;

      const record: ServerUserRecord = {
        uid: isSuper ? 'admin_vuedevo_01' : uid,
        username: isSuper ? SUPER_ADMIN_USERNAME : username,
        email,
        displayName: String(u.displayName || username || email.split('@')[0]).slice(0, 80),
        role: isSuper || u.role === 'admin' ? 'admin' : 'user',
        status: !isSuper && u.status === 'blocked' ? 'blocked' : 'active',
        authProvider: u.authProvider === 'google' ? 'google' : 'password',
        currency: u.currency === 'USD' ? 'USD' : 'IDR',
        subscriptionStatus: isPro ? 'pro' : isPending ? 'pending' : 'free',
        isPro,
        isExplicitlyDeactivated: isDeactivated,
        subscriptionPlan,
        subscriptionExpiresAt,
        subscriptionPaymentMethod: existing?.subscriptionPaymentMethod || u.subscriptionPaymentMethod || null,
        subscriptionProofDataUrl: existing?.subscriptionProofDataUrl || u.subscriptionProofDataUrl || null,
        subscriptionProofFileName: existing?.subscriptionProofFileName || u.subscriptionProofFileName || null,
        subscriptionRequestedAt: existing?.subscriptionRequestedAt || u.subscriptionRequestedAt || null,
        subscriptionSenderName: existing?.subscriptionSenderName || u.subscriptionSenderName || null,
        subscriptionTransferNote: existing?.subscriptionTransferNote || u.subscriptionTransferNote || null,
        passwordHash: isSuper
          ? superAdminPasswordHash
          : u.passwordHash
          ? String(u.passwordHash)
          : existing?.passwordHash,
        createdAt: String(u.createdAt || existing?.createdAt || nowIso()),
        updatedAt: String(u.updatedAt || existing?.updatedAt || nowIso()),
      };

      usersStore.set(record.uid, record);
      importedUsersCount++;
    }
    savePersistedUsersCache();

    let importedLogsCount = 0;
    for (const lg of incomingLogs) {
      const entry: ServerActivityLog = {
        id: String(lg.id || `log_ci4_${Date.now()}_${importedLogsCount}`),
        actorUid: String(lg.actorUid || 'ci4_user').slice(0, 128),
        actorEmail: String(lg.actorEmail || 'user@sisa-uang.id').slice(0, 120),
        action: String(lg.action || 'ci4_shield_login').slice(0, 60),
        detail: String(lg.detail || 'Migrasi log CodeIgniter 4 Shield').slice(0, 250),
        severity: lg.severity === 'critical' ? 'critical' : lg.severity === 'warning' ? 'warning' : 'info',
        createdAt: String(lg.createdAt || nowIso()),
      };
      if (!activityLogs.some((existingLog) => existingLog.id === entry.id)) {
        activityLogs.unshift(entry);
        importedLogsCount++;
      }
    }
    if (importedLogsCount > 0) {
      savePersistedLogsCache();
    }

    const summaryLog = appendLog(
      'admin_vuedevo_01',
      SUPER_ADMIN_EMAIL,
      'phpmyadmin_json_to_firestore_import',
      `Import JSON PHPMyAdmin selesai: ${importedUsersCount} user, ${walletsCount} sumber dana, ${walletOwnersCount} kepemilikan dana, ${categoriesCount} kategori, ${transactionsCount} transaksi, ${budgetsCount} anggaran.`,
      'info'
    );

    res.json({
      importedUsersCount,
      importedLogsCount,
      users: Array.from(usersStore.values()).map(sanitizeUser),
      logs: activityLogs,
      summaryLog,
    });
  });

  // =========================================================================
  // Super Admin Database Explorer & Backup API (Server Proxy to Cloud Firestore)
  // =========================================================================
  let cachedServerDbStats: {
    data: { collectionName: string; label: string; description: string; docCount: number }[];
    fetchedAt: number;
  } | null = null;

  app.get('/api/admin/database/stats', requireAdminMiddleware, async (req: Request, res: Response) => {
    const force = req.query.force === 'true';
    if (!force && cachedServerDbStats && Date.now() - cachedServerDbStats.fetchedAt < 60_000) {
      res.json({
        success: true,
        stats: cachedServerDbStats.data,
        cached: true,
      });
      return;
    }

    const collectionDefs = [
      {
        collectionName: 'users',
        label: 'users (Akun Pengguna)',
        description: 'Data akun pengguna hasil migrasi & registrasi (Super Admin tetap dilindungi)',
        docCount: usersStore.size,
      },
      {
        collectionName: 'wallets',
        label: 'wallets (Sumber Dana / Dompet)',
        description: 'Daftar rekening bank, e-wallet, kas tunai, dan investasi',
        docCount: 0,
      },
      {
        collectionName: 'wallet_owners',
        label: 'wallet_owners (Kepemilikan Dana)',
        description: 'Alokasi pemilik dana (Pribadi, Istri, Tabungan, dll) di setiap dompet',
        docCount: 0,
      },
      {
        collectionName: 'categories',
        label: 'categories (Kategori Transaksi)',
        description: 'Kategori pemasukan (income) dan pengeluaran (expense)',
        docCount: 0,
      },
      {
        collectionName: 'transactions',
        label: 'transactions (Riwayat Transaksi)',
        description: 'Seluruh mutasi pemasukan, pengeluaran, dan transfer dana',
        docCount: 0,
      },
      {
        collectionName: 'budgets',
        label: 'budgets (Anggaran Bulanan)',
        description: 'Target & batas anggaran pengeluaran bulanan per kategori',
        docCount: 0,
      },
      {
        collectionName: 'activity_logs',
        label: 'activity_logs (Log Aktivitas & Login)',
        description: 'Jejak audit aktivitas pengguna dan histori login CI4 Shield',
        docCount: activityLogs.length,
      },
      {
        collectionName: 'security_alerts',
        label: 'security_alerts (Peringatan Keamanan)',
        description: 'Insiden dan notifikasi peringatan keamanan sistem',
        docCount: securityAlerts.length,
      },
    ];

    if (serverDb && serverAuth) {
      try {
        await ensureServerFirebaseSignedIn();
        await Promise.all(
          collectionDefs.map(async (def) => {
            try {
              // Use aggregation count query (1 read per 1,000 docs instead of reading every document)
              const countSnap = await serverFsGetCountFromServer(
                serverFsCollection(serverDb, def.collectionName)
              );
              def.docCount = countSnap.data().count;
            } catch {
              // keep fallback count
            }
          })
        );
        cachedServerDbStats = {
          data: collectionDefs,
          fetchedAt: Date.now(),
        };
      } catch (err: any) {
        console.warn('[Admin Database Stats Server Notice]', err?.message || err);
      }
    }

    res.json({
      success: true,
      stats: collectionDefs,
    });
  });

  app.post('/api/admin/database/export', requireAdminMiddleware, async (req: Request, res: Response) => {
    const collectionsList = Array.isArray(req.body?.collections)
      ? (req.body.collections as string[])
      : [];

    if (collectionsList.length === 0) {
      res.status(400).json({ error: 'Daftar koleksi tidak boleh kosong.' });
      return;
    }

    if (!serverDb || !serverAuth) {
      res.status(500).json({ error: 'Koneksi database server belum diinisialisasi.' });
      return;
    }

    try {
      await ensureServerFirebaseSignedIn();

      const tsToIso = (val: any): any => {
        if (val === null || val === undefined) return val;
        if (typeof val === 'object') {
          if (typeof val.toDate === 'function') {
            try { return val.toDate().toISOString(); } catch { return String(val); }
          }
          if ('seconds' in val && typeof val.seconds === 'number') {
            try { return new Date(val.seconds * 1000).toISOString(); } catch { return String(val); }
          }
          if (Array.isArray(val)) {
            return val.map(tsToIso);
          }
          const out: Record<string, any> = {};
          for (const [k, v] of Object.entries(val)) {
            out[k] = tsToIso(v);
          }
          return out;
        }
        return val;
      };

      const backupData: Record<string, Record<string, any>[]> = {};
      for (const colName of collectionsList) {
        try {
          const snap = await serverFsGetDocs(serverFsCollection(serverDb, colName));
          backupData[colName] = snap.docs.map((d) => {
            const raw = d.data();
            const serialized = tsToIso(raw);
            return {
              __docId: d.id,
              id: raw.id ?? raw.uid ?? d.id,
              ...serialized,
            };
          });
        } catch (colErr: any) {
          console.warn(`[Admin Database Export Server] Warning exporting ${colName}:`, colErr?.message || colErr);
          backupData[colName] = [];
        }
      }

      appendLog(
        'admin_vuedevo_01',
        SUPER_ADMIN_EMAIL,
        'server_database_backup_export',
        `Super Admin mengekspor ${collectionsList.length} koleksi via server backup bridge.`,
        'info'
      );

      res.json({
        success: true,
        backupData,
      });
    } catch (err: any) {
      if (err instanceof ServerFirebaseConfigError) {
        res.status(err.statusCode).json({
          success: false,
          code: err.code,
          error: err.message,
        });
        return;
      }
      console.error('[Admin Database Export Server Error]', err);
      res.status(500).json({
        error: `Gagal mengekspor database dari server: ${err?.message || err}`,
      });
    }
  });

  app.get('/api/admin/database/raw-docs', requireAdminMiddleware, async (req: Request, res: Response) => {
    const colName = String(req.query.collection || '').trim();
    const limitCount = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    if (!colName) {
      res.status(400).json({ error: 'Parameter collection wajib disertakan.' });
      return;
    }

    if (!serverDb || !serverAuth) {
      res.status(500).json({ error: 'Server database worker tidak aktif.' });
      return;
    }

    try {
      await ensureServerFirebaseSignedIn();

      const [snap, countSnap] = await Promise.all([
        serverFsGetDocs(serverFsQuery(serverFsCollection(serverDb, colName), serverFsLimit(limitCount))),
        serverFsGetCountFromServer(serverFsCollection(serverDb, colName)).catch(() => null),
      ]);
      const tsToIso = (val: any): any => {
        if (val === null || val === undefined) return val;
        if (typeof val === 'object') {
          if (typeof val.toDate === 'function') {
            try { return val.toDate().toISOString(); } catch { return String(val); }
          }
          if ('seconds' in val && typeof val.seconds === 'number') {
            try { return new Date(val.seconds * 1000).toISOString(); } catch { return String(val); }
          }
          if (Array.isArray(val)) return val.map(tsToIso);
          const out: Record<string, any> = {};
          for (const [k, v] of Object.entries(val)) out[k] = tsToIso(v);
          return out;
        }
        return val;
      };

      const docs = snap.docs.map((d) => {
        const raw = d.data();
        return {
          __docId: d.id,
          id: raw.id ?? raw.uid ?? d.id,
          ...tsToIso(raw),
        };
      });

      res.json({
        success: true,
        collection: colName,
        totalInCollection: countSnap ? countSnap.data().count : docs.length,
        docs,
      });
    } catch (err: any) {
      if (err instanceof ServerFirebaseConfigError) {
        res.status(err.statusCode).json({
          success: false,
          code: err.code,
          error: err.message,
        });
        return;
      }
      res.status(500).json({ error: err?.message || 'Gagal membaca dokumen dari server.' });
    }
  });

  // =========================================================================
  // App Version & Live Update Detection Endpoint
  // =========================================================================
  function computeCurrentBuildFingerprint(): { version: string; buildHash: string } {
    let version = '1.0.3';
    const hash = crypto.createHash('sha1');
    try {
      const pkgRaw = fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8');
      const pkg = JSON.parse(pkgRaw);
      if (pkg?.version) version = String(pkg.version);
      hash.update(pkgRaw);
    } catch {
      // Ignore
    }

    const scanDir = (dirPath: string) => {
      try {
        if (!fs.existsSync(dirPath)) return;
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          const full = path.join(dirPath, entry.name);
          if (entry.isDirectory()) {
            scanDir(full);
          } else if (entry.isFile() && /\.(vue|ts|css|html|json)$/.test(entry.name)) {
            const stat = fs.statSync(full);
            hash.update(`${entry.name}:${Math.floor(stat.mtimeMs)}:${stat.size};`);
          }
        }
      } catch {
        // Ignore
      }
    };

    scanDir(path.join(__dirname, 'src'));
    try {
      const indexStat = fs.statSync(path.join(__dirname, 'index.html'));
      hash.update(`index.html:${Math.floor(indexStat.mtimeMs)};`);
    } catch {
      // Ignore
    }

    return {
      version,
      buildHash: hash.digest('hex').slice(0, 12),
    };
  }

  app.get('/api/app-version', (_req: Request, res: Response) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.json({
      ...computeCurrentBuildFingerprint(),
      serverTimeMs: Date.now(),
    });
  });

  // =========================================================================
  // Authenticated User Firestore Bridge (/api/user-db/*)
  // Enables legacy/email-password users (ci4_user_*, user_*) to access only
  // their own Cloud Firestore documents without ever signing clients in as Admin.
  // =========================================================================
  const ALLOWED_USER_DB_COLLECTIONS = new Set([
    'users',
    'wallets',
    'wallet_owners',
    'categories',
    'transactions',
    'budgets',
    'report_settings',
    'savings_goals',
    'savings_entries',
    'debts',
    'debt_entries',
    'automations',
  ]);
  const SHARED_CATEGORY_OWNER_IDS = new Set(['ci4_user_46', 'default', 'system', '']);
  const USER_SENSITIVE_FIELDS = new Set([
    'role',
    'status',
    'isPro',
    'subscriptionExpiresAt',
    'isExplicitlyDeactivated',
    'passwordHash',
  ]);

  function translateBridgeSentinels(value: any): any {
    if (value === null || value === undefined) return value;
    if (Array.isArray(value)) return value.map((item) => translateBridgeSentinels(item));
    if (typeof value === 'object') {
      if (value.__fsType === 'serverTimestamp') {
        return serverFsTimestamp();
      }
      if (value.__fsType === 'increment') {
        return serverFsIncrement(Number(value.delta || 0));
      }
      const out: Record<string, any> = {};
      for (const [k, v] of Object.entries(value)) {
        if (v !== undefined) {
          out[k] = translateBridgeSentinels(v);
        }
      }
      return out;
    }
    return value;
  }

  function stripSensitiveUserFields(colName: string, data: Record<string, any>): Record<string, any> {
    if (colName !== 'users') return data;
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(data)) {
      if (k === 'passwordHash') continue;
      out[k] = v;
    }
    return out;
  }

  function verifyQueryWheresForOwner(
    colName: string,
    wheres: any[],
    targetOwnerUid: string
  ): boolean {
    if (!Array.isArray(wheres)) return false;
    return wheres.some((w) => {
      if (!w || w.field !== 'ownerId') return false;
      if (w.op === '==') {
        return (
          String(w.value || '') === targetOwnerUid ||
          (colName === 'categories' && SHARED_CATEGORY_OWNER_IDS.has(String(w.value || '')))
        );
      }
      if (w.op === 'in' && colName === 'categories' && Array.isArray(w.value)) {
        return w.value.every(
          (val: any) =>
            String(val || '') === targetOwnerUid || SHARED_CATEGORY_OWNER_IDS.has(String(val || ''))
        );
      }
      return false;
    });
  }

  function fsRestDocsRoot(): string {
    return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(firebaseServerConfig.projectId)}/databases/${encodeURIComponent(firebaseServerConfig.firestoreDatabaseId)}/documents`;
  }

  function fsRestDocResourcePath(colName: string, docId: string): string {
    return `projects/${firebaseServerConfig.projectId}/databases/${firebaseServerConfig.firestoreDatabaseId}/documents/${colName}/${docId}`;
  }

  function decodeFirestoreRestValue(val: any): any {
    if (!val || typeof val !== 'object') return null;
    if ('nullValue' in val) return null;
    if ('booleanValue' in val) return Boolean(val.booleanValue);
    if ('integerValue' in val) return Number(val.integerValue);
    if ('doubleValue' in val) return Number(val.doubleValue);
    if ('stringValue' in val) return String(val.stringValue);
    if ('timestampValue' in val) return String(val.timestampValue);
    if ('referenceValue' in val) return String(val.referenceValue);
    if ('arrayValue' in val) {
      const vals = Array.isArray(val.arrayValue?.values) ? val.arrayValue.values : [];
      return vals.map((item: any) => decodeFirestoreRestValue(item));
    }
    if ('mapValue' in val) {
      const fields = val.mapValue?.fields || {};
      const out: Record<string, any> = {};
      for (const [k, v] of Object.entries(fields)) {
        out[k] = decodeFirestoreRestValue(v);
      }
      return out;
    }
    return null;
  }

  function decodeFirestoreRestFields(fields?: Record<string, any>): Record<string, any> {
    const out: Record<string, any> = {};
    if (!fields || typeof fields !== 'object') return out;
    for (const [k, v] of Object.entries(fields)) {
      out[k] = decodeFirestoreRestValue(v);
    }
    return out;
  }

  function encodeFirestoreRestValue(val: any): any {
    if (val === null || val === undefined) return { nullValue: null };
    if (typeof val === 'boolean') return { booleanValue: val };
    if (typeof val === 'number') {
      if (!Number.isFinite(val)) return { doubleValue: 0 };
      return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
    }
    if (typeof val === 'string') return { stringValue: val };
    if (val instanceof Date) return { timestampValue: val.toISOString() };
    if (Array.isArray(val)) {
      return {
        arrayValue: {
          values: val
            .filter((item) => item !== undefined)
            .map((item) => encodeFirestoreRestValue(item)),
        },
      };
    }
    if (typeof val === 'object') {
      const fields: Record<string, any> = {};
      for (const [k, v] of Object.entries(val)) {
        if (v !== undefined) {
          fields[k] = encodeFirestoreRestValue(v);
        }
      }
      return { mapValue: { fields } };
    }
    return { stringValue: String(val) };
  }

  function buildRestStructuredWhere(wheres: any[]): any | undefined {
    const filters: any[] = [];
    const opMap: Record<string, string> = {
      '==': 'EQUAL',
      '!=': 'NOT_EQUAL',
      '<': 'LESS_THAN',
      '<=': 'LESS_THAN_OR_EQUAL',
      '>': 'GREATER_THAN',
      '>=': 'GREATER_THAN_OR_EQUAL',
      in: 'IN',
      'not-in': 'NOT_IN',
      'array-contains': 'ARRAY_CONTAINS',
      'array-contains-any': 'ARRAY_CONTAINS_ANY',
    };
    for (const w of wheres) {
      if (!w || typeof w.field !== 'string' || typeof w.op !== 'string') continue;
      if (w.value === null && w.op === '==') {
        filters.push({ unaryFilter: { field: { fieldPath: w.field }, op: 'IS_NULL' } });
        continue;
      }
      if (w.value === null && w.op === '!=') {
        filters.push({ unaryFilter: { field: { fieldPath: w.field }, op: 'IS_NOT_NULL' } });
        continue;
      }
      const mappedOp = opMap[w.op];
      if (!mappedOp) continue;
      filters.push({
        fieldFilter: {
          field: { fieldPath: w.field },
          op: mappedOp,
          value: encodeFirestoreRestValue(w.value),
        },
      });
    }
    if (filters.length === 0) return undefined;
    if (filters.length === 1) return filters[0];
    return { compositeFilter: { op: 'AND', filters } };
  }

  async function firestoreRestGetDocRaw(
    idToken: string,
    colName: string,
    docId: string
  ): Promise<{ exists: boolean; name?: string; fields?: Record<string, any> }> {
    const url = `${fsRestDocsRoot()}/${encodeURIComponent(colName)}/${encodeURIComponent(docId)}`;
    const r = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${idToken}` },
      signal: AbortSignal.timeout(12000),
    });
    if (r.status === 404) {
      return { exists: false };
    }
    const body = (await r.json().catch(() => null)) as any;
    if (!r.ok) {
      throw new Error(body?.error?.message || `Firestore REST GET failed (${r.status})`);
    }
    return { exists: true, name: body?.name, fields: body?.fields || {} };
  }

  async function resolveCallerFirestoreRestToken(
    req: Request,
    caller: { ok: true; uid: string; email: string; isAdmin: boolean },
    targetOwnerUid: string,
    colName?: string
  ): Promise<string | null> {
    const authHeader = String(req.headers.authorization || '').trim();
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    const idToken = match?.[1]?.trim();
    if (!idToken) return null;
    const fbUser = await verifyFirebaseIdToken(idToken);
    if (!fbUser) return null;
    const isFbAdmin =
      fbUser.email === SUPER_ADMIN_EMAIL || fbUser.email === WORKSPACE_ADMIN_EMAIL;
    if (caller.isAdmin && isFbAdmin) {
      return idToken;
    }
    if (fbUser.uid === targetOwnerUid || (colName === 'categories' && fbUser.uid === caller.uid)) {
      return idToken;
    }
    return null;
  }

  async function firestoreRestRunQuery(
    idToken: string,
    colName: string,
    wheres: any[],
    orderBys: any[],
    limitCount?: number,
    startAfterDocId?: string
  ): Promise<Array<{ id: string; data: Record<string, any> }>> {
    const structuredQuery: Record<string, any> = {
      from: [{ collectionId: colName }],
    };
    const restWhere = buildRestStructuredWhere(wheres);
    if (restWhere) structuredQuery.where = restWhere;

    const normalizedOrders: Array<{ field: { fieldPath: string }; direction: 'ASCENDING' | 'DESCENDING' }> =
      orderBys
        .filter((o: any) => o && typeof o.field === 'string')
        .map((o: any) => ({
          field: { fieldPath: String(o.field) },
          direction: o.dir === 'desc' ? 'DESCENDING' : 'ASCENDING',
        }));

    if (startAfterDocId) {
      const cursorDoc = await firestoreRestGetDocRaw(idToken, colName, startAfterDocId);
      if (cursorDoc.exists && cursorDoc.name) {
        const startValues = normalizedOrders.map(
          (o) => cursorDoc.fields?.[o.field.fieldPath] ?? { nullValue: null }
        );
        const lastDir =
          normalizedOrders.length > 0
            ? normalizedOrders[normalizedOrders.length - 1].direction
            : 'ASCENDING';
        if (!normalizedOrders.some((o) => o.field.fieldPath === '__name__')) {
          normalizedOrders.push({ field: { fieldPath: '__name__' }, direction: lastDir });
        }
        startValues.push({ referenceValue: cursorDoc.name });
        structuredQuery.startAt = { values: startValues, before: false };
      }
    }

    if (normalizedOrders.length > 0) {
      structuredQuery.orderBy = normalizedOrders;
    }
    if (limitCount) {
      structuredQuery.limit = limitCount;
    }

    const restRes = await fetch(`${fsRestDocsRoot()}:runQuery`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ structuredQuery }),
      signal: AbortSignal.timeout(15000),
    });
    const restBody = (await restRes.json().catch(() => null)) as any;
    if (!restRes.ok) {
      throw new Error(restBody?.error?.message || `Firestore REST query failed (${restRes.status})`);
    }
    const rows = Array.isArray(restBody) ? restBody : [];
    return rows
      .filter((row: any) => row?.document?.name)
      .map((row: any) => {
        const docPath = String(row.document.name);
        const docIdPart = docPath.split('/').pop() || '';
        return {
          id: docIdPart,
          data: stripSensitiveUserFields(colName, decodeFirestoreRestFields(row.document.fields)),
        };
      });
  }

  async function firestoreRestRunCount(
    idToken: string,
    colName: string,
    wheres: any[]
  ): Promise<number> {
    const structuredQuery: Record<string, any> = {
      from: [{ collectionId: colName }],
    };
    const restWhere = buildRestStructuredWhere(wheres);
    if (restWhere) structuredQuery.where = restWhere;

    const restRes = await fetch(`${fsRestDocsRoot()}:runAggregationQuery`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        structuredAggregationQuery: {
          structuredQuery,
          aggregations: [{ alias: 'count', count: {} }],
        },
      }),
      signal: AbortSignal.timeout(12000),
    });
    const restBody = (await restRes.json().catch(() => null)) as any;
    if (!restRes.ok) {
      throw new Error(restBody?.error?.message || `Firestore REST count failed (${restRes.status})`);
    }
    const rows = Array.isArray(restBody) ? restBody : [];
    return Number(rows?.[0]?.result?.aggregateFields?.count?.integerValue || 0);
  }

  app.get('/api/system/firebase-bridge-status', (_req: Request, res: Response) => {
    if (
      lastServerFirebaseAuthError?.code === 'SERVER_FIREBASE_RATE_LIMITED' &&
      Date.now() >= serverFirebaseRateLimitedUntil
    ) {
      lastServerFirebaseAuthError = null;
    }
    res.json({
      success: true,
      configured: isServerFirebaseBridgeReady(),
      hasEnvPassword: Boolean(getServerFirebasePassword()),
      serverSignedIn: Boolean(serverAuth?.currentUser || serverWorkerRestSession),
      rateLimitedUntil:
        Date.now() < serverFirebaseRateLimitedUntil ? serverFirebaseRateLimitedUntil : null,
      lastError: lastServerFirebaseAuthError
        ? { code: lastServerFirebaseAuthError.code, message: lastServerFirebaseAuthError.message }
        : null,
    });
  });

  app.post('/api/admin/database/activate-worker', requireAdminMiddleware, async (req: Request, res: Response) => {
    const password = String(req.body?.password || '').trim();
    if (!password) {
      res.status(400).json({ success: false, error: 'Kata sandi Firebase Super Admin wajib diisi.' });
      return;
    }
    if (!serverDb || !serverAuth) {
      res.status(500).json({ success: false, error: 'Koneksi database server belum diinisialisasi.' });
      return;
    }
    try {
      await serverFsSignIn(serverAuth, SUPER_ADMIN_EMAIL, password);
      runtimeServerFbPassword = password;
      lastServerFirebaseAuthError = null;
      serverFirebaseRateLimitedUntil = 0;
      void syncUsersFromFirestore(true).catch(() => {});
      res.json({
        success: true,
        configured: true,
      });
    } catch (sdkErr: any) {
      if (isFirebaseTooManyAttemptsError(sdkErr)) {
        serverFirebaseRateLimitedUntil = Date.now() + FIREBASE_RATE_LIMIT_COOLDOWN_MS;
        const rateErr = buildServerRateLimitError(
          crypto.createHash('sha256').update(password).digest('hex')
        );
        res.status(429).json({
          success: false,
          code: rateErr.code,
          error: rateErr.message,
        });
        return;
      }
      if (!isFirebaseInvalidCredentialError(sdkErr)) {
        try {
          const restToken = await signInServerWorkerViaRest(password);
          if (restToken) {
            runtimeServerFbPassword = password;
            lastServerFirebaseAuthError = null;
            serverFirebaseRateLimitedUntil = 0;
            void syncUsersFromFirestore(true).catch(() => {});
            res.json({ success: true, configured: true });
            return;
          }
        } catch (restErr: any) {
          if (restErr instanceof ServerFirebaseConfigError && restErr.code === 'SERVER_FIREBASE_RATE_LIMITED') {
            res.status(429).json({
              success: false,
              code: restErr.code,
              error: restErr.message,
            });
            return;
          }
        }
      }
      res.status(401).json({
        success: false,
        error: 'Kata sandi Firebase Auth untuk vuedevo@gmail.com tidak valid.',
      });
    }
  });

  app.post('/api/user-db/doc', async (req: Request, res: Response) => {
    const colName = String(req.body?.collection || '').trim();
    const docId = String(req.body?.docId || '').trim();
    const rawOwner = String(
      req.body?.ownerUid || req.headers['x-owner-uid'] || (colName === 'users' ? docId : '')
    ).trim();

    if (!ALLOWED_USER_DB_COLLECTIONS.has(colName) || !docId || docId.includes('/')) {
      res.status(400).json({ success: false, error: 'Koleksi atau ID dokumen tidak valid.' });
      return;
    }

    const caller = await verifyCallerAuth(req, rawOwner || undefined);
    if (!caller.ok) {
      res.status(caller.status).json({ success: false, code: caller.code, error: caller.error });
      return;
    }
    const targetOwnerUid = rawOwner || caller.uid;

    if (colName === 'users' && !caller.isAdmin) {
      const ownsUserDoc = await doesCallerOwnTargetUid(caller.uid, caller.email, docId);
      if (!ownsUserDoc) {
        res.status(403).json({ success: false, error: 'Akses ditolak untuk dokumen pengguna ini.' });
        return;
      }
    }

    const handleDocViaRest = async (restToken: string) => {
      const restSnap = await firestoreRestGetDocRaw(restToken, colName, docId);
      if (!restSnap.exists) {
        res.json({ success: true, exists: false, id: docId, data: null });
        return;
      }
      const rawData = decodeFirestoreRestFields(restSnap.fields);
      const docOwner = String(rawData.ownerId || '').trim();
      const allowedNonUser =
        caller.isAdmin ||
        docOwner === targetOwnerUid ||
        docOwner === caller.uid ||
        (colName === 'categories' && SHARED_CATEGORY_OWNER_IDS.has(docOwner)) ||
        (colName === 'report_settings' && docId === targetOwnerUid);

      if (colName !== 'users' && !allowedNonUser) {
        res.status(403).json({ success: false, error: 'Dokumen bukan milik akun Anda.' });
        return;
      }

      res.json({
        success: true,
        exists: true,
        id: docId,
        data: stripSensitiveUserFields(colName, rawData),
      });
    };

    try {
      if (!hasWarmServerWorkerSession()) {
        const restToken = await resolveCallerFirestoreRestToken(req, caller, targetOwnerUid, colName);
        if (restToken) {
          await handleDocViaRest(restToken);
          return;
        }
      }

      try {
        await ensureServerFirebaseSignedIn();
        if (!serverAuth?.currentUser) {
          const workerRestToken = await getServerWorkerRestToken();
          if (workerRestToken) {
            await handleDocViaRest(workerRestToken);
            return;
          }
        }
        const snap = await serverFsGetDoc(serverFsDoc(serverDb, colName, docId));
        if (!snap.exists()) {
          res.json({ success: true, exists: false, id: docId, data: null });
          return;
        }
        const rawData = (snap.data() || {}) as Record<string, any>;
        const docOwner = String(rawData.ownerId || '').trim();
        const allowedNonUser =
          caller.isAdmin ||
          docOwner === targetOwnerUid ||
          docOwner === caller.uid ||
          (colName === 'categories' && SHARED_CATEGORY_OWNER_IDS.has(docOwner)) ||
          (colName === 'report_settings' && docId === targetOwnerUid);

        if (colName !== 'users' && !allowedNonUser) {
          res.status(403).json({ success: false, error: 'Dokumen bukan milik akun Anda.' });
          return;
        }

        const serialized = stripSensitiveUserFields(colName, tsToIsoValue(rawData));
        res.json({
          success: true,
          exists: true,
          id: snap.id,
          data: serialized,
        });
        return;
      } catch (sdkErr: any) {
        const canTryWorkerRest = !(sdkErr instanceof ServerFirebaseConfigError);
        const fallbackRestToken =
          (canTryWorkerRest ? await getServerWorkerRestToken() : null) ||
          (await resolveCallerFirestoreRestToken(req, caller, targetOwnerUid, colName));
        if (fallbackRestToken) {
          await handleDocViaRest(fallbackRestToken);
          return;
        }
        throw sdkErr;
      }
    } catch (err: any) {
      if (err instanceof ServerFirebaseConfigError) {
        res.status(err.statusCode).json({
          success: false,
          code: err.code,
          error: err.message,
        });
        return;
      }
      res.status(500).json({
        success: false,
        error: err?.message || 'Gagal membaca dokumen Firestore dari server.',
      });
    }
  });

  app.post('/api/user-db/query', async (req: Request, res: Response) => {
    const colName = String(req.body?.collection || '').trim();
    const wheres = Array.isArray(req.body?.wheres) ? req.body.wheres : [];
    const orderBys = Array.isArray(req.body?.orderBys) ? req.body.orderBys : [];
    const limitCount = req.body?.limitCount ? Math.min(5000, Math.max(1, Number(req.body.limitCount))) : undefined;
    const startAfterDocId = req.body?.startAfterDocId ? String(req.body.startAfterDocId).trim() : '';
    const rawOwner = String(req.body?.ownerUid || req.headers['x-owner-uid'] || '').trim();

    if (!ALLOWED_USER_DB_COLLECTIONS.has(colName)) {
      res.status(400).json({ success: false, error: 'Koleksi Firestore tidak diizinkan.' });
      return;
    }

    const caller = await verifyCallerAuth(req, rawOwner || undefined);
    if (!caller.ok) {
      res.status(caller.status).json({ success: false, code: caller.code, error: caller.error });
      return;
    }
    const targetOwnerUid = rawOwner || caller.uid;

    if (!caller.isAdmin) {
      if (colName === 'users') {
        const emailMatchesCaller = wheres.some(
          (w: any) => w && w.field === 'email' && w.op === '==' && String(w.value || '').toLowerCase() === caller.email
        );
        if (!emailMatchesCaller) {
          res.status(403).json({ success: false, error: 'Query koleksi users dibatasi untuk akun sendiri.' });
          return;
        }
      } else if (!verifyQueryWheresForOwner(colName, wheres, targetOwnerUid)) {
        res.status(403).json({ success: false, error: 'Query harus dibatasi pada ownerId milik akun Anda.' });
        return;
      }
    }

    try {
      if (!hasWarmServerWorkerSession()) {
        const restToken = await resolveCallerFirestoreRestToken(req, caller, targetOwnerUid, colName);
        if (restToken) {
          const docs = await firestoreRestRunQuery(restToken, colName, wheres, orderBys, limitCount, startAfterDocId);
          res.json({ success: true, docs });
          return;
        }
      }

      try {
        await ensureServerFirebaseSignedIn();
        if (!serverAuth?.currentUser) {
          const workerRestToken = await getServerWorkerRestToken();
          if (workerRestToken) {
            const docs = await firestoreRestRunQuery(
              workerRestToken,
              colName,
              wheres,
              orderBys,
              limitCount,
              startAfterDocId
            );
            res.json({ success: true, docs });
            return;
          }
        }
        const constraints: any[] = [];
        for (const w of wheres) {
          if (w && typeof w.field === 'string' && typeof w.op === 'string') {
            constraints.push(serverFsWhere(w.field, w.op as any, w.value));
          }
        }
        for (const o of orderBys) {
          if (o && typeof o.field === 'string') {
            constraints.push(serverFsOrderBy(o.field, o.dir === 'desc' ? 'desc' : 'asc'));
          }
        }
        if (startAfterDocId) {
          const cursorSnap = await serverFsGetDoc(serverFsDoc(serverDb, colName, startAfterDocId));
          if (cursorSnap.exists()) {
            constraints.push(serverFsStartAfter(cursorSnap));
          }
        }
        if (limitCount) {
          constraints.push(serverFsLimit(limitCount));
        }

        const q = serverFsQuery(serverFsCollection(serverDb, colName), ...constraints);
        const snap = await serverFsGetDocs(q);
        const docs = snap.docs.map((d) => ({
          id: d.id,
          data: stripSensitiveUserFields(colName, tsToIsoValue(d.data() || {})),
        }));

        res.json({ success: true, docs });
        return;
      } catch (sdkErr: any) {
        const canTryWorkerRest = !(sdkErr instanceof ServerFirebaseConfigError);
        const fallbackRestToken =
          (canTryWorkerRest ? await getServerWorkerRestToken() : null) ||
          (await resolveCallerFirestoreRestToken(req, caller, targetOwnerUid, colName));
        if (fallbackRestToken) {
          const docs = await firestoreRestRunQuery(
            fallbackRestToken,
            colName,
            wheres,
            orderBys,
            limitCount,
            startAfterDocId
          );
          res.json({ success: true, docs });
          return;
        }
        throw sdkErr;
      }
    } catch (err: any) {
      if (err instanceof ServerFirebaseConfigError) {
        res.status(err.statusCode).json({
          success: false,
          code: err.code,
          error: err.message,
        });
        return;
      }
      res.status(500).json({
        success: false,
        error: err?.message || 'Gagal menjalankan query Firestore dari server.',
      });
    }
  });

  app.post('/api/user-db/count', async (req: Request, res: Response) => {
    const colName = String(req.body?.collection || '').trim();
    const wheres = Array.isArray(req.body?.wheres) ? req.body.wheres : [];
    const rawOwner = String(req.body?.ownerUid || req.headers['x-owner-uid'] || '').trim();

    if (!ALLOWED_USER_DB_COLLECTIONS.has(colName)) {
      res.status(400).json({ success: false, error: 'Koleksi Firestore tidak diizinkan.' });
      return;
    }

    const caller = await verifyCallerAuth(req, rawOwner || undefined);
    if (!caller.ok) {
      res.status(caller.status).json({ success: false, code: caller.code, error: caller.error });
      return;
    }
    const targetOwnerUid = rawOwner || caller.uid;

    if (!caller.isAdmin && !verifyQueryWheresForOwner(colName, wheres, targetOwnerUid)) {
      res.status(403).json({ success: false, error: 'Aggregation query harus dibatasi pada ownerId milik akun Anda.' });
      return;
    }

    try {
      if (!hasWarmServerWorkerSession()) {
        const restToken = await resolveCallerFirestoreRestToken(req, caller, targetOwnerUid, colName);
        if (restToken) {
          const countVal = await firestoreRestRunCount(restToken, colName, wheres);
          res.json({ success: true, count: countVal });
          return;
        }
      }

      try {
        await ensureServerFirebaseSignedIn();
        if (!serverAuth?.currentUser) {
          const workerRestToken = await getServerWorkerRestToken();
          if (workerRestToken) {
            const countVal = await firestoreRestRunCount(workerRestToken, colName, wheres);
            res.json({ success: true, count: countVal });
            return;
          }
        }
        const constraints: any[] = [];
        for (const w of wheres) {
          if (w && typeof w.field === 'string' && typeof w.op === 'string') {
            constraints.push(serverFsWhere(w.field, w.op as any, w.value));
          }
        }
        const q = serverFsQuery(serverFsCollection(serverDb, colName), ...constraints);
        const snap = await serverFsGetCountFromServer(q);
        res.json({ success: true, count: Number(snap.data().count || 0) });
        return;
      } catch (sdkErr: any) {
        const canTryWorkerRest = !(sdkErr instanceof ServerFirebaseConfigError);
        const fallbackRestToken =
          (canTryWorkerRest ? await getServerWorkerRestToken() : null) ||
          (await resolveCallerFirestoreRestToken(req, caller, targetOwnerUid, colName));
        if (fallbackRestToken) {
          const countVal = await firestoreRestRunCount(fallbackRestToken, colName, wheres);
          res.json({ success: true, count: countVal });
          return;
        }
        throw sdkErr;
      }
    } catch (err: any) {
      if (err instanceof ServerFirebaseConfigError) {
        res.status(err.statusCode).json({
          success: false,
          code: err.code,
          error: err.message,
        });
        return;
      }
      res.status(500).json({
        success: false,
        error: err?.message || 'Gagal menghitung dokumen Firestore dari server.',
      });
    }
  });

  app.post('/api/user-db/mutate', async (req: Request, res: Response) => {
    const ops = Array.isArray(req.body?.ops) ? req.body.ops : [];
    const rawOwner = String(req.body?.ownerUid || req.headers['x-owner-uid'] || '').trim();

    if (ops.length === 0 || ops.length > 500) {
      res.status(400).json({ success: false, error: 'Jumlah operasi mutate harus antara 1 sampai 500.' });
      return;
    }

    const caller = await verifyCallerAuth(req, rawOwner || undefined);
    if (!caller.ok) {
      res.status(caller.status).json({ success: false, code: caller.code, error: caller.error });
      return;
    }
    const targetOwnerUid = rawOwner || caller.uid;

    const executeMutateViaRest = async (restToken: string) => {
      const writes: any[] = [];
      for (const item of ops) {
        const opType = item?.op;
        const colName = String(item?.collection || '').trim();
        const docId = String(item?.docId || '').trim();

        if (!ALLOWED_USER_DB_COLLECTIONS.has(colName) || !docId || docId.includes('/')) {
          return { status: 400, error: `Operasi pada ${colName}/${docId} tidak valid.` };
        }

        const docPath = fsRestDocResourcePath(colName, docId);
        if (opType === 'delete') {
          if (!caller.isAdmin) {
            if (colName === 'users') {
              return { status: 403, error: 'Tidak dapat menghapus dokumen users.' };
            }
            const existingSnap = await firestoreRestGetDocRaw(restToken, colName, docId);
            if (existingSnap.exists) {
              const existingOwner = String(decodeFirestoreRestFields(existingSnap.fields).ownerId || '').trim();
              if (existingOwner !== targetOwnerUid && existingOwner !== caller.uid) {
                return { status: 403, error: 'Tidak berwenang menghapus dokumen pengguna lain.' };
              }
            }
          }
          writes.push({ delete: docPath });
          continue;
        }

        if (opType !== 'set' && opType !== 'update') {
          return { status: 400, error: 'Jenis operasi database tidak dikenal.' };
        }

        const rawPayload = item?.data && typeof item.data === 'object' ? { ...item.data } : {};
        if (!caller.isAdmin) {
          if (colName === 'users') {
            const ownsUserDoc = await doesCallerOwnTargetUid(caller.uid, caller.email, docId);
            if (!ownsUserDoc) {
              return { status: 403, error: 'Tidak berwenang mengubah profil pengguna lain.' };
            }
            for (const f of USER_SENSITIVE_FIELDS) {
              delete rawPayload[f];
            }
            if (
              rawPayload.subscriptionStatus !== undefined &&
              rawPayload.subscriptionStatus !== 'free' &&
              rawPayload.subscriptionStatus !== 'pending'
            ) {
              delete rawPayload.subscriptionStatus;
            }
          } else {
            if (
              rawPayload.ownerId !== undefined &&
              String(rawPayload.ownerId || '').trim() !== targetOwnerUid &&
              String(rawPayload.ownerId || '').trim() !== caller.uid
            ) {
              return { status: 403, error: 'ownerId dokumen harus sesuai akun yang sedang masuk.' };
            }
            if (opType === 'update') {
              const existingSnap = await firestoreRestGetDocRaw(restToken, colName, docId);
              if (existingSnap.exists) {
                const existingOwner = String(decodeFirestoreRestFields(existingSnap.fields).ownerId || '').trim();
                const isOwnReport = colName === 'report_settings' && docId === targetOwnerUid;
                if (!isOwnReport && existingOwner !== targetOwnerUid && existingOwner !== caller.uid) {
                  return { status: 403, error: 'Tidak berwenang memperbarui dokumen pengguna lain.' };
                }
              }
            } else if (!rawPayload.ownerId) {
              rawPayload.ownerId = targetOwnerUid;
            }
          }
        }

        const fields: Record<string, any> = {};
        const fieldPaths: string[] = [];
        const transforms: any[] = [];
        for (const [k, v] of Object.entries(rawPayload)) {
          if (v === undefined) continue;
          const sentinel = v as { __fsType?: string; delta?: number } | null;
          if (sentinel && typeof sentinel === 'object' && sentinel.__fsType === 'serverTimestamp') {
            transforms.push({ fieldPath: k, setToServerValue: 'REQUEST_TIME' });
          } else if (sentinel && typeof sentinel === 'object' && sentinel.__fsType === 'increment') {
            const delta = Number(sentinel.delta || 0);
            transforms.push({
              fieldPath: k,
              increment: Number.isInteger(delta) ? { integerValue: String(delta) } : { doubleValue: delta },
            });
          } else {
            fields[k] = encodeFirestoreRestValue(v);
            fieldPaths.push(k);
          }
        }

        const writeObj: Record<string, any> = {
          update: { name: docPath, fields },
        };
        if (opType === 'update' || item?.merge) {
          writeObj.updateMask = { fieldPaths };
        }
        if (opType === 'update') {
          writeObj.currentDocument = { exists: true };
        }
        if (transforms.length > 0) {
          writeObj.updateTransforms = transforms;
        }
        writes.push(writeObj);
      }

      const commitRes = await fetch(`${fsRestDocsRoot()}:commit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${restToken}`,
        },
        body: JSON.stringify({ writes }),
        signal: AbortSignal.timeout(15000),
      });
      const commitBody = (await commitRes.json().catch(() => null)) as any;
      if (!commitRes.ok) {
        throw new Error(commitBody?.error?.message || `Firestore REST commit failed (${commitRes.status})`);
      }
      return { status: 200 };
    };

    try {
      const preRestToken = !hasWarmServerWorkerSession()
        ? await resolveCallerFirestoreRestToken(req, caller, targetOwnerUid)
        : null;

      if (preRestToken) {
        const restOutcome = await executeMutateViaRest(preRestToken);
        if (restOutcome.status !== 200) {
          res.status(restOutcome.status).json({ success: false, error: restOutcome.error });
          return;
        }
        res.json({ success: true });
        return;
      }

      try {
        await ensureServerFirebaseSignedIn();
        if (!serverAuth?.currentUser) {
          const workerRestToken = await getServerWorkerRestToken();
          if (workerRestToken) {
            const restOutcome = await executeMutateViaRest(workerRestToken);
            if (restOutcome.status !== 200) {
              res.status(restOutcome.status).json({ success: false, error: restOutcome.error });
              return;
            }
            res.json({ success: true });
            return;
          }
        }
        const batch = serverFsWriteBatch(serverDb);

        for (const item of ops) {
          const opType = item?.op;
          const colName = String(item?.collection || '').trim();
          const docId = String(item?.docId || '').trim();

          if (!ALLOWED_USER_DB_COLLECTIONS.has(colName) || !docId || docId.includes('/')) {
            res.status(400).json({ success: false, error: `Operasi pada ${colName}/${docId} tidak valid.` });
            return;
          }

          const docRef = serverFsDoc(serverDb, colName, docId);

          if (opType === 'delete') {
            if (!caller.isAdmin) {
              if (colName === 'users') {
                res.status(403).json({ success: false, error: 'Tidak dapat menghapus dokumen users.' });
                return;
              }
              const existingSnap = await serverFsGetDoc(docRef);
              if (existingSnap.exists()) {
                const existingOwner = String(existingSnap.data()?.ownerId || '').trim();
                if (existingOwner !== targetOwnerUid && existingOwner !== caller.uid) {
                  res.status(403).json({ success: false, error: 'Tidak berwenang menghapus dokumen pengguna lain.' });
                  return;
                }
              }
            }
            batch.delete(docRef);
            continue;
          }

          if (opType !== 'set' && opType !== 'update') {
            res.status(400).json({ success: false, error: 'Jenis operasi database tidak dikenal.' });
            return;
          }

          const rawPayload = item?.data && typeof item.data === 'object' ? { ...item.data } : {};

          if (!caller.isAdmin) {
            if (colName === 'users') {
              const ownsUserDoc = await doesCallerOwnTargetUid(caller.uid, caller.email, docId);
              if (!ownsUserDoc) {
                res.status(403).json({ success: false, error: 'Tidak berwenang mengubah profil pengguna lain.' });
                return;
              }
              for (const f of USER_SENSITIVE_FIELDS) {
                delete rawPayload[f];
              }
              if (
                rawPayload.subscriptionStatus !== undefined &&
                rawPayload.subscriptionStatus !== 'free' &&
                rawPayload.subscriptionStatus !== 'pending'
              ) {
                delete rawPayload.subscriptionStatus;
              }
            } else {
              if (
                rawPayload.ownerId !== undefined &&
                String(rawPayload.ownerId || '').trim() !== targetOwnerUid &&
                String(rawPayload.ownerId || '').trim() !== caller.uid
              ) {
                res.status(403).json({ success: false, error: 'ownerId dokumen harus sesuai akun yang sedang masuk.' });
                return;
              }
              if (opType === 'update') {
                const existingSnap = await serverFsGetDoc(docRef);
                if (existingSnap.exists()) {
                  const existingOwner = String(existingSnap.data()?.ownerId || '').trim();
                  const isOwnReport = colName === 'report_settings' && docId === targetOwnerUid;
                  if (!isOwnReport && existingOwner !== targetOwnerUid && existingOwner !== caller.uid) {
                    res.status(403).json({ success: false, error: 'Tidak berwenang memperbarui dokumen pengguna lain.' });
                    return;
                  }
                }
              } else if (!rawPayload.ownerId) {
                rawPayload.ownerId = targetOwnerUid;
              }
            }
          }

          const translated = translateBridgeSentinels(rawPayload);
          if (opType === 'set') {
            if (item?.merge) {
              batch.set(docRef, translated, { merge: true });
            } else {
              batch.set(docRef, translated);
            }
          } else {
            batch.update(docRef, translated);
          }
        }

        await batch.commit();
        res.json({ success: true });
        return;
      } catch (sdkErr: any) {
        if (res.headersSent) return;
        const canTryWorkerRest = !(sdkErr instanceof ServerFirebaseConfigError);
        const fallbackRestToken =
          (canTryWorkerRest ? await getServerWorkerRestToken() : null) ||
          (await resolveCallerFirestoreRestToken(req, caller, targetOwnerUid));
        if (fallbackRestToken) {
          const restOutcome = await executeMutateViaRest(fallbackRestToken);
          if (restOutcome.status !== 200) {
            res.status(restOutcome.status).json({ success: false, error: restOutcome.error });
            return;
          }
          res.json({ success: true });
          return;
        }
        throw sdkErr;
      }
    } catch (err: any) {
      if (err instanceof ServerFirebaseConfigError) {
        res.status(err.statusCode).json({
          success: false,
          code: err.code,
          error: err.message,
        });
        return;
      }
      res.status(500).json({
        success: false,
        error: err?.message || 'Gagal menyimpan perubahan Firestore melalui server.',
      });
    }
  });

  // =========================================================================
  // Cloudflare R2 (S3-Compatible) Endpoints for Transaction Attachments
  // =========================================================================
  function getR2RuntimeConfig() {
    const endpoint = String(process.env.R2_ENDPOINT || '').trim().replace(/\/+$/, '');
    const bucket = String(process.env.R2_BUCKET_NAME || '').trim();
    const accessKeyId = String(process.env.R2_ACCESS_KEY_ID || '').trim();
    const secretAccessKey = String(process.env.R2_SECRET_ACCESS_KEY || '').trim();
    if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
      return null;
    }
    return { endpoint, bucket, accessKeyId, secretAccessKey };
  }

  let cachedR2Client: S3Client | null = null;
  let cachedR2Signature = '';
  function getR2Client() {
    const cfg = getR2RuntimeConfig();
    if (!cfg) return null;
    const sig = `${cfg.endpoint}|${cfg.accessKeyId}|${cfg.bucket}`;
    if (!cachedR2Client || cachedR2Signature !== sig) {
      cachedR2Client = new S3Client({
        region: 'auto',
        endpoint: cfg.endpoint,
        forcePathStyle: true,
        credentials: {
          accessKeyId: cfg.accessKeyId,
          secretAccessKey: cfg.secretAccessKey,
        },
      });
      cachedR2Signature = sig;
    }
    return { client: cachedR2Client, bucket: cfg.bucket };
  }

  async function verifyTransactionAttachmentCaller(
    req: Request
  ): Promise<{ ok: true; ownerUid: string } | { ok: false; status: number; error: string }> {
    const rawRequestedUid = String(
      req.headers['x-owner-uid'] || req.body?.ownerUid || req.query?.ownerUid || ''
    ).trim();
    const sanitizedRequestedUid = rawRequestedUid.replace(/[^a-zA-Z0-9_\-]/g, '_');
    const authRes = await verifyCallerAuth(req, sanitizedRequestedUid || undefined);
    if (!authRes.ok) {
      return authRes;
    }
    const finalOwnerUid = (sanitizedRequestedUid || authRes.uid || 'guest').replace(
      /[^a-zA-Z0-9_\-]/g,
      '_'
    );
    return { ok: true, ownerUid: finalOwnerUid };
  }

  function detectVerifiedUploadType(
    buf: Buffer
  ): { mimeType: string; ext: string } | null {
    if (!buf || buf.length < 4) return null;
    // PDF: %PDF-
    if (buf.length >= 5 && buf.subarray(0, 5).toString('ascii') === '%PDF-') {
      return { mimeType: 'application/pdf', ext: 'pdf' };
    }
    // JPEG: FF D8 FF
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
      return { mimeType: 'image/jpeg', ext: 'jpg' };
    }
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      buf.length >= 8 &&
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47 &&
      buf[4] === 0x0d &&
      buf[5] === 0x0a &&
      buf[6] === 0x1a &&
      buf[7] === 0x0a
    ) {
      return { mimeType: 'image/png', ext: 'png' };
    }
    // GIF: GIF87a / GIF89a
    const head6 = buf.subarray(0, 6).toString('ascii');
    if (head6 === 'GIF87a' || head6 === 'GIF89a') {
      return { mimeType: 'image/gif', ext: 'gif' };
    }
    // WEBP: RIFF....WEBP
    if (
      buf.length >= 12 &&
      buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buf.subarray(8, 12).toString('ascii') === 'WEBP'
    ) {
      return { mimeType: 'image/webp', ext: 'webp' };
    }
    // BMP: 42 4D
    if (buf[0] === 0x42 && buf[1] === 0x4d) {
      return { mimeType: 'image/bmp', ext: 'bmp' };
    }
    // HEIC / HEIF: ISO BMFF ftyp brand
    if (buf.length >= 12 && buf.subarray(4, 8).toString('ascii') === 'ftyp') {
      const brand = buf.subarray(8, 12).toString('ascii').toLowerCase();
      if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)) {
        return { mimeType: 'image/heic', ext: 'heic' };
      }
    }
    return null;
  }

  function sanitizeAttachmentDisplayName(rawName: string, fallbackExt: string): string {
    const base = path.basename(String(rawName || 'lampiran')).replace(/[\x00-\x1f\x7f<>:"/\\|?*]+/g, '_').trim();
    if (!base) return `lampiran.${fallbackExt}`;
    return base.slice(0, 120);
  }

  function isValidOwnedAttachmentKey(key: string, ownerUid: string): boolean {
    if (!key || key.length > 300) return false;
    if (key.includes('..') || key.includes('\\') || key.includes('\0') || key.startsWith('/')) {
      return false;
    }
    const baseName = key.slice(`receipts/${ownerUid}/`.length);
    if (!baseName || baseName.startsWith('_')) return false;
    return key.startsWith(`receipts/${ownerUid}/`) && /^receipts\/[a-zA-Z0-9_\-]+\/[a-zA-Z0-9_.\-]+$/.test(key);
  }

  const r2AttachmentUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 10 * 1024 * 1024, // 10 MB per file
      files: 10,
    },
  });

  app.post('/api/transactions/attachments/upload', (req: Request, res: Response) => {
    r2AttachmentUpload.array('files', 10)(req, res, async (multerErr: any) => {
      if (multerErr) {
        const msg =
          multerErr?.code === 'LIMIT_FILE_SIZE'
            ? 'Ukuran berkas melebihi batas maksimal 10 MB per file.'
            : multerErr?.code === 'LIMIT_FILE_COUNT'
              ? 'Maksimal 10 berkas dalam satu kali unggah.'
              : multerErr?.message || 'Gagal memproses unggahan berkas.';
        res.status(400).json({ success: false, error: msg });
        return;
      }

      const authResult = await verifyTransactionAttachmentCaller(req);
      if (!authResult.ok) {
        res.status(authResult.status).json({ success: false, error: authResult.error });
        return;
      }

      const r2 = getR2Client();
      if (!r2) {
        res.status(503).json({
          success: false,
          error: 'Konfigurasi Cloudflare R2 belum lengkap di server.',
        });
        return;
      }

      const files = (req.files as Express.Multer.File[]) || [];
      if (!Array.isArray(files) || files.length === 0) {
        res.status(400).json({ success: false, error: 'Tidak ada berkas yang dikirim.' });
        return;
      }

      const uploadedAttachments: Array<{
        id: string;
        key: string;
        name: string;
        mimeType: string;
        size: number;
        uploadedAt: string;
      }> = [];

      try {
        for (const file of files) {
          const verifiedType = detectVerifiedUploadType(file.buffer);
          if (!verifiedType) {
            res.status(400).json({
              success: false,
              error: `Format berkas "${file.originalname || 'file'}" tidak didukung. Gunakan file PDF atau gambar (JPG, PNG, WEBP, GIF, HEIC).`,
            });
            return;
          }

          const safeName = sanitizeAttachmentDisplayName(file.originalname, verifiedType.ext);
          const randomHex = crypto.randomBytes(6).toString('hex');
          const ts = Date.now();
          const objectKey = `receipts/${authResult.ownerUid}/${ts}_${randomHex}.${verifiedType.ext}`;

          await r2.client.send(
            new PutObjectCommand({
              Bucket: r2.bucket,
              Key: objectKey,
              Body: file.buffer,
              ContentType: verifiedType.mimeType,
              Metadata: {
                owneruid: authResult.ownerUid,
              },
            })
          );

          uploadedAttachments.push({
            id: `att_${ts}_${crypto.randomBytes(4).toString('hex')}`,
            key: objectKey,
            name: safeName,
            mimeType: verifiedType.mimeType,
            size: Number(file.size || file.buffer.length || 0),
            uploadedAt: nowIso(),
          });
        }

        res.json({
          success: true,
          attachments: uploadedAttachments,
        });
      } catch (err: any) {
        console.error('[R2 Upload Error]', err?.message || err);
        res.status(500).json({
          success: false,
          error: 'Gagal menyimpan berkas ke penyimpanan cloud. Silakan coba lagi.',
        });
      }
    });
  });

  app.get('/api/transactions/attachments/file', async (req: Request, res: Response) => {
    const authResult = await verifyTransactionAttachmentCaller(req);
    if (!authResult.ok) {
      res.status(authResult.status).json({ success: false, error: authResult.error });
      return;
    }

    const r2 = getR2Client();
    if (!r2) {
      res.status(503).json({
        success: false,
        error: 'Konfigurasi Cloudflare R2 belum lengkap di server.',
      });
      return;
    }

    const key = String(req.query.key || '').trim();
    if (!isValidOwnedAttachmentKey(key, authResult.ownerUid)) {
      res.status(403).json({ success: false, error: 'Key berkas tidak valid atau bukan milik Anda.' });
      return;
    }

    const disposition = req.query.disposition === 'attachment' ? 'attachment' : 'inline';
    const fallbackName = path.basename(key);
    const requestedName = sanitizeAttachmentDisplayName(
      String(req.query.name || fallbackName),
      path.extname(key).replace('.', '') || 'bin'
    );
    const asciiSafeName = requestedName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');

    try {
      const obj = await r2.client.send(
        new GetObjectCommand({
          Bucket: r2.bucket,
          Key: key,
        })
      );

      if (!obj.Body) {
        res.status(404).json({ success: false, error: 'Berkas tidak ditemukan.' });
        return;
      }

      const bytes = await obj.Body.transformToByteArray();
      const contentType = obj.ContentType || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.setHeader(
        'Content-Disposition',
        `${disposition}; filename="${asciiSafeName}"; filename*=UTF-8''${encodeURIComponent(requestedName)}`
      );
      res.send(Buffer.from(bytes));
    } catch (err: any) {
      if (err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404) {
        res.status(404).json({ success: false, error: 'Berkas tidak ditemukan di penyimpanan cloud.' });
        return;
      }
      console.error('[R2 Get File Error]', err?.message || err);
      res.status(500).json({ success: false, error: 'Gagal memuat berkas dari penyimpanan cloud.' });
    }
  });

  app.delete('/api/transactions/attachments/file', async (req: Request, res: Response) => {
    const authResult = await verifyTransactionAttachmentCaller(req);
    if (!authResult.ok) {
      res.status(authResult.status).json({ success: false, error: authResult.error });
      return;
    }

    const r2 = getR2Client();
    if (!r2) {
      res.status(503).json({
        success: false,
        error: 'Konfigurasi Cloudflare R2 belum lengkap di server.',
      });
      return;
    }

    const key = String(req.body?.key || req.query?.key || '').trim();
    if (!isValidOwnedAttachmentKey(key, authResult.ownerUid)) {
      res.status(403).json({ success: false, error: 'Key berkas tidak valid atau bukan milik Anda.' });
      return;
    }

    try {
      await r2.client.send(
        new DeleteObjectCommand({
          Bucket: r2.bucket,
          Key: key,
        })
      );
      res.json({ success: true });
    } catch (err: any) {
      console.error('[R2 Delete Error]', err?.message || err);
      res.status(500).json({ success: false, error: 'Gagal menghapus berkas dari penyimpanan cloud.' });
    }
  });

  app.get('/api/transactions/attachments/index', async (req: Request, res: Response) => {
    const authResult = await verifyTransactionAttachmentCaller(req);
    if (!authResult.ok) {
      res.status(authResult.status).json({ success: false, error: authResult.error });
      return;
    }
    const r2 = getR2Client();
    if (!r2) {
      res.json({ success: true, index: {} });
      return;
    }
    const indexKey = `receipts/${authResult.ownerUid}/_tx_index.json`;
    try {
      const obj = await r2.client.send(new GetObjectCommand({ Bucket: r2.bucket, Key: indexKey }));
      const raw = obj.Body ? await obj.Body.transformToString() : '{}';
      const parsed = JSON.parse(raw || '{}');
      res.json({ success: true, index: parsed && typeof parsed === 'object' ? parsed : {} });
    } catch (err: any) {
      if (err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404) {
        res.json({ success: true, index: {} });
        return;
      }
      res.json({ success: true, index: {} });
    }
  });

  app.put('/api/transactions/attachments/index', async (req: Request, res: Response) => {
    const authResult = await verifyTransactionAttachmentCaller(req);
    if (!authResult.ok) {
      res.status(authResult.status).json({ success: false, error: authResult.error });
      return;
    }
    const r2 = getR2Client();
    if (!r2) {
      res.status(503).json({ success: false, error: 'Konfigurasi Cloudflare R2 belum lengkap di server.' });
      return;
    }
    const txId = String(req.body?.txId || '').trim().replace(/[^a-zA-Z0-9_\-]/g, '');
    if (!txId || txId.length > 128) {
      res.status(400).json({ success: false, error: 'ID transaksi tidak valid.' });
      return;
    }
    const rawList = Array.isArray(req.body?.attachments) ? req.body.attachments.slice(0, 10) : [];
    const safeList = rawList.filter(
      (item: any) =>
        item &&
        typeof item.id === 'string' &&
        typeof item.key === 'string' &&
        isValidOwnedAttachmentKey(item.key, authResult.ownerUid) &&
        typeof item.name === 'string' &&
        typeof item.mimeType === 'string'
    );

    const indexKey = `receipts/${authResult.ownerUid}/_tx_index.json`;
    let currentMap: Record<string, any[]> = {};
    try {
      const existingObj = await r2.client.send(new GetObjectCommand({ Bucket: r2.bucket, Key: indexKey }));
      const raw = existingObj.Body ? await existingObj.Body.transformToString() : '{}';
      const parsed = JSON.parse(raw || '{}');
      if (parsed && typeof parsed === 'object') currentMap = parsed;
    } catch {
      currentMap = {};
    }

    if (safeList.length > 0) {
      currentMap[txId] = safeList;
    } else {
      delete currentMap[txId];
    }

    try {
      await r2.client.send(
        new PutObjectCommand({
          Bucket: r2.bucket,
          Key: indexKey,
          Body: JSON.stringify(currentMap),
          ContentType: 'application/json',
        })
      );
      res.json({ success: true });
    } catch (err: any) {
      console.error('[R2 Index Save Error]', err?.message || err);
      res.status(500).json({ success: false, error: 'Gagal memperbarui indeks lampiran.' });
    }
  });

  // Ensure unmatched /api/* requests always return JSON instead of falling through to SPA HTML (200)
  app.all('/api/*', (req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: `Endpoint API tidak ditemukan: ${req.method} ${req.path}`,
    });
  });

  // =========================================================================
  // Vite Middleware (Development) or Static Dist (Production)
  // =========================================================================
  const distPath = path.join(__dirname, 'dist');
  const distIndexExists = fs.existsSync(path.join(distPath, 'index.html'));
  const isExplicitDev = process.env.NODE_ENV === 'development' || process.env.npm_lifecycle_event === 'dev';
  const isProduction = process.env.NODE_ENV === 'production' || (!isExplicitDev && distIndexExists);

  if (!isProduction) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : {
          server: httpServer,
        },
      },
      appType: 'spa',
    });

    // Prevent @vite/client from throwing "WebSocket closed without opened" in preview environments where HMR WebSockets are disabled
    app.use(async (req: Request, res: Response, next: NextFunction) => {
      if (req.path === '/@vite/client') {
        try {
          const transformed = await vite.transformRequest(req.url);
          if (transformed?.code) {
            const safeClientCode = transformed.code
              .replace(
                'const createWebSocketModuleRunnerTransport = (options) => {',
                'const createWebSocketModuleRunnerTransport = (_options) => ({ async connect() {}, disconnect() {}, send() {} }); const __unusedWebSocketTransport = (options) => {'
              )
              .replace(
                /new Error\("WebSocket closed without opened\."\)/g,
                'null'
              );
            res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
            res.status(200).send(safeClientCode);
            return;
          }
        } catch {
          // Fallback to default vite middleware
        }
      }
      next();
    });

    // Pre-rendering middleware for public and legal pages in development
    app.use(async (req: Request, res: Response, next: NextFunction) => {
      if (req.method !== 'GET') return next();
      const url = req.path;
      // Do not intercept static assets, api endpoints, or vite internal files
      if (url.startsWith('/api/') || url.startsWith('/@') || url.includes('.')) {
        return next();
      }

      const prerenderData = getPrerenderDataForPath(url);
      if (prerenderData) {
        try {
          const templatePath = path.join(__dirname, 'index.html');
          const rawTemplate = fs.readFileSync(templatePath, 'utf8');
          const transformedTemplate = await vite.transformIndexHtml(req.originalUrl, rawTemplate);
          const fullHtml = injectPrerenderedHtml(transformedTemplate, prerenderData);
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.status(200).send(fullHtml);
          return;
        } catch {
          // Fallback to default vite middleware
        }
      }
      next();
    });

    app.use(vite.middlewares);
  } else {
    // 1. Guaranteed Pre-rendered Pages Handler (Public & Legal Pages)
    // Registered BEFORE express.static to prevent serving raw unrendered SPA shell index.html
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== 'GET') return next();

      const urlPath = req.path;
      // Do not intercept static assets, api endpoints, or files with extensions
      if (urlPath.startsWith('/api/') || urlPath.startsWith('/assets/') || urlPath.includes('.')) {
        return next();
      }

      const prerenderData = getPrerenderDataForPath(urlPath);
      if (!prerenderData) {
        return next();
      }

      const cleanPath = urlPath.split('?')[0].split('#')[0].replace(/\/$/, '') || '/';
      const isRoot = cleanPath === '/' || cleanPath === '/landing';
      const targetHtmlPath = isRoot
        ? path.join(distPath, 'index.html')
        : path.join(distPath, cleanPath.replace(/^\//, ''), 'index.html');

      if (fs.existsSync(targetHtmlPath)) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
        res.sendFile(targetHtmlPath);
        return;
      }

      next();
    });

    // 2. Serve static assets (js, css, images, icons, manifest)
    // Use index: false so express.static does not automatically send un-injected index.html for directory routes
    app.use(
      express.static(distPath, {
        index: false,
        setHeaders(res, filePath) {
          const base = path.basename(filePath);
          if (
            base === 'app-shell.html' ||
            base === 'sw.js' ||
            base === 'registerSW.js' ||
            base === 'manifest.webmanifest'
          ) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
          }
        },
      })
    );

    // 3. Fallback for SPA routes (/dashboard, /auth, /wallets, /transactions, /budgets, etc.)
    app.get('*', (_req: Request, res: Response) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
      const spaShell = path.join(distPath, 'app-shell.html');
      if (fs.existsSync(spaShell)) {
        res.sendFile(spaShell);
        return;
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(
      `Sisa Uang server running on http://0.0.0.0:${PORT} (mode: ${isProduction ? 'production' : 'development'})`
    );
    void (async () => {
      try {
        await ensureServerFirebaseSignedIn();
        console.log(
          `[Firestore Worker] Connected to project "${firebaseServerConfig.projectId}" database "${firebaseServerConfig.firestoreDatabaseId}".`
        );
      } catch (err: any) {
        console.warn(
          `[Firestore Worker Notice] ${err?.message || 'Server Firebase worker not ready yet.'}`
        );
      }
    })();
  });
}

startServer();
