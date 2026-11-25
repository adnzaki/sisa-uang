import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import {
  auth,
  googleProvider,
  isFirestoreQuotaError,
  sanitizeId,
  sanitizeString,
  MAX_DISPLAY_NAME_LENGTH,
  MAX_EMAIL_LENGTH,
  MAX_LOG_DETAIL_LENGTH,
} from '../firebase';
import {
  apiClient,
  setApiAdminContext,
  getApiUserToken,
  setApiUserToken,
} from '../services/api';
import {
  fsGetDoc,
  fsGetDocs,
  fsSetDoc,
  fsUpdateDoc,
  fsServerTimestamp,
  hasActiveFirestoreAccess,
  isDirectFirestoreAuthorized,
} from '../services/userFirestoreBridge';
import { useNotificationStore } from './notification';
import { useFinanceStore } from './finance';

export interface AppUser {
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
  subscriptionRequestedAt?: string | null;
  isFirebaseBacked?: boolean;
}

export function isSubscriptionActiveByDate(
  status?: 'free' | 'pending' | 'pro',
  isProFlag?: boolean,
  expiresAt?: string | null,
  isExplicitlyDeactivated?: boolean
): boolean {
  if (status === 'pending') return false;
  const markedPro = status === 'pro' || isProFlag === true;
  if (!markedPro) return false;
  if (expiresAt) {
    const cleanDate = String(expiresAt).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
      const now = new Date();
      const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      if (cleanDate < todayIso) {
        return false;
      }
    }
  }
  if (isExplicitlyDeactivated === true && !markedPro) return false;
  return true;
}

export function purgeForeignLocalStorage(activeUid?: string) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const currentUid = activeUid ? sanitizeId(activeUid) : '';
  const genericAllowlist = new Set([
    'sisa_uang_theme',
    'sisa_uang_locale',
    'sisa_uang_active_user',
    'sisa_uang_saved_accounts_v1',
    'sisa_uang_device_id',
    'sisa_uang_device_id_v1',
    'sisa_uang_custom_device_name_v1',
    'sisa_uang_explicit_logout',
    'sisa_uang_otp_verified',
    'sisa_uang_admin_token',
    'sisa_uang_user_token',
    'sisa_uang_admin_synced_session',
    'sisauang_pwa_dismissed',
    'sisa_uang_real_default_categories',
    'sisa_uang_app_logo',
  ]);

  const keysToRemove: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      if (
        key.startsWith('sisa_uang_') ||
        key.startsWith('su_') ||
        key.startsWith('sisauang_')
      ) {
        if (genericAllowlist.has(key)) {
          continue;
        }
        if (!currentUid) {
          keysToRemove.push(key);
        } else {
          // Check if key belongs strictly to currentUid (prevent substring collisions like ci4_user_2 in ci4_user_29)
          const belongsToActiveUser =
            key.endsWith(`_${currentUid}`) ||
            key.endsWith(`_${currentUid}:all`) ||
            key.includes(`_${currentUid}_`) ||
            key.includes(`:${currentUid}:`);

          if (!belongsToActiveUser) {
            keysToRemove.push(key);
          }
        }
      }
    }

    for (const k of keysToRemove) {
      localStorage.removeItem(k);
    }
  } catch {
    // Ignore localStorage access errors
  }
}

let needsFirebaseSignOutOnBoot = false;

// Immediately purge on file evaluation to clean up existing foreign user entries & revoke unverified Super Admin leaks
try {
  if (typeof window !== 'undefined' && window.localStorage) {
    const rawSaved = localStorage.getItem('sisa_uang_active_user');
    let activeUid = '';
    const isClaimingSuperAdmin = (candidate: any): boolean => {
      if (!candidate || typeof candidate !== 'object') return false;
      const email = String(candidate.email || '').trim().toLowerCase();
      const username = String(candidate.username || '').trim().toLowerCase();
      const uid = String(candidate.uid || '').trim();
      const role = String(candidate.role || '').trim().toLowerCase();
      return (
        email === 'vuedevo@gmail.com' ||
        email === 'adnanzaki65@admin.sd.belajar.id' ||
        username === 'vuedevo' ||
        uid === 'KlSX6JgegtUIsQinZRKp535OJ6E3' ||
        uid === 'admin_vuedevo_01' ||
        role === 'admin'
      );
    };

    if (rawSaved) {
      try {
        const parsed = JSON.parse(rawSaved);
        if (parsed?.uid) activeUid = parsed.uid;
        const isSuperAdminClaim = isClaimingSuperAdmin(parsed);
        const hasValidToken = Boolean(localStorage.getItem('sisa_uang_admin_token'));
        const hasVerifiedOtp = localStorage.getItem('sisa_uang_otp_verified') === 'true';

        // Security fix: NEVER demote an unverified Super Admin cache into a normal 'user' session —
        // completely wipe the compromised session so non-admin users are never trapped inside @vuedevo.
        if (isSuperAdminClaim && (!hasValidToken || !hasVerifiedOtp)) {
          localStorage.removeItem('sisa_uang_active_user');
          localStorage.removeItem('sisa_uang_user_token');
          localStorage.removeItem('sisa_uang_admin_token');
          localStorage.removeItem('sisa_uang_otp_verified');
          localStorage.removeItem('sisa_uang_actor_email');
          localStorage.removeItem('sisa_uang_admin_synced_session');
          activeUid = '';
          needsFirebaseSignOutOnBoot = true;
        }
      } catch {
        localStorage.removeItem('sisa_uang_active_user');
        activeUid = '';
      }
    }

    // Also scrub unverified Super Admin entries from saved switcher accounts
    try {
      const savedAccountsRaw = localStorage.getItem('sisa_uang_saved_accounts_v1');
      if (savedAccountsRaw) {
        const list = JSON.parse(savedAccountsRaw);
        if (Array.isArray(list)) {
          const cleaned = list.filter((entry: any) => {
            if (!entry || !entry.user) return false;
            if (isClaimingSuperAdmin(entry.user)) {
              return Boolean(entry.adminToken && entry.otpVerified === true);
            }
            return true;
          });
          if (cleaned.length !== list.length) {
            localStorage.setItem('sisa_uang_saved_accounts_v1', JSON.stringify(cleaned));
          }
        }
      }
    } catch {
      // Ignore saved accounts parse error
    }

    purgeForeignLocalStorage(activeUid);
  }
} catch {
  // ignore
}

export interface OtpDispatchInfo {
  email: string;
  expiresAt: number;
  message: string;
  sent?: boolean;
  smtpSent?: boolean;
  smtpError?: string | null;
  smtpMessageId?: string | null;
  fallbackCode?: string;
  autoVerified?: boolean;
  reusedExisting?: boolean;
  cooldownRemainingSec?: number;
  dispatchedAt?: number;
}

const OTP_DISPATCH_SESSION_KEY = 'sisa_uang_otp_dispatch_info_v1';

function saveOtpDispatchToSessionStorage(info: OtpDispatchInfo | null) {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return;
    if (!info) {
      sessionStorage.removeItem(OTP_DISPATCH_SESSION_KEY);
      return;
    }
    sessionStorage.setItem(OTP_DISPATCH_SESSION_KEY, JSON.stringify(info));
  } catch {
    // Ignore sessionStorage error
  }
}

function loadOtpDispatchFromSessionStorage(email?: string | null): OtpDispatchInfo | null {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return null;
    const raw = sessionStorage.getItem(OTP_DISPATCH_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OtpDispatchInfo;
    if (!parsed || !parsed.expiresAt || Date.now() >= parsed.expiresAt) {
      sessionStorage.removeItem(OTP_DISPATCH_SESSION_KEY);
      return null;
    }
    if (email && parsed.email && parsed.email.toLowerCase() !== email.toLowerCase()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export interface DeviceSessionInfo {
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

export interface SavedAccountSession {
  user: AppUser;
  adminToken?: string | null;
  userToken?: string | null;
  otpVerified?: boolean;
  lastUsedAt: string;
}

const SUPER_ADMIN_EMAIL = 'vuedevo@gmail.com';
const SUPER_ADMIN_USERNAME = 'vuedevo';
const WORKSPACE_ADMIN_EMAIL = 'adnanzaki65@admin.sd.belajar.id';
const SESSION_STORAGE_KEY = 'sisa_uang_active_user';
const SAVED_ACCOUNTS_STORAGE_KEY = 'sisa_uang_saved_accounts_v1';
const DEVICE_ID_STORAGE_KEY = 'sisa_uang_device_id_v1';
const CUSTOM_DEVICE_NAME_KEY = 'sisa_uang_custom_device_name_v1';
const OTP_VERIFIED_KEY = 'sisa_uang_otp_verified';
const EXPLICIT_LOGOUT_KEY = 'sisa_uang_explicit_logout';

function getOrCreateDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (existing && existing.length >= 8) {
      return existing;
    }
    const randomPart = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
    const created = `dev_${randomPart}`;
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, created);
    return created;
  } catch {
    return `dev_fallback_${Date.now()}`;
  }
}

function detectClientDeviceMetadata() {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
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

  const customName =
    typeof localStorage !== 'undefined' ? localStorage.getItem(CUSTOM_DEVICE_NAME_KEY) : null;

  return {
    userAgent: ua,
    browser,
    os,
    deviceType,
    deviceName: customName || `${browser} di ${os}`,
  };
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AppUser | null>(null);
  const isReady = ref(false);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  // Device & Session Management state
  const currentDeviceId = ref<string>(getOrCreateDeviceId());
  const deviceSessions = ref<DeviceSessionInfo[]>([]);
  const isSessionsLoading = ref(false);
  const primaryDeviceOtpPending = ref<{
    email: string;
    deviceId: string;
    deviceName: string;
    expiresAt: number;
    message: string;
    fallbackCode?: string;
    smtpNotice?: string;
  } | null>(null);

  // Multi-Account Switcher state
  const savedAccounts = ref<SavedAccountSession[]>([]);

  // Super Admin 2FA Email OTP state (exclusively for vuedevo@gmail.com)
  const requiresOtp = ref(false);
  const otpVerified = ref(localStorage.getItem(OTP_VERIFIED_KEY) === 'true');
  const otpDispatchInfo = ref<OtpDispatchInfo | null>(loadOtpDispatchFromSessionStorage());

  const currentDeviceSession = computed(
    () =>
      deviceSessions.value.find((s) => s.deviceId === currentDeviceId.value) || null
  );
  const isCurrentDevicePrimary = computed(
    () => currentDeviceSession.value?.isPrimary === true
  );
  const hasAnyPrimaryDevice = computed(() =>
    deviceSessions.value.some((s) => s.isPrimary)
  );

  let userStatusUnsubscribe: (() => void) | null = null;
  let statusPollTimer: ReturnType<typeof setInterval> | null = null;
  let isRegisteringInProgress = false;

  // Cross-tab / cross-device synchronization channel for instantaneous Pro deactivation
  if (typeof window !== 'undefined' && !(window as any).__sisauang_sub_channel_bound) {
    (window as any).__sisauang_sub_channel_bound = true;
    if ('BroadcastChannel' in window) {
      try {
        const subChannel = new BroadcastChannel('sisauang_subscription_channel');
        subChannel.onmessage = (event) => {
          try {
            const { type, uid, email } = event.data || {};
            if (type === 'DEACTIVATE_USER_PRO' && user.value) {
              const currentUid = user.value.uid;
              const currentEmail = (user.value.email || '').toLowerCase();
              const targetEmail = (email || '').toLowerCase();
              const isMatch =
                (uid && currentUid === uid) ||
                (targetEmail && currentEmail === targetEmail);
              if (isMatch) {
                setExternalSubscriptionStatus('free', null, null, true);
              }
            }
          } catch {
            // Ignore channel error
          }
        };
      } catch {
        // Ignore BroadcastChannel error
      }
    }

    window.addEventListener('storage', (e) => {
      if (e.key === SESSION_STORAGE_KEY && e.newValue && user.value) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (parsed && (parsed.uid === user.value.uid || parsed.email?.toLowerCase() === user.value.email?.toLowerCase())) {
            if (parsed.isExplicitlyDeactivated === true && (user.value.isPro || !user.value.isExplicitlyDeactivated)) {
              setExternalSubscriptionStatus('free', null, null, true);
            }
          }
        } catch {
          // Ignore
        }
      }
    });
  }

  const isAuthenticated = computed(
    () =>
      !!user.value &&
      user.value.status === 'active' &&
      !(requiresOtp.value && !otpVerified.value)
  );
  const isSuperAdmin = computed(
    () =>
      !!user.value &&
      user.value.status === 'active' &&
      user.value.role === 'admin' &&
      (user.value.email.toLowerCase() === SUPER_ADMIN_EMAIL ||
        user.value.email.toLowerCase() === WORKSPACE_ADMIN_EMAIL)
  );
  const isProUser = computed(() => {
    if (!user.value) return false;
    if (isSuperAdmin.value) return true;

    // Strict evaluation: Any free, pending, deactivated, or non-pro status is immediately false
    if (
      user.value.isExplicitlyDeactivated === true ||
      user.value.subscriptionStatus === 'free' ||
      user.value.subscriptionStatus === 'pending' ||
      user.value.isPro === false ||
      (user.value.subscriptionStatus !== 'pro' && user.value.isPro !== true)
    ) {
      return false;
    }

    return isSubscriptionActiveByDate(
      user.value.subscriptionStatus,
      user.value.isPro,
      user.value.subscriptionExpiresAt,
      user.value.isExplicitlyDeactivated
    );
  });
  const isPendingProUser = computed(
    () =>
      !!user.value &&
      !isProUser.value &&
      user.value.subscriptionStatus === 'pending'
  );
  const canAccessControlPanel = computed(() => {
    if (!isAuthenticated.value || !isSuperAdmin.value) return false;
    // OTP verification & valid server token are strictly mandatory to access Control Panel
    return otpVerified.value === true && Boolean(localStorage.getItem('sisa_uang_admin_token'));
  });

  function clearError() {
    error.value = null;
  }

  async function recordAuditLog(
    action: string,
    detail: string,
    severity: 'info' | 'warning' | 'critical' = 'info',
    amount = 0
  ) {
    const actorUid = sanitizeId(user.value?.uid || auth.currentUser?.uid || 'guest_user');
    const actorEmail = sanitizeString(
      user.value?.email || auth.currentUser?.email || 'anonymous@sisa-uang.id',
      MAX_EMAIL_LENGTH,
      'anonymous@sisa-uang.id'
    );
    const safeDetail = sanitizeString(detail, MAX_LOG_DETAIL_LENGTH, action);

    // Send to backend API via Axios (0 Firestore reads/writes)
    try {
      await apiClient.post('/activity', {
        actorUid,
        actorEmail,
        action: sanitizeString(action, 60, 'user_action'),
        detail: safeDetail,
        severity,
        amount,
      });
    } catch {
      // Ignore transient network errors
    }
  }

  function loadSavedAccountsFromStorage() {
    try {
      const raw = localStorage.getItem(SAVED_ACCOUNTS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as SavedAccountSession[];
        if (Array.isArray(parsed)) {
          savedAccounts.value = parsed.filter((item) => item && item.user && item.user.uid);
        }
      }
    } catch {
      savedAccounts.value = [];
    }
  }

  function persistSavedAccountsToStorage() {
    try {
      localStorage.setItem(SAVED_ACCOUNTS_STORAGE_KEY, JSON.stringify(savedAccounts.value));
    } catch {
      // Ignore storage error
    }
  }

  function upsertSavedAccount(
    targetUser: AppUser,
    adminToken?: string | null,
    userToken?: string | null
  ) {
    loadSavedAccountsFromStorage();
    const existingIdx = savedAccounts.value.findIndex(
      (item) =>
        item.user.uid === targetUser.uid ||
        item.user.email.toLowerCase() === targetUser.email.toLowerCase()
    );
    const entry: SavedAccountSession = {
      user: { ...targetUser },
      adminToken:
        adminToken !== undefined
          ? adminToken
          : existingIdx >= 0
            ? savedAccounts.value[existingIdx].adminToken
            : localStorage.getItem('sisa_uang_admin_token'),
      userToken:
        userToken !== undefined
          ? userToken
          : existingIdx >= 0
            ? savedAccounts.value[existingIdx].userToken
            : getApiUserToken(),
      otpVerified: otpVerified.value,
      lastUsedAt: new Date().toISOString(),
    };
    if (existingIdx >= 0) {
      savedAccounts.value.splice(existingIdx, 1, entry);
    } else {
      savedAccounts.value.unshift(entry);
    }
    persistSavedAccountsToStorage();
  }

  function removeSavedAccount(uid: string) {
    loadSavedAccountsFromStorage();
    savedAccounts.value = savedAccounts.value.filter((item) => item.user.uid !== uid);
    persistSavedAccountsToStorage();
  }

  async function registerCurrentDeviceSession(
    targetUser: AppUser,
    forceNewLogin = false
  ): Promise<boolean> {
    if (!targetUser?.uid) return true;
    const meta = detectClientDeviceMetadata();
    try {
      const { data } = await apiClient.post(
        `/users/${encodeURIComponent(targetUser.uid)}/sessions/register`,
        {
          email: targetUser.email,
          deviceId: currentDeviceId.value,
          deviceName: meta.deviceName,
          browser: meta.browser,
          os: meta.os,
          deviceType: meta.deviceType,
          userAgent: meta.userAgent,
          forceNewLogin,
        }
      );

      if (data?.revoked && !forceNewLogin) {
        useNotificationStore().notifyError(
          'Sesi Perangkat Dicabut',
          'Sesi login pada perangkat ini telah dihentikan dari Perangkat Utama Anda. Silakan masuk kembali.'
        );
        await logout(true);
        return false;
      }

      if (Array.isArray(data?.sessions)) {
        deviceSessions.value = data.sessions;
      }
      return true;
    } catch {
      return true;
    }
  }

  async function fetchDeviceSessions(silent = false) {
    if (!user.value?.uid) return;
    if (!silent) {
      isSessionsLoading.value = true;
    }
    try {
      const { data } = await apiClient.get(
        `/users/${encodeURIComponent(user.value.uid)}/sessions`,
        {
          params: {
            deviceId: currentDeviceId.value,
            email: user.value.email,
          },
        }
      );
      if (Array.isArray(data?.sessions)) {
        deviceSessions.value = data.sessions;
      }
      // If current device session was not registered yet on server (e.g. server restarted), register automatically
      if (!data?.currentSession && user.value) {
        await registerCurrentDeviceSession(user.value, false);
      }
    } catch {
      // Ignore network error
    } finally {
      if (!silent) {
        isSessionsLoading.value = false;
      }
    }
  }

  async function requestPrimaryDeviceOtp(customDeviceName?: string) {
    if (!user.value) {
      throw new Error('Tidak ada sesi pengguna aktif.');
    }
    const notify = useNotificationStore();
    if (customDeviceName && customDeviceName.trim()) {
      localStorage.setItem(CUSTOM_DEVICE_NAME_KEY, customDeviceName.trim().slice(0, 80));
    }
    const meta = detectClientDeviceMetadata();
    isSessionsLoading.value = true;
    try {
      const { data } = await apiClient.post(
        `/users/${encodeURIComponent(user.value.uid)}/sessions/request-primary-otp`,
        {
          email: user.value.email,
          deviceId: currentDeviceId.value,
          deviceName: customDeviceName?.trim() || meta.deviceName,
        }
      );

      primaryDeviceOtpPending.value = {
        email: data.email || user.value.email,
        deviceId: currentDeviceId.value,
        deviceName: data.deviceName || meta.deviceName,
        expiresAt: data.expiresAt || Date.now() + 600000,
        message: data.message,
        fallbackCode: data.fallbackCode,
        smtpNotice: data.smtpNotice,
      };

      notify.notifySuccess(
        'Kode OTP Perangkat Utama Dikirim',
        data.sent
          ? `Kode verifikasi 6 digit telah dikirim ke email terdaftar (${data.email || user.value.email}).`
          : `Kode verifikasi OTP 6 digit telah dibuat untuk memverifikasi perangkat utama (${data.email || user.value.email}).`
      );
      return primaryDeviceOtpPending.value;
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ||
        (err instanceof Error ? err.message : 'Gagal mengirim kode OTP Perangkat Utama.');
      notify.notifyError('Gagal Meminta OTP Perangkat Utama', err, msg);
      throw new Error(msg);
    } finally {
      isSessionsLoading.value = false;
    }
  }

  async function verifyPrimaryDeviceOtp(otpCode: string): Promise<boolean> {
    if (!user.value) return false;
    const notify = useNotificationStore();
    const cleanCode = otpCode.trim();
    if (cleanCode.length < 6) {
      notify.notifyError('Kode OTP Belum Lengkap', 'Masukkan 6 digit kode verifikasi OTP.');
      return false;
    }

    isSessionsLoading.value = true;
    try {
      const { data } = await apiClient.post(
        `/users/${encodeURIComponent(user.value.uid)}/sessions/verify-primary-otp`,
        {
          deviceId: currentDeviceId.value,
          code: cleanCode,
        }
      );

      if (Array.isArray(data?.sessions)) {
        deviceSessions.value = data.sessions;
      }
      primaryDeviceOtpPending.value = null;

      notify.notifySuccess(
        'Perangkat Utama Berhasil Diatur!',
        data?.message ||
          'Perangkat ini kini berstatus Perangkat Utama dan dapat mengelola/mencabut sesi di perangkat lain.'
      );
      return true;
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ||
        (err instanceof Error ? err.message : 'Kode verifikasi OTP tidak sesuai.');
      notify.notifyError('Verifikasi OTP Gagal', err, msg);
      return false;
    } finally {
      isSessionsLoading.value = false;
    }
  }

  function cancelPrimaryDeviceOtp() {
    primaryDeviceOtpPending.value = null;
  }

  async function revokeDeviceSession(targetDeviceId: string): Promise<boolean> {
    if (!user.value) return false;
    const notify = useNotificationStore();
    isSessionsLoading.value = true;
    try {
      const { data } = await apiClient.delete(
        `/users/${encodeURIComponent(user.value.uid)}/sessions/${encodeURIComponent(targetDeviceId)}`,
        {
          params: {
            actorDeviceId: currentDeviceId.value,
            email: user.value.email,
          },
        }
      );
      if (Array.isArray(data?.sessions)) {
        deviceSessions.value = data.sessions;
      } else {
        deviceSessions.value = deviceSessions.value.filter((s) => s.deviceId !== targetDeviceId);
      }
      notify.notifySuccess(
        'Sesi Perangkat Dicabut',
        'Sesi login pada perangkat tersebut berhasil dihapus dan tidak dapat mengakses akun lagi.'
      );
      return true;
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ||
        (err instanceof Error ? err.message : 'Gagal mencabut sesi perangkat.');
      notify.notifyError('Gagal Mencabut Sesi', err, msg);
      return false;
    } finally {
      isSessionsLoading.value = false;
    }
  }

  async function revokeAllOtherDeviceSessions(): Promise<boolean> {
    if (!user.value) return false;
    const notify = useNotificationStore();
    isSessionsLoading.value = true;
    try {
      const { data } = await apiClient.post(
        `/users/${encodeURIComponent(user.value.uid)}/sessions/revoke-others`,
        {
          actorDeviceId: currentDeviceId.value,
          email: user.value.email,
        }
      );
      if (Array.isArray(data?.sessions)) {
        deviceSessions.value = data.sessions;
      }
      notify.notifySuccess(
        'Seluruh Sesi Perangkat Lain Dicabut',
        `${data?.revokedCount || 0} sesi perangkat lain telah dihentikan secara permanen.`
      );
      return true;
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ||
        (err instanceof Error ? err.message : 'Gagal mencabut sesi perangkat lain.');
      notify.notifyError('Gagal Mencabut Sesi Lain', err, msg);
      return false;
    } finally {
      isSessionsLoading.value = false;
    }
  }

  async function switchAccount(targetUid: string): Promise<boolean> {
    loadSavedAccountsFromStorage();
    const targetEntry = savedAccounts.value.find((item) => item.user.uid === targetUid);
    if (!targetEntry) return false;

    const notify = useNotificationStore();
    const nextUser: AppUser = {
      ...targetEntry.user,
      isFirebaseBacked: true,
    };

    const isTargetSuperAdmin =
      nextUser.email.toLowerCase() === SUPER_ADMIN_EMAIL ||
      nextUser.email.toLowerCase() === WORKSPACE_ADMIN_EMAIL;

    const effectiveToken = isTargetSuperAdmin ? targetEntry.adminToken || null : null;
    const effectiveUserToken =
      isTargetSuperAdmin && !(targetEntry.otpVerified && targetEntry.adminToken)
        ? null
        : targetEntry.userToken || null;

    if (!isTargetSuperAdmin && !effectiveUserToken) {
      removeSavedAccount(targetUid);
      notify.notifyError(
        'Sesi Akun Kedaluwarsa',
        `Sesi untuk @${nextUser.username} perlu masuk ulang demi keamanan.`
      );
      return false;
    }

    if (
      auth.currentUser &&
      auth.currentUser.email?.toLowerCase() !== nextUser.email.toLowerCase()
    ) {
      await firebaseSignOut(auth).catch(() => {});
    }

    const nextOtpVerified = isTargetSuperAdmin
      ? Boolean(targetEntry.otpVerified && targetEntry.adminToken)
      : Boolean(targetEntry.otpVerified);
    let nextRequiresOtp = isTargetSuperAdmin;
    if (isTargetSuperAdmin && nextOtpVerified) {
      nextUser.role = 'admin';
      nextRequiresOtp = false;
    } else if (isTargetSuperAdmin) {
      nextUser.role = 'user';
    }

    localStorage.removeItem(EXPLICIT_LOGOUT_KEY);
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextUser));
    purgeForeignLocalStorage(nextUser.uid);
    localStorage.setItem(OTP_VERIFIED_KEY, nextOtpVerified ? 'true' : 'false');
    setApiUserToken(effectiveUserToken);
    setApiAdminContext(nextUser.email, effectiveToken);

    requiresOtp.value = nextRequiresOtp;
    otpVerified.value = nextOtpVerified;
    otpDispatchInfo.value =
      isTargetSuperAdmin && !nextOtpVerified
        ? loadOtpDispatchFromSessionStorage(nextUser.email)
        : null;
    primaryDeviceOtpPending.value = null;

    // Assign user.value LAST so watchers see finalized tokens & OTP flags
    user.value = nextUser;
    upsertSavedAccount(nextUser, effectiveToken, effectiveUserToken);

    await syncSubscriptionFromFirestoreForUser(nextUser.uid, nextUser.email);
    await registerCurrentDeviceSession(nextUser, true);
    startUserStatusMonitor(nextUser);

    // Automatically pull latest transactions and balances from Cloud Firestore for the switched user
    if (!isTargetSuperAdmin) {
      try {
        const financeStore = useFinanceStore();
        await financeStore.refreshData(true);
      } catch (err) {
        console.warn('Auto refresh data Firestore on switchAccount error:', err);
      }
    }

    notify.notifySuccess(
      'Berhasil Beralih Akun',
      `Sesi aktif kini beralih ke ${nextUser.displayName} (@${nextUser.username}).`
    );
    return true;
  }

  /**
   * Cross-device SisaUang Pro Subscription Synchronizer via Cloud Firestore (`sisa-uang`).
   * Because the Installed PWA (`ais-pre-...`) and AI Studio Preview (`ais-dev-...`) run on separate
   * Cloud Run instances with separate in-memory registries, Cloud Firestore is the single source of truth
   * for cross-device subscription sync (`/users/{uid}` + `/budgets/su_sub_pro_{uid}`).
   */
  let isSyncingFirestoreSub = false;

  async function syncSubscriptionFromFirestoreForUser(
    targetUidInput?: string,
    targetEmailInput?: string
  ): Promise<boolean> {
    if (isSyncingFirestoreSub) return false;
    const activeUser = user.value;
    const rawUid = targetUidInput || activeUser?.uid || '';
    const rawEmail = (targetEmailInput || activeUser?.email || '').trim().toLowerCase();
    if (!rawUid) return false;

    const safeUid = sanitizeId(rawUid);
    if (!hasActiveFirestoreAccess(safeUid)) {
      return false;
    }

    isSyncingFirestoreSub = true;
    try {
      // Query the user document from Cloud Firestore (direct for verified Firebase Auth or authenticated backend bridge)
      let userDocData: Record<string, any> | null = null;
      try {
        const userDocSnap = await fsGetDoc('users', safeUid, safeUid, true).catch(() =>
          fsGetDoc('users', safeUid, safeUid)
        );
        if (userDocSnap.exists()) {
          userDocData = userDocSnap.data() || null;
        }
      } catch {
        // Fallback to query by exact email if UID lookup fails
      }

      // If document was not found by safeUid, query specifically by this user's exact email
      if (!userDocData && rawEmail) {
        try {
          const emailSnap = await fsGetDocs(
            'users',
            { wheres: [{ field: 'email', op: '==', value: rawEmail }], limitCount: 1 },
            safeUid,
            true
          ).catch(() =>
            fsGetDocs(
              'users',
              { wheres: [{ field: 'email', op: '==', value: rawEmail }], limitCount: 1 },
              safeUid
            )
          );
          if (!emailSnap.empty) {
            userDocData = emailSnap.docs[0].data() || null;
          }
        } catch {
          // Ignore
        }
      }

      // Check authoritative status strictly from Cloud Firestore
      let resolvedStatus: 'free' | 'pending' | 'pro' = 'free';
      let resolvedPlan: 'monthly' | 'yearly' | null = null;
      let resolvedExpiresAt: string | null = null;
      let isDeactivated = false;

      if (userDocData) {
        isDeactivated = Boolean(userDocData.isExplicitlyDeactivated === true);
        const rawStatus = String(userDocData.subscriptionStatus || '').toLowerCase();
        const hasProFlag = userDocData.isPro === true;
        const candidatePlan: 'monthly' | 'yearly' =
          userDocData.subscriptionPlan === 'yearly' ? 'yearly' : 'monthly';
        const candidateExpires = userDocData.subscriptionExpiresAt
          ? String(userDocData.subscriptionExpiresAt).slice(0, 10)
          : null;

        if (!isDeactivated && (rawStatus === 'pro' || hasProFlag)) {
          if (candidateExpires && /^\d{4}-\d{2}-\d{2}$/.test(candidateExpires)) {
            const now = new Date();
            const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            if (candidateExpires >= todayIso) {
              resolvedStatus = 'pro';
              resolvedPlan = candidatePlan;
              resolvedExpiresAt = candidateExpires;
            } else {
              resolvedStatus = 'free';
            }
          } else {
            resolvedStatus = 'pro';
            resolvedPlan = candidatePlan;
            resolvedExpiresAt = candidateExpires;
          }
        } else if (!isDeactivated && rawStatus === 'pending') {
          resolvedStatus = 'pending';
          resolvedPlan = candidatePlan;
          resolvedExpiresAt = null;
        } else {
          resolvedStatus = 'free';
          resolvedPlan = null;
          resolvedExpiresAt = null;
        }
      } else {
        resolvedStatus = 'free';
        resolvedPlan = null;
        resolvedExpiresAt = null;
      }

      const prevStatus = user.value?.subscriptionStatus;
      const prevIsPro = Boolean(user.value?.isPro);

      setExternalSubscriptionStatus(
        resolvedStatus,
        resolvedPlan,
        resolvedExpiresAt,
        isDeactivated
      );

      const currentIsPro = resolvedStatus === 'pro';
      if (prevStatus !== resolvedStatus || prevIsPro !== currentIsPro) {
        if (user.value) {
          upsertSavedAccount(user.value);
          if (getApiUserToken() || localStorage.getItem('sisa_uang_admin_token')) {
            try {
              await apiClient.post('/users/sync', {
                uid: user.value.uid,
                username: user.value.username,
                email: user.value.email,
                displayName: user.value.displayName,
                authProvider: user.value.authProvider,
                subscriptionStatus: resolvedStatus,
                isPro: currentIsPro,
                subscriptionPlan: resolvedPlan,
                subscriptionExpiresAt: resolvedExpiresAt,
                isExplicitlyDeactivated: isDeactivated,
              });
            } catch {
              // Ignore
            }
          }
        }
        return true;
      }

      return false;
    } finally {
      isSyncingFirestoreSub = false;
    }
  }

  function startUserStatusMonitor(_targetUser: AppUser) {
    if (userStatusUnsubscribe) {
      userStatusUnsubscribe();
      userStatusUnsubscribe = null;
    }
    if (statusPollTimer) {
      clearInterval(statusPollTimer);
      statusPollTimer = null;
    }
    // Zero-polling architecture: no background interval checks or periodic polling
  }

  function setExternalSubscriptionStatus(
    nextStatus: 'free' | 'pending' | 'pro',
    plan?: 'monthly' | 'yearly' | null,
    expiresAt?: string | null,
    explicitlyDeactivated?: boolean
  ) {
    if (!user.value) return;

    // Setting Pro clears deactivation
    const isExplicitlyDeactivated =
      nextStatus === 'pro'
        ? false
        : explicitlyDeactivated !== undefined
          ? explicitlyDeactivated
          : Boolean(user.value.isExplicitlyDeactivated && nextStatus === 'free');

    const isPro =
      !isExplicitlyDeactivated &&
      nextStatus === 'pro' &&
      isSubscriptionActiveByDate('pro', true, expiresAt, false);
    const isPending = !isPro && !isExplicitlyDeactivated && nextStatus === 'pending';
    const resolvedStatus: 'free' | 'pending' | 'pro' = isPro
      ? 'pro'
      : isPending
        ? 'pending'
        : 'free';
    const resolvedPlan =
      isPro || isPending ? plan || user.value.subscriptionPlan || 'monthly' : null;
    const resolvedExpires = isPro ? expiresAt ?? user.value.subscriptionExpiresAt ?? null : null;
    const resolvedDeactivated = isPro ? false : Boolean(isExplicitlyDeactivated);

    if (
      user.value.subscriptionStatus !== resolvedStatus ||
      user.value.isPro !== isPro ||
      user.value.subscriptionPlan !== resolvedPlan ||
      user.value.subscriptionExpiresAt !== resolvedExpires ||
      user.value.isExplicitlyDeactivated !== resolvedDeactivated
    ) {
      const wasPending = user.value.subscriptionStatus === 'pending';
      user.value = {
        ...user.value,
        subscriptionStatus: resolvedStatus,
        isPro,
        subscriptionPlan: resolvedPlan,
        subscriptionExpiresAt: resolvedExpires,
        isExplicitlyDeactivated: resolvedDeactivated,
      };
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user.value));
      upsertSavedAccount(user.value);

      if (!isPro) {
        // Deep-clean localStorage caches so stale PRO markers never revive PRO on user activity
        try {
          const uidsToClean = new Set<string>([user.value.uid]);

          // 1. Sanitize the current account in saved accounts in localStorage
          const savedAccountsRaw = localStorage.getItem(SAVED_ACCOUNTS_STORAGE_KEY);
          if (savedAccountsRaw) {
            const list = JSON.parse(savedAccountsRaw);
            if (Array.isArray(list)) {
              let changed = false;
              list.forEach((acc: any) => {
                if (acc && acc.uid === user.value?.uid) {
                  acc.subscriptionStatus = 'free';
                  acc.isPro = false;
                  acc.subscriptionPlan = null;
                  acc.subscriptionExpiresAt = null;
                  changed = true;
                }
              });
              if (changed) {
                localStorage.setItem(SAVED_ACCOUNTS_STORAGE_KEY, JSON.stringify(list));
              }
            }
          }

          // 2. Sanitize persisted financial cache so old __SISAUANG_PRO__ budget items don't re-trigger PRO
          uidsToClean.forEach((targetUid) => {
            const dbCacheKey = `sisa_uang_db_cache_v5_${targetUid}`;
            const rawDbCache = localStorage.getItem(dbCacheKey);
            if (rawDbCache) {
              const parsed = JSON.parse(rawDbCache);
              if (parsed && Array.isArray(parsed.budgets)) {
                parsed.budgets = parsed.budgets.filter(
                  (b: any) => b.category !== '__SISAUANG_PRO__'
                );
                localStorage.setItem(dbCacheKey, JSON.stringify(parsed));
              }
            }
          });
        } catch {
          // Ignore cache sanitization errors
        }
      }

      if (wasPending && isPro) {
        useNotificationStore().notifySuccess(
          'Langganan SisaUang Pro Disetujui!',
          'Pembayaran Anda telah disetujui oleh Super Admin. Langganan SisaUang Pro Anda kini telah aktif.'
        );
      }
    }
  }

  async function ensureFirestoreUserDocument(
    fbUser: {
      uid: string;
      email: string | null;
      displayName: string | null;
      providerData: { providerId: string }[];
    },
    preferredUsername?: string
  ): Promise<AppUser> {
    const safeUid = sanitizeId(fbUser.uid);
    const safeEmail = sanitizeString(
      fbUser.email || 'user@sisa-uang.id',
      MAX_EMAIL_LENGTH,
      'user@sisa-uang.id'
    ).toLowerCase();
    const defaultUsername = sanitizeString(
      (preferredUsername || safeEmail.split('@')[0] || `user_${safeUid.slice(0, 6)}`)
        .toLowerCase()
        .replace(/\s+/g, '_'),
      60,
      `user_${safeUid.slice(0, 6)}`
    );
    const safeName = sanitizeString(
      fbUser.displayName || defaultUsername,
      MAX_DISPLAY_NAME_LENGTH,
      defaultUsername
    );
    const isGoogle = fbUser.providerData.some((p) => p.providerId.includes('google'));
    const authProvider: 'google' | 'password' = isGoogle ? 'google' : 'password';
    const isAdminEmail =
      safeEmail === SUPER_ADMIN_EMAIL ||
      safeEmail === WORKSPACE_ADMIN_EMAIL;

    let profile: AppUser = {
      uid: safeUid,
      username: isAdminEmail ? SUPER_ADMIN_USERNAME : defaultUsername,
      email: safeEmail,
      displayName: safeName,
      role: isAdminEmail ? 'admin' : 'user',
      status: 'active',
      authProvider,
      currency: 'IDR',
      isFirebaseBacked: true,
    };

    try {
      const snap = await fsGetDoc('users', safeUid, safeUid, true).catch(() =>
        fsGetDoc('users', safeUid, safeUid)
      );
      if (!snap.exists()) {
        // Check if there is an existing migrated user doc with this EXACT email
        let migratedSnapDoc: any = null;
        try {
          const emailMatches = await fsGetDocs(
            'users',
            { wheres: [{ field: 'email', op: '==', value: safeEmail }], limitCount: 1 },
            safeUid,
            true
          ).catch(() =>
            fsGetDocs(
              'users',
              { wheres: [{ field: 'email', op: '==', value: safeEmail }], limitCount: 1 },
              safeUid
            )
          );
          if (!emailMatches.empty) {
            migratedSnapDoc = emailMatches.docs[0];
          }
        } catch {
          // Ignore query error if not permitted
        }

        if (migratedSnapDoc) {
          const existingData = migratedSnapDoc.data();
          const isDeactivated = existingData.isExplicitlyDeactivated === true;
          const candidateExpires = existingData.subscriptionExpiresAt ? String(existingData.subscriptionExpiresAt).slice(0, 10) : null;
          let isPro = false;
          if (!isDeactivated && (existingData.subscriptionStatus === 'pro' || existingData.isPro === true)) {
            if (candidateExpires && /^\d{4}-\d{2}-\d{2}$/.test(candidateExpires)) {
              const now = new Date();
              const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
              isPro = candidateExpires >= todayIso;
            } else {
              isPro = true;
            }
          }
          profile = {
            uid: migratedSnapDoc.id,
            username: existingData.username || defaultUsername,
            email: existingData.email || safeEmail,
            displayName: existingData.displayName || existingData.username || safeName,
            role: isAdminEmail ? 'admin' : existingData.role === 'admin' ? 'admin' : 'user',
            status: existingData.status === 'blocked' ? 'blocked' : 'active',
            authProvider: existingData.authProvider === 'google' ? 'google' : authProvider,
            currency: existingData.currency === 'USD' ? 'USD' : 'IDR',
            subscriptionStatus: isPro ? 'pro' : existingData.subscriptionStatus === 'pending' ? 'pending' : 'free',
            isPro,
            isExplicitlyDeactivated: isDeactivated,
            subscriptionPlan: isPro ? existingData.subscriptionPlan || 'monthly' : null,
            subscriptionExpiresAt: isPro ? candidateExpires : null,
            isFirebaseBacked: true,
          };
        } else if (isDirectFirestoreAuthorized(safeUid)) {
          try {
            await fsSetDoc(
              'users',
              safeUid,
              {
                uid: safeUid,
                username: profile.username,
                email: safeEmail,
                displayName: safeName,
                role: isAdminEmail ? 'admin' : 'user',
                status: 'active',
                authProvider,
                currency: 'IDR',
                createdAt: fsServerTimestamp(),
                updatedAt: fsServerTimestamp(),
              },
              undefined,
              safeUid
            );
          } catch {
            try {
              await fsSetDoc(
                'users',
                safeUid,
                {
                  uid: safeUid,
                  email: safeEmail,
                  displayName: safeName,
                  role: 'user',
                  status: 'active',
                  authProvider,
                  currency: 'IDR',
                  createdAt: fsServerTimestamp(),
                  updatedAt: fsServerTimestamp(),
                },
                undefined,
                safeUid
              );
            } catch {
              // Ignore if remote Console rules restrict creation
            }
          }
        }
      } else {
        const existingData = snap.data() || {};
        const isDeactivated = existingData.isExplicitlyDeactivated === true;
        const candidateExpires = existingData.subscriptionExpiresAt ? String(existingData.subscriptionExpiresAt).slice(0, 10) : null;
        let isPro = false;
        if (!isDeactivated && (existingData.subscriptionStatus === 'pro' || existingData.isPro === true)) {
          if (candidateExpires && /^\d{4}-\d{2}-\d{2}$/.test(candidateExpires)) {
            const now = new Date();
            const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            isPro = candidateExpires >= todayIso;
          } else {
            isPro = true;
          }
        }
        profile = {
          uid: safeUid,
          username: existingData.username || defaultUsername,
          email: safeEmail,
          displayName: existingData.displayName || existingData.username || safeName,
          role: isAdminEmail ? 'admin' : 'user',
          status: existingData.status === 'blocked' ? 'blocked' : 'active',
          authProvider: existingData.authProvider === 'google' ? 'google' : 'password',
          currency: existingData.currency === 'USD' ? 'USD' : 'IDR',
          subscriptionStatus: isPro ? 'pro' : existingData.subscriptionStatus === 'pending' ? 'pending' : 'free',
          isPro,
          isExplicitlyDeactivated: isDeactivated,
          subscriptionPlan: isPro ? existingData.subscriptionPlan || 'monthly' : null,
          subscriptionExpiresAt: isPro ? candidateExpires : null,
          isFirebaseBacked: true,
        };
      }
    } catch {
      // Do not crash app startup if Firestore lookup fails
    }

    // Sync with backend directory via Axios when authenticated
    if (getApiUserToken() || localStorage.getItem('sisa_uang_admin_token')) {
      try {
        const { data } = await apiClient.post('/users/sync', {
          uid: profile.uid,
          username: profile.username,
          email: profile.email,
          displayName: profile.displayName,
          authProvider: profile.authProvider,
          subscriptionStatus: profile.subscriptionStatus,
          isPro: profile.isPro,
          isExplicitlyDeactivated: profile.isExplicitlyDeactivated,
          subscriptionPlan: profile.subscriptionPlan,
          subscriptionExpiresAt: profile.subscriptionExpiresAt,
        });
        if (data?.user) {
          if (data.user.status) {
            profile.status = data.user.status;
          }
          if (data.user.isExplicitlyDeactivated === true) {
            profile.subscriptionStatus = 'free';
            profile.isPro = false;
            profile.isExplicitlyDeactivated = true;
            profile.subscriptionPlan = null;
            profile.subscriptionExpiresAt = null;
          } else if (data.user.subscriptionStatus === 'pro' || data.user.isPro === true) {
            profile.subscriptionStatus = 'pro';
            profile.isPro = true;
            profile.subscriptionPlan = data.user.subscriptionPlan || profile.subscriptionPlan || 'monthly';
            profile.subscriptionExpiresAt = data.user.subscriptionExpiresAt || profile.subscriptionExpiresAt || null;
          } else {
            profile.subscriptionStatus = data.user.subscriptionStatus === 'pending' ? 'pending' : 'free';
            profile.isPro = false;
            profile.subscriptionPlan = null;
            profile.subscriptionExpiresAt = null;
          }
        }
      } catch {
        // Ignore
      }
    }

    return profile;
  }

  let isAuthListenerBound = false;
  let isSuperAdminGoogleLoginPending = false;
  let pendingSuperAdminClientPassword: string | null = null;

  function initAuth() {
    if (needsFirebaseSignOutOnBoot) {
      needsFirebaseSignOutOnBoot = false;
      void firebaseSignOut(auth).catch(() => {});
    }

    loadSavedAccountsFromStorage();
    // Check explicit logout only if no active session was intentionally saved
    const hasSavedSession = Boolean(localStorage.getItem(SESSION_STORAGE_KEY));
    if (hasSavedSession) {
      localStorage.removeItem(EXPLICIT_LOGOUT_KEY);
    }
    const isExplicitlyLoggedOut = !hasSavedSession && localStorage.getItem(EXPLICIT_LOGOUT_KEY) === 'true';

    if (isExplicitlyLoggedOut) {
      user.value = null;
      localStorage.removeItem(SESSION_STORAGE_KEY);
      localStorage.removeItem(OTP_VERIFIED_KEY);
      setApiUserToken(null);
      setApiAdminContext(null, null);
      purgeForeignLocalStorage();
    } else {
      const savedRaw = localStorage.getItem(SESSION_STORAGE_KEY);
      if (savedRaw) {
        try {
          const parsed = JSON.parse(savedRaw) as AppUser;
          if (!parsed.username) {
            parsed.username = parsed.email?.split('@')[0] || 'user';
          }
          const isAdminAccount =
            parsed.role === 'admin' ||
            parsed.email?.toLowerCase() === SUPER_ADMIN_EMAIL ||
            parsed.email?.toLowerCase() === WORKSPACE_ADMIN_EMAIL ||
            parsed.username?.toLowerCase() === SUPER_ADMIN_USERNAME ||
            parsed.uid === 'KlSX6JgegtUIsQinZRKp535OJ6E3' ||
            parsed.uid === 'admin_vuedevo_01';

          const storedToken = localStorage.getItem('sisa_uang_admin_token');
          const storedOtpVerified = localStorage.getItem(OTP_VERIFIED_KEY) === 'true';
          const storedUserToken = getApiUserToken();

          if (isAdminAccount && (!storedToken || !storedOtpVerified)) {
            // Security fix: wipe unverified Super Admin cache completely and cut Firebase Auth session
            user.value = null;
            requiresOtp.value = false;
            otpVerified.value = false;
            localStorage.removeItem(SESSION_STORAGE_KEY);
            localStorage.removeItem(OTP_VERIFIED_KEY);
            localStorage.removeItem('sisa_uang_admin_token');
            setApiUserToken(null);
            setApiAdminContext(null, null);
            purgeForeignLocalStorage();
            void firebaseSignOut(auth).catch(() => {});
          } else if (!isAdminAccount && !storedUserToken) {
            // Clear unauthenticated legacy cache lacking a signed userToken; if Firebase Auth holds
            // a valid Google/email user session, onAuthStateChanged below will immediately exchange idToken cleanly.
            user.value = null;
            localStorage.removeItem(SESSION_STORAGE_KEY);
            setApiAdminContext(null, null);
            purgeForeignLocalStorage();
          } else {
            user.value = parsed;
            purgeForeignLocalStorage(parsed.uid);
            localStorage.removeItem(EXPLICIT_LOGOUT_KEY);

            if (isAdminAccount && storedToken && storedOtpVerified) {
              requiresOtp.value = false;
              otpVerified.value = true;
              setApiAdminContext(parsed.email, storedToken);
              upsertSavedAccount(parsed, storedToken, storedUserToken);
            } else {
              setApiAdminContext(parsed.email, null);
            }

            void registerCurrentDeviceSession(parsed, false);
            void syncSubscriptionFromFirestoreForUser(parsed.uid, parsed.email);
            startUserStatusMonitor(parsed);
          }
        } catch {
          localStorage.removeItem(SESSION_STORAGE_KEY);
          setApiUserToken(null);
          purgeForeignLocalStorage();
        }
      }
    }

    if (isAuthListenerBound) {
      return;
    }
    isAuthListenerBound = true;

    onAuthStateChanged(auth, async (fbUser) => {
      // If user explicitly logged out and has no active local session, DO NOT auto-restore session from Firebase Auth cache!
      if (localStorage.getItem(EXPLICIT_LOGOUT_KEY) === 'true' && !user.value && !localStorage.getItem(SESSION_STORAGE_KEY)) {
        if (fbUser) {
          try {
            await firebaseSignOut(auth);
          } catch {
            // Ignore
          }
        }
        user.value = null;
        isReady.value = true;
        purgeForeignLocalStorage();
        return;
      }

      if (fbUser && !fbUser.isAnonymous) {
        const fbEmail = (fbUser.email || '').toLowerCase();
        const isFbSuperAdmin = fbEmail === SUPER_ADMIN_EMAIL || fbEmail === WORKSPACE_ADMIN_EMAIL;
        const storedToken = localStorage.getItem('sisa_uang_admin_token');
        const storedOtp = localStorage.getItem(OTP_VERIFIED_KEY) === 'true';

        // Strict guard: never leave an ambient Firebase Auth Super Admin session active without verified 2FA OTP & token
        if (isFbSuperAdmin && (!storedToken || !storedOtp)) {
          if (isSuperAdminGoogleLoginPending || (requiresOtp.value && !otpVerified.value)) {
            isReady.value = true;
            return;
          }
          try {
            await firebaseSignOut(auth);
          } catch {
            // Ignore
          }
          if (user.value && (user.value.email?.toLowerCase() === SUPER_ADMIN_EMAIL || user.value.email?.toLowerCase() === WORKSPACE_ADMIN_EMAIL)) {
            user.value = null;
            localStorage.removeItem(SESSION_STORAGE_KEY);
            setApiUserToken(null);
            setApiAdminContext(null, null);
            purgeForeignLocalStorage();
          }
          isReady.value = true;
          return;
        }

        if (user.value || isRegisteringInProgress) {
          isReady.value = true;
          return;
        }

        if (isFbSuperAdmin) {
          isReady.value = true;
          return;
        }

        localStorage.removeItem(EXPLICIT_LOGOUT_KEY);

        try {
          if (!getApiUserToken()) {
            try {
              const idToken = await fbUser.getIdToken();
              const { data: fsData } = await apiClient.post('/auth/firebase-session', { idToken });
              if (fsData?.userToken) {
                setApiUserToken(fsData.userToken);
              }
            } catch {
              // Ignore firebase-session exchange error when offline
            }
          }

          const profile = await ensureFirestoreUserDocument(fbUser);
          const currentActiveUser = user.value as AppUser | null;
          if (!currentActiveUser || currentActiveUser.email.toLowerCase() === profile.email.toLowerCase()) {
            profile.role = 'user';
            user.value = profile;
            localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(profile));
            purgeForeignLocalStorage(profile.uid);
            setApiAdminContext(profile.email, null);
            upsertSavedAccount(profile, null, getApiUserToken());
            await syncSubscriptionFromFirestoreForUser(profile.uid, profile.email);
            void registerCurrentDeviceSession(profile, true);
            startUserStatusMonitor(profile);
          }
        } catch (err) {
          console.error('Error syncing Firebase user:', err);
        }
      }
      isReady.value = true;
    });
  }

  // 1. Login with Email OR Username and Password
  async function loginWithEmail(
    identifierInput: string,
    passwordInput: string
  ): Promise<{ requiresOtp: boolean }> {
    const cleanIdentifier = identifierInput.trim().toLowerCase();
    if (!cleanIdentifier || !passwordInput) {
      const msg = 'Email / Username dan kata sandi wajib diisi.';
      error.value = msg;
      useNotificationStore().notifyError('Validasi Masuk Gagal', msg);
      throw new Error(msg);
    }

    localStorage.removeItem(EXPLICIT_LOGOUT_KEY);
    isLoading.value = true;
    error.value = null;

    try {
      // Step A: Express backend login verifies password against in-memory registry, Cloud Firestore, or Firebase Auth
      const response = await apiClient.post('/auth/login', {
        identifier: cleanIdentifier,
        email: cleanIdentifier,
        password: passwordInput,
      });
      const backendData = response.data;

      const resolvedEmail = String(backendData.user.email || cleanIdentifier).toLowerCase();
      const isLoggedSuperAdmin =
        resolvedEmail === SUPER_ADMIN_EMAIL ||
        resolvedEmail === WORKSPACE_ADMIN_EMAIL;

      const loggedInUser: AppUser = {
        ...backendData.user,
        username:
          backendData.user.username ||
          resolvedEmail.split('@')[0] ||
          cleanIdentifier,
        displayName:
          backendData.user.displayName ||
          backendData.user.username ||
          resolvedEmail.split('@')[0],
        isFirebaseBacked: true,
      };

      if (isLoggedSuperAdmin) {
        // Strict: Super Admin MUST complete 2FA OTP verification before becoming authenticated.
        // Set requiresOtp=true & clear all active tokens BEFORE setting user.value so watchers never treat session as active.
        pendingSuperAdminClientPassword = passwordInput;
        loggedInUser.role = 'admin';
        setApiUserToken(null);
        localStorage.removeItem('sisa_uang_admin_token');
        localStorage.setItem(OTP_VERIFIED_KEY, 'false');
        setApiAdminContext(null, null);
        requiresOtp.value = true;
        otpVerified.value = false;

        if (auth.currentUser) {
          await firebaseSignOut(auth).catch(() => {});
        }

        localStorage.removeItem(EXPLICIT_LOGOUT_KEY);
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(loggedInUser));
        purgeForeignLocalStorage(loggedInUser.uid);
        user.value = loggedInUser;

        if (!backendData.otpDispatch) {
          try {
            const { data: otpData } = await apiClient.post('/auth/request-otp', {
              email: loggedInUser.email,
            });
            backendData.otpDispatch = otpData;
          } catch {
            backendData.otpDispatch = null;
          }
        }

        otpDispatchInfo.value = backendData.otpDispatch
          ? {
              ...backendData.otpDispatch,
              dispatchedAt: Date.now(),
            }
          : null;
        saveOtpDispatchToSessionStorage(otpDispatchInfo.value);
        if (otpDispatchInfo.value?.smtpSent === false) {
          useNotificationStore().notifyError(
            'Pengiriman Email OTP Gagal',
            otpDispatchInfo.value.smtpError ||
              `Email OTP gagal dikirim ke ${loggedInUser.email}. Klik Kirim Ulang Kode setelah konfigurasi SMTP diperbaiki.`
          );
        } else if (otpDispatchInfo.value) {
          useNotificationStore().notifySuccess(
            'Kode OTP Terkirim ke Email',
            otpDispatchInfo.value.message ||
              `Masukkan 6-digit kode verifikasi yang dikirim ke ${loggedInUser.email}. Periksa folder Inbox atau Spam.`
          );
        }
        return { requiresOtp: true };
      }

      // Regular user: Prepare ALL tokens & Firebase Auth session BEFORE assigning user.value
      pendingSuperAdminClientPassword = null;
      localStorage.removeItem('sisa_uang_admin_token');
      localStorage.setItem(OTP_VERIFIED_KEY, 'false');
      requiresOtp.value = false;
      otpVerified.value = false;
      setApiUserToken(backendData.userToken || null);
      setApiAdminContext(loggedInUser.email, null);

      if (auth.currentUser && auth.currentUser.email?.toLowerCase() !== resolvedEmail) {
        await firebaseSignOut(auth).catch(() => {});
      }
      if (resolvedEmail && resolvedEmail.includes('@')) {
        try {
          await signInWithEmailAndPassword(auth, resolvedEmail, passwordInput);
        } catch {
          // Hybrid / migrated users use backend userToken + /api/user-db bridge seamlessly
        }
      }

      localStorage.removeItem(EXPLICIT_LOGOUT_KEY);
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(loggedInUser));
      purgeForeignLocalStorage(loggedInUser.uid);
      user.value = loggedInUser;

      await syncSubscriptionFromFirestoreForUser(loggedInUser.uid, loggedInUser.email);
      upsertSavedAccount(
        (user.value as AppUser) || loggedInUser,
        null,
        backendData.userToken || getApiUserToken()
      );
      await registerCurrentDeviceSession((user.value as AppUser) || loggedInUser, true);
      startUserStatusMonitor((user.value as AppUser) || loggedInUser);

      useNotificationStore().notifySuccess(
        'Berhasil Masuk',
        `Selamat datang kembali, ${loggedInUser.displayName} (@${loggedInUser.username})!`
      );
      return { requiresOtp: false };
    } catch (err: any) {
      // Fallback ONLY if backend returned 404/network error for a native Firebase Auth non-admin email user
      const errStatus = err?.response?.status;
      if (
        (!errStatus || errStatus === 404) &&
        cleanIdentifier.includes('@') &&
        cleanIdentifier !== SUPER_ADMIN_EMAIL &&
        cleanIdentifier !== WORKSPACE_ADMIN_EMAIL
      ) {
        try {
          const cred = await signInWithEmailAndPassword(auth, cleanIdentifier, passwordInput);
          const idToken = await cred.user.getIdToken();
          const { data: fsData } = await apiClient.post('/auth/firebase-session', { idToken });
          requiresOtp.value = false;
          otpVerified.value = false;
          localStorage.removeItem('sisa_uang_admin_token');
          localStorage.setItem(OTP_VERIFIED_KEY, 'false');
          if (fsData?.userToken) {
            setApiUserToken(fsData.userToken);
          }
          const profile = fsData?.user
            ? ({ ...fsData.user, isFirebaseBacked: true } as AppUser)
            : await ensureFirestoreUserDocument(cred.user);
          localStorage.removeItem(EXPLICIT_LOGOUT_KEY);
          localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(profile));
          purgeForeignLocalStorage(profile.uid);
          setApiAdminContext(profile.email, null);
          user.value = profile;
          upsertSavedAccount(profile, null, fsData?.userToken || getApiUserToken());
          await registerCurrentDeviceSession(profile, true);
          startUserStatusMonitor(profile);

          useNotificationStore().notifySuccess(
            'Berhasil Masuk',
            `Selamat datang kembali, ${profile.displayName} (@${profile.username})!`
          );
          return { requiresOtp: false };
        } catch {
          // Proceed to error notification
        }
      }

      if (isFirestoreQuotaError(err)) {
        const quotaMsg = 'Terjadi kesalahan sistem, mohon maaf atas ketidaknyamannya';
        error.value = quotaMsg;
        useNotificationStore().notifyQuotaExceeded();
        throw new Error(quotaMsg);
      }

      const msg =
        err?.response?.data?.error ||
        (err instanceof Error ? err.message : 'Gagal masuk. Periksa email/username dan kata sandi Anda.');
      error.value = msg;
      useNotificationStore().notifyError('Autentikasi Gagal', err, msg);
      throw new Error(msg);
    } finally {
      isLoading.value = false;
    }
  }

  // 2. Manual Registration with Username, DisplayName, Email, and Password
  async function registerWithEmail(
    displayNameInput: string,
    emailInput: string,
    passwordInput: string,
    usernameInput?: string
  ): Promise<{ requiresOtp: boolean }> {
    localStorage.removeItem(EXPLICIT_LOGOUT_KEY);
    isLoading.value = true;
    isRegisteringInProgress = true;
    error.value = null;
    const cleanEmail = emailInput.trim().toLowerCase();
    const cleanUsername = sanitizeString(
      (usernameInput || cleanEmail.split('@')[0] || 'user').trim().toLowerCase().replace(/\s+/g, '_'),
      60,
      cleanEmail.split('@')[0] || 'user'
    );
    const cleanName = sanitizeString(
      displayNameInput,
      MAX_DISPLAY_NAME_LENGTH,
      cleanUsername
    );

    try {
      let fbUid: string | undefined;
      let idToken: string | undefined;
      let isFbAuthenticated = false;

      // Clear any previous foreign Firebase Auth session before registering
      if (auth.currentUser && auth.currentUser.email?.toLowerCase() !== cleanEmail) {
        await firebaseSignOut(auth).catch(() => {});
      }

      try {
        const cred = await createUserWithEmailAndPassword(auth, cleanEmail, passwordInput);
        await updateProfile(cred.user, { displayName: cleanName });
        fbUid = cred.user.uid;
        idToken = await cred.user.getIdToken();
        isFbAuthenticated = true;
      } catch {
        // Fallback to hybrid backend registration if email already exists in Firebase Auth
      }

      const { data } = await apiClient.post('/auth/register', {
        uid: fbUid,
        username: cleanUsername,
        email: cleanEmail,
        password: passwordInput,
        displayName: cleanName,
        idToken,
      });

      if (data.userToken) {
        setApiUserToken(data.userToken);
      }

      const resolvedUid = sanitizeId(data.user?.uid || fbUid || `user_${Date.now()}`);

      // Sync newly registered user document to Cloud Firestore via authorized client or bridge
      if (hasActiveFirestoreAccess(resolvedUid)) {
        try {
          const snap = await fsGetDoc('users', resolvedUid, resolvedUid);
          if (!snap.exists()) {
            await fsSetDoc(
              'users',
              resolvedUid,
              {
                uid: resolvedUid,
                username: data.user?.username || cleanUsername,
                email: cleanEmail,
                displayName: data.user?.displayName || cleanName,
                role: 'user',
                status: 'active',
                authProvider: 'password',
                currency: 'IDR',
                subscriptionStatus: 'free',
                isPro: false,
                deleted: false,
                deletedAt: null,
                createdAt: fsServerTimestamp(),
                updatedAt: fsServerTimestamp(),
              },
              undefined,
              resolvedUid
            );
          } else {
            const existingData = snap.data();
            if (!existingData?.username && (data.user?.username || cleanUsername)) {
              await fsUpdateDoc(
                'users',
                resolvedUid,
                {
                  username: data.user?.username || cleanUsername,
                  displayName: data.user?.displayName || cleanName,
                  updatedAt: fsServerTimestamp(),
                },
                resolvedUid
              ).catch(() => {});
            }
          }
        } catch {
          // Server already persisted user document
        }
      }

      const registeredUser: AppUser = {
        ...data.user,
        role: 'user',
        username: data.user.username || cleanUsername,
        displayName: data.user.displayName || cleanName,
        isFirebaseBacked: isFbAuthenticated,
      };
      const needsOtp = Boolean(data.requiresOtp);
      requiresOtp.value = needsOtp;
      otpVerified.value = false;
      localStorage.removeItem(EXPLICIT_LOGOUT_KEY);
      localStorage.removeItem('sisa_uang_admin_token');
      localStorage.setItem(OTP_VERIFIED_KEY, 'false');
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(registeredUser));
      purgeForeignLocalStorage(registeredUser.uid);
      setApiAdminContext(registeredUser.email, null);
      user.value = registeredUser;
      upsertSavedAccount(registeredUser, null, data.userToken || getApiUserToken());
      await registerCurrentDeviceSession(registeredUser, true);
      startUserStatusMonitor(registeredUser);

      if (needsOtp) {
        otpDispatchInfo.value = data.otpDispatch || null;
        useNotificationStore().notifySuccess(
          'Kode Verifikasi OTP Dikirim',
          `Kode verifikasi telah dikirim ke ${registeredUser.email}.`
        );
        return { requiresOtp: true };
      }

      useNotificationStore().notifySuccess(
        'Pendaftaran Akun Berhasil',
        `Akun ${registeredUser.displayName} (@${registeredUser.username}) berhasil dibuat.`
      );
      return { requiresOtp: false };
    } catch (err: any) {
      if (isFirestoreQuotaError(err)) {
        const quotaMsg = 'Terjadi kesalahan sistem, mohon maaf atas ketidaknyamannya';
        error.value = quotaMsg;
        useNotificationStore().notifyQuotaExceeded();
        throw new Error(quotaMsg);
      }
      const msg =
        err?.response?.data?.error ||
        (err instanceof Error ? err.message : 'Gagal mendaftarkan akun baru.');
      error.value = msg;
      useNotificationStore().notifyError('Pendaftaran Gagal', err, msg);
      throw new Error(msg);
    } finally {
      isRegisteringInProgress = false;
      isLoading.value = false;
    }
  }

  // 3. Update User Profile (displayName & username) after login
  async function updateUserProfile(newDisplayName: string, newUsername?: string) {
    if (!user.value) return;
    const notify = useNotificationStore();

    const safeDisplayName = sanitizeString(
      newDisplayName,
      MAX_DISPLAY_NAME_LENGTH,
      user.value.displayName
    );
    const safeUsername = sanitizeString(
      (newUsername || user.value.username || user.value.email.split('@')[0])
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_'),
      60,
      user.value.username
    );

    if (!safeDisplayName) {
      notify.notifyError('Validasi Profil Gagal', 'Nama tampilan (Display Name) tidak boleh kosong.');
      return;
    }

    isLoading.value = true;
    try {
      // 1. Update backend server registry (also persists to Firestore server-side)
      try {
        await apiClient.patch(`/users/${encodeURIComponent(user.value.uid)}/profile`, {
          displayName: safeDisplayName,
          username: safeUsername,
        });
      } catch {
        // Ignore if user only in Firestore
      }

      // 2. Update Firestore user document if client has direct authorization
      if (isDirectFirestoreAuthorized(user.value.uid)) {
        try {
          await fsUpdateDoc(
            'users',
            user.value.uid,
            {
              displayName: safeDisplayName,
              username: safeUsername,
              updatedAt: fsServerTimestamp(),
            },
            user.value.uid
          );
        } catch {
          // Ignore if doc doesn't exist yet
        }
      }

      user.value = {
        ...user.value,
        displayName: safeDisplayName,
        username: safeUsername,
      };
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user.value));
      upsertSavedAccount(user.value);

      await recordAuditLog(
        'profile_updated',
        `Pengguna memperbarui profil: Display Name "${safeDisplayName}" (@${safeUsername}).`,
        'info'
      );

      notify.notifySuccess(
        'Profil Berhasil Diperbarui',
        `Nama tampilan Anda kini diatur menjadi "${safeDisplayName}" (@${safeUsername}).`
      );
    } catch (err) {
      notify.notifyError('Gagal Memperbarui Profil', err);
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  // 3B. Change User Password after login
  async function changeUserPassword(currentPassword: string, newPassword: string): Promise<boolean> {
    if (!user.value) return false;
    const notify = useNotificationStore();

    if (!newPassword || newPassword.length < 6) {
      notify.notifyError('Validasi Kata Sandi Gagal', 'Kata sandi baru harus terdiri dari minimal 6 karakter.');
      return false;
    }

    isLoading.value = true;
    error.value = null;

    try {
      // 1. Verify currentPassword and update hash on backend + Firestore server-side
      await apiClient.patch(`/users/${encodeURIComponent(user.value.uid)}/password`, {
        email: user.value.email,
        currentPassword,
        newPassword,
      });

      // 2. Update Firebase Auth password if the active Firebase session belongs to this user
      const fbUser = auth.currentUser;
      if (
        fbUser &&
        !fbUser.isAnonymous &&
        fbUser.email &&
        fbUser.email.toLowerCase() === user.value.email.toLowerCase()
      ) {
        try {
          if (currentPassword) {
            const cred = EmailAuthProvider.credential(fbUser.email, currentPassword);
            await reauthenticateWithCredential(fbUser, cred);
          }
        } catch {
          // Ignore re-auth error if user logged in via Google or hybrid session
        }

        try {
          await updatePassword(fbUser, newPassword);
        } catch {
          // Ignore if Firebase Auth session is managed via hybrid backend/Firestore
        }
      }

      user.value = {
        ...user.value,
        authProvider: 'password',
      };
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user.value));

      await recordAuditLog(
        'password_changed',
        `Pengguna ${user.value.displayName} (@${user.value.username}) berhasil mengubah kata sandi akun.`,
        'info'
      );

      notify.notifySuccess(
        'Kata Sandi Berhasil Diubah',
        'Kata sandi akun Anda telah berhasil diperbarui dan siap digunakan untuk sesi masuk berikutnya.'
      );
      return true;
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ||
        (err instanceof Error ? err.message : 'Gagal mengubah kata sandi. Pastikan kata sandi saat ini benar.');
      error.value = msg;
      notify.notifyError('Gagal Mengubah Kata Sandi', err, msg);
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  // 3C. Reset Password by Email or Username from Login / Auth Screen
  async function resetUserPassword(identifierInput: string, newPassword: string): Promise<boolean> {
    const notify = useNotificationStore();
    const cleanIdentifier = identifierInput.trim().toLowerCase();

    if (!cleanIdentifier) {
      notify.notifyError('Validasi Reset Sandi', 'Masukkan alamat email atau username akun Anda.');
      return false;
    }
    if (!newPassword || newPassword.length < 6) {
      notify.notifyError('Validasi Kata Sandi Gagal', 'Kata sandi baru harus terdiri dari minimal 6 karakter.');
      return false;
    }

    isLoading.value = true;
    error.value = null;

    try {
      // Backend handles lookup across server registry + Firestore and persists new hash securely
      await apiClient.post('/auth/reset-password', {
        identifier: cleanIdentifier,
        newPassword,
      });

      notify.notifySuccess(
        'Reset Kata Sandi Berhasil',
        'Kata sandi baru berhasil disimpan. Silakan masuk menggunakan kata sandi baru Anda.'
      );
      return true;
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ||
        (err instanceof Error ? err.message : 'Gagal mereset kata sandi. Pastikan email atau username terdaftar.');
      error.value = msg;
      notify.notifyError('Reset Kata Sandi Gagal', err, msg);
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  // 4. Login / Register with Google Account (Firebase Popup)
  async function loginWithGoogle(): Promise<{ requiresOtp: boolean }> {
    localStorage.removeItem(EXPLICIT_LOGOUT_KEY);
    isLoading.value = true;
    error.value = null;
    isSuperAdminGoogleLoginPending = true;

    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const idToken = await cred.user.getIdToken();
      const { data: fsData } = await apiClient.post('/auth/firebase-session', { idToken });

      const fbEmail = String(cred.user.email || fsData?.user?.email || '').toLowerCase();
      const isGoogleSuperAdmin =
        fbEmail === SUPER_ADMIN_EMAIL || fbEmail === WORKSPACE_ADMIN_EMAIL;

      if (!isGoogleSuperAdmin && fsData?.userToken) {
        setApiUserToken(fsData.userToken);
      } else if (isGoogleSuperAdmin) {
        setApiUserToken(null);
      }

      const profile: AppUser = fsData?.user
        ? { ...fsData.user, isFirebaseBacked: true }
        : await ensureFirestoreUserDocument(cred.user);

      if (profile.status === 'blocked') {
        error.value = 'Akses akun Anda sedang diblokir oleh Administrator.';
        useNotificationStore().notifyError('Akses Diblokir', error.value);
        throw new Error(error.value);
      }

      if (isGoogleSuperAdmin) {
        profile.role = 'admin';
        setApiUserToken(null);
        localStorage.removeItem('sisa_uang_admin_token');
        localStorage.setItem(OTP_VERIFIED_KEY, 'false');
        setApiAdminContext(null, null);
        requiresOtp.value = true;
        otpVerified.value = false;
        localStorage.removeItem(EXPLICIT_LOGOUT_KEY);
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(profile));
        purgeForeignLocalStorage(profile.uid);
        user.value = profile;

        const otpRes = await requestSuperAdminOtp();
        if (otpRes.autoVerified || !requiresOtp.value) {
          useNotificationStore().notifySuccess(
            'Autentikasi Google Berhasil',
            `Selamat datang kembali, ${profile.displayName}!`
          );
          return { requiresOtp: false };
        }
        return { requiresOtp: true };
      }

      requiresOtp.value = false;
      otpVerified.value = false;
      localStorage.removeItem('sisa_uang_admin_token');
      localStorage.setItem(OTP_VERIFIED_KEY, 'false');
      localStorage.removeItem(EXPLICIT_LOGOUT_KEY);
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(profile));
      purgeForeignLocalStorage(profile.uid);
      setApiAdminContext(profile.email, null);
      user.value = profile;

      upsertSavedAccount(profile, null, fsData?.userToken || getApiUserToken());
      await registerCurrentDeviceSession(profile, true);
      startUserStatusMonitor(profile);
      await syncSubscriptionFromFirestoreForUser(profile.uid, profile.email);

      await recordAuditLog(
        'google_login',
        `Pengguna ${profile.displayName} (${profile.email}) masuk menggunakan Google OAuth.`,
        'info'
      );

      useNotificationStore().notifySuccess(
        'Autentikasi Google Berhasil',
        `Selamat datang, ${profile.displayName}!`
      );
      return { requiresOtp: false };
    } catch (err: any) {
      const msg =
        err instanceof Error ? err.message : 'Autentikasi Google dibatalkan atau gagal.';
      error.value = msg;
      useNotificationStore().notifyError('Autentikasi Google Gagal', err, msg);
      throw new Error(msg);
    } finally {
      isSuperAdminGoogleLoginPending = false;
      isLoading.value = false;
    }
  }

  // 5. Request / Resend 6-digit Email OTP exclusively for Super Admin
  async function requestSuperAdminOtp(): Promise<OtpDispatchInfo> {
    if (!user.value) {
      throw new Error('Tidak ada sesi pengguna aktif.');
    }

    // Client-side 60s cooldown guard to prevent duplicate requests on rapid clicks/re-renders
    const existingSessionInfo = otpDispatchInfo.value || loadOtpDispatchFromSessionStorage(user.value.email);
    if (
      existingSessionInfo &&
      existingSessionInfo.dispatchedAt &&
      Date.now() - existingSessionInfo.dispatchedAt < 60_000 &&
      Date.now() < existingSessionInfo.expiresAt &&
      existingSessionInfo.smtpSent !== false
    ) {
      const waitSec = Math.max(
        1,
        Math.ceil((60_000 - (Date.now() - existingSessionInfo.dispatchedAt)) / 1000)
      );
      otpDispatchInfo.value = {
        ...existingSessionInfo,
        reusedExisting: true,
        cooldownRemainingSec: waitSec,
      };
      useNotificationStore().notifyInfo(
        'Kode OTP Sudah Dikirim',
        `Kode OTP sebelumnya masih aktif. Silakan cek Inbox/Spam atau tunggu ${waitSec} detik untuk mengirim ulang.`
      );
      return otpDispatchInfo.value;
    }

    isLoading.value = true;
    error.value = null;

    try {
      const { data } = await apiClient.post('/auth/request-otp', {
        email: user.value.email,
      });

      const smtpSent = data.smtpSent !== undefined ? Boolean(data.smtpSent) : Boolean(data.sent);
      requiresOtp.value = true;
      otpVerified.value = false;
      const dispatchedAt =
        data.reusedExisting && existingSessionInfo?.dispatchedAt
          ? existingSessionInfo.dispatchedAt
          : Date.now();

      otpDispatchInfo.value = {
        email: data.email || user.value.email,
        expiresAt: data.expiresAt,
        message: data.message,
        sent: smtpSent,
        smtpSent,
        reusedExisting: Boolean(data.reusedExisting),
        cooldownRemainingSec: Number(data.cooldownRemainingSec) || 60,
        dispatchedAt,
        smtpError: data.smtpError || null,
        smtpMessageId: data.smtpMessageId || null,
        fallbackCode: data.fallbackCode,
        autoVerified: false,
      };
      saveOtpDispatchToSessionStorage(otpDispatchInfo.value);

      if (data.reusedExisting) {
        useNotificationStore().notifyInfo(
          'Kode OTP Masih Aktif',
          data.message || `Silakan gunakan kode yang sudah dikirim ke ${otpDispatchInfo.value.email}.`
        );
      } else if (smtpSent) {
        useNotificationStore().notifySuccess(
          'Kode OTP Terkirim ke Email',
          `Kode verifikasi 6-digit telah dikirim ke ${otpDispatchInfo.value.email}. Periksa folder Inbox atau Spam.`
        );
      } else {
        const deliveryErr =
          data.smtpError || `Gagal mengirim email OTP ke ${otpDispatchInfo.value.email}.`;
        error.value = deliveryErr;
        useNotificationStore().notifyError('Pengiriman Email OTP Gagal', deliveryErr);
      }
      return otpDispatchInfo.value;
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Gagal meminta kode OTP Super Admin.';
      error.value = msg;
      useNotificationStore().notifyError('Gagal Meminta OTP', err, msg);
      throw new Error(msg);
    } finally {
      isLoading.value = false;
    }
  }

  // 6. Verify 6-digit Email OTP to unlock /control-panel
  async function verifySuperAdminOtp(codeInput: string): Promise<boolean> {
    if (!user.value) {
      throw new Error('Tidak ada sesi Super Admin aktif.');
    }
    isLoading.value = true;
    error.value = null;

    try {
      const { data } = await apiClient.post('/auth/verify-otp', {
        email: user.value.email,
        code: codeInput.trim(),
      });

      if (data.verified && data.adminToken) {
        const promotedUser: AppUser = {
          ...user.value,
          role: 'admin',
        };
        if (
          auth.currentUser &&
          auth.currentUser.email?.toLowerCase() !== promotedUser.email.toLowerCase()
        ) {
          await firebaseSignOut(auth).catch(() => {});
        }
        const pwForClient = pendingSuperAdminClientPassword;
        pendingSuperAdminClientPassword = null;
        if (
          pwForClient &&
          (!auth.currentUser ||
            auth.currentUser.email?.toLowerCase() !== promotedUser.email.toLowerCase())
        ) {
          try {
            await signInWithEmailAndPassword(auth, promotedUser.email, pwForClient);
          } catch {
            // App password may differ from Firebase Auth password; bridge handles fallback
          }
        }

        // Write all tokens & verification flags to storage BEFORE updating reactive otpVerified/requiresOtp/user
        otpDispatchInfo.value = null;
        saveOtpDispatchToSessionStorage(null);
        localStorage.setItem(OTP_VERIFIED_KEY, 'true');
        if (data.userToken) {
          setApiUserToken(data.userToken);
        }
        setApiAdminContext(promotedUser.email, data.adminToken);
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(promotedUser));
        upsertSavedAccount(promotedUser, data.adminToken, data.userToken || getApiUserToken());

        otpVerified.value = true;
        requiresOtp.value = false;
        user.value = promotedUser;

        void registerCurrentDeviceSession(promotedUser, true);
        startUserStatusMonitor(promotedUser);

        useNotificationStore().notifySuccess(
          'Verifikasi Super Admin Berhasil',
          'Akses penuh ke Control Panel Super Admin telah dibuka.'
        );
        return true;
      }
      return false;
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Kode verifikasi OTP tidak sesuai.';
      error.value = msg;
      useNotificationStore().notifyError('Verifikasi OTP Gagal', err, msg);
      throw new Error(msg);
    } finally {
      isLoading.value = false;
    }
  }

  // 7. Logout
  async function logout(isRevokedByRemote = false) {
    isSuperAdminGoogleLoginPending = false;
    pendingSuperAdminClientPassword = null;
    if (user.value && !isRevokedByRemote) {
      await recordAuditLog('user_logout', `Pengguna ${user.value.email} keluar dari sesi.`, 'info');
    }
    if (userStatusUnsubscribe) {
      userStatusUnsubscribe();
      userStatusUnsubscribe = null;
    }
    if (statusPollTimer) {
      clearInterval(statusPollTimer);
      statusPollTimer = null;
    }
    localStorage.setItem(EXPLICIT_LOGOUT_KEY, 'true');
    localStorage.removeItem(SESSION_STORAGE_KEY);
    localStorage.removeItem(OTP_VERIFIED_KEY);
    localStorage.removeItem('sisa_uang_admin_token');
    localStorage.removeItem('sisa_uang_actor_email');
    setApiUserToken(null);
    setApiAdminContext(null, null);
    purgeForeignLocalStorage();

    user.value = null;
    deviceSessions.value = [];
    primaryDeviceOtpPending.value = null;
    requiresOtp.value = false;
    otpVerified.value = false;
    otpDispatchInfo.value = null;
    saveOtpDispatchToSessionStorage(null);

    try {
      await firebaseSignOut(auth);
    } catch {
      // Ignore
    }
  }

  /**
   * Immediately revokes Super Admin elevation when the server admin token expires or is invalid.
   * Clears the admin token, sets otpVerified to false, signs out Firebase Auth so Firestore access is cut off,
   * and navigates away from protected admin routes (/control-panel, /database) via SPA router without hard reload.
   */
  let isHandlingAdminExpiry = false;
  async function handleAdminSessionExpired(_reason?: string) {
    if (isHandlingAdminExpiry) return;
    isHandlingAdminExpiry = true;
    try {
      localStorage.removeItem('sisa_uang_admin_token');
      localStorage.setItem(OTP_VERIFIED_KEY, 'false');
      otpVerified.value = false;
      setApiAdminContext(user.value?.email || null, null);

      const currentPath =
        typeof window !== 'undefined' && window.location ? window.location.pathname : '';
      const isOnProtectedAdminRoute =
        currentPath.includes('/database') || currentPath.includes('/control-panel');

      if (isOnProtectedAdminRoute) {
        requiresOtp.value = true;
        // Preserve any non-expired OTP dispatch info in sessionStorage so AuthView doesn't treat it as a fresh empty state
        otpDispatchInfo.value = loadOtpDispatchFromSessionStorage(user.value?.email);
        try {
          await firebaseSignOut(auth);
        } catch {
          // Ignore
        }
        try {
          const { router } = await import('../router');
          await router.replace({
            path: '/auth',
            query: { step: 'otp', redirect: currentPath },
          });
        } catch {
          // Ignore router navigation error
        }
      } else {
        // On non-admin routes (e.g. /auth or /dashboard), demote silently without trapping user in unsolicited OTP redirect
        if (user.value && user.value.role === 'admin') {
          user.value = { ...user.value, role: 'user' };
          localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user.value));
        }
        requiresOtp.value = false;
      }
    } finally {
      setTimeout(() => {
        isHandlingAdminExpiry = false;
      }, 1500);
    }
  }

  if (typeof window !== 'undefined' && !(window as any).__sisauang_admin_expired_listener_bound) {
    (window as any).__sisauang_admin_expired_listener_bound = true;
    window.addEventListener('sisauang:admin-session-expired', (e: any) => {
      void handleAdminSessionExpired(e?.detail?.message);
    });
  }

  let isHandlingUserExpiry = false;
  if (typeof window !== 'undefined' && !(window as any).__sisauang_user_expired_listener_bound) {
    (window as any).__sisauang_user_expired_listener_bound = true;
    window.addEventListener('sisauang:user-session-expired', (e: any) => {
      if (isHandlingUserExpiry) return;
      if (!user.value && !localStorage.getItem(SESSION_STORAGE_KEY)) return;
      isHandlingUserExpiry = true;
      const detailMsg =
        e?.detail?.message || 'Sesi login Anda telah kedaluwarsa. Silakan masuk kembali.';
      try {
        useNotificationStore().notifyWarning('Sesi Login Berakhir', detailMsg);
      } catch {
        // Ignore if notification store is not ready
      }
      void logout(true)
        .then(async () => {
          try {
            const currentPath = window.location?.pathname || '';
            const publicPaths = new Set([
              '/',
              '/auth',
              '/pricing',
              '/terms',
              '/refund-policy',
              '/privacy',
              '/contact',
            ]);
            if (currentPath && !publicPaths.has(currentPath)) {
              const { router } = await import('../router');
              await router.replace('/auth');
            }
          } catch {
            // Ignore router navigation error
          }
        })
        .finally(() => {
          setTimeout(() => {
            isHandlingUserExpiry = false;
          }, 1500);
        });
    });
  }

  async function submitProSubscriptionPayment(payload: {
    subscriptionPlan: 'monthly' | 'yearly';
    paymentMethod: 'qris' | 'bank_transfer';
    proofDataUrl: string;
    proofFileName: string;
    senderName?: string;
    transferNote?: string;
  }): Promise<boolean> {
    if (!user.value) return false;
    const notify = useNotificationStore();
    const safeUid = sanitizeId(user.value.uid);

    try {
      const { data } = await apiClient.post(
        `/users/${encodeURIComponent(safeUid)}/subscription-payment`,
        {
          email: user.value.email,
          displayName: user.value.displayName,
          subscriptionPlan: payload.subscriptionPlan,
          paymentMethod: payload.paymentMethod,
          proofDataUrl: payload.proofDataUrl,
          proofFileName: payload.proofFileName,
          senderName: payload.senderName || user.value.displayName,
          transferNote: payload.transferNote || '',
        }
      );

      // Update local user state to pending
      user.value = {
        ...user.value,
        subscriptionStatus: 'pending',
        isPro: false,
        subscriptionPlan: payload.subscriptionPlan,
        subscriptionExpiresAt: null,
        subscriptionPaymentMethod: payload.paymentMethod,
        subscriptionRequestedAt: new Date().toISOString(),
      };
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user.value));

      // Also persist pending marker to Cloud Firestore `/budgets/su_sub_pro_${safeUid}` via authorized client or bridge
      try {
        const proMarkerId = sanitizeId(`su_sub_pro_${safeUid}`);
        const now = new Date();
        const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const planCode = payload.subscriptionPlan === 'yearly' ? 'Y' : 'M';
        const markerPeriod = `P:${planCode}:${todayIso}`;

        await fsSetDoc(
          'budgets',
          proMarkerId,
          {
            ownerId: safeUid,
            category: '__SISAUANG_PRO__',
            limitAmount: 1,
            spentAmount: 0,
            period: markerPeriod,
            deleted: false,
            deletedAt: null,
            createdAt: fsServerTimestamp(),
            updatedAt: fsServerTimestamp(),
          },
          { merge: true },
          safeUid
        );

        await fsUpdateDoc(
          'users',
          safeUid,
          { updatedAt: fsServerTimestamp() },
          safeUid
        ).catch(() => {});
      } catch {
        // Fallback handled by Express server registry
      }

      const planLabel = payload.subscriptionPlan === 'yearly' ? 'Tahunan' : 'Bulanan';
      const methodLabel = payload.paymentMethod === 'qris' ? 'QRIS' : 'Transfer Bank';
      notify.notifySuccess(
        'Pembayaran Sedang Diproses (Menunggu Verifikasi 1–24 Jam)',
        `Bukti pembayaran SisaUang Pro (${planLabel} via ${methodLabel}) telah dikirim ke azzackey@gmail.com. Status langganan Anda kini PENDING dan menunggu verifikasi 1–24 jam oleh Super Admin.`,
        {
          detail: data?.emailDispatched
            ? 'Email konfirmasi beserta lampiran bukti transfer telah terkirim otomatis ke azzackey@gmail.com.'
            : 'Permintaan langganan dan bukti transfer tercatat di antrean persetujuan Super Admin (azzackey@gmail.com).',
          durationMs: 11000,
        }
      );
      return true;
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ||
        (err instanceof Error ? err.message : 'Gagal mengirim bukti pembayaran langganan.');
      notify.notifyError('Gagal Mengirim Bukti Pembayaran', err, msg);
      return false;
    }
  }

  return {
    user,
    isReady,
    isLoading,
    error,
    currentDeviceId,
    deviceSessions,
    isSessionsLoading,
    currentDeviceSession,
    isCurrentDevicePrimary,
    hasAnyPrimaryDevice,
    primaryDeviceOtpPending,
    savedAccounts,
    requiresOtp,
    otpVerified,
    otpDispatchInfo,
    isAuthenticated,
    isSuperAdmin,
    isProUser,
    isPendingProUser,
    canAccessControlPanel,
    setExternalSubscriptionStatus,
    syncSubscriptionFromFirestoreForUser,
    submitProSubscriptionPayment,
    clearError,
    initAuth,
    loginWithEmail,
    registerWithEmail,
    updateUserProfile,
    changeUserPassword,
    resetUserPassword,
    loginWithGoogle,
    requestSuperAdminOtp,
    verifySuperAdminOtp,
    fetchDeviceSessions,
    requestPrimaryDeviceOtp,
    verifyPrimaryDeviceOtp,
    cancelPrimaryDeviceOtp,
    revokeDeviceSession,
    revokeAllOtherDeviceSessions,
    switchAccount,
    removeSavedAccount,
    recordAuditLog,
    logout,
    handleAdminSessionExpired,
  };
});
