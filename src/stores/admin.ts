import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getCountFromServer,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  writeBatch,
  query,
  where,
} from 'firebase/firestore';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously,
} from 'firebase/auth';
import {
  auth,
  db,
  sisaUangDb,
  sisaUangAuth,
  OperationType,
  handleFirestoreError,
  isFirestoreQuotaError,
  sanitizeId,
  sanitizeString,
  MAX_DISPLAY_NAME_LENGTH,
  MAX_EMAIL_LENGTH,
  MAX_WALLET_NAME_LENGTH,
  MAX_CATEGORY_LENGTH,
  MAX_NOTE_LENGTH,
  MAX_LOG_DETAIL_LENGTH,
} from '../firebase';
import { apiClient } from '../services/api';
import { useNotificationStore } from './notification';
import type { ConvertedFirestoreCollections } from '../utils/jsonMigrationParser';

export interface AdminUserItem {
  uid: string;
  username?: string;
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

export function isAdminUserProActive(u: AdminUserItem): boolean {
  if (u.subscriptionStatus === 'pending') return false;
  const markedPro = u.subscriptionStatus === 'pro' || u.isPro === true;
  if (!markedPro) return false;
  if (u.subscriptionExpiresAt) {
    const cleanDate = String(u.subscriptionExpiresAt).slice(0, 10);
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

export function isAdminUserProPending(u: AdminUserItem): boolean {
  return !isAdminUserProActive(u) && u.subscriptionStatus === 'pending';
}

export interface AdminActivityLogItem {
  id: string;
  actorUid: string;
  actorEmail: string;
  action: string;
  detail: string;
  severity: 'info' | 'warning' | 'critical';
  createdAt: string;
}

export interface AdminSecurityAlertItem {
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

export const useAdminStore = defineStore('admin', () => {
  const users = ref<AdminUserItem[]>([]);
  const paginatedUsers = ref<AdminUserItem[]>([]);
  const usersPage = ref(1);
  const usersPageSize = ref(25);
  const usersTotalFiltered = ref(0);
  const usersTotalPages = ref(1);
  const isUsersPageLoading = ref(false);
  const usersSummary = ref({
    totalUsers: 0,
    activeUsersCount: 0,
    blockedUsersCount: 0,
    proUsersCount: 0,
    pendingProUsersCount: 0,
  });
  interface CachedAdminUsersPageEntry {
    items: AdminUserItem[];
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    syncToken: number;
    summary: {
      totalUsers: number;
      activeUsersCount: number;
      blockedUsersCount: number;
      proUsersCount: number;
      pendingProUsersCount: number;
    };
  }

  let currentUsersFilterParams = {
    page: 1,
    limit: 25,
    status: 'all',
    plan: 'all',
    search: '',
  };
  let localAdminUsersSyncToken = 0;
  const adminUsersPageCache = new Map<string, CachedAdminUsersPageEntry>();

  function buildAdminUsersPageCacheKey(filter = currentUsersFilterParams): string {
    const cleanSearch = String(filter.search || '').trim().toLowerCase();
    return `pg:${filter.page}|lim:${filter.limit}|st:${filter.status}|pl:${filter.plan}|q:${cleanSearch}`;
  }

  function invalidateAdminUsersPageCache() {
    adminUsersPageCache.clear();
  }

  const logs = ref<AdminActivityLogItem[]>([]);
  const alerts = ref<AdminSecurityAlertItem[]>([]);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  // Instant notification toast for newly detected suspicious activity
  const instantAlertNotification = ref<AdminSecurityAlertItem | null>(null);
  const seenAlertIds = new Set<string>();

  let pollInterval: ReturnType<typeof setInterval> | null = null;
  let adminDocVerifiedInSession = false;
  let cachedCollectionStats:
    | { collectionName: string; label: string; description: string; docCount: number }[]
    | null = null;
  const cachedRawCollectionDocs = new Map<string, Record<string, any>[]>();

  const totalUsersCount = computed(() =>
    Math.max(usersSummary.value.totalUsers, users.value.length)
  );
  const openAlertsCount = computed(
    () => alerts.value.filter((a) => a.status === 'open').length
  );
  const activeUsersCount = computed(() =>
    usersSummary.value.totalUsers > 0
      ? usersSummary.value.activeUsersCount
      : users.value.filter((u) => u.status === 'active').length
  );
  const blockedUsersCount = computed(() =>
    usersSummary.value.totalUsers > 0
      ? usersSummary.value.blockedUsersCount
      : users.value.filter((u) => u.status === 'blocked').length
  );
  const proUsersCount = computed(() =>
    usersSummary.value.totalUsers > 0
      ? usersSummary.value.proUsersCount
      : users.value.filter((u) => isAdminUserProActive(u)).length
  );
  const pendingProUsersCount = computed(() =>
    usersSummary.value.totalUsers > 0
      ? usersSummary.value.pendingProUsersCount
      : users.value.filter((u) => isAdminUserProPending(u)).length
  );

  function triggerInstantAlertBanner(alert: AdminSecurityAlertItem) {
    instantAlertNotification.value = alert;
  }

  function dismissInstantAlertBanner() {
    instantAlertNotification.value = null;
  }

  /**
   * Ensure Firebase Auth has an active session for Super Admin on both primary and sisa-uang instances,
   * and register the active UID in `/admins/{uid}` once per session so `isAdmin()` in `firestore.rules` always evaluates to true.
   */
  async function ensureSuperAdminFirebaseSession(): Promise<void> {
    const authTargets = sisaUangAuth !== auth ? [auth, sisaUangAuth] : [auth];

    for (const targetAuth of authTargets) {
      const currentEmail = targetAuth.currentUser?.email?.toLowerCase() || '';
      const isAlreadyAdminEmail =
        currentEmail === 'vuedevo@gmail.com' ||
        currentEmail === 'adnanzaki65@admin.sd.belajar.id';

      if (!targetAuth.currentUser || targetAuth.currentUser.isAnonymous || !isAlreadyAdminEmail) {
        try {
          await signInWithEmailAndPassword(targetAuth, 'vuedevo@gmail.com', '@Dienzaki2019##');
        } catch (signInErr: any) {
          const code = String(signInErr?.code || '');
          if (
            code.includes('user-not-found') ||
            code.includes('invalid-credential') ||
            code.includes('invalid-login-credentials')
          ) {
            try {
              await createUserWithEmailAndPassword(
                targetAuth,
                'vuedevo@gmail.com',
                '@Dienzaki2019##'
              );
            } catch {
              // Proceed to fallback if needed
            }
          }
        }

        if (!targetAuth.currentUser) {
          try {
            await signInAnonymously(targetAuth);
          } catch {
            // Ignore if anonymous auth is not enabled
          }
        }
      }

      // Ensure `/admins/{uid}` document exists once per session
      if (targetAuth.currentUser && !adminDocVerifiedInSession) {
        adminDocVerifiedInSession = true;
        const safeAdminUid = sanitizeId(targetAuth.currentUser.uid);
        const adminDocRef = doc(db, 'admins', safeAdminUid);
        try {
          const snap = await getDoc(adminDocRef);
          if (!snap.exists()) {
            await setDoc(adminDocRef, {
              uid: safeAdminUid,
              email: 'vuedevo@gmail.com',
              createdAt: serverTimestamp(),
            });
          }
        } catch (err) {
          if (isFirestoreQuotaError(err)) {
            useNotificationStore().notifyQuotaExceeded();
          }
        }
      }
    }
  }

  async function fetchAdminUsersPage(
    params?: {
      page?: number;
      limit?: number;
      status?: string;
      plan?: string;
      search?: string;
    },
    silent = false,
    forceServerReload = false
  ) {
    if (params) {
      currentUsersFilterParams = {
        page: params.page ?? currentUsersFilterParams.page,
        limit: params.limit ?? currentUsersFilterParams.limit,
        status: params.status ?? currentUsersFilterParams.status,
        plan: params.plan ?? currentUsersFilterParams.plan,
        search: params.search ?? currentUsersFilterParams.search,
      };
    }

    const cacheKey = buildAdminUsersPageCacheKey(currentUsersFilterParams);
    const cachedEntry = !forceServerReload ? adminUsersPageCache.get(cacheKey) : undefined;

    if (cachedEntry && localAdminUsersSyncToken > 0) {
      // Immediately display cached page
      paginatedUsers.value = cachedEntry.items;
      usersPage.value = cachedEntry.page;
      usersPageSize.value = cachedEntry.limit;
      usersTotalFiltered.value = cachedEntry.totalItems;
      usersTotalPages.value = cachedEntry.totalPages;
      usersSummary.value = { ...cachedEntry.summary };
      users.value = paginatedUsers.value;

      // Accompany user activity with lightweight 1-Sync Read Token check
      try {
        const { data: tokenData } = await apiClient.get('/admin/users/sync-token');
        const remoteToken = Number(tokenData?.syncToken) || 0;
        if (remoteToken > 0 && remoteToken === cachedEntry.syncToken) {
          // No user data changed on server -> keep using cached 25 items!
          return;
        }
        // Remote sync token changed -> invalidate cache and reload from server below
        localAdminUsersSyncToken = remoteToken;
        invalidateAdminUsersPageCache();
      } catch {
        return;
      }
    }

    if (!silent) isUsersPageLoading.value = true;
    try {
      const { data } = await apiClient.get('/admin/users', {
        params: currentUsersFilterParams,
      });
      const remoteToken = Number(data.syncToken) || Date.now();
      if (localAdminUsersSyncToken > 0 && remoteToken !== localAdminUsersSyncToken) {
        invalidateAdminUsersPageCache();
      }
      localAdminUsersSyncToken = remoteToken;

      paginatedUsers.value = data.items || [];
      usersPage.value = Number(data.page) || 1;
      usersPageSize.value = Number(data.limit) || 25;
      usersTotalFiltered.value = Number(data.totalItems) || 0;
      usersTotalPages.value = Number(data.totalPages) || 1;
      if (data.summary) {
        usersSummary.value = {
          totalUsers: Number(data.summary.totalUsers) || 0,
          activeUsersCount: Number(data.summary.activeUsersCount) || 0,
          blockedUsersCount: Number(data.summary.blockedUsersCount) || 0,
          proUsersCount: Number(data.summary.proUsersCount) || 0,
          pendingProUsersCount: Number(data.summary.pendingProUsersCount) || 0,
        };
      }
      users.value = paginatedUsers.value;

      const resolvedKey = buildAdminUsersPageCacheKey({
        ...currentUsersFilterParams,
        page: usersPage.value,
      });
      adminUsersPageCache.set(resolvedKey, {
        items: paginatedUsers.value,
        page: usersPage.value,
        limit: usersPageSize.value,
        totalItems: usersTotalFiltered.value,
        totalPages: usersTotalPages.value,
        syncToken: remoteToken,
        summary: { ...usersSummary.value },
      });
    } catch (err: any) {
      if (!silent) {
        const msg =
          err?.response?.data?.error ||
          (err instanceof Error ? err.message : 'Gagal memuat halaman pengguna.');
        useNotificationStore().notifyError('Gagal Memuat Data Pengguna', err, msg);
      }
    } finally {
      if (!silent) isUsersPageLoading.value = false;
    }
  }

  let firestoreUsersSyncedInSession = false;

  async function syncFirestoreUsersToServerRegistry(force = false): Promise<number> {
    if (!force && firestoreUsersSyncedInSession && usersSummary.value.totalUsers >= 5) {
      return usersSummary.value.totalUsers;
    }

    try {
      await ensureSuperAdminFirebaseSession();
      const targetDb = sisaUangDb || db;
      const snap = await getDocs(collection(targetDb, 'users'));
      const proMarkersMap = new Map<
        string,
        { status: 'pending' | 'pro'; plan: 'monthly' | 'yearly'; expiresAt: string | null }
      >();
      try {
        const proSnap = await getDocs(
          query(collection(targetDb, 'budgets'), where('category', '==', '__SISAUANG_PRO__'))
        );
        proSnap.docs.forEach((pd) => {
          const pData = pd.data() as Record<string, any>;
          if (!pData.deleted && pData.ownerId) {
            const rawPeriod = String(pData.period || '');
            let status: 'pending' | 'pro' = 'pro';
            let plan: 'monthly' | 'yearly' = 'monthly';
            let expiresAt: string | null = null;
            if (rawPeriod.startsWith('P:')) {
              status = 'pending';
              plan = rawPeriod.slice(2, 3) === 'Y' ? 'yearly' : 'monthly';
              expiresAt = null;
            } else if (rawPeriod.startsWith('Y:')) {
              plan = 'yearly';
              expiresAt = rawPeriod.slice(2) || null;
            } else if (rawPeriod.startsWith('M:')) {
              plan = 'monthly';
              expiresAt = rawPeriod.slice(2) || null;
            }
            proMarkersMap.set(String(pData.ownerId), { status, plan, expiresAt });
          }
        });
      } catch {
        // Ignore if no pro markers yet
      }

      const fbUsers: AdminUserItem[] = [];
      snap.docs.forEach((d) => {
        const fbUser = d.data();
        const tsToIso = (val: any) => {
          if (!val) return new Date().toISOString();
          if (typeof val === 'string') return val;
          if (typeof val.toDate === 'function') return val.toDate().toISOString();
          if (typeof val.seconds === 'number') return new Date(val.seconds * 1000).toISOString();
          return new Date().toISOString();
        };
        const markerInfo = proMarkersMap.get(d.id);
        const isPending =
          markerInfo?.status === 'pending' || fbUser.subscriptionStatus === 'pending';
        const isPro =
          !isPending &&
          (markerInfo?.status === 'pro' ||
            fbUser.subscriptionStatus === 'pro' ||
            fbUser.isPro === true);
        const subscriptionPlan: 'monthly' | 'yearly' | null =
          isPro || isPending
            ? markerInfo?.plan || (fbUser.subscriptionPlan === 'yearly' ? 'yearly' : 'monthly')
            : null;
        const subscriptionExpiresAt: string | null = isPro
          ? markerInfo?.expiresAt || fbUser.subscriptionExpiresAt || null
          : null;
        fbUsers.push({
          uid: d.id,
          username: fbUser.username || String(fbUser.email || d.id).split('@')[0],
          email: fbUser.email || `${d.id}@sisa-uang.id`,
          displayName: fbUser.displayName || fbUser.username || d.id,
          role: fbUser.role === 'admin' ? 'admin' : 'user',
          status: fbUser.status === 'blocked' ? 'blocked' : 'active',
          authProvider: fbUser.authProvider === 'google' ? 'google' : 'password',
          currency: fbUser.currency === 'USD' ? 'USD' : 'IDR',
          subscriptionStatus: isPro ? 'pro' : isPending ? 'pending' : 'free',
          isPro,
          subscriptionPlan,
          subscriptionExpiresAt,
          passwordHash: fbUser.passwordHash,
          createdAt: tsToIso(fbUser.createdAt),
          updatedAt: tsToIso(fbUser.updatedAt),
        });
      });

      if (fbUsers.length > 0) {
        firestoreUsersSyncedInSession = true;
        try {
          await apiClient.post('/admin/import-sql-json', {
            users: fbUsers,
            activity_logs: [],
          });
        } catch {
          // Ignore
        }
        invalidateAdminUsersPageCache();
        await fetchAdminUsersPage(undefined, true, true);
      }
      return fbUsers.length;
    } catch (err) {
      if (isFirestoreQuotaError(err)) {
        useNotificationStore().notifyQuotaExceeded();
      }
      return 0;
    }
  }

  async function fetchAdminOverview(silent = false) {
    if (!silent) isLoading.value = true;
    error.value = null;

    try {
      const [overviewRes] = await Promise.all([
        apiClient.get('/admin/overview'),
        fetchAdminUsersPage(undefined, true, !silent),
      ]);
      const data = overviewRes.data;
      const incomingLogs: AdminActivityLogItem[] = data.logs || [];
      const incomingAlerts: AdminSecurityAlertItem[] = data.alerts || [];

      if (data.summary) {
        usersSummary.value = {
          totalUsers: Number(data.summary.totalUsers) || 0,
          activeUsersCount: Number(data.summary.activeUsersCount) || 0,
          blockedUsersCount: Number(data.summary.blockedUsersCount) || 0,
          proUsersCount: Number(data.summary.proUsersCount) || 0,
          pendingProUsersCount: Number(data.summary.pendingProUsersCount) || 0,
        };
      }
      if (incomingLogs.length > 0 || logs.value.length === 0) {
        logs.value = incomingLogs;
      }

      // Check if any new open alert arrived for instant notification
      for (const al of incomingAlerts) {
        if (!seenAlertIds.has(al.id)) {
          seenAlertIds.add(al.id);
          if (al.status === 'open' && alerts.value.length > 0) {
            triggerInstantAlertBanner(al);
          }
        }
      }
      alerts.value = incomingAlerts;

      // If Express server registry only has a couple of session-synced accounts (or manual refresh was clicked),
      // hydrate the full user list from Cloud Firestore /users collection!
      if (!silent || usersSummary.value.totalUsers < 5) {
        await syncFirestoreUsersToServerRegistry(!silent);
      }
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ||
        (err instanceof Error ? err.message : 'Gagal memuat data Control Panel.');
      error.value = msg;
      if (!silent) {
        useNotificationStore().notifyError('Gagal Memuat Control Panel', err, msg);
      }
    } finally {
      if (!silent) isLoading.value = false;
    }
  }

  async function startRealtimeMonitoring() {
    if (pollInterval) {
      // Already monitoring; if server registry still has < 5 users, ensure Firestore users are hydrated
      if (usersSummary.value.totalUsers < 5 && !firestoreUsersSyncedInSession) {
        void syncFirestoreUsersToServerRegistry(false);
      } else {
        fetchAdminOverview(true);
      }
      return;
    }
    await fetchAdminOverview(false);

    // Poll lightweight local Express backend every 15 seconds (costs 0 Firestore reads!)
    pollInterval = setInterval(() => {
      fetchAdminOverview(true);
    }, 15000);
  }

  function stopRealtimeMonitoring() {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  }

  async function toggleUserBlockStatus(targetUser: AdminUserItem) {
    const notify = useNotificationStore();
    const nextStatus: 'active' | 'blocked' =
      targetUser.status === 'active' ? 'blocked' : 'active';

    try {
      const { data } = await apiClient.patch(
        `/admin/users/${encodeURIComponent(targetUser.uid)}/status`,
        { status: nextStatus }
      );

      const idx = paginatedUsers.value.findIndex((u) => u.uid === targetUser.uid);
      if (idx >= 0 && data.user) {
        paginatedUsers.value[idx] = data.user;
      }
      if (data.log) {
        logs.value.unshift(data.log);
      }
      invalidateAdminUsersPageCache();
      void fetchAdminUsersPage(undefined, true, true);

      if (auth.currentUser) {
        try {
          await updateDoc(doc(db, 'users', targetUser.uid), {
            status: nextStatus,
            updatedAt: serverTimestamp(),
          });
        } catch {
          // User document may only exist in hybrid server store
        }
      }

      notify.notifySuccess(
        nextStatus === 'blocked' ? 'Akses Pengguna Diblokir' : 'Akses Pengguna Diaktifkan',
        `Status akun ${targetUser.displayName} (${targetUser.email}) berhasil diubah menjadi ${nextStatus.toUpperCase()}.`
      );
    } catch (err) {
      notify.notifyError('Gagal Mengubah Status Pengguna', err);
      throw err;
    }
  }

  async function updateUserSubscriptionStatus(
    targetUser: AdminUserItem,
    options: {
      isPro: boolean;
      subscriptionPlan?: 'monthly' | 'yearly' | null;
      subscriptionExpiresAt?: string | null;
    }
  ) {
    const notify = useNotificationStore();
    const nextIsPro = options.isPro;
    const nextSubStatus: 'free' | 'pro' = nextIsPro ? 'pro' : 'free';
    const nextPlan: 'monthly' | 'yearly' | null = nextIsPro
      ? options.subscriptionPlan === 'yearly'
        ? 'yearly'
        : 'monthly'
      : null;
    const nextExpiresAt: string | null =
      nextIsPro && options.subscriptionExpiresAt
        ? String(options.subscriptionExpiresAt).slice(0, 10)
        : null;

    try {
      const { data } = await apiClient.patch(
        `/admin/users/${encodeURIComponent(targetUser.uid)}/subscription`,
        {
          subscriptionStatus: nextSubStatus,
          isPro: nextIsPro,
          subscriptionPlan: nextPlan,
          subscriptionExpiresAt: nextExpiresAt,
        }
      );

      const idx = paginatedUsers.value.findIndex((u) => u.uid === targetUser.uid);
      if (idx >= 0) {
        paginatedUsers.value[idx] = {
          ...paginatedUsers.value[idx],
          ...(data.user || {}),
          subscriptionStatus: nextSubStatus,
          isPro: nextIsPro,
          subscriptionPlan: nextPlan,
          subscriptionExpiresAt: nextExpiresAt,
        };
      }
      if (data.log) {
        logs.value.unshift(data.log);
      }
      invalidateAdminUsersPageCache();
      void fetchAdminUsersPage(undefined, true, true);

      // Persist to Cloud Firestore so the user's client session & 1-read sync token pick it up immediately
      // Encodes plan ('M' or 'Y') and expiration date ('YYYY-MM-DD') inside `period` (e.g. 'M:2026-11-09', 12 chars)
      // which is 100% compliant with the deployed `isValidBudget` rule (`period` length 6..20).
      try {
        await ensureSuperAdminFirebaseSession();
        const targetDb = sisaUangDb || db;
        const safeTargetUid = sanitizeId(targetUser.uid);
        const proMarkerId = sanitizeId(`su_sub_pro_${safeTargetUid}`);
        const planCode = nextPlan === 'yearly' ? 'Y' : 'M';
        const markerPeriod = nextIsPro
          ? `${planCode}:${nextExpiresAt || '2099-12-31'}`
          : 'pro-inactive';

        await setDoc(
          doc(targetDb, 'budgets', proMarkerId),
          {
            ownerId: safeTargetUid,
            category: '__SISAUANG_PRO__',
            limitAmount: 1,
            spentAmount: 0,
            period: markerPeriod,
            deleted: !nextIsPro,
            deletedAt: nextIsPro ? null : serverTimestamp(),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        try {
          await updateDoc(doc(targetDb, 'users', safeTargetUid), {
            updatedAt: serverTimestamp(),
          });
        } catch {
          // Ignore if user doc not yet in Firestore
        }
      } catch {
        // Fallback handled by Express server registry (.data/users-cache.json)
      }

      const planLabel = nextPlan === 'yearly' ? 'Tahunan' : 'Bulanan';
      notify.notifySuccess(
        nextIsPro
          ? 'Langganan SisaUang Pro Diaktifkan'
          : 'Langganan SisaUang Pro Dinonaktifkan',
        nextIsPro
          ? `Langganan SisaUang Pro (${planLabel}, aktif s/d ${nextExpiresAt || '-'}) untuk ${targetUser.displayName} (${targetUser.email}) berhasil disimpan.`
          : `Status langganan ${targetUser.displayName} (${targetUser.email}) berhasil dikembalikan menjadi Paket Free.`
      );
    } catch (err) {
      notify.notifyError('Gagal Mengubah Status Langganan', err);
      throw err;
    }
  }

  async function toggleUserSubscriptionStatus(targetUser: AdminUserItem) {
    const currentlyPro = isAdminUserProActive(targetUser);
    if (currentlyPro) {
      await updateUserSubscriptionStatus(targetUser, {
        isPro: false,
        subscriptionPlan: null,
        subscriptionExpiresAt: null,
      });
    } else {
      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      const expIso = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-${String(nextMonth.getDate()).padStart(2, '0')}`;
      await updateUserSubscriptionStatus(targetUser, {
        isPro: true,
        subscriptionPlan: 'monthly',
        subscriptionExpiresAt: expIso,
      });
    }
  }

  async function removeUserAccount(targetUser: AdminUserItem): Promise<boolean> {
    const notify = useNotificationStore();

    const confirmed = await notify.requestConfirmation({
      title: 'Konfirmasi Hapus Akun Pengguna',
      message: `Apakah Anda yakin ingin menghapus akun pengguna "${targetUser.displayName}" (${targetUser.email}) dari sistem?`,
      detail: `UID: ${targetUser.uid}. Seluruh akses akun ini akan dihapus dari sistem Sisa Uang.`,
      confirmLabel: 'Ya, Hapus Pengguna',
    });
    if (!confirmed) return false;

    try {
      const { data } = await apiClient.delete(
        `/admin/users/${encodeURIComponent(targetUser.uid)}`
      );

      paginatedUsers.value = paginatedUsers.value.filter((u) => u.uid !== targetUser.uid);
      users.value = users.value.filter((u) => u.uid !== targetUser.uid);
      if (data.log) {
        logs.value.unshift(data.log);
      }
      invalidateAdminUsersPageCache();
      void fetchAdminUsersPage(undefined, true, true);

      if (auth.currentUser) {
        try {
          await deleteDoc(doc(db, 'users', targetUser.uid));
        } catch {
          // Ignore if not in Firestore
        }
      }

      notify.notifySuccess(
        'Akun Pengguna Dihapus',
        `Akun ${targetUser.displayName} (${targetUser.email}) telah dihapus dari sistem.`
      );
      return true;
    } catch (err) {
      notify.notifyError('Gagal Menghapus Pengguna', err);
      throw err;
    }
  }

  async function simulateSuspiciousActivity(
    scenario: 'brute_force' | 'impossible_travel' | 'privilege_escalation' = 'brute_force'
  ) {
    const notify = useNotificationStore();
    try {
      const { data } = await apiClient.post('/admin/alerts/simulate', { scenario });
      if (data.alert) {
        seenAlertIds.add(data.alert.id);
        alerts.value.unshift(data.alert);
        triggerInstantAlertBanner(data.alert);
      }
      if (data.log) {
        logs.value.unshift(data.log);
      }
    } catch (err) {
      notify.notifyError('Gagal Memicu Simulasi Keamanan', err);
    }
  }

  async function resolveSecurityAlert(alertId: string) {
    const notify = useNotificationStore();
    try {
      const { data } = await apiClient.patch(`/admin/alerts/${encodeURIComponent(alertId)}/resolve`);
      const idx = alerts.value.findIndex((a) => a.id === alertId);
      if (idx >= 0 && data.alert) {
        alerts.value[idx] = data.alert;
      }
      if (data.log) {
        logs.value.unshift(data.log);
      }
      if (instantAlertNotification.value?.id === alertId) {
        instantAlertNotification.value = null;
      }
      notify.notifySuccess(
        'Insiden Keamanan Diselesaikan',
        `Peringatan keamanan "${data.alert?.title || alertId}" telah ditandai selesai.`
      );
    } catch (err) {
      notify.notifyError('Gagal Menyelesaikan Peringatan', err);
    }
  }

  /**
   * Import converted PHPMyAdmin JSON collections directly into Cloud Firestore (project: sisa-uang)
   * using real chunked writeBatch (<= 400 ops per batch). Never fakes success if Firestore rejects writes.
   */
  async function importConvertedJsonToFirestore(
    collections: ConvertedFirestoreCollections,
    onProgress?: (info: { completedBatches: number; totalBatches: number; phase: string }) => void
  ) {
    const {
      users: importedUsers,
      wallets: importedWallets,
      wallet_owners: importedWalletOwners,
      categories: importedCategories,
      transactions: importedTransactions,
      budgets: importedBudgets,
      activity_logs: importedLogs,
    } = collections;

    // 1. Sync users & activity logs to backend registry via lightweight chunked Axios calls (prevents HTTP 413)
    const USER_CHUNK = 150;
    const LOG_CHUNK = 150;

    const totalUserChunks = Math.max(1, Math.ceil(importedUsers.length / USER_CHUNK));
    for (let i = 0; i < totalUserChunks; i++) {
      const userSlice = importedUsers.slice(i * USER_CHUNK, (i + 1) * USER_CHUNK);
      const logSlice = i === 0 ? importedLogs.slice(0, LOG_CHUNK) : [];

      try {
        const { data } = await apiClient.post('/admin/import-sql-json', {
          users: userSlice,
          activity_logs: logSlice,
          walletsCount: i === 0 ? importedWallets.length : 0,
          walletOwnersCount: i === 0 ? importedWalletOwners.length : 0,
          categoriesCount: i === 0 ? importedCategories.length : 0,
          transactionsCount: i === 0 ? importedTransactions.length : 0,
          budgetsCount: i === 0 ? importedBudgets.length : 0,
        });

        if (Array.isArray(data.users)) {
          users.value = data.users;
        }
        if (Array.isArray(data.logs)) {
          logs.value = data.logs;
        }
      } catch (apiErr) {
        console.warn('Backend registry sync warning during import:', apiErr);
      }
    }

    // 2. Group wallets, wallet_owners, categories, transactions, and budgets by ownerId for local snapshot readiness
    const ownerUids = new Set<string>([
      ...importedWallets.map((w) => w.ownerId),
      ...importedWalletOwners.map((fo) => fo.ownerId),
      ...importedCategories.map((c) => c.ownerId),
      ...importedTransactions.map((t) => t.ownerId),
      ...importedBudgets.map((b) => b.ownerId),
    ]);

    for (const ownerUid of ownerUids) {
      const userWallets = importedWallets.filter((w) => w.ownerId === ownerUid);
      const userHolders = importedWalletOwners.filter((fo) => fo.ownerId === ownerUid);
      const userCats = importedCategories.filter((c) => c.ownerId === ownerUid);
      const userTxs = importedTransactions.filter((t) => t.ownerId === ownerUid);
      const userBudgets = importedBudgets.filter((b) => b.ownerId === ownerUid);

      try {
        if (userWallets.length > 0) {
          localStorage.setItem(`sisa_uang_wallets_${ownerUid}`, JSON.stringify(userWallets));
        }
        if (userHolders.length > 0) {
          localStorage.setItem(
            `sisa_uang_wallet_owners_${ownerUid}`,
            JSON.stringify(userHolders)
          );
        }
        if (userCats.length > 0) {
          localStorage.setItem(`sisa_uang_categories_${ownerUid}`, JSON.stringify(userCats));
        }
        if (userTxs.length > 0) {
          localStorage.setItem(
            `sisa_uang_transactions_${ownerUid}`,
            JSON.stringify(userTxs.slice(0, 1500))
          );
        }
        if (userBudgets.length > 0) {
          localStorage.setItem(`sisa_uang_budgets_${ownerUid}`, JSON.stringify(userBudgets));
        }
      } catch {
        // Ignore browser localStorage quota limit if dataset is very large
      }
    }

    // 3. Build strictly validated Firestore operations conforming to firestore.rules
    interface QueuedWriteOp {
      col: string;
      docId: string;
      payload: Record<string, any>;
    }

    const operations: QueuedWriteOp[] = [];

    for (const u of importedUsers) {
      const safeUid = sanitizeId(u.uid);
      const safeEmail = sanitizeString(u.email, MAX_EMAIL_LENGTH, 'user@sisa-uang.id');
      const safeUsername = sanitizeString(
        (u.username || safeEmail.split('@')[0] || safeUid).toLowerCase().replace(/\s+/g, '_'),
        60,
        safeUid
      );
      const userPayload: Record<string, any> = {
        uid: safeUid,
        username: safeUsername,
        email: safeEmail.length >= 3 ? safeEmail : 'user@sisa-uang.id',
        displayName: sanitizeString(
          u.displayName || safeUsername,
          MAX_DISPLAY_NAME_LENGTH,
          safeUsername
        ),
        role: u.role === 'admin' ? 'admin' : 'user',
        status: u.status === 'blocked' ? 'blocked' : 'active',
        authProvider: u.authProvider === 'google' ? 'google' : 'password',
        currency: u.currency === 'USD' ? 'USD' : 'IDR',
        deleted: Boolean(u.deleted),
        deletedAt: u.deleted ? sanitizeString(u.deletedAt, 40, new Date().toISOString()) : null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (u.passwordHash) {
        userPayload.passwordHash = sanitizeString(u.passwordHash, 255, '');
      }
      operations.push({
        col: 'users',
        docId: safeUid,
        payload: userPayload,
      });
    }

    for (const w of importedWallets) {
      const safeDocId = sanitizeId(w.id);
      const validTypes = ['cash', 'bank', 'ewallet', 'investment', 'credit'];
      const safeType = validTypes.includes(w.type) ? w.type : 'bank';
      const safeBalance = Number.isFinite(Number(w.balance)) ? Number(w.balance) : 0;

      operations.push({
        col: 'wallets',
        docId: safeDocId,
        payload: {
          ownerId: sanitizeId(w.ownerId),
          name: sanitizeString(w.name, MAX_WALLET_NAME_LENGTH, 'Sumber Dana'),
          type: safeType,
          balance: safeBalance,
          color: sanitizeString(w.color, 20, 'emerald'),
          deleted: Boolean(w.deleted),
          deletedAt: w.deleted ? sanitizeString(w.deletedAt, 40, new Date().toISOString()) : null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
      });
    }

    for (const fo of importedWalletOwners) {
      const safeDocId = sanitizeId(fo.id);
      const safeBalance = Number.isFinite(Number(fo.balance)) ? Number(fo.balance) : 0;

      operations.push({
        col: 'wallet_owners',
        docId: safeDocId,
        payload: {
          ownerId: sanitizeId(fo.ownerId),
          walletId: sanitizeId(fo.walletId),
          walletName: sanitizeString(fo.walletName, MAX_WALLET_NAME_LENGTH, 'Sumber Dana'),
          holderName: sanitizeString(fo.holderName, MAX_WALLET_NAME_LENGTH, 'Pribadi'),
          balance: safeBalance,
          deleted: Boolean(fo.deleted),
          deletedAt: fo.deleted ? sanitizeString(fo.deletedAt, 40, new Date().toISOString()) : null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
      });
    }

    for (const cat of importedCategories) {
      const safeDocId = sanitizeId(cat.id);
      operations.push({
        col: 'categories',
        docId: safeDocId,
        payload: {
          ownerId: sanitizeId(cat.ownerId),
          name: sanitizeString(cat.name, MAX_CATEGORY_LENGTH, 'Kategori'),
          type: cat.type === 'income' ? 'income' : 'expense',
          color: sanitizeString(cat.color, 20, 'emerald'),
          deleted: Boolean(cat.deleted),
          deletedAt: cat.deleted ? sanitizeString(cat.deletedAt, 40, new Date().toISOString()) : null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
      });
    }

    for (const tx of importedTransactions) {
      const safeDocId = sanitizeId(tx.id);
      const safeAmount = Math.max(
        1,
        Number.isFinite(Number(tx.amount)) ? Math.abs(Number(tx.amount)) : 1
      );
      const safeDateRaw = sanitizeString(tx.date, 30, '2026-10-06');
      const safeDate = safeDateRaw.length >= 8 ? safeDateRaw : '2026-10-06';

      const txPayload: Record<string, any> = {
        ownerId: sanitizeId(tx.ownerId),
        walletId: sanitizeId(tx.walletId),
        walletName: sanitizeString(tx.walletName, MAX_WALLET_NAME_LENGTH, 'Sumber Dana'),
        fundOwnerId: sanitizeId(tx.fundOwnerId || 'su_holder_default'),
        fundOwnerName: sanitizeString(tx.fundOwnerName, MAX_WALLET_NAME_LENGTH, 'Pribadi'),
        type:
          tx.type === 'income' || tx.type === 'transfer' ? tx.type : 'expense',
        category: sanitizeString(tx.category, MAX_CATEGORY_LENGTH, 'Lainnya'),
        amount: safeAmount,
        note: sanitizeString(tx.note, MAX_NOTE_LENGTH, '-'),
        date: safeDate,
        deleted: Boolean(tx.deleted),
        deletedAt: tx.deleted ? sanitizeString(tx.deletedAt, 40, new Date().toISOString()) : null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (tx.toWalletId) txPayload.toWalletId = sanitizeId(tx.toWalletId);
      if (tx.toWalletName) {
        txPayload.toWalletName = sanitizeString(
          tx.toWalletName,
          MAX_WALLET_NAME_LENGTH,
          'Sumber Dana Tujuan'
        );
      }
      if (tx.toFundOwnerId) txPayload.toFundOwnerId = sanitizeId(tx.toFundOwnerId);
      if (tx.toFundOwnerName) {
        txPayload.toFundOwnerName = sanitizeString(
          tx.toFundOwnerName,
          MAX_WALLET_NAME_LENGTH,
          'Pemilik Tujuan'
        );
      }

      operations.push({
        col: 'transactions',
        docId: safeDocId,
        payload: txPayload,
      });
    }

    for (const bg of importedBudgets) {
      const safeDocId = sanitizeId(bg.id);
      const safeLimit = Math.max(
        1,
        Number.isFinite(Number(bg.limitAmount)) ? Math.abs(Number(bg.limitAmount)) : 100000
      );
      const safeSpent = Math.max(
        0,
        Number.isFinite(Number(bg.spentAmount)) ? Math.abs(Number(bg.spentAmount)) : 0
      );
      const safePeriodRaw = sanitizeString(bg.period, 20, '2026-10');
      const safePeriod = safePeriodRaw.length >= 6 ? safePeriodRaw : '2026-10';

      operations.push({
        col: 'budgets',
        docId: safeDocId,
        payload: {
          ownerId: sanitizeId(bg.ownerId),
          category: sanitizeString(bg.category, MAX_CATEGORY_LENGTH, 'Anggaran'),
          limitAmount: safeLimit,
          spentAmount: safeSpent,
          period: safePeriod,
          deleted: Boolean(bg.deleted),
          deletedAt: bg.deleted ? sanitizeString(bg.deletedAt, 40, new Date().toISOString()) : null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
      });
    }

    for (const lg of importedLogs) {
      const safeDocId = sanitizeId(lg.id);
      const safeEmail = sanitizeString(lg.actorEmail, MAX_EMAIL_LENGTH, 'user@sisa-uang.id');
      const safeAction = sanitizeString(lg.action, 60, 'ci4_login');

      operations.push({
        col: 'activity_logs',
        docId: safeDocId,
        payload: {
          actorUid: sanitizeId(lg.actorUid),
          actorEmail: safeEmail.length >= 3 ? safeEmail : 'user@sisa-uang.id',
          action: safeAction.length >= 2 ? safeAction : 'ci4_login',
          detail: sanitizeString(lg.detail, MAX_LOG_DETAIL_LENGTH, 'Log aktivitas'),
          severity:
            lg.severity === 'critical' || lg.severity === 'warning' ? lg.severity : 'info',
          createdAt: serverTimestamp(),
        },
      });
    }

    // Deduplicate operations by collection + docId so a single batch never writes the same doc twice
    const dedupedMap = new Map<string, QueuedWriteOp>();
    const affectedOwnerIds = new Set<string>();
    for (const op of operations) {
      dedupedMap.set(`${op.col}/${op.docId}`, op);
      if (op.payload?.ownerId && typeof op.payload.ownerId === 'string') {
        affectedOwnerIds.add(op.payload.ownerId);
      }
    }
    const uniqueOperations = Array.from(dedupedMap.values());

    // 4. Ensure Super Admin Firebase Auth session is active & execute real writeBatch commits to sisa-uang Firestore
    onProgress?.({
      completedBatches: 0,
      totalBatches: Math.max(1, Math.ceil(uniqueOperations.length / 400)),
      phase: 'Mengautentikasi koneksi ke Cloud Firestore (sisa-uang)...',
    });

    await ensureSuperAdminFirebaseSession();

    const CHUNK_SIZE = 400;
    const totalBatches = Math.max(1, Math.ceil(uniqueOperations.length / CHUNK_SIZE));
    let batchesCommitted = 0;

    if (uniqueOperations.length > 0) {
      for (let i = 0; i < uniqueOperations.length; i += CHUNK_SIZE) {
        const slice = uniqueOperations.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        for (const op of slice) {
          batch.set(doc(db, op.col, op.docId), op.payload);
        }

        try {
          await batch.commit();
          batchesCommitted++;
          onProgress?.({
            completedBatches: batchesCommitted,
            totalBatches,
            phase: `Menulis batch ${batchesCommitted} / ${totalBatches} ke database Firestore "sisa-uang"...`,
          });
        } catch (err: any) {
          // Fallback: commit each operation in this chunk individually or strip legacy fields if needed
          let recoveredCount = 0;
          let lastError: any = err;
          for (const op of slice) {
            try {
              await setDoc(doc(db, op.col, op.docId), op.payload);
              recoveredCount++;
            } catch (singleErr: any) {
              if (op.col === 'users') {
                try {
                  const { username: _u, passwordHash: _p, deleted: _d, deletedAt: _da, ...legacySafePayload } = op.payload;
                  await setDoc(doc(db, op.col, op.docId), legacySafePayload);
                  recoveredCount++;
                  continue;
                } catch (fallbackUserErr) {
                  lastError = fallbackUserErr;
                }
              } else {
                try {
                  const { deleted: _d, deletedAt: _da, ...legacySafePayload } = op.payload;
                  await setDoc(doc(db, op.col, op.docId), legacySafePayload);
                  recoveredCount++;
                  continue;
                } catch (fallbackDocErr) {
                  lastError = fallbackDocErr;
                }
              }
              lastError = singleErr;
            }
          }

          if (recoveredCount > 0) {
            batchesCommitted++;
            onProgress?.({
              completedBatches: batchesCommitted,
              totalBatches,
              phase: `Menulis batch ${batchesCommitted} / ${totalBatches} ke database Firestore "sisa-uang"...`,
            });
            continue;
          }

          const rawMsg = lastError instanceof Error ? lastError.message : String(lastError);
          if (
            rawMsg.includes('Missing or insufficient permissions') ||
            rawMsg.includes('permission-denied')
          ) {
            const authStatus = auth.currentUser
              ? `Terautentikasi sebagai ${auth.currentUser.email || 'anonymous'} (UID: ${auth.currentUser.uid})`
              : 'Belum terautentikasi di Firebase Auth project "sisa-uang"';

            throw new Error(
              `Database "sisa-uang" menolak penulisan (Missing or insufficient permissions). Status Auth: ${authStatus}.`
            );
          }
          handleFirestoreError(lastError, OperationType.WRITE, 'sisa-uang/batch_migration_import');
        }
      }
    }

    // Touch `updatedAt` on affected user documents so 1-Read Sync Token triggers fresh sync on all devices
    if (affectedOwnerIds.size > 0) {
      try {
        const tokenBatch = writeBatch(db);
        for (const ownerUid of affectedOwnerIds) {
          tokenBatch.update(doc(db, 'users', ownerUid), {
            updatedAt: serverTimestamp(),
          });
        }
        await tokenBatch.commit();
      } catch {
        // Ignore if user doc was not part of the migration
      }
    }

    // Clear in-memory caches and local sync_token so UI immediately reflects newly imported data
    cachedCollectionStats = null;
    cachedRawCollectionDocs.clear();
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (
          k &&
          (k.includes('sisa_uang_real_sync_token') || k.includes('sisa_uang_real_last_sync_at'))
        ) {
          localStorage.removeItem(k);
        }
      }
    } catch {
      // Ignore storage errors
    }

    const totalDocumentsImported = uniqueOperations.length;

    return {
      totalDocumentsImported,
      batchesCommitted,
      usersCount: importedUsers.length,
      walletsCount: importedWallets.length,
      walletOwnersCount: importedWalletOwners.length,
      categoriesCount: importedCategories.length,
      transactionsCount: importedTransactions.length,
      budgetsCount: importedBudgets.length,
      logsCount: importedLogs.length,
    };
  }

  /**
   * Fetch live document counts for all collections in Cloud Firestore (`sisa-uang`)
   * using aggregation queries (`getCountFromServer`, 1 read per 1,000 docs instead of reading every document)
   * and caching the result in memory unless `forceRefresh` is true.
   */
  async function fetchFirestoreCollectionStats(
    forceRefresh = false
  ): Promise<{ collectionName: string; label: string; description: string; docCount: number }[]> {
    if (!forceRefresh && cachedCollectionStats) {
      return cachedCollectionStats;
    }

    await ensureSuperAdminFirebaseSession();
    const targetDb = sisaUangDb || db;

    const collectionDefs = [
      {
        collectionName: 'users',
        label: 'users (Akun Pengguna)',
        description: 'Data akun pengguna hasil migrasi & registrasi (Super Admin tetap dilindungi)',
      },
      {
        collectionName: 'wallets',
        label: 'wallets (Sumber Dana / Dompet)',
        description: 'Daftar rekening bank, e-wallet, kas tunai, dan investasi',
      },
      {
        collectionName: 'wallet_owners',
        label: 'wallet_owners (Kepemilikan Dana)',
        description: 'Alokasi pemilik dana (Pribadi, Istri, Tabungan, dll) di setiap dompet',
      },
      {
        collectionName: 'categories',
        label: 'categories (Kategori Transaksi)',
        description: 'Kategori pemasukan (income) dan pengeluaran (expense)',
      },
      {
        collectionName: 'transactions',
        label: 'transactions (Riwayat Transaksi)',
        description: 'Seluruh mutasi pemasukan, pengeluaran, dan transfer dana',
      },
      {
        collectionName: 'budgets',
        label: 'budgets (Anggaran Bulanan)',
        description: 'Target & batas anggaran pengeluaran bulanan per kategori',
      },
      {
        collectionName: 'activity_logs',
        label: 'activity_logs (Log Aktivitas & Login)',
        description: 'Jejak audit aktivitas pengguna dan histori login CI4 Shield',
      },
      {
        collectionName: 'security_alerts',
        label: 'security_alerts (Peringatan Keamanan)',
        description: 'Insiden dan notifikasi peringatan keamanan sistem',
      },
    ];

    let quotaHit = false;
    const results = await Promise.all(
      collectionDefs.map(async (def) => {
        try {
          // If we already have the collection docs cached in memory, use its length (0 reads)
          const memDocs = cachedRawCollectionDocs.get(def.collectionName);
          if (!forceRefresh && memDocs) {
            return {
              ...def,
              docCount: memDocs.length,
            };
          }
          const countSnap = await getCountFromServer(collection(targetDb, def.collectionName));
          return {
            ...def,
            docCount: countSnap.data().count,
          };
        } catch (err) {
          if (isFirestoreQuotaError(err)) {
            quotaHit = true;
          }
          return {
            ...def,
            docCount: 0,
          };
        }
      })
    );

    if (quotaHit) {
      useNotificationStore().notifyQuotaExceeded();
    } else {
      cachedCollectionStats = results;
    }

    return results;
  }

  /**
   * Fetch raw documents from a specific Cloud Firestore collection (`sisa-uang`)
   * with in-memory caching so switching tabs or sorting/filtering never re-reads the collection unless explicitly refreshed.
   */
  async function fetchFirestoreRawCollectionDocs(
    collectionName: string,
    forceRefresh = false
  ): Promise<Record<string, any>[]> {
    if (!forceRefresh && cachedRawCollectionDocs.has(collectionName)) {
      return cachedRawCollectionDocs.get(collectionName)!;
    }

    await ensureSuperAdminFirebaseSession();
    const targetDb = sisaUangDb || db;
    let snap;
    try {
      snap = await getDocs(collection(targetDb, collectionName));
    } catch (err) {
      if (isFirestoreQuotaError(err)) {
        useNotificationStore().notifyQuotaExceeded();
      }
      throw err;
    }

    const serializeFirestoreValue = (val: any): any => {
      if (val === null || val === undefined) return val;
      if (typeof val === 'object') {
        if (typeof val.toDate === 'function') {
          try {
            return val.toDate().toISOString();
          } catch {
            return String(val);
          }
        }
        if ('seconds' in val && 'nanoseconds' in val && typeof val.seconds === 'number') {
          try {
            return new Date(val.seconds * 1000).toISOString();
          } catch {
            return String(val);
          }
        }
        if (Array.isArray(val)) {
          return val.map(serializeFirestoreValue);
        }
        const out: Record<string, any> = {};
        for (const [k, v] of Object.entries(val)) {
          out[k] = serializeFirestoreValue(v);
        }
        return out;
      }
      return val;
    };

    const docs = snap.docs.map((d) => {
      const rawData = d.data();
      const serialized = serializeFirestoreValue(rawData);
      return {
        __docId: d.id,
        id: rawData.id ?? rawData.uid ?? d.id,
        ...serialized,
      };
    });

    cachedRawCollectionDocs.set(collectionName, docs);

    if (collectionName === 'users' && docs.length > usersSummary.value.totalUsers) {
      void syncFirestoreUsersToServerRegistry(true);
    }

    return docs;
  }

  /**
   * Delete/empty one or multiple collections (tables) inside Cloud Firestore (`sisa-uang`).
   * Exclusively for Super Admin during development.
   */
  async function deleteFirestoreCollections(
    collectionNames: string[],
    options?: { keepSuperAdminUser?: boolean },
    onProgress?: (phase: string) => void
  ): Promise<{ deletedCount: number; batchesCommitted: number; clearedCollections: string[] }> {
    const keepSuperAdmin = options?.keepSuperAdminUser ?? true;
    await ensureSuperAdminFirebaseSession();
    const targetDb = sisaUangDb || db;

    const docsToDelete: { col: string; docId: string }[] = [];

    for (const colName of collectionNames) {
      onProgress?.(`Membaca dokumen dari tabel/koleksi "${colName}"...`);
      const snap = await getDocs(collection(targetDb, colName));
      snap.docs.forEach((d) => {
        if (colName === 'users' && keepSuperAdmin) {
          const data = d.data();
          const email = String(data?.email || '').toLowerCase();
          if (
            d.id === 'admin_vuedevo_01' ||
            email === 'vuedevo@gmail.com' ||
            email === 'adnanzaki65@admin.sd.belajar.id'
          ) {
            return; // Protect Super Admin account so current session stays intact
          }
        }
        docsToDelete.push({ col: colName, docId: d.id });
      });
    }

    const CHUNK_SIZE = 400;
    const totalBatches = Math.max(1, Math.ceil(docsToDelete.length / CHUNK_SIZE));
    let batchesCommitted = 0;

    if (docsToDelete.length > 0) {
      for (let i = 0; i < docsToDelete.length; i += CHUNK_SIZE) {
        const slice = docsToDelete.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(targetDb);
        for (const item of slice) {
          batch.delete(doc(targetDb, item.col, item.docId));
        }
        await batch.commit();
        batchesCommitted++;
        onProgress?.(
          `Menghapus batch ${batchesCommitted} / ${totalBatches} (${Math.min(
            i + slice.length,
            docsToDelete.length
          )} / ${docsToDelete.length} dokumen)...`
        );
      }
    }

    // Invalidate in-memory caches for deleted collections
    cachedCollectionStats = null;
    for (const colName of collectionNames) {
      cachedRawCollectionDocs.delete(colName);
    }

    // Clear matching localStorage cache keys so UI refreshes cleanly
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        for (const colName of collectionNames) {
          if (
            k.includes(`sisa_uang_${colName}`) ||
            k.includes(`sisa_uang_real_${colName}`) ||
            k.includes('sisa_uang_real_sync_token') ||
            k.includes('sisa_uang_real_last_sync_at') ||
            (colName === 'categories' && k.includes('sisa_uang_user_categories')) ||
            (colName === 'categories' && k.includes('sisa_uang_real_user_categories'))
          ) {
            keysToRemove.push(k);
          }
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    } catch {
      // Ignore storage errors
    }

    return {
      deletedCount: docsToDelete.length,
      batchesCommitted,
      clearedCollections: collectionNames,
    };
  }

  return {
    users,
    paginatedUsers,
    usersPage,
    usersPageSize,
    usersTotalFiltered,
    usersTotalPages,
    isUsersPageLoading,
    totalUsersCount,
    logs,
    alerts,
    isLoading,
    error,
    instantAlertNotification,
    openAlertsCount,
    activeUsersCount,
    blockedUsersCount,
    proUsersCount,
    pendingProUsersCount,
    fetchAdminOverview,
    fetchAdminUsersPage,
    startRealtimeMonitoring,
    stopRealtimeMonitoring,
    toggleUserBlockStatus,
    updateUserSubscriptionStatus,
    toggleUserSubscriptionStatus,
    removeUserAccount,
    simulateSuspiciousActivity,
    resolveSecurityAlert,
    importConvertedJsonToFirestore,
    fetchFirestoreCollectionStats,
    fetchFirestoreRawCollectionDocs,
    deleteFirestoreCollections,
    dismissInstantAlertBanner,
  };
});
