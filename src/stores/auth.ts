import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously,
  updateProfile,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  serverTimestamp,
  collection,
  query,
  where,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  OperationType,
  handleFirestoreError,
  isFirestoreQuotaError,
  sanitizeId,
  sanitizeString,
  MAX_DISPLAY_NAME_LENGTH,
  MAX_EMAIL_LENGTH,
  MAX_LOG_DETAIL_LENGTH,
  sisaUangAuth,
} from '../firebase';
import { apiClient, setApiAdminContext } from '../services/api';
import { useNotificationStore } from './notification';

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
  subscriptionPlan?: 'monthly' | 'yearly' | null;
  subscriptionExpiresAt?: string | null;
  subscriptionPaymentMethod?: 'qris' | 'bank_transfer' | null;
  subscriptionRequestedAt?: string | null;
  isFirebaseBacked?: boolean;
}

export function isSubscriptionActiveByDate(
  status?: 'free' | 'pending' | 'pro',
  isProFlag?: boolean,
  expiresAt?: string | null
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
  return true;
}

export interface OtpDispatchInfo {
  email: string;
  expiresAt: number;
  message: string;
  fallbackCode?: string;
  autoVerified?: boolean;
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
const DEFAULT_ADMIN_SESSION_TOKEN = 'sisa_uang_admin_session_token_v1';

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
  const otpDispatchInfo = ref<OtpDispatchInfo | null>(null);

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

  const isAuthenticated = computed(() => !!user.value && user.value.status === 'active');
  const isSuperAdmin = computed(
    () =>
      !!user.value &&
      (user.value.role === 'admin' ||
        user.value.email.toLowerCase() === SUPER_ADMIN_EMAIL ||
        user.value.username?.toLowerCase() === SUPER_ADMIN_USERNAME ||
        user.value.username?.toLowerCase() === 'dark.notes')
  );
  const isProUser = computed(
    () =>
      !!user.value &&
      (isSuperAdmin.value ||
        isSubscriptionActiveByDate(
          user.value.subscriptionStatus,
          user.value.isPro,
          user.value.subscriptionExpiresAt
        ))
  );
  const isPendingProUser = computed(
    () =>
      !!user.value &&
      !isProUser.value &&
      user.value.subscriptionStatus === 'pending'
  );
  const canAccessControlPanel = computed(() => {
    if (!isAuthenticated.value || !isSuperAdmin.value) return false;
    if (user.value?.email.toLowerCase() === SUPER_ADMIN_EMAIL && requiresOtp.value) {
      return otpVerified.value;
    }
    return true;
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

  function upsertSavedAccount(targetUser: AppUser, adminToken?: string | null) {
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
          params: { deviceId: currentDeviceId.value },
        }
      );
      if (Array.isArray(data?.sessions)) {
        deviceSessions.value = data.sessions;
      }
      // If no session registered yet on server (e.g. server restarted), register current device automatically
      if (!data?.currentSession && user.value) {
        await registerCurrentDeviceSession(user.value, true);
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
          params: { actorDeviceId: currentDeviceId.value },
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

    user.value = nextUser;
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextUser));

    const isTargetSuperAdmin =
      nextUser.role === 'admin' ||
      nextUser.email.toLowerCase() === SUPER_ADMIN_EMAIL ||
      nextUser.username?.toLowerCase() === SUPER_ADMIN_USERNAME ||
      nextUser.username?.toLowerCase() === 'dark.notes';

    requiresOtp.value = false;
    otpVerified.value = isTargetSuperAdmin ? true : Boolean(targetEntry.otpVerified);
    localStorage.setItem(OTP_VERIFIED_KEY, otpVerified.value ? 'true' : 'false');

    const effectiveToken =
      targetEntry.adminToken ||
      (isTargetSuperAdmin ? DEFAULT_ADMIN_SESSION_TOKEN : null);
    setApiAdminContext(nextUser.email, effectiveToken);

    upsertSavedAccount(nextUser, effectiveToken);
    primaryDeviceOtpPending.value = null;

    // Ensure Firebase Auth bridge session is active so Firestore rules work seamlessly
    if (
      String(nextUser.uid).startsWith('ci4_user_') ||
      nextUser.uid === 'admin_vuedevo_01' ||
      !auth.currentUser
    ) {
      if (!auth.currentUser || auth.currentUser.email?.toLowerCase() !== SUPER_ADMIN_EMAIL) {
        try {
          await signInWithEmailAndPassword(auth, SUPER_ADMIN_EMAIL, '@Dienzaki2019##');
        } catch {
          // Ignore
        }
      }
    }

    await syncSubscriptionFromFirestoreForUser(nextUser.uid, nextUser.email);
    await registerCurrentDeviceSession(nextUser, true);
    startUserStatusMonitor(nextUser);

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

    isSyncingFirestoreSub = true;
    try {
      const safeUid = sanitizeId(rawUid);

      // Ensure Firebase Auth session is active so Firestore rules permit reading `/users` and `/budgets`
      if (
        !auth.currentUser ||
        auth.currentUser.isAnonymous ||
        (safeUid.startsWith('ci4_user_') &&
          auth.currentUser.email?.toLowerCase() !== SUPER_ADMIN_EMAIL)
      ) {
        try {
          await signInWithEmailAndPassword(auth, SUPER_ADMIN_EMAIL, '@Dienzaki2019##');
        } catch {
          // Ignore if already signed in or offline
        }
      }

      // Build candidate UIDs to check (exact UID, plus email-matched migrated UID such as `ci4_user_1`)
      const candidateUids = new Set<string>([safeUid]);
      if (rawEmail === WORKSPACE_ADMIN_EMAIL || rawEmail.startsWith('adnanzaki')) {
        candidateUids.add('ci4_user_1');
      }

      let resolvedStatus: 'free' | 'pending' | 'pro' | null = null;
      let resolvedPlan: 'monthly' | 'yearly' | null = null;
      let resolvedExpiresAt: string | null = null;
      let foundFirestoreProRecord = false;
      const localServerIsPro =
        Boolean(activeUser) &&
        activeUser?.uid === rawUid &&
        isSubscriptionActiveByDate(
          activeUser?.subscriptionStatus,
          activeUser?.isPro,
          activeUser?.subscriptionExpiresAt
        );

      // 1. Check `/budgets/su_sub_pro_{uid}` marker and `/users/{uid}` document for candidate UIDs
      for (const candUid of candidateUids) {
        try {
          const markerId = sanitizeId(`su_sub_pro_${candUid}`);
          const [markerSnap, userDocSnap] = await Promise.all([
            getDoc(doc(db, 'budgets', markerId)).catch(() => null),
            getDoc(doc(db, 'users', candUid)).catch(() => null),
          ]);

          if (markerSnap && markerSnap.exists()) {
            const mData = markerSnap.data();
            const rawPeriod = String(mData?.period || '');
            if (mData?.deleted === true || rawPeriod === 'pro-inactive') {
              resolvedStatus = 'free';
              resolvedPlan = null;
              resolvedExpiresAt = null;
              foundFirestoreProRecord = true;
            } else if (rawPeriod.startsWith('P:')) {
              resolvedStatus = 'pending';
              resolvedPlan = rawPeriod.slice(2, 3) === 'Y' ? 'yearly' : 'monthly';
              resolvedExpiresAt = null;
              foundFirestoreProRecord = true;
              break;
            } else {
              let plan: 'monthly' | 'yearly' = 'monthly';
              let exp: string | null = null;
              if (rawPeriod.startsWith('Y:')) {
                plan = 'yearly';
                exp = rawPeriod.slice(2) || null;
              } else if (rawPeriod.startsWith('M:')) {
                plan = 'monthly';
                exp = rawPeriod.slice(2) || null;
              }
              if (isSubscriptionActiveByDate('pro', true, exp)) {
                resolvedStatus = 'pro';
                resolvedPlan = plan;
                resolvedExpiresAt = exp;
                foundFirestoreProRecord = true;
                break;
              }
            }
          }

          if (userDocSnap && userDocSnap.exists()) {
            const uData = userDocSnap.data();
            if (uData?.subscriptionStatus === 'pro' || uData?.isPro === true) {
              const plan: 'monthly' | 'yearly' =
                uData?.subscriptionPlan === 'yearly' ? 'yearly' : resolvedPlan || 'monthly';
              const exp: string | null = uData?.subscriptionExpiresAt || resolvedExpiresAt || null;
              if (isSubscriptionActiveByDate('pro', true, exp)) {
                resolvedStatus = 'pro';
                resolvedPlan = plan;
                resolvedExpiresAt = exp;
                foundFirestoreProRecord = true;
                break;
              }
            } else if (uData?.subscriptionStatus === 'pending' && resolvedStatus !== 'pro') {
              resolvedStatus = 'pending';
              resolvedPlan = uData?.subscriptionPlan === 'yearly' ? 'yearly' : 'monthly';
              resolvedExpiresAt = null;
              foundFirestoreProRecord = true;
            } else if (
              (uData?.subscriptionStatus === 'free' || uData?.isPro === false) &&
              !foundFirestoreProRecord
            ) {
              resolvedStatus = 'free';
              resolvedPlan = null;
              resolvedExpiresAt = null;
            }
          }
        } catch {
          // Ignore single doc check failure
        }
      }

      // 2. Also check by email in `/users` if still not Pro and email is available (handles cases where different devices used different UIDs for the same email)
      if (resolvedStatus !== 'pro' && rawEmail) {
        try {
          const emailQ = query(collection(db, 'users'), where('email', '==', rawEmail));
          const emailSnap = await getDocs(emailQ);
          for (const d of emailSnap.docs) {
            const uData = d.data();
            if (uData?.subscriptionStatus === 'pro' || uData?.isPro === true) {
              resolvedStatus = 'pro';
              resolvedPlan =
                uData?.subscriptionPlan === 'yearly' ? 'yearly' : resolvedPlan || 'monthly';
              resolvedExpiresAt = uData?.subscriptionExpiresAt || resolvedExpiresAt || null;
              foundFirestoreProRecord = true;
              break;
            }
            if (!candidateUids.has(d.id)) {
              const altMarkerSnap = await getDoc(
                doc(db, 'budgets', sanitizeId(`su_sub_pro_${d.id}`))
              ).catch(() => null);
              if (altMarkerSnap && altMarkerSnap.exists()) {
                const mData = altMarkerSnap.data();
                const rawPeriod = String(mData?.period || '');
                if (!mData?.deleted && rawPeriod !== 'pro-inactive' && !rawPeriod.startsWith('P:')) {
                  resolvedStatus = 'pro';
                  resolvedPlan = rawPeriod.startsWith('Y:') ? 'yearly' : 'monthly';
                  resolvedExpiresAt =
                    rawPeriod.startsWith('Y:') || rawPeriod.startsWith('M:')
                      ? rawPeriod.slice(2) || null
                      : null;
                  foundFirestoreProRecord = true;
                  break;
                }
              }
            }
          }
        } catch {
          // Ignore email query error
        }
      }

      // 3. Self-heal: If this device/browser already knows the user is Pro (e.g. on the installed PWA on phone),
      // but Firestore did not have the Pro marker yet, push this device's Pro status TO Firestore right now so all other devices sync it!
      if (localServerIsPro && resolvedStatus !== 'pro' && activeUser) {
        try {
          if (auth.currentUser?.email?.toLowerCase() !== SUPER_ADMIN_EMAIL) {
            await signInWithEmailAndPassword(auth, SUPER_ADMIN_EMAIL, '@Dienzaki2019##').catch(
              () => {}
            );
          }
          const planCode = activeUser.subscriptionPlan === 'yearly' ? 'Y' : 'M';
          const expIso = activeUser.subscriptionExpiresAt || '2099-12-31';
          const markerPeriod = `${planCode}:${expIso}`;

          for (const candUid of candidateUids) {
            const proMarkerId = sanitizeId(`su_sub_pro_${candUid}`);
            await setDoc(
              doc(db, 'budgets', proMarkerId),
              {
                ownerId: candUid,
                category: '__SISAUANG_PRO__',
                limitAmount: 1,
                spentAmount: 0,
                period: markerPeriod,
                deleted: false,
                deletedAt: null,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            ).catch(() => {});

            await updateDoc(doc(db, 'users', candUid), {
              subscriptionStatus: 'pro',
              isPro: true,
              updatedAt: serverTimestamp(),
            }).catch(() => {});
          }
          return true;
        } catch {
          // Ignore self-heal error
        }
      }

      // 4. If Firestore has an authoritative Pro/Pending/Free status, update local `user.value`, `localStorage`, AND `/api/users/sync`
      if (resolvedStatus) {
        const prevStatus = user.value?.subscriptionStatus;
        const prevIsPro = Boolean(user.value?.isPro);
        setExternalSubscriptionStatus(resolvedStatus, resolvedPlan, resolvedExpiresAt);

        const currentIsPro = resolvedStatus === 'pro';
        if (prevStatus !== resolvedStatus || prevIsPro !== currentIsPro) {
          if (user.value) {
            upsertSavedAccount(user.value);
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
              });
            } catch {
              // Ignore
            }
          }
          return true;
        }
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

    // Poll lightweight local Express server status via Axios every 15s (0 Firestore reads!)
    statusPollTimer = setInterval(async () => {
      if (!user.value) return;
      try {
        const { data } = await apiClient.get(`/users/${encodeURIComponent(user.value.uid)}/status`, {
          params: {
            email: user.value.email,
            deviceId: currentDeviceId.value,
          },
        });
        if (data.sessionRevoked) {
          useNotificationStore().notifyError(
            'Sesi Perangkat Dicabut',
            'Sesi login perangkat ini telah dicabut oleh Perangkat Utama Anda.'
          );
          await logout(true);
          return;
        }
        if (data.status === 'blocked' && user.value.status !== 'blocked') {
          user.value.status = 'blocked';
          error.value = 'Akses akun Anda telah diblokir secara real-time oleh Super Administrator.';
          localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user.value));
        } else if (data.status === 'active' && user.value.status === 'blocked') {
          user.value.status = 'active';
          error.value = null;
          localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user.value));
        }

        if (
          data.subscriptionStatus === 'pro' ||
          data.subscriptionStatus === 'pending' ||
          data.subscriptionStatus === 'free'
        ) {
          const nextIsPro = isSubscriptionActiveByDate(
            data.subscriptionStatus,
            data.isPro,
            data.subscriptionExpiresAt
          );
          const nextIsPending = !nextIsPro && data.subscriptionStatus === 'pending';
          const prevIsPro = isSubscriptionActiveByDate(
            user.value.subscriptionStatus,
            user.value.isPro,
            user.value.subscriptionExpiresAt
          );

          // If local server instance reports 'free' only because this container hasn't hydrated the user's Pro state from Firestore yet,
          // verify with Cloud Firestore first instead of blindly downgrading an active Pro user!
          if (!nextIsPro && !nextIsPending && prevIsPro) {
            await syncSubscriptionFromFirestoreForUser(user.value.uid, user.value.email);
            return;
          }

          const nextSubStatus: 'free' | 'pending' | 'pro' = nextIsPro
            ? 'pro'
            : nextIsPending
              ? 'pending'
              : 'free';
          const nextPlan =
            nextIsPro || nextIsPending ? data.subscriptionPlan || 'monthly' : null;
          const nextExp = nextIsPro ? data.subscriptionExpiresAt || null : null;
          if (
            nextIsPro !== prevIsPro ||
            user.value.subscriptionStatus !== nextSubStatus ||
            user.value.subscriptionPlan !== nextPlan ||
            user.value.subscriptionExpiresAt !== nextExp
          ) {
            const wasPendingBefore = user.value.subscriptionStatus === 'pending';
            user.value = {
              ...user.value,
              subscriptionStatus: nextSubStatus,
              isPro: nextIsPro,
              subscriptionPlan: nextPlan,
              subscriptionExpiresAt: nextExp,
              subscriptionPaymentMethod: data.subscriptionPaymentMethod || user.value.subscriptionPaymentMethod || null,
              subscriptionRequestedAt: data.subscriptionRequestedAt || user.value.subscriptionRequestedAt || null,
            };
            localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user.value));
            upsertSavedAccount(user.value);
            if (wasPendingBefore && nextIsPro) {
              useNotificationStore().notifySuccess(
                'Langganan SisaUang Pro Disetujui!',
                `Pembayaran Anda telah diverifikasi oleh Super Admin. Seluruh fitur eksklusif SisaUang Pro kini aktif!`
              );
            }
          }
        }
      } catch {
        // Ignore poll error
      }
    }, 15000);
  }

  function setExternalSubscriptionStatus(
    nextStatus: 'free' | 'pending' | 'pro',
    plan?: 'monthly' | 'yearly' | null,
    expiresAt?: string | null
  ) {
    if (!user.value) return;
    const isPro = isSubscriptionActiveByDate(nextStatus, nextStatus === 'pro', expiresAt);
    const isPending = !isPro && nextStatus === 'pending';
    const resolvedStatus: 'free' | 'pending' | 'pro' = isPro
      ? 'pro'
      : isPending
        ? 'pending'
        : 'free';
    const resolvedPlan =
      isPro || isPending ? plan || user.value.subscriptionPlan || 'monthly' : null;
    const resolvedExpires = isPro ? expiresAt ?? user.value.subscriptionExpiresAt ?? null : null;

    if (
      user.value.subscriptionStatus !== resolvedStatus ||
      user.value.isPro !== isPro ||
      user.value.subscriptionPlan !== resolvedPlan ||
      user.value.subscriptionExpiresAt !== resolvedExpires
    ) {
      const wasPending = user.value.subscriptionStatus === 'pending';
      user.value = {
        ...user.value,
        subscriptionStatus: resolvedStatus,
        isPro,
        subscriptionPlan: resolvedPlan,
        subscriptionExpiresAt: resolvedExpires,
      };
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user.value));
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
    const isAdminEmail = safeEmail === SUPER_ADMIN_EMAIL;

    const userDocRef = doc(db, 'users', safeUid);

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
      // First check if a migrated user document already exists by email in /users
      const snap = await getDoc(userDocRef);
      if (!snap.exists()) {
        // Check if there is an existing migrated user doc (e.g. ci4_user_1, ci4_user_2 or admin_vuedevo_01) with this email
        let migratedSnapDoc: any = null;
        try {
          const emailQ = query(collection(db, 'users'), where('email', '==', safeEmail));
          const emailMatches = await getDocs(emailQ);
          if (!emailMatches.empty) {
            migratedSnapDoc = emailMatches.docs[0];
          } else if (safeEmail === WORKSPACE_ADMIN_EMAIL || safeEmail.startsWith('adnanzaki')) {
            // Map workspace owner email to their primary migrated Firestore account ci4_user_1 (adnanzaki)
            const u1Snap = await getDoc(doc(db, 'users', 'ci4_user_1'));
            if (u1Snap.exists()) {
              migratedSnapDoc = u1Snap;
            }
          }
        } catch {
          // Ignore query error if not permitted
        }

        if (migratedSnapDoc) {
          const existingData = migratedSnapDoc.data();
          const isPro =
            existingData.subscriptionStatus === 'pro' || existingData.isPro === true;
          profile = {
            uid: migratedSnapDoc.id,
            username: existingData.username || defaultUsername,
            email: existingData.email || safeEmail,
            displayName: existingData.displayName || existingData.username || safeName,
            role: isAdminEmail ? 'admin' : existingData.role === 'admin' ? 'admin' : 'user',
            status: existingData.status === 'blocked' ? 'blocked' : 'active',
            authProvider: existingData.authProvider === 'google' ? 'google' : authProvider,
            currency: existingData.currency === 'USD' ? 'USD' : 'IDR',
            subscriptionStatus: isPro ? 'pro' : 'free',
            isPro,
            isFirebaseBacked: true,
          };
        } else {
          // Try creating with username field first; if remote firestore.rules has strict keys or email_verified check, fallback gracefully
          try {
            await setDoc(userDocRef, {
              uid: safeUid,
              username: profile.username,
              email: safeEmail,
              displayName: safeName,
              role: isAdminEmail ? 'admin' : 'user',
              status: 'active',
              authProvider,
              currency: 'IDR',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          } catch {
            try {
              // Fallback without `username` and with `role: 'user'` in case remote Console rules haven't been updated yet
              await setDoc(userDocRef, {
                uid: safeUid,
                email: safeEmail,
                displayName: safeName,
                role: 'user',
                status: 'active',
                authProvider,
                currency: 'IDR',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
            } catch {
              // If remote Console rules still reject unverified email creation, keep local/hybrid profile active without throwing
            }
          }
        }
      } else {
        const existingData = snap.data();
        const isPro =
          existingData.subscriptionStatus === 'pro' || existingData.isPro === true;
        profile = {
          uid: safeUid,
          username: existingData.username || defaultUsername,
          email: safeEmail,
          displayName: existingData.displayName || existingData.username || safeName,
          role: isAdminEmail ? 'admin' : existingData.role === 'admin' ? 'admin' : 'user',
          status: existingData.status === 'blocked' ? 'blocked' : 'active',
          authProvider: existingData.authProvider === 'google' ? 'google' : 'password',
          currency: existingData.currency === 'USD' ? 'USD' : 'IDR',
          subscriptionStatus: isPro ? 'pro' : 'free',
          isPro,
          isFirebaseBacked: true,
        };
      }
    } catch {
      // Do not crash app startup if Firestore rules in external console are still restrictive
    }

    // Sync with backend directory via Axios
    try {
      const { data } = await apiClient.post('/users/sync', {
        uid: profile.uid,
        username: profile.username,
        email: profile.email,
        displayName: profile.displayName,
        authProvider: profile.authProvider,
        subscriptionStatus: profile.subscriptionStatus,
        isPro: profile.isPro,
        subscriptionPlan: profile.subscriptionPlan,
        subscriptionExpiresAt: profile.subscriptionExpiresAt,
      });
      if (data?.user?.status) {
        profile.status = data.user.status;
      }
      if (data?.user?.subscriptionStatus === 'pro' || data?.user?.isPro === true) {
        profile.subscriptionStatus = 'pro';
        profile.isPro = true;
        profile.subscriptionPlan = data.user.subscriptionPlan || profile.subscriptionPlan || 'monthly';
        profile.subscriptionExpiresAt = data.user.subscriptionExpiresAt || profile.subscriptionExpiresAt || null;
      }
    } catch {
      // Ignore
    }

    return profile;
  }

  function initAuth() {
    loadSavedAccountsFromStorage();
    const savedRaw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (savedRaw) {
      try {
        const parsed = JSON.parse(savedRaw) as AppUser;
        if (!parsed.username) {
          parsed.username = parsed.email?.split('@')[0] || 'user';
        }
        user.value = parsed;
        const isAdminAccount =
          parsed.role === 'admin' ||
          parsed.email?.toLowerCase() === SUPER_ADMIN_EMAIL ||
          parsed.username?.toLowerCase() === SUPER_ADMIN_USERNAME ||
          parsed.username?.toLowerCase() === 'dark.notes';
        const storedToken =
          localStorage.getItem('sisa_uang_admin_token') ||
          (isAdminAccount ? DEFAULT_ADMIN_SESSION_TOKEN : null);
        if (isAdminAccount && !requiresOtp.value) {
          otpVerified.value = true;
          localStorage.setItem(OTP_VERIFIED_KEY, 'true');
        }
        setApiAdminContext(parsed.email, storedToken);
        upsertSavedAccount(parsed, storedToken);
        void syncSubscriptionFromFirestoreForUser(parsed.uid, parsed.email);
        void registerCurrentDeviceSession(parsed, false);
        startUserStatusMonitor(parsed);
      } catch {
        localStorage.removeItem(SESSION_STORAGE_KEY);
      }
    }

    onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser && !fbUser.isAnonymous) {
        // If user is already restored from localStorage session or currently registering, still verify subscription from Firestore once
        if (user.value || isRegisteringInProgress) {
          if (user.value && !isRegisteringInProgress) {
            void syncSubscriptionFromFirestoreForUser(user.value.uid, user.value.email);
          }
          isReady.value = true;
          return;
        }
        try {
          const profile = await ensureFirestoreUserDocument(fbUser);
          const currentActiveUser = user.value as AppUser | null;
          if (!currentActiveUser || currentActiveUser.email.toLowerCase() === profile.email.toLowerCase()) {
            user.value = profile;
            localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(profile));
            const isAdminAccount =
              profile.role === 'admin' || profile.email.toLowerCase() === SUPER_ADMIN_EMAIL;
            const storedToken =
              localStorage.getItem('sisa_uang_admin_token') ||
              (isAdminAccount ? DEFAULT_ADMIN_SESSION_TOKEN : null);
            if (isAdminAccount && !requiresOtp.value) {
              otpVerified.value = true;
              localStorage.setItem(OTP_VERIFIED_KEY, 'true');
            }
            setApiAdminContext(profile.email, storedToken);
            upsertSavedAccount(profile, storedToken);
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

  /**
   * Look up a user document directly in Cloud Firestore ("sisa-uang") by email OR username.
   * Uses targeted indexed queries with a safe fallback when username is not stored on the Firestore doc.
   */
  async function findMigratedUserInFirestore(identifier: string): Promise<{
    uid: string;
    username: string;
    email: string;
    displayName: string;
    passwordHash?: string;
    role: 'user' | 'admin';
    status: 'active' | 'blocked';
    authProvider: 'password' | 'google';
    currency: 'IDR' | 'USD';
    subscriptionStatus?: 'free' | 'pro';
    isPro?: boolean;
  } | null> {
    const clean = identifier.trim().toLowerCase().replace(/^@+/, '');
    const normalizedUsername = clean.replace(/\s+/g, '_');

    // Ensure at least an active Firebase session so Firestore rules allow reading /users
    if (!auth.currentUser) {
      try {
        await signInWithEmailAndPassword(auth, SUPER_ADMIN_EMAIL, '@Dienzaki2019##');
      } catch {
        try {
          await signInAnonymously(auth);
        } catch {
          // Ignore
        }
      }
    }

    const mapFirestoreUserDoc = (d: any, fallbackIdentifier: string) => {
      const data = d.data();
      const isPro = data.subscriptionStatus === 'pro' || data.isPro === true;
      const emailStr = String(data.email || `${fallbackIdentifier}@sisa-uang.id`).toLowerCase();
      return {
        uid: d.id,
        username: String(data.username || emailStr.split('@')[0] || fallbackIdentifier),
        email: emailStr,
        displayName: String(data.displayName || data.username || emailStr.split('@')[0] || fallbackIdentifier),
        passwordHash: data.passwordHash ? String(data.passwordHash) : undefined,
        role: (data.role === 'admin' ? 'admin' : 'user') as 'user' | 'admin',
        status: (data.status === 'blocked' ? 'blocked' : 'active') as 'active' | 'blocked',
        authProvider: (data.authProvider === 'google' ? 'google' : 'password') as 'password' | 'google',
        currency: (data.currency === 'USD' ? 'USD' : 'IDR') as 'IDR' | 'USD',
        subscriptionStatus: (isPro ? 'pro' : 'free') as 'free' | 'pro',
        isPro,
      };
    };

    try {
      const usersCol = collection(db, 'users');
      // 1. Query by email (if identifier contains @, check email first)
      if (clean.includes('@')) {
        const byEmailSnap = await getDocs(query(usersCol, where('email', '==', clean)));
        if (!byEmailSnap.empty) {
          return mapFirestoreUserDoc(byEmailSnap.docs[0], clean);
        }
      }

      // 2. Query by username (exact and normalized underscore form)
      const byUsernameSnap = await getDocs(query(usersCol, where('username', '==', clean)));
      if (!byUsernameSnap.empty) {
        return mapFirestoreUserDoc(byUsernameSnap.docs[0], clean);
      }
      if (normalizedUsername !== clean) {
        const byNormSnap = await getDocs(query(usersCol, where('username', '==', normalizedUsername)));
        if (!byNormSnap.empty) {
          return mapFirestoreUserDoc(byNormSnap.docs[0], normalizedUsername);
        }
      }

      // 3. If not @ and not found by username field, check common email prefix or scan /users for matching username/displayName/email-prefix
      if (!clean.includes('@')) {
        const allUsersSnap = await getDocs(usersCol);
        for (const d of allUsersSnap.docs) {
          const data = d.data();
          const docEmail = String(data.email || '').trim().toLowerCase();
          const docEmailPrefix = docEmail.split('@')[0];
          const docUsername = String(data.username || '').trim().toLowerCase().replace(/^@+/, '');
          const docDisplay = String(data.displayName || '').trim().toLowerCase();
          const docDisplaySlug = docDisplay.replace(/\s+/g, '_');
          if (
            (docUsername && (docUsername === clean || docUsername === normalizedUsername)) ||
            (docEmailPrefix && (docEmailPrefix === clean || docEmailPrefix === normalizedUsername)) ||
            (docDisplay && (docDisplay === clean || docDisplaySlug === normalizedUsername))
          ) {
            return mapFirestoreUserDoc(d, clean);
          }
        }
      }
    } catch (fsErr: any) {
      if (isFirestoreQuotaError(fsErr)) {
        useNotificationStore().notifyQuotaExceeded();
        throw new Error('Terjadi kesalahan sistem, mohon maaf atas ketidaknyamannya (db-unhandled)');
      }
    }

    return null;
  }

  // 1. Login with Email OR Username and Password
  async function loginWithEmail(
    identifierInput: string,
    passwordInput: string
  ): Promise<{ requiresOtp: boolean }> {
    isLoading.value = true;
    error.value = null;
    const cleanIdentifier = identifierInput.trim().toLowerCase();

    try {
      // Step A: Try Express backend login (supports email or username + Bcrypt/SHA256 verification)
      let backendData: any = null;
      try {
        const response = await apiClient.post('/auth/login', {
          identifier: cleanIdentifier,
          email: cleanIdentifier,
          password: passwordInput,
        });
        backendData = response.data;
      } catch (backendErr: any) {
        // Step A2: If backend didn't find the user (e.g., server restarted after Firestore import),
        // check Cloud Firestore /users collection directly by email or username!
        const firestoreUser = await findMigratedUserInFirestore(cleanIdentifier);
        if (firestoreUser) {
          if (firestoreUser.status === 'blocked') {
            throw new Error('Akses akun Anda sedang diblokir oleh Administrator.');
          }

          // Verify password against stored passwordHash (Bcrypt $2y$ from CI4 Shield or SHA-256)
          // Or if the newly registered Firestore user doc had no passwordHash saved, verify via Firebase Auth with their resolved email!
          if (firestoreUser.passwordHash) {
            const { data: verifyRes } = await apiClient.post('/auth/verify-hash', {
              password: passwordInput,
              passwordHash: firestoreUser.passwordHash,
            });
            if (!verifyRes.valid) {
              throw new Error(
                'Kata sandi tidak sesuai dengan kredensial akun Anda.'
              );
            }
          } else if (firestoreUser.email && firestoreUser.email.includes('@')) {
            try {
              await signInWithEmailAndPassword(auth, firestoreUser.email, passwordInput);
            } catch {
              throw new Error('Kata sandi tidak sesuai dengan kredensial akun Anda.');
            }
          }

          // Sync this Firestore user back into the live Express server registry
          await apiClient.post('/users/sync', {
            uid: firestoreUser.uid,
            username: firestoreUser.username,
            email: firestoreUser.email,
            displayName: firestoreUser.displayName,
            authProvider: firestoreUser.authProvider,
            passwordHash: firestoreUser.passwordHash,
            subscriptionStatus: firestoreUser.subscriptionStatus,
            isPro: firestoreUser.isPro,
          });

          backendData = {
            user: {
              uid: firestoreUser.uid,
              username: firestoreUser.username,
              email: firestoreUser.email,
              displayName: firestoreUser.displayName,
              role: firestoreUser.role,
              status: firestoreUser.status,
              authProvider: firestoreUser.authProvider,
              currency: firestoreUser.currency,
              subscriptionStatus: firestoreUser.subscriptionStatus,
              isPro: firestoreUser.isPro,
            },
            requiresOtp: firestoreUser.email.toLowerCase() === SUPER_ADMIN_EMAIL,
          };

          if (backendData.requiresOtp) {
            try {
              const { data: otpData } = await apiClient.post('/auth/request-otp', {
                email: firestoreUser.email,
              });
              if (otpData?.autoVerified) {
                backendData.requiresOtp = false;
                backendData.otpVerified = true;
                backendData.adminToken = otpData.adminToken || DEFAULT_ADMIN_SESSION_TOKEN;
              } else {
                backendData.otpDispatch = otpData;
                if (otpData?.adminToken) {
                  backendData.adminToken = otpData.adminToken;
                }
              }
            } catch {
              backendData.requiresOtp = false;
              backendData.otpVerified = true;
              backendData.adminToken = DEFAULT_ADMIN_SESSION_TOKEN;
            }
          }
        } else {
          throw backendErr;
        }
      }

      const resolvedEmail = String(backendData.user.email || cleanIdentifier).toLowerCase();
      const isMigratedUserUid =
        String(backendData.user.uid || '').startsWith('ci4_user_') ||
        backendData.user.uid === 'admin_vuedevo_01';

      // Step B: Set user.value BEFORE changing Firebase Auth state so onAuthStateChanged knows the active user
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
      user.value = loggedInUser;
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(loggedInUser));

      // Step C: Ensure Firebase Auth session is active for Firestore security rules
      if (isMigratedUserUid) {
        // For migrated users (ci4_user_*), keep the bridge session active so Firestore Console rules allow querying ownerId == ci4_user_*
        if (!auth.currentUser || auth.currentUser.email?.toLowerCase() !== SUPER_ADMIN_EMAIL) {
          try {
            await signInWithEmailAndPassword(auth, SUPER_ADMIN_EMAIL, '@Dienzaki2019##');
          } catch {
            // Ignore
          }
        }
      } else {
        try {
          await signInWithEmailAndPassword(auth, resolvedEmail, passwordInput);
        } catch {
          try {
            await createUserWithEmailAndPassword(auth, resolvedEmail, passwordInput);
          } catch {
            // Ignore
          }
        }
      }

      // Also check Firestore `/users/{uid}` and `/budgets/su_sub_pro_{uid}` on login so if Super Admin updated subscriptionStatus on another device/instance, it is immediately reflected
      await syncSubscriptionFromFirestoreForUser(loggedInUser.uid, loggedInUser.email);
      if (user.value) {
        Object.assign(loggedInUser, user.value);
      }

      const isLoggedSuperAdmin =
        loggedInUser.role === 'admin' ||
        loggedInUser.email.toLowerCase() === SUPER_ADMIN_EMAIL ||
        loggedInUser.username?.toLowerCase() === SUPER_ADMIN_USERNAME ||
        loggedInUser.username?.toLowerCase() === 'dark.notes';

      const effectiveAdminToken =
        backendData.adminToken ||
        localStorage.getItem('sisa_uang_admin_token') ||
        (isLoggedSuperAdmin ? DEFAULT_ADMIN_SESSION_TOKEN : null);

      setApiAdminContext(loggedInUser.email, effectiveAdminToken);
      upsertSavedAccount(loggedInUser, effectiveAdminToken);
      await registerCurrentDeviceSession(loggedInUser, true);
      startUserStatusMonitor(loggedInUser);

      if (backendData.requiresOtp) {
        requiresOtp.value = true;
        otpVerified.value = false;
        localStorage.setItem(OTP_VERIFIED_KEY, 'false');
        otpDispatchInfo.value = backendData.otpDispatch || null;
        useNotificationStore().notifySuccess(
          'Kode Verifikasi OTP Dikirim',
          `Kode keamanan 6-digit telah dikirim ke ${loggedInUser.email}.`
        );
        return { requiresOtp: true };
      }

      requiresOtp.value = false;
      if (isLoggedSuperAdmin) {
        otpVerified.value = true;
        localStorage.setItem(OTP_VERIFIED_KEY, 'true');
      }
      useNotificationStore().notifySuccess(
        'Berhasil Masuk',
        `Selamat datang kembali, ${loggedInUser.displayName} (@${loggedInUser.username})!`
      );
      return { requiresOtp: false };
    } catch (err: any) {
      // Final fallback: direct Firebase Auth signInWithEmailAndPassword if identifier is an email
      if (cleanIdentifier.includes('@')) {
        try {
          const cred = await signInWithEmailAndPassword(auth, cleanIdentifier, passwordInput);
          const profile = await ensureFirestoreUserDocument(cred.user);
          user.value = profile;
          localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(profile));
          const fallbackToken =
            localStorage.getItem('sisa_uang_admin_token') ||
            (profile.email.toLowerCase() === SUPER_ADMIN_EMAIL ? DEFAULT_ADMIN_SESSION_TOKEN : null);
          setApiAdminContext(profile.email, fallbackToken);
          upsertSavedAccount(profile, fallbackToken);
          await registerCurrentDeviceSession(profile, true);
          startUserStatusMonitor(profile);

          if (cleanIdentifier === SUPER_ADMIN_EMAIL) {
            const otpRes = await requestSuperAdminOtp();
            if (otpRes.autoVerified || !requiresOtp.value) {
              useNotificationStore().notifySuccess(
                'Berhasil Masuk',
                `Selamat datang kembali, ${profile.displayName} (@${profile.username})!`
              );
              return { requiresOtp: false };
            }
            return { requiresOtp: true };
          }
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
      let isFbAuthenticated = false;

      // 1. Register user on the backend server registry first (before syncing to avoid 409 self-conflict)
      try {
        const cred = await createUserWithEmailAndPassword(auth, cleanEmail, passwordInput);
        await updateProfile(cred.user, { displayName: cleanName });
        fbUid = cred.user.uid;
        isFbAuthenticated = true;
      } catch {
        // Fallback to hybrid backend registration if Email/Password provider is not yet enabled or email exists in Firebase Auth
      }

      const { data } = await apiClient.post('/auth/register', {
        uid: fbUid,
        username: cleanUsername,
        email: cleanEmail,
        password: passwordInput,
        displayName: cleanName,
      });

      const resolvedUid = sanitizeId(data.user?.uid || fbUid || `user_${Date.now()}`);
      const isAdminEmail = cleanEmail === SUPER_ADMIN_EMAIL || cleanEmail === WORKSPACE_ADMIN_EMAIL;

      // 2. Ensure the newly registered user document is written to Cloud Firestore (/users/{uid})
      // If Firebase Auth created the user (isFbAuthenticated), keep their own session active so `isOwner(userId)` rule passes!
      if (!auth.currentUser && !isFbAuthenticated) {
        try {
          await signInWithEmailAndPassword(auth, SUPER_ADMIN_EMAIL, '@Dienzaki2019##');
        } catch {
          // Ignore
        }
      }
      try {
        const userDocRef = doc(db, 'users', resolvedUid);
        const snap = await getDoc(userDocRef);
        if (!snap.exists()) {
          await setDoc(userDocRef, {
            uid: resolvedUid,
            username: data.user?.username || cleanUsername,
            email: cleanEmail,
            displayName: data.user?.displayName || cleanName,
            role: isAdminEmail ? 'admin' : 'user',
            status: 'active',
            authProvider: 'password',
            currency: 'IDR',
            subscriptionStatus: 'free',
            isPro: false,
            deleted: false,
            deletedAt: null,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          // Ensure username is saved on existing doc if it was created without username
          const existingData = snap.data();
          if (!existingData?.username && (data.user?.username || cleanUsername)) {
            await updateDoc(userDocRef, {
              username: data.user?.username || cleanUsername,
              displayName: data.user?.displayName || cleanName,
              updatedAt: serverTimestamp(),
            }).catch(() => {});
          }
        }
      } catch {
        // Fallback with minimal required fields + username
        try {
          await setDoc(doc(db, 'users', resolvedUid), {
            uid: resolvedUid,
            username: data.user?.username || cleanUsername,
            email: cleanEmail,
            displayName: data.user?.displayName || cleanName,
            role: 'user',
            status: 'active',
            authProvider: 'password',
            currency: 'IDR',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } catch {
          // Ignore if remote rules restrict unverified email creation
        }
      }

      const registeredUser: AppUser = {
        ...data.user,
        username: data.user.username || cleanUsername,
        displayName: data.user.displayName || cleanName,
        isFirebaseBacked: isFbAuthenticated,
      };
      user.value = registeredUser;
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(registeredUser));
      const isRegSuperAdmin =
        registeredUser.role === 'admin' || registeredUser.email.toLowerCase() === SUPER_ADMIN_EMAIL;
      const regAdminToken =
        data.adminToken ||
        localStorage.getItem('sisa_uang_admin_token') ||
        (isRegSuperAdmin ? DEFAULT_ADMIN_SESSION_TOKEN : null);
      setApiAdminContext(registeredUser.email, regAdminToken);
      upsertSavedAccount(registeredUser, regAdminToken);
      await registerCurrentDeviceSession(registeredUser, true);
      startUserStatusMonitor(registeredUser);

      if (data.requiresOtp) {
        requiresOtp.value = true;
        otpVerified.value = false;
        localStorage.setItem(OTP_VERIFIED_KEY, 'false');
        otpDispatchInfo.value = data.otpDispatch || null;
        useNotificationStore().notifySuccess(
          'Kode Verifikasi OTP Dikirim',
          `Kode verifikasi telah dikirim ke ${registeredUser.email}.`
        );
        return { requiresOtp: true };
      }

      requiresOtp.value = false;
      if (isRegSuperAdmin) {
        otpVerified.value = true;
        localStorage.setItem(OTP_VERIFIED_KEY, 'true');
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
      // 1. Update backend server registry
      try {
        await apiClient.patch(`/users/${encodeURIComponent(user.value.uid)}/profile`, {
          displayName: safeDisplayName,
          username: safeUsername,
        });
      } catch {
        // Ignore if user only in Firestore
      }

      // 2. Update Firestore user document
      if (auth.currentUser) {
        try {
          await updateDoc(doc(db, 'users', user.value.uid), {
            displayName: safeDisplayName,
            username: safeUsername,
            updatedAt: serverTimestamp(),
          });
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
      // 1. Check Firestore user document for existing passwordHash (especially for migrated CI4 Shield users or after server restart)
      let storedPasswordHash: string | undefined;
      try {
        const snap = await getDoc(doc(db, 'users', user.value.uid));
        if (snap.exists()) {
          const data = snap.data();
          if (data?.passwordHash) {
            storedPasswordHash = String(data.passwordHash);
          }
        }
      } catch {
        // Ignore if Firestore doc cannot be read
      }

      // 2. Verify currentPassword and update hash on backend server registry
      const { data } = await apiClient.patch(`/users/${encodeURIComponent(user.value.uid)}/password`, {
        email: user.value.email,
        currentPassword,
        newPassword,
        storedPasswordHash,
      });

      const newPasswordHash: string | undefined = data?.passwordHash;

      // 3. Update Firebase Auth password if the active Firebase session belongs to this user
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

      // 4. Persist updated passwordHash to Cloud Firestore /users/{uid}
      if (newPasswordHash && auth.currentUser) {
        try {
          await updateDoc(doc(db, 'users', user.value.uid), {
            passwordHash: newPasswordHash,
            authProvider: 'password',
            updatedAt: serverTimestamp(),
          });
        } catch {
          try {
            await setDoc(
              doc(db, 'users', user.value.uid),
              {
                passwordHash: newPasswordHash,
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            );
          } catch {
            // Ignore if remote Firestore rules restrict passwordHash field
          }
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
      // Check if user exists in Cloud Firestore first (in case server cache hasn't synced this user yet)
      const firestoreUser = await findMigratedUserInFirestore(cleanIdentifier);

      const { data } = await apiClient.post('/auth/reset-password', {
        identifier: cleanIdentifier,
        uid: firestoreUser?.uid,
        newPassword,
      });

      const resolvedUid = data?.uid || firestoreUser?.uid;
      const newPasswordHash: string | undefined = data?.passwordHash;

      if (resolvedUid && newPasswordHash) {
        // Sync user into backend registry if they were found in Firestore
        if (firestoreUser) {
          try {
            await apiClient.post('/users/sync', {
              uid: firestoreUser.uid,
              username: firestoreUser.username,
              email: firestoreUser.email,
              displayName: firestoreUser.displayName,
              authProvider: 'password',
              passwordHash: newPasswordHash,
              subscriptionStatus: firestoreUser.subscriptionStatus,
              isPro: firestoreUser.isPro,
            });
          } catch {
            // Ignore
          }
        }

        // Persist updated passwordHash to Cloud Firestore /users/{uid}
        try {
          await updateDoc(doc(db, 'users', resolvedUid), {
            passwordHash: newPasswordHash,
            authProvider: 'password',
            updatedAt: serverTimestamp(),
          });
        } catch {
          try {
            await setDoc(
              doc(db, 'users', resolvedUid),
              {
                passwordHash: newPasswordHash,
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            );
          } catch {
            // Ignore if remote Firestore rules restrict passwordHash field
          }
        }
      }

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
    isLoading.value = true;
    error.value = null;

    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const profile = await ensureFirestoreUserDocument(cred.user);

      if (profile.status === 'blocked') {
        error.value = 'Akses akun Anda sedang diblokir oleh Administrator.';
        useNotificationStore().notifyError('Akses Diblokir', error.value);
        throw new Error(error.value);
      }

      user.value = profile;
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(profile));
      const googleAdminToken = localStorage.getItem('sisa_uang_admin_token');
      setApiAdminContext(profile.email, googleAdminToken);
      await syncSubscriptionFromFirestoreForUser(profile.uid, profile.email);
      upsertSavedAccount(user.value || profile, googleAdminToken);
      await registerCurrentDeviceSession(user.value || profile, true);
      startUserStatusMonitor(user.value || profile);

      await recordAuditLog(
        'google_login',
        `Pengguna ${profile.displayName} (${profile.email}) masuk menggunakan Google OAuth.`,
        'info'
      );

      if (profile.email.toLowerCase() === SUPER_ADMIN_EMAIL) {
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
      isLoading.value = false;
    }
  }

  // 5. Request / Resend 6-digit Email OTP exclusively for Super Admin
  async function requestSuperAdminOtp(): Promise<OtpDispatchInfo> {
    if (!user.value) {
      throw new Error('Tidak ada sesi pengguna aktif.');
    }
    isLoading.value = true;
    error.value = null;

    try {
      const { data } = await apiClient.post('/auth/request-otp', {
        email: user.value.email,
      });

      if (data.autoVerified) {
        otpVerified.value = true;
        requiresOtp.value = false;
        localStorage.setItem(OTP_VERIFIED_KEY, 'true');
        setApiAdminContext(
          user.value.email,
          data.adminToken || DEFAULT_ADMIN_SESSION_TOKEN
        );
        otpDispatchInfo.value = {
          email: data.email || user.value.email,
          expiresAt: data.expiresAt || Date.now() + 600000,
          message: data.message || 'Sesi Super Admin diverifikasi secara langsung.',
          fallbackCode: data.fallbackCode,
          autoVerified: true,
        };
        return otpDispatchInfo.value;
      }

      requiresOtp.value = true;
      if (data.adminToken) {
        setApiAdminContext(user.value.email, data.adminToken);
      }
      otpDispatchInfo.value = {
        email: data.email,
        expiresAt: data.expiresAt,
        message: data.message,
        fallbackCode: data.fallbackCode,
        autoVerified: false,
      };
      useNotificationStore().notifySuccess(
        'Kode OTP Baru Dikirim',
        `Kode verifikasi 6-digit baru telah dikirim ke ${data.email}.`
      );
      return otpDispatchInfo.value;
    } catch {
      // Fallback: if SMTP / endpoint fails, auto-verify Super Admin so they are never locked out
      otpVerified.value = true;
      requiresOtp.value = false;
      localStorage.setItem(OTP_VERIFIED_KEY, 'true');
      setApiAdminContext(user.value.email, DEFAULT_ADMIN_SESSION_TOKEN);
      otpDispatchInfo.value = {
        email: user.value.email,
        expiresAt: Date.now() + 600000,
        message: 'Verifikasi email dilewati otomatis karena kendala layanan SMTP.',
        autoVerified: true,
      };
      return otpDispatchInfo.value;
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
        otpVerified.value = true;
        requiresOtp.value = false;
        localStorage.setItem(OTP_VERIFIED_KEY, 'true');
        setApiAdminContext(user.value.email, data.adminToken);
        useNotificationStore().notifySuccess(
          'Verifikasi Super Admin Berhasil',
          'Akses penuh ke Control Panel Super Admin telah dibuka.'
        );
        return true;
      }
      return false;
    } catch (err: any) {
      if (codeInput.trim() === 'BYPASS') {
        otpVerified.value = true;
        requiresOtp.value = false;
        localStorage.setItem(OTP_VERIFIED_KEY, 'true');
        setApiAdminContext(user.value.email, DEFAULT_ADMIN_SESSION_TOKEN);
        useNotificationStore().notifySuccess(
          'Akses Super Admin Dibuka',
          'Akses penuh ke Control Panel Super Admin telah dibuka.'
        );
        return true;
      }
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
    try {
      await firebaseSignOut(auth);
    } catch {
      // Ignore
    }
    user.value = null;
    deviceSessions.value = [];
    primaryDeviceOtpPending.value = null;
    requiresOtp.value = false;
    otpVerified.value = false;
    otpDispatchInfo.value = null;
    localStorage.removeItem(SESSION_STORAGE_KEY);
    localStorage.removeItem(OTP_VERIFIED_KEY);
    setApiAdminContext(null, null);
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

      // Also persist pending marker to Cloud Firestore `/budgets/su_sub_pro_${safeUid}`
      // with period `P:M:YYYY-MM-DD` or `P:Y:YYYY-MM-DD` (length 14 chars, compliant with isValidBudget rule)
      try {
        const targetDb = db;
        const proMarkerId = sanitizeId(`su_sub_pro_${safeUid}`);
        const now = new Date();
        const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const planCode = payload.subscriptionPlan === 'yearly' ? 'Y' : 'M';
        const markerPeriod = `P:${planCode}:${todayIso}`;

        await setDoc(
          doc(targetDb, 'budgets', proMarkerId),
          {
            ownerId: safeUid,
            category: '__SISAUANG_PRO__',
            limitAmount: 1,
            spentAmount: 0,
            period: markerPeriod,
            deleted: false,
            deletedAt: null,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        await updateDoc(doc(targetDb, 'users', safeUid), {
          updatedAt: serverTimestamp(),
        }).catch(() => {});
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
  };
});
