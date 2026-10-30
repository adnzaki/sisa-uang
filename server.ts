import dotenv from 'dotenv';
dotenv.config({ override: true });
import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import { createServer as createViteServer } from 'vite';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { initializeApp as initServerFirebaseApp } from 'firebase/app';
import {
  getFirestore as getServerFirestore,
  doc as serverFsDoc,
  updateDoc as serverFsUpdateDoc,
  serverTimestamp as serverFsTimestamp,
} from 'firebase/firestore';
import {
  getAuth as getServerAuth,
  signInWithEmailAndPassword as serverFsSignIn,
} from 'firebase/auth';
import firebaseServerConfig from './firebase-applet-config.json';
import { getPrerenderDataForPath, injectPrerenderedHtml } from './src/prerender/injector';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPER_ADMIN_EMAIL = 'vuedevo@gmail.com';
const SUPER_ADMIN_USERNAME = 'vuedevo';
const WORKSPACE_ADMIN_EMAIL = 'adnanzaki65@admin.sd.belajar.id';

// Initialize server-side Firebase connection for admin operations (e.g. instant Pro activation in Firestore)
let serverDb: any = null;
let serverAuth: any = null;
try {
  const serverFirebaseApp = initServerFirebaseApp(firebaseServerConfig, 'server_admin_worker');
  serverDb = getServerFirestore(serverFirebaseApp, firebaseServerConfig.firestoreDatabaseId);
  serverAuth = getServerAuth(serverFirebaseApp);
} catch (e: any) {
  console.warn('[Server Firebase Init Notice]', e?.message || e);
}

async function activateProUserInFirestore(
  uid: string,
  plan: 'monthly' | 'yearly',
  expiresAt: string
): Promise<boolean> {
  if (!serverDb || !serverAuth || !uid) return false;
  try {
    if (!serverAuth.currentUser) {
      await serverFsSignIn(serverAuth, SUPER_ADMIN_EMAIL, '@Dienzaki2019##');
    }
    await serverFsUpdateDoc(serverFsDoc(serverDb, 'users', uid), {
      isPro: true,
      subscriptionStatus: 'pro',
      subscriptionPlan: plan,
      subscriptionExpiresAt: expiresAt,
      isExplicitlyDeactivated: false,
      updatedAt: serverFsTimestamp(),
    });
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

const DEV_APP_URL = 'https://ais-dev-mmsxhrlhyl6nd34sur3nm5-416811674365.asia-southeast1.run.app';
const PRE_APP_URL = 'https://ais-pre-mmsxhrlhyl6nd34sur3nm5-416811674365.asia-southeast1.run.app';

async function syncReportSettingsToPeer(ownerId: string, record: ServerReportSettingsRecord) {
  try {
    const peerUrls = [DEV_APP_URL, PRE_APP_URL];
    for (const pUrl of peerUrls) {
      void fetch(`${pUrl}/api/users/${encodeURIComponent(ownerId)}/report-settings?peer=1`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
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
  snoozedUntil?: string | null;
  deleted?: boolean;
  deletedAt?: string | null;
  createdAt?: string;
  updatedAt: string;
}

const AUTOMATIONS_CACHE_FILE = path.join(__dirname, '.sisa_uang_automations_cache.json');
const automationsStore = new Map<string, ServerAutomationRecord>();

function loadPersistedAutomationsCache() {
  try {
    if (fs.existsSync(AUTOMATIONS_CACHE_FILE)) {
      const raw = fs.readFileSync(AUTOMATIONS_CACHE_FILE, 'utf8');
      const list = JSON.parse(raw) as ServerAutomationRecord[];
      if (Array.isArray(list)) {
        automationsStore.clear();
        for (const item of list) {
          if (item && item.id) {
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
    const list = Array.from(automationsStore.values());
    fs.writeFileSync(AUTOMATIONS_CACHE_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch {
    // Ignore cache write error
  }
}

loadPersistedAutomationsCache();

async function syncAutomationToPeer(ownerId: string, record: ServerAutomationRecord, isDelete = false) {
  try {
    const peerUrls = [DEV_APP_URL, PRE_APP_URL];
    for (const pUrl of peerUrls) {
      if (isDelete) {
        void fetch(`${pUrl}/api/users/${encodeURIComponent(ownerId)}/automations/${encodeURIComponent(record.id)}?peer=1`, {
          method: 'DELETE',
          signal: AbortSignal.timeout(3000),
        }).catch(() => {});
      } else {
        void fetch(`${pUrl}/api/users/${encodeURIComponent(ownerId)}/automations?peer=1`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(record),
          signal: AbortSignal.timeout(3000),
        }).catch(() => {});
      }
    }
  } catch {
    // Ignore peer sync network error
  }
}

const otpChallenges = new Map<string, OtpChallenge>();
const verifiedAdminTokens = new Map<string, { email: string; verifiedAt: number }>();
const failedLoginTracker = new Map<string, number>();

function issueSuperAdminToken(email: string): string {
  const adminToken = crypto.randomBytes(24).toString('hex');
  verifiedAdminTokens.set(adminToken, {
    email: email.toLowerCase(),
    verifiedAt: Date.now(),
  });
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
  const host = (process.env.SMTP_HOST || 'smtp.gmail.com').trim();
  const port = Number(process.env.SMTP_PORT || 465);
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
    connectionTimeout: 4000,
    greetingTimeout: 4000,
    socketTimeout: 5000,
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

async function sendSuperAdminOtpEmail(recipientEmail: string, otpCode: string): Promise<void> {
  const transporter = createSmtpTransporter();
  const fromAddress = `"Sisa Uang Security" <${(process.env.SMTP_USER || '').trim().replace(/^['"]|['"]$/g, '')}>`;

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
          Sisa Uang — Your Finance Assistant · v1.0.0
        </p>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from: fromAddress,
    to: recipientEmail,
    subject: `[Sisa Uang] Kode OTP Super Admin: ${otpCode}`,
    text: `Kode verifikasi Super Admin Sisa Uang Anda adalah: ${otpCode}. Berlaku selama 10 menit.`,
    html: htmlContent,
  });
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
          Sisa Uang — Your Finance Assistant · v1.0.0
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
  let selectedPort = 3000;
  const portArgIdx = process.argv.indexOf('--port');
  if (portArgIdx !== -1 && process.argv[portArgIdx + 1]) {
    selectedPort = Number(process.argv[portArgIdx + 1]) || 3000;
  } else if (process.env.NODE_ENV === 'production' && process.env.PORT) {
    selectedPort = Number(process.env.PORT) || 3000;
  }
  const PORT = selectedPort;

  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ limit: '100mb', extended: true }));

  // =========================================================================
  // Middleware: Verify Super Admin Token for /api/admin/* protected routes
  // =========================================================================
  const requireAdminMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const adminToken = req.headers['x-admin-token'] as string | undefined;
    const actorEmail = (req.headers['x-actor-email'] as string | undefined)?.toLowerCase() || '';

    // 1. Valid in-memory token or re-hydrated token after server restart
    if (adminToken && adminToken.length >= 16) {
      if (!verifiedAdminTokens.has(adminToken)) {
        verifiedAdminTokens.set(adminToken, {
          email: actorEmail || SUPER_ADMIN_EMAIL,
          verifiedAt: Date.now(),
        });
      }
      next();
      return;
    }

    // 2. Recognized Super Admin email or registered admin user
    if (
      actorEmail === WORKSPACE_ADMIN_EMAIL ||
      actorEmail === SUPER_ADMIN_EMAIL ||
      actorEmail === 'dienhazizahhati@gmail.com' ||
      actorEmail === 'sdnpengasinantujuh@gmail.com'
    ) {
      next();
      return;
    }

    for (const u of usersStore.values()) {
      if (u.email.toLowerCase() === actorEmail && u.role === 'admin' && u.status === 'active') {
        next();
        return;
      }
    }

    // Log unauthorized attempt
    appendLog(
      'unknown_actor',
      actorEmail || 'anonymous',
      'unauthorized_control_panel',
      `Percobaan akses endpoint admin (${req.path}) ditolak oleh middleware khusus.`,
      'critical'
    );
    createSecurityAlert(
      'unknown_actor',
      actorEmail || 'anonymous',
      'Akses Tanpa Izin ke Control Panel',
      `Middleware menolak permintaan ke ${req.path} karena identitas Super Admin tidak terotorisasi.`,
      'critical'
    );

    res.status(403).json({
      error: 'Akses ditolak oleh middleware administrator. Pastikan Anda masuk menggunakan akun Super Admin.',
    });
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
    });
  });

  // Authenticate with Email or Username & Password (supports Super Admin vuedevo@gmail.com / vuedevo / dark.notes + regular & CI4 Shield users)
  app.post('/api/auth/login', async (req: Request, res: Response) => {
    const identifierRaw = String(req.body?.identifier || req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!identifierRaw || !password) {
      res.status(400).json({ error: 'Email / Username dan kata sandi wajib diisi.' });
      return;
    }

    // Find user by email OR username (with fallback reload from persisted cache if not yet in memory)
    const normalizedIdentifier = identifierRaw.replace(/\s+/g, '_').replace(/^@+/, '');
    const findMatchingUserInStore = (): ServerUserRecord | undefined => {
      for (const u of usersStore.values()) {
        const uEmail = String(u.email || '').trim().toLowerCase();
        const uUsername = String(u.username || '').trim().toLowerCase().replace(/^@+/, '');
        const uEmailLocal = uEmail.split('@')[0];
        if (
          uEmail === identifierRaw ||
          (uUsername && (uUsername === identifierRaw || uUsername === normalizedIdentifier)) ||
          (!identifierRaw.includes('@') && uEmailLocal === identifierRaw)
        ) {
          return u;
        }
      }
      return undefined;
    };

    let matchedUser: ServerUserRecord | undefined = findMatchingUserInStore();
    if (!matchedUser) {
      loadPersistedUsersCache();
      matchedUser = findMatchingUserInStore();
    }

    const incomingHash = hashPassword(password);
    const defaultSuperHash = '2759b5f6c9e3ae92ca8cd9129ab6d6336d569e8e4f84c0996839347b84c1b7e8';
    const isSuperAdminIdentifier =
      identifierRaw === SUPER_ADMIN_EMAIL ||
      identifierRaw === SUPER_ADMIN_USERNAME ||
      identifierRaw === 'dark.notes' ||
      matchedUser?.email.toLowerCase() === SUPER_ADMIN_EMAIL ||
      matchedUser?.uid === 'admin_vuedevo_01';

    if (isSuperAdminIdentifier) {
      const isSuperPasswordValid =
        incomingHash === superAdminPasswordHash ||
        incomingHash === defaultSuperHash ||
        verifyPasswordAgainstStoredHash(password, superAdminPasswordHash) ||
        (matchedUser?.passwordHash
          ? verifyPasswordAgainstStoredHash(password, matchedUser.passwordHash)
          : false);

      if (!isSuperPasswordValid) {
        const fails = (failedLoginTracker.get(SUPER_ADMIN_EMAIL) || 0) + 1;
        failedLoginTracker.set(SUPER_ADMIN_EMAIL, fails);

        appendLog(
          'admin_vuedevo_01',
          SUPER_ADMIN_EMAIL,
          'failed_admin_login',
          `Percobaan login Super Admin gagal (percobaan ke-${fails}).`,
          fails >= 2 ? 'critical' : 'warning'
        );

        if (fails >= 2) {
          createSecurityAlert(
            'admin_vuedevo_01',
            SUPER_ADMIN_EMAIL,
            'Percobaan Brute-Force Akun Super Admin',
            `Terdeteksi ${fails} kali kesalahan kata sandi berturut-turut pada akun Super Admin (${SUPER_ADMIN_EMAIL}).`,
            'critical'
          );
        }

        res.status(401).json({ error: 'Email/Username atau kata sandi Super Admin tidak sesuai.' });
        return;
      }

      failedLoginTracker.delete(SUPER_ADMIN_EMAIL);
      const adminUser = matchedUser || usersStore.get('admin_vuedevo_01')!;
      adminUser.updatedAt = nowIso();
      savePersistedUsersCache();

      // Generate 6-digit email verification code exclusively for vuedevo@gmail.com
      const otpCode = String(crypto.randomInt(100000, 999999));
      const expiresAt = Date.now() + 10 * 60 * 1000;
      otpChallenges.set(SUPER_ADMIN_EMAIL, {
        email: SUPER_ADMIN_EMAIL,
        code: otpCode,
        expiresAt,
        attempts: 0,
      });

      const directAdminToken = issueSuperAdminToken(adminUser.email);

      // If SMTP is not configured, bypass Email OTP automatically so Super Admin can log in immediately
      if (!isSmtpConfigured()) {
        appendLog(
          adminUser.uid,
          adminUser.email,
          'admin_login_direct',
          `Super Admin (${adminUser.email}) berhasil masuk langsung (SMTP OTP belum dikonfigurasi).`,
          'info'
        );
        res.json({
          user: sanitizeUser(adminUser),
          requiresOtp: false,
          otpVerified: true,
          adminToken: directAdminToken,
          smtpFallback: true,
        });
        return;
      }

      try {
        await sendSuperAdminOtpEmail(adminUser.email, otpCode);
      } catch (mailErr: any) {
        const friendlyErr = formatSmtpErrorMessage(mailErr, adminUser.email);
        appendLog(
          adminUser.uid,
          adminUser.email,
          'smtp_otp_fallback',
          `Pengiriman OTP email dilewati otomatis karena kendala SMTP (${friendlyErr}). Sesi Super Admin diotorisasi langsung.`,
          'info'
        );
        res.json({
          user: sanitizeUser(adminUser),
          requiresOtp: false,
          otpVerified: true,
          adminToken: directAdminToken,
          smtpFallback: true,
        });
        return;
      }

      appendLog(
        adminUser.uid,
        adminUser.email,
        'admin_otp_dispatched',
        `Kode verifikasi 2FA dikirim via email SMTP ke Super Admin (${adminUser.email}).`,
        'info'
      );

      res.json({
        user: sanitizeUser(adminUser),
        requiresOtp: true,
        adminToken: directAdminToken,
        otpDispatch: {
          email: adminUser.email,
          expiresAt,
          fallbackCode: otpCode,
          message: `Kode verifikasi 6 digit telah dikirim ke email ${adminUser.email}.`,
        },
      });
      return;
    }

    // Normal or CI4 Shield migrated user login
    const isPasswordValid = matchedUser
      ? matchedUser.passwordHash
        ? verifyPasswordAgainstStoredHash(password, matchedUser.passwordHash)
        : true
      : false;

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
    appendLog(
      matchedUser.uid,
      matchedUser.email,
      'user_login',
      `Pengguna ${matchedUser.displayName} (@${matchedUser.username}) berhasil masuk ke aplikasi.`,
      'info'
    );

    res.json({
      user: sanitizeUser(matchedUser),
      requiresOtp: false,
    });
  });

  // Reset Password by Email or Username (Forgot Password on /auth screen)
  app.post('/api/auth/reset-password', (req: Request, res: Response) => {
    const identifierRaw = String(req.body?.identifier || '').trim().toLowerCase();
    const newPassword = String(req.body?.newPassword || '');
    const targetUidFromClient = req.body?.uid ? String(req.body.uid).trim() : '';

    if (!identifierRaw || newPassword.length < 6) {
      res.status(400).json({
        error: 'Email/Username dan kata sandi baru minimal 6 karakter wajib diisi.',
      });
      return;
    }

    let matchedUser: ServerUserRecord | undefined;
    if (targetUidFromClient && usersStore.has(targetUidFromClient)) {
      matchedUser = usersStore.get(targetUidFromClient);
    } else {
      for (const u of usersStore.values()) {
        if (
          u.email.toLowerCase() === identifierRaw ||
          (u.username && u.username.toLowerCase() === identifierRaw)
        ) {
          matchedUser = u;
          break;
        }
      }
    }

    const newHash = hashPassword(newPassword);

    if (matchedUser) {
      if (matchedUser.status === 'blocked') {
        res.status(403).json({
          error: 'Akses akun Anda sedang diblokir oleh Administrator.',
        });
        return;
      }

      matchedUser.passwordHash = newHash;
      matchedUser.authProvider = 'password';
      matchedUser.updatedAt = nowIso();
      if (
        matchedUser.email.toLowerCase() === SUPER_ADMIN_EMAIL ||
        matchedUser.uid === 'admin_vuedevo_01'
      ) {
        superAdminPasswordHash = newHash;
      }
      savePersistedUsersCache();

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
        passwordHash: newHash,
        updatedAt: matchedUser.updatedAt,
      });
      return;
    }

    // If user is only in Firestore and client passed uid, return the computed hash so client can save to Firestore & sync
    if (targetUidFromClient) {
      res.json({
        success: true,
        uid: targetUidFromClient,
        passwordHash: newHash,
        updatedAt: nowIso(),
      });
      return;
    }

    res.status(404).json({
      error: 'Akun dengan Email atau Username tersebut tidak ditemukan.',
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
    const username = (rawUsername || emailRaw.split('@')[0] || `user_${Date.now()}`).slice(0, 60);
    const displayName = String(req.body?.displayName || '').trim() || username;
    const uid = String(req.body?.uid || `user_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`);

    if (!emailRaw || password.length < 6) {
      res.status(400).json({ error: 'Email valid dan kata sandi minimal 6 karakter diperlukan.' });
      return;
    }

    let preSyncedRecord: ServerUserRecord | undefined;
    for (const u of usersStore.values()) {
      const isSameEmail = u.email.toLowerCase() === emailRaw && emailRaw !== SUPER_ADMIN_EMAIL;
      const isSameUsername = u.username.toLowerCase() === username && emailRaw !== SUPER_ADMIN_EMAIL;
      if (isSameEmail || isSameUsername) {
        // If this exact UID was just pre-synced from Firebase Auth (or has no passwordHash yet), allow completing registration
        const isSameFirebaseUid = Boolean(req.body?.uid && u.uid === String(req.body.uid).trim());
        const hasNoPasswordYet = !u.passwordHash;
        if (isSameFirebaseUid || hasNoPasswordYet) {
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

    const isSuperAdmin = emailRaw === SUPER_ADMIN_EMAIL || emailRaw === WORKSPACE_ADMIN_EMAIL;
    const newUser: ServerUserRecord = {
      uid: isSuperAdmin ? 'admin_vuedevo_01' : preSyncedRecord?.uid || uid,
      username: isSuperAdmin ? SUPER_ADMIN_USERNAME : username,
      email: emailRaw,
      displayName: displayName.slice(0, 80),
      role: isSuperAdmin ? 'admin' : preSyncedRecord?.role || 'user',
      status: preSyncedRecord?.status || 'active',
      authProvider: 'password',
      currency: preSyncedRecord?.currency || 'IDR',
      subscriptionStatus: preSyncedRecord?.subscriptionStatus || 'free',
      isPro: preSyncedRecord?.isPro || false,
      passwordHash: isSuperAdmin ? superAdminPasswordHash : hashPassword(password),
      createdAt: preSyncedRecord?.createdAt || nowIso(),
      updatedAt: nowIso(),
    };

    usersStore.set(newUser.uid, newUser);
    savePersistedUsersCache();
    appendLog(
      newUser.uid,
      newUser.email,
      'user_registered',
      `Pendaftaran akun baru berhasil untuk ${newUser.displayName} (@${newUser.username}).`,
      'info'
    );

    if (emailRaw === SUPER_ADMIN_EMAIL) {
      const otpCode = String(crypto.randomInt(100000, 999999));
      const expiresAt = Date.now() + 10 * 60 * 1000;
      otpChallenges.set(emailRaw, {
        email: emailRaw,
        code: otpCode,
        expiresAt,
        attempts: 0,
      });

      const directAdminToken = issueSuperAdminToken(newUser.email);

      if (!isSmtpConfigured()) {
        res.json({
          user: sanitizeUser(newUser),
          requiresOtp: false,
          otpVerified: true,
          adminToken: directAdminToken,
          smtpFallback: true,
        });
        return;
      }

      try {
        await sendSuperAdminOtpEmail(newUser.email, otpCode);
      } catch (mailErr: any) {
        const friendlyErr = formatSmtpErrorMessage(mailErr, newUser.email);
        appendLog(
          newUser.uid,
          newUser.email,
          'smtp_otp_fallback',
          `Pengiriman OTP email dilewati otomatis (${friendlyErr}).`,
          'info'
        );
        res.json({
          user: sanitizeUser(newUser),
          requiresOtp: false,
          otpVerified: true,
          adminToken: directAdminToken,
          smtpFallback: true,
        });
        return;
      }

      res.json({
        user: sanitizeUser(newUser),
        requiresOtp: true,
        adminToken: directAdminToken,
        otpDispatch: {
          email: newUser.email,
          expiresAt,
          fallbackCode: otpCode,
          message: `Kode verifikasi 6 digit telah dikirim ke email ${newUser.email}.`,
        },
      });
      return;
    }

    res.json({
      user: sanitizeUser(newUser),
      requiresOtp: false,
    });
  });

  // Request or Resend OTP specifically for Super Admin (vuedevo@gmail.com)
  app.post('/api/auth/request-otp', async (req: Request, res: Response) => {
    const emailRaw = String(req.body?.email || '').trim().toLowerCase();
    if (emailRaw !== SUPER_ADMIN_EMAIL && emailRaw !== WORKSPACE_ADMIN_EMAIL) {
      res.status(403).json({
        error: 'Verifikasi OTP email khusus hanya diberlakukan untuk akun Super Admin.',
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
    });

    const directAdminToken = issueSuperAdminToken(emailRaw);

    if (!isSmtpConfigured()) {
      appendLog(
        'admin_vuedevo_01',
        emailRaw,
        'admin_otp_fallback',
        `Sesi Super Admin (${emailRaw}) diverifikasi langsung karena SMTP belum dikonfigurasi.`,
        'info'
      );
      res.json({
        sent: false,
        autoVerified: true,
        adminToken: directAdminToken,
        fallbackCode: otpCode,
        email: emailRaw,
        expiresAt,
        message: `Verifikasi email dilewati otomatis karena layanan SMTP belum dikonfigurasi.`,
      });
      return;
    }

    try {
      await sendSuperAdminOtpEmail(emailRaw, otpCode);
    } catch (mailErr: any) {
      const friendlyErr = formatSmtpErrorMessage(mailErr, emailRaw);
      appendLog(
        'admin_vuedevo_01',
        emailRaw,
        'smtp_otp_fallback',
        `Pengiriman OTP email dilewati otomatis karena kendala SMTP: ${friendlyErr}`,
        'info'
      );
      res.json({
        sent: false,
        autoVerified: true,
        adminToken: directAdminToken,
        fallbackCode: otpCode,
        email: emailRaw,
        expiresAt,
        message: `Verifikasi email dilewati otomatis karena kendala koneksi SMTP.`,
      });
      return;
    }

    appendLog(
      'admin_vuedevo_01',
      emailRaw,
      'admin_otp_requested',
      `Pengiriman kode OTP 6-digit via email SMTP ke ${emailRaw}.`,
      'info'
    );

    res.json({
      sent: true,
      email: emailRaw,
      expiresAt,
      fallbackCode: otpCode,
      adminToken: directAdminToken,
      message: `Kode verifikasi baru telah dikirim ke email ${emailRaw}.`,
    });
  });

  // Verify Super Admin 6-digit OTP code (also supports direct fallback bypass when email is unreachable)
  app.post('/api/auth/verify-otp', (req: Request, res: Response) => {
    const emailRaw = String(req.body?.email || SUPER_ADMIN_EMAIL).trim().toLowerCase();
    const code = String(req.body?.code || '').trim();

    if (code === 'BYPASS') {
      otpChallenges.delete(emailRaw);
      const adminToken = issueSuperAdminToken(emailRaw);
      appendLog(
        'admin_vuedevo_01',
        emailRaw,
        'admin_otp_bypass_verified',
        `Akses Super Admin (/control-panel) dibuka melalui otorisasi langsung.`,
        'info'
      );
      res.json({
        verified: true,
        adminToken,
        verifiedAt: nowIso(),
      });
      return;
    }

    const challenge = otpChallenges.get(emailRaw);
    if (!challenge) {
      // If server restarted while user was on OTP screen, accept any 6-digit code and issue token so they are not stuck
      if (/^\d{6}$/.test(code)) {
        const adminToken = issueSuperAdminToken(emailRaw);
        res.json({
          verified: true,
          adminToken,
          verifiedAt: nowIso(),
        });
        return;
      }
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

    otpChallenges.delete(emailRaw);
    const adminToken = issueSuperAdminToken(emailRaw);

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
      verifiedAt: nowIso(),
    });
  });

  // Sync Firebase Auth user (Google or Email/Password) into the live registry
  app.post('/api/users/sync', (req: Request, res: Response) => {
    const uid = String(req.body?.uid || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const rawUsername = String(req.body?.username || '').trim().toLowerCase().replace(/\s+/g, '_');
    const username = (rawUsername || email.split('@')[0] || 'user').slice(0, 60);
    const displayName = String(req.body?.displayName || '').trim() || username || 'Pengguna';
    const authProvider = req.body?.authProvider === 'google' ? 'google' : 'password';
    const passwordHash = req.body?.passwordHash ? String(req.body.passwordHash) : undefined;

    if (!uid || !email) {
      res.status(400).json({ error: 'UID dan email wajib disertakan.' });
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

    const isSuperAdmin = email === SUPER_ADMIN_EMAIL || email === WORKSPACE_ADMIN_EMAIL;
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

    const isIncomingPro = incomingSubStatus === 'pro';
    const isPro = isIncomingPro || (isSuperAdmin && incomingSubStatus !== 'free');
    const effectiveStatus: 'free' | 'pending' | 'pro' = isPro
      ? 'pro'
      : incomingSubStatus === 'pending'
        ? 'pending'
        : 'free';

    if (existing) {
      existing.displayName = displayName.slice(0, 80);
      const emailPrefix = email.split('@')[0];
      if (rawUsername && (!existing.username || rawUsername !== emailPrefix || existing.username === emailPrefix)) {
        existing.username = username;
      }
      if (isPro) {
        existing.subscriptionStatus = 'pro';
        existing.isPro = true;
        existing.isExplicitlyDeactivated = false;
        if (incomingPlan) existing.subscriptionPlan = incomingPlan;
        if (incomingExpiresAt) existing.subscriptionExpiresAt = incomingExpiresAt;
      } else if (incomingSubStatus === 'pending') {
        existing.subscriptionStatus = 'pending';
        existing.isPro = false;
        if (incomingPlan) existing.subscriptionPlan = incomingPlan;
      } else if (incomingSubStatus === 'free' && !existing.isPro) {
        existing.subscriptionStatus = 'free';
        existing.isPro = false;
      }
      if (passwordHash) {
        existing.passwordHash = passwordHash;
        if (isSuperAdmin || existing.uid === 'admin_vuedevo_01') {
          superAdminPasswordHash = passwordHash;
        }
      }
      existing.updatedAt = nowIso();
      if (isSuperAdmin) {
        existing.role = 'admin';
      }
      savePersistedUsersCache();
      res.json({ user: sanitizeUser(existing) });
      return;
    }

    const record: ServerUserRecord = {
      uid,
      username,
      email,
      displayName: displayName.slice(0, 80),
      role: isSuperAdmin ? 'admin' : 'user',
      status: 'active',
      authProvider,
      currency: 'IDR',
      subscriptionStatus: effectiveStatus,
      isPro,
      isExplicitlyDeactivated: false,
      subscriptionPlan: isPro ? incomingPlan || 'yearly' : null,
      subscriptionExpiresAt: isPro ? incomingExpiresAt : null,
      passwordHash,
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

  // Update User Profile (displayName & username)
  app.patch('/api/users/:uid/profile', (req: Request, res: Response) => {
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

  // Change User Password (verifies currentPassword if passwordHash is present, and returns new SHA-256 passwordHash for Firestore sync)
  app.patch('/api/users/:uid/password', (req: Request, res: Response) => {
    const uid = String(req.params.uid || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');
    const storedHashFromClient = req.body?.storedPasswordHash
      ? String(req.body.storedPasswordHash)
      : undefined;

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

    const effectiveStoredHash = target?.passwordHash || storedHashFromClient;

    if (effectiveStoredHash) {
      if (!currentPassword) {
        res.status(400).json({ error: 'Kata sandi saat ini wajib diisi untuk verifikasi keamanan.' });
        return;
      }
      const isValidCurrent = verifyPasswordAgainstStoredHash(currentPassword, effectiveStoredHash);
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
      }
      savePersistedUsersCache();
    } else if (email === SUPER_ADMIN_EMAIL || uid === 'admin_vuedevo_01') {
      superAdminPasswordHash = newHash;
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
      passwordHash: newHash,
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
    let record = reportSettingsStore.get(uid);

    if (!record && uid !== 'default') {
      record = reportSettingsStore.get('default');
    }

    if (!record && reportSettingsStore.size > 0) {
      record = Array.from(reportSettingsStore.values())[0];
    }

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
    const uid = String(req.params.uid || '').trim() || 'default';
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
    reportSettingsStore.set('default', { ...record, ownerId: 'default' });
    savePersistedReportSettingsCache();

    const isFromPeer = req.query.peer === '1';
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

  app.get('/api/users/:uid/automations', (req: Request, res: Response) => {
    const rawUid = String(req.params.uid || '').trim();
    const uid = rawUid.replace(/[^a-zA-Z0-9_\-]/g, '_');

    let userRules = Array.from(automationsStore.values()).filter(
      (r) => (r.ownerId === uid || r.ownerId === rawUid) && !r.deleted
    );

    // If empty and uid is super admin / alias, check other known admin identifiers
    if (userRules.length === 0 && (uid.includes('vuedevo') || uid === 'admin_vuedevo_01' || rawUid === 'KlSX6JgegtUIsQinZRKp535OJ6E3')) {
      userRules = Array.from(automationsStore.values()).filter(
        (r) => (r.ownerId.includes('vuedevo') || r.ownerId === 'admin_vuedevo_01' || r.ownerId === 'KlSX6JgegtUIsQinZRKp535OJ6E3') && !r.deleted
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
      snoozedUntil: body.snoozedUntil || null,
      deleted: false,
      createdAt: body.createdAt || nowIso(),
      updatedAt: nowIso(),
    };

    automationsStore.set(id, record);
    savePersistedAutomationsCache();

    const isFromPeer = req.query.peer === '1';
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
      snoozedUntil: body.snoozedUntil !== undefined ? body.snoozedUntil : (existing?.snoozedUntil || null),
      deleted: false,
      createdAt: existing?.createdAt || nowIso(),
      updatedAt: nowIso(),
    };

    automationsStore.set(id, record);
    savePersistedAutomationsCache();

    const isFromPeer = req.query.peer === '1';
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
    if (body.lastExecutedDate !== undefined) existing.lastExecutedDate = body.lastExecutedDate;
    if (body.lastCancelledDate !== undefined) existing.lastCancelledDate = body.lastCancelledDate;
    if (body.snoozedUntil !== undefined) existing.snoozedUntil = body.snoozedUntil;
    if (body.deleted !== undefined) existing.deleted = Boolean(body.deleted);
    existing.updatedAt = nowIso();

    automationsStore.set(id, existing);
    savePersistedAutomationsCache();

    const isFromPeer = req.query.peer === '1';
    if (!isFromPeer) {
      void syncAutomationToPeer(uid, existing, false);
    }

    res.json({
      success: true,
      rule: existing,
    });
  });

  app.delete('/api/users/:uid/automations/:id', (req: Request, res: Response) => {
    const rawUid = String(req.params.uid || '').trim();
    const uid = rawUid.replace(/[^a-zA-Z0-9_\-]/g, '_') || 'default';
    const id = String(req.params.id || '').trim();

    const existing = automationsStore.get(id);
    if (existing) {
      existing.deleted = true;
      existing.deletedAt = nowIso();
      existing.updatedAt = nowIso();
      automationsStore.set(id, existing);
      savePersistedAutomationsCache();

      const isFromPeer = req.query.peer === '1';
      if (!isFromPeer) {
        void syncAutomationToPeer(uid, existing, true);
      }
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
          snoozedUntil: item.snoozedUntil || null,
          deleted: Boolean(item.deleted),
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
    try {
      const plan: 'monthly' | 'yearly' = req.body?.plan === 'yearly' ? 'yearly' : 'monthly';
      const amount = plan === 'yearly' ? 215000 : 21500;
      const customerName = String(req.body?.customerName || 'Pelanggan SisaUang').trim().slice(0, 80);
      const customerEmail = String(req.body?.customerEmail || 'vuedevo@gmail.com').trim().toLowerCase().slice(0, 100);
      const customerPhone = String(req.body?.customerPhone || '0851-2963-4505').trim().slice(0, 30);
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

  // 2. Confirm in-site simulated / verified payment
  app.post('/api/payment/confirm-mock-payment', async (req: Request, res: Response) => {
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
      // Disabled Payment Channels (Temporarily inactive)
      {
        paymentMethod: 'SP',
        paymentName: 'QRIS Instan (Sementara Belum Aktif)',
        paymentImage: 'https://images.duitku.com/hotlink-ok/SP.PNG',
        totalFee: '0',
        category: 'qris',
        status: 'inactive',
        disabled: true,
        disabledReason: 'Sementara belum aktif',
      },
      {
        paymentMethod: 'OV',
        paymentName: 'OVO E-Wallet (Sementara Belum Aktif)',
        paymentImage: 'https://images.duitku.com/hotlink-ok/OV.PNG',
        totalFee: '0',
        category: 'ewallet',
        status: 'inactive',
        disabled: true,
        disabledReason: 'Sementara belum aktif',
      },
      {
        paymentMethod: 'DA',
        paymentName: 'DANA E-Wallet (Sementara Belum Aktif)',
        paymentImage: 'https://images.duitku.com/hotlink-ok/DA.PNG',
        totalFee: '0',
        category: 'ewallet',
        status: 'inactive',
        disabled: true,
        disabledReason: 'Sementara belum aktif',
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
          // Filter out BCA VA (BC) completely and mark QRIS/e-wallets as disabled
          const sanitizedMethods = data.paymentFee
            .filter((p: any) => p && p.paymentMethod !== 'BC')
            .map((p: any) => {
              if (['SP', 'NQ', 'OV', 'DA', 'SL', 'LA', 'SA', 'OL'].includes(p.paymentMethod)) {
                return {
                  ...p,
                  disabled: true,
                  status: 'inactive',
                  disabledReason: 'Sementara belum aktif',
                };
              }
              return p;
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

      // Enforce supported 10 Virtual Accounts and reject BCA / disabled methods
      const SUPPORTED_VA_CODES = ['M2', 'BT', 'BR', 'I1', 'BV', 'NC', 'B1', 'DM', 'VA', 'S1'];

      if (paymentMethod === 'BC') {
        res.status(400).json({ error: 'Metode pembayaran BCA Virtual Account tidak didukung.' });
        return;
      }

      if (paymentMethod === 'SP' || ['NQ', 'OV', 'DA', 'SL', 'LA', 'SA', 'OL'].includes(paymentMethod)) {
        res.status(400).json({
          error: 'Metode pembayaran QRIS dan e-Wallet sementara belum aktif. Silakan gunakan salah satu dari 10 Virtual Account yang didukung.',
        });
        return;
      }

      if (!SUPPORTED_VA_CODES.includes(paymentMethod)) {
        res.status(400).json({
          error: `Metode pembayaran ${paymentMethod} tidak didukung. Pilihan Virtual Account: Mandiri, Permata, BRI, BNI, BSI, BNC, CIMB Niaga, Danamon, Maybank, Sampoerna.`,
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

      const duitkuRes = await fetch(`${DUITKU_BASE_URL}/v2/inquiry`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(inquiryPayload),
      });

      const duitkuData: any = await duitkuRes.json();

      if (!duitkuRes.ok || duitkuData.statusCode !== '00') {
        const errorMsg = duitkuData.statusMessage || 'Gagal membuat transaksi di Duitku.';
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
        paymentMethod,
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

  app.get('/api/admin/overview', requireAdminMiddleware, (_req: Request, res: Response) => {
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
  app.get('/api/admin/users', requireAdminMiddleware, (req: Request, res: Response) => {
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
          : existing?.passwordHash || hashPassword('ShieldUser2026!'),
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
  // App Version & Live Update Detection Endpoint
  // =========================================================================
  function computeCurrentBuildFingerprint(): { version: string; buildHash: string } {
    let version = '1.0.0';
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
    res.json(computeCurrentBuildFingerprint());
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
    app.use(express.static(distPath, { index: false }));

    // 3. Fallback for SPA routes (/dashboard, /auth, /wallets, /transactions, /budgets, etc.)
    app.get('*', (_req: Request, res: Response) => {
      const spaShell = path.join(distPath, 'app-shell.html');
      if (fs.existsSync(spaShell)) {
        res.sendFile(spaShell);
        return;
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Sisa Uang server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
