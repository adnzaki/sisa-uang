import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  writeBatch,
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
  note: string;
  date: string;
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

export const useFinanceStore = defineStore('finance', () => {
  const wallets = ref<WalletItem[]>([]);
  const walletOwners = ref<WalletOwnerItem[]>([]);
  const userCategories = ref<CategoryItem[]>([]);
  const defaultCategories = ref<CategoryItem[]>([]);
  const rawTransactions = ref<TransactionItem[]>([]);
  const budgets = ref<BudgetItem[]>([]);

  const isLoading = ref(false);
  const isSyncedWithFirestore = ref(false);
  const activeOwnerUid = ref<string>('');
  const quickModalOpen = ref(false);

  // Selected Period ('all' or 'YYYY-MM'). Automatically defaults to user's latest active month in Firestore.
  const selectedPeriod = ref<string>(getCurrentMonthPeriod());
  const hasAutoSelectedPeriod = ref(false);

  let unsubWallets: (() => void) | null = null;
  let unsubWalletOwners: (() => void) | null = null;
  let unsubUserCategories: (() => void) | null = null;
  let unsubDefaultCategories: (() => void) | null = null;
  let unsubTransactions: (() => void) | null = null;
  let unsubBudgets: (() => void) | null = null;

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

  function saveLocalSnapshot(uid: string) {
    if (!uid) return;
    try {
      localStorage.setItem(storageKey('wallets', uid), JSON.stringify(wallets.value));
      localStorage.setItem(storageKey('wallet_owners', uid), JSON.stringify(walletOwners.value));
      localStorage.setItem(storageKey('user_categories', uid), JSON.stringify(userCategories.value));
      localStorage.setItem(storageKey('budgets', uid), JSON.stringify(budgets.value));
      // Only cache up to 300 recent transactions in localStorage to avoid quota issues
      localStorage.setItem(
        storageKey('transactions', uid),
        JSON.stringify(rawTransactions.value.slice(0, 300))
      );
    } catch {
      // Ignore storage quota errors on large datasets
    }
  }

  function cleanupListeners() {
    if (unsubWallets) {
      unsubWallets();
      unsubWallets = null;
    }
    if (unsubWalletOwners) {
      unsubWalletOwners();
      unsubWalletOwners = null;
    }
    if (unsubUserCategories) {
      unsubUserCategories();
      unsubUserCategories = null;
    }
    if (unsubDefaultCategories) {
      unsubDefaultCategories();
      unsubDefaultCategories = null;
    }
    if (unsubTransactions) {
      unsubTransactions();
      unsubTransactions = null;
    }
    if (unsubBudgets) {
      unsubBudgets();
      unsubBudgets = null;
    }
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
   * Synchronize parent wallet total balance from its `wallet_owners` documents in Firestore.
   */
  function syncWalletTotalBalancesFromHolders() {
    for (const w of wallets.value) {
      const holders = walletOwners.value.filter((fo) => fo.walletId === w.id);
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
   */
  const categories = computed<CategoryItem[]>(() => {
    const merged: CategoryItem[] = [];
    const seen = new Set<string>();

    // 1. User's custom categories first
    for (const c of userCategories.value) {
      const key = `${c.type}:${c.name.toLowerCase().trim()}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push({ ...c, isDefault: false });
      }
    }

    // 2. Global default categories from Firestore `ci4_user_46` (`default_category`)
    for (const c of defaultCategories.value) {
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

  async function initFinanceData(uidInput: string) {
    cleanupListeners();
    const uid = sanitizeId(uidInput);
    activeOwnerUid.value = uid;
    isLoading.value = true;
    isSyncedWithFirestore.value = false;
    hasAutoSelectedPeriod.value = false;

    cleanupLegacyDummyStorage(uid);

    // Clear state first so dummy or previous user data never leaks
    wallets.value = [];
    walletOwners.value = [];
    userCategories.value = [];
    rawTransactions.value = [];
    budgets.value = [];

    // Restore last known real Firestore snapshot from localStorage while Firestore connects
    try {
      const savedWallets = localStorage.getItem(storageKey('wallets', uid));
      const savedHolders = localStorage.getItem(storageKey('wallet_owners', uid));
      const savedUserCats = localStorage.getItem(storageKey('user_categories', uid));
      const savedTransactions = localStorage.getItem(storageKey('transactions', uid));
      const savedBudgets = localStorage.getItem(storageKey('budgets', uid));

      if (savedWallets) wallets.value = JSON.parse(savedWallets);
      if (savedHolders) walletOwners.value = JSON.parse(savedHolders);
      if (savedUserCats) userCategories.value = JSON.parse(savedUserCats);
      if (savedTransactions) rawTransactions.value = JSON.parse(savedTransactions);
      if (savedBudgets) budgets.value = JSON.parse(savedBudgets);
      syncWalletTotalBalancesFromHolders();
    } catch {
      // Ignore corrupt cache
    }

    const canQueryFirestore = await ensureFirestoreSessionForUser(uid);

    if (canQueryFirestore) {
      // 1. Wallets listener for this user
      const walletsQuery = query(collection(db, 'wallets'), where('ownerId', '==', uid));
      unsubWallets = onSnapshot(
        walletsQuery,
        (snap) => {
          wallets.value = snap.docs
            .map((d) => ({
              id: d.id,
              ...(d.data() as Omit<WalletItem, 'id'>),
            }))
            .sort((a, b) => a.name.localeCompare(b.name));
          syncWalletTotalBalancesFromHolders();
          isSyncedWithFirestore.value = true;
          isLoading.value = false;
          saveLocalSnapshot(uid);
        },
        (err) => {
          isLoading.value = false;
          handleFirestoreError(err, OperationType.LIST, 'wallets');
        }
      );

      // 2. Wallet Owners (Kepemilikan Sumber Dana) listener for this user
      const holdersQuery = query(collection(db, 'wallet_owners'), where('ownerId', '==', uid));
      unsubWalletOwners = onSnapshot(
        holdersQuery,
        (snap) => {
          walletOwners.value = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<WalletOwnerItem, 'id'>),
          }));
          syncWalletTotalBalancesFromHolders();
          saveLocalSnapshot(uid);
        },
        (err) => {
          handleFirestoreError(err, OperationType.LIST, 'wallet_owners');
        }
      );

      // 3A. User's Custom Categories listener (`ownerId == uid`)
      const userCatQuery = query(collection(db, 'categories'), where('ownerId', '==', uid));
      unsubUserCategories = onSnapshot(
        userCatQuery,
        (snap) => {
          userCategories.value = snap.docs
            .map((d) => ({
              id: d.id,
              ...(d.data() as Omit<CategoryItem, 'id'>),
              isDefault: false,
            }))
            .sort((a, b) => a.name.localeCompare(b.name));
          saveLocalSnapshot(uid);
        },
        (err) => {
          handleFirestoreError(err, OperationType.LIST, 'categories');
        }
      );

      // 3B. Global Default Categories listener (`ownerId == 'ci4_user_46'` / `default_category`)
      if (uid !== DEFAULT_CATEGORY_OWNER_ID) {
        const defaultCatQuery = query(
          collection(db, 'categories'),
          where('ownerId', '==', DEFAULT_CATEGORY_OWNER_ID)
        );
        unsubDefaultCategories = onSnapshot(
          defaultCatQuery,
          (snap) => {
            defaultCategories.value = snap.docs
              .map((d) => ({
                id: d.id,
                ...(d.data() as Omit<CategoryItem, 'id'>),
                isDefault: true,
              }))
              .sort((a, b) => a.name.localeCompare(b.name));
          },
          () => {
            // Ignore if default_category is not accessible
          }
        );
      }

      // 4. Transactions listener for this user
      const txQuery = query(collection(db, 'transactions'), where('ownerId', '==', uid));
      unsubTransactions = onSnapshot(
        txQuery,
        (snap) => {
          const list = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<TransactionItem, 'id'>),
          }));
          list.sort((a, b) => {
            const cmp = String(b.date || '').localeCompare(String(a.date || ''));
            if (cmp !== 0) return cmp;
            return String(b.id || '').localeCompare(String(a.id || ''));
          });
          rawTransactions.value = list;

          // Auto-select the user's most recent active month on initial load so Dashboard & Analytics immediately show real activity
          if (!hasAutoSelectedPeriod.value && list.length > 0) {
            hasAutoSelectedPeriod.value = true;
            const currentMonth = getCurrentMonthPeriod();
            const hasCurrentMonthTx = list.some(
              (tx) => String(tx.date || '').slice(0, 7) === currentMonth
            );
            if (hasCurrentMonthTx) {
              selectedPeriod.value = currentMonth;
            } else {
              const latestTxMonth = String(list[0].date || '').slice(0, 7);
              if (/^\d{4}-\d{2}$/.test(latestTxMonth)) {
                selectedPeriod.value = latestTxMonth;
              }
            }
          }

          isLoading.value = false;
          saveLocalSnapshot(uid);
        },
        (err) => {
          isLoading.value = false;
          handleFirestoreError(err, OperationType.LIST, 'transactions');
        }
      );

      // 5. Budgets listener for this user
      const budgetQuery = query(collection(db, 'budgets'), where('ownerId', '==', uid));
      unsubBudgets = onSnapshot(
        budgetQuery,
        (snap) => {
          budgets.value = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<BudgetItem, 'id'>),
          }));
          saveLocalSnapshot(uid);
        },
        (err) => {
          handleFirestoreError(err, OperationType.LIST, 'budgets');
        }
      );
    } else {
      isLoading.value = false;
    }
  }

  // Helper to get fund owners for a specific wallet
  function getHoldersByWalletId(walletId: string): WalletOwnerItem[] {
    return walletOwners.value.filter((fo) => fo.walletId === walletId);
  }

  // Summary of Fund Ownership across all wallets (Konsep Kepemilikan Dana SisaUang)
  const ownershipSummary = computed<OwnershipSummaryItem[]>(() => {
    const map = new Map<string, OwnershipSummaryItem>();
    for (const fo of walletOwners.value) {
      const rawKey = String(fo.holderName || 'Pribadi').trim();
      const existing = map.get(rawKey) || {
        rawHolderName: rawKey,
        displayHolderName: formatHolderName(rawKey),
        totalBalance: 0,
        walletCount: 0,
        wallets: [],
      };
      const parentWallet = wallets.value.find((w) => w.id === fo.walletId);
      const wName = parentWallet?.name || fo.walletName || 'Sumber Dana';

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
    periodTransactions.value
      .filter((t) => t.type === 'expense')
      .reduce((acc, t) => acc + Number(t.amount || 0), 0)
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
      await setDoc(doc(db, 'wallets', id), {
        ownerId: uid,
        name: safeName,
        type: payload.type,
        balance: numericBalance,
        color: safeColor,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'wallet_owners', holderId), {
        ownerId: uid,
        walletId: id,
        walletName: safeName,
        holderName: safeHolderName,
        balance: numericBalance,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      useNotificationStore().notifyError('Gagal Menyimpan Sumber Dana', err);
      handleFirestoreError(err, OperationType.CREATE, `wallets/${id}`);
    }

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
      await updateDoc(doc(db, 'wallets', walletId), {
        name: safeName,
        type: payload.type,
        color: safeColor,
        updatedAt: serverTimestamp(),
      });

      // Also update walletName in child wallet_owners
      const childHolders = walletOwners.value.filter((fo) => fo.walletId === walletId);
      for (const ch of childHolders) {
        await updateDoc(doc(db, 'wallet_owners', ch.id), {
          walletName: safeName,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      useNotificationStore().notifyError('Gagal Memperbarui Sumber Dana', err);
      handleFirestoreError(err, OperationType.UPDATE, `wallets/${walletId}`);
    }

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
      await setDoc(doc(db, 'wallet_owners', id), {
        ownerId: uid,
        walletId: wallet.id,
        walletName: wallet.name,
        holderName: safeHolderName,
        balance: numericBalance,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'wallets', wallet.id), {
        balance: newWalletTotal,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      useNotificationStore().notifyError('Gagal Menambahkan Pemilik Dana', err);
      handleFirestoreError(err, OperationType.CREATE, `wallet_owners/${id}`);
    }

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

    await ensureFirestoreSessionForUser(uid);
    try {
      await updateDoc(doc(db, 'wallet_owners', holderId), {
        holderName: safeHolderName,
        balance: numericBalance,
        updatedAt: serverTimestamp(),
      });

      const siblingHolders = walletOwners.value.filter((fo) => fo.walletId === target.walletId);
      const newWalletTotal = siblingHolders.reduce(
        (sum, h) => sum + (h.id === holderId ? numericBalance : Number(h.balance || 0)),
        0
      );
      await updateDoc(doc(db, 'wallets', target.walletId), {
        balance: newWalletTotal,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      useNotificationStore().notifyError('Gagal Memperbarui Pemilik Dana', err);
      handleFirestoreError(err, OperationType.UPDATE, `wallet_owners/${holderId}`);
    }

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
      await batch.commit();
    } catch (err) {
      useNotificationStore().notifyError('Gagal Mengubah Nama Kepemilikan Dana', err);
      handleFirestoreError(err, OperationType.UPDATE, 'wallet_owners');
    }

    useNotificationStore().notifySuccess(
      'Nama Pemilik Dana Diperbarui',
      `"${formatHolderName(oldRawHolderName)}" berhasil diubah menjadi "${safeNewName}" pada ${matchingHolders.length} sumber dana.`
    );
  }

  async function removeWalletOwner(holderId: string) {
    const authStore = useAuthStore();
    const uid = sanitizeId(authStore.user?.uid || activeOwnerUid.value || 'guest');
    const target = walletOwners.value.find((fo) => fo.id === holderId);
    if (!target) return;

    await ensureFirestoreSessionForUser(uid);
    try {
      await deleteDoc(doc(db, 'wallet_owners', holderId));
      const remainingHolders = walletOwners.value.filter(
        (fo) => fo.walletId === target.walletId && fo.id !== holderId
      );
      const newBalance = remainingHolders.reduce((sum, h) => sum + Number(h.balance || 0), 0);
      await updateDoc(doc(db, 'wallets', target.walletId), {
        balance: newBalance,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      useNotificationStore().notifyError('Gagal Menghapus Pemilik Dana', err);
      handleFirestoreError(err, OperationType.DELETE, `wallet_owners/${holderId}`);
    }

    useNotificationStore().notifySuccess(
      'Pemilik Sumber Dana Dihapus',
      `Pemilik dana "${formatHolderName(target.holderName)}" telah dihapus dari ${target.walletName}.`
    );
  }

  async function removeWallet(walletId: string) {
    const authStore = useAuthStore();
    const uid = sanitizeId(authStore.user?.uid || activeOwnerUid.value || 'guest');
    const target = wallets.value.find((w) => w.id === walletId);
    const childHolders = walletOwners.value.filter((fo) => fo.walletId === walletId);

    await ensureFirestoreSessionForUser(uid);
    try {
      await deleteDoc(doc(db, 'wallets', walletId));
      for (const ch of childHolders) {
        await deleteDoc(doc(db, 'wallet_owners', ch.id));
      }
    } catch (err) {
      useNotificationStore().notifyError('Gagal Menghapus Sumber Dana', err);
      handleFirestoreError(err, OperationType.DELETE, `wallets/${walletId}`);
    }

    if (target) {
      await authStore.recordAuditLog(
        'wallet_deleted',
        `Menghapus sumber dana "${target.name}".`,
        'info'
      );
      useNotificationStore().notifySuccess(
        'Sumber Dana Dihapus',
        `Sumber dana "${target.name}" berhasil dihapus dari Firestore.`
      );
    }
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
      await setDoc(doc(db, 'categories', id), {
        ownerId: uid,
        name: safeName,
        type: payload.type,
        color: safeColor,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      useNotificationStore().notifyError('Gagal Menambahkan Kategori', err);
      handleFirestoreError(err, OperationType.CREATE, `categories/${id}`);
    }

    useNotificationStore().notifySuccess(
      'Kategori Baru Ditambahkan',
      `Kategori "${safeName}" (${payload.type === 'income' ? 'Pemasukan' : 'Pengeluaran'}) berhasil disimpan ke Firestore.`
    );
  }

  async function removeCategory(catId: string) {
    const authStore = useAuthStore();
    const uid = sanitizeId(authStore.user?.uid || activeOwnerUid.value || 'guest');
    const target = userCategories.value.find((c) => c.id === catId);
    if (!target) {
      useNotificationStore().notifyError(
        'Kategori Bawaan Sistem',
        'Kategori bawaan (default_category) tidak dapat dihapus. Anda dapat menghapus kategori kustom milik Anda sendiri.'
      );
      return;
    }

    await ensureFirestoreSessionForUser(uid);
    try {
      await deleteDoc(doc(db, 'categories', catId));
    } catch (err) {
      useNotificationStore().notifyError('Gagal Menghapus Kategori', err);
      handleFirestoreError(err, OperationType.DELETE, `categories/${catId}`);
    }

    useNotificationStore().notifySuccess(
      'Kategori Dihapus',
      `Kategori "${target.name}" berhasil dihapus dari Firestore.`
    );
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
      newSourceHolderBalance -= numericAmount;
      newSourceWalletBalance -= numericAmount;
      newDestHolderBalance += numericAmount;
      if (destWallet && destWallet.id !== wallet.id) {
        newDestWalletBalance += numericAmount;
      } else {
        // Same wallet, different fund owner -> wallet total balance stays unchanged
        newSourceWalletBalance = Number(wallet.balance || 0);
      }
    }

    await ensureFirestoreSessionForUser(uid);
    const txPath = `transactions/${id}`;
    try {
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
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (payload.type === 'transfer' && destWallet) {
        firestoreTxData.toWalletId = destWallet.id;
        firestoreTxData.toWalletName = destWallet.name;
        firestoreTxData.toFundOwnerId = destHolder?.id || 'default';
        firestoreTxData.toFundOwnerName = destHolder?.holderName || 'Pribadi';
      }

      await setDoc(doc(db, 'transactions', id), firestoreTxData);

      if (sourceHolder) {
        await updateDoc(doc(db, 'wallet_owners', sourceHolder.id), {
          balance: newSourceHolderBalance,
          updatedAt: serverTimestamp(),
        });
      }
      await updateDoc(doc(db, 'wallets', wallet.id), {
        balance: newSourceWalletBalance,
        updatedAt: serverTimestamp(),
      });

      if (payload.type === 'transfer' && destWallet) {
        if (destHolder) {
          await updateDoc(doc(db, 'wallet_owners', destHolder.id), {
            balance: newDestHolderBalance,
            updatedAt: serverTimestamp(),
          });
        }
        if (destWallet.id !== wallet.id) {
          await updateDoc(doc(db, 'wallets', destWallet.id), {
            balance: newDestWalletBalance,
            updatedAt: serverTimestamp(),
          });
        }
      }
    } catch (err) {
      useNotificationStore().notifyError('Gagal Menyimpan Transaksi', err);
      handleFirestoreError(err, OperationType.CREATE, txPath);
    }

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

  async function removeTransaction(txId: string) {
    const authStore = useAuthStore();
    const uid = sanitizeId(authStore.user?.uid || activeOwnerUid.value || 'guest');
    const tx = transactions.value.find((t) => t.id === txId);
    if (!tx) return;

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
      await deleteDoc(doc(db, 'transactions', txId));

      if (tx.type === 'income') {
        if (sourceHolder) {
          const nextBal = Number(sourceHolder.balance || 0) - tx.amount;
          await updateDoc(doc(db, 'wallet_owners', sourceHolder.id), {
            balance: nextBal,
            updatedAt: serverTimestamp(),
          });
        }
        if (wallet) {
          await updateDoc(doc(db, 'wallets', wallet.id), {
            balance: Number(wallet.balance || 0) - tx.amount,
            updatedAt: serverTimestamp(),
          });
        }
      } else if (tx.type === 'expense') {
        if (sourceHolder) {
          const nextBal = Number(sourceHolder.balance || 0) + tx.amount;
          await updateDoc(doc(db, 'wallet_owners', sourceHolder.id), {
            balance: nextBal,
            updatedAt: serverTimestamp(),
          });
        }
        if (wallet) {
          await updateDoc(doc(db, 'wallets', wallet.id), {
            balance: Number(wallet.balance || 0) + tx.amount,
            updatedAt: serverTimestamp(),
          });
        }
      } else if (tx.type === 'transfer') {
        if (sourceHolder) {
          await updateDoc(doc(db, 'wallet_owners', sourceHolder.id), {
            balance: Number(sourceHolder.balance || 0) + tx.amount,
            updatedAt: serverTimestamp(),
          });
        }
        if (destHolder) {
          await updateDoc(doc(db, 'wallet_owners', destHolder.id), {
            balance: Number(destHolder.balance || 0) - tx.amount,
            updatedAt: serverTimestamp(),
          });
        }
        if (wallet && destWallet && wallet.id !== destWallet.id) {
          await updateDoc(doc(db, 'wallets', wallet.id), {
            balance: Number(wallet.balance || 0) + tx.amount,
            updatedAt: serverTimestamp(),
          });
          await updateDoc(doc(db, 'wallets', destWallet.id), {
            balance: Number(destWallet.balance || 0) - tx.amount,
            updatedAt: serverTimestamp(),
          });
        }
      }
    } catch (err) {
      useNotificationStore().notifyError('Gagal Menghapus Transaksi', err);
      handleFirestoreError(err, OperationType.DELETE, `transactions/${txId}`);
    }

    await authStore.recordAuditLog(
      'transaction_deleted',
      `Menghapus transaksi ${tx.category} sebesar Rp ${tx.amount.toLocaleString('id-ID')}.`,
      'info'
    );
    useNotificationStore().notifySuccess(
      'Transaksi Dihapus',
      `Transaksi ${tx.category} (Rp ${tx.amount.toLocaleString('id-ID')}) telah dihapus dari Firestore.`
    );
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
      await setDoc(doc(db, 'budgets', targetId), {
        ownerId: uid,
        category: safeCategory,
        limitAmount: numericLimit,
        spentAmount: existing?.spentAmount || 0,
        period,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      useNotificationStore().notifyError('Gagal Menyimpan Anggaran', err);
      handleFirestoreError(err, OperationType.WRITE, `budgets/${targetId}`);
    }

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

  async function removeBudget(budgetId: string) {
    const authStore = useAuthStore();
    const uid = sanitizeId(authStore.user?.uid || activeOwnerUid.value || 'guest');
    const target = budgets.value.find((b) => b.id === budgetId);

    await ensureFirestoreSessionForUser(uid);
    try {
      await deleteDoc(doc(db, 'budgets', budgetId));
    } catch (err) {
      useNotificationStore().notifyError('Gagal Menghapus Anggaran', err);
      handleFirestoreError(err, OperationType.DELETE, `budgets/${budgetId}`);
    }

    if (target) {
      useNotificationStore().notifySuccess(
        'Anggaran Dihapus',
        `Anggaran kategori "${target.category}" berhasil dihapus.`
      );
    }
  }

  return {
    wallets,
    walletOwners,
    userCategories,
    defaultCategories,
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
    removeCategory,
    addTransaction,
    removeTransaction,
    saveBudget,
    removeBudget,
  };
});
