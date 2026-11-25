import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import {
  auth,
  sanitizeId,
  sanitizeString,
  isFirestoreOfflineError,
  isFirestoreQuotaError,
} from '../firebase';
import { getUserAuthHeaders } from '../services/api';
import {
  fsGetDocs,
  fsSetDoc,
  fsDeleteDoc,
  fsServerTimestamp,
} from '../services/userFirestoreBridge';
import { useAuthStore } from './auth';
import { useFinanceStore, formatHolderName } from './finance';
import { useNotificationStore } from './notification';
import { getWibDateTime, getLocalTodayIsoDate, getTodayIsoDate } from './automation';
import {
  DEBT_TX_CATEGORIES,
  type DebtType,
  type DebtItem,
  type DebtEntryItem,
} from '../types/debt';

const CACHE_KEY_PREFIX = 'su_debts_cache_';
const DELETED_KEY_PREFIX = 'su_deleted_debts_';
const CACHE_TTL_MS = 5 * 60 * 1000;
export const MAX_FREE_DEBTS_PER_TYPE = 1;

interface DebtLocalCachePayload {
  debts: DebtItem[];
  entries: DebtEntryItem[];
  fetchedAt: number;
  expiresAt: number;
}

export interface DebtHolderBreakdown {
  walletId: string;
  walletName: string;
  fundOwnerId: string;
  fundOwnerName: string;
  amount: number;
}

export const useDebtsStore = defineStore('debts', () => {
  const debts = ref<DebtItem[]>([]);
  const entries = ref<DebtEntryItem[]>([]);
  const isLoading = ref<boolean>(false);
  const isEvaluating = ref<boolean>(false);

  // Reminder Banner Queue State
  const pendingReminder = ref<DebtItem | null>(null);
  const pendingQueue = ref<DebtItem[]>([]);

  // Modal Launch Trigger (used when clicking banner CTA from any route)
  const installmentModalRequest = ref<{
    debtId: string;
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
  // Core Computations
  // =========================================================================

  const activeDebts = computed(() => debts.value.filter((d) => !d.deleted));
  const activeDebtIdsSet = computed(() => new Set(activeDebts.value.map((d) => d.id)));
  const activeEntries = computed(() =>
    entries.value.filter((e) => !e.deleted && activeDebtIdsSet.value.has(e.debtId))
  );

  const debtItems = computed(() => activeDebts.value.filter((d) => d.type === 'debt'));
  const receivableItems = computed(() => activeDebts.value.filter((d) => d.type === 'receivable'));

  function getDebtPaidAmount(debtId: string): number {
    let total = 0;
    for (const entry of activeEntries.value) {
      if (entry.debtId !== debtId) continue;
      total += Math.max(0, Number(entry.amount) || 0);
    }
    return total;
  }

  function getDebtRemainingAmount(debt: DebtItem | string): number {
    const item = typeof debt === 'string' ? activeDebts.value.find((d) => d.id === debt) : debt;
    if (!item) return 0;
    const paid = getDebtPaidAmount(item.id);
    return Math.max(0, (Number(item.amount) || 0) - paid);
  }

  function isDebtSettled(debt: DebtItem): boolean {
    return getDebtRemainingAmount(debt) <= 0;
  }

  function getDebtEntries(debtId: string): DebtEntryItem[] {
    return activeEntries.value
      .filter((e) => e.debtId === debtId)
      .slice()
      .sort((a, b) => {
        const dCmp = String(b.date || '').localeCompare(String(a.date || ''));
        if (dCmp !== 0) return dCmp;
        const cCmp = String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
        if (cCmp !== 0) return cCmp;
        return String(b.id || '').localeCompare(String(a.id || ''));
      });
  }

  function getDebtSourceBreakdown(debtId: string): DebtHolderBreakdown[] {
    const financeStore = useFinanceStore();
    const holderMap = new Map<string, DebtHolderBreakdown>();

    for (const entry of activeEntries.value) {
      if (entry.debtId !== debtId) continue;
      const amt = Math.max(0, Number(entry.amount) || 0);
      if (amt <= 0) continue;

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
      existingHolder.amount += amt;
      holderMap.set(holderKey, existingHolder);
    }

    return Array.from(holderMap.values()).sort((a, b) => b.amount - a.amount);
  }

  const totalDebtPrincipal = computed(() =>
    debtItems.value.reduce((sum, d) => sum + Math.max(0, Number(d.amount) || 0), 0)
  );
  const totalDebtPaid = computed(() =>
    debtItems.value.reduce((sum, d) => sum + getDebtPaidAmount(d.id), 0)
  );
  const totalDebtRemaining = computed(() =>
    debtItems.value.reduce((sum, d) => sum + getDebtRemainingAmount(d), 0)
  );

  const totalReceivablePrincipal = computed(() =>
    receivableItems.value.reduce((sum, d) => sum + Math.max(0, Number(d.amount) || 0), 0)
  );
  const totalReceivableCollected = computed(() =>
    receivableItems.value.reduce((sum, d) => sum + getDebtPaidAmount(d.id), 0)
  );
  const totalReceivableRemaining = computed(() =>
    receivableItems.value.reduce((sum, d) => sum + getDebtRemainingAmount(d), 0)
  );

  // =========================================================================
  // Local Storage Cache & Tombstone Registry
  // =========================================================================

  function getDeletedIds(uid: string, kind: 'items' | 'entries'): Set<string> {
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

  function recordDeletedId(uid: string, kind: 'items' | 'entries', id: string) {
    if (typeof window === 'undefined' || !id) return;
    try {
      const deleted = getDeletedIds(uid, kind);
      deleted.add(id);
      localStorage.setItem(`${DELETED_KEY_PREFIX}${kind}_${uid}`, JSON.stringify(Array.from(deleted)));
    } catch {
      // Ignore
    }
  }

  function removeDeletedId(uid: string, kind: 'items' | 'entries', id: string) {
    if (typeof window === 'undefined' || !id) return;
    try {
      const deleted = getDeletedIds(uid, kind);
      deleted.delete(id);
      localStorage.setItem(`${DELETED_KEY_PREFIX}${kind}_${uid}`, JSON.stringify(Array.from(deleted)));
    } catch {
      // Ignore
    }
  }

  function readLocalCache(uid: string): DebtLocalCachePayload {
    const empty: DebtLocalCachePayload = { debts: [], entries: [], fetchedAt: 0, expiresAt: 0 };
    if (typeof window === 'undefined') return empty;
    try {
      const raw = localStorage.getItem(`${CACHE_KEY_PREFIX}${uid}`);
      if (!raw) return empty;
      const parsed = JSON.parse(raw) as DebtLocalCachePayload;
      if (!parsed || !Array.isArray(parsed.debts) || !Array.isArray(parsed.entries)) return empty;
      const delDebts = getDeletedIds(uid, 'items');
      const delEntries = getDeletedIds(uid, 'entries');
      return {
        debts: parsed.debts.filter((d) => !d.deleted && !delDebts.has(d.id)),
        entries: parsed.entries.filter((e) => !e.deleted && !delEntries.has(e.id) && !delDebts.has(e.debtId)),
        fetchedAt: Number(parsed.fetchedAt || 0),
        expiresAt: Number(parsed.expiresAt || 0),
      };
    } catch {
      return empty;
    }
  }

  function writeLocalCache(uid: string, debtList: DebtItem[], entryList: DebtEntryItem[], ttlMs = CACHE_TTL_MS) {
    if (typeof window === 'undefined') return;
    try {
      const now = Date.now();
      const delDebts = getDeletedIds(uid, 'items');
      const delEntries = getDeletedIds(uid, 'entries');
      const cleanDebts = debtList.filter((d) => !d.deleted && !delDebts.has(d.id));
      const cleanEntries = entryList.filter((e) => !e.deleted && !delEntries.has(e.id) && !delDebts.has(e.debtId));
      const cache: DebtLocalCachePayload = {
        debts: cleanDebts,
        entries: cleanEntries,
        fetchedAt: now,
        expiresAt: now + ttlMs,
      };
      localStorage.setItem(`${CACHE_KEY_PREFIX}${uid}`, JSON.stringify(cache));
    } catch {
      // Ignore
    }
  }

  async function syncAllToServer(uid: string, debtList: DebtItem[], entryList: DebtEntryItem[]) {
    try {
      await fetch(`/api/users/${encodeURIComponent(uid)}/debts/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getUserAuthHeaders() },
        body: JSON.stringify({ debts: debtList, entries: entryList }),
      });
    } catch {
      // Ignore background sync errors
    }
  }

  // =========================================================================
  // Load / Sync Debts Data
  // =========================================================================

  async function loadDebts(uidInput?: string, forceRefresh = false): Promise<void> {
    const authStore = useAuthStore();
    const financeStore = useFinanceStore();
    const uid = sanitizeId(uidInput || authStore.user?.uid || auth.currentUser?.uid || 'default');
    if (!uid || uid === 'guest') return;

    const delDebts = getDeletedIds(uid, 'items');
    const delEntries = getDeletedIds(uid, 'entries');

    if (!forceRefresh) {
      const cached = readLocalCache(uid);
      if (cached.expiresAt > 0 && Date.now() < cached.expiresAt && (cached.debts.length > 0 || cached.entries.length > 0)) {
        debts.value = cached.debts;
        entries.value = cached.entries;
        return;
      }
    }

    isLoading.value = true;
    try {
      await financeStore.ensureFirestoreSessionForUser(uid);

      let fsDebts: DebtItem[] = [];
      let fsEntries: DebtEntryItem[] = [];
      let fsSuccess = false;

      try {
        const [debtsSnap, entriesSnap] = await Promise.all([
          fsGetDocs('debts', { wheres: [{ field: 'ownerId', op: '==', value: uid }] }, uid, forceRefresh),
          fsGetDocs('debt_entries', { wheres: [{ field: 'ownerId', op: '==', value: uid }] }, uid, forceRefresh),
        ]);
        fsDebts = debtsSnap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<DebtItem, 'id'>) }))
          .filter((d) => !d.deleted && !delDebts.has(d.id));
        fsEntries = entriesSnap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<DebtEntryItem, 'id'>) }))
          .filter((e) => !e.deleted && !delEntries.has(e.id) && !delDebts.has(e.debtId));
        fsSuccess = true;
      } catch (err: any) {
        if (!isFirestoreOfflineError(err) && !isFirestoreQuotaError(err)) {
          console.warn('Firestore loadDebts notice:', err?.message || err);
        }
      }

      let serverDebts: DebtItem[] = [];
      let serverEntries: DebtEntryItem[] = [];
      try {
        const res = await fetch(`/api/users/${encodeURIComponent(uid)}/debts`, {
          headers: getUserAuthHeaders(),
        });
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.debts)) {
            serverDebts = data.debts.filter((d: any) => !d.deleted && !delDebts.has(d.id));
          }
          if (data && Array.isArray(data.entries)) {
            serverEntries = data.entries.filter(
              (e: any) => !e.deleted && !delEntries.has(e.id) && !delDebts.has(e.debtId)
            );
          }
        }
      } catch {
        // Ignore network errors
      }

      const cached = readLocalCache(uid);
      const debtMap = new Map<string, DebtItem>();
      const entryMap = new Map<string, DebtEntryItem>();

      if (fsSuccess && (fsDebts.length > 0 || serverDebts.length === 0)) {
        for (const d of fsDebts) debtMap.set(d.id, d);
        for (const e of fsEntries) entryMap.set(e.id, e);
      } else {
        for (const d of cached.debts) debtMap.set(d.id, d);
        for (const d of serverDebts) debtMap.set(d.id, d);
        for (const d of fsDebts) debtMap.set(d.id, d);

        for (const e of cached.entries) entryMap.set(e.id, e);
        for (const e of serverEntries) entryMap.set(e.id, e);
        for (const e of fsEntries) entryMap.set(e.id, e);
      }

      const mergedDebts = Array.from(debtMap.values())
        .filter((d) => !d.deleted && !delDebts.has(d.id))
        .sort((a, b) => {
          const dateCmp = String(b.date || '').localeCompare(String(a.date || ''));
          if (dateCmp !== 0) return dateCmp;
          return (a.description || '').localeCompare(b.description || '');
        });

      const mergedDebtIds = new Set(mergedDebts.map((d) => d.id));
      const mergedEntries = Array.from(entryMap.values())
        .filter((e) => !e.deleted && !delEntries.has(e.id) && mergedDebtIds.has(e.debtId))
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

      debts.value = mergedDebts;
      entries.value = mergedEntries;
      writeLocalCache(uid, mergedDebts, mergedEntries, CACHE_TTL_MS);

      if (mergedDebts.length > 0 || mergedEntries.length > 0) {
        void syncAllToServer(uid, mergedDebts, mergedEntries);
      }
    } catch (err: any) {
      console.warn('loadDebts fallback to local cache:', err?.message || err);
      const fallback = readLocalCache(uid);
      debts.value = fallback.debts;
      entries.value = fallback.entries;
    } finally {
      isLoading.value = false;
    }
  }

  // =========================================================================
  // Save / Delete Debt or Receivable (with Integrated Transaksi)
  // =========================================================================

  async function saveDebt(payload: {
    id?: string;
    type: DebtType;
    description: string;
    amount: number;
    walletId: string;
    fundOwnerId?: string;
    date: string;
    deadline?: string | null;
    note?: string;
    color?: string;
    reminderEnabled: boolean;
    reminderDays?: number[];
    reminderTime?: string;
    reminderAmount?: number | null;
  }): Promise<DebtItem | null> {
    const authStore = useAuthStore();
    const financeStore = useFinanceStore();
    const notify = useNotificationStore();
    const uid = sanitizeId(authStore.user?.uid || auth.currentUser?.uid || 'default');
    if (!uid) return null;

    const targetType: DebtType = payload.type === 'receivable' ? 'receivable' : 'debt';
    const id = payload.id ? sanitizeId(payload.id) : sanitizeId(`dbt_${Date.now()}`);
    const existing = payload.id ? debts.value.find((d) => d.id === id) : undefined;
    const isEdit = Boolean(payload.id && existing);

    // Free Tier Quota Guard: 1 active Hutang AND 1 active Piutang
    const needsQuotaCheck = !isEdit || (existing && existing.type !== targetType);
    if (needsQuotaCheck && !authStore.isProUser) {
      const countOfType =
        targetType === 'debt' ? debtItems.value.length : receivableItems.value.length;
      if (countOfType >= MAX_FREE_DEBTS_PER_TYPE) {
        notify.openProModal({
          featureTitle:
            targetType === 'debt'
              ? `Batas Maksimal ${MAX_FREE_DEBTS_PER_TYPE} Catatan Hutang`
              : `Batas Maksimal ${MAX_FREE_DEBTS_PER_TYPE} Catatan Piutang`,
          featureDescription: `Pengguna paket Free hanya dapat menambahkan maksimal ${MAX_FREE_DEBTS_PER_TYPE} catatan Hutang dan ${MAX_FREE_DEBTS_PER_TYPE} catatan Piutang aktif. Upgrade ke SisaUang Pro untuk mencatat Hutang & Piutang tanpa batas.`,
          limitSummary: `${countOfType} / ${MAX_FREE_DEBTS_PER_TYPE} ${targetType === 'debt' ? 'Hutang' : 'Piutang'} Aktif`,
        });
        return null;
      }
    }

    const numericAmount = Math.abs(Number(payload.amount) || 0);
    if (numericAmount <= 0) {
      notify.notifyError('Validasi Gagal', 'Nominal hutang/piutang harus lebih dari 0.');
      return null;
    }

    const wallet = financeStore.wallets.find((w) => w.id === payload.walletId) || financeStore.wallets[0];
    if (!wallet) {
      notify.notifyError('Validasi Gagal', 'Pilih Sumber Dana (Dompet) terlebih dahulu.');
      return null;
    }

    const holders = financeStore.getHoldersByWalletId(wallet.id);
    const holder =
      (payload.fundOwnerId ? holders.find((h) => h.id === payload.fundOwnerId) : holders[0]) || holders[0];
    const resolvedHolderId = holder?.id || 'default';
    const resolvedHolderName = holder?.holderName || 'Pribadi';

    const safeDescription = sanitizeString(
      payload.description,
      150,
      targetType === 'debt' ? 'Hutang Baru' : 'Piutang Baru'
    );
    const safeDate = sanitizeString(payload.date || getTodayIsoDate(), 30, getTodayIsoDate());
    const safeNote = sanitizeString(payload.note || '', 200, '');
    const safeDeadline = payload.deadline ? sanitizeString(payload.deadline, 30, '') : null;
    const safeColor = sanitizeString(
      payload.color || (targetType === 'receivable' ? 'emerald' : 'rose'),
      20,
      targetType === 'receivable' ? 'emerald' : 'rose'
    );
    const safeTime = sanitizeString(payload.reminderTime || '09:00', 10, '09:00');
    const cleanDays = Array.from(
      new Set(
        (payload.reminderDays && payload.reminderDays.length > 0 ? payload.reminderDays : [1])
          .map((d) => Math.floor(Number(d)))
          .filter((d) => d >= 1 && d <= 31)
      )
    ).sort((a, b) => a - b);

    // Sync Initial Linked Transaction with Transaksi Feature
    let relatedTransactionId: string | null = existing?.relatedTransactionId || null;
    const txType = targetType === 'debt' ? 'income' : 'expense';
    const txCategory =
      targetType === 'debt'
        ? DEBT_TX_CATEGORIES.debtCreate
        : DEBT_TX_CATEGORIES.receivableCreate;
    const txNote = safeNote ? `${safeDescription} — ${safeNote}` : safeDescription;

    try {
      if (!isEdit) {
        const createdTx = await financeStore.addTransaction({
          walletId: wallet.id,
          fundOwnerId: resolvedHolderId,
          type: txType,
          category: txCategory,
          amount: numericAmount,
          note: txNote,
          date: safeDate,
          silentToast: true,
        });
        relatedTransactionId = createdTx?.id || null;
      } else if (relatedTransactionId) {
        const linkedTx = financeStore.transactions.find((t) => t.id === relatedTransactionId);
        if (linkedTx) {
          await financeStore.updateTransaction(linkedTx.id, {
            walletId: wallet.id,
            fundOwnerId: resolvedHolderId,
            type: txType,
            category: txCategory,
            amount: numericAmount,
            note: txNote,
            date: safeDate,
            silentToast: true,
          });
        }
      }
    } catch (txErr: any) {
      notify.notifyError(
        'Gagal Menyinkronkan Transaksi',
        txErr?.message || 'Tidak dapat mencatat transaksi awal hutang/piutang.'
      );
      return null;
    }

    const debtItem: DebtItem = {
      id,
      ownerId: uid,
      type: targetType,
      description: safeDescription,
      amount: numericAmount,
      walletId: wallet.id,
      walletName: wallet.name,
      fundOwnerId: resolvedHolderId,
      fundOwnerName: resolvedHolderName,
      date: safeDate,
      deadline: safeDeadline || null,
      note: safeNote,
      color: safeColor,
      relatedTransactionId,
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

    removeDeletedId(uid, 'items', id);

    const idx = debts.value.findIndex((d) => d.id === id);
    if (idx >= 0) {
      debts.value[idx] = debtItem;
    } else {
      debts.value.unshift(debtItem);
    }
    debts.value.sort((a, b) => {
      const dCmp = String(b.date || '').localeCompare(String(a.date || ''));
      if (dCmp !== 0) return dCmp;
      return (a.description || '').localeCompare(b.description || '');
    });
    writeLocalCache(uid, debts.value, entries.value, CACHE_TTL_MS);

    // Server REST API sync
    try {
      await fetch(`/api/users/${encodeURIComponent(uid)}/debts/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getUserAuthHeaders() },
        body: JSON.stringify(debtItem),
      });
    } catch {
      // Ignore network errors
    }

    // Cloud Firestore sync
    try {
      await financeStore.ensureFirestoreSessionForUser(uid);
      const docData: Record<string, any> = {
        ownerId: uid,
        type: targetType,
        description: safeDescription,
        amount: numericAmount,
        walletId: wallet.id,
        walletName: wallet.name,
        fundOwnerId: resolvedHolderId,
        fundOwnerName: resolvedHolderName,
        date: safeDate,
        deadline: safeDeadline || null,
        note: safeNote,
        color: safeColor,
        relatedTransactionId: relatedTransactionId || null,
        reminderEnabled: Boolean(payload.reminderEnabled),
        reminderDays: debtItem.reminderDays,
        reminderTime: safeTime,
        reminderAmount: debtItem.reminderAmount || null,
        deleted: false,
        deletedAt: null,
        updatedAt: fsServerTimestamp(),
      };
      if (!isEdit) {
        docData.createdAt = fsServerTimestamp();
        docData.lastRemindedDate = null;
        docData.lastSkippedDate = null;
        docData.lastPushNotifiedDate = null;
        docData.snoozedUntil = null;
      }
      await fsSetDoc('debts', id, docData, { merge: true }, uid);
      await financeStore.bumpRemoteAndLocalSyncToken(uid);
    } catch (err: any) {
      console.warn('Firestore saveDebt notice:', err?.message || err);
    }

    const typeLabel = targetType === 'debt' ? 'Hutang' : 'Piutang';
    const txActionLabel = targetType === 'debt' ? 'Pemasukan (Penerimaan Hutang)' : 'Pengeluaran (Pemberian Utang)';
    notify.notifySuccess(
      isEdit ? `${typeLabel} Diperbarui` : `${typeLabel} Baru Dicatat`,
      isEdit
        ? `Catatan ${typeLabel.toLowerCase()} "${safeDescription}" berhasil diperbarui.`
        : `"${safeDescription}" (Rp ${numericAmount.toLocaleString('id-ID')}) disimpan & otomatis dicatat sebagai ${txActionLabel}.`
    );
    return debtItem;
  }

  async function deleteDebt(id: string): Promise<boolean> {
    const authStore = useAuthStore();
    const financeStore = useFinanceStore();
    const notify = useNotificationStore();
    const uid = sanitizeId(authStore.user?.uid || auth.currentUser?.uid || 'default');
    const targetDebt = debts.value.find((d) => d.id === id);
    if (!targetDebt || !uid) return false;

    const typeLabel = targetDebt.type === 'debt' ? 'Hutang' : 'Piutang';
    const relatedEntries = entries.value.filter((e) => e.debtId === id);

    const confirmed = await notify.requestConfirmation({
      title: `Hapus Catatan ${typeLabel}`,
      message: `Apakah Anda yakin ingin menghapus catatan ${typeLabel.toLowerCase()} "${targetDebt.description}"?`,
      detail:
        'Semua riwayat pelunasan dan transaksi terkait di menu Transaksi akan ikut diarsipkan & saldo dompet akan dikembalikan otomatis.',
      confirmLabel: `Ya, Hapus ${typeLabel}`,
      variant: 'danger',
    });
    if (!confirmed) return false;

    // Revert linked installment transactions + initial creation transaction cleanly
    for (const entry of relatedEntries) {
      if (entry.relatedTransactionId) {
        await financeStore
          .removeTransaction(entry.relatedTransactionId, { skipConfirmation: true, silentToast: true })
          .catch(() => false);
      }
    }
    if (targetDebt.relatedTransactionId) {
      await financeStore
        .removeTransaction(targetDebt.relatedTransactionId, { skipConfirmation: true, silentToast: true })
        .catch(() => false);
    }

    recordDeletedId(uid, 'items', id);
    for (const e of relatedEntries) {
      recordDeletedId(uid, 'entries', e.id);
    }

    debts.value = debts.value.filter((d) => d.id !== id);
    entries.value = entries.value.filter((e) => e.debtId !== id);
    writeLocalCache(uid, debts.value, entries.value, CACHE_TTL_MS);

    if (pendingReminder.value?.id === id) {
      dismissCurrentReminder();
    }
    pendingQueue.value = pendingQueue.value.filter((q) => q.id !== id);

    try {
      await fetch(`/api/users/${encodeURIComponent(uid)}/debts/items/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: getUserAuthHeaders(),
      });
    } catch {
      // Ignore
    }

    try {
      await financeStore.ensureFirestoreSessionForUser(uid);
      await fsDeleteDoc('debts', id, uid);
      for (const e of relatedEntries) {
        await fsDeleteDoc('debt_entries', e.id, uid).catch(() => {});
      }
      await financeStore.bumpRemoteAndLocalSyncToken(uid);
    } catch {
      // Ignore
    }

    notify.notifySuccess(
      `${typeLabel} Dihapus`,
      `Catatan ${typeLabel.toLowerCase()} "${targetDebt.description}" beserta transaksi terkait telah dihapus dan saldo dompet telah dikembalikan.`
    );
    return true;
  }

  // =========================================================================
  // Record Installment / Repayment ("Cicil" for Debt / "Terima" for Receivable)
  // =========================================================================

  async function recordInstallment(payload: {
    debtId: string;
    walletId: string;
    fundOwnerId?: string;
    amount: number;
    date: string;
    note: string;
    silentNotification?: boolean;
  }): Promise<DebtEntryItem | null> {
    const authStore = useAuthStore();
    const financeStore = useFinanceStore();
    const notify = useNotificationStore();
    const uid = sanitizeId(authStore.user?.uid || auth.currentUser?.uid || 'default');
    if (!uid) return null;

    const debt = activeDebts.value.find((d) => d.id === payload.debtId);
    if (!debt) {
      throw new Error('Catatan hutang/piutang tidak ditemukan.');
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
      throw new Error('Nominal pelunasan harus lebih dari 0.');
    }

    const remaining = getDebtRemainingAmount(debt);
    if (numericAmount > remaining && remaining > 0) {
      throw new Error(
        `Nominal melebihi sisa ${debt.type === 'debt' ? 'hutang' : 'piutang'} (Rp ${remaining.toLocaleString('id-ID')}).`
      );
    }

    const safeDate = sanitizeString(payload.date || getTodayIsoDate(), 30, getTodayIsoDate());
    const defaultNote =
      debt.type === 'debt'
        ? `Cicilan hutang: ${debt.description}`
        : `Penerimaan piutang: ${debt.description}`;
    const safeNote = sanitizeString(payload.note, 200, defaultNote);

    // Record integrated Transaksi item automatically
    const txType = debt.type === 'debt' ? 'expense' : 'income';
    const txCategory =
      debt.type === 'debt'
        ? DEBT_TX_CATEGORIES.debtPay
        : DEBT_TX_CATEGORIES.receivableReceive;

    const createdTx = await financeStore.addTransaction({
      walletId: wallet.id,
      fundOwnerId: resolvedHolderId,
      type: txType,
      category: txCategory,
      amount: numericAmount,
      note: safeNote,
      date: safeDate,
      silentToast: true,
    });

    const entryId = sanitizeId(`dbt_ent_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
    const entryItem: DebtEntryItem = {
      id: entryId,
      ownerId: uid,
      debtId: debt.id,
      debtDescription: debt.description,
      debtType: debt.type,
      walletId: wallet.id,
      walletName: wallet.name,
      fundOwnerId: resolvedHolderId,
      fundOwnerName: resolvedHolderName,
      amount: numericAmount,
      date: safeDate,
      note: safeNote,
      relatedTransactionId: createdTx?.id || null,
      deleted: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    entries.value.unshift(entryItem);
    entries.value.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

    const todayIso = getTodayIsoDate();
    debt.lastRemindedDate = todayIso;
    debt.snoozedUntil = null;
    if (pendingReminder.value?.id === debt.id) {
      dismissCurrentReminder();
    }
    pendingQueue.value = pendingQueue.value.filter((q) => q.id !== debt.id);

    writeLocalCache(uid, debts.value, entries.value, CACHE_TTL_MS);

    try {
      await fetch(`/api/users/${encodeURIComponent(uid)}/debts/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getUserAuthHeaders() },
        body: JSON.stringify(entryItem),
      });
      await fetch(`/api/users/${encodeURIComponent(uid)}/debts/items/${encodeURIComponent(debt.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getUserAuthHeaders() },
        body: JSON.stringify({ lastRemindedDate: debt.lastRemindedDate, snoozedUntil: null }),
      });
    } catch {
      // Ignore network errors
    }

    try {
      await financeStore.ensureFirestoreSessionForUser(uid);
      await fsSetDoc(
        'debt_entries',
        entryId,
        {
          ownerId: uid,
          debtId: debt.id,
          debtDescription: debt.description,
          debtType: debt.type,
          walletId: wallet.id,
          walletName: wallet.name,
          fundOwnerId: resolvedHolderId,
          fundOwnerName: resolvedHolderName,
          amount: numericAmount,
          date: safeDate,
          note: safeNote,
          relatedTransactionId: createdTx?.id || null,
          deleted: false,
          deletedAt: null,
          createdAt: fsServerTimestamp(),
          updatedAt: fsServerTimestamp(),
        },
        undefined,
        uid
      );
      await fsSetDoc(
        'debts',
        debt.id,
        {
          lastRemindedDate: debt.lastRemindedDate,
          snoozedUntil: null,
          updatedAt: fsServerTimestamp(),
        },
        { merge: true },
        uid
      );
      await financeStore.bumpRemoteAndLocalSyncToken(uid);
    } catch (err: any) {
      console.warn('Firestore recordInstallment notice:', err?.message || err);
    }

    if (!payload.silentNotification) {
      const amtStr = `Rp ${numericAmount.toLocaleString('id-ID')}`;
      if (debt.type === 'debt') {
        notify.notifySuccess(
          'Cicilan Hutang Tercatat',
          `Pembayaran ${amtStr} dari ${wallet.name} (${formatHolderName(resolvedHolderName)}) dicatat & otomatis masuk ke Transaksi (${txCategory}).`
        );
      } else {
        notify.notifySuccess(
          'Penerimaan Piutang Tercatat',
          `Penerimaan ${amtStr} ke ${wallet.name} (${formatHolderName(resolvedHolderName)}) dicatat & otomatis masuk ke Transaksi (${txCategory}).`
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

    const actionWord = target.debtType === 'receivable' ? 'penerimaan piutang' : 'cicilan hutang';
    const confirmed = await notify.requestConfirmation({
      title: 'Hapus Riwayat Pelunasan',
      message: `Hapus catatan ${actionWord} sebesar Rp ${Number(target.amount).toLocaleString('id-ID')}?`,
      detail:
        'Transaksi terkait di menu Transaksi akan ikut dihapus (soft delete) dan saldo dompet dikembalikan secara otomatis.',
      confirmLabel: 'Ya, Hapus Catatan',
      variant: 'danger',
    });
    if (!confirmed) return false;

    if (target.relatedTransactionId) {
      await financeStore
        .removeTransaction(target.relatedTransactionId, { skipConfirmation: true, silentToast: true })
        .catch(() => false);
    }

    recordDeletedId(uid, 'entries', entryId);
    entries.value = entries.value.filter((e) => e.id !== entryId);
    writeLocalCache(uid, debts.value, entries.value, CACHE_TTL_MS);

    try {
      await fetch(`/api/users/${encodeURIComponent(uid)}/debts/entries/${encodeURIComponent(entryId)}`, {
        method: 'DELETE',
        headers: getUserAuthHeaders(),
      });
    } catch {
      // Ignore
    }

    try {
      await financeStore.ensureFirestoreSessionForUser(uid);
      await fsDeleteDoc('debt_entries', entryId, uid);
      await financeStore.bumpRemoteAndLocalSyncToken(uid);
    } catch {
      // Ignore
    }

    notify.notifySuccess(
      'Riwayat Dihapus',
      'Catatan pelunasan dan transaksi terkait telah dihapus.'
    );
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
          'Pengingat Hutang & Piutang Sisa Uang Aktif',
          'Anda akan menerima notifikasi push sesuai jadwal tanggal & jam pengingat cicilan atau tagihan.'
        );
        notify.notifySuccess(
          'Notifikasi Push Diaktifkan',
          'Pengingat jadwal Hutang & Piutang via native push notification siap digunakan.'
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

  async function triggerNativePush(
    title: string,
    body: string,
    tag = 'sisauang-debt-reminder',
    targetUrl = '/utilities/debts'
  ) {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    const options: NotificationOptions = {
      body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag,
      renotify: true,
      data: { url: targetUrl },
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

  async function snoozeReminder(debtId: string, durationMs: number, durationLabel: string): Promise<boolean> {
    const authStore = useAuthStore();
    const financeStore = useFinanceStore();
    const notify = useNotificationStore();
    const uid = sanitizeId(authStore.user?.uid || auth.currentUser?.uid || 'default');
    const debt = debts.value.find((d) => d.id === debtId);
    if (!debt || !uid) return false;

    const snoozedUntil = new Date(Date.now() + durationMs).toISOString();
    debt.snoozedUntil = snoozedUntil;
    writeLocalCache(uid, debts.value, entries.value, CACHE_TTL_MS);

    try {
      await fetch(`/api/users/${encodeURIComponent(uid)}/debts/items/${encodeURIComponent(debtId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getUserAuthHeaders() },
        body: JSON.stringify({ snoozedUntil }),
      });
    } catch {
      // Ignore
    }

    try {
      await financeStore.ensureFirestoreSessionForUser(uid);
      await fsSetDoc('debts', debtId, { snoozedUntil, updatedAt: fsServerTimestamp() }, { merge: true }, uid);
    } catch {
      // Ignore
    }

    if (pendingReminder.value?.id === debtId) {
      dismissCurrentReminder();
    }
    const label = debt.type === 'debt' ? 'cicilan hutang' : 'penagihan piutang';
    notify.notifySuccess(
      'Pengingat Ditunda',
      `Pengingat ${label} "${debt.description}" ditunda selama ${durationLabel}.`
    );
    return true;
  }

  async function skipReminderToday(debtId: string): Promise<boolean> {
    const authStore = useAuthStore();
    const financeStore = useFinanceStore();
    const notify = useNotificationStore();
    const uid = sanitizeId(authStore.user?.uid || auth.currentUser?.uid || 'default');
    const debt = debts.value.find((d) => d.id === debtId);
    if (!debt || !uid) return false;

    const todayIso = getTodayIsoDate();
    debt.lastSkippedDate = todayIso;
    debt.snoozedUntil = null;
    writeLocalCache(uid, debts.value, entries.value, CACHE_TTL_MS);

    try {
      await fetch(`/api/users/${encodeURIComponent(uid)}/debts/items/${encodeURIComponent(debtId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getUserAuthHeaders() },
        body: JSON.stringify({ lastSkippedDate: todayIso, snoozedUntil: null }),
      });
    } catch {
      // Ignore
    }

    try {
      await financeStore.ensureFirestoreSessionForUser(uid);
      await fsSetDoc(
        'debts',
        debtId,
        { lastSkippedDate: todayIso, snoozedUntil: null, updatedAt: fsServerTimestamp() },
        { merge: true },
        uid
      );
    } catch {
      // Ignore
    }

    if (pendingReminder.value?.id === debtId) {
      dismissCurrentReminder();
    }
    notify.notifyInfo('Pengingat Dilewati', `Pengingat "${debt.description}" untuk hari ini dilewati.`);
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
      if (debts.value.length === 0) {
        const cached = readLocalCache(uid);
        if (cached.debts.length > 0) {
          debts.value = cached.debts;
          entries.value = cached.entries;
        }
      }

      if (activeDebts.value.length === 0) return;

      const wib = getWibDateTime();
      const localDay = new Date().getDate();
      const localHhMm = `${String(new Date().getHours()).padStart(2, '0')}:${String(new Date().getMinutes()).padStart(2, '0')}`;
      const localDateIso = getLocalTodayIsoDate();
      const nowMs = Date.now();

      for (const debt of activeDebts.value) {
        if (isDebtSettled(debt)) continue;
        if (!debt.reminderEnabled || !debt.reminderDays || debt.reminderDays.length === 0) continue;

        const isScheduledToday =
          debt.reminderDays.includes(wib.dayOfMonth) || debt.reminderDays.includes(localDay);
        if (!isScheduledToday) continue;

        const targetTime = debt.reminderTime || '09:00';
        const isTimeReached = wib.timeHhMm >= targetTime || localHhMm >= targetTime;
        if (!isTimeReached) continue;

        if (debt.lastRemindedDate === wib.dateIso || debt.lastRemindedDate === localDateIso) continue;
        if (debt.lastSkippedDate === wib.dateIso || debt.lastSkippedDate === localDateIso) continue;

        if (debt.snoozedUntil) {
          const snoozeMs = new Date(debt.snoozedUntil).getTime();
          if (nowMs < snoozeMs) continue;
        }

        if (
          pendingReminder.value?.id !== debt.id &&
          !pendingQueue.value.some((q) => q.id === debt.id)
        ) {
          if (!pendingReminder.value) {
            pendingReminder.value = debt;
          } else {
            pendingQueue.value.push(debt);
          }
        }

        if (
          notificationPermission.value === 'granted' &&
          debt.lastPushNotifiedDate !== wib.dateIso &&
          debt.lastPushNotifiedDate !== localDateIso
        ) {
          const remaining = getDebtRemainingAmount(debt);
          const suggested = debt.reminderAmount
            ? ` Saran cicilan: Rp ${Number(debt.reminderAmount).toLocaleString('id-ID')}.`
            : '';
          const titlePrefix = debt.type === 'debt' ? 'Pengingat Cicilan Hutang' : 'Pengingat Penagihan Piutang';
          const actionHint = debt.type === 'debt' ? 'catat cicilan' : 'catat penerimaan';

          await triggerNativePush(
            `${titlePrefix}: ${debt.description}`,
            `Sisa ${debt.type === 'debt' ? 'hutang' : 'piutang'}: Rp ${remaining.toLocaleString('id-ID')}.${suggested} Ketuk untuk ${actionHint} hari ini.`,
            `sisauang-debt-${debt.id}-${wib.dateIso}`,
            `/utilities/debts/${debt.id}`
          );

          debt.lastPushNotifiedDate = wib.dateIso;
          writeLocalCache(uid, debts.value, entries.value, CACHE_TTL_MS);

          void fetch(`/api/users/${encodeURIComponent(uid)}/debts/items/${encodeURIComponent(debt.id)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...getUserAuthHeaders() },
            body: JSON.stringify({ lastPushNotifiedDate: wib.dateIso }),
          }).catch(() => {});
        }
      }
    } finally {
      isEvaluating.value = false;
    }
  }

  function requestOpenInstallmentModal(debtId: string) {
    installmentModalRequest.value = { debtId };
  }

  function clearInstallmentModalRequest() {
    installmentModalRequest.value = null;
  }

  function resetState() {
    debts.value = [];
    entries.value = [];
    pendingReminder.value = null;
    pendingQueue.value = [];
    installmentModalRequest.value = null;
  }

  return {
    debts,
    entries,
    activeDebts,
    activeEntries,
    debtItems,
    receivableItems,
    isLoading,
    isEvaluating,
    pendingReminder,
    pendingQueue,
    installmentModalRequest,
    notificationPermission,
    totalDebtPrincipal,
    totalDebtPaid,
    totalDebtRemaining,
    totalReceivablePrincipal,
    totalReceivableCollected,
    totalReceivableRemaining,
    getDebtPaidAmount,
    getDebtRemainingAmount,
    isDebtSettled,
    getDebtEntries,
    getDebtSourceBreakdown,
    loadDebts,
    saveDebt,
    deleteDebt,
    recordInstallment,
    deleteEntry,
    refreshNotificationPermission,
    requestNotificationPermission,
    triggerNativePush,
    snoozeReminder,
    skipReminderToday,
    dismissCurrentReminder,
    checkAndTriggerReminders,
    requestOpenInstallmentModal,
    clearInstallmentModalRequest,
    resetState,
  };
});
