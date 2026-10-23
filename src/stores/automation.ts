import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db, sanitizeId, sanitizeString } from '../firebase';
import { useAuthStore } from './auth';
import { useFinanceStore } from './finance';
import { useNotificationStore } from './notification';
import type { AutomationItem, AutomationsCacheData } from '../types/automation';

const CACHE_KEY_PREFIX = 'su_automations_cache_';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes TTL to save Firestore read quota

function isSuperAdminUser(email?: string | null): boolean {
  const cleanEmail = String(email || '').trim().toLowerCase();
  return cleanEmail === 'vuedevo@gmail.com';
}

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

  // =========================================================================
  // Local Storage 5-Minute Cache Management (Firestore Quota Saver)
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
      localStorage.setItem(getCacheKey(uid), JSON.stringify(cacheData));
    } catch {
      // Ignore quota write errors
    }
  }

  function clearLocalStorageCache(uid: string) {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(getCacheKey(uid));
    } catch {
      // Ignore
    }
  }

  // =========================================================================
  // Fetch / Load Automations
  // =========================================================================

  async function loadAutomations(uidInput?: string, forceRefresh = false): Promise<AutomationItem[]> {
    const authStore = useAuthStore();
    const currentEmail = auth.currentUser?.email || authStore.user?.email;
    if (isSuperAdminUser(currentEmail)) {
      rules.value = [];
      return [];
    }

    const uid = sanitizeId(uidInput || authStore.user?.uid || auth.currentUser?.uid || '');
    if (!uid) {
      rules.value = [];
      return [];
    }

    // 1. Check local storage cache if still valid within 5-minute TTL
    if (!forceRefresh) {
      const cached = readLocalStorageCache(uid);
      if (Date.now() < cached.expiresAt) {
        rules.value = cached.rules;
        return cached.rules;
      }
    }

    // 2. Cache is expired or force refresh requested -> fetch from Firestore
    isLoading.value = true;
    try {
      const q = query(collection(db, 'automations'), where('ownerId', '==', uid));
      const snap = await getDocs(q);
      const loaded: AutomationItem[] = snap.docs
        .map((d) => ({
          id: d.id,
          ...(d.data() as Omit<AutomationItem, 'id'>),
        }))
        .filter((item) => !item.deleted);

      // Sort by creation date desc or name
      loaded.sort((a, b) => a.name.localeCompare(b.name));

      rules.value = loaded;
      // Save to localStorage with fresh 5-minute TTL
      writeLocalStorageCache(uid, loaded, CACHE_TTL_MS);
      return loaded;
    } catch (err: any) {
      console.warn('Firestore automations load notice, using local cache:', err?.message || err);
      // On network/quota/permission error, gracefully fall back to whatever is currently in local storage cache
      const fallback = readLocalStorageCache(uid);
      rules.value = fallback.rules;
      writeLocalStorageCache(uid, fallback.rules, CACHE_TTL_MS);
      return fallback.rules;
    } finally {
      isLoading.value = false;
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
    const notify = useNotificationStore();
    const uid = sanitizeId(authStore.user?.uid || '');
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

    const docData: Record<string, any> = {
      ownerId: uid,
      name: safeName,
      type: payload.type,
      walletId: payload.walletId,
      walletName: payload.walletName,
      category: safeCategory,
      amount: numericAmount,
      adminFee: payload.type === 'transfer' ? numericAdminFee : 0,
      note: safeNote,
      scheduleDays: cleanDays,
      executionTime: safeExecutionTime,
      mode: payload.mode,
      isActive: payload.isActive !== undefined ? payload.isActive : true,
      updatedAt: serverTimestamp(),
    };

    if (payload.fundOwnerId) docData.fundOwnerId = payload.fundOwnerId;
    if (payload.fundOwnerName) docData.fundOwnerName = payload.fundOwnerName;

    if (payload.type === 'transfer') {
      if (payload.toWalletId) docData.toWalletId = payload.toWalletId;
      if (payload.toWalletName) docData.toWalletName = payload.toWalletName;
      if (payload.toFundOwnerId) docData.toFundOwnerId = payload.toFundOwnerId;
      if (payload.toFundOwnerName) docData.toFundOwnerName = payload.toFundOwnerName;
    }

    if (!isEdit) {
      docData.createdAt = serverTimestamp();
      docData.lastExecutedDate = null;
      docData.lastCancelledDate = null;
      docData.snoozedUntil = null;
      docData.deleted = false;
    }

    try {
      if (isEdit) {
        await updateDoc(doc(db, 'automations', id), docData);
      } else {
        await setDoc(doc(db, 'automations', id), docData);
      }
    } catch (err: any) {
      console.warn('Firestore saveAutomation notice, persisting locally:', err?.message || err);
    }

    // Update in memory and local storage cache immediately
    const updatedItem: AutomationItem = {
      id,
      ownerId: uid,
      name: safeName,
      type: payload.type,
      walletId: payload.walletId,
      walletName: payload.walletName,
      fundOwnerId: payload.fundOwnerId,
      fundOwnerName: payload.fundOwnerName,
      toWalletId: payload.toWalletId,
      toWalletName: payload.toWalletName,
      toFundOwnerId: payload.toFundOwnerId,
      toFundOwnerName: payload.toFundOwnerName,
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

    const idx = rules.value.findIndex((r) => r.id === id);
    if (idx >= 0) {
      rules.value[idx] = updatedItem;
    } else {
      rules.value.push(updatedItem);
    }
    rules.value.sort((a, b) => a.name.localeCompare(b.name));

    // Update local cache
    writeLocalStorageCache(uid, rules.value, CACHE_TTL_MS);

    notify.notifySuccess(
      isEdit ? 'Jadwal Otomatisasi Diperbarui' : 'Jadwal Otomatisasi Ditambahkan',
      `Otomatisasi "${safeName}" berhasil disimpan.`
    );
    return true;
  }

  // =========================================================================
  // Delete Automation
  // =========================================================================

  async function deleteAutomation(id: string): Promise<boolean> {
    const authStore = useAuthStore();
    const notify = useNotificationStore();
    const uid = sanitizeId(authStore.user?.uid || '');
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

    try {
      await updateDoc(doc(db, 'automations', id), {
        deleted: true,
        deletedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch {
      // Fallback: deleteDoc directly
      try {
        await deleteDoc(doc(db, 'automations', id));
      } catch (err: any) {
        console.warn('Firestore deleteAutomation notice, updating locally:', err?.message || err);
      }
    }

    rules.value = rules.value.filter((r) => r.id !== id);
    writeLocalStorageCache(uid, rules.value, CACHE_TTL_MS);

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
    const notify = useNotificationStore();
    const uid = sanitizeId(authStore.user?.uid || '');
    const rule = rules.value.find((r) => r.id === id);
    if (!rule || !uid) return false;

    const nextState = activeState !== undefined ? activeState : !rule.isActive;
    try {
      await updateDoc(doc(db, 'automations', id), {
        isActive: nextState,
        updatedAt: serverTimestamp(),
      });
    } catch (err: any) {
      console.warn('Firestore toggleActive notice, updating locally:', err?.message || err);
    }
    rule.isActive = nextState;
    writeLocalStorageCache(uid, rules.value, CACHE_TTL_MS);
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
    const uid = sanitizeId(authStore.user?.uid || '');
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

      // Update lastExecutedDate in Firestore & local cache
      const updatePayload: Record<string, any> = {
        lastExecutedDate: todayIso,
        snoozedUntil: null,
        updatedAt: serverTimestamp(),
      };
      try {
        await updateDoc(doc(db, 'automations', rule.id), updatePayload);
      } catch (err: any) {
        console.warn('Firestore executeTransaction notice, updating locally:', err?.message || err);
      }

      // Update in memory rule
      rule.lastExecutedDate = todayIso;
      rule.snoozedUntil = undefined;
      writeLocalStorageCache(uid, rules.value, CACHE_TTL_MS);

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
    const notify = useNotificationStore();
    const uid = sanitizeId(authStore.user?.uid || '');
    const rule = rules.value.find((r) => r.id === ruleId);
    if (!rule || !uid) return false;

    const snoozedUntil = new Date(Date.now() + durationMs).toISOString();

    try {
      try {
        await updateDoc(doc(db, 'automations', ruleId), {
          snoozedUntil,
          updatedAt: serverTimestamp(),
        });
      } catch (err: any) {
        console.warn('Firestore snoozeRule notice, updating locally:', err?.message || err);
      }
      rule.snoozedUntil = snoozedUntil;
      writeLocalStorageCache(uid, rules.value, CACHE_TTL_MS);

      if (pendingConfirmation.value?.id === ruleId) {
        dismissCurrentConfirmation();
      }

      notify.notifySuccess(
        'Pencatatan Ditunda',
        `Pencatatan otomatis "${rule.name}" ditunda selama ${durationLabel}.`
      );
      return true;
    } catch (err: any) {
      notify.notifyError('Gagal Menunda Jadwal', err?.message || err);
      return false;
    }
  }

  // =========================================================================
  // Cancel Rule For Today
  // =========================================================================

  async function cancelRuleForToday(ruleId: string): Promise<boolean> {
    const authStore = useAuthStore();
    const notify = useNotificationStore();
    const uid = sanitizeId(authStore.user?.uid || '');
    const rule = rules.value.find((r) => r.id === ruleId);
    if (!rule || !uid) return false;

    const todayIso = getTodayIsoDate();
    try {
      try {
        await updateDoc(doc(db, 'automations', ruleId), {
          lastCancelledDate: todayIso,
          snoozedUntil: null,
          updatedAt: serverTimestamp(),
        });
      } catch (err: any) {
        console.warn('Firestore cancelRuleForToday notice, updating locally:', err?.message || err);
      }
      rule.lastCancelledDate = todayIso;
      rule.snoozedUntil = undefined;
      writeLocalStorageCache(uid, rules.value, CACHE_TTL_MS);

      if (pendingConfirmation.value?.id === ruleId) {
        dismissCurrentConfirmation();
      }

      notify.notifySuccess(
        'Pencatatan Dibatalkan',
        `Pencatatan otomatis "${rule.name}" untuk hari ini telah dibatalkan.`
      );
      return true;
    } catch (err: any) {
      notify.notifyError('Gagal Membatalkan Pencatatan', err?.message || err);
      return false;
    }
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
    const currentEmail = auth.currentUser?.email || authStore.user?.email;
    if (isSuperAdminUser(currentEmail)) {
      return;
    }
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
        // Cache expired or missing -> fetch from Firestore & refresh 5-min TTL
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
