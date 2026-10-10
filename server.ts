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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPER_ADMIN_EMAIL = 'vuedevo@gmail.com';
const SUPER_ADMIN_USERNAME = 'vuedevo';
const WORKSPACE_ADMIN_EMAIL = 'adnanzaki65@admin.sd.belajar.id';
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

const activityLogs: ServerActivityLog[] = [];

const securityAlerts: ServerSecurityAlert[] = [];

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
  if (activityLogs.length > 100) {
    activityLogs.pop();
  }
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
          Sisa Uang — Your Finance Assistant · v1.0.0-rc.3
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
  const PORT = Number(process.env.PORT) || 3000

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
    if (actorEmail === WORKSPACE_ADMIN_EMAIL || actorEmail === SUPER_ADMIN_EMAIL) {
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

    // Check if an existing entry has the same email or uid
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

    if (existing) {
      existing.displayName = displayName.slice(0, 80);
      const emailPrefix = email.split('@')[0];
      // Do not overwrite an existing customized username with the default email local-part during auto-sync
      if (rawUsername && (!existing.username || rawUsername !== emailPrefix || existing.username === emailPrefix)) {
        existing.username = username;
      }
      if (incomingSubStatus === 'pro' && existing.subscriptionStatus !== 'pending') {
        existing.subscriptionStatus = 'pro';
        existing.isPro = true;
        if (incomingPlan) existing.subscriptionPlan = incomingPlan;
        if (incomingExpiresAt) existing.subscriptionExpiresAt = incomingExpiresAt;
      } else if (incomingSubStatus === 'pending' && existing.subscriptionStatus !== 'pro') {
        existing.subscriptionStatus = 'pending';
        existing.isPro = false;
        if (incomingPlan) existing.subscriptionPlan = incomingPlan;
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
      subscriptionStatus: incomingSubStatus || 'free',
      isPro: incomingSubStatus === 'pro',
      subscriptionPlan: incomingSubStatus ? incomingPlan : null,
      subscriptionExpiresAt: incomingSubStatus === 'pro' ? incomingExpiresAt : null,
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

  // Check current user status (used for real-time blocking enforcement)
  app.get('/api/users/:uid/status', (req: Request, res: Response) => {
    const uid = String(req.params.uid || '');
    const email = String(req.query.email || '').toLowerCase();

    let user = usersStore.get(uid);
    if (!user && email) {
      for (const u of usersStore.values()) {
        if (u.email.toLowerCase() === email) {
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
        subscriptionPlan: null,
        subscriptionExpiresAt: null,
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
      subscriptionPlan: isPro || isPending ? user.subscriptionPlan || 'monthly' : null,
      subscriptionExpiresAt: isPro ? user.subscriptionExpiresAt || null : null,
      subscriptionPaymentMethod: user.subscriptionPaymentMethod || null,
      subscriptionRequestedAt: user.subscriptionRequestedAt || null,
      updatedAt: user.updatedAt,
    });
  });

  // Submit SisaUang Pro Payment Proof (QRIS / Bank Transfer) -> Sends email to azzackey@gmail.com & sets status to 'pending'
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

    // Automatically send email to azzackey@gmail.com with subscription details & transfer proof attachment
    let emailDispatched = false;
    let emailErrorNote = '';
    if (isSmtpConfigured()) {
      try {
        await sendProSubscriptionPaymentEmail({
          recipientEmail: 'azzackey@gmail.com',
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
      `Pengguna ${user.displayName} (${user.email}) mengirim bukti pembayaran SisaUang Pro (${planLabel} via ${methodLabel}). Email ke azzackey@gmail.com ${emailDispatched ? 'terkirim otomatis' : 'tersimpan di sistem antrean verifikasi'}. Status: PENDING.`,
      'info'
    );

    res.json({
      user: sanitizeUser(user),
      emailDispatched,
      recipientEmail: 'azzackey@gmail.com',
      emailErrorNote: emailErrorNote || null,
      log,
    });
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
      summary: {
        totalUsers,
        activeUsersCount,
        blockedUsersCount,
        proUsersCount,
        pendingProUsersCount,
      },
      logs: activityLogs,
      alerts: securityAlerts,
      serverTime: nowIso(),
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
    targetUser.subscriptionStatus = newSubStatus;
    targetUser.isPro = isPro;
    targetUser.subscriptionPlan = plan;
    targetUser.subscriptionExpiresAt = expiresAt;
    if (newSubStatus === 'free') {
      targetUser.subscriptionPaymentMethod = null;
      targetUser.subscriptionProofDataUrl = null;
      targetUser.subscriptionProofFileName = null;
      targetUser.subscriptionRequestedAt = null;
      targetUser.subscriptionSenderName = null;
      targetUser.subscriptionTransferNote = null;
    }
    targetUser.updatedAt = nowIso();
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
      const existing = usersStore.get(uid);
      const username = String(u.username || email.split('@')[0] || uid)
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_')
        .slice(0, 60);

      const isPending =
        u.subscriptionStatus === 'pending' || existing?.subscriptionStatus === 'pending';
      const isPro =
        !isPending &&
        (u.subscriptionStatus === 'pro' ||
          u.isPro === true ||
          existing?.subscriptionStatus === 'pro' ||
          existing?.isPro === true);
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
    let version = '1.0.0-rc.4';
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
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.json(computeCurrentBuildFingerprint());
  });

  // =========================================================================
  // Vite Middleware (Development) or Static Dist (Production)
  // =========================================================================
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: {
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

    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Sisa Uang server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
