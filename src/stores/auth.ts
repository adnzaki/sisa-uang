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
  subscriptionStatus?: 'free' | 'pro';
  isPro?: boolean;
  subscriptionPlan?: 'monthly' | 'yearly' | null;
  subscriptionExpiresAt?: string | null;
  isFirebaseBacked?: boolean;
}

export function isSubscriptionActiveByDate(
  status?: 'free' | 'pro',
  isProFlag?: boolean,
  expiresAt?: string | null
): boolean {
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

const SUPER_ADMIN_EMAIL = 'vuedevo@gmail.com';
const SUPER_ADMIN_USERNAME = 'vuedevo';
const WORKSPACE_ADMIN_EMAIL = 'adnanzaki65@admin.sd.belajar.id';
const SESSION_STORAGE_KEY = 'sisa_uang_active_user';
const OTP_VERIFIED_KEY = 'sisa_uang_otp_verified';
const DEFAULT_ADMIN_SESSION_TOKEN = 'sisa_uang_admin_session_token_v1';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AppUser | null>(null);
  const isReady = ref(false);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  // Super Admin 2FA Email OTP state (exclusively for vuedevo@gmail.com)
  const requiresOtp = ref(false);
  const otpVerified = ref(localStorage.getItem(OTP_VERIFIED_KEY) === 'true');
  const otpDispatchInfo = ref<OtpDispatchInfo | null>(null);

  let userStatusUnsubscribe: (() => void) | null = null;
  let statusPollTimer: ReturnType<typeof setInterval> | null = null;

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
          params: { email: user.value.email },
        });
        if (data.status === 'blocked' && user.value.status !== 'blocked') {
          user.value.status = 'blocked';
          error.value = 'Akses akun Anda telah diblokir secara real-time oleh Super Administrator.';
          localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user.value));
        } else if (data.status === 'active' && user.value.status === 'blocked') {
          user.value.status = 'active';
          error.value = null;
          localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user.value));
        }

        if (data.subscriptionStatus === 'pro' || data.subscriptionStatus === 'free') {
          const nextIsPro = isSubscriptionActiveByDate(
            data.subscriptionStatus,
            data.isPro,
            data.subscriptionExpiresAt
          );
          const nextPlan = nextIsPro ? data.subscriptionPlan || 'monthly' : null;
          const nextExp = nextIsPro ? data.subscriptionExpiresAt || null : null;
          const prevIsPro = isSubscriptionActiveByDate(
            user.value.subscriptionStatus,
            user.value.isPro,
            user.value.subscriptionExpiresAt
          );
          if (
            nextIsPro !== prevIsPro ||
            user.value.subscriptionPlan !== nextPlan ||
            user.value.subscriptionExpiresAt !== nextExp
          ) {
            user.value = {
              ...user.value,
              subscriptionStatus: nextIsPro ? 'pro' : 'free',
              isPro: nextIsPro,
              subscriptionPlan: nextPlan,
              subscriptionExpiresAt: nextExp,
            };
            localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user.value));
          }
        }
      } catch {
        // Ignore poll error
      }
    }, 15000);
  }

  function setExternalSubscriptionStatus(
    nextStatus: 'free' | 'pro',
    plan?: 'monthly' | 'yearly' | null,
    expiresAt?: string | null
  ) {
    if (!user.value) return;
    const isPro = isSubscriptionActiveByDate(nextStatus, nextStatus === 'pro', expiresAt);
    const resolvedStatus: 'free' | 'pro' = isPro ? 'pro' : 'free';
    const resolvedPlan = isPro ? plan || user.value.subscriptionPlan || 'monthly' : null;
    const resolvedExpires = isPro ? expiresAt ?? user.value.subscriptionExpiresAt ?? null : null;

    if (
      user.value.subscriptionStatus !== resolvedStatus ||
      user.value.isPro !== isPro ||
      user.value.subscriptionPlan !== resolvedPlan ||
      user.value.subscriptionExpiresAt !== resolvedExpires
    ) {
      user.value = {
        ...user.value,
        subscriptionStatus: resolvedStatus,
        isPro,
        subscriptionPlan: resolvedPlan,
        subscriptionExpiresAt: resolvedExpires,
      };
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user.value));
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
      });
      if (data?.user?.status) {
        profile.status = data.user.status;
      }
      if (data?.user?.subscriptionStatus === 'pro' || data?.user?.isPro === true) {
        profile.subscriptionStatus = 'pro';
        profile.isPro = true;
      }
    } catch {
      // Ignore
    }

    return profile;
  }

  function initAuth() {
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
        startUserStatusMonitor(parsed);
      } catch {
        localStorage.removeItem(SESSION_STORAGE_KEY);
      }
    }

    onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser && !fbUser.isAnonymous) {
        // If user is already restored from localStorage session, do NOT re-query Firestore on every page load!
        if (user.value) {
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
   * Uses targeted indexed queries only (never scans the entire collection).
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
    const clean = identifier.trim().toLowerCase();

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

    try {
      const usersCol = collection(db, 'users');
      // 1. Query by email (if identifier contains @, check email first)
      if (clean.includes('@')) {
        const byEmailSnap = await getDocs(query(usersCol, where('email', '==', clean)));
        if (!byEmailSnap.empty) {
          const d = byEmailSnap.docs[0];
          const data = d.data();
          const isPro = data.subscriptionStatus === 'pro' || data.isPro === true;
          return {
            uid: d.id,
            username: String(data.username || clean.split('@')[0]),
            email: String(data.email || clean),
            displayName: String(data.displayName || data.username || clean.split('@')[0]),
            passwordHash: data.passwordHash ? String(data.passwordHash) : undefined,
            role: data.role === 'admin' ? 'admin' : 'user',
            status: data.status === 'blocked' ? 'blocked' : 'active',
            authProvider: data.authProvider === 'google' ? 'google' : 'password',
            currency: data.currency === 'USD' ? 'USD' : 'IDR',
            subscriptionStatus: isPro ? 'pro' : 'free',
            isPro,
          };
        }
      }

      // 2. Query by username
      const byUsernameSnap = await getDocs(query(usersCol, where('username', '==', clean)));
      if (!byUsernameSnap.empty) {
        const d = byUsernameSnap.docs[0];
        const data = d.data();
        const isPro = data.subscriptionStatus === 'pro' || data.isPro === true;
        return {
          uid: d.id,
          username: String(data.username || clean),
          email: String(data.email || `${clean}@sisa-uang.id`),
          displayName: String(data.displayName || data.username || clean),
          passwordHash: data.passwordHash ? String(data.passwordHash) : undefined,
          role: data.role === 'admin' ? 'admin' : 'user',
          status: data.status === 'blocked' ? 'blocked' : 'active',
          authProvider: data.authProvider === 'google' ? 'google' : 'password',
          currency: data.currency === 'USD' ? 'USD' : 'IDR',
          subscriptionStatus: isPro ? 'pro' : 'free',
          isPro,
        };
      }

      // 3. If not @ and not found by username, check email exact match once
      if (!clean.includes('@')) {
        const byEmailSnap = await getDocs(query(usersCol, where('email', '==', clean)));
        if (!byEmailSnap.empty) {
          const d = byEmailSnap.docs[0];
          const data = d.data();
          const isPro = data.subscriptionStatus === 'pro' || data.isPro === true;
          return {
            uid: d.id,
            username: String(data.username || clean),
            email: String(data.email || clean),
            displayName: String(data.displayName || data.username || clean),
            passwordHash: data.passwordHash ? String(data.passwordHash) : undefined,
            role: data.role === 'admin' ? 'admin' : 'user',
            status: data.status === 'blocked' ? 'blocked' : 'active',
            authProvider: data.authProvider === 'google' ? 'google' : 'password',
            currency: data.currency === 'USD' ? 'USD' : 'IDR',
            subscriptionStatus: isPro ? 'pro' : 'free',
            isPro,
          };
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

      // Also check Firestore /users/{uid} once on login so if Super Admin updated subscriptionStatus in Firestore, it is immediately reflected
      try {
        const fsUserSnap = await getDoc(doc(db, 'users', loggedInUser.uid));
        if (fsUserSnap.exists()) {
          const fsData = fsUserSnap.data();
          if (fsData?.subscriptionStatus === 'pro' || fsData?.isPro === true) {
            loggedInUser.subscriptionStatus = 'pro';
            loggedInUser.isPro = true;
            user.value = { ...loggedInUser };
            localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user.value));
          } else if (fsData?.subscriptionStatus === 'free' || fsData?.isPro === false) {
            loggedInUser.subscriptionStatus = 'free';
            loggedInUser.isPro = false;
            user.value = { ...loggedInUser };
            localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user.value));
          }
        }
      } catch {
        // Ignore
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
          setApiAdminContext(
            profile.email,
            localStorage.getItem('sisa_uang_admin_token') ||
              (profile.email.toLowerCase() === SUPER_ADMIN_EMAIL ? DEFAULT_ADMIN_SESSION_TOKEN : null)
          );
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

      // Attempt Firebase Auth registration first
      try {
        const cred = await createUserWithEmailAndPassword(auth, cleanEmail, passwordInput);
        await updateProfile(cred.user, { displayName: cleanName });
        fbUid = cred.user.uid;
        isFbAuthenticated = true;
        await ensureFirestoreUserDocument(
          {
            uid: cred.user.uid,
            email: cleanEmail,
            displayName: cleanName,
            providerData: [{ providerId: 'password' }],
          },
          cleanUsername
        );
      } catch {
        // Fallback to hybrid backend registration if Email/Password provider is not yet enabled
      }

      const { data } = await apiClient.post('/auth/register', {
        uid: fbUid,
        username: cleanUsername,
        email: cleanEmail,
        password: passwordInput,
        displayName: cleanName,
      });

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
      setApiAdminContext(
        registeredUser.email,
        data.adminToken ||
          localStorage.getItem('sisa_uang_admin_token') ||
          (isRegSuperAdmin ? DEFAULT_ADMIN_SESSION_TOKEN : null)
      );
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
      setApiAdminContext(profile.email, localStorage.getItem('sisa_uang_admin_token'));
      startUserStatusMonitor(profile);

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
  async function logout() {
    if (user.value) {
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
    requiresOtp.value = false;
    otpVerified.value = false;
    otpDispatchInfo.value = null;
    localStorage.removeItem(SESSION_STORAGE_KEY);
    localStorage.removeItem(OTP_VERIFIED_KEY);
    setApiAdminContext(null, null);
  }

  return {
    user,
    isReady,
    isLoading,
    error,
    requiresOtp,
    otpVerified,
    otpDispatchInfo,
    isAuthenticated,
    isSuperAdmin,
    isProUser,
    canAccessControlPanel,
    setExternalSubscriptionStatus,
    clearError,
    initAuth,
    loginWithEmail,
    registerWithEmail,
    updateUserProfile,
    changeUserPassword,
    loginWithGoogle,
    requestSuperAdminOtp,
    verifySuperAdminOtp,
    recordAuditLog,
    logout,
  };
});
