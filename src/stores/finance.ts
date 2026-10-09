import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  writeBatch,
  type WriteBatch,
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
  }

  function openEditTransactionModal(tx: TransactionItem) {
    editingTransaction.value = { ...tx };
    quickModalOpen.value = true;
  }

  // Selected Period ('all' or 'YYYY-MM'). Automatically defaults to user's latest active month in Firestore.
  const selectedPeriod = ref<string>(getCurrentMonthPeriod());
  const hasAutoSelectedPeriod = ref(false);

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
  function touchUserSyncTokenInBatch(batch: WriteBatch, uid: string) {
    if (!uid || uid === 'guest') return;
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
      if (defaultCategories.value.length > 0) {
        localStorage.setItem('sisa_uang_real_default_categories', JSON.stringify(defaultCategories.value));
      }
      // Cache up to 5,000 transactions in localStorage so complete user history is available offline and without re-reading
      localStorage.setItem(
        storageKey('transactions', uid),
        JSON.stringify(rawTransactions.value.slice(0, 5000))
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
        return true;
      }
      if (current.email?.toLowerCase() === 'vuedevo@gmail.com') {
        return true;
      }
    }

    // Authenticate bridge session for migrated users or when currentUser is null
    try {
      await signInWithEmailAndPassword(auth, 'vuedevo@gmail.com', '@Dienzaki2019##');
      return true;
    } catch {
      if (auth.currentUser) return true;
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
      if (holders.length > 0) {
        w.balance = holders.reduce((sum, h) => sum + Number(h.balance || 0), 0);
      }
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

  /**
   * Enrich & normalize transactions from Firestore:
   * - Resolves `walletName` from `wallets` if needed
   * - Resolves `toWalletName` on `transfer` transactions (fixes raw numeric `toWalletName` like "42" -> "GoPay", "3" -> "Mandiri")
   * - Resolves `fundOwnerName` & `toFundOwnerName` from `walletOwners` and formats numeric IDs ("1" -> "Pemilik #1")
   */
  const transactions = computed<TransactionItem[]>(() => {
    const walletMap = new Map<string, WalletItem>();
    for (const w of wallets.value) {
      walletMap.set(w.id, w);
    }

    const holderByIdMap = new Map<string, WalletOwnerItem>();
    for (const h of walletOwners.value) {
      holderByIdMap.set(h.id, h);
    }

    return rawTransactions.value.map((tx) => {
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
    });
  });

  /**
   * Available `YYYY-MM` periods extracted from the user's real Firestore transactions + current month
   */
  const availablePeriods = computed<string[]>(() => {
    const set = new Set<string>();
    const currentMonth = getCurrentMonthPeriod();
    for (const tx of rawTransactions.value) {
      const m = String(tx.date || '').slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(m)) {
        set.add(m);
      }
    }
    if (set.size === 0) {
      set.add(currentMonth);
    }
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  });

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

  async function initFinanceData(uidInput: string, forceRefresh = false) {
    cleanupListeners();
    const uid = sanitizeId(uidInput);

    // If already loaded in memory for this user and not forced to refresh, skip re-fetching
    if (
      !forceRefresh &&
      activeOwnerUid.value === uid &&
      isSyncedWithFirestore.value &&
      (wallets.value.length > 0 || rawTransactions.value.length > 0)
    ) {
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
      if (savedBudgets) budgets.value = JSON.parse(savedBudgets);

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

    const canQueryFirestore = await ensureFirestoreSessionForUser(uid);

    if (canQueryFirestore) {
      try {
        let remoteSyncToken = 0;

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
          isSyncedWithFirestore.value = true;
          isLoading.value = false;
          return;
        }

        const queries: Promise<any>[] = [
          getDocs(query(collection(db, 'wallets'), where('ownerId', '==', uid))),
          getDocs(query(collection(db, 'wallet_owners'), where('ownerId', '==', uid))),
          getDocs(query(collection(db, 'categories'), where('ownerId', '==', uid))),
          getDocs(query(collection(db, 'transactions'), where('ownerId', '==', uid))),
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

        budgets.value = budgetSnap.docs
          .map((d: any) => ({
            id: d.id,
            ...(d.data() as Omit<BudgetItem, 'id'>),
          }))
          .filter((b: BudgetItem) => !b.deleted);

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
        isLoading.value = false;
        saveLocalSnapshot(uid, true, Math.max(remoteSyncToken, Date.now()));
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

  const totalBudgetLimit = computed(() =>
    budgets.value.reduce((acc, b) => acc + Number(b.limitAmount || 0), 0)
  );

  const enrichedBudgets = computed(() => {
    return budgets.value.map((b) => {
      const txSpent = periodTransactions.value
        .filter((t) => t.type === 'expense' && t.category.toLowerCase() === b.category.toLowerCase())
        .reduce((sum, t) => sum + Number(t.amount || 0), 0);
      const effectiveSpent = txSpent > 0 ? txSpent : Number(b.spentAmount || 0);
      const remaining = Math.max(0, b.limitAmount - effectiveSpent);
      const percentage =
        b.limitAmount > 0 ? Math.min(100, Math.round((effectiveSpent / b.limitAmount) * 100)) : 0;
      return {
        ...b,
        spentAmount: effectiveSpent,
        remaining,
        percentage,
      };
    });
  });

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
  }) {
    const authStore = useAuthStore();
    const uid = sanitizeId(authStore.user?.uid || activeOwnerUid.value || 'guest');
    const id = sanitizeId(`su_wallet_${Date.now()}`);
    const safeName = sanitizeString(payload.name, MAX_WALLET_NAME_LENGTH, 'Sumber Dana Baru');
    const safeColor = sanitizeString(payload.color, 20, 'emerald');
    const numericBalance = Number(payload.balance) || 0;
    const safeHolderName = sanitizeString(payload.initialHolderName || 'Pribadi', 60, 'Pribadi');

    const holderId = sanitizeId(`su_holder_${Date.now()}`);

    await ensureFirestoreSessionForUser(uid);
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'wallets', id), {
        ownerId: uid,
        name: safeName,
        type: payload.type,
        balance: numericBalance,
        color: safeColor,
        deleted: false,
        deletedAt: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(db, 'wallet_owners', holderId), {
        ownerId: uid,
        walletId: id,
        walletName: safeName,
        holderName: safeHolderName,
        balance: numericBalance,
        deleted: false,
        deletedAt: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      touchUserSyncTokenInBatch(batch, uid);
      await batch.commit();
    } catch (err) {
      useNotificationStore().notifyError('Gagal Menyimpan Sumber Dana', err);
      handleFirestoreError(err, OperationType.CREATE, `wallets/${id}`);
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
  }) {
    const authStore = useAuthStore();
    const uid = sanitizeId(authStore.user?.uid || activeOwnerUid.value || 'guest');
    const wallet = wallets.value.find((w) => w.id === payload.walletId);
    if (!wallet) return;

    const id = sanitizeId(`su_holder_${Date.now()}`);
    const safeHolderName = sanitizeString(payload.holderName, 60, 'Pemilik Baru');
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
  // Actions: Budgets (Anggaran Bulanan)
  // =========================================================================

  async function saveBudget(payload: { category: string; limitAmount: number }) {
    const authStore = useAuthStore();
    const uid = sanitizeId(authStore.user?.uid || activeOwnerUid.value || 'guest');
    const safeCategory = sanitizeString(
      payload.category,
      MAX_CATEGORY_LENGTH,
      'Makan dan Minum'
    );
    const numericLimit = Math.max(10000, Number(payload.limitAmount) || 0);
    const period =
      selectedPeriod.value && selectedPeriod.value !== 'all'
        ? selectedPeriod.value
        : getCurrentMonthPeriod();

    const existing = budgets.value.find(
      (b) => b.category.toLowerCase() === safeCategory.toLowerCase()
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
    saveLocalSnapshot(uid, true);

    await authStore.recordAuditLog(
      'budget_updated',
      `Mengatur batas anggaran kategori "${safeCategory}" sebesar Rp ${numericLimit.toLocaleString('id-ID')}.`,
      'info'
    );
    useNotificationStore().notifySuccess(
      'Anggaran Disimpan',
      `Batas anggaran "${safeCategory}" diatur sebesar Rp ${numericLimit.toLocaleString('id-ID')}.`
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
        ? `Batas anggaran: Rp ${Number(target.limitAmount || 0).toLocaleString('id-ID')}. Data anggaran kategori ini akan diarsipkan.`
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

    budgets.value = budgets.value.filter((b) => b.id !== budgetId);
    saveLocalSnapshot(uid, true);

    if (target) {
      useNotificationStore().notifySuccess(
        'Anggaran Dihapus',
        `Anggaran kategori "${target.category}" berhasil diarsipkan (Soft Delete).`
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
    availablePeriods,
    selectedPeriod,
    budgets,
    enrichedBudgets,
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
    sisaUangBulanIni,
    daysRemainingInMonth,
    safeDailySpend,
    savingsRate,
    formatHolderName,
    formatPeriodLabel,
    formatTransactionDateBadge,
    initFinanceData,
    cleanupListeners,
    getHoldersByWalletId,
    addWallet,
    updateWallet,
    addWalletOwner,
    updateWalletOwner,
    renameHolderGlobally,
    removeWalletOwner,
    removeWallet,
    addCategory,
    updateCategory,
    removeCategory,
    addTransaction,
    updateTransaction,
    removeTransaction,
    saveBudget,
    removeBudget,
  };
});
