import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  getCountFromServer,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  documentId,
  serverTimestamp,
  writeBatch,
  type WriteBatch,
  type DocumentSnapshot,
  type QueryConstraint,
} from 'firebase/firestore';
import {
  signInWithEmailAndPassword,
  signInAnonymously,
} from 'firebase/auth';
import {
  auth,
  db,
  OperationType,
  handleFirestoreError,
  isFirestoreQuotaError,
  sanitizeId,
  sanitizeString,
  MAX_WALLET_NAME_LENGTH,
  MAX_CATEGORY_LENGTH,
  MAX_NOTE_LENGTH,
} from '../firebase';
import { useAuthStore } from './auth';
import { useNotificationStore } from './notification';

export interface WalletItem {
  id: string;
  ownerId: string;
  name: string;
  type: 'cash' | 'bank' | 'ewallet' | 'investment' | 'credit';
  balance: number;
  color: string;
  deleted?: boolean;
  deletedAt?: any;
  createdAt?: any;
  updatedAt?: any;
}

export interface WalletOwnerItem {
  id: string;
  ownerId: string;
  walletId: string;
  walletName: string;
  holderName: string;
  balance: number;
  deleted?: boolean;
  deletedAt?: any;
  createdAt?: any;
  updatedAt?: any;
}

export interface CategoryItem {
  id: string;
  ownerId: string;
  name: string;
  type: 'income' | 'expense';
  color: string;
  isDefault?: boolean;
  deleted?: boolean;
  deletedAt?: any;
  createdAt?: any;
  updatedAt?: any;
}

export interface TransactionItem {
  id: string;
  ownerId: string;
  walletId: string;
  walletName: string;
  fundOwnerId?: string;
  fundOwnerName?: string;
  toWalletId?: string;
  toWalletName?: string;
  toFundOwnerId?: string;
  toFundOwnerName?: string;
  type: 'income' | 'expense' | 'transfer';
  category: string;
  amount: number;
  adminFee?: number;
  note: string;
  date: string;
  deleted?: boolean;
  deletedAt?: any;
  createdAt?: any;
  updatedAt?: any;
}

export interface BudgetItem {
  id: string;
  ownerId: string;
  category: string;
  limitAmount: number;
  spentAmount: number;
  period: string;
  deleted?: boolean;
  deletedAt?: any;
  createdAt?: any;
  updatedAt?: any;
}

export interface OwnershipSummaryItem {
  rawHolderName: string;
  displayHolderName: string;
  totalBalance: number;
  walletCount: number;
  wallets: {
    holderId: string;
    walletId: string;
    walletName: string;
    balance: number;
  }[];
}

// In Firestore `sisa-uang`, user ID `ci4_user_46` (`default_category@sisa-uang.com`) holds the 45 global default categories
export const DEFAULT_CATEGORY_OWNER_ID = 'ci4_user_46';
export const BUDGET_PERIOD_MARKER_CATEGORY = '__PERIOD_MARKER__';

export const FALLBACK_EXPENSE_CATEGORIES = [
  'Makan dan Minum',
  'Transportasi',
  'Belanja Harian',
  'Keperluan Rumah',
  'Tagihan',
  'Listrik',
  'Internet',
  'Pendidikan',
  'Kesehatan',
  'Hiburan',
  'Biaya Admin',
  'Donasi',
];

export const FALLBACK_INCOME_CATEGORIES = [
  'Gaji',
  'Bonus',
  'Ekstra',
  'Freelance',
  'Investasi',
  'Refund',
  'Tips',
  'Hadiah',
];

export function getCurrentMonthPeriod(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function getTodayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Format holderName from Firestore `wallet_owners` / `transactions`.
 * In migrated data, some holderName values are numeric owner IDs (e.g. "1", "2", "4", "9", "19", "30").
 * If purely numeric, format as "Pemilik #1" so it is clear and readable until renamed by the user.
 */
export function formatHolderName(rawName?: string | null): string {
  const clean = String(rawName ?? '').trim();
  if (!clean) return 'Pribadi';
  if (/^\d+$/.test(clean)) {
    return `Pemilik #${clean}`;
  }
  return clean;
}

export function formatPeriodLabel(period: string, locale = 'id-ID'): string {
  if (!period || period === 'all') return 'Semua Periode';
  const parts = period.split('-');
  if (parts.length !== 2) return period;
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  if (!year || !month) return period;
  const d = new Date(year, month - 1, 1);
  return d.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
}

export function formatTransactionDateBadge(
  dateStr: string,
  locale = 'id-ID'
): { day: string; monthYear: string } {
  const clean = String(dateStr || '').slice(0, 10);
  const parts = clean.split('-');
  if (parts.length === 3) {
    const y = Number(parts[0]);
    const m = Number(parts[1]);
    const d = Number(parts[2]);
    if (y && m && d) {
      const dt = new Date(y, m - 1, d);
      const day = String(d).padStart(2, '0');
      const monthShort = dt.toLocaleDateString(locale, { month: 'short' });
      return { day, monthYear: `${monthShort} ${y}` };
    }
  }
  return { day: clean.slice(-2) || '--', monthYear: clean.slice(0, 7) || '' };
}

export const useFinanceStore = defineStore('finance', () => {
  const wallets = ref<WalletItem[]>([]);
  const rawWalletOwners = ref<WalletOwnerItem[]>([]);
  const rawUserCategories = ref<CategoryItem[]>([]);
  const defaultCategories = ref<CategoryItem[]>([]);
  const rawTransactions = ref<TransactionItem[]>([]);
  const budgets = ref<BudgetItem[]>([]);
  const budgetPeriods = ref<string[]>([]);

  const userCategories = computed<CategoryItem[]>(() =>
    rawUserCategories.value
      .filter((c) => !c.deleted)
      .sort((a, b) => a.name.localeCompare(b.name))
  );

  // Set of default category IDs that this user has customized (edited or deleted)
  const customizedDefaultCatIds = computed<Set<string>>(() => {
    const uid = activeOwnerUid.value;
    const set = new Set<string>();
    if (!uid) return set;
    const prefix = `${uid}_def_`;
    for (const c of rawUserCategories.value) {
      if (c.id.startsWith(prefix)) {
        set.add(c.id.slice(prefix.length));
      }
    }
    return set;
  });

  // Active global default categories that have NOT been overridden or deleted by the user
  const activeDefaultCategories = computed<CategoryItem[]>(() => {
    const overriddenIds = customizedDefaultCatIds.value;
    const seenUserKeys = new Set<string>(
      userCategories.value.map((c) => `${c.type}:${c.name.toLowerCase().trim()}`)
    );
    return defaultCategories.value.filter((c) => {
      if (overriddenIds.has(c.id)) return false;
      const key = `${c.type}:${c.name.toLowerCase().trim()}`;
      if (seenUserKeys.has(key)) return false;
      return true;
    });
  });

  /**
   * Active Wallet Owners (Kepemilikan Sumber Dana):
   * Must satisfy BOTH criteria:
   * 1. `fo.deleted !== true` on the `wallet_owners` document itself
   * 2. Its parent wallet (`fo.walletId`) exists in active `wallets` (`w.deleted !== true`)
   */
  const walletOwners = computed<WalletOwnerItem[]>(() => {
    const activeWalletMap = new Map<string, WalletItem>();
    for (const w of wallets.value) {
      if (!w.deleted) {
        activeWalletMap.set(w.id, w);
      }
    }

    return rawWalletOwners.value
      .filter((fo) => !fo.deleted && activeWalletMap.has(fo.walletId))
      .map((fo) => {
        const parentWallet = activeWalletMap.get(fo.walletId)!;
        return {
          ...fo,
          walletName: parentWallet.name || fo.walletName,
        };
      });
  });

  const isLoading = ref(false);
  const isSyncedWithFirestore = ref(false);
  const activeOwnerUid = ref<string>('');
  const quickModalOpen = ref(false);
  const editingTransaction = ref<TransactionItem | null>(null);

  function openAddTransactionModal() {
    editingTransaction.value = null;
    quickModalOpen.value = true;
    void checkAndSyncIfRemoteChanged();
  }

  function openEditTransactionModal(tx: TransactionItem) {
    editingTransaction.value = { ...tx };
    quickModalOpen.value = true;
    void checkAndSyncIfRemoteChanged();
  }

  // Selected Period ('all' or 'YYYY-MM'). Automatically defaults to user's latest active month in Firestore.
  const selectedPeriod = ref<string>(getCurrentMonthPeriod());
  const hasAutoSelectedPeriod = ref(false);

  watch(selectedPeriod, (newPeriod) => {
    if (newPeriod && newPeriod !== 'all' && /^\d{4}-\d{2}$/.test(newPeriod)) {
      void ensureTransactionsForDateRange(`${newPeriod}-01`, `${newPeriod}-31`);
    }
  });

  // Extract millisecond timestamp from Firestore Timestamp, serialized object, or ISO string
  function extractTimestampMillis(val: any): number {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    if (typeof val.toMillis === 'function') {
      try {
        return Number(val.toMillis()) || 0;
      } catch {
        return 0;
      }
    }
    if (typeof val === 'object' && typeof val.seconds === 'number') {
      return val.seconds * 1000 + Math.floor((Number(val.nanoseconds) || 0) / 1e6);
    }
    if (typeof val === 'string') {
      const parsed = Date.parse(val);
      return Number.isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  }

  /**
   * 1-Read Sync Token updater:
   * Piggybacks `updatedAt: serverTimestamp()` onto `/users/{uid}` inside the same atomic WriteBatch
   * whenever any financial mutation happens, so other devices can detect changes with just 1 document read.
   */
  const confirmedUserDocsInFirestore = new Set<string>();

  async function ensureUserDocExistsForSyncToken(uid: string) {
    if (!uid || uid === 'guest' || confirmedUserDocsInFirestore.has(uid)) return;
    try {
      const authStore = useAuthStore();
      const uRef = doc(db, 'users', uid);
      const snap = await getDoc(uRef);
      if (snap.exists()) {
        confirmedUserDocsInFirestore.add(uid);
        return;
      }
      const activeUser = authStore.user;
      if (activeUser && activeUser.uid === uid) {
        await setDoc(uRef, {
          uid,
          username: sanitizeString(activeUser.username || activeUser.email.split('@')[0] || 'user', 60, 'user'),
          email: sanitizeString(activeUser.email || 'user@sisa-uang.id', 120, 'user@sisa-uang.id'),
          displayName: sanitizeString(activeUser.displayName || activeUser.username || 'Pengguna', 80, 'Pengguna'),
          role: activeUser.role === 'admin' ? 'admin' : 'user',
          status: 'active',
          authProvider: activeUser.authProvider === 'google' ? 'google' : 'password',
          currency: activeUser.currency === 'USD' ? 'USD' : 'IDR',
          subscriptionStatus: activeUser.subscriptionStatus === 'pro' ? 'pro' : 'free',
          isPro: Boolean(activeUser.isPro),
          deleted: false,
          deletedAt: null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        confirmedUserDocsInFirestore.add(uid);
      }
    } catch {
      // Ignore if creation is not needed or handled by bridge session
    }
  }

  function touchUserSyncTokenInBatch(batch: WriteBatch, uid: string) {
    if (!uid || uid === 'guest') return;
    if (!confirmedUserDocsInFirestore.has(uid)) return;
    batch.update(doc(db, 'users', uid), {
      updatedAt: serverTimestamp(),
    });
  }

  function storageKey(prefix: string, uid: string) {
    return `sisa_uang_real_${prefix}_${uid}`;
  }

  function cleanupLegacyDummyStorage(uid: string) {
    // Remove old v1 keys that stored hardcoded starter/dummy data
    const legacyPrefixes = ['wallets', 'wallet_owners', 'categories', 'transactions', 'budgets'];
    for (const p of legacyPrefixes) {
      localStorage.removeItem(`sisa_uang_${p}_${uid}`);
    }
  }

  function saveLocalSnapshot(uid: string, markSyncedNow = false, remoteSyncTokenMs?: number) {
    if (!uid) return;
    try {
      localStorage.setItem(storageKey('wallets', uid), JSON.stringify(wallets.value));
      localStorage.setItem(storageKey('wallet_owners', uid), JSON.stringify(rawWalletOwners.value));
      localStorage.setItem(storageKey('user_categories', uid), JSON.stringify(rawUserCategories.value));
      localStorage.setItem(storageKey('budgets', uid), JSON.stringify(budgets.value));
      localStorage.setItem(storageKey('budget_periods', uid), JSON.stringify(budgetPeriods.value));
      if (defaultCategories.value.length > 0) {
        localStorage.setItem('sisa_uang_real_default_categories', JSON.stringify(defaultCategories.value));
      }
      // Only cache the most recent 100 transactions locally so we don't bloat memory or localStorage
      localStorage.setItem(
        storageKey('transactions', uid),
        JSON.stringify(rawTransactions.value.slice(0, 100))
      );
      if (markSyncedNow) {
        const tokenMs = remoteSyncTokenMs && remoteSyncTokenMs > 0 ? remoteSyncTokenMs : Date.now();
        localStorage.setItem(storageKey('sync_token', uid), String(tokenMs));
        localStorage.setItem(storageKey('last_sync_at', uid), String(Date.now()));
      }
    } catch {
      // Ignore storage quota errors on large datasets
    }
  }

  function cleanupListeners() {
    // Listeners are replaced with efficient on-demand/cached reads + optimistic local updates
  }

  /**
   * Ensure Firebase Auth has an active session capable of querying and mutating Firestore `sisa-uang`.
   * For migrated users (`ci4_user_*`) whose `ownerId` is not a random Firebase Auth UID,
   * signing into the bridge session ensures Firestore Console rules allow full access to their records.
   */
  async function ensureFirestoreSessionForUser(uid: string): Promise<boolean> {
    try {
      if (typeof (auth as any).authStateReady === 'function') {
        await (auth as any).authStateReady();
      }
    } catch {
      // Ignore
    }

    const current = auth.currentUser;
    const isMigratedId = uid.startsWith('ci4_user_') || uid === 'admin_vuedevo_01';

    if (current && !current.isAnonymous) {
      if (!isMigratedId && current.uid === uid) {
        await ensureUserDocExistsForSyncToken(uid);
        return true;
      }
      if (current.email?.toLowerCase() === 'vuedevo@gmail.com') {
        await ensureUserDocExistsForSyncToken(uid);
        return true;
      }
    }

    // Authenticate bridge session for migrated users or when currentUser is null
    try {
      await signInWithEmailAndPassword(auth, 'vuedevo@gmail.com', '@Dienzaki2019##');
      await ensureUserDocExistsForSyncToken(uid);
      return true;
    } catch {
      if (auth.currentUser) {
        await ensureUserDocExistsForSyncToken(uid);
        return true;
      }
      try {
        await signInAnonymously(auth);
        return true;
      } catch {
        return !!auth.currentUser;
      }
    }
  }

  /**
   * Synchronize parent wallet total balance from its active `wallet_owners` documents in Firestore.
   */
  function syncWalletTotalBalancesFromHolders() {
    for (const w of wallets.value) {
      if (w.deleted) continue;
      const holders = rawWalletOwners.value.filter(
        (fo) => !fo.deleted && fo.walletId === w.id
      );
      w.balance = holders.reduce((sum, h) => sum + Number(h.balance || 0), 0);
      // Also keep walletName on holders in sync with parent wallet name
      for (const h of holders) {
        if (w.name && h.walletName !== w.name) {
          h.walletName = w.name;
        }
      }
    }
  }

  /**
   * Merged Categories: User's Custom Categories (`ownerId == uid`) + SisaUang Default Categories (`ownerId == ci4_user_46`)
   * If a default category has been edited by the user, its customized document in `userCategories` replaces it and is labeled as Kustom (`isDefault: false`).
   * If a default category has been deleted by the user, it is excluded via `activeDefaultCategories`.
   */
  const categories = computed<CategoryItem[]>(() => {
    const merged: CategoryItem[] = [];
    const seen = new Set<string>();

    // 1. User's custom categories (including edited default categories, which now have isDefault: false)
    for (const c of userCategories.value) {
      const key = `${c.type}:${c.name.toLowerCase().trim()}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push({ ...c, isDefault: false });
      }
    }

    // 2. Global default categories from Firestore `ci4_user_46` (`default_category`) not yet edited/deleted by user
    for (const c of activeDefaultCategories.value) {
      const key = `${c.type}:${c.name.toLowerCase().trim()}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push({ ...c, isDefault: true });
      }
    }

    return merged;
  });

  function enrichTransactionItem(tx: TransactionItem): TransactionItem {
    const walletMap = new Map<string, WalletItem>();
    for (const w of wallets.value) {
      walletMap.set(w.id, w);
    }

    const holderByIdMap = new Map<string, WalletOwnerItem>();
    for (const h of walletOwners.value) {
      holderByIdMap.set(h.id, h);
    }

    const sourceWallet = walletMap.get(tx.walletId);
    const resolvedWalletName =
      sourceWallet?.name ||
      (tx.walletName && !/^\d+$/.test(tx.walletName) ? tx.walletName : 'Sumber Dana');

    // Find matching holder inside this wallet
    let matchedHolder = tx.fundOwnerId ? holderByIdMap.get(tx.fundOwnerId) : undefined;
    if (matchedHolder && matchedHolder.walletId !== tx.walletId) {
      // In some migrated rows, tx.fundOwnerId used wallet_id index; match by walletId + holderName instead
      const byWalletAndName = walletOwners.value.find(
        (h) =>
          h.walletId === tx.walletId &&
          (h.holderName === tx.fundOwnerName ||
            formatHolderName(h.holderName) === formatHolderName(tx.fundOwnerName))
      );
      matchedHolder =
        byWalletAndName || walletOwners.value.find((h) => h.walletId === tx.walletId);
    }

    const rawHolderName = matchedHolder?.holderName || tx.fundOwnerName || 'Pribadi';
    const resolvedFundOwnerName = formatHolderName(rawHolderName);

    let resolvedToWalletId = tx.toWalletId;
    let resolvedToWalletName = tx.toWalletName;
    let resolvedToFundOwnerName = tx.toFundOwnerName
      ? formatHolderName(tx.toFundOwnerName)
      : undefined;

    if (tx.type === 'transfer') {
      const txNum = Number(String(tx.id || '').replace(/\D/g, ''));
      const isMigratedCi4Tx = /^su_tx_\d+$/.test(String(tx.id || '')) && txNum < 100000;
      const rawToFundOwnerNum = String(tx.toFundOwnerId || '').replace(/\D/g, '');

      // Detect migrated CI4 transfer records where `toFundOwnerId` (`su_holder_{N}`) stored the destination wallet ID (`N`)
      const migratedTargetWalletId =
        isMigratedCi4Tx && rawToFundOwnerNum ? `su_wallet_${rawToFundOwnerNum}` : undefined;

      const isBrokenLegacyDest =
        migratedTargetWalletId &&
        walletMap.has(migratedTargetWalletId) &&
        (tx.toWalletId !== migratedTargetWalletId ||
          (tx.toWalletId === tx.walletId && tx.toFundOwnerId === tx.fundOwnerId) ||
          tx.toFundOwnerId === 'su_holder_31' ||
          tx.toFundOwnerId === 'su_holder_42');

      if (isBrokenLegacyDest && migratedTargetWalletId) {
        resolvedToWalletId = migratedTargetWalletId;
        const destWallet = walletMap.get(resolvedToWalletId);
        resolvedToWalletName = destWallet?.name || resolvedWalletName;

        const activeDestHolders = walletOwners.value.filter(
          (h) => h.walletId === resolvedToWalletId
        );
        const allDestHolders = rawWalletOwners.value.filter(
          (h) => h.walletId === resolvedToWalletId
        );
        const candidates = activeDestHolders.length > 0 ? activeDestHolders : allDestHolders;
        const noteLower = String(tx.note || '').toLowerCase();

        let resolvedDestHolder: WalletOwnerItem | undefined;

        if (resolvedToWalletId === tx.walletId) {
          // Same-wallet transfer (e.g. Pindah alokasi / Pindah owner / Normalisasi saldo inside the same wallet)
          if (noteLower.includes('tabungan')) {
            resolvedDestHolder = candidates.find(
              (h) => formatHolderName(h.holderName) === 'Tabungan'
            );
          } else if (noteLower.includes('sekolah')) {
            resolvedDestHolder = candidates.find(
              (h) => formatHolderName(h.holderName) === 'Sekolah'
            );
          } else if (noteLower.includes('pribadi')) {
            resolvedDestHolder = candidates.find(
              (h) => formatHolderName(h.holderName) === 'Pribadi'
            );
          }
          if (!resolvedDestHolder) {
            resolvedDestHolder =
              candidates.find(
                (h) =>
                  h.id !== matchedHolder?.id &&
                  formatHolderName(h.holderName) !== resolvedFundOwnerName
              ) ||
              candidates.find((h) => h.id !== matchedHolder?.id) ||
              candidates[0];
          }
        } else {
          // Cross-wallet transfer (e.g. Tarik tunai, Setor tunai, Top up Flip/OVO/GoPay, Isi tabungan)
          if (noteLower.includes('tabungan')) {
            resolvedDestHolder = candidates.find(
              (h) => formatHolderName(h.holderName) === 'Tabungan'
            );
          } else if (noteLower.includes('sekolah') && !noteLower.includes('ganti')) {
            resolvedDestHolder = candidates.find(
              (h) => formatHolderName(h.holderName) === 'Sekolah'
            );
          }
          if (!resolvedDestHolder) {
            resolvedDestHolder =
              candidates.find(
                (h) => formatHolderName(h.holderName) === resolvedFundOwnerName
              ) ||
              candidates.find((h) => formatHolderName(h.holderName) === 'Pribadi') ||
              candidates[0];
          }
        }

        if (resolvedDestHolder) {
          resolvedToFundOwnerName = formatHolderName(resolvedDestHolder.holderName);
        } else {
          resolvedToFundOwnerName = resolvedFundOwnerName;
        }

        return {
          ...tx,
          walletName: resolvedWalletName,
          fundOwnerId: matchedHolder?.id || tx.fundOwnerId,
          fundOwnerName: resolvedFundOwnerName,
          toWalletId: resolvedToWalletId,
          toWalletName: resolvedToWalletName,
          toFundOwnerId: resolvedDestHolder?.id || tx.toFundOwnerId,
          toFundOwnerName: resolvedToFundOwnerName,
        };
      }

      if (!resolvedToWalletId && tx.toWalletName && /^\d+$/.test(tx.toWalletName)) {
        resolvedToWalletId = `su_wallet_${tx.toWalletName}`;
      }
      const destWallet = resolvedToWalletId ? walletMap.get(resolvedToWalletId) : undefined;
      if (destWallet) {
        resolvedToWalletName = destWallet.name;
      } else if (!resolvedToWalletName || /^\d+$/.test(resolvedToWalletName)) {
        resolvedToWalletName = resolvedWalletName;
      }

      const destHolder = tx.toFundOwnerId ? holderByIdMap.get(tx.toFundOwnerId) : undefined;
      if (destHolder) {
        resolvedToFundOwnerName = formatHolderName(destHolder.holderName);
      } else if (!resolvedToFundOwnerName || resolvedToFundOwnerName === 'Istri') {
        // Check if destination wallet has a holder
        const destWalletHolders = resolvedToWalletId
          ? walletOwners.value.filter((h) => h.walletId === resolvedToWalletId)
          : [];
        if (destWalletHolders.length > 0) {
          const diffHolder =
            destWalletHolders.find((h) => h.id !== matchedHolder?.id) || destWalletHolders[0];
          resolvedToFundOwnerName = formatHolderName(diffHolder.holderName);
        } else {
          resolvedToFundOwnerName = resolvedToFundOwnerName || resolvedFundOwnerName;
        }
      }
    }

    return {
      ...tx,
      walletName: resolvedWalletName,
      fundOwnerId: matchedHolder?.id || tx.fundOwnerId,
      fundOwnerName: resolvedFundOwnerName,
      toWalletId: resolvedToWalletId,
      toWalletName: resolvedToWalletName,
      toFundOwnerName: resolvedToFundOwnerName,
    };
  }

  /**
   * Enrich & normalize transactions from Firestore:
   */
  const transactions = computed<TransactionItem[]>(() =>
    rawTransactions.value.map((tx) => enrichTransactionItem(tx))
  );

  // =========================================================================
  // Server-Side Paginated Transactions State + 1-Sync Read Token Cache
  // =========================================================================
  interface CachedTxServerPageEntry {
    items: TransactionItem[];
    page: number;
    pageSize: number;
    totalFiltered: number;
    totalPages: number;
    syncToken: number;
    cachedAt: number;
  }

  const rawServerPaginatedTransactions = ref<TransactionItem[]>([]);
  const serverPaginatedTransactions = computed<TransactionItem[]>(() =>
    rawServerPaginatedTransactions.value.map((tx) => enrichTransactionItem(tx))
  );
  const txServerPage = ref(1);
  const txServerPageSize = ref(25);
  const txServerTotalFiltered = ref(0);
  const txServerTotalPages = ref(1);
  const isTxServerPageLoading = ref(false);
  const loadedTransactionPeriods = new Set<string>();
  const txCursorByFilterKey = new Map<string, Map<number, DocumentSnapshot>>();
  const txServerPageMemoryCache = new Map<string, CachedTxServerPageEntry>();
  const txFilteredPoolMemoryCache = new Map<
    string,
    { items: TransactionItem[]; syncToken: number }
  >();
  const txCountCacheByFilterKey = new Map<string, { count: number; syncToken: number }>();

  let currentTxServerFilter = {
    page: 1,
    limit: 25,
    period: 'all',
    type: 'all',
    category: 'all',
    walletId: 'all',
    holder: 'all',
    search: '',
  };

  function getSavedUserSyncToken(uid: string): number {
    if (!uid) return 0;
    const raw =
      localStorage.getItem(storageKey('sync_token', uid)) ||
      localStorage.getItem(storageKey('last_sync_at', uid));
    return Number(raw) || 0;
  }

  function buildTxPageCacheKey(uid: string, filter = currentTxServerFilter): string {
    const cleanSearch = String(filter.search || '').trim().toLowerCase();
    return `${uid}|p:${filter.period}|pg:${filter.page}|lim:${filter.limit}|t:${filter.type}|c:${filter.category}|w:${filter.walletId}|h:${filter.holder}|q:${cleanSearch}`;
  }

  function buildTxSubFilterPoolKey(uid: string, filter = currentTxServerFilter): string {
    return `${uid}|pool|t:${filter.type}|c:${filter.category}|w:${filter.walletId}`;
  }

  function restorePersistedTxPageCache(uid: string, expectedSyncToken: number) {
    if (!uid || expectedSyncToken <= 0) return;
    try {
      const raw = localStorage.getItem(storageKey('tx_page_cache_v1', uid));
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, CachedTxServerPageEntry>;
      if (!parsed || typeof parsed !== 'object') return;
      for (const [k, entry] of Object.entries(parsed)) {
        if (entry && Math.abs((entry.syncToken || 0) - expectedSyncToken) <= 2000) {
          txServerPageMemoryCache.set(k, entry);
        }
      }
    } catch {
      // Ignore corrupt cache
    }
  }

  function persistTxPageCacheToStorage(uid: string) {
    if (!uid) return;
    try {
      // Persist up to 25 recently visited pages in localStorage so page reload is also 0-query after 1-sync check
      const entries = Array.from(txServerPageMemoryCache.entries())
        .filter(([k]) => k.startsWith(`${uid}|`))
        .sort((a, b) => (b[1].cachedAt || 0) - (a[1].cachedAt || 0))
        .slice(0, 25);
      const obj: Record<string, CachedTxServerPageEntry> = {};
      for (const [k, v] of entries) {
        // Only persist 25-per-page slices or bounded monthly slices (<= 150 items) to keep localStorage lightweight
        if (Array.isArray(v.items) && v.items.length <= 150) {
          obj[k] = v;
        }
      }
      localStorage.setItem(storageKey('tx_page_cache_v1', uid), JSON.stringify(obj));
    } catch {
      // Ignore storage quota
    }
  }

  function saveTxServerPageToCache(
    uid: string,
    cacheKey: string,
    payload: {
      items: TransactionItem[];
      page: number;
      pageSize: number;
      totalFiltered: number;
      totalPages: number;
      syncToken: number;
    }
  ) {
    txServerPageMemoryCache.set(cacheKey, {
      ...payload,
      cachedAt: Date.now(),
    });
    persistTxPageCacheToStorage(uid);
  }

  function invalidateServerPaginationCaches(uid?: string) {
    txCursorByFilterKey.clear();
    txServerPageMemoryCache.clear();
    txFilteredPoolMemoryCache.clear();
    txCountCacheByFilterKey.clear();
    loadedTransactionPeriods.clear();
    if (uid) {
      try {
        localStorage.removeItem(storageKey('tx_page_cache_v1', uid));
      } catch {
        // Ignore
      }
    }
  }

  /**
   * Available `YYYY-MM` periods extracted from user's transactions, budgets, and recent 24 months
   * so the user can select any month on demand without downloading all historical transactions upfront.
   */
  const availablePeriods = computed<string[]>(() => {
    const set = new Set<string>();
    const now = new Date();
    // Always include the last 24 months so historical periods are selectable for on-demand server query
    for (let i = 0; i < 24; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      set.add(ym);
    }
    for (const p of budgetPeriods.value) {
      if (/^\d{4}-\d{2}$/.test(p)) set.add(p);
    }
    for (const tx of rawTransactions.value) {
      const m = String(tx.date || '').slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(m)) {
        set.add(m);
      }
    }
    for (const tx of rawServerPaginatedTransactions.value) {
      const m = String(tx.date || '').slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(m)) {
        set.add(m);
      }
    }
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  });

  function mergeFetchedTransactionsIntoCache(incomingList: TransactionItem[]) {
    if (incomingList.length === 0) return;
    const map = new Map<string, TransactionItem>();
    for (const existing of rawTransactions.value) {
      if (!existing.deleted) {
        map.set(existing.id, existing);
      }
    }
    for (const item of incomingList) {
      if (!item.deleted) {
        map.set(item.id, item);
      } else {
        map.delete(item.id);
      }
    }
    const merged = Array.from(map.values());
    merged.sort((a, b) => {
      const cmp = String(b.date || '').localeCompare(String(a.date || ''));
      if (cmp !== 0) return cmp;
      return String(b.id || '').localeCompare(String(a.id || ''));
    });
    rawTransactions.value = merged;
  }

  /**
   * Ensure transactions for a specific YYYY-MM period (or date range) are fetched from Firestore on-demand.
   * Performs a 1-sync read token check first; if already cached for this range and no remote changes occurred,
   * reuses the cached data without re-querying Firestore!
   */
  async function ensureTransactionsForDateRange(startIso: string, endIso: string) {
    const authStore = useAuthStore();
    const uid = sanitizeId(authStore.user?.uid || activeOwnerUid.value || '');
    if (!uid || uid === 'guest') return;

    // 1. Always accompany user activity with 1-sync read token check
    await checkAndSyncIfRemoteChanged(uid);

    const rangeKey = `${uid}:${startIso}:${endIso}`;
    if (loadedTransactionPeriods.has(rangeKey)) return;

    const canQuery = await ensureFirestoreSessionForUser(uid);
    if (!canQuery) return;

    try {
      const q = query(
        collection(db, 'transactions'),
        where('ownerId', '==', uid),
        where('date', '>=', startIso),
        where('date', '<=', `${endIso}\uf8ff`)
      );
      const snap = await getDocs(q);
      const fetched: TransactionItem[] = snap.docs
        .map((d: any) => ({
          id: d.id,
          ...(d.data() as Omit<TransactionItem, 'id'>),
        }))
        .filter((t: TransactionItem) => !t.deleted);

      loadedTransactionPeriods.add(rangeKey);
      mergeFetchedTransactionsIntoCache(fetched);
      saveLocalSnapshot(uid, false);
    } catch {
      // Fallback: if composite index on (ownerId, date) is not built, query by period or latest batch
    }
  }

  /**
   * Server-Side Paginated Transaction Loader for `/transactions` with 1-Sync Read Token Cache:
   * - On every user activity (switching page, changing period/filter), checks the 1-read sync token (`/users/{uid}`).
   * - If the requested page/filter is already in cache AND the sync token has not changed, immediately serves
   *   the cached 25 items with 0 extra collection queries!
   * - If the page is not cached yet OR the sync token changed in Firestore, loads only the required page from Firestore
   *   and stores it in cache for subsequent visits.
   */
  async function fetchTransactionsServerPage(
    params?: {
      page?: number;
      limit?: number;
      period?: string;
      type?: string;
      category?: string;
      walletId?: string;
      holder?: string;
      search?: string;
    },
    silent = false,
    forceServerReload = false
  ) {
    if (params) {
      currentTxServerFilter = {
        page: params.page ?? currentTxServerFilter.page,
        limit: params.limit ?? currentTxServerFilter.limit,
        period: params.period ?? currentTxServerFilter.period,
        type: params.type ?? currentTxServerFilter.type,
        category: params.category ?? currentTxServerFilter.category,
        walletId: params.walletId ?? currentTxServerFilter.walletId,
        holder: params.holder ?? currentTxServerFilter.holder,
        search: params.search ?? currentTxServerFilter.search,
      };
    }

    const authStore = useAuthStore();
    const uid = sanitizeId(authStore.user?.uid || activeOwnerUid.value || '');
    if (!uid || uid === 'guest') return;

    const targetPeriod = currentTxServerFilter.period || 'all';
    const targetPage = Math.max(1, currentTxServerFilter.page || 1);
    const pageSize = Math.max(1, currentTxServerFilter.limit || 25);
    const hasClientSubFilters =
      currentTxServerFilter.type !== 'all' ||
      currentTxServerFilter.category !== 'all' ||
      currentTxServerFilter.walletId !== 'all' ||
      currentTxServerFilter.holder !== 'all' ||
      Boolean(currentTxServerFilter.search.trim());

    // 1. Check if we already have this exact page in cache so we can render it immediately without UI flicker
    const initialSyncToken = getSavedUserSyncToken(uid);
    if (txServerPageMemoryCache.size === 0 && initialSyncToken > 0) {
      restorePersistedTxPageCache(uid, initialSyncToken);
    }

    const cacheKey = buildTxPageCacheKey(uid, currentTxServerFilter);
    const preCachedEntry = !forceServerReload ? txServerPageMemoryCache.get(cacheKey) : undefined;

    if (
      preCachedEntry &&
      initialSyncToken > 0 &&
      Math.abs(preCachedEntry.syncToken - initialSyncToken) <= 2000
    ) {
      // Serve immediately from cache so UI is instant
      rawServerPaginatedTransactions.value = preCachedEntry.items;
      txServerPage.value = preCachedEntry.page;
      txServerPageSize.value = preCachedEntry.pageSize;
      txServerTotalFiltered.value = preCachedEntry.totalFiltered;
      txServerTotalPages.value = preCachedEntry.totalPages;

      // Accompany user activity with 1-sync read token check in background/foreground:
      // If remote data did NOT change, we return immediately and keep using the cached 25 items!
      // If remote data DID change, `checkAndSyncIfRemoteChanged` invalidates the cache and we reload from server below.
      const remoteChanged = await checkAndSyncIfRemoteChanged(uid);
      if (!remoteChanged && txServerPageMemoryCache.has(cacheKey)) {
        return;
      }
    } else {
      // Page not yet in cache: still verify 1-sync read token first so our cache token is fresh
      if (!silent) isTxServerPageLoading.value = true;
      await checkAndSyncIfRemoteChanged(uid);
      // Re-check cache in case checkAndSyncIfRemoteChanged or initial load populated it
      const freshTokenAfterCheck = getSavedUserSyncToken(uid);
      const cachedAfterCheck = !forceServerReload
        ? txServerPageMemoryCache.get(cacheKey)
        : undefined;
      if (
        cachedAfterCheck &&
        freshTokenAfterCheck > 0 &&
        Math.abs(cachedAfterCheck.syncToken - freshTokenAfterCheck) <= 2000
      ) {
        rawServerPaginatedTransactions.value = cachedAfterCheck.items;
        txServerPage.value = cachedAfterCheck.page;
        txServerPageSize.value = cachedAfterCheck.pageSize;
        txServerTotalFiltered.value = cachedAfterCheck.totalFiltered;
        txServerTotalPages.value = cachedAfterCheck.totalPages;
        if (!silent) isTxServerPageLoading.value = false;
        return;
      }
    }

    if (!silent) isTxServerPageLoading.value = true;

    try {
      const canQuery = await ensureFirestoreSessionForUser(uid);
      const activeSyncToken = getSavedUserSyncToken(uid) || Date.now();

      // CASE 1: Specific Monthly Period ('YYYY-MM') -> Fetch ONLY that month's transactions from Firestore & cache
      if (targetPeriod !== 'all' && /^\d{4}-\d{2}$/.test(targetPeriod)) {
        const startIso = `${targetPeriod}-01`;
        const endIso = `${targetPeriod}-31`;
        const rangeKey = `${uid}:${startIso}:${endIso}`;

        // If this month was already loaded during the current sync token, filter from cached month docs (0 extra reads!)
        if (loadedTransactionPeriods.has(rangeKey) && !forceServerReload) {
          const cachedMonthDocs = rawTransactions.value
            .filter((tx) => !tx.deleted && String(tx.date || '').slice(0, 7) === targetPeriod)
            .map((tx) => enrichTransactionItem(tx))
            .filter((tx) => matchesClientSubFilters(tx));

          rawServerPaginatedTransactions.value = cachedMonthDocs;
          txServerPage.value = 1;
          txServerPageSize.value = Math.max(1, cachedMonthDocs.length);
          txServerTotalFiltered.value = cachedMonthDocs.length;
          txServerTotalPages.value = 1;

          saveTxServerPageToCache(uid, cacheKey, {
            items: cachedMonthDocs,
            page: 1,
            pageSize: Math.max(1, cachedMonthDocs.length),
            totalFiltered: cachedMonthDocs.length,
            totalPages: 1,
            syncToken: activeSyncToken,
          });
          return;
        }

        if (canQuery) {
          try {
            const monthQuery = query(
              collection(db, 'transactions'),
              where('ownerId', '==', uid),
              where('date', '>=', startIso),
              where('date', '<=', `${endIso}\uf8ff`),
              orderBy('date', 'desc')
            );
            const snap = await getDocs(monthQuery);
            const monthDocs: TransactionItem[] = snap.docs
              .map((d: any) => ({
                id: d.id,
                ...(d.data() as Omit<TransactionItem, 'id'>),
              }))
              .filter((t: TransactionItem) => !t.deleted);

            monthDocs.sort((a, b) => {
              const cmp = String(b.date || '').localeCompare(String(a.date || ''));
              if (cmp !== 0) return cmp;
              return String(b.id || '').localeCompare(String(a.id || ''));
            });

            loadedTransactionPeriods.add(rangeKey);
            mergeFetchedTransactionsIntoCache(monthDocs);

            const enrichedAndFiltered = monthDocs
              .map((tx) => enrichTransactionItem(tx))
              .filter((tx) => matchesClientSubFilters(tx));

            rawServerPaginatedTransactions.value = enrichedAndFiltered;
            txServerPage.value = 1;
            txServerPageSize.value = Math.max(1, enrichedAndFiltered.length);
            txServerTotalFiltered.value = enrichedAndFiltered.length;
            txServerTotalPages.value = 1;

            saveTxServerPageToCache(uid, cacheKey, {
              items: enrichedAndFiltered,
              page: 1,
              pageSize: Math.max(1, enrichedAndFiltered.length),
              totalFiltered: enrichedAndFiltered.length,
              totalPages: 1,
              syncToken: activeSyncToken,
            });
            return;
          } catch {
            // Fallback to cached period filter if index is building
          }
        }

        const fallbackMonth = rawTransactions.value
          .filter((tx) => !tx.deleted && String(tx.date || '').slice(0, 7) === targetPeriod)
          .map((tx) => enrichTransactionItem(tx))
          .filter((tx) => matchesClientSubFilters(tx));

        rawServerPaginatedTransactions.value = fallbackMonth;
        txServerPage.value = 1;
        txServerPageSize.value = Math.max(1, fallbackMonth.length);
        txServerTotalFiltered.value = fallbackMonth.length;
        txServerTotalPages.value = 1;
        return;
      }

      // CASE 2: 'all' (Semua Periode) with NO extra text/dropdown subfilters -> Pure Firestore Server-Side Cursor Pagination (25 per page) + Page Cache
      if (!hasClientSubFilters && canQuery) {
        const filterKey = `${uid}:all`;
        if (!txCursorByFilterKey.has(filterKey)) {
          txCursorByFilterKey.set(filterKey, new Map());
        }
        const cursorMap = txCursorByFilterKey.get(filterKey)!;

        try {
          // 1. Get exact server count from cache if syncToken matches, or from Firestore (1 aggregation read)
          let totalServerCount = 0;
          const cachedCountObj = txCountCacheByFilterKey.get(filterKey);
          if (
            !forceServerReload &&
            cachedCountObj &&
            Math.abs(cachedCountObj.syncToken - activeSyncToken) <= 2000
          ) {
            totalServerCount = cachedCountObj.count;
          } else {
            const baseCountQuery = query(
              collection(db, 'transactions'),
              where('ownerId', '==', uid),
              where('deleted', '==', false)
            );
            try {
              const countSnap = await getCountFromServer(baseCountQuery);
              totalServerCount = countSnap.data().count;
            } catch {
              const fallbackCountSnap = await getCountFromServer(
                query(collection(db, 'transactions'), where('ownerId', '==', uid))
              );
              totalServerCount = fallbackCountSnap.data().count;
            }
            txCountCacheByFilterKey.set(filterKey, {
              count: totalServerCount,
              syncToken: activeSyncToken,
            });
          }

          const totalPages = Math.max(1, Math.ceil(totalServerCount / pageSize));
          const safePage = Math.min(targetPage, totalPages);
          const safePageCacheKey = buildTxPageCacheKey(uid, {
            ...currentTxServerFilter,
            page: safePage,
          });

          // Check if `safePage` is already in cache for the current syncToken
          const safePageCached = !forceServerReload
            ? txServerPageMemoryCache.get(safePageCacheKey)
            : undefined;
          if (
            safePageCached &&
            Math.abs(safePageCached.syncToken - activeSyncToken) <= 2000
          ) {
            rawServerPaginatedTransactions.value = safePageCached.items;
            txServerPage.value = safePageCached.page;
            txServerPageSize.value = safePageCached.pageSize;
            txServerTotalFiltered.value = safePageCached.totalFiltered;
            txServerTotalPages.value = safePageCached.totalPages;
            return;
          }

          // 2. Ensure cursor for (safePage - 1) is available, or walk forward using lightweight limit queries
          let startAfterDoc: DocumentSnapshot | undefined =
            safePage > 1 ? cursorMap.get(safePage - 1) : undefined;

          if (safePage > 1 && !startAfterDoc) {
            // Find the highest cached cursor page < safePage
            let latestCachedPage = 0;
            for (const [p, cur] of cursorMap.entries()) {
              if (p < safePage && p > latestCachedPage) {
                latestCachedPage = p;
                startAfterDoc = cur;
              }
            }
            const docsToSkip = (safePage - 1 - latestCachedPage) * pageSize;
            if (docsToSkip > 0) {
              const skipConstraints: QueryConstraint[] = [
                where('ownerId', '==', uid),
                orderBy('date', 'desc'),
              ];
              if (startAfterDoc) {
                skipConstraints.push(startAfter(startAfterDoc));
              }
              skipConstraints.push(limit(docsToSkip));
              const skipSnap = await getDocs(
                query(collection(db, 'transactions'), ...skipConstraints)
              );
              if (skipSnap.docs.length > 0) {
                // Also save intermediate page cursors every `pageSize` docs so jumping back to intermediate pages is instant!
                for (let idx = pageSize - 1; idx < skipSnap.docs.length; idx += pageSize) {
                  const pageNum = latestCachedPage + Math.floor((idx + 1) / pageSize);
                  cursorMap.set(pageNum, skipSnap.docs[idx]);
                }
                startAfterDoc = skipSnap.docs[skipSnap.docs.length - 1];
                cursorMap.set(safePage - 1, startAfterDoc);
              }
            }
          }

          // 3. Fetch ONLY `pageSize` (25) documents for the current page from Firestore!
          const pageConstraints: QueryConstraint[] = [
            where('ownerId', '==', uid),
            orderBy('date', 'desc'),
          ];
          if (startAfterDoc) {
            pageConstraints.push(startAfter(startAfterDoc));
          }
          pageConstraints.push(limit(pageSize));

          const pageSnap = await getDocs(
            query(collection(db, 'transactions'), ...pageConstraints)
          );

          if (pageSnap.docs.length > 0) {
            cursorMap.set(safePage, pageSnap.docs[pageSnap.docs.length - 1]);
          }

          const pageItems: TransactionItem[] = pageSnap.docs
            .map((d: any) => ({
              id: d.id,
              ...(d.data() as Omit<TransactionItem, 'id'>),
            }))
            .filter((t: TransactionItem) => !t.deleted);

          mergeFetchedTransactionsIntoCache(pageItems);

          const finalTotalFiltered = Math.max(totalServerCount, pageItems.length);
          const finalTotalPages = Math.max(1, Math.ceil(finalTotalFiltered / pageSize));

          rawServerPaginatedTransactions.value = pageItems;
          txServerPage.value = safePage;
          txServerPageSize.value = pageSize;
          txServerTotalFiltered.value = finalTotalFiltered;
          txServerTotalPages.value = finalTotalPages;

          // Save this 25-item page to cache bound to `activeSyncToken`
          saveTxServerPageToCache(uid, safePageCacheKey, {
            items: pageItems,
            page: safePage,
            pageSize,
            totalFiltered: finalTotalFiltered,
            totalPages: finalTotalPages,
            syncToken: activeSyncToken,
          });
          return;
        } catch {
          // If Firestore composite index (ownerId + date desc) is not built on this project,
          // fall through to bounded query below
        }
      }

      // CASE 3: Filtered search / category / wallet / holder across 'all' periods, or index fallback
      if (canQuery) {
        const poolKey = buildTxSubFilterPoolKey(uid, currentTxServerFilter);
        const cachedPool = !forceServerReload ? txFilteredPoolMemoryCache.get(poolKey) : undefined;
        let matchedDocs: TransactionItem[];

        if (cachedPool && Math.abs(cachedPool.syncToken - activeSyncToken) <= 2000) {
          matchedDocs = cachedPool.items;
        } else {
          const constraints: QueryConstraint[] = [where('ownerId', '==', uid)];
          if (currentTxServerFilter.type !== 'all') {
            constraints.push(where('type', '==', currentTxServerFilter.type));
          }
          if (currentTxServerFilter.category !== 'all') {
            constraints.push(where('category', '==', currentTxServerFilter.category));
          }
          if (
            currentTxServerFilter.walletId !== 'all' &&
            currentTxServerFilter.type !== 'transfer'
          ) {
            constraints.push(where('walletId', '==', currentTxServerFilter.walletId));
          }

          const snap = await getDocs(query(collection(db, 'transactions'), ...constraints));
          matchedDocs = snap.docs
            .map((d: any) => ({
              id: d.id,
              ...(d.data() as Omit<TransactionItem, 'id'>),
            }))
            .filter((t: TransactionItem) => !t.deleted);

          matchedDocs.sort((a, b) => {
            const cmp = String(b.date || '').localeCompare(String(a.date || ''));
            if (cmp !== 0) return cmp;
            return String(b.id || '').localeCompare(String(a.id || ''));
          });

          txFilteredPoolMemoryCache.set(poolKey, {
            items: matchedDocs,
            syncToken: activeSyncToken,
          });
          mergeFetchedTransactionsIntoCache(matchedDocs);
        }

        const postFiltered = matchedDocs
          .map((tx) => enrichTransactionItem(tx))
          .filter((tx) => matchesClientSubFilters(tx));

        const totalFiltered = postFiltered.length;
        const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
        const safePage = Math.min(targetPage, totalPages);
        const start = (safePage - 1) * pageSize;
        const pageSlice = postFiltered.slice(start, start + pageSize);

        rawServerPaginatedTransactions.value = pageSlice;
        txServerPage.value = safePage;
        txServerPageSize.value = pageSize;
        txServerTotalFiltered.value = totalFiltered;
        txServerTotalPages.value = totalPages;

        const safePageCacheKey = buildTxPageCacheKey(uid, {
          ...currentTxServerFilter,
          page: safePage,
        });
        saveTxServerPageToCache(uid, safePageCacheKey, {
          items: pageSlice,
          page: safePage,
          pageSize,
          totalFiltered,
          totalPages,
          syncToken: activeSyncToken,
        });
        return;
      }

      // Offline cache fallback
      const offlineFiltered = rawTransactions.value
        .filter((tx) => !tx.deleted)
        .map((tx) => enrichTransactionItem(tx))
        .filter((tx) => matchesClientSubFilters(tx));

      const totalFiltered = offlineFiltered.length;
      const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
      const safePage = Math.min(targetPage, totalPages);
      const start = (safePage - 1) * pageSize;

      rawServerPaginatedTransactions.value = offlineFiltered.slice(start, start + pageSize);
      txServerPage.value = safePage;
      txServerPageSize.value = pageSize;
      txServerTotalFiltered.value = totalFiltered;
      txServerTotalPages.value = totalPages;
    } catch (err) {
      if (isFirestoreQuotaError(err)) {
        useNotificationStore().notifyQuotaExceeded();
      }
    } finally {
      if (!silent) isTxServerPageLoading.value = false;
    }
  }

  function matchesClientSubFilters(tx: TransactionItem): boolean {
    if (
      currentTxServerFilter.period !== 'all' &&
      String(tx.date || '').slice(0, 7) !== currentTxServerFilter.period
    ) {
      return false;
    }
    if (
      currentTxServerFilter.type !== 'all' &&
      tx.type !== currentTxServerFilter.type
    ) {
      return false;
    }
    if (
      currentTxServerFilter.category !== 'all' &&
      tx.category !== currentTxServerFilter.category
    ) {
      return false;
    }
    if (
      currentTxServerFilter.walletId !== 'all' &&
      tx.walletId !== currentTxServerFilter.walletId &&
      tx.toWalletId !== currentTxServerFilter.walletId
    ) {
      return false;
    }
    if (
      currentTxServerFilter.holder !== 'all' &&
      tx.fundOwnerName !== currentTxServerFilter.holder &&
      tx.toFundOwnerName !== currentTxServerFilter.holder
    ) {
      return false;
    }
    if (currentTxServerFilter.search.trim()) {
      const q = currentTxServerFilter.search.trim().toLowerCase();
      return (
        String(tx.note || '').toLowerCase().includes(q) ||
        String(tx.category || '').toLowerCase().includes(q) ||
        String(tx.walletName || '').toLowerCase().includes(q) ||
        String(tx.toWalletName || '').toLowerCase().includes(q) ||
        String(tx.fundOwnerName || '').toLowerCase().includes(q) ||
        String(tx.toFundOwnerName || '').toLowerCase().includes(q)
      );
    }
    return true;
  }

  /**
   * Transactions filtered by `selectedPeriod` ('all' or 'YYYY-MM')
   */
  const periodTransactions = computed<TransactionItem[]>(() => {
    if (!selectedPeriod.value || selectedPeriod.value === 'all') {
      return transactions.value;
    }
    return transactions.value.filter(
      (tx) => String(tx.date || '').slice(0, 7) === selectedPeriod.value
    );
  });

  let isCheckingSyncToken = false;
  let lastTokenCheckAt = 0;
  const TOKEN_CHECK_COOLDOWN_MS = 1500; // 1.5s dedup window so simultaneous watchers on the same click share 1 read

  async function fetchAllCollectionsFromFirestore(uid: string, remoteSyncToken = 0) {
    const currentMonth = getCurrentMonthPeriod();
    const monthStartIso = `${currentMonth}-01`;
    const monthEndIso = `${currentMonth}-31`;
    const effectiveSyncToken = remoteSyncToken > 0 ? remoteSyncToken : Date.now();

    // Clear stale pagination caches before loading fresh server state
    invalidateServerPaginationCaches(uid);

    // Build bounded transaction query: ONLY fetch current month's transactions + latest 25 transactions (server-side pagination)
    // Never load the entire transactions collection at startup!
    let initialPage1Items: TransactionItem[] = [];
    const fetchInitialBoundedTransactions = async () => {
      const combinedMap = new Map<string, any>();
      try {
        const [monthSnap, page1Snap] = await Promise.all([
          getDocs(
            query(
              collection(db, 'transactions'),
              where('ownerId', '==', uid),
              where('date', '>=', monthStartIso),
              where('date', '<=', `${monthEndIso}\uf8ff`)
            )
          ),
          getDocs(
            query(
              collection(db, 'transactions'),
              where('ownerId', '==', uid),
              orderBy('date', 'desc'),
              limit(25)
            )
          ),
        ]);
        monthSnap.docs.forEach((d) => combinedMap.set(d.id, d));
        page1Snap.docs.forEach((d) => combinedMap.set(d.id, d));

        loadedTransactionPeriods.add(`${uid}:${monthStartIso}:${monthEndIso}`);

        if (page1Snap.docs.length > 0) {
          const filterKey = `${uid}:all`;
          if (!txCursorByFilterKey.has(filterKey)) {
            txCursorByFilterKey.set(filterKey, new Map());
          }
          txCursorByFilterKey
            .get(filterKey)!
            .set(1, page1Snap.docs[page1Snap.docs.length - 1]);

          initialPage1Items = page1Snap.docs
            .map((d: any) => ({
              id: d.id,
              ...(d.data() as Omit<TransactionItem, 'id'>),
            }))
            .filter((t: TransactionItem) => !t.deleted);
        }
        return { docs: Array.from(combinedMap.values()) };
      } catch {
        // Fallback if composite index on (ownerId, date) is not yet available
        const boundedSnap = await getDocs(
          query(collection(db, 'transactions'), where('ownerId', '==', uid), limit(50))
        );
        return boundedSnap;
      }
    };

    const queries: Promise<any>[] = [
      getDocs(query(collection(db, 'wallets'), where('ownerId', '==', uid))),
      getDocs(query(collection(db, 'wallet_owners'), where('ownerId', '==', uid))),
      getDocs(query(collection(db, 'categories'), where('ownerId', '==', uid))),
      fetchInitialBoundedTransactions(),
      getDocs(query(collection(db, 'budgets'), where('ownerId', '==', uid))),
    ];

    // Only fetch global default categories if not already cached in localStorage
    const shouldFetchDefaultCats =
      uid !== DEFAULT_CATEGORY_OWNER_ID && defaultCategories.value.length === 0;
    if (shouldFetchDefaultCats) {
      queries.push(
        getDocs(
          query(collection(db, 'categories'), where('ownerId', '==', DEFAULT_CATEGORY_OWNER_ID))
        )
      );
    }

    const results = await Promise.all(queries);
    const [walletsSnap, holdersSnap, userCatSnap, txSnap, budgetSnap, defaultCatSnap] = results;

    wallets.value = walletsSnap.docs
      .map((d: any) => ({
        id: d.id,
        ...(d.data() as Omit<WalletItem, 'id'>),
      }))
      .filter((w: WalletItem) => !w.deleted)
      .sort((a: WalletItem, b: WalletItem) => a.name.localeCompare(b.name));

    rawWalletOwners.value = holdersSnap.docs
      .map((d: any) => ({
        id: d.id,
        ...(d.data() as Omit<WalletOwnerItem, 'id'>),
      }))
      .filter((fo: WalletOwnerItem) => !fo.deleted);

    rawUserCategories.value = userCatSnap.docs
      .map((d: any) => ({
        id: d.id,
        ...(d.data() as Omit<CategoryItem, 'id'>),
        isDefault: false,
      }))
      .sort((a: CategoryItem, b: CategoryItem) => a.name.localeCompare(b.name));

    if (defaultCatSnap) {
      defaultCategories.value = defaultCatSnap.docs
        .map((d: any) => ({
          id: d.id,
          ...(d.data() as Omit<CategoryItem, 'id'>),
          isDefault: true,
        }))
        .filter((c: CategoryItem) => !c.deleted)
        .sort((a: CategoryItem, b: CategoryItem) => a.name.localeCompare(b.name));
    }

    const txList: TransactionItem[] = txSnap.docs
      .map((d: any) => ({
        id: d.id,
        ...(d.data() as Omit<TransactionItem, 'id'>),
      }))
      .filter((t: TransactionItem) => !t.deleted);

    txList.sort((a, b) => {
      const cmp = String(b.date || '').localeCompare(String(a.date || ''));
      if (cmp !== 0) return cmp;
      return String(b.id || '').localeCompare(String(a.id || ''));
    });
    rawTransactions.value = txList;

    const allBudgetDocsRaw = budgetSnap.docs.map((d: any) => ({
      id: d.id,
      ...(d.data() as Omit<BudgetItem, 'id'>),
    }));

    // Check if Firestore has an explicit SisaUang Pro marker document for this user
    const proMarkerDoc = allBudgetDocsRaw.find(
      (b: BudgetItem) => b.category === '__SISAUANG_PRO__'
    );
    if (proMarkerDoc) {
      const authStore = useAuthStore();
      if (authStore.user?.uid === uid) {
        const rawPeriod = String(proMarkerDoc.period || '');
        if (rawPeriod.startsWith('P:')) {
          const planCode = rawPeriod.slice(2, 3);
          const plan: 'monthly' | 'yearly' = planCode === 'Y' ? 'yearly' : 'monthly';
          authStore.setExternalSubscriptionStatus(
            proMarkerDoc.deleted ? 'free' : 'pending',
            proMarkerDoc.deleted ? null : plan,
            null
          );
        } else {
          let plan: 'monthly' | 'yearly' = 'monthly';
          let expiresAt: string | null = null;
          if (rawPeriod.startsWith('Y:')) {
            plan = 'yearly';
            expiresAt = rawPeriod.slice(2) || null;
          } else if (rawPeriod.startsWith('M:')) {
            plan = 'monthly';
            expiresAt = rawPeriod.slice(2) || null;
          }
          authStore.setExternalSubscriptionStatus(
            proMarkerDoc.deleted ? 'free' : 'pro',
            proMarkerDoc.deleted ? null : plan,
            proMarkerDoc.deleted ? null : expiresAt
          );
        }
      }
    }

    const allActiveBudgetDocs = allBudgetDocsRaw.filter(
      (b: BudgetItem) => !b.deleted && b.category !== '__SISAUANG_PRO__'
    );

    budgets.value = allActiveBudgetDocs.filter(
      (b: BudgetItem) =>
        b.category !== BUDGET_PERIOD_MARKER_CATEGORY && b.category !== '__SISAUANG_PRO__'
    );

    const periodSet = new Set<string>(budgetPeriods.value);
    for (const b of allActiveBudgetDocs) {
      if (b.period && /^\d{4}-\d{2}$/.test(b.period)) {
        periodSet.add(b.period);
      }
    }
    budgetPeriods.value = Array.from(periodSet).sort((a, b) => b.localeCompare(a));

    syncWalletTotalBalancesFromHolders();

    if (!hasAutoSelectedPeriod.value && txList.length > 0) {
      hasAutoSelectedPeriod.value = true;
      const currentMonth = getCurrentMonthPeriod();
      const hasCurrentMonthTx = txList.some(
        (tx) => String(tx.date || '').slice(0, 7) === currentMonth
      );
      if (hasCurrentMonthTx) {
        selectedPeriod.value = currentMonth;
      } else {
        const latestTxMonth = String(txList[0].date || '').slice(0, 7);
        if (/^\d{4}-\d{2}$/.test(latestTxMonth)) {
          selectedPeriod.value = latestTxMonth;
        }
      }
    }

    isSyncedWithFirestore.value = true;
    saveLocalSnapshot(uid, true, effectiveSyncToken);

    // If initialPage1Items were fetched, also pre-populate Page 1 cache if total count <= 24
    if (initialPage1Items.length > 0 && initialPage1Items.length < 25) {
      const defaultPage1Key = buildTxPageCacheKey(uid, {
        page: 1,
        limit: 25,
        period: 'all',
        type: 'all',
        category: 'all',
        walletId: 'all',
        holder: 'all',
        search: '',
      });
      txCountCacheByFilterKey.set(`${uid}:all`, {
        count: initialPage1Items.length,
        syncToken: effectiveSyncToken,
      });
      saveTxServerPageToCache(uid, defaultPage1Key, {
        items: initialPage1Items,
        page: 1,
        pageSize: 25,
        totalFiltered: initialPage1Items.length,
        totalPages: 1,
        syncToken: effectiveSyncToken,
      });
    }
  }

  /**
   * 1-Sync Read Token Check triggered on every user activity
   * (switching pages/pagination, switching menus, returning to app tab/window focus, changing period, opening modals).
   * Costs ONLY 1 document read (`/users/{uid}`).
   * - If remote `updatedAt` has NOT changed: returns `false` and keeps all cached pages & collections intact (0 collection reads!).
   * - If remote `updatedAt` HAS changed: invalidates caches, reloads fresh data from server, stores in cache again, and returns `true`.
   */
  async function checkAndSyncIfRemoteChanged(
    uidInput?: string,
    bypassCooldown = false
  ): Promise<boolean> {
    const authStore = useAuthStore();
    if (!authStore.isAuthenticated || authStore.isSuperAdmin) return false;

    const uid = sanitizeId(uidInput || authStore.user?.uid || activeOwnerUid.value || '');
    if (!uid || uid === 'guest') return false;

    // If initial load hasn't completed yet, let initFinanceData handle it
    if (isLoading.value || !isSyncedWithFirestore.value || activeOwnerUid.value !== uid) {
      return false;
    }

    const now = Date.now();
    if (!bypassCooldown && now - lastTokenCheckAt < TOKEN_CHECK_COOLDOWN_MS) {
      return false;
    }
    if (isCheckingSyncToken) return false;

    isCheckingSyncToken = true;
    lastTokenCheckAt = now;

    try {
      // Also check lightweight local server user status & subscription (0 Firestore reads)
      try {
        const res = await fetch(`/api/users/${encodeURIComponent(uid)}/status`);
        if (res.ok) {
          const statusData = await res.json();
          if (statusData.subscriptionStatus === 'pro' || statusData.isPro === true) {
            authStore.setExternalSubscriptionStatus(
              'pro',
              statusData.subscriptionPlan || 'monthly',
              statusData.subscriptionExpiresAt || null
            );
          } else if (statusData.subscriptionStatus === 'pending') {
            authStore.setExternalSubscriptionStatus(
              'pending',
              statusData.subscriptionPlan || 'monthly',
              null
            );
          } else if (statusData.subscriptionStatus === 'free' && statusData.isPro === false) {
            authStore.setExternalSubscriptionStatus('free', null, null);
          }
        }
      } catch {
        // Ignore network error
      }

      const canQuery = await ensureFirestoreSessionForUser(uid);
      if (!canQuery) return false;

      const localSyncToken = getSavedUserSyncToken(uid);

      const userSnap = await getDoc(doc(db, 'users', uid));
      if (!userSnap.exists()) return false;

      const uData = userSnap.data();
      const remoteSyncToken = extractTimestampMillis(uData?.updatedAt || uData?.createdAt);

      // If remote document has a newer timestamp (> 2s tolerance), invalidate page caches and pull fresh data from server
      if (remoteSyncToken > 0 && remoteSyncToken > localSyncToken + 2000) {
        invalidateServerPaginationCaches(uid);
        await fetchAllCollectionsFromFirestore(uid, remoteSyncToken);
        await fetchTransactionsServerPage(undefined, true, true);
        return true;
      }
      return false;
    } catch (err) {
      if (isFirestoreQuotaError(err)) {
        useNotificationStore().notifyQuotaExceeded();
      }
      return false;
    } finally {
      isCheckingSyncToken = false;
    }
  }

  async function initFinanceData(uidInput: string, forceRefresh = false) {
    cleanupListeners();
    const uid = sanitizeId(uidInput);

    // If already loaded in memory for this user and not forced to refresh, perform a lightweight 1-read sync check instead
    if (
      !forceRefresh &&
      activeOwnerUid.value === uid &&
      isSyncedWithFirestore.value &&
      (wallets.value.length > 0 || rawTransactions.value.length > 0)
    ) {
      await checkAndSyncIfRemoteChanged(uid, false);
      return;
    }

    activeOwnerUid.value = uid;
    isLoading.value = true;
    hasAutoSelectedPeriod.value = false;

    cleanupLegacyDummyStorage(uid);

    // Clear state first so dummy or previous user data never leaks
    wallets.value = [];
    rawWalletOwners.value = [];
    rawUserCategories.value = [];
    rawTransactions.value = [];
    budgets.value = [];
    budgetPeriods.value = [];

    let hasRestoredLocalCache = false;
    let localSyncToken = 0;

    // Restore last known real Firestore snapshot from localStorage immediately
    try {
      const savedWallets = localStorage.getItem(storageKey('wallets', uid));
      const savedHolders = localStorage.getItem(storageKey('wallet_owners', uid));
      const savedUserCats = localStorage.getItem(storageKey('user_categories', uid));
      const savedDefaultCats = localStorage.getItem('sisa_uang_real_default_categories');
      const savedTransactions = localStorage.getItem(storageKey('transactions', uid));
      const savedBudgets = localStorage.getItem(storageKey('budgets', uid));
      const savedBudgetPeriods = localStorage.getItem(storageKey('budget_periods', uid));
      const savedSyncToken =
        localStorage.getItem(storageKey('sync_token', uid)) ||
        localStorage.getItem(storageKey('last_sync_at', uid));

      if (savedSyncToken) {
        localSyncToken = Number(savedSyncToken) || 0;
      }
      if (savedWallets) {
        wallets.value = (JSON.parse(savedWallets) as WalletItem[]).filter((w) => !w.deleted);
      }
      if (savedHolders) {
        rawWalletOwners.value = (JSON.parse(savedHolders) as WalletOwnerItem[]).filter(
          (fo) => !fo.deleted
        );
      }
      if (savedUserCats) rawUserCategories.value = JSON.parse(savedUserCats);
      if (savedDefaultCats) defaultCategories.value = JSON.parse(savedDefaultCats);
      if (savedTransactions) rawTransactions.value = JSON.parse(savedTransactions);
      if (savedBudgets) {
        const parsedBudgets = JSON.parse(savedBudgets) as BudgetItem[];
        budgets.value = parsedBudgets.filter(
          (b) =>
            !b.deleted &&
            b.category !== BUDGET_PERIOD_MARKER_CATEGORY &&
            b.category !== '__SISAUANG_PRO__'
        );
      }
      const periodSet = new Set<string>();
      if (savedBudgetPeriods) {
        for (const p of JSON.parse(savedBudgetPeriods) as string[]) {
          if (p && /^\d{4}-\d{2}$/.test(p)) periodSet.add(p);
        }
      }
      for (const b of budgets.value) {
        if (b.period && /^\d{4}-\d{2}$/.test(b.period)) periodSet.add(b.period);
      }
      budgetPeriods.value = Array.from(periodSet).sort((a, b) => b.localeCompare(a));

      syncWalletTotalBalancesFromHolders();

      if (rawTransactions.value.length > 0 && !hasAutoSelectedPeriod.value) {
        hasAutoSelectedPeriod.value = true;
        const currentMonth = getCurrentMonthPeriod();
        const hasCurrentMonthTx = rawTransactions.value.some(
          (tx) => String(tx.date || '').slice(0, 7) === currentMonth
        );
        if (hasCurrentMonthTx) {
          selectedPeriod.value = currentMonth;
        } else {
          const latestTxMonth = String(rawTransactions.value[0].date || '').slice(0, 7);
          if (/^\d{4}-\d{2}$/.test(latestTxMonth)) {
            selectedPeriod.value = latestTxMonth;
          }
        }
      }

      hasRestoredLocalCache =
        wallets.value.length > 0 ||
        rawWalletOwners.value.length > 0 ||
        rawTransactions.value.length > 0;
    } catch {
      // Ignore corrupt cache
    }

    // Sync latest subscription status from Express registry (0 Firestore reads)
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(uid)}/status`);
      if (res.ok) {
        const statusData = await res.json();
        const authStore = useAuthStore();
        if (statusData.subscriptionStatus === 'pro' || statusData.isPro === true) {
          authStore.setExternalSubscriptionStatus(
            'pro',
            statusData.subscriptionPlan || 'monthly',
            statusData.subscriptionExpiresAt || null
          );
        } else if (statusData.subscriptionStatus === 'pending') {
          authStore.setExternalSubscriptionStatus(
            'pending',
            statusData.subscriptionPlan || 'monthly',
            null
          );
        } else if (statusData.subscriptionStatus === 'free' && statusData.isPro === false) {
          authStore.setExternalSubscriptionStatus('free', null, null);
        }
      }
    } catch {
      // Ignore network error
    }

    const canQueryFirestore = await ensureFirestoreSessionForUser(uid);

    if (canQueryFirestore) {
      try {
        let remoteSyncToken = 0;
        lastTokenCheckAt = Date.now();

        // 1-Read Sync Token Check:
        // Read ONLY 1 document (`/users/{uid}`) to verify if any other device modified financial data.
        // If `remoteSyncToken <= localSyncToken + 2000` (2s clock-skew tolerance), serve directly from localStorage cache (only 1 read total!).
        try {
          const userSnap = await getDoc(doc(db, 'users', uid));
          if (userSnap.exists()) {
            const uData = userSnap.data();
            remoteSyncToken = extractTimestampMillis(uData?.updatedAt || uData?.createdAt);
          }
        } catch (tokenErr) {
          if (isFirestoreQuotaError(tokenErr)) {
            useNotificationStore().notifyQuotaExceeded();
            isLoading.value = false;
            return;
          }
        }

        if (
          !forceRefresh &&
          hasRestoredLocalCache &&
          localSyncToken > 0 &&
          (remoteSyncToken === 0 || remoteSyncToken <= localSyncToken + 2000)
        ) {
          restorePersistedTxPageCache(uid, localSyncToken);
          isSyncedWithFirestore.value = true;
          isLoading.value = false;
          return;
        }

        await fetchAllCollectionsFromFirestore(uid, remoteSyncToken);
        isLoading.value = false;
      } catch (err) {
        isLoading.value = false;
        if (isFirestoreQuotaError(err)) {
          useNotificationStore().notifyQuotaExceeded();
          return;
        }
        handleFirestoreError(err, OperationType.LIST, 'finance_collections');
      }
    } else {
      isLoading.value = false;
    }
  }

  // Helper to get active fund owners for a specific active wallet
  function getHoldersByWalletId(walletId: string): WalletOwnerItem[] {
    const parentWallet = wallets.value.find((w) => w.id === walletId && !w.deleted);
    if (!parentWallet) return [];
    return walletOwners.value.filter((fo) => !fo.deleted && fo.walletId === walletId);
  }

  // Summary of Fund Ownership across all active wallets (Konsep Kepemilikan Dana SisaUang)
  // Requires 2 checks:
  // 1. `fo.deleted !== true` in `wallet_owners`
  // 2. Relational `fo.walletId` exists in `wallets` AND `parentWallet.deleted !== true`
  const ownershipSummary = computed<OwnershipSummaryItem[]>(() => {
    const map = new Map<string, OwnershipSummaryItem>();
    for (const fo of walletOwners.value) {
      if (fo.deleted) continue;
      const parentWallet = wallets.value.find((w) => w.id === fo.walletId && !w.deleted);
      if (!parentWallet) continue;

      const rawKey = String(fo.holderName || 'Pribadi').trim();
      const existing = map.get(rawKey) || {
        rawHolderName: rawKey,
        displayHolderName: formatHolderName(rawKey),
        totalBalance: 0,
        walletCount: 0,
        wallets: [],
      };
      const wName = parentWallet.name || fo.walletName || 'Sumber Dana';

      existing.totalBalance += Number(fo.balance || 0);
      existing.walletCount += 1;
      existing.wallets.push({
        holderId: fo.id,
        walletId: fo.walletId,
        walletName: wName,
        balance: Number(fo.balance || 0),
      });
      map.set(rawKey, existing);
    }
    return Array.from(map.values()).sort((a, b) => b.totalBalance - a.totalBalance);
  });

  // Dynamic Expense & Income Category Lists (from Firestore categories + transaction categories)
  const expenseCategoryNames = computed<string[]>(() => {
    const fromCats = categories.value
      .filter((c) => c.type === 'expense')
      .map((c) => c.name);
    const fromTx = rawTransactions.value
      .filter((t) => t.type === 'expense' && t.category)
      .map((t) => t.category);
    const combined = Array.from(new Set([...fromCats, ...fromTx]));
    return combined.length > 0 ? combined : FALLBACK_EXPENSE_CATEGORIES;
  });

  const incomeCategoryNames = computed<string[]>(() => {
    const fromCats = categories.value
      .filter((c) => c.type === 'income')
      .map((c) => c.name);
    const fromTx = rawTransactions.value
      .filter((t) => t.type === 'income' && t.category)
      .map((t) => t.category);
    const combined = Array.from(new Set([...fromCats, ...fromTx]));
    return combined.length > 0 ? combined : FALLBACK_INCOME_CATEGORIES;
  });

  // Computed Financial Metrics (Strictly from Real Firestore Data)
  const totalBalance = computed(() =>
    wallets.value.reduce((acc, w) => acc + Number(w.balance || 0), 0)
  );

  const monthlyIncome = computed(() =>
    periodTransactions.value
      .filter((t) => t.type === 'income')
      .reduce((acc, t) => acc + Number(t.amount || 0), 0)
  );

  const monthlyExpense = computed(() =>
    periodTransactions.value.reduce((acc, t) => {
      if (t.type === 'expense') return acc + Number(t.amount || 0);
      if (t.type === 'transfer' && Number(t.adminFee || 0) > 0) {
        return acc + Number(t.adminFee || 0);
      }
      return acc;
    }, 0)
  );

  const monthlyTransfer = computed(() =>
    periodTransactions.value
      .filter((t) => t.type === 'transfer')
      .reduce((acc, t) => acc + Number(t.amount || 0), 0)
  );

  /**
   * Helper to compute enriched budgets for any specific `YYYY-MM` period (or 'all').
   * Calculates actual `spentAmount` strictly from real expense transactions of that exact period & category!
   */
  function getEnrichedBudgetsByPeriod(targetPeriod: string) {
    const cleanPeriod = targetPeriod || getCurrentMonthPeriod();
    const relevantBudgets =
      cleanPeriod === 'all'
        ? budgets.value.filter((b) => !b.deleted && b.category !== BUDGET_PERIOD_MARKER_CATEGORY)
        : budgets.value.filter(
            (b) =>
              !b.deleted &&
              b.category !== BUDGET_PERIOD_MARKER_CATEGORY &&
              b.period === cleanPeriod
          );

    return relevantBudgets.map((b) => {
      const txSpent = transactions.value
        .filter(
          (t) =>
            t.type === 'expense' &&
            String(t.date || '').slice(0, 7) === b.period &&
            t.category.trim().toLowerCase() === b.category.trim().toLowerCase()
        )
        .reduce((sum, t) => sum + Number(t.amount || 0), 0);

      const effectiveSpent = txSpent;
      const limit = Number(b.limitAmount || 0);
      const remaining = Math.max(0, limit - effectiveSpent);
      const overAmount = Math.max(0, effectiveSpent - limit);
      const rawPercentage = limit > 0 ? Math.round((effectiveSpent / limit) * 100) : 0;
      const percentage = Math.min(100, rawPercentage);

      return {
        ...b,
        spentAmount: effectiveSpent,
        remaining,
        overAmount,
        rawPercentage,
        percentage,
      };
    });
  }

  const enrichedBudgets = computed(() => getEnrichedBudgetsByPeriod(selectedPeriod.value));

  const totalBudgetLimit = computed(() =>
    enrichedBudgets.value.reduce((acc, b) => acc + Number(b.limitAmount || 0), 0)
  );

  const totalBudgetSpent = computed(() =>
    enrichedBudgets.value.reduce((acc, b) => acc + Number(b.spentAmount || 0), 0)
  );

  /**
   * Sisa Uang Aktif:
   * Reflects the user's real total balance across all Sumber Dana (`totalBalance`),
   * or if wallets are 0, the net cashflow of the selected period.
   */
  const sisaUangBulanIni = computed(() => {
    if (wallets.value.length > 0) {
      return totalBalance.value;
    }
    return Math.max(0, monthlyIncome.value - monthlyExpense.value);
  });

  const periodNetCashflow = computed(() => monthlyIncome.value - monthlyExpense.value);

  const daysRemainingInMonth = computed(() => {
    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return Math.max(1, lastDay - now.getDate() + 1);
  });

  const safeDailySpend = computed(() =>
    Math.max(0, Math.round(sisaUangBulanIni.value / daysRemainingInMonth.value))
  );

  const savingsRate = computed(() => {
    if (monthlyIncome.value <= 0) return 0;
    const saved = monthlyIncome.value - monthlyExpense.value;
    return Math.round((saved / monthlyIncome.value) * 100);
  });

  // =========================================================================
  // Actions: Wallets & Kepemilikan Sumber Dana (Firestore `sisa-uang`)
  // =========================================================================

  async function addWallet(payload: {
    name: string;
    type: WalletItem['type'];
    balance: number;
    color: string;
    initialHolderName?: string;
  }): Promise<boolean> {
    const authStore = useAuthStore();
    const notify = useNotificationStore();

    if (!authStore.isProUser && wallets.value.length >= 5) {
      notify.openProModal({
        featureTitle: 'Batas Maksimal 5 Sumber Dana (Wallet)',
        featureDescription:
          'Pengguna paket Free hanya dapat menambahkan maksimal 5 sumber dana (wallet). Berlangganan SisaUang Pro untuk menambahkan sumber dana tanpa batas.',
        limitSummary: `${wallets.value.length} / 5 Sumber Dana Aktif`,
      });
      return false;
    }

    const uid = sanitizeId(authStore.user?.uid || activeOwnerUid.value || 'guest');
    const id = sanitizeId(`su_wallet_${Date.now()}`);
    const safeName = sanitizeString(payload.name, MAX_WALLET_NAME_LENGTH, 'Sumber Dana Baru');
    const safeColor = sanitizeString(payload.color, 20, 'emerald');
    const numericBalance = Number(payload.balance) || 0;
    const safeHolderName = sanitizeString(payload.initialHolderName || 'Pribadi', 60, 'Pribadi');

    const normalizedHolder = formatHolderName(safeHolderName).toLowerCase();
    const isExistingOwnership = ownershipSummary.value.some(
      (o) => o.displayHolderName.toLowerCase() === normalizedHolder
    );
    if (!authStore.isProUser && !isExistingOwnership && ownershipSummary.value.length >= 2) {
      notify.openProModal({
        featureTitle: 'Batas Maksimal 2 Kepemilikan Dana',
        featureDescription:
          'Pengguna paket Free hanya dapat memiliki maksimal 2 kepemilikan dana. Gunakan nama kepemilikan yang sudah ada atau berlangganan SisaUang Pro untuk menambahkan lebih dari 2 kepemilikan.',
        limitSummary: `${ownershipSummary.value.length} / 2 Kepemilikan Aktif`,
      });
      return false;
    }

    const holderId = sanitizeId(`su_holder_${Date.now()}`);

    await ensureFirestoreSessionForUser(uid);
    const walletDocData = {
      ownerId: uid,
      name: safeName,
      type: payload.type,
      balance: numericBalance,
      color: safeColor,
      deleted: false,
      deletedAt: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    const holderDocData = {
      ownerId: uid,
      walletId: id,
      walletName: safeName,
      holderName: safeHolderName,
      balance: numericBalance,
      deleted: false,
      deletedAt: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'wallets', id), walletDocData);
      batch.set(doc(db, 'wallet_owners', holderId), holderDocData);
      touchUserSyncTokenInBatch(batch, uid);
      await batch.commit();
    } catch {
      // Fallback: if live Firestore rules evaluate exists(/wallets/{walletId}) before batch commit,
      // create the parent wallet document first so it exists, then create its initial wallet_owners document!
      try {
        await setDoc(doc(db, 'wallets', id), walletDocData);
        const secondBatch = writeBatch(db);
        secondBatch.set(doc(db, 'wallet_owners', holderId), holderDocData);
        touchUserSyncTokenInBatch(secondBatch, uid);
        await secondBatch.commit();
      } catch (err) {
        useNotificationStore().notifyError('Gagal Menyimpan Sumber Dana', err);
        handleFirestoreError(err, OperationType.CREATE, `wallets/${id}`);
      }
    }

    // Update local state optimistically (0 extra Firestore reads)
    wallets.value.push({
      id,
      ownerId: uid,
      name: safeName,
      type: payload.type,
      balance: numericBalance,
      color: safeColor,
      deleted: false,
    });
    wallets.value.sort((a, b) => a.name.localeCompare(b.name));
    rawWalletOwners.value.push({
      id: holderId,
      ownerId: uid,
      walletId: id,
      walletName: safeName,
      holderName: safeHolderName,
      balance: numericBalance,
      deleted: false,
    });
    syncWalletTotalBalancesFromHolders();
    saveLocalSnapshot(uid, true);

    await authStore.recordAuditLog(
      'wallet_created',
      `Menambahkan sumber dana "${safeName}" (Pemilik: ${safeHolderName}) dengan saldo Rp ${numericBalance.toLocaleString('id-ID')}.`,
      'info'
    );
    useNotificationStore().notifySuccess(
      'Sumber Dana Ditambahkan',
      `Sumber dana "${safeName}" (Pemilik: ${safeHolderName}) berhasil disimpan ke Firestore.`
    );
    return true;
  }

  async function updateWallet(
    walletId: string,
    payload: { name: string; type: WalletItem['type']; color?: string }
  ) {
    const authStore = useAuthStore();
    const uid = sanitizeId(authStore.user?.uid || activeOwnerUid.value || 'guest');
    const target = wallets.value.find((w) => w.id === walletId);
    if (!target) return;

    const safeName = sanitizeString(payload.name, MAX_WALLET_NAME_LENGTH, target.name);
    const safeColor = sanitizeString(payload.color || target.color || 'emerald', 20, 'emerald');

    await ensureFirestoreSessionForUser(uid);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'wallets', walletId), {
        name: safeName,
        type: payload.type,
        color: safeColor,
        updatedAt: serverTimestamp(),
      });

      // Also update walletName in child wallet_owners
      const childHolders = walletOwners.value.filter((fo) => fo.walletId === walletId);
      for (const ch of childHolders) {
        batch.update(doc(db, 'wallet_owners', ch.id), {
          walletName: safeName,
          updatedAt: serverTimestamp(),
        });
      }
      touchUserSyncTokenInBatch(batch, uid);
      await batch.commit();
    } catch (err) {
      useNotificationStore().notifyError('Gagal Memperbarui Sumber Dana', err);
      handleFirestoreError(err, OperationType.UPDATE, `wallets/${walletId}`);
    }

    target.name = safeName;
    target.type = payload.type;
    target.color = safeColor;
    wallets.value.sort((a, b) => a.name.localeCompare(b.name));
    for (const ch of rawWalletOwners.value) {
      if (ch.walletId === walletId) {
        ch.walletName = safeName;
      }
    }
    syncWalletTotalBalancesFromHolders();
    saveLocalSnapshot(uid, true);

    useNotificationStore().notifySuccess(
      'Sumber Dana Diperbarui',
      `Sumber dana "${safeName}" berhasil diperbarui di Firestore.`
    );
  }

  async function addWalletOwner(payload: {
    walletId: string;
    holderName: string;
    balance: number;
  }): Promise<boolean> {
    const authStore = useAuthStore();
    const notify = useNotificationStore();
    const uid = sanitizeId(authStore.user?.uid || activeOwnerUid.value || 'guest');
    const wallet = wallets.value.find((w) => w.id === payload.walletId);
    if (!wallet) return false;

    const safeHolderName = sanitizeString(payload.holderName, 60, 'Pemilik Baru');
    const normalizedHolder = formatHolderName(safeHolderName).toLowerCase();
    const isExistingOwnership = ownershipSummary.value.some(
      (o) => o.displayHolderName.toLowerCase() === normalizedHolder
    );
    const walletHoldersCount = walletOwners.value.filter((fo) => fo.walletId === wallet.id).length;

    if (
      !authStore.isProUser &&
      (ownershipSummary.value.length >= 2 && !isExistingOwnership || walletHoldersCount >= 2)
    ) {
      notify.openProModal({
        featureTitle: 'Batas Maksimal 2 Kepemilikan Dana',
        featureDescription:
          'Pengguna paket Free hanya dapat menambahkan maksimal 2 kepemilikan dana. Berlangganan SisaUang Pro untuk mengelola lebih dari 2 kepemilikan dana di seluruh sumber dana Anda.',
        limitSummary: `${Math.max(ownershipSummary.value.length, walletHoldersCount)} / 2 Kepemilikan Aktif`,
      });
      return false;
    }

    const id = sanitizeId(`su_holder_${Date.now()}`);
    const numericBalance = Number(payload.balance) || 0;
    const newWalletTotal =
      walletOwners.value
        .filter((fo) => fo.walletId === wallet.id)
        .reduce((sum, h) => sum + Number(h.balance || 0), 0) + numericBalance;

    await ensureFirestoreSessionForUser(uid);
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'wallet_owners', id), {
        ownerId: uid,
        walletId: wallet.id,
        walletName: wallet.name,
        holderName: safeHolderName,
        balance: numericBalance,
        deleted: false,
        deletedAt: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.update(doc(db, 'wallets', wallet.id), {
        balance: newWalletTotal,
        updatedAt: serverTimestamp(),
      });
      touchUserSyncTokenInBatch(batch, uid);
      await batch.commit();
    } catch (err) {
      useNotificationStore().notifyError('Gagal Menambahkan Pemilik Dana', err);
      handleFirestoreError(err, OperationType.CREATE, `wallet_owners/${id}`);
    }

    rawWalletOwners.value.push({
      id,
      ownerId: uid,
      walletId: wallet.id,
      walletName: wallet.name,
      holderName: safeHolderName,
      balance: numericBalance,
      deleted: false,
    });
    wallet.balance = newWalletTotal;
    syncWalletTotalBalancesFromHolders();
    saveLocalSnapshot(uid, true);

    await authStore.recordAuditLog(
      'fund_owner_created',
      `Menambahkan pemilik dana "${safeHolderName}" pada sumber dana ${wallet.name} (Rp ${numericBalance.toLocaleString('id-ID')}).`,
      'info'
    );
    useNotificationStore().notifySuccess(
      'Pemilik Sumber Dana Ditambahkan',
      `Pemilik dana "${safeHolderName}" berhasil ditambahkan ke ${wallet.name}.`
    );
    return true;
  }

  async function updateWalletOwner(
    holderId: string,
    payload: { holderName: string; balance: number }
  ) {
    const authStore = useAuthStore();
    const uid = sanitizeId(authStore.user?.uid || activeOwnerUid.value || 'guest');
    const target = walletOwners.value.find((fo) => fo.id === holderId);
    if (!target) return;

    const safeHolderName = sanitizeString(payload.holderName, 60, target.holderName);
    const numericBalance = Number(payload.balance) || 0;
    const siblingHolders = walletOwners.value.filter((fo) => fo.walletId === target.walletId);
    const newWalletTotal = siblingHolders.reduce(
      (sum, h) => sum + (h.id === holderId ? numericBalance : Number(h.balance || 0)),
      0
    );

    await ensureFirestoreSessionForUser(uid);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'wallet_owners', holderId), {
        holderName: safeHolderName,
        balance: numericBalance,
        updatedAt: serverTimestamp(),
      });
      batch.update(doc(db, 'wallets', target.walletId), {
        balance: newWalletTotal,
        updatedAt: serverTimestamp(),
      });
      touchUserSyncTokenInBatch(batch, uid);
      await batch.commit();
    } catch (err) {
      useNotificationStore().notifyError('Gagal Memperbarui Pemilik Dana', err);
      handleFirestoreError(err, OperationType.UPDATE, `wallet_owners/${holderId}`);
    }

    const rawTarget = rawWalletOwners.value.find((fo) => fo.id === holderId);
    if (rawTarget) {
      rawTarget.holderName = safeHolderName;
      rawTarget.balance = numericBalance;
    }
    syncWalletTotalBalancesFromHolders();
    saveLocalSnapshot(uid, true);

    useNotificationStore().notifySuccess(
      'Kepemilikan Dana Diperbarui',
      `Data pemilik dana "${safeHolderName}" pada ${target.walletName} berhasil disimpan.`
    );
  }

  /**
   * Rename a holderName globally across all of the user's `wallet_owners` documents in Firestore
   * (e.g., renaming legacy numeric ID "1" -> "Pribadi" or "2" -> "Istri" across Mandiri, Tunai, Flip, GoPay, OVO).
   */
  async function renameHolderGlobally(oldRawHolderName: string, newHolderNameInput: string) {
    const authStore = useAuthStore();
    const uid = sanitizeId(authStore.user?.uid || activeOwnerUid.value || 'guest');
    const safeNewName = sanitizeString(newHolderNameInput, 60, '');
    if (!safeNewName) return;

    const matchingHolders = walletOwners.value.filter(
      (fo) => String(fo.holderName).trim() === String(oldRawHolderName).trim()
    );
    if (matchingHolders.length === 0) return;

    await ensureFirestoreSessionForUser(uid);
    try {
      const batch = writeBatch(db);
      for (const h of matchingHolders) {
        batch.update(doc(db, 'wallet_owners', h.id), {
          holderName: safeNewName,
          updatedAt: serverTimestamp(),
        });
      }
      touchUserSyncTokenInBatch(batch, uid);
      await batch.commit();
    } catch (err) {
      useNotificationStore().notifyError('Gagal Mengubah Nama Kepemilikan Dana', err);
      handleFirestoreError(err, OperationType.UPDATE, 'wallet_owners');
    }

    const matchingIds = new Set(matchingHolders.map((h) => h.id));
    for (const h of rawWalletOwners.value) {
      if (matchingIds.has(h.id)) {
        h.holderName = safeNewName;
      }
    }
    saveLocalSnapshot(uid, true);

    useNotificationStore().notifySuccess(
      'Nama Pemilik Dana Diperbarui',
      `"${formatHolderName(oldRawHolderName)}" berhasil diubah menjadi "${safeNewName}" pada ${matchingHolders.length} sumber dana.`
    );
  }

  async function removeWalletOwner(holderId: string): Promise<boolean> {
    const authStore = useAuthStore();
    const uid = sanitizeId(authStore.user?.uid || activeOwnerUid.value || 'guest');
    const target = walletOwners.value.find((fo) => fo.id === holderId);
    if (!target) return false;

    const confirmed = await useNotificationStore().requestConfirmation({
      title: 'Konfirmasi Hapus Kepemilikan Dana',
      message: `Apakah Anda yakin ingin menghapus data kepemilikan dana "${formatHolderName(target.holderName)}" dari dompet "${target.walletName}"?`,
      detail: `Saldo alokasi sebesar Rp ${Number(target.balance || 0).toLocaleString('id-ID')} akan dikurangi dari total saldo dompet "${target.walletName}".`,
      confirmLabel: 'Ya, Hapus Kepemilikan',
    });
    if (!confirmed) return false;

    const remainingHolders = walletOwners.value.filter(
      (fo) => fo.walletId === target.walletId && fo.id !== holderId
    );
    const newBalance = remainingHolders.reduce((sum, h) => sum + Number(h.balance || 0), 0);

    await ensureFirestoreSessionForUser(uid);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'wallet_owners', holderId), {
        deleted: true,
        deletedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.update(doc(db, 'wallets', target.walletId), {
        balance: newBalance,
        updatedAt: serverTimestamp(),
      });
      touchUserSyncTokenInBatch(batch, uid);
      await batch.commit();
    } catch (err) {
      useNotificationStore().notifyError('Gagal Menghapus Pemilik Dana', err);
      handleFirestoreError(err, OperationType.UPDATE, `wallet_owners/${holderId}`);
    }

    rawWalletOwners.value = rawWalletOwners.value.filter((fo) => fo.id !== holderId);
    const parentWallet = wallets.value.find((w) => w.id === target.walletId);
    if (parentWallet) {
      parentWallet.balance = newBalance;
    }
    syncWalletTotalBalancesFromHolders();
    saveLocalSnapshot(uid, true);

    useNotificationStore().notifySuccess(
      'Pemilik Sumber Dana Dihapus',
      `Pemilik dana "${formatHolderName(target.holderName)}" telah diarsipkan (Soft Delete) dari ${target.walletName}.`
    );
    return true;
  }

  async function removeHolderGlobally(rawHolderNameInput: string): Promise<boolean> {
    const authStore = useAuthStore();
    const uid = sanitizeId(authStore.user?.uid || activeOwnerUid.value || 'guest');
    const cleanTarget = String(rawHolderNameInput || '').trim();
    if (!cleanTarget) return false;

    const matchingHolders = walletOwners.value.filter(
      (fo) =>
        String(fo.holderName).trim() === cleanTarget ||
        formatHolderName(fo.holderName).toLowerCase() === formatHolderName(cleanTarget).toLowerCase()
    );
    if (matchingHolders.length === 0) return false;

    const displayLabel = formatHolderName(cleanTarget);
    const totalAllocated = matchingHolders.reduce((sum, h) => sum + Number(h.balance || 0), 0);
    const walletNames = Array.from(new Set(matchingHolders.map((h) => h.walletName))).join(', ');

    const confirmed = await useNotificationStore().requestConfirmation({
      title: 'Konfirmasi Hapus Kepemilikan Dana',
      message: `Apakah Anda yakin ingin menghapus kepemilikan dana "${displayLabel}"?`,
      detail: `Kepemilikan ini terdaftar pada ${matchingHolders.length} sumber dana (${walletNames}) dengan total alokasi saldo Rp ${totalAllocated.toLocaleString('id-ID')}. Saldo dompet terkait akan disesuaikan secara otomatis.`,
      confirmLabel: 'Ya, Hapus Kepemilikan',
    });
    if (!confirmed) return false;

    const matchingIds = new Set(matchingHolders.map((h) => h.id));
    const affectedWalletIds = new Set(matchingHolders.map((h) => h.walletId));

    await ensureFirestoreSessionForUser(uid);
    try {
      const batch = writeBatch(db);
      for (const h of matchingHolders) {
        batch.update(doc(db, 'wallet_owners', h.id), {
          deleted: true,
          deletedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      for (const wId of affectedWalletIds) {
        const remainingInWallet = walletOwners.value.filter(
          (fo) => fo.walletId === wId && !matchingIds.has(fo.id)
        );
        const nextWalletBal = remainingInWallet.reduce(
          (sum, h) => sum + Number(h.balance || 0),
          0
        );
        batch.update(doc(db, 'wallets', wId), {
          balance: nextWalletBal,
          updatedAt: serverTimestamp(),
        });
      }

      touchUserSyncTokenInBatch(batch, uid);
      await batch.commit();
    } catch (err) {
      useNotificationStore().notifyError('Gagal Menghapus Kepemilikan Dana', err);
      handleFirestoreError(err, OperationType.UPDATE, 'wallet_owners');
    }

    rawWalletOwners.value = rawWalletOwners.value.filter((fo) => !matchingIds.has(fo.id));
    syncWalletTotalBalancesFromHolders();
    saveLocalSnapshot(uid, true);

    useNotificationStore().notifySuccess(
      'Kepemilikan Dana Dihapus',
      `Kepemilikan dana "${displayLabel}" berhasil dihapus dari ${matchingHolders.length} sumber dana.`
    );
    return true;
  }

  async function removeWallet(walletId: string): Promise<boolean> {
    const authStore = useAuthStore();
    const uid = sanitizeId(authStore.user?.uid || activeOwnerUid.value || 'guest');
    const target = wallets.value.find((w) => w.id === walletId);
    const childHolders = walletOwners.value.filter((fo) => fo.walletId === walletId);

    const confirmed = await useNotificationStore().requestConfirmation({
      title: 'Konfirmasi Hapus Dompet',
      message: `Apakah Anda yakin ingin menghapus sumber dana "${target?.name || walletId}"?`,
      detail: target
        ? `Saldo saat ini: Rp ${Number(target.balance || 0).toLocaleString('id-ID')}. Seluruh alokasi pemilik dana (${childHolders.length} item) pada dompet ini juga akan ikut diarsipkan.`
        : 'Seluruh alokasi pemilik dana pada dompet ini juga akan ikut diarsipkan.',
      confirmLabel: 'Ya, Hapus Dompet',
    });
    if (!confirmed) return false;

    await ensureFirestoreSessionForUser(uid);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'wallets', walletId), {
        deleted: true,
        deletedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      for (const ch of childHolders) {
        batch.update(doc(db, 'wallet_owners', ch.id), {
          deleted: true,
          deletedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      touchUserSyncTokenInBatch(batch, uid);
      await batch.commit();
    } catch (err) {
      useNotificationStore().notifyError('Gagal Menghapus Sumber Dana', err);
      handleFirestoreError(err, OperationType.UPDATE, `wallets/${walletId}`);
    }

    wallets.value = wallets.value.filter((w) => w.id !== walletId);
    rawWalletOwners.value = rawWalletOwners.value.filter((fo) => fo.walletId !== walletId);
    saveLocalSnapshot(uid, true);

    if (target) {
      await authStore.recordAuditLog(
        'wallet_deleted',
        `Menghapus sumber dana "${target.name}" secara Soft Delete (histori tetap tersimpan).`,
        'info'
      );
      useNotificationStore().notifySuccess(
        'Sumber Dana Dihapus',
        `Sumber dana "${target.name}" berhasil diarsipkan (Soft Delete) di Firestore.`
      );
    }
    return true;
  }

  // =========================================================================
  // Actions: Category Management (Manajemen Kategori)
  // =========================================================================

  async function addCategory(payload: { name: string; type: 'income' | 'expense'; color?: string }) {
    const authStore = useAuthStore();
    const uid = sanitizeId(authStore.user?.uid || activeOwnerUid.value || 'guest');
    const safeName = sanitizeString(payload.name, MAX_CATEGORY_LENGTH, 'Kategori Baru');
    const safeColor = sanitizeString(
      payload.color || (payload.type === 'income' ? 'emerald' : 'rose'),
      20,
      'emerald'
    );
    const id = sanitizeId(`su_cat_${Date.now()}`);

    await ensureFirestoreSessionForUser(uid);
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'categories', id), {
        ownerId: uid,
        name: safeName,
        type: payload.type,
        color: safeColor,
        deleted: false,
        deletedAt: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      touchUserSyncTokenInBatch(batch, uid);
      await batch.commit();
    } catch (err) {
      useNotificationStore().notifyError('Gagal Menambahkan Kategori', err);
      handleFirestoreError(err, OperationType.CREATE, `categories/${id}`);
    }

    rawUserCategories.value.push({
      id,
      ownerId: uid,
      name: safeName,
      type: payload.type,
      color: safeColor,
      isDefault: false,
      deleted: false,
    });
    rawUserCategories.value.sort((a, b) => a.name.localeCompare(b.name));
    saveLocalSnapshot(uid, true);

    useNotificationStore().notifySuccess(
      'Kategori Baru Ditambahkan',
      `Kategori "${safeName}" (${payload.type === 'income' ? 'Pemasukan' : 'Pengeluaran'}) berhasil disimpan ke Firestore.`
    );
  }

  async function updateCategory(
    catId: string,
    payload: { name: string; type: 'income' | 'expense'; color?: string }
  ) {
    const authStore = useAuthStore();
    const uid = sanitizeId(authStore.user?.uid || activeOwnerUid.value || 'guest');
    const customTarget = userCategories.value.find((c) => c.id === catId);
    const defaultTarget = !customTarget
      ? defaultCategories.value.find((c) => c.id === catId)
      : undefined;
    const target = customTarget || defaultTarget;

    if (!target) {
      useNotificationStore().notifyError(
        'Kategori Tidak Ditemukan',
        'Data kategori yang ingin diubah tidak ditemukan.'
      );
      return;
    }

    const safeName = sanitizeString(payload.name, MAX_CATEGORY_LENGTH, target.name);
    const safeColor = sanitizeString(
      payload.color || target.color || (payload.type === 'income' ? 'emerald' : 'rose'),
      20,
      'emerald'
    );

    await ensureFirestoreSessionForUser(uid);

    // If editing a system default category (and user is not the global default owner),
    // save it as a user-owned custom category override so its label becomes "Kustom"
    if (defaultTarget && uid !== DEFAULT_CATEGORY_OWNER_ID) {
      const overrideDocId = sanitizeId(`${uid}_def_${catId}`);
      try {
        const batch = writeBatch(db);
        batch.set(doc(db, 'categories', overrideDocId), {
          ownerId: uid,
          name: safeName,
          type: payload.type,
          color: safeColor,
          deleted: false,
          deletedAt: null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        touchUserSyncTokenInBatch(batch, uid);
        await batch.commit();
      } catch (err) {
        useNotificationStore().notifyError('Gagal Memperbarui Kategori', err);
        handleFirestoreError(err, OperationType.CREATE, `categories/${overrideDocId}`);
      }

      const existingIdx = rawUserCategories.value.findIndex((c) => c.id === overrideDocId);
      const newCat: CategoryItem = {
        id: overrideDocId,
        ownerId: uid,
        name: safeName,
        type: payload.type,
        color: safeColor,
        isDefault: false,
        deleted: false,
      };
      if (existingIdx >= 0) {
        rawUserCategories.value[existingIdx] = newCat;
      } else {
        rawUserCategories.value.push(newCat);
      }
      rawUserCategories.value.sort((a, b) => a.name.localeCompare(b.name));
      saveLocalSnapshot(uid, true);

      useNotificationStore().notifySuccess(
        'Kategori Diubah Menjadi Kustom',
        `Kategori bawaan "${target.name}" berhasil diperbarui menjadi "${safeName}" dengan label Kustom.`
      );
      return;
    }

    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'categories', catId), {
        name: safeName,
        type: payload.type,
        color: safeColor,
        updatedAt: serverTimestamp(),
      });
      touchUserSyncTokenInBatch(batch, uid);
      await batch.commit();
    } catch (err) {
      useNotificationStore().notifyError('Gagal Memperbarui Kategori', err);
      handleFirestoreError(err, OperationType.UPDATE, `categories/${catId}`);
    }

    const rawCat = rawUserCategories.value.find((c) => c.id === catId);
    if (rawCat) {
      rawCat.name = safeName;
      rawCat.type = payload.type;
      rawCat.color = safeColor;
      rawUserCategories.value.sort((a, b) => a.name.localeCompare(b.name));
    }
    const defCat = defaultCategories.value.find((c) => c.id === catId);
    if (defCat) {
      defCat.name = safeName;
      defCat.type = payload.type;
      defCat.color = safeColor;
    }
    saveLocalSnapshot(uid, true);

    useNotificationStore().notifySuccess(
      'Kategori Diperbarui',
      `Kategori "${safeName}" berhasil diperbarui di Firestore.`
    );
  }

  async function removeCategory(catId: string): Promise<boolean> {
    const authStore = useAuthStore();
    const uid = sanitizeId(authStore.user?.uid || activeOwnerUid.value || 'guest');
    const customTarget = userCategories.value.find((c) => c.id === catId);
    const defaultTarget = !customTarget
      ? defaultCategories.value.find((c) => c.id === catId)
      : undefined;
    const target = customTarget || defaultTarget;

    if (!target) {
      useNotificationStore().notifyError(
        'Kategori Tidak Ditemukan',
        'Data kategori yang ingin dihapus tidak ditemukan.'
      );
      return false;
    }

    const isDefaultCat = Boolean(defaultTarget);
    const confirmed = await useNotificationStore().requestConfirmation({
      title: isDefaultCat ? 'Konfirmasi Hapus Kategori Bawaan' : 'Konfirmasi Hapus Kategori',
      message: `Apakah Anda yakin ingin menghapus kategori ${isDefaultCat ? 'bawaan' : 'kustom'} "${target.name}"?`,
      detail: `Tipe kategori: ${target.type === 'income' ? 'Pemasukan' : 'Pengeluaran'}. Kategori ini akan dihapus/diarsipkan dari daftar pilihan aktif Anda.`,
      confirmLabel: 'Ya, Hapus Kategori',
    });
    if (!confirmed) return false;

    await ensureFirestoreSessionForUser(uid);

    if (defaultTarget && uid !== DEFAULT_CATEGORY_OWNER_ID) {
      const overrideDocId = sanitizeId(`${uid}_def_${catId}`);
      const safeName = sanitizeString(target.name, MAX_CATEGORY_LENGTH, 'Kategori');
      const safeColor = sanitizeString(
        target.color || (target.type === 'income' ? 'emerald' : 'rose'),
        20,
        'emerald'
      );
      try {
        const batch = writeBatch(db);
        batch.set(doc(db, 'categories', overrideDocId), {
          ownerId: uid,
          name: safeName,
          type: target.type,
          color: safeColor,
          deleted: true,
          deletedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        touchUserSyncTokenInBatch(batch, uid);
        await batch.commit();
      } catch (err) {
        useNotificationStore().notifyError('Gagal Menghapus Kategori Bawaan', err);
        handleFirestoreError(err, OperationType.CREATE, `categories/${overrideDocId}`);
      }

      const existingIdx = rawUserCategories.value.findIndex((c) => c.id === overrideDocId);
      const deletedOverride: CategoryItem = {
        id: overrideDocId,
        ownerId: uid,
        name: safeName,
        type: target.type,
        color: safeColor,
        isDefault: false,
        deleted: true,
      };
      if (existingIdx >= 0) {
        rawUserCategories.value[existingIdx] = deletedOverride;
      } else {
        rawUserCategories.value.push(deletedOverride);
      }
      saveLocalSnapshot(uid, true);

      useNotificationStore().notifySuccess(
        'Kategori Bawaan Dihapus',
        `Kategori bawaan "${target.name}" berhasil dihapus dari daftar aktif Anda.`
      );
      return true;
    }

    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'categories', catId), {
        deleted: true,
        deletedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      touchUserSyncTokenInBatch(batch, uid);
      await batch.commit();
    } catch (err) {
      useNotificationStore().notifyError('Gagal Menghapus Kategori', err);
      handleFirestoreError(err, OperationType.UPDATE, `categories/${catId}`);
    }

    const rawCat = rawUserCategories.value.find((c) => c.id === catId);
    if (rawCat) {
      rawCat.deleted = true;
    }
    defaultCategories.value = defaultCategories.value.filter((c) => c.id !== catId);
    saveLocalSnapshot(uid, true);

    useNotificationStore().notifySuccess(
      'Kategori Dihapus',
      `Kategori "${target.name}" berhasil diarsipkan (Soft Delete) dari daftar aktif.`
    );
    return true;
  }

  // =========================================================================
  // Actions: Transactions (Pilih Sumber Dana -> Pilih Pemilik Dana -> Input)
  // =========================================================================

  async function addTransaction(payload: {
    walletId: string;
    fundOwnerId?: string;
    toWalletId?: string;
    toFundOwnerId?: string;
    type: TransactionItem['type'];
    category: string;
    amount: number;
    adminFee?: number;
    note: string;
    date: string;
  }) {
    const authStore = useAuthStore();
    const uid = sanitizeId(authStore.user?.uid || activeOwnerUid.value || 'guest');
    const wallet = wallets.value.find((w) => w.id === payload.walletId) || wallets.value[0];
    if (!wallet) {
      throw new Error('Pilih sumber dana (wallet) terlebih dahulu.');
    }

    const walletHolders = getHoldersByWalletId(wallet.id);
    const sourceHolder =
      walletHolders.find((h) => h.id === payload.fundOwnerId) || walletHolders[0];

    const id = sanitizeId(`su_tx_${Date.now()}`);
    const numericAmount = Math.abs(Number(payload.amount) || 0);
    if (numericAmount <= 0) {
      throw new Error('Nominal transaksi harus lebih dari 0.');
    }
    const numericAdminFee =
      payload.type === 'transfer' ? Math.max(0, Math.abs(Number(payload.adminFee) || 0)) : 0;

    const defaultCategory =
      payload.type === 'transfer' ? 'Transfer Saldo' : payload.category || 'Lainnya';
    const safeCategory = sanitizeString(defaultCategory, MAX_CATEGORY_LENGTH, 'Lainnya');
    const safeNote = sanitizeString(payload.note, MAX_NOTE_LENGTH, safeCategory);
    const safeDate = sanitizeString(payload.date || getTodayIsoDate(), 30, getTodayIsoDate());

    let destWallet: WalletItem | undefined;
    let destHolder: WalletOwnerItem | undefined;

    if (payload.type === 'transfer') {
      destWallet = wallets.value.find((w) => w.id === payload.toWalletId) || wallet;
      const destHolders = getHoldersByWalletId(destWallet.id);
      destHolder =
        destHolders.find((h) => h.id === payload.toFundOwnerId) || destHolders[0];

      if (
        sourceHolder &&
        destHolder &&
        sourceHolder.id === destHolder.id &&
        wallet.id === destWallet.id
      ) {
        throw new Error(
          'Sumber dana & pemilik dana tujuan transfer tidak boleh sama persis dengan asal.'
        );
      }
    }

    // Calculate updated balances
    let newSourceHolderBalance = sourceHolder ? Number(sourceHolder.balance || 0) : 0;
    let newSourceWalletBalance = Number(wallet.balance || 0);
    let newDestHolderBalance = destHolder ? Number(destHolder.balance || 0) : 0;
    let newDestWalletBalance = destWallet ? Number(destWallet.balance || 0) : 0;

    if (payload.type === 'income') {
      newSourceHolderBalance += numericAmount;
      newSourceWalletBalance += numericAmount;
    } else if (payload.type === 'expense') {
      newSourceHolderBalance -= numericAmount;
      newSourceWalletBalance -= numericAmount;
    } else if (payload.type === 'transfer') {
      newSourceHolderBalance -= numericAmount + numericAdminFee;
      newSourceWalletBalance -= numericAmount + numericAdminFee;
      newDestHolderBalance += numericAmount;
      if (destWallet && destWallet.id !== wallet.id) {
        newDestWalletBalance += numericAmount;
      } else {
        // Same wallet, different fund owner -> wallet total balance only reduced by adminFee
        newSourceWalletBalance = Number(wallet.balance || 0) - numericAdminFee;
      }
    }

    await ensureFirestoreSessionForUser(uid);
    const txPath = `transactions/${id}`;
    const feeTxId = sanitizeId(`su_tx_fee_${Date.now()}`);
    const feeNote = sanitizeString(`Admin ${safeNote}`, MAX_NOTE_LENGTH, 'Biaya Admin Transfer');

    try {
      const batch = writeBatch(db);
      const firestoreTxData: Record<string, any> = {
        ownerId: uid,
        walletId: wallet.id,
        walletName: wallet.name,
        fundOwnerId: sourceHolder?.id || 'default',
        fundOwnerName: sourceHolder?.holderName || 'Pribadi',
        type: payload.type,
        category: safeCategory,
        amount: numericAmount,
        note: safeNote,
        date: safeDate,
        deleted: false,
        deletedAt: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (payload.type === 'transfer' && destWallet) {
        firestoreTxData.toWalletId = destWallet.id;
        firestoreTxData.toWalletName = destWallet.name;
        firestoreTxData.toFundOwnerId = destHolder?.id || 'default';
        firestoreTxData.toFundOwnerName = destHolder?.holderName || 'Pribadi';
      }

      batch.set(doc(db, 'transactions', id), firestoreTxData);

      // If transfer includes an admin fee, record a separate Bea Admin expense transaction so it complies with live Firestore schema rules
      if (payload.type === 'transfer' && numericAdminFee > 0) {
        batch.set(doc(db, 'transactions', feeTxId), {
          ownerId: uid,
          walletId: wallet.id,
          walletName: wallet.name,
          fundOwnerId: sourceHolder?.id || 'default',
          fundOwnerName: sourceHolder?.holderName || 'Pribadi',
          type: 'expense',
          category: 'Biaya Admin',
          amount: numericAdminFee,
          note: feeNote,
          date: safeDate,
          deleted: false,
          deletedAt: null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      if (sourceHolder) {
        batch.update(doc(db, 'wallet_owners', sourceHolder.id), {
          balance: newSourceHolderBalance,
          updatedAt: serverTimestamp(),
        });
      }
      batch.update(doc(db, 'wallets', wallet.id), {
        balance: newSourceWalletBalance,
        updatedAt: serverTimestamp(),
      });

      if (payload.type === 'transfer' && destWallet) {
        if (destHolder) {
          batch.update(doc(db, 'wallet_owners', destHolder.id), {
            balance: newDestHolderBalance,
            updatedAt: serverTimestamp(),
          });
        }
        if (destWallet.id !== wallet.id) {
          batch.update(doc(db, 'wallets', destWallet.id), {
            balance: newDestWalletBalance,
            updatedAt: serverTimestamp(),
          });
        }
      }

      touchUserSyncTokenInBatch(batch, uid);
      await batch.commit();
    } catch (err) {
      useNotificationStore().notifyError('Gagal Menyimpan Transaksi', err);
      handleFirestoreError(err, OperationType.CREATE, txPath);
    }

    // Update local state optimistically (0 extra Firestore reads)
    const newTxItem: TransactionItem = {
      id,
      ownerId: uid,
      walletId: wallet.id,
      walletName: wallet.name,
      fundOwnerId: sourceHolder?.id || 'default',
      fundOwnerName: sourceHolder?.holderName || 'Pribadi',
      type: payload.type,
      category: safeCategory,
      amount: numericAmount,
      note: safeNote,
      date: safeDate,
      deleted: false,
    };
    if (payload.type === 'transfer' && destWallet) {
      newTxItem.toWalletId = destWallet.id;
      newTxItem.toWalletName = destWallet.name;
      newTxItem.toFundOwnerId = destHolder?.id || 'default';
      newTxItem.toFundOwnerName = destHolder?.holderName || 'Pribadi';
    }
    rawTransactions.value.unshift(newTxItem);

    if (payload.type === 'transfer' && numericAdminFee > 0) {
      rawTransactions.value.unshift({
        id: feeTxId,
        ownerId: uid,
        walletId: wallet.id,
        walletName: wallet.name,
        fundOwnerId: sourceHolder?.id || 'default',
        fundOwnerName: sourceHolder?.holderName || 'Pribadi',
        type: 'expense',
        category: 'Biaya Admin',
        amount: numericAdminFee,
        note: feeNote,
        date: safeDate,
        deleted: false,
      });
    }

    rawTransactions.value.sort((a, b) => {
      const cmp = String(b.date || '').localeCompare(String(a.date || ''));
      if (cmp !== 0) return cmp;
      return String(b.id || '').localeCompare(String(a.id || ''));
    });

    if (sourceHolder) {
      const rawSrc = rawWalletOwners.value.find((h) => h.id === sourceHolder.id);
      if (rawSrc) rawSrc.balance = newSourceHolderBalance;
    }
    if (payload.type === 'transfer' && destHolder) {
      const rawDest = rawWalletOwners.value.find((h) => h.id === destHolder.id);
      if (rawDest) rawDest.balance = newDestHolderBalance;
    }
    syncWalletTotalBalancesFromHolders();
    saveLocalSnapshot(uid, true);

    invalidateServerPaginationCaches(uid);
    void fetchTransactionsServerPage(undefined, true, true);

    // Ensure selectedPeriod shows the month of the newly added transaction
    const txMonth = safeDate.slice(0, 7);
    if (selectedPeriod.value !== 'all' && /^\d{4}-\d{2}$/.test(txMonth)) {
      selectedPeriod.value = txMonth;
    }

    const sourceHolderLabel = formatHolderName(sourceHolder?.holderName);
    const destHolderLabel = formatHolderName(destHolder?.holderName);

    const logMsg =
      payload.type === 'transfer'
        ? `Transfer dana Rp ${numericAmount.toLocaleString('id-ID')} dari ${wallet.name} (${sourceHolderLabel}) ke ${destWallet?.name || wallet.name} (${destHolderLabel}).`
        : `Mencatat ${payload.type === 'income' ? 'pemasukan' : 'pengeluaran'} Rp ${numericAmount.toLocaleString('id-ID')} (${safeCategory}) pada ${wallet.name} — Pemilik: ${sourceHolderLabel}.`;

    await authStore.recordAuditLog(
      'transaction_created',
      logMsg,
      numericAmount >= 50000000 ? 'warning' : 'info',
      numericAmount
    );
    useNotificationStore().notifySuccess('Transaksi Berhasil Dicatat', logMsg);
  }

  async function updateTransaction(
    txId: string,
    payload: {
      walletId: string;
      fundOwnerId?: string;
      toWalletId?: string;
      toFundOwnerId?: string;
      type: TransactionItem['type'];
      category: string;
      amount: number;
      adminFee?: number;
      note: string;
      date: string;
    }
  ) {
    const authStore = useAuthStore();
    const uid = sanitizeId(authStore.user?.uid || activeOwnerUid.value || 'guest');
    const oldTx = transactions.value.find((t) => t.id === txId);
    if (!oldTx) {
      throw new Error('Data transaksi yang ingin diubah tidak ditemukan.');
    }

    const newWallet = wallets.value.find((w) => w.id === payload.walletId) || wallets.value[0];
    if (!newWallet) {
      throw new Error('Pilih sumber dana (wallet) terlebih dahulu.');
    }

    const newWalletHolders = getHoldersByWalletId(newWallet.id);
    const newSourceHolder =
      newWalletHolders.find((h) => h.id === payload.fundOwnerId) || newWalletHolders[0];

    const numericAmount = Math.abs(Number(payload.amount) || 0);
    if (numericAmount <= 0) {
      throw new Error('Nominal transaksi harus lebih dari 0.');
    }
    const numericAdminFee =
      payload.type === 'transfer' ? Math.max(0, Math.abs(Number(payload.adminFee) || 0)) : 0;

    const defaultCategory =
      payload.type === 'transfer' ? 'Transfer Saldo' : payload.category || 'Lainnya';
    const safeCategory = sanitizeString(defaultCategory, MAX_CATEGORY_LENGTH, 'Lainnya');
    const safeNote = sanitizeString(payload.note, MAX_NOTE_LENGTH, safeCategory);
    const safeDate = sanitizeString(payload.date || getTodayIsoDate(), 30, getTodayIsoDate());

    let newDestWallet: WalletItem | undefined;
    let newDestHolder: WalletOwnerItem | undefined;

    if (payload.type === 'transfer') {
      newDestWallet = wallets.value.find((w) => w.id === payload.toWalletId) || newWallet;
      const destHolders = getHoldersByWalletId(newDestWallet.id);
      newDestHolder =
        destHolders.find((h) => h.id === payload.toFundOwnerId) || destHolders[0];

      if (
        newSourceHolder &&
        newDestHolder &&
        newSourceHolder.id === newDestHolder.id &&
        newWallet.id === newDestWallet.id
      ) {
        throw new Error(
          'Sumber dana & pemilik dana tujuan transfer tidak boleh sama persis dengan asal.'
        );
      }
    }

    // Compute exact net balance deltas for affected holders and wallets
    const holderDeltas = new Map<string, number>();
    const walletDeltas = new Map<string, number>();

    const addDelta = (map: Map<string, number>, key: string | undefined, delta: number) => {
      if (!key) return;
      map.set(key, (map.get(key) || 0) + delta);
    };

    // 1. Reverse oldTx balance effect
    const oldAmount = Number(oldTx.amount || 0);
    const oldAdminFee = oldTx.type === 'transfer' ? Number(oldTx.adminFee || 0) : 0;
    if (oldTx.type === 'income') {
      addDelta(holderDeltas, oldTx.fundOwnerId, -oldAmount);
      addDelta(walletDeltas, oldTx.walletId, -oldAmount);
    } else if (oldTx.type === 'expense') {
      addDelta(holderDeltas, oldTx.fundOwnerId, oldAmount);
      addDelta(walletDeltas, oldTx.walletId, oldAmount);
    } else if (oldTx.type === 'transfer') {
      addDelta(holderDeltas, oldTx.fundOwnerId, oldAmount + oldAdminFee);
      addDelta(holderDeltas, oldTx.toFundOwnerId, -oldAmount);
      if (oldTx.toWalletId && oldTx.toWalletId !== oldTx.walletId) {
        addDelta(walletDeltas, oldTx.walletId, oldAmount + oldAdminFee);
        addDelta(walletDeltas, oldTx.toWalletId, -oldAmount);
      } else if (oldAdminFee > 0) {
        addDelta(walletDeltas, oldTx.walletId, oldAdminFee);
      }
    }

    // 2. Apply new payload balance effect
    if (payload.type === 'income') {
      addDelta(holderDeltas, newSourceHolder?.id, numericAmount);
      addDelta(walletDeltas, newWallet.id, numericAmount);
    } else if (payload.type === 'expense') {
      addDelta(holderDeltas, newSourceHolder?.id, -numericAmount);
      addDelta(walletDeltas, newWallet.id, -numericAmount);
    } else if (payload.type === 'transfer' && newDestWallet) {
      addDelta(holderDeltas, newSourceHolder?.id, -(numericAmount + numericAdminFee));
      addDelta(holderDeltas, newDestHolder?.id, numericAmount);
      if (newDestWallet.id !== newWallet.id) {
        addDelta(walletDeltas, newWallet.id, -(numericAmount + numericAdminFee));
        addDelta(walletDeltas, newDestWallet.id, numericAmount);
      } else if (numericAdminFee > 0) {
        addDelta(walletDeltas, newWallet.id, -numericAdminFee);
      }
    }

    await ensureFirestoreSessionForUser(uid);
    const txPath = `transactions/${txId}`;
    try {
      const batch = writeBatch(db);
      const updatePayload: Record<string, any> = {
        walletId: newWallet.id,
        walletName: newWallet.name,
        fundOwnerId: newSourceHolder?.id || 'default',
        fundOwnerName: newSourceHolder?.holderName || 'Pribadi',
        type: payload.type,
        category: safeCategory,
        amount: numericAmount,
        note: safeNote,
        date: safeDate,
        updatedAt: serverTimestamp(),
      };
      if (payload.type === 'transfer' && newDestWallet) {
        updatePayload.toWalletId = newDestWallet.id;
        updatePayload.toWalletName = newDestWallet.name;
        updatePayload.toFundOwnerId = newDestHolder?.id || 'default';
        updatePayload.toFundOwnerName = newDestHolder?.holderName || 'Pribadi';
      }

      batch.update(doc(db, 'transactions', txId), updatePayload);

      // Apply holder balance deltas
      for (const [hId, delta] of holderDeltas.entries()) {
        if (delta === 0) continue;
        const holderDoc = walletOwners.value.find((h) => h.id === hId);
        if (holderDoc) {
          batch.update(doc(db, 'wallet_owners', hId), {
            balance: Number(holderDoc.balance || 0) + delta,
            updatedAt: serverTimestamp(),
          });
        }
      }

      // Apply wallet balance deltas
      for (const [wId, delta] of walletDeltas.entries()) {
        if (delta === 0) continue;
        const walletDoc = wallets.value.find((w) => w.id === wId);
        if (walletDoc) {
          batch.update(doc(db, 'wallets', wId), {
            balance: Number(walletDoc.balance || 0) + delta,
            updatedAt: serverTimestamp(),
          });
        }
      }

      touchUserSyncTokenInBatch(batch, uid);
      await batch.commit();
    } catch (err) {
      useNotificationStore().notifyError('Gagal Memperbarui Transaksi', err);
      handleFirestoreError(err, OperationType.UPDATE, txPath);
    }

    const rawTxIdx = rawTransactions.value.findIndex((t) => t.id === txId);
    if (rawTxIdx >= 0) {
      const updatedTx: TransactionItem = {
        ...rawTransactions.value[rawTxIdx],
        walletId: newWallet.id,
        walletName: newWallet.name,
        fundOwnerId: newSourceHolder?.id || 'default',
        fundOwnerName: newSourceHolder?.holderName || 'Pribadi',
        type: payload.type,
        category: safeCategory,
        amount: numericAmount,
        note: safeNote,
        date: safeDate,
      };
      if (payload.type === 'transfer' && newDestWallet) {
        updatedTx.toWalletId = newDestWallet.id;
        updatedTx.toWalletName = newDestWallet.name;
        updatedTx.toFundOwnerId = newDestHolder?.id || 'default';
        updatedTx.toFundOwnerName = newDestHolder?.holderName || 'Pribadi';
      }
      rawTransactions.value[rawTxIdx] = updatedTx;
      rawTransactions.value.sort((a, b) => {
        const cmp = String(b.date || '').localeCompare(String(a.date || ''));
        if (cmp !== 0) return cmp;
        return String(b.id || '').localeCompare(String(a.id || ''));
      });
    }

    for (const [hId, delta] of holderDeltas.entries()) {
      if (delta === 0) continue;
      const rawHolder = rawWalletOwners.value.find((h) => h.id === hId);
      if (rawHolder) {
        rawHolder.balance = Number(rawHolder.balance || 0) + delta;
      }
    }
    syncWalletTotalBalancesFromHolders();
    saveLocalSnapshot(uid, true);

    invalidateServerPaginationCaches(uid);
    void fetchTransactionsServerPage(undefined, true, true);

    const txMonth = safeDate.slice(0, 7);
    if (selectedPeriod.value !== 'all' && /^\d{4}-\d{2}$/.test(txMonth)) {
      selectedPeriod.value = txMonth;
    }

    await authStore.recordAuditLog(
      'transaction_updated',
      `Memperbarui transaksi "${safeNote}" (${safeCategory}) sebesar Rp ${numericAmount.toLocaleString('id-ID')}.`,
      'info',
      numericAmount
    );
    useNotificationStore().notifySuccess(
      'Transaksi Diperbarui',
      `Perubahan pada transaksi "${safeNote}" (Rp ${numericAmount.toLocaleString('id-ID')}) telah disimpan.`
    );
  }

  async function removeTransaction(txId: string): Promise<boolean> {
    const authStore = useAuthStore();
    const uid = sanitizeId(authStore.user?.uid || activeOwnerUid.value || 'guest');
    const tx = transactions.value.find((t) => t.id === txId);
    if (!tx) return false;

    const typeLabel =
      tx.type === 'income'
        ? 'Pemasukan'
        : tx.type === 'expense'
          ? 'Pengeluaran'
          : 'Transfer';

    const confirmed = await useNotificationStore().requestConfirmation({
      title: 'Konfirmasi Hapus Transaksi',
      message: `Apakah Anda yakin ingin menghapus transaksi ${typeLabel} "${tx.note || tx.category}"?`,
      detail: `Nominal: Rp ${Number(tx.amount || 0).toLocaleString('id-ID')} · Tanggal: ${tx.date} · Dompet: ${tx.walletName}. Saldo dompet dan pemilik dana akan dikembalikan secara otomatis.`,
      confirmLabel: 'Ya, Hapus Transaksi',
    });
    if (!confirmed) return false;

    const sourceHolder = tx.fundOwnerId
      ? walletOwners.value.find((h) => h.id === tx.fundOwnerId)
      : undefined;
    const destHolder = tx.toFundOwnerId
      ? walletOwners.value.find((h) => h.id === tx.toFundOwnerId)
      : undefined;
    const wallet = wallets.value.find((w) => w.id === tx.walletId);
    const destWallet = tx.toWalletId
      ? wallets.value.find((w) => w.id === tx.toWalletId)
      : undefined;

    await ensureFirestoreSessionForUser(uid);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'transactions', txId), {
        deleted: true,
        deletedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (tx.type === 'income') {
        if (sourceHolder) {
          const nextBal = Number(sourceHolder.balance || 0) - tx.amount;
          batch.update(doc(db, 'wallet_owners', sourceHolder.id), {
            balance: nextBal,
            updatedAt: serverTimestamp(),
          });
        }
        if (wallet) {
          batch.update(doc(db, 'wallets', wallet.id), {
            balance: Number(wallet.balance || 0) - tx.amount,
            updatedAt: serverTimestamp(),
          });
        }
      } else if (tx.type === 'expense') {
        if (sourceHolder) {
          const nextBal = Number(sourceHolder.balance || 0) + tx.amount;
          batch.update(doc(db, 'wallet_owners', sourceHolder.id), {
            balance: nextBal,
            updatedAt: serverTimestamp(),
          });
        }
        if (wallet) {
          batch.update(doc(db, 'wallets', wallet.id), {
            balance: Number(wallet.balance || 0) + tx.amount,
            updatedAt: serverTimestamp(),
          });
        }
      } else if (tx.type === 'transfer') {
        const txAdminFee = Number(tx.adminFee || 0);
        if (sourceHolder) {
          batch.update(doc(db, 'wallet_owners', sourceHolder.id), {
            balance: Number(sourceHolder.balance || 0) + tx.amount + txAdminFee,
            updatedAt: serverTimestamp(),
          });
        }
        if (destHolder) {
          batch.update(doc(db, 'wallet_owners', destHolder.id), {
            balance: Number(destHolder.balance || 0) - tx.amount,
            updatedAt: serverTimestamp(),
          });
        }
        if (wallet && destWallet && wallet.id !== destWallet.id) {
          batch.update(doc(db, 'wallets', wallet.id), {
            balance: Number(wallet.balance || 0) + tx.amount + txAdminFee,
            updatedAt: serverTimestamp(),
          });
          batch.update(doc(db, 'wallets', destWallet.id), {
            balance: Number(destWallet.balance || 0) - tx.amount,
            updatedAt: serverTimestamp(),
          });
        } else if (wallet && txAdminFee > 0) {
          batch.update(doc(db, 'wallets', wallet.id), {
            balance: Number(wallet.balance || 0) + txAdminFee,
            updatedAt: serverTimestamp(),
          });
        }
      }

      touchUserSyncTokenInBatch(batch, uid);
      await batch.commit();
    } catch (err) {
      useNotificationStore().notifyError('Gagal Menghapus Transaksi', err);
      handleFirestoreError(err, OperationType.UPDATE, `transactions/${txId}`);
    }

    rawTransactions.value = rawTransactions.value.filter((t) => t.id !== txId);
    rawServerPaginatedTransactions.value = rawServerPaginatedTransactions.value.filter(
      (t) => t.id !== txId
    );
    invalidateServerPaginationCaches(uid);
    void fetchTransactionsServerPage(undefined, true, true);
    if (tx.type === 'income' && sourceHolder) {
      const rawSrc = rawWalletOwners.value.find((h) => h.id === sourceHolder.id);
      if (rawSrc) rawSrc.balance = Number(rawSrc.balance || 0) - tx.amount;
    } else if (tx.type === 'expense' && sourceHolder) {
      const rawSrc = rawWalletOwners.value.find((h) => h.id === sourceHolder.id);
      if (rawSrc) rawSrc.balance = Number(rawSrc.balance || 0) + tx.amount;
    } else if (tx.type === 'transfer') {
      const txAdminFee = Number(tx.adminFee || 0);
      if (sourceHolder) {
        const rawSrc = rawWalletOwners.value.find((h) => h.id === sourceHolder.id);
        if (rawSrc) rawSrc.balance = Number(rawSrc.balance || 0) + tx.amount + txAdminFee;
      }
      if (destHolder) {
        const rawDest = rawWalletOwners.value.find((h) => h.id === destHolder.id);
        if (rawDest) rawDest.balance = Number(rawDest.balance || 0) - tx.amount;
      }
    }
    syncWalletTotalBalancesFromHolders();
    saveLocalSnapshot(uid, true);

    await authStore.recordAuditLog(
      'transaction_deleted',
      `Menghapus transaksi ${tx.category} sebesar Rp ${tx.amount.toLocaleString('id-ID')} secara Soft Delete (histori tetap tersimpan).`,
      'info'
    );
    useNotificationStore().notifySuccess(
      'Transaksi Dihapus',
      `Transaksi ${tx.category} (Rp ${tx.amount.toLocaleString('id-ID')}) telah diarsipkan (Soft Delete) dan saldo dompet telah dikembalikan.`
    );
    return true;
  }

  // =========================================================================
  // Actions: Budgets & Budget Periods (Anggaran Bulanan Berbasis Periode)
  // =========================================================================

  async function addBudgetPeriod(periodInput: string): Promise<boolean> {
    const authStore = useAuthStore();
    const uid = sanitizeId(authStore.user?.uid || activeOwnerUid.value || 'guest');
    const cleanPeriod = String(periodInput || '').trim();

    if (!/^\d{4}-\d{2}$/.test(cleanPeriod)) {
      useNotificationStore().notifyError(
        'Format Periode Tidak Valid',
        'Pilih bulan dan tahun anggaran yang valid.'
      );
      return false;
    }

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const minAllowedPeriod = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
    const maxAllowedPeriod = `${currentYear + 1}-12`;

    if (cleanPeriod < minAllowedPeriod || cleanPeriod > maxAllowedPeriod) {
      useNotificationStore().notifyError(
        'Periode Di Luar Batas',
        `Periode anggaran yang dapat ditambahkan hanya mulai bulan berjalan (${formatPeriodLabel(minAllowedPeriod)}) hingga Desember ${currentYear + 1}.`
      );
      return false;
    }

    if (!authStore.isProUser && cleanPeriod > minAllowedPeriod) {
      useNotificationStore().openProModal({
        featureTitle: 'Anggaran Periode Akan Datang',
        featureDescription:
          `Pengguna paket Free hanya dapat membuat anggaran pada bulan berjalan (${formatPeriodLabel(minAllowedPeriod)}). Berlangganan SisaUang Pro untuk merencanakan anggaran pada bulan-bulan yang akan datang.`,
        limitSummary: `Paket Free: Hanya Bulan Ini (${formatPeriodLabel(minAllowedPeriod)})`,
      });
      return false;
    }

    const alreadyExists =
      budgetPeriods.value.includes(cleanPeriod) ||
      budgets.value.some((b) => !b.deleted && b.period === cleanPeriod);

    if (alreadyExists) {
      useNotificationStore().notifyError(
        'Periode Sudah Ada',
        `Periode anggaran ${formatPeriodLabel(cleanPeriod)} sudah terdaftar.`
      );
      return false;
    }

    const markerDocId = sanitizeId(`su_bgp_${uid}_${cleanPeriod.replace('-', '_')}`);
    await ensureFirestoreSessionForUser(uid);

    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'budgets', markerDocId), {
        ownerId: uid,
        category: BUDGET_PERIOD_MARKER_CATEGORY,
        limitAmount: 1,
        spentAmount: 0,
        period: cleanPeriod,
        deleted: false,
        deletedAt: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      touchUserSyncTokenInBatch(batch, uid);
      await batch.commit();
    } catch (err) {
      useNotificationStore().notifyError('Gagal Menambahkan Periode Anggaran', err);
      handleFirestoreError(err, OperationType.CREATE, `budgets/${markerDocId}`);
    }

    if (!budgetPeriods.value.includes(cleanPeriod)) {
      budgetPeriods.value.push(cleanPeriod);
      budgetPeriods.value.sort((a, b) => b.localeCompare(a));
    }
    saveLocalSnapshot(uid, true);

    await authStore.recordAuditLog(
      'budget_period_created',
      `Menambahkan periode anggaran baru: ${formatPeriodLabel(cleanPeriod)} (${cleanPeriod}).`,
      'info'
    );
    useNotificationStore().notifySuccess(
      'Periode Anggaran Ditambahkan',
      `Periode ${formatPeriodLabel(cleanPeriod)} berhasil dibuat. Klik periode tersebut untuk mulai menambahkan kategori anggaran.`
    );
    return true;
  }

  async function removeBudgetPeriod(periodInput: string): Promise<boolean> {
    const authStore = useAuthStore();
    const uid = sanitizeId(authStore.user?.uid || activeOwnerUid.value || 'guest');
    const cleanPeriod = String(periodInput || '').trim();

    const activeBudgetsInPeriod = budgets.value.filter(
      (b) =>
        !b.deleted &&
        b.category !== BUDGET_PERIOD_MARKER_CATEGORY &&
        b.period === cleanPeriod
    );

    if (activeBudgetsInPeriod.length > 0) {
      useNotificationStore().notifyError(
        'Periode Tidak Dapat Dihapus',
        `Periode ${formatPeriodLabel(cleanPeriod)} masih memiliki ${activeBudgetsInPeriod.length} kategori anggaran aktif. Hapus seluruh anggaran di dalamnya terlebih dahulu.`
      );
      return false;
    }

    const confirmed = await useNotificationStore().requestConfirmation({
      title: 'Konfirmasi Hapus Periode Anggaran',
      message: `Apakah Anda yakin ingin menghapus periode anggaran "${formatPeriodLabel(cleanPeriod)}"?`,
      detail: 'Periode ini kosong dan belum memiliki item kategori anggaran aktif.',
      confirmLabel: 'Ya, Hapus Periode',
    });
    if (!confirmed) return false;

    const markerDocId = sanitizeId(`su_bgp_${uid}_${cleanPeriod.replace('-', '_')}`);
    await ensureFirestoreSessionForUser(uid);

    try {
      const batch = writeBatch(db);
      batch.set(
        doc(db, 'budgets', markerDocId),
        {
          ownerId: uid,
          category: BUDGET_PERIOD_MARKER_CATEGORY,
          limitAmount: 1,
          spentAmount: 0,
          period: cleanPeriod,
          deleted: true,
          deletedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      touchUserSyncTokenInBatch(batch, uid);
      await batch.commit();
    } catch {
      // Ignore if marker doc didn't exist on server
    }

    budgetPeriods.value = budgetPeriods.value.filter((p) => p !== cleanPeriod);
    saveLocalSnapshot(uid, true);

    useNotificationStore().notifySuccess(
      'Periode Anggaran Dihapus',
      `Periode ${formatPeriodLabel(cleanPeriod)} berhasil dihapus.`
    );
    return true;
  }

  async function saveBudget(payload: {
    id?: string | null;
    category: string;
    limitAmount: number;
    period?: string;
  }) {
    const authStore = useAuthStore();
    const uid = sanitizeId(authStore.user?.uid || activeOwnerUid.value || 'guest');
    const safeCategory = sanitizeString(
      payload.category,
      MAX_CATEGORY_LENGTH,
      'Makan dan Minum'
    );
    const numericLimit = Math.max(10000, Number(payload.limitAmount) || 0);
    const period =
      payload.period && /^\d{4}-\d{2}$/.test(payload.period)
        ? payload.period
        : selectedPeriod.value && selectedPeriod.value !== 'all'
          ? selectedPeriod.value
          : getCurrentMonthPeriod();

    const currentMonthPeriod = getCurrentMonthPeriod();
    if (!authStore.isProUser && period > currentMonthPeriod) {
      useNotificationStore().openProModal({
        featureTitle: 'Anggaran Periode Akan Datang',
        featureDescription:
          `Pengguna paket Free hanya dapat membuat dan mengelola anggaran pada bulan saat ini (${formatPeriodLabel(currentMonthPeriod)}). Berlangganan SisaUang Pro untuk membuat anggaran di periode mendatang.`,
        limitSummary: `Paket Free: Hanya Bulan Ini (${formatPeriodLabel(currentMonthPeriod)})`,
      });
      return false;
    }

    // Match either by explicit editing ID or by (period + category)
    const existing = payload.id
      ? budgets.value.find((b) => b.id === payload.id)
      : budgets.value.find(
          (b) =>
            !b.deleted &&
            b.period === period &&
            b.category.trim().toLowerCase() === safeCategory.trim().toLowerCase()
        );
    const targetId = existing ? existing.id : sanitizeId(`su_bg_${Date.now()}`);

    await ensureFirestoreSessionForUser(uid);
    try {
      const batch = writeBatch(db);
      if (existing) {
        batch.update(doc(db, 'budgets', targetId), {
          category: safeCategory,
          limitAmount: numericLimit,
          spentAmount: existing.spentAmount || 0,
          period,
          deleted: false,
          deletedAt: null,
          updatedAt: serverTimestamp(),
        });
      } else {
        batch.set(doc(db, 'budgets', targetId), {
          ownerId: uid,
          category: safeCategory,
          limitAmount: numericLimit,
          spentAmount: 0,
          period,
          deleted: false,
          deletedAt: null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      touchUserSyncTokenInBatch(batch, uid);
      await batch.commit();
    } catch (err) {
      useNotificationStore().notifyError('Gagal Menyimpan Anggaran', err);
      handleFirestoreError(err, existing ? OperationType.UPDATE : OperationType.CREATE, `budgets/${targetId}`);
    }

    if (existing) {
      existing.category = safeCategory;
      existing.limitAmount = numericLimit;
      existing.period = period;
    } else {
      budgets.value.push({
        id: targetId,
        ownerId: uid,
        category: safeCategory,
        limitAmount: numericLimit,
        spentAmount: 0,
        period,
        deleted: false,
      });
    }
    if (!budgetPeriods.value.includes(period)) {
      budgetPeriods.value.push(period);
      budgetPeriods.value.sort((a, b) => b.localeCompare(a));
    }
    saveLocalSnapshot(uid, true);

    await authStore.recordAuditLog(
      'budget_updated',
      `Mengatur batas anggaran kategori "${safeCategory}" (${formatPeriodLabel(period)}) sebesar Rp ${numericLimit.toLocaleString('id-ID')}.`,
      'info'
    );
    useNotificationStore().notifySuccess(
      'Anggaran Disimpan',
      `Batas anggaran "${safeCategory}" (${formatPeriodLabel(period)}) diatur sebesar Rp ${numericLimit.toLocaleString('id-ID')}.`
    );
  }

  async function removeBudget(budgetId: string): Promise<boolean> {
    const authStore = useAuthStore();
    const uid = sanitizeId(authStore.user?.uid || activeOwnerUid.value || 'guest');
    const target = budgets.value.find((b) => b.id === budgetId);

    const confirmed = await useNotificationStore().requestConfirmation({
      title: 'Konfirmasi Hapus Anggaran',
      message: `Apakah Anda yakin ingin menghapus batas anggaran untuk kategori "${target?.category || budgetId}"?`,
      detail: target
        ? `Periode: ${formatPeriodLabel(target.period)} · Batas anggaran: Rp ${Number(target.limitAmount || 0).toLocaleString('id-ID')}. Data anggaran kategori ini akan diarsipkan.`
        : 'Data anggaran kategori ini akan diarsipkan.',
      confirmLabel: 'Ya, Hapus Anggaran',
    });
    if (!confirmed) return false;

    await ensureFirestoreSessionForUser(uid);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'budgets', budgetId), {
        deleted: true,
        deletedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      touchUserSyncTokenInBatch(batch, uid);
      await batch.commit();
    } catch (err) {
      useNotificationStore().notifyError('Gagal Menghapus Anggaran', err);
      handleFirestoreError(err, OperationType.UPDATE, `budgets/${budgetId}`);
    }

    // Keep the period in `budgetPeriods` even if its last budget item is removed,
    // so the empty period card remains visible until the user explicitly deletes the period.
    if (target?.period && !budgetPeriods.value.includes(target.period)) {
      budgetPeriods.value.push(target.period);
      budgetPeriods.value.sort((a, b) => b.localeCompare(a));
    }

    budgets.value = budgets.value.filter((b) => b.id !== budgetId);
    saveLocalSnapshot(uid, true);

    if (target) {
      useNotificationStore().notifySuccess(
        'Anggaran Dihapus',
        `Anggaran kategori "${target.category}" (${formatPeriodLabel(target.period)}) berhasil dihapus.`
      );
    }
    return true;
  }

  return {
    wallets,
    walletOwners,
    userCategories,
    defaultCategories: activeDefaultCategories,
    categories,
    expenseCategoryNames,
    incomeCategoryNames,
    rawTransactions,
    transactions,
    periodTransactions,
    serverPaginatedTransactions,
    txServerPage,
    txServerPageSize,
    txServerTotalFiltered,
    txServerTotalPages,
    isTxServerPageLoading,
    fetchTransactionsServerPage,
    ensureTransactionsForDateRange,
    availablePeriods,
    selectedPeriod,
    budgets,
    budgetPeriods,
    enrichedBudgets,
    getEnrichedBudgetsByPeriod,
    ownershipSummary,
    isLoading,
    isSyncedWithFirestore,
    quickModalOpen,
    editingTransaction,
    openAddTransactionModal,
    openEditTransactionModal,
    totalBalance,
    monthlyIncome,
    monthlyExpense,
    monthlyTransfer,
    periodNetCashflow,
    totalBudgetLimit,
    totalBudgetSpent,
    sisaUangBulanIni,
    daysRemainingInMonth,
    safeDailySpend,
    savingsRate,
    formatHolderName,
    formatPeriodLabel,
    formatTransactionDateBadge,
    initFinanceData,
    checkAndSyncIfRemoteChanged,
    cleanupListeners,
    getHoldersByWalletId,
    addWallet,
    updateWallet,
    addWalletOwner,
    updateWalletOwner,
    renameHolderGlobally,
    removeHolderGlobally,
    removeWalletOwner,
    removeWallet,
    addCategory,
    updateCategory,
    removeCategory,
    addTransaction,
    updateTransaction,
    removeTransaction,
    addBudgetPeriod,
    removeBudgetPeriod,
    saveBudget,
    removeBudget,
  };
});
