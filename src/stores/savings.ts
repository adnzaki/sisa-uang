import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import {
  auth,
  db,
  sanitizeId,
  sanitizeString,
  isFirestoreOfflineError,
  isFirestoreQuotaError,
} from '../firebase';
import { useAuthStore } from './auth';
import { useFinanceStore, formatHolderName } from './finance';
import { useNotificationStore } from './notification';
import { getWibDateTime, getLocalTodayIsoDate, getTodayIsoDate } from './automation';
import type {
  SavingsGoalItem,
  SavingsEntryItem,
  SavingsCacheData,
  SavingsHolderBreakdown,
  SavingsWalletBreakdown,
} from '../types/savings';

const CACHE_KEY_PREFIX = 'su_savings_cache_';
const DELETED_KEY_PREFIX = 'su_deleted_savings_';
const CACHE_TTL_MS = 5 * 60 * 1000;

export const useSavingsStore = defineStore('savings', () => {
  const goals = ref<SavingsGoalItem[]>([]);
  const entries = ref<SavingsEntryItem[]>([]);
  const isLoading = ref<boolean>(false);
  const isEvaluating = ref<boolean>(false);

  // Reminder Banner Queue State
  const pendingReminder = ref<SavingsGoalItem | null>(null);
  const pendingQueue = ref<SavingsGoalItem[]>([]);

  // Modal Launch Trigger (used when clicking banner CTA from any route)
  const progressModalRequest = ref<{
    goalId: string;
    mode: 'deposit' | 'withdraw';
  } | null>(null);

  // Browser Notification Permission State
  const notificationPermission = ref<'default' | 'granted' | 'denied' | 'unsupported'>(
    typeof window !== 'undefined' && 'Notification' in window
      ? Notification.permission
      : 'unsupported'
  );

  function refreshNotificationPermission() {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      notificationPermission.value = Notification.permission;
    } else {
      notificationPermission.value = 'unsupported';
    }
  }

  // =========================================================================
  // Core Computations (Non-Mutating Ring-Fenced Accounting)
  // =========================================================================

  const activeGoals = computed(() => goals.value.filter((g) => !g.deleted));

  const activeGoalIdsSet = computed(() => new Set(activeGoals.value.map((g) => g.id)));

  const activeEntries = computed(() =>
    entries.value.filter((e) => !e.deleted && activeGoalIdsSet.value.has(e.savingsId))
  );

  function getGoalCollectedAmount(savingsId: string): number {
    let total = 0;
    for (const entry of activeEntries.value) {
      if (entry.savingsId !== savingsId) continue;
      if (entry.type === 'deposit') {
        total += Number(entry.amount) || 0;
      } else {
        total -= Number(entry.amount) || 0;
      }
    }
    return Math.max(0, total);
  }

  const totalSavingsBalance = computed(() => {
    let sum = 0;
    for (const g of activeGoals.value) {
      sum += getGoalCollectedAmount(g.id);
    }
    return sum;
  });

  const totalOperationalBalance = computed(() => {
    const financeStore = useFinanceStore();
    return financeStore.totalBalance - totalSavingsBalance.value;
  });

  const totalTargetAmount = computed(() =>
    activeGoals.value.reduce((sum, g) => sum + Math.max(0, Number(g.targetAmount) || 0), 0)
  );

  function getGoalEntries(savingsId: string): SavingsEntryItem[] {
    return activeEntries.value
      .filter((e) => e.savingsId === savingsId)
      .slice()
      .sort((a, b) => {
        const dCmp = String(b.date || '').localeCompare(String(a.date || ''));
        if (dCmp !== 0) return dCmp;
        const cCmp = String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
        if (cCmp !== 0) return cCmp;
        return String(b.id || '').localeCompare(String(a.id || ''));
      });
  }

  function getGoalSourceBreakdown(savingsId: string): {
    byHolder: SavingsHolderBreakdown[];
    byWallet: SavingsWalletBreakdown[];
  } {
    const financeStore = useFinanceStore();
    const holderMap = new Map<string, SavingsHolderBreakdown>();
    const walletMap = new Map<string, SavingsWalletBreakdown>();

    for (const entry of activeEntries.value) {
      if (entry.savingsId !== savingsId) continue;
      const delta = entry.type === 'deposit' ? Number(entry.amount) || 0 : -(Number(entry.amount) || 0);
      const wId = entry.walletId;
      const liveWallet = financeStore.wallets.find((w) => w.id === wId);
      const wName = liveWallet?.name || entry.walletName || 'Dompet';

      const fId = entry.fundOwnerId || 'default';
      const liveHolder = financeStore.walletOwners.find((h) => h.id === fId);
      const fName = liveHolder
        ? formatHolderName(liveHolder.holderName)
        : formatHolderName(entry.fundOwnerName || 'Pribadi');

      const holderKey = `${wId}__${fId}`;
      const existingHolder = holderMap.get(holderKey) || {
        walletId: wId,
        walletName: wName,
        fundOwnerId: fId,
        fundOwnerName: fName,
        amount: 0,
      };
      existingHolder.amount += delta;
      holderMap.set(holderKey, existingHolder);

      const existingWallet = walletMap.get(wId) || {
        walletId: wId,
        walletName: wName,
        amount: 0,
      };
      existingWallet.amount += delta;
      walletMap.set(wId, existingWallet);
    }

    const byHolder = Array.from(holderMap.values())
      .filter((item) => item.amount > 0)
      .sort((a, b) => b.amount - a.amount);

    const byWallet = Array.from(walletMap.values())
      .filter((item) => item.amount > 0)
      .sort((a, b) => b.amount - a.amount);

    return { byHolder, byWallet };
  }

  function getGoalHolderSavedAmount(savingsId: string, walletId: string, fundOwnerId?: string): number {
    let total = 0;
    const normalizedFundOwner = fundOwnerId || 'default';
    for (const entry of activeEntries.value) {
      if (entry.savingsId !== savingsId || entry.walletId !== walletId) continue;
      const entryHolder = entry.fundOwnerId || 'default';
      if (fundOwnerId && entryHolder !== normalizedFundOwner) continue;
      total += entry.type === 'deposit' ? Number(entry.amount) || 0 : -(Number(entry.amount) || 0);
    }
    return Math.max(0, total);
  }

  function getGoalWalletSavedAmount(savingsId: string, walletId: string): number {
    let total = 0;
    for (const entry of activeEntries.value) {
      if (entry.savingsId !== savingsId || entry.walletId !== walletId) continue;
      total += entry.type === 'deposit' ? Number(entry.amount) || 0 : -(Number(entry.amount) || 0);
    }
    return Math.max(0, total);
  }

  function getWalletSavingsBalance(walletId: string): number {
    if (!walletId) return 0;
    const perGoal = new Map<string, number>();
    for (const entry of activeEntries.value) {
      if (entry.walletId !== walletId) continue;
      const cur = perGoal.get(entry.savingsId) || 0;
      const delta = entry.type === 'deposit' ? Number(entry.amount) || 0 : -(Number(entry.amount) || 0);
      perGoal.set(entry.savingsId, cur + delta);
    }
    let sum = 0;
    for (const val of perGoal.values()) {
      if (val > 0) sum += val;
    }
    return sum;
  }

  function getWalletOperationalBalance(walletId: string): number {
    const financeStore = useFinanceStore();
    const wallet = financeStore.wallets.find((w) => w.id === walletId);
    const total = Number(wallet?.balance || 0);
    return total - getWalletSavingsBalance(walletId);
  }

  function getHolderSavingsBalance(walletId: string, fundOwnerId?: string): number {
    if (!walletId) return 0;
    const targetHolder = fundOwnerId || 'default';
    const perGoal = new Map<string, number>();
    for (const entry of activeEntries.value) {
      if (entry.walletId !== walletId) continue;
      const entryHolder = entry.fundOwnerId || 'default';
      if (entryHolder !== targetHolder) continue;
      const cur = perGoal.get(entry.savingsId) || 0;
      const delta = entry.type === 'deposit' ? Number(entry.amount) || 0 : -(Number(entry.amount) || 0);
      perGoal.set(entry.savingsId, cur + delta);
    }
    let sum = 0;
    for (const val of perGoal.values()) {
      if (val > 0) sum += val;
    }
    return sum;
  }

  function getHolderOperationalBalance(walletId: string, fundOwnerId?: string): number {
    const financeStore = useFinanceStore();
    if (fundOwnerId) {
      const holder = financeStore.walletOwners.find((h) => h.id === fundOwnerId);
      const total = Number(holder?.balance || 0);
      return total - getHolderSavingsBalance(walletId, fundOwnerId);
    }
    return getWalletOperationalBalance(walletId);
  }

  function getGoalsHoldingWallet(walletId: string, fundOwnerId?: string): {
    goal: SavingsGoalItem;
    walletSaved: number;
    holderSaved: number;
    holdersBreakdown: SavingsHolderBreakdown[];
  }[] {
    const results: {
      goal: SavingsGoalItem;
      walletSaved: number;
      holderSaved: number;
      holdersBreakdown: SavingsHolderBreakdown[];
    }[] = [];

    for (const goal of activeGoals.value) {
      const walletSaved = getGoalWalletSavedAmount(goal.id, walletId);
      if (walletSaved <= 0) continue;
      const breakdown = getGoalSourceBreakdown(goal.id).byHolder.filter((b) => b.walletId === walletId);
      const holderSaved = fundOwnerId
        ? getGoalHolderSavedAmount(goal.id, walletId, fundOwnerId)
        : walletSaved;
      results.push({
        goal,
        walletSaved,
        holderSaved,
        holdersBreakdown: breakdown,
      });
    }

    return results.sort((a, b) => b.holderSaved - a.holderSaved || b.walletSaved - a.walletSaved);
  }

  // =========================================================================
  // Local Storage Cache & Tombstone Registry
  // =========================================================================

  function getDeletedIds(uid: string, kind: 'goals' | 'entries'): Set<string> {
    const result = new Set<string>();
    if (typeof window === 'undefined') return result;
    try {
      const raw = localStorage.getItem(`${DELETED_KEY_PREFIX}${kind}_${uid}`);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          for (const id of arr) if (id) result.add(String(id));
        }
      }
    } catch {
      // Ignore
    }
    return result;
  }

  function recordDeletedId(uid: string, kind: 'goals' | 'entries', id: string) {
    if (typeof window === 'undefined' || !id) return;
    try {
      const deleted = getDeletedIds(uid, kind);
      deleted.add(id);
      localStorage.setItem(`${DELETED_KEY_PREFIX}${kind}_${uid}`, JSON.stringify(Array.from(deleted)));
    } catch {
      // Ignore
    }
  }

  function removeDeletedId(uid: string, kind: 'goals' | 'entries', id: string) {
    if (typeof window === 'undefined' || !id) return;
    try {
      const deleted = getDeletedIds(uid, kind);
      deleted.delete(id);
      localStorage.setItem(`${DELETED_KEY_PREFIX}${kind}_${uid}`, JSON.stringify(Array.from(deleted)));
    } catch {
      // Ignore
    }
  }

  function readLocalCache(uid: string): SavingsCacheData {
    const empty: SavingsCacheData = { goals: [], entries: [], fetchedAt: 0, expiresAt: 0 };
    if (typeof window === 'undefined') return empty;
    try {
      const raw = localStorage.getItem(`${CACHE_KEY_PREFIX}${uid}`);
      if (!raw) return empty;
      const parsed = JSON.parse(raw) as SavingsCacheData;
      if (!parsed || !Array.isArray(parsed.goals) || !Array.isArray(parsed.entries)) return empty;
      const delGoals = getDeletedIds(uid, 'goals');
      const delEntries = getDeletedIds(uid, 'entries');
      return {
        goals: parsed.goals.filter((g) => !g.deleted && !delGoals.has(g.id)),
        entries: parsed.entries.filter((e) => !e.deleted && !delEntries.has(e.id) && !delGoals.has(e.savingsId)),
        fetchedAt: Number(parsed.fetchedAt || 0),
        expiresAt: Number(parsed.expiresAt || 0),
      };
    } catch {
      return empty;
    }
  }

  function writeLocalCache(uid: string, goalItems: SavingsGoalItem[], entryItems: SavingsEntryItem[], ttlMs = CACHE_TTL_MS) {
    if (typeof window === 'undefined') return;
    try {
      const now = Date.now();
      const delGoals = getDeletedIds(uid, 'goals');
      const delEntries = getDeletedIds(uid, 'entries');
      const cleanGoals = goalItems.filter((g) => !g.deleted && !delGoals.has(g.id));
      const cleanEntries = entryItems.filter((e) => !e.deleted && !delEntries.has(e.id) && !delGoals.has(e.savingsId));
      const cache: SavingsCacheData = {
        goals: cleanGoals,
        entries: cleanEntries,
        fetchedAt: now,
        expiresAt: now + ttlMs,
      };
      localStorage.setItem(`${CACHE_KEY_PREFIX}${uid}`, JSON.stringify(cache));
    } catch {
      // Ignore
    }
  }

  async function syncAllToServer(uid: string, goalItems: SavingsGoalItem[], entryItems: SavingsEntryItem[]) {
    try {
      await fetch(`/api/users/${encodeURIComponent(uid)}/savings/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goals: goalItems, entries: entryItems }),
      });
    } catch {
      // Ignore background sync errors
    }
  }

  // =========================================================================
  // Load / Sync Savings Data
  // =========================================================================

  async function loadSavings(uidInput?: string, forceRefresh = false): Promise<void> {
    const authStore = useAuthStore();
    const financeStore = useFinanceStore();
    const uid = sanitizeId(uidInput || authStore.user?.uid || auth.currentUser?.uid || 'default');
    if (!uid || uid === 'guest') return;

    const delGoals = getDeletedIds(uid, 'goals');
    const delEntries = getDeletedIds(uid, 'entries');

    if (!forceRefresh) {
      const cached = readLocalCache(uid);
      if (cached.expiresAt > 0 && Date.now() < cached.expiresAt && (cached.goals.length > 0 || cached.entries.length > 0)) {
        goals.value = cached.goals;
        entries.value = cached.entries;
        return;
      }
    }

    isLoading.value = true;
    try {
      await financeStore.ensureFirestoreSessionForUser(uid);

      let fsGoals: SavingsGoalItem[] = [];
      let fsEntries: SavingsEntryItem[] = [];
      let fsSuccess = false;

      try {
        const [goalsSnap, entriesSnap] = await Promise.all([
          getDocs(query(collection(db, 'savings_goals'), where('ownerId', '==', uid))),
          getDocs(query(collection(db, 'savings_entries'), where('ownerId', '==', uid))),
        ]);
        fsGoals = goalsSnap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<SavingsGoalItem, 'id'>) }))
          .filter((g) => !g.deleted && !delGoals.has(g.id));
        fsEntries = entriesSnap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<SavingsEntryItem, 'id'>) }))
          .filter((e) => !e.deleted && !delEntries.has(e.id) && !delGoals.has(e.savingsId));
        fsSuccess = true;
      } catch (err: any) {
        if (!isFirestoreOfflineError(err) && !isFirestoreQuotaError(err)) {
          console.warn('Firestore loadSavings notice:', err?.message || err);
        }
      }

      let serverGoals: SavingsGoalItem[] = [];
      let serverEntries: SavingsEntryItem[] = [];
      try {
        const res = await fetch(`/api/users/${encodeURIComponent(uid)}/savings`);
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.goals)) {
            serverGoals = data.goals.filter((g: any) => !g.deleted && !delGoals.has(g.id));
          }
          if (data && Array.isArray(data.entries)) {
            serverEntries = data.entries.filter(
              (e: any) => !e.deleted && !delEntries.has(e.id) && !delGoals.has(e.savingsId)
            );
          }
        }
      } catch {
        // Ignore network errors
      }

      const cached = readLocalCache(uid);
      const goalMap = new Map<string, SavingsGoalItem>();
      const entryMap = new Map<string, SavingsEntryItem>();

      // If Firestore succeeded AND has data (or server/cache doesn't have un-synced items), merge cleanly.
      // Because external Firebase project rules might not be deployed immediately, we merge server/cache alongside Firestore
      // while honoring explicit tombstones (`delGoals`, `delEntries`).
      if (fsSuccess && (fsGoals.length > 0 || serverGoals.length === 0)) {
        for (const g of fsGoals) goalMap.set(g.id, g);
        for (const e of fsEntries) entryMap.set(e.id, e);
      } else {
        for (const g of cached.goals) goalMap.set(g.id, g);
        for (const g of serverGoals) goalMap.set(g.id, g);
        for (const g of fsGoals) goalMap.set(g.id, g);

        for (const e of cached.entries) entryMap.set(e.id, e);
        for (const e of serverEntries) entryMap.set(e.id, e);
        for (const e of fsEntries) entryMap.set(e.id, e);
      }

      const mergedGoals = Array.from(goalMap.values())
        .filter((g) => !g.deleted && !delGoals.has(g.id))
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      const mergedGoalIds = new Set(mergedGoals.map((g) => g.id));
      const mergedEntries = Array.from(entryMap.values())
        .filter((e) => !e.deleted && !delEntries.has(e.id) && mergedGoalIds.has(e.savingsId))
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

      goals.value = mergedGoals;
      entries.value = mergedEntries;
      writeLocalCache(uid, mergedGoals, mergedEntries, CACHE_TTL_MS);

      if (mergedGoals.length > 0 || mergedEntries.length > 0) {
        void syncAllToServer(uid, mergedGoals, mergedEntries);
      }
    } catch (err: any) {
      console.warn('loadSavings fallback to local cache:', err?.message || err);
      const fallback = readLocalCache(uid);
      goals.value = fallback.goals;
      entries.value = fallback.entries;
    } finally {
      isLoading.value = false;
    }
  }

  // =========================================================================
  // Save / Delete Goal
  // =========================================================================

  async function saveGoal(payload: {
    id?: string;
    name: string;
    category: string;
    targetAmount: number;
    deadline?: string | null;
    note?: string;
    color?: string;
    reminderEnabled: boolean;
    reminderDays?: number[];
    reminderTime?: string;
    reminderAmount?: number | null;
  }): Promise<SavingsGoalItem | null> {
    const authStore = useAuthStore();
    const financeStore = useFinanceStore();
    const notify = useNotificationStore();
    const uid = sanitizeId(authStore.user?.uid || auth.currentUser?.uid || 'default');
    if (!uid) return null;

    const numericTarget = Math.abs(Number(payload.targetAmount) || 0);
    if (numericTarget <= 0) {
      notify.notifyError('Validasi Gagal', 'Target dana tabungan harus lebih dari 0.');
      return null;
    }

    const safeName = sanitizeString(payload.name, 100, 'Tabungan Baru');
    const safeCategory = sanitizeString(payload.category, 50, 'Lainnya');
    const safeNote = sanitizeString(payload.note || '', 200, '');
    const safeDeadline = payload.deadline ? sanitizeString(payload.deadline, 30, '') : null;
    const safeColor = sanitizeString(payload.color || 'emerald', 20, 'emerald');
    const safeTime = sanitizeString(payload.reminderTime || '09:00', 10, '09:00');
    const cleanDays = Array.from(
      new Set(
        (payload.reminderDays && payload.reminderDays.length > 0 ? payload.reminderDays : [1])
          .map((d) => Math.floor(Number(d)))
          .filter((d) => d >= 1 && d <= 31)
      )
    ).sort((a, b) => a - b);

    const isEdit = Boolean(payload.id);
    const id = payload.id ? sanitizeId(payload.id) : sanitizeId(`sav_${Date.now()}`);
    const existing = isEdit ? goals.value.find((g) => g.id === id) : undefined;

    const goalItem: SavingsGoalItem = {
      id,
      ownerId: uid,
      name: safeName,
      category: safeCategory,
      targetAmount: numericTarget,
      deadline: safeDeadline || null,
      note: safeNote,
      color: safeColor,
      reminderEnabled: Boolean(payload.reminderEnabled),
      reminderDays: cleanDays.length > 0 ? cleanDays : [1],
      reminderTime: safeTime,
      reminderAmount: payload.reminderAmount ? Math.abs(Number(payload.reminderAmount)) : null,
      lastRemindedDate: existing?.lastRemindedDate || null,
      lastSkippedDate: existing?.lastSkippedDate || null,
      lastPushNotifiedDate: existing?.lastPushNotifiedDate || null,
      snoozedUntil: existing?.snoozedUntil || null,
      deleted: false,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    removeDeletedId(uid, 'goals', id);

    const idx = goals.value.findIndex((g) => g.id === id);
    if (idx >= 0) {
      goals.value[idx] = goalItem;
    } else {
      goals.value.push(goalItem);
    }
    goals.value.sort((a, b) => a.name.localeCompare(b.name));
    writeLocalCache(uid, goals.value, entries.value, CACHE_TTL_MS);

    // Server REST API sync
    try {
      await fetch(`/api/users/${encodeURIComponent(uid)}/savings/goals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(goalItem),
      });
    } catch {
      // Ignore network errors
    }

    // Cloud Firestore sync
    try {
      await financeStore.ensureFirestoreSessionForUser(uid);
      const docData: Record<string, any> = {
        ownerId: uid,
        name: safeName,
        category: safeCategory,
        targetAmount: numericTarget,
        deadline: safeDeadline || null,
        note: safeNote,
        color: safeColor,
        reminderEnabled: Boolean(payload.reminderEnabled),
        reminderDays: goalItem.reminderDays,
        reminderTime: safeTime,
        reminderAmount: goalItem.reminderAmount || null,
        deleted: false,
        deletedAt: null,
        updatedAt: serverTimestamp(),
      };
      if (!isEdit) {
        docData.createdAt = serverTimestamp();
        docData.lastRemindedDate = null;
        docData.lastSkippedDate = null;
        docData.lastPushNotifiedDate = null;
        docData.snoozedUntil = null;
      }
      await setDoc(doc(db, 'savings_goals', id), docData, { merge: true });
    } catch (err: any) {
      console.warn('Firestore saveGoal notice:', err?.message || err);
    }

    notify.notifySuccess(
      isEdit ? 'Tabungan Diperbarui' : 'Tabungan Baru Dibuat',
      `Target tabungan "${safeName}" berhasil disimpan.`
    );
    return goalItem;
  }

  async function deleteGoal(id: string): Promise<boolean> {
    const authStore = useAuthStore();
    const financeStore = useFinanceStore();
    const notify = useNotificationStore();
    const uid = sanitizeId(authStore.user?.uid || auth.currentUser?.uid || 'default');
    const targetGoal = goals.value.find((g) => g.id === id);
    if (!targetGoal || !uid) return false;

    const collected = getGoalCollectedAmount(id);
    const confirmed = await notify.requestConfirmation({
      title: 'Hapus Rencana Tabungan',
      message: `Apakah Anda yakin ingin menghapus tabungan "${targetGoal.name}"?`,
      detail:
        collected > 0
          ? `Alokasi dana sebesar Rp ${collected.toLocaleString('id-ID')} di tabungan ini akan kembali menjadi Saldo Bergerak (Operasional) pada dompet masing-masing tanpa mengurangi total saldo dompet Anda.`
          : 'Rencana tabungan beserta riwayat progress di dalamnya akan dihapus permanen.',
      confirmLabel: 'Ya, Hapus Tabungan',
      variant: 'danger',
    });
    if (!confirmed) return false;

    recordDeletedId(uid, 'goals', id);
    const relatedEntries = entries.value.filter((e) => e.savingsId === id);
    for (const e of relatedEntries) {
      recordDeletedId(uid, 'entries', e.id);
    }

    goals.value = goals.value.filter((g) => g.id !== id);
    entries.value = entries.value.filter((e) => e.savingsId !== id);
    writeLocalCache(uid, goals.value, entries.value, CACHE_TTL_MS);

    if (pendingReminder.value?.id === id) {
      dismissCurrentReminder();
    }
    pendingQueue.value = pendingQueue.value.filter((q) => q.id !== id);

    try {
      await fetch(`/api/users/${encodeURIComponent(uid)}/savings/goals/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
    } catch {
      // Ignore
    }

    try {
      await financeStore.ensureFirestoreSessionForUser(uid);
      await deleteDoc(doc(db, 'savings_goals', id));
      for (const e of relatedEntries) {
        await deleteDoc(doc(db, 'savings_entries', e.id)).catch(() => {});
      }
    } catch {
      // Ignore
    }

    notify.notifySuccess(
      'Tabungan Dihapus',
      `Rencana tabungan "${targetGoal.name}" telah dihapus.`
    );
    return true;
  }

  // =========================================================================
  // Record Savings Progress (Deposit / Withdraw)
  // =========================================================================

  async function recordProgress(payload: {
    savingsId: string;
    type: 'deposit' | 'withdraw';
    walletId: string;
    fundOwnerId?: string;
    amount: number;
    date: string;
    note: string;
    relatedTransactionId?: string | null;
    bypassOperationalCheck?: boolean;
    silentNotification?: boolean;
  }): Promise<SavingsEntryItem | null> {
    const authStore = useAuthStore();
    const financeStore = useFinanceStore();
    const notify = useNotificationStore();
    const uid = sanitizeId(authStore.user?.uid || auth.currentUser?.uid || 'default');
    if (!uid) return null;

    const goal = activeGoals.value.find((g) => g.id === payload.savingsId);
    if (!goal) {
      throw new Error('Target tabungan tidak ditemukan.');
    }

    const wallet = financeStore.wallets.find((w) => w.id === payload.walletId);
    if (!wallet) {
      throw new Error('Pilih Sumber Dana (Dompet) terlebih dahulu.');
    }

    const holders = financeStore.getHoldersByWalletId(wallet.id);
    const holder =
      (payload.fundOwnerId ? holders.find((h) => h.id === payload.fundOwnerId) : holders[0]) || holders[0];
    const resolvedHolderId = holder?.id || 'default';
    const resolvedHolderName = holder?.holderName || 'Pribadi';

    const numericAmount = Math.abs(Number(payload.amount) || 0);
    if (numericAmount <= 0) {
      throw new Error('Nominal progress harus lebih dari 0.');
    }

    // Balance Validation
    if (payload.type === 'deposit' && !payload.bypassOperationalCheck) {
      const operationalAvailable = getHolderOperationalBalance(wallet.id, holder?.id);
      if (operationalAvailable < numericAmount) {
        const msg = `Saldo bergerak milik ${formatHolderName(resolvedHolderName)} pada ${wallet.name} hanya tersisa Rp ${Math.max(0, operationalAvailable).toLocaleString('id-ID')}, tidak mencukupi untuk menambah tabungan Rp ${numericAmount.toLocaleString('id-ID')}.`;
        throw new Error(msg);
      }
    }

    if (payload.type === 'withdraw') {
      const holderSavedInGoal = getGoalHolderSavedAmount(goal.id, wallet.id, holder?.id);
      const walletSavedInGoal = getGoalWalletSavedAmount(goal.id, wallet.id);
      const maxWithdrawable = holder?.id ? holderSavedInGoal : walletSavedInGoal;
      if (maxWithdrawable < numericAmount) {
        const msg = `Dana ${wallet.name} (${formatHolderName(resolvedHolderName)}) yang tersimpan di tabungan "${goal.name}" hanya Rp ${maxWithdrawable.toLocaleString('id-ID')}.`;
        throw new Error(msg);
      }
    }

    const entryId = sanitizeId(`sav_ent_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
    const safeDate = sanitizeString(payload.date || getTodayIsoDate(), 30, getTodayIsoDate());
    const safeNote = sanitizeString(
      payload.note,
      200,
      payload.type === 'deposit' ? `Menabung ke ${goal.name}` : `Tarik dana dari ${goal.name}`
    );

    const entryItem: SavingsEntryItem = {
      id: entryId,
      ownerId: uid,
      savingsId: goal.id,
      savingsName: goal.name,
      type: payload.type,
      walletId: wallet.id,
      walletName: wallet.name,
      fundOwnerId: resolvedHolderId,
      fundOwnerName: resolvedHolderName,
      amount: numericAmount,
      date: safeDate,
      note: safeNote,
      relatedTransactionId: payload.relatedTransactionId || null,
      deleted: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    entries.value.unshift(entryItem);
    entries.value.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

    // If depositing, mark reminder completed for today
    if (payload.type === 'deposit') {
      const todayIso = getTodayIsoDate();
      goal.lastRemindedDate = todayIso;
      goal.snoozedUntil = null;
      if (pendingReminder.value?.id === goal.id) {
        dismissCurrentReminder();
      }
      pendingQueue.value = pendingQueue.value.filter((q) => q.id !== goal.id);
    }

    writeLocalCache(uid, goals.value, entries.value, CACHE_TTL_MS);

    // Server REST API sync
    try {
      await fetch(`/api/users/${encodeURIComponent(uid)}/savings/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entryItem),
      });
      if (payload.type === 'deposit') {
        await fetch(`/api/users/${encodeURIComponent(uid)}/savings/goals/${encodeURIComponent(goal.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lastRemindedDate: goal.lastRemindedDate, snoozedUntil: null }),
        });
      }
    } catch {
      // Ignore network errors
    }

    // Cloud Firestore sync
    try {
      await financeStore.ensureFirestoreSessionForUser(uid);
      await setDoc(doc(db, 'savings_entries', entryId), {
        ownerId: uid,
        savingsId: goal.id,
        savingsName: goal.name,
        type: payload.type,
        walletId: wallet.id,
        walletName: wallet.name,
        fundOwnerId: resolvedHolderId,
        fundOwnerName: resolvedHolderName,
        amount: numericAmount,
        date: safeDate,
        note: safeNote,
        relatedTransactionId: payload.relatedTransactionId || null,
        deleted: false,
        deletedAt: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (payload.type === 'deposit') {
        await setDoc(
          doc(db, 'savings_goals', goal.id),
          {
            lastRemindedDate: goal.lastRemindedDate,
            snoozedUntil: null,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }
    } catch (err: any) {
      console.warn('Firestore recordProgress notice:', err?.message || err);
    }

    if (!payload.silentNotification) {
      const amtStr = `Rp ${numericAmount.toLocaleString('id-ID')}`;
      if (payload.type === 'deposit') {
        notify.notifySuccess(
          'Progress Tabungan Tercatat',
          `Berhasil mengalokasikan ${amtStr} dari ${wallet.name} (${formatHolderName(resolvedHolderName)}) ke "${goal.name}".`
        );
      } else {
        notify.notifySuccess(
          'Penarikan Dana Tabungan Berhasil',
          `Berhasil menarik ${amtStr} dari "${goal.name}" kembali ke Saldo Bergerak ${wallet.name}.`
        );
      }
    }

    return entryItem;
  }

  async function deleteEntry(entryId: string): Promise<boolean> {
    const authStore = useAuthStore();
    const financeStore = useFinanceStore();
    const notify = useNotificationStore();
    const uid = sanitizeId(authStore.user?.uid || auth.currentUser?.uid || 'default');
    const target = entries.value.find((e) => e.id === entryId);
    if (!target || !uid) return false;

    const confirmed = await notify.requestConfirmation({
      title: 'Hapus Riwayat Progress',
      message: `Hapus catatan ${target.type === 'deposit' ? 'penambahan dana' : 'tarik dana'} sebesar Rp ${Number(target.amount).toLocaleString('id-ID')}?`,
      detail: 'Tindakan ini hanya menyesuaikan alokasi tabungan dan tidak memengaruhi saldo dompet keseluruhan Anda.',
      confirmLabel: 'Ya, Hapus Catatan',
      variant: 'danger',
    });
    if (!confirmed) return false;

    recordDeletedId(uid, 'entries', entryId);
    entries.value = entries.value.filter((e) => e.id !== entryId);
    writeLocalCache(uid, goals.value, entries.value, CACHE_TTL_MS);

    try {
      await fetch(`/api/users/${encodeURIComponent(uid)}/savings/entries/${encodeURIComponent(entryId)}`, {
        method: 'DELETE',
      });
    } catch {
      // Ignore
    }

    try {
      await financeStore.ensureFirestoreSessionForUser(uid);
      await deleteDoc(doc(db, 'savings_entries', entryId));
    } catch {
      // Ignore
    }

    notify.notifySuccess('Riwayat Dihapus', 'Catatan progress tabungan telah dihapus.');
    return true;
  }

  // =========================================================================
  // Reminder Actions & Native Push Notification Integration
  // =========================================================================

  async function requestNotificationPermission(): Promise<boolean> {
    const notify = useNotificationStore();
    if (typeof window === 'undefined' || !('Notification' in window)) {
      notificationPermission.value = 'unsupported';
      notify.notifyError('Tidak Didukung', 'Browser atau perangkat Anda belum mendukung Notifikasi Push.');
      return false;
    }

    try {
      const result = await Notification.requestPermission();
      notificationPermission.value = result;
      if (result === 'granted') {
        await triggerNativePush(
          'Pengingat Tabungan Sisa Uang Aktif',
          'Anda akan menerima pengingat menabung sesuai jadwal tanggal & jam yang telah ditentukan.'
        );
        notify.notifySuccess(
          'Notifikasi Push Diaktifkan',
          'Pengingat jadwal tabungan via native push notification siap digunakan.'
        );
        return true;
      } else {
        notify.notifyWarning(
          'Izin Notifikasi Ditolak',
          'Aktifkan izin notifikasi di pengaturan browser agar pengingat push dapat muncul.'
        );
        return false;
      }
    } catch {
      return false;
    }
  }

  async function triggerNativePush(title: string, body: string, tag = 'sisauang-savings-reminder') {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    const options: NotificationOptions = {
      body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag,
      renotify: true,
      data: { url: '/utilities/savings' },
    } as NotificationOptions;

    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg && typeof reg.showNotification === 'function') {
          await reg.showNotification(title, options);
          return;
        }
      }
      const notif = new Notification(title, options);
      notif.onclick = () => {
        window.focus();
        notif.close();
      };
    } catch {
      // Ignore notification API errors
    }
  }

  async function snoozeReminder(goalId: string, durationMs: number, durationLabel: string): Promise<boolean> {
    const authStore = useAuthStore();
    const financeStore = useFinanceStore();
    const notify = useNotificationStore();
    const uid = sanitizeId(authStore.user?.uid || auth.currentUser?.uid || 'default');
    const goal = goals.value.find((g) => g.id === goalId);
    if (!goal || !uid) return false;

    const snoozedUntil = new Date(Date.now() + durationMs).toISOString();
    goal.snoozedUntil = snoozedUntil;
    writeLocalCache(uid, goals.value, entries.value, CACHE_TTL_MS);

    try {
      await fetch(`/api/users/${encodeURIComponent(uid)}/savings/goals/${encodeURIComponent(goalId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snoozedUntil }),
      });
    } catch {
      // Ignore
    }

    try {
      await financeStore.ensureFirestoreSessionForUser(uid);
      await setDoc(doc(db, 'savings_goals', goalId), { snoozedUntil, updatedAt: serverTimestamp() }, { merge: true });
    } catch {
      // Ignore
    }

    if (pendingReminder.value?.id === goalId) {
      dismissCurrentReminder();
    }
    notify.notifySuccess(
      'Pengingat Ditunda',
      `Pengingat menabung untuk "${goal.name}" ditunda selama ${durationLabel}.`
    );
    return true;
  }

  async function skipReminderToday(goalId: string): Promise<boolean> {
    const authStore = useAuthStore();
    const financeStore = useFinanceStore();
    const notify = useNotificationStore();
    const uid = sanitizeId(authStore.user?.uid || auth.currentUser?.uid || 'default');
    const goal = goals.value.find((g) => g.id === goalId);
    if (!goal || !uid) return false;

    const todayIso = getTodayIsoDate();
    goal.lastSkippedDate = todayIso;
    goal.snoozedUntil = null;
    writeLocalCache(uid, goals.value, entries.value, CACHE_TTL_MS);

    try {
      await fetch(`/api/users/${encodeURIComponent(uid)}/savings/goals/${encodeURIComponent(goalId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lastSkippedDate: todayIso, snoozedUntil: null }),
      });
    } catch {
      // Ignore
    }

    try {
      await financeStore.ensureFirestoreSessionForUser(uid);
      await setDoc(
        doc(db, 'savings_goals', goalId),
        { lastSkippedDate: todayIso, snoozedUntil: null, updatedAt: serverTimestamp() },
        { merge: true }
      );
    } catch {
      // Ignore
    }

    if (pendingReminder.value?.id === goalId) {
      dismissCurrentReminder();
    }
    notify.notifyInfo('Pengingat Dilewati', `Pengingat tabungan "${goal.name}" untuk hari ini dilewati.`);
    return true;
  }

  function dismissCurrentReminder() {
    pendingReminder.value = null;
    if (pendingQueue.value.length > 0) {
      pendingReminder.value = pendingQueue.value.shift() || null;
    }
  }

  async function checkAndTriggerReminders(): Promise<void> {
    const authStore = useAuthStore();
    if (!authStore.isAuthenticated || !authStore.user?.uid || authStore.isSuperAdmin) {
      return;
    }
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
      return;
    }
    if (isEvaluating.value) return;

    const uid = sanitizeId(authStore.user.uid);
    refreshNotificationPermission();

    isEvaluating.value = true;
    try {
      if (goals.value.length === 0) {
        const cached = readLocalCache(uid);
        if (cached.goals.length > 0) {
          goals.value = cached.goals;
          entries.value = cached.entries;
        }
      }

      if (activeGoals.value.length === 0) return;

      const wib = getWibDateTime();
      const localDay = new Date().getDate();
      const localHhMm = `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`;
      const localDateIso = getLocalTodayIsoDate();
      const nowMs = Date.now();

      for (const goal of activeGoals.value) {
        if (!goal.reminderEnabled || !goal.reminderDays || goal.reminderDays.length === 0) continue;

        const isScheduledToday =
          goal.reminderDays.includes(wib.dayOfMonth) || goal.reminderDays.includes(localDay);
        if (!isScheduledToday) continue;

        const targetTime = goal.reminderTime || '09:00';
        const isTimeReached = wib.timeHhMm >= targetTime || localHhMm >= targetTime;
        if (!isTimeReached) continue;

        if (goal.lastRemindedDate === wib.dateIso || goal.lastRemindedDate === localDateIso) continue;
        if (goal.lastSkippedDate === wib.dateIso || goal.lastSkippedDate === localDateIso) continue;

        if (goal.snoozedUntil) {
          const snoozeMs = new Date(goal.snoozedUntil).getTime();
          if (nowMs < snoozeMs) continue;
        }

        // Enqueue in-app banner reminder
        if (
          pendingReminder.value?.id !== goal.id &&
          !pendingQueue.value.some((q) => q.id === goal.id)
        ) {
          if (!pendingReminder.value) {
            pendingReminder.value = goal;
          } else {
            pendingQueue.value.push(goal);
          }
        }

        // Send Native Push Notification once per due schedule date
        if (
          notificationPermission.value === 'granted' &&
          goal.lastPushNotifiedDate !== wib.dateIso &&
          goal.lastPushNotifiedDate !== localDateIso
        ) {
          const collected = getGoalCollectedAmount(goal.id);
          const pct = Math.min(100, Math.round((collected / Math.max(1, goal.targetAmount)) * 100));
          const suggested = goal.reminderAmount
            ? ` Setoran rutin: Rp ${Number(goal.reminderAmount).toLocaleString('id-ID')}.`
            : '';

          await triggerNativePush(
            `Pengingat Tabungan: ${goal.name}`,
            `Progress saat ini ${pct}% (Rp ${collected.toLocaleString('id-ID')} / Rp ${goal.targetAmount.toLocaleString('id-ID')}).${suggested} Ketuk untuk catat progress hari ini.`,
            `sisauang-savings-${goal.id}-${wib.dateIso}`
          );

          goal.lastPushNotifiedDate = wib.dateIso;
          writeLocalCache(uid, goals.value, entries.value, CACHE_TTL_MS);

          void fetch(`/api/users/${encodeURIComponent(uid)}/savings/goals/${encodeURIComponent(goal.id)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lastPushNotifiedDate: wib.dateIso }),
          }).catch(() => {});
        }
      }
    } finally {
      isEvaluating.value = false;
    }
  }

  function requestOpenProgressModal(goalId: string, mode: 'deposit' | 'withdraw' = 'deposit') {
    progressModalRequest.value = { goalId, mode };
  }

  function clearProgressModalRequest() {
    progressModalRequest.value = null;
  }

  return {
    goals,
    entries,
    activeGoals,
    activeEntries,
    isLoading,
    isEvaluating,
    pendingReminder,
    pendingQueue,
    progressModalRequest,
    notificationPermission,
    totalSavingsBalance,
    totalOperationalBalance,
    totalTargetAmount,
    getGoalCollectedAmount,
    getGoalEntries,
    getGoalSourceBreakdown,
    getGoalHolderSavedAmount,
    getGoalWalletSavedAmount,
    getWalletSavingsBalance,
    getWalletOperationalBalance,
    getHolderSavingsBalance,
    getHolderOperationalBalance,
    getGoalsHoldingWallet,
    loadSavings,
    saveGoal,
    deleteGoal,
    recordProgress,
    deleteEntry,
    refreshNotificationPermission,
    requestNotificationPermission,
    triggerNativePush,
    snoozeReminder,
    skipReminderToday,
    dismissCurrentReminder,
    checkAndTriggerReminders,
    requestOpenProgressModal,
    clearProgressModalRequest,
  };
});
