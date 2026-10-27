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
  onSnapshot,
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
import { useFinanceStore } from './finance';
import { useNotificationStore } from './notification';
import type { AutomationItem, AutomationsCacheData } from '../types/automation';

const CACHE_KEY_PREFIX = 'su_automations_cache_';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes TTL to save Firestore read quota

function getTodayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getCurrentTimeHhMm(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export const useAutomationStore = defineStore('automation', () => {
  const rules = ref<AutomationItem[]>([]);
  const isLoading = ref<boolean>(false);
  const isEvaluating = ref<boolean>(false);

  // Active confirmation banner state for "Dengan Konfirmasi"
  const pendingConfirmation = ref<AutomationItem | null>(null);
  const pendingQueue = ref<AutomationItem[]>([]);

  const activeRules = computed(() => rules.value.filter((r) => r.isActive && !r.deleted));
  const hasActiveRules = computed(() => activeRules.value.length > 0);

  let automationsUnsubscribe: (() => void) | null = null;

  // =========================================================================
  // Local Storage Cache Management (With Multi-Key Fallback Discovery)
  // =========================================================================

  function getCacheKey(uid: string): string {
    return `${CACHE_KEY_PREFIX}${uid}`;
  }

  function readLocalStorageCache(uid: string): AutomationsCacheData {
    const emptyCache: AutomationsCacheData = {
      rules: [],
      fetchedAt: 0,
      expiresAt: 0,
      hasRules: false,
    };
    if (typeof window === 'undefined') return emptyCache;
    try {
      const raw = localStorage.getItem(getCacheKey(uid));
      if (!raw) return emptyCache;
      const parsed = JSON.parse(raw) as AutomationsCacheData;
      if (!parsed || typeof parsed.expiresAt !== 'number' || !Array.isArray(parsed.rules)) {
        return emptyCache;
      }
      return parsed;
    } catch {
      return emptyCache;
    }
  }

  function writeLocalStorageCache(uid: string, items: AutomationItem[], ttlMs = CACHE_TTL_MS) {
    if (typeof window === 'undefined') return;
    try {
      const now = Date.now();
      const validItems = items.filter((i) => !i.deleted);
      const cacheData: AutomationsCacheData = {
        rules: validItems,
        fetchedAt: now,
        expiresAt: now + ttlMs,
        hasRules: validItems.length > 0,
      };
      const serialized = JSON.stringify(cacheData);
      localStorage.setItem(getCacheKey(uid), serialized);

      // Also mirror to auth.currentUser UID key if available to ensure cross-lookup succeeds
      const altUid = sanitizeId(auth.currentUser?.uid || '');
      if (altUid && altUid !== uid) {
        localStorage.setItem(getCacheKey(altUid), serialized);
      }
    } catch {
      // Ignore quota write errors
    }
  }

  function clearLocalStorageCache(uid: string) {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(getCacheKey(uid));
      const altUid = sanitizeId(auth.currentUser?.uid || '');
      if (altUid) {
        localStorage.removeItem(getCacheKey(altUid));
      }
    } catch {
      // Ignore
    }
  }

  // =========================================================================
  // Server API Background Sync Helper
  // =========================================================================

  async function syncAllToServer(uid: string, items: AutomationItem[]) {
    try {
      await fetch(`/api/users/${encodeURIComponent(uid)}/automations/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules: items }),
      });
    } catch {
      // Ignore background server sync error
    }
  }

  // =========================================================================
  // Real-Time Cloud Firestore Sync (Live across multiple devices & tabs)
  // =========================================================================

  function subscribeToAutomations(_uidInput?: string) {
    // Disabled onSnapshot to protect Firestore read quota from persistent real-time listeners
  }

  function unsubscribeFromAutomations() {
    if (automationsUnsubscribe) {
      automationsUnsubscribe();
      automationsUnsubscribe = null;
    }
  }

  // =========================================================================
  // Fetch / Load Automations
  // =========================================================================

  async function loadAutomations(uidInput?: string, forceRefresh = false): Promise<AutomationItem[]> {
    const authStore = useAuthStore();
    const uid = sanitizeId(uidInput || authStore.user?.uid || auth.currentUser?.uid || 'default');
    if (!uid || uid === 'guest') {
      return rules.value;
    }

    // 1. If not forcing refresh, check local storage cache if still valid within TTL
    if (!forceRefresh) {
      const cached = readLocalStorageCache(uid);
      if (cached.rules.length > 0 && Date.now() < cached.expiresAt) {
        rules.value = cached.rules;
        return cached.rules;
      }
    }

    return await fetchAndSyncAutomations(uid);
  }

  async function fetchAndSyncAutomations(uid: string): Promise<AutomationItem[]> {
    const financeStore = useFinanceStore();
    isLoading.value = true;
    try {
      // 1. Ensure authenticated Firebase session so Firestore rules permit query
      await financeStore.ensureFirestoreSessionForUser(uid);

      // 2. Read from Cloud Firestore (primary authoritative cloud source of truth)
      let firestoreRules: AutomationItem[] = [];
      let firestoreFetchSuccess = false;
      try {
        const q = query(collection(db, 'automations'), where('ownerId', '==', uid));
        const snap = await getDocs(q);
        firestoreRules = snap.docs
          .map((d) => ({
            id: d.id,
            ...(d.data() as Omit<AutomationItem, 'id'>),
          }))
          .filter((item) => !item.deleted);
        firestoreFetchSuccess = true;
      } catch (err: any) {
        if (!isFirestoreOfflineError(err) && !isFirestoreQuotaError(err)) {
          console.warn('Firestore loadAutomations notice:', err?.message || err);
        }
      }

      // 3. Fallback: persistent Server REST API (/api/users/:uid/automations)
      let serverRules: AutomationItem[] = [];
      try {
        const res = await fetch(`/api/users/${encodeURIComponent(uid)}/automations`);
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.rules)) {
            serverRules = data.rules.filter((r: any) => !r.deleted);
          }
        }
      } catch {
        // Ignore server network errors
      }

      // 4. Merge results: prefer Cloud Firestore, then Server API, then existing Local Cache
      const cached = readLocalStorageCache(uid);
      const combinedMap = new Map<string, AutomationItem>();

      // Base: local cache
      for (const item of cached.rules) {
        if (!item.deleted) combinedMap.set(item.id, item);
      }
      // Layer: server API
      for (const item of serverRules) {
        if (!item.deleted) combinedMap.set(item.id, item);
      }
      // Top: Cloud Firestore
      if (firestoreFetchSuccess) {
        for (const item of firestoreRules) {
          if (!item.deleted) combinedMap.set(item.id, item);
        }
        // If there were local items not yet in Firestore, push them up to Firestore
        for (const item of cached.rules) {
          if (!item.deleted && !firestoreRules.some((f) => f.id === item.id)) {
            void pushAutomationDocToFirestore(item);
          }
        }
      }

      const merged = Array.from(combinedMap.values()).sort((a, b) =>
        (a.name || '').localeCompare(b.name || '')
      );

      rules.value = merged;
      writeLocalStorageCache(uid, merged, CACHE_TTL_MS);

      // Keep server cache in sync with merged rules
      if (merged.length > 0) {
        void syncAllToServer(uid, merged);
      }

      return merged;
    } catch (err: any) {
      console.warn('Load automations notice, using local cache fallback:', err?.message || err);
      const fallback = readLocalStorageCache(uid);
      rules.value = fallback.rules;
      return fallback.rules;
    } finally {
      isLoading.value = false;
    }
  }

  async function pushAutomationDocToFirestore(item: AutomationItem) {
    try {
      const docData: Record<string, any> = {
        ownerId: item.ownerId,
        name: item.name,
        type: item.type,
        walletId: item.walletId,
        walletName: item.walletName,
        fundOwnerId: item.fundOwnerId || null,
        fundOwnerName: item.fundOwnerName || null,
        toWalletId: item.toWalletId || null,
        toWalletName: item.toWalletName || null,
        toFundOwnerId: item.toFundOwnerId || null,
        toFundOwnerName: item.toFundOwnerName || null,
        category: item.category,
        amount: item.amount,
        adminFee: item.adminFee || 0,
        note: item.note || '',
        scheduleDays: item.scheduleDays,
        executionTime: item.executionTime,
        mode: item.mode,
        isActive: item.isActive,
        lastExecutedDate: item.lastExecutedDate || null,
        lastCancelledDate: item.lastCancelledDate || null,
        snoozedUntil: item.snoozedUntil || null,
        deleted: false,
        deletedAt: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(doc(db, 'automations', item.id), docData, { merge: true });
    } catch {
      // Ignore background push error
    }
  }

  // =========================================================================
  // Save Automation (Create / Update)
  // =========================================================================

  async function saveAutomation(
    payload: {
      id?: string;
      name: string;
      type: 'income' | 'expense' | 'transfer';
      walletId: string;
      walletName: string;
      fundOwnerId?: string;
      fundOwnerName?: string;
      toWalletId?: string;
      toWalletName?: string;
      toFundOwnerId?: string;
      toFundOwnerName?: string;
      category: string;
      amount: number;
      adminFee?: number;
      note?: string;
      scheduleDays: number[];
      executionTime: string;
      mode: 'with_confirmation' | 'without_confirmation';
      isActive?: boolean;
    }
  ): Promise<boolean> {
    const authStore = useAuthStore();
    const financeStore = useFinanceStore();
    const notify = useNotificationStore();
    const uid = sanitizeId(authStore.user?.uid || auth.currentUser?.uid || 'default');
    if (!uid) return false;

    const id = payload.id ? sanitizeId(payload.id) : sanitizeId(`auto_${Date.now()}`);
    const safeName = sanitizeString(payload.name, 100, 'Catat Otomatis');
    const safeCategory = sanitizeString(payload.category, 50, 'Lainnya');
    const safeNote = sanitizeString(payload.note || '', 200, '');
    const safeExecutionTime = sanitizeString(payload.executionTime || '09:00', 5, '09:00');
    const numericAmount = Math.abs(Number(payload.amount) || 0);
    const numericAdminFee = Math.max(0, Math.abs(Number(payload.adminFee) || 0));

    if (numericAmount <= 0) {
      notify.notifyError('Validasi Gagal', 'Nominal transaksi harus lebih dari 0.');
      return false;
    }

    if (!payload.scheduleDays || payload.scheduleDays.length === 0) {
      notify.notifyError('Validasi Gagal', 'Pilih minimal satu tanggal jadwal pelaksanaan setiap bulan.');
      return false;
    }

    // Clean schedule days: unique integers sorted 1..31
    const cleanDays = Array.from(
      new Set(
        payload.scheduleDays
          .map((d) => Math.floor(Number(d)))
          .filter((d) => d >= 1 && d <= 31)
      )
    ).sort((a, b) => a - b);

    if (cleanDays.length === 0) {
      notify.notifyError('Validasi Gagal', 'Pilih tanggal yang valid antara 1 hingga 31.');
      return false;
    }

    const isEdit = Boolean(payload.id);
    const existingRule = isEdit ? rules.value.find((r) => r.id === id) : undefined;

    const updatedItem: AutomationItem = {
      id,
      ownerId: uid,
      name: safeName,
      type: payload.type,
      walletId: payload.walletId,
      walletName: payload.walletName,
      fundOwnerId: payload.fundOwnerId || undefined,
      fundOwnerName: payload.fundOwnerName || undefined,
      toWalletId: payload.type === 'transfer' ? (payload.toWalletId || undefined) : undefined,
      toWalletName: payload.type === 'transfer' ? (payload.toWalletName || undefined) : undefined,
      toFundOwnerId: payload.type === 'transfer' ? (payload.toFundOwnerId || undefined) : undefined,
      toFundOwnerName: payload.type === 'transfer' ? (payload.toFundOwnerName || undefined) : undefined,
      category: safeCategory,
      amount: numericAmount,
      adminFee: payload.type === 'transfer' ? numericAdminFee : 0,
      note: safeNote,
      scheduleDays: cleanDays,
      executionTime: safeExecutionTime,
      mode: payload.mode,
      isActive: payload.isActive !== undefined ? payload.isActive : true,
      lastExecutedDate: existingRule?.lastExecutedDate,
      lastCancelledDate: existingRule?.lastCancelledDate,
      snoozedUntil: existingRule?.snoozedUntil,
      deleted: false,
    };

    // 1. Immediately update Pinia reactive memory
    const idx = rules.value.findIndex((r) => r.id === id);
    if (idx >= 0) {
      rules.value[idx] = updatedItem;
    } else {
      rules.value.push(updatedItem);
    }
    rules.value.sort((a, b) => a.name.localeCompare(b.name));

    // 2. Immediately persist to localStorage cache
    writeLocalStorageCache(uid, rules.value, CACHE_TTL_MS);

    // 3. Immediately persist to server REST API endpoint
    try {
      await fetch(`/api/users/${encodeURIComponent(uid)}/automations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedItem),
      });
    } catch {
      // Ignore network errors
    }

    // 4. Authoritatively sync directly into Cloud Firestore ("sisa-uang")
    try {
      await financeStore.ensureFirestoreSessionForUser(uid);

      const docData: Record<string, any> = {
        ownerId: uid,
        name: safeName,
        type: payload.type,
        walletId: payload.walletId,
        walletName: payload.walletName,
        fundOwnerId: payload.fundOwnerId || null,
        fundOwnerName: payload.fundOwnerName || null,
        toWalletId: payload.type === 'transfer' ? (payload.toWalletId || null) : null,
        toWalletName: payload.type === 'transfer' ? (payload.toWalletName || null) : null,
        toFundOwnerId: payload.type === 'transfer' ? (payload.toFundOwnerId || null) : null,
        toFundOwnerName: payload.type === 'transfer' ? (payload.toFundOwnerName || null) : null,
        category: safeCategory,
        amount: numericAmount,
        adminFee: payload.type === 'transfer' ? numericAdminFee : 0,
        note: safeNote,
        scheduleDays: cleanDays,
        executionTime: safeExecutionTime,
        mode: payload.mode,
        isActive: payload.isActive !== undefined ? payload.isActive : true,
        deleted: false,
        deletedAt: null,
        updatedAt: serverTimestamp(),
      };

      if (!isEdit) {
        docData.createdAt = serverTimestamp();
        docData.lastExecutedDate = null;
        docData.lastCancelledDate = null;
        docData.snoozedUntil = null;
      }

      await setDoc(doc(db, 'automations', id), docData, { merge: true });
    } catch (err: any) {
      console.warn('Firestore saveAutomation notice:', err?.message || err);
      if (isFirestoreQuotaError(err)) {
        notify.notifyQuotaExceeded();
      }
    }

    notify.notifySuccess(
      isEdit ? 'Jadwal Otomatisasi Diperbarui' : 'Jadwal Otomatisasi Ditambahkan',
      `Otomatisasi "${safeName}" berhasil disimpan ke Cloud Firestore.`
    );
    return true;
  }

  // =========================================================================
  // Delete Automation
  // =========================================================================

  async function deleteAutomation(id: string): Promise<boolean> {
    const authStore = useAuthStore();
    const financeStore = useFinanceStore();
    const notify = useNotificationStore();
    const uid = sanitizeId(authStore.user?.uid || auth.currentUser?.uid || 'default');
    const rule = rules.value.find((r) => r.id === id);
    if (!rule || !uid) return false;

    const confirmed = await notify.requestConfirmation({
      title: 'Hapus Jadwal Otomatisasi',
      message: `Apakah Anda yakin ingin menghapus jadwal otomatisasi "${rule.name}"?`,
      detail: 'Jadwal ini tidak akan lagi mencatat transaksi secara otomatis di masa mendatang.',
      confirmLabel: 'Ya, Hapus Jadwal',
      variant: 'danger',
    });
    if (!confirmed) return false;

    // 1. Immediately update Pinia memory
    rules.value = rules.value.filter((r) => r.id !== id);

    // 2. Immediately update local storage cache
    writeLocalStorageCache(uid, rules.value, CACHE_TTL_MS);

    // 3. Immediately delete from Server API
    try {
      await fetch(`/api/users/${encodeURIComponent(uid)}/automations/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
    } catch {
      // Ignore
    }

    // 4. Delete / soft-delete from Cloud Firestore
    try {
      await financeStore.ensureFirestoreSessionForUser(uid);
      await setDoc(
        doc(db, 'automations', id),
        {
          deleted: true,
          deletedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch {
      try {
        await deleteDoc(doc(db, 'automations', id));
      } catch (err: any) {
        console.warn('Firestore delete doc notice:', err?.message || err);
      }
    }

    notify.notifySuccess(
      'Jadwal Otomatisasi Dihapus',
      `Jadwal "${rule.name}" telah dihapus.`
    );
    return true;
  }

  // =========================================================================
  // Toggle Active / Inactive
  // =========================================================================

  async function toggleActive(id: string, activeState?: boolean): Promise<boolean> {
    const authStore = useAuthStore();
    const financeStore = useFinanceStore();
    const notify = useNotificationStore();
    const uid = sanitizeId(authStore.user?.uid || auth.currentUser?.uid || 'default');
    const rule = rules.value.find((r) => r.id === id);
    if (!rule || !uid) return false;

    const nextState = activeState !== undefined ? activeState : !rule.isActive;
    rule.isActive = nextState;
    writeLocalStorageCache(uid, rules.value, CACHE_TTL_MS);

    // Server API sync
    try {
      await fetch(`/api/users/${encodeURIComponent(uid)}/automations/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: nextState }),
      });
    } catch {
      // Ignore
    }

    // Cloud Firestore sync
    try {
      await financeStore.ensureFirestoreSessionForUser(uid);
      await setDoc(
        doc(db, 'automations', id),
        {
          isActive: nextState,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (err: any) {
      console.warn('Firestore toggleActive notice:', err?.message || err);
    }

    notify.notifySuccess(
      nextState ? 'Otomatisasi Diaktifkan' : 'Otomatisasi Dinonaktifkan',
      `Jadwal "${rule.name}" kini ${nextState ? 'aktif dan akan berjalan sesuai jadwal' : 'dinonaktifkan sementara'}.`
    );
    return true;
  }

  // =========================================================================
  // Execute Transaction for Rule (Now / Early / Automatic)
  // =========================================================================

  async function executeTransaction(
    rule: AutomationItem,
    options?: { isManualEarly?: boolean }
  ): Promise<boolean> {
    const authStore = useAuthStore();
    const financeStore = useFinanceStore();
    const notify = useNotificationStore();
    const uid = sanitizeId(authStore.user?.uid || auth.currentUser?.uid || 'default');
    if (!uid) return false;

    const todayIso = getTodayIsoDate();
    const isManualEarly = Boolean(options?.isManualEarly);

    let defaultNote = rule.note;
    if (!defaultNote) {
      defaultNote = isManualEarly
        ? `${rule.name} (Dicatat Lebih Cepat)`
        : `${rule.name} (Catat Otomatis)`;
    }

    try {
      await financeStore.addTransaction({
        walletId: rule.walletId,
        fundOwnerId: rule.fundOwnerId,
        toWalletId: rule.toWalletId,
        toFundOwnerId: rule.toFundOwnerId,
        type: rule.type,
        category: rule.category,
        amount: rule.amount,
        adminFee: rule.adminFee || 0,
        note: defaultNote,
        date: todayIso,
      });

      // Update in memory rule
      rule.lastExecutedDate = todayIso;
      rule.snoozedUntil = undefined;
      writeLocalStorageCache(uid, rules.value, CACHE_TTL_MS);

      // Server API sync
      try {
        await fetch(`/api/users/${encodeURIComponent(uid)}/automations/${encodeURIComponent(rule.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lastExecutedDate: todayIso, snoozedUntil: null }),
        });
      } catch {
        // Ignore
      }

      // Cloud Firestore sync
      try {
        await financeStore.ensureFirestoreSessionForUser(uid);
        await setDoc(
          doc(db, 'automations', rule.id),
          {
            lastExecutedDate: todayIso,
            snoozedUntil: null,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch (err: any) {
        console.warn('Firestore executeTransaction notice:', err?.message || err);
      }

      // Dismiss confirmation banner if it matches current rule
      if (pendingConfirmation.value?.id === rule.id) {
        dismissCurrentConfirmation();
      }

      const formattedAmount = `Rp ${Number(rule.amount || 0).toLocaleString('id-ID')}`;
      if (isManualEarly) {
        notify.notifySuccess(
          'Transaksi Dicatat Lebih Cepat',
          `Transaksi "${rule.name}" sebesar ${formattedAmount} berhasil dicatat hari ini.`
        );
      } else if (rule.mode === 'without_confirmation') {
        notify.notifySuccess(
          'Transaksi Otomatis Dicatat',
          `Transaksi "${rule.name}" (${formattedAmount}) telah dicatat secara otomatis.`
        );
      } else {
        notify.notifySuccess(
          'Transaksi Berhasil Dicatat',
          `Transaksi otomatis "${rule.name}" (${formattedAmount}) berhasil dicatat.`
        );
      }
      return true;
    } catch (err: any) {
      notify.notifyError('Gagal Mencatat Transaksi Otomatis', err?.message || err);
      return false;
    }
  }

  // =========================================================================
  // Snooze Rule (1-5 Jam, Besok s/d 5 Hari)
  // =========================================================================

  async function snoozeRule(ruleId: string, durationMs: number, durationLabel: string): Promise<boolean> {
    const authStore = useAuthStore();
    const financeStore = useFinanceStore();
    const notify = useNotificationStore();
    const uid = sanitizeId(authStore.user?.uid || auth.currentUser?.uid || 'default');
    const rule = rules.value.find((r) => r.id === ruleId);
    if (!rule || !uid) return false;

    const snoozedUntil = new Date(Date.now() + durationMs).toISOString();
    rule.snoozedUntil = snoozedUntil;
    writeLocalStorageCache(uid, rules.value, CACHE_TTL_MS);

    // Server API sync
    try {
      await fetch(`/api/users/${encodeURIComponent(uid)}/automations/${encodeURIComponent(ruleId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snoozedUntil }),
      });
    } catch {
      // Ignore
    }

    // Cloud Firestore sync
    try {
      await financeStore.ensureFirestoreSessionForUser(uid);
      await setDoc(
        doc(db, 'automations', ruleId),
        {
          snoozedUntil,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (err: any) {
      console.warn('Firestore snoozeRule notice:', err?.message || err);
    }

    if (pendingConfirmation.value?.id === ruleId) {
      dismissCurrentConfirmation();
    }

    notify.notifySuccess(
      'Pencatatan Ditunda',
      `Pencatatan otomatis "${rule.name}" ditunda selama ${durationLabel}.`
    );
    return true;
  }

  // =========================================================================
  // Cancel Rule For Today
  // =========================================================================

  async function cancelRuleForToday(ruleId: string): Promise<boolean> {
    const authStore = useAuthStore();
    const financeStore = useFinanceStore();
    const notify = useNotificationStore();
    const uid = sanitizeId(authStore.user?.uid || auth.currentUser?.uid || 'default');
    const rule = rules.value.find((r) => r.id === ruleId);
    if (!rule || !uid) return false;

    const todayIso = getTodayIsoDate();
    rule.lastCancelledDate = todayIso;
    rule.snoozedUntil = undefined;
    writeLocalStorageCache(uid, rules.value, CACHE_TTL_MS);

    // Server API sync
    try {
      await fetch(`/api/users/${encodeURIComponent(uid)}/automations/${encodeURIComponent(ruleId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lastCancelledDate: todayIso, snoozedUntil: null }),
      });
    } catch {
      // Ignore
    }

    // Cloud Firestore sync
    try {
      await financeStore.ensureFirestoreSessionForUser(uid);
      await setDoc(
        doc(db, 'automations', ruleId),
        {
          lastCancelledDate: todayIso,
          snoozedUntil: null,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (err: any) {
      console.warn('Firestore cancelRuleForToday notice:', err?.message || err);
    }

    if (pendingConfirmation.value?.id === ruleId) {
      dismissCurrentConfirmation();
    }

    notify.notifySuccess(
      'Pencatatan Dibatalkan',
      `Pencatatan otomatis "${rule.name}" untuk hari ini telah dibatalkan.`
    );
    return true;
  }

  // =========================================================================
  // Banner Confirmation Queue Navigation
  // =========================================================================

  function dismissCurrentConfirmation() {
    pendingConfirmation.value = null;
    if (pendingQueue.value.length > 0) {
      pendingConfirmation.value = pendingQueue.value.shift() || null;
    }
  }

  // =========================================================================
  // Activity Check Trigger (Called on route change, data change, app focus)
  // Evaluates schedules. Respects the 5-minute quota cache strictly!
  // =========================================================================

  async function checkAndTriggerOnActivity(): Promise<void> {
    const authStore = useAuthStore();
    if (!authStore.isAuthenticated || !authStore.user?.uid) {
      return;
    }
    if (isEvaluating.value) return;

    const uid = sanitizeId(authStore.user.uid);

    // Fast-path quota check: inspect local storage cache
    const cached = readLocalStorageCache(uid);
    const nowMs = Date.now();

    // If cache exists, is not expired, AND hasRules is FALSE:
    // User has no automations, bail out immediately! 0 Firestore reads, 0 overhead!
    if (cached && nowMs < cached.expiresAt && !cached.hasRules) {
      return;
    }

    isEvaluating.value = true;
    try {
      let currentRules: AutomationItem[] = [];

      if (cached && nowMs < cached.expiresAt) {
        currentRules = cached.rules;
        rules.value = cached.rules;
      } else {
        // Cache expired or missing -> fetch fresh rules
        currentRules = await loadAutomations(uid, true);
      }

      if (!currentRules || currentRules.length === 0) {
        return;
      }

      const todayDate = new Date();
      const currentDay = todayDate.getDate(); // 1..31
      const todayIso = getTodayIsoDate();
      const currentHhMm = getCurrentTimeHhMm();

      const dueWithConfirmation: AutomationItem[] = [];

      for (const rule of currentRules) {
        if (!rule.isActive || rule.deleted) continue;

        // Check if today matches any scheduled day
        if (!rule.scheduleDays.includes(currentDay)) continue;

        // Check if current time has reached the scheduled execution time
        if (currentHhMm < rule.executionTime) continue;

        // Check if already executed today
        if (rule.lastExecutedDate === todayIso) continue;

        // Check if already cancelled today
        if (rule.lastCancelledDate === todayIso) continue;

        // Check if currently snoozed
        if (rule.snoozedUntil) {
          const snoozeMs = new Date(rule.snoozedUntil).getTime();
          if (nowMs < snoozeMs) {
            // Still in snooze duration, skip
            continue;
          }
        }

        // Rule is DUE!
        if (rule.mode === 'without_confirmation') {
          // Immediately record transaction automatically!
          await executeTransaction(rule, { isManualEarly: false });
        } else if (rule.mode === 'with_confirmation') {
          dueWithConfirmation.push(rule);
        }
      }

      // If any rules require confirmation:
      if (dueWithConfirmation.length > 0) {
        for (const item of dueWithConfirmation) {
          if (
            pendingConfirmation.value?.id !== item.id &&
            !pendingQueue.value.some((q) => q.id === item.id)
          ) {
            if (!pendingConfirmation.value) {
              pendingConfirmation.value = item;
            } else {
              pendingQueue.value.push(item);
            }
          }
        }
      }
    } catch (evalErr) {
      console.warn('Notice during automation evaluation:', evalErr);
    } finally {
      isEvaluating.value = false;
    }
  }

  return {
    rules,
    isLoading,
    isEvaluating,
    pendingConfirmation,
    pendingQueue,
    activeRules,
    hasActiveRules,
    subscribeToAutomations,
    unsubscribeFromAutomations,
    loadAutomations,
    saveAutomation,
    deleteAutomation,
    toggleActive,
    executeTransaction,
    snoozeRule,
    cancelRuleForToday,
    dismissCurrentConfirmation,
    checkAndTriggerOnActivity,
  };
});
