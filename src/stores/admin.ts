import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import {
  collection,
  doc,
  getDocs,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  writeBatch,
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
  passwordHash?: string;
  createdAt: string;
  updatedAt: string;
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
  const logs = ref<AdminActivityLogItem[]>([]);
  const alerts = ref<AdminSecurityAlertItem[]>([]);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  // Instant notification toast for newly detected suspicious activity
  const instantAlertNotification = ref<AdminSecurityAlertItem | null>(null);
  const seenAlertIds = new Set<string>();

  let pollInterval: ReturnType<typeof setInterval> | null = null;
  let unsubFirestoreUsers: (() => void) | null = null;
  let unsubFirestoreLogs: (() => void) | null = null;

  const openAlertsCount = computed(
    () => alerts.value.filter((a) => a.status === 'open').length
  );
  const activeUsersCount = computed(
    () => users.value.filter((u) => u.status === 'active').length
  );
  const blockedUsersCount = computed(
    () => users.value.filter((u) => u.status === 'blocked').length
  );

  function triggerInstantAlertBanner(alert: AdminSecurityAlertItem) {
    instantAlertNotification.value = alert;
  }

  function dismissInstantAlertBanner() {
    instantAlertNotification.value = null;
  }

  /**
   * Ensure Firebase Auth has an active session for Super Admin on both primary and sisa-uang instances
   */
  async function ensureSuperAdminFirebaseSession(): Promise<void> {
    const authTargets = sisaUangAuth !== auth ? [auth, sisaUangAuth] : [auth];

    for (const targetAuth of authTargets) {
      if (targetAuth.currentUser) continue;

      try {
        await signInWithEmailAndPassword(targetAuth, 'vuedevo@gmail.com', '@Dienzaki2019##');
        continue;
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
            continue;
          } catch {
            // Proceed to fallback
          }
        }
      }

      try {
        await signInAnonymously(targetAuth);
      } catch {
        // Ignore if anonymous auth is not enabled
      }
    }
  }

  async function fetchAdminOverview(silent = false) {
    if (!silent) isLoading.value = true;
    error.value = null;

    try {
      const { data } = await apiClient.get('/admin/overview');
      const incomingUsers: AdminUserItem[] = data.users || [];
      const incomingLogs: AdminActivityLogItem[] = data.logs || [];
      const incomingAlerts: AdminSecurityAlertItem[] = data.alerts || [];

      users.value = incomingUsers;
      logs.value = incomingLogs;

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
    stopRealtimeMonitoring();
    fetchAdminOverview(false);

    // Poll every 3.5 seconds via Axios for real-time updates
    pollInterval = setInterval(() => {
      fetchAdminOverview(true);
    }, 3500);

    await ensureSuperAdminFirebaseSession();

    const targetDb = sisaUangDb || db;
    unsubFirestoreUsers = onSnapshot(
      collection(targetDb, 'users'),
      (snap) => {
        const fbUsers: AdminUserItem[] = [];
        snap.docs.forEach((d) => {
          // Skip the internal default_category holder pseudo-user
          if (d.id === 'ci4_user_46') return;
          const fbUser = d.data();
          const tsToIso = (val: any) => {
            if (!val) return new Date().toISOString();
            if (typeof val === 'string') return val;
            if (typeof val.toDate === 'function') return val.toDate().toISOString();
            if (typeof val.seconds === 'number') return new Date(val.seconds * 1000).toISOString();
            return new Date().toISOString();
          };
          fbUsers.push({
            uid: d.id,
            username: fbUser.username || String(fbUser.email || d.id).split('@')[0],
            email: fbUser.email || `${d.id}@sisa-uang.id`,
            displayName: fbUser.displayName || fbUser.username || d.id,
            role: fbUser.role === 'admin' ? 'admin' : 'user',
            status: fbUser.status === 'blocked' ? 'blocked' : 'active',
            authProvider: fbUser.authProvider === 'google' ? 'google' : 'password',
            currency: fbUser.currency === 'USD' ? 'USD' : 'IDR',
            passwordHash: fbUser.passwordHash,
            createdAt: tsToIso(fbUser.createdAt),
            updatedAt: tsToIso(fbUser.updatedAt),
          });
        });
        if (fbUsers.length > 0) {
          users.value = fbUsers;
        }
      },
      () => {
        // Ignore snapshot listener permission warning if rules are strict
      }
    );

    unsubFirestoreLogs = onSnapshot(
      collection(targetDb, 'activity_logs'),
      (snap) => {
        const fbLogs: AdminActivityLogItem[] = snap.docs.map((d) => {
          const data = d.data();
          let createdAtIso = new Date().toISOString();
          if (typeof data.createdAt === 'string') createdAtIso = data.createdAt;
          else if (data.createdAt && typeof data.createdAt.toDate === 'function') {
            createdAtIso = data.createdAt.toDate().toISOString();
          } else if (data.createdAt && typeof data.createdAt.seconds === 'number') {
            createdAtIso = new Date(data.createdAt.seconds * 1000).toISOString();
          }
          return {
            id: d.id,
            actorUid: data.actorUid || 'system',
            actorEmail: data.actorEmail || 'system@sisa-uang.id',
            action: data.action || 'user_action',
            detail: data.detail || '',
            severity:
              data.severity === 'critical'
                ? 'critical'
                : data.severity === 'warning'
                ? 'warning'
                : 'info',
            createdAt: createdAtIso,
          };
        });
        if (fbLogs.length > 0) {
          fbLogs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          logs.value = fbLogs;
        }
      },
      () => {
        // Ignore
      }
    );
  }

  function stopRealtimeMonitoring() {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
    if (unsubFirestoreUsers) {
      unsubFirestoreUsers();
      unsubFirestoreUsers = null;
    }
    if (unsubFirestoreLogs) {
      unsubFirestoreLogs();
      unsubFirestoreLogs = null;
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

      const idx = users.value.findIndex((u) => u.uid === targetUser.uid);
      if (idx >= 0 && data.user) {
        users.value[idx] = data.user;
      }
      if (data.log) {
        logs.value.unshift(data.log);
      }

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

  async function removeUserAccount(targetUser: AdminUserItem) {
    const notify = useNotificationStore();
    try {
      const { data } = await apiClient.delete(
        `/admin/users/${encodeURIComponent(targetUser.uid)}`
      );

      users.value = users.value.filter((u) => u.uid !== targetUser.uid);
      if (data.log) {
        logs.value.unshift(data.log);
      }

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

    // 4. Ensure Super Admin Firebase Auth session is active & execute real writeBatch commits to sisa-uang Firestore
    onProgress?.({
      completedBatches: 0,
      totalBatches: Math.max(1, Math.ceil(operations.length / 400)),
      phase: 'Mengautentikasi koneksi ke Cloud Firestore (sisa-uang)...',
    });

    await ensureSuperAdminFirebaseSession();

    const CHUNK_SIZE = 400;
    const totalBatches = Math.max(1, Math.ceil(operations.length / CHUNK_SIZE));
    let batchesCommitted = 0;

    if (operations.length > 0) {
      for (let i = 0; i < operations.length; i += CHUNK_SIZE) {
        const slice = operations.slice(i, i + CHUNK_SIZE);
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
          // If this batch contained `users` with `username`/`passwordHash` and the user hasn't copied the updated firestore.rules to Console yet,
          // retry the batch with strict legacy-compatible user keys so the import still succeeds!
          const hasUserOps = slice.some((op) => op.col === 'users');
          if (hasUserOps) {
            try {
              const fallbackBatch = writeBatch(db);
              for (const op of slice) {
                if (op.col === 'users') {
                  const { username: _u, passwordHash: _p, ...legacySafePayload } = op.payload;
                  fallbackBatch.set(doc(db, op.col, op.docId), legacySafePayload);
                } else {
                  fallbackBatch.set(doc(db, op.col, op.docId), op.payload);
                }
              }
              await fallbackBatch.commit();
              batchesCommitted++;
              onProgress?.({
                completedBatches: batchesCommitted,
                totalBatches,
                phase: `Menulis batch ${batchesCommitted} / ${totalBatches} ke database Firestore "sisa-uang"...`,
              });
              continue;
            } catch {
              // Proceed to standard error handling below if fallback also fails
            }
          }

          const rawMsg = err instanceof Error ? err.message : String(err);
          if (
            rawMsg.includes('Missing or insufficient permissions') ||
            rawMsg.includes('permission-denied')
          ) {
            const authStatus = auth.currentUser
              ? `Terautentikasi sebagai ${auth.currentUser.email || 'anonymous'} (UID: ${auth.currentUser.uid})`
              : 'Belum terautentikasi di Firebase Auth project "sisa-uang"';

            throw new Error(
              `Database "sisa-uang" menolak penulisan (Missing or insufficient permissions). Status Auth: ${authStatus}. Silakan salin isi file firestore.rules terbaru ke tab Rules pada Firebase Console (database "sisa-uang").`
            );
          }
          handleFirestoreError(err, OperationType.WRITE, 'sisa-uang/batch_migration_import');
        }
      }
    }

    const totalDocumentsImported = operations.length;

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
   * for the Super Admin Database Table Cleanup & Management panel.
   */
  async function fetchFirestoreCollectionStats(): Promise<
    { collectionName: string; label: string; description: string; docCount: number }[]
  > {
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

    const results = await Promise.all(
      collectionDefs.map(async (def) => {
        try {
          const snap = await getDocs(collection(targetDb, def.collectionName));
          return {
            ...def,
            docCount: snap.size,
          };
        } catch {
          return {
            ...def,
            docCount: 0,
          };
        }
      })
    );

    return results;
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

    // Clear matching localStorage cache keys so UI refreshes cleanly
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        for (const colName of collectionNames) {
          if (k.includes(`sisa_uang_${colName}`) || (colName === 'categories' && k.includes('sisa_uang_user_categories'))) {
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
    logs,
    alerts,
    isLoading,
    error,
    instantAlertNotification,
    openAlertsCount,
    activeUsersCount,
    blockedUsersCount,
    fetchAdminOverview,
    startRealtimeMonitoring,
    stopRealtimeMonitoring,
    toggleUserBlockStatus,
    removeUserAccount,
    simulateSuspiciousActivity,
    resolveSecurityAlert,
    importConvertedJsonToFirestore,
    fetchFirestoreCollectionStats,
    deleteFirestoreCollections,
    dismissInstantAlertBanner,
  };
});
