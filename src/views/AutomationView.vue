<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Clock,
  Plus,
  Play,
  Pencil,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Wallet,
  Tags,
  SlidersHorizontal,
  Sparkles,
  ArrowRight,
  Check,
  ChevronDown,
  Info,
  RefreshCw,
  BellRing,
  Zap,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
} from 'lucide-vue-next';
import { useAuthStore } from '../stores/auth';
import { useFinanceStore, formatHolderName } from '../stores/finance';
import { useThemeStore } from '../stores/theme';
import { useNotificationStore } from '../stores/notification';
import { useAutomationStore } from '../stores/automation';
import AppModal from '../components/AppModal.vue';
import CustomSelect, { type SelectOptionItem } from '../components/CustomSelect.vue';
import type { AutomationItem } from '../types/automation';

const { t } = useI18n();
const authStore = useAuthStore();
const financeStore = useFinanceStore();
const themeStore = useThemeStore();
const notificationStore = useNotificationStore();
const automationStore = useAutomationStore();

// Modal & Form State (Matching QuickTransactionModal)
const modalOpen = ref(false);
const editingId = ref<string | null>(null);

const txType = ref<'expense' | 'income' | 'transfer'>('expense');
const walletId = ref<string>('');
const fundOwnerId = ref<string>('');
const toWalletId = ref<string>('');
const toFundOwnerId = ref<string>('');
const amount = ref<number | ''>('');
const adminFee = ref<number | ''>('');
const category = ref<string>('');
const note = ref<string>('');
const errorMsg = ref<string | null>(null);

// Schedule configuration (Replacing transaction date)
const scheduleTypeMode = ref<'single' | 'multiple'>('single');
const formSingleDay = ref<number>(25);
const formSelectedDays = ref<number[]>([25]);
const formExecutionTime = ref('09:00');
const formMode = ref<'with_confirmation' | 'without_confirmation'>('with_confirmation');
const formIsActive = ref(true);

const isSaving = ref(false);
const filterTab = ref<'all' | 'with_confirmation' | 'without_confirmation' | 'active'>('all');

const isRefreshing = ref(false);

async function ensureDataReady(force = false) {
  const uid = authStore.user?.uid;
  if (!uid) return;

  const tasks: Promise<any>[] = [];
  if (financeStore.wallets.length === 0) {
    tasks.push(financeStore.initFinanceData(uid));
  }
  tasks.push(automationStore.loadAutomations(uid, force));
  if (tasks.length > 0) {
    await Promise.all(tasks);
  }
  automationStore.subscribeToAutomations(uid);
}

async function handleManualRefresh() {
  const uid = authStore.user?.uid;
  if (!uid || isRefreshing.value) return;
  isRefreshing.value = true;
  try {
    await ensureDataReady(true);
    notificationStore.notifySuccess(
      'Jadwal Disegarkan',
      'Daftar jadwal transaksi otomatis berhasil diperbarui dari Cloud Firestore.'
    );
  } catch (err: any) {
    notificationStore.notifyError('Gagal Menyegarkan Jadwal', err?.message || err);
  } finally {
    isRefreshing.value = false;
  }
}

onMounted(async () => {
  await ensureDataReady(false);
});

onUnmounted(() => {
  automationStore.unsubscribeFromAutomations();
});

watch(
  () => authStore.user?.uid,
  async (uid) => {
    if (uid) {
      await ensureDataReady(false);
    }
  },
  { immediate: true }
);

// Format currency display input (Matching QuickTransactionModal)
function formatNominalDisplay(val: number | string | ''): string {
  const digits = String(val ?? '')
    .replace(/\D/g, '')
    .replace(/^0+/, '');
  if (!digits) return '';
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

const amountDisplay = computed(() => formatNominalDisplay(amount.value));
const adminFeeDisplay = computed(() => formatNominalDisplay(adminFee.value));

function applyFormattedNominalInput(event: Event, targetRef: { value: number | '' }) {
  const input = event.target as HTMLInputElement;
  const rawValue = input.value;
  const selectionStart = input.selectionStart ?? rawValue.length;
  const digitsBeforeCursor = rawValue
    .slice(0, selectionStart)
    .replace(/\D/g, '')
    .replace(/^0+/, '').length;

  const cleanDigits = rawValue.replace(/\D/g, '').replace(/^0+/, '');
  targetRef.value = cleanDigits ? Number(cleanDigits) : '';

  const formatted = formatNominalDisplay(cleanDigits);
  input.value = formatted;

  if (document.activeElement === input) {
    let newCursorPos = 0;
    if (digitsBeforeCursor > 0) {
      let seenDigits = 0;
      for (let i = 0; i < formatted.length; i++) {
        if (/\d/.test(formatted[i])) {
          seenDigits++;
          if (seenDigits === digitsBeforeCursor) {
            newCursorPos = i + 1;
            break;
          }
        }
      }
    }
    input.setSelectionRange(newCursorPos, newCursorPos);
  }
}

function handleAmountInput(event: Event) {
  applyFormattedNominalInput(event, amount);
}

function handleAdminFeeInput(event: Event) {
  applyFormattedNominalInput(event, adminFee);
}

// Categories & Options (Matching QuickTransactionModal)
const categories = computed(() => {
  const base =
    txType.value === 'expense'
      ? financeStore.expenseCategoryNames
      : financeStore.incomeCategoryNames;
  if (category.value && !base.includes(category.value) && txType.value !== 'transfer') {
    return [category.value, ...base];
  }
  return base;
});

const categoryOptions = computed<SelectOptionItem[]>(() =>
  categories.value.map((cat) => ({
    value: cat,
    label: cat,
  }))
);

const walletOptions = computed<SelectOptionItem[]>(() =>
  financeStore.wallets
    .filter((w) => !w.deleted)
    .map((w) => ({
      value: w.id,
      label: w.name,
      sublabel: `(${themeStore.formatMoney(w.balance)})`,
    }))
);

const availableSourceHolders = computed(() =>
  walletId.value ? financeStore.getHoldersByWalletId(walletId.value) : []
);

const sourceHolderOptions = computed<SelectOptionItem[]>(() =>
  availableSourceHolders.value.map((holder) => ({
    value: holder.id,
    label: formatHolderName(holder.holderName),
    sublabel: `(${themeStore.formatMoney(holder.balance)})`,
  }))
);

const availableDestHolders = computed(() =>
  toWalletId.value ? financeStore.getHoldersByWalletId(toWalletId.value) : []
);

const destHolderOptions = computed<SelectOptionItem[]>(() =>
  availableDestHolders.value.map((holder) => ({
    value: holder.id,
    label: formatHolderName(holder.holderName),
    sublabel: `(${themeStore.formatMoney(holder.balance)})`,
  }))
);

const singleDayOptions = computed<SelectOptionItem[]>(() =>
  Array.from({ length: 31 }, (_, i) => ({
    value: String(i + 1),
    label: `Setiap Tanggal ${i + 1}`,
  }))
);

const singleDaySelectStr = computed({
  get: () => String(formSingleDay.value),
  set: (val: string) => {
    formSingleDay.value = Number(val) || 1;
  },
});

// Watchers for dynamic holders and category (Matching QuickTransactionModal)
watch(walletId, (newWalletId) => {
  if (!modalOpen.value) return;
  if (!newWalletId) {
    fundOwnerId.value = '';
    return;
  }
  const holders = financeStore.getHoldersByWalletId(newWalletId);
  fundOwnerId.value = holders[0]?.id || '';
});

watch(toWalletId, (newToWalletId) => {
  if (!modalOpen.value) return;
  if (!newToWalletId) {
    toFundOwnerId.value = '';
    return;
  }
  const holders = financeStore.getHoldersByWalletId(newToWalletId);
  toFundOwnerId.value = holders[0]?.id || '';
});

watch(txType, () => {
  if (!modalOpen.value) return;
  if (
    category.value &&
    !categories.value.includes(category.value) &&
    txType.value !== 'transfer'
  ) {
    category.value = '';
  }
});

// Filtered automations
const filteredRules = computed(() => {
  const all = automationStore.rules;
  if (filterTab.value === 'active') {
    return all.filter((r) => r.isActive && !r.deleted);
  }
  if (filterTab.value === 'with_confirmation') {
    return all.filter((r) => r.mode === 'with_confirmation' && !r.deleted);
  }
  if (filterTab.value === 'without_confirmation') {
    return all.filter((r) => r.mode === 'without_confirmation' && !r.deleted);
  }
  return all.filter((r) => !r.deleted);
});

// Auto-select initial wallet and destination wallet when wallets finish hydrating
watch(
  () => financeStore.wallets,
  (newWallets) => {
    if (!modalOpen.value) return;
    const active = newWallets.filter((w) => !w.deleted);
    if (!walletId.value && active.length > 0) {
      walletId.value = active[0].id;
      const holders = financeStore.getHoldersByWalletId(active[0].id);
      fundOwnerId.value = holders[0]?.id || '';
    }
    if (!toWalletId.value && active.length > 0) {
      toWalletId.value = active[1]?.id || active[0]?.id || '';
      const destHolders = financeStore.getHoldersByWalletId(toWalletId.value);
      toFundOwnerId.value = destHolders[0]?.id || '';
    }
  },
  { deep: true }
);

// Modal Actions
async function openAddModal() {
  editingId.value = null;
  errorMsg.value = null;
  txType.value = 'expense';

  if (financeStore.wallets.length === 0 && authStore.user?.uid) {
    await financeStore.initFinanceData(authStore.user.uid);
  }

  const activeWallets = financeStore.wallets.filter((w) => !w.deleted);
  walletId.value = activeWallets[0]?.id || '';
  fundOwnerId.value = availableSourceHolders.value[0]?.id || '';
  toWalletId.value = activeWallets[1]?.id || activeWallets[0]?.id || '';
  toFundOwnerId.value = availableDestHolders.value[0]?.id || '';
  amount.value = '';
  adminFee.value = '';
  category.value = '';
  note.value = '';
  scheduleTypeMode.value = 'single';
  formSingleDay.value = 25;
  formSelectedDays.value = [25];
  formExecutionTime.value = '09:00';
  formMode.value = 'with_confirmation';
  formIsActive.value = true;
  modalOpen.value = true;
}

async function openEditModal(rule: AutomationItem) {
  if (financeStore.wallets.length === 0 && authStore.user?.uid) {
    await financeStore.initFinanceData(authStore.user.uid);
  }
  editingId.value = rule.id;
  errorMsg.value = null;
  txType.value = rule.type;
  walletId.value = rule.walletId;
  const srcHolders = financeStore.getHoldersByWalletId(rule.walletId);
  fundOwnerId.value =
    rule.fundOwnerId && srcHolders.some((h) => h.id === rule.fundOwnerId)
      ? rule.fundOwnerId
      : srcHolders[0]?.id || '';

  toWalletId.value = rule.toWalletId || '';
  const dstHolders = financeStore.getHoldersByWalletId(rule.toWalletId || '');
  toFundOwnerId.value =
    rule.toFundOwnerId && dstHolders.some((h) => h.id === rule.toFundOwnerId)
      ? rule.toFundOwnerId
      : dstHolders[0]?.id || '';

  amount.value = rule.amount;
  adminFee.value = rule.adminFee && rule.adminFee > 0 ? rule.adminFee : '';
  category.value = rule.type === 'transfer' ? 'Transfer Dana' : rule.category || '';
  note.value = rule.note || rule.name || '';

  if (rule.scheduleDays.length > 1) {
    scheduleTypeMode.value = 'multiple';
    formSelectedDays.value = [...rule.scheduleDays];
  } else {
    scheduleTypeMode.value = 'single';
    formSingleDay.value = rule.scheduleDays[0] || 25;
    formSelectedDays.value = [rule.scheduleDays[0] || 25];
  }
  formExecutionTime.value = rule.executionTime || '09:00';
  formMode.value = rule.mode;
  formIsActive.value = rule.isActive;
  modalOpen.value = true;
}

function toggleDaySelection(day: number) {
  if (formSelectedDays.value.includes(day)) {
    if (formSelectedDays.value.length > 1) {
      formSelectedDays.value = formSelectedDays.value.filter((d) => d !== day);
    }
  } else {
    formSelectedDays.value = [...formSelectedDays.value, day].sort((a, b) => a - b);
  }
}

async function handleDeleteFromModal() {
  if (!editingId.value) return;
  const deleted = await automationStore.deleteAutomation(editingId.value);
  if (deleted) {
    modalOpen.value = false;
  }
}

async function handleSave() {
  errorMsg.value = null;
  if (!walletId.value) {
    errorMsg.value = 'Pilih Sumber Dana terlebih dahulu.';
    return;
  }
  if (availableSourceHolders.value.length > 0 && !fundOwnerId.value) {
    errorMsg.value = 'Pilih Pemilik terlebih dahulu.';
    return;
  }

  const numericAmount = Number(amount.value || 0);
  if (numericAmount <= 0) {
    errorMsg.value = 'Masukkan Nominal transaksi yang valid (lebih dari 0).';
    return;
  }
  const numericAdminFee =
    txType.value === 'transfer' ? Math.max(0, Number(adminFee.value || 0)) : 0;

  if (txType.value !== 'transfer' && !category.value.trim()) {
    errorMsg.value = 'Pilih Kategori terlebih dahulu.';
    return;
  }

  if (txType.value === 'transfer') {
    if (!toWalletId.value) {
      errorMsg.value = 'Pilih Sumber Dana Tujuan terlebih dahulu.';
      return;
    }
    if (availableDestHolders.value.length > 0 && !toFundOwnerId.value) {
      errorMsg.value = 'Pilih Pemilik Tujuan terlebih dahulu.';
      return;
    }
  }

  const days = scheduleTypeMode.value === 'single'
    ? [Number(formSingleDay.value)]
    : formSelectedDays.value;

  if (!days || days.length === 0) {
    errorMsg.value = 'Pilih minimal satu tanggal jadwal pelaksanaan.';
    return;
  }
  if (!formExecutionTime.value) {
    errorMsg.value = 'Pilih jam pelaksanaan otomatisasi.';
    return;
  }

  const selectedWallet = financeStore.wallets.find((w) => w.id === walletId.value);
  const selectedHolder = availableSourceHolders.value.find((h) => h.id === fundOwnerId.value);
  const selectedToWallet = txType.value === 'transfer'
    ? financeStore.wallets.find((w) => w.id === toWalletId.value)
    : undefined;
  const selectedToHolder = txType.value === 'transfer'
    ? availableDestHolders.value.find((h) => h.id === toFundOwnerId.value)
    : undefined;

  const resolvedCategory =
    txType.value === 'transfer' ? 'Transfer Dana' : category.value.trim() || 'Lainnya';
  const resolvedNote = note.value.trim();
  const resolvedName =
    resolvedNote ||
    (txType.value === 'transfer'
      ? `Transfer ${selectedWallet?.name || ''} → ${selectedToWallet?.name || ''}`
      : resolvedCategory);

  isSaving.value = true;
  try {
    const ok = await automationStore.saveAutomation({
      id: editingId.value || undefined,
      name: resolvedName,
      type: txType.value,
      walletId: walletId.value,
      walletName: selectedWallet?.name || 'Dompet',
      fundOwnerId: selectedHolder?.id || fundOwnerId.value || undefined,
      fundOwnerName: selectedHolder?.holderName,
      toWalletId: selectedToWallet?.id,
      toWalletName: selectedToWallet?.name,
      toFundOwnerId: selectedToHolder?.id,
      toFundOwnerName: selectedToHolder?.holderName,
      category: resolvedCategory,
      amount: numericAmount,
      adminFee: numericAdminFee,
      note: resolvedNote || (txType.value === 'transfer' ? 'Transfer antar kepemilikan dana' : resolvedCategory),
      scheduleDays: days,
      executionTime: formExecutionTime.value || '09:00',
      mode: formMode.value,
      isActive: formIsActive.value,
    });
    if (ok) {
      modalOpen.value = false;
    }
  } catch (err: any) {
    errorMsg.value = err?.message || 'Gagal menyimpan jadwal otomatisasi.';
  } finally {
    isSaving.value = false;
  }
}

// Early manual execution action ("Catat Lebih Cepat dari Jadwal")
const executingRuleId = ref<string | null>(null);

async function handleExecuteEarly(rule: AutomationItem) {
  const confirmed = await notificationStore.requestConfirmation({
    title: 'Catat Lebih Cepat dari Jadwal',
    message: `Apakah Anda ingin langsung mencatat transaksi "${rule.name}" sekarang?`,
    detail: `Nominal: ${themeStore.formatMoney(rule.amount)}. Transaksi akan dicatat dengan tanggal hari ini lebih awal sebelum jadwal resminya.`,
    confirmLabel: 'Ya, Catat Sekarang',
    variant: 'info',
  });
  if (!confirmed) return;

  executingRuleId.value = rule.id;
  try {
    await automationStore.executeTransaction(rule, { isManualEarly: true });
  } finally {
    executingRuleId.value = null;
  }
}

function formatDaysDisplay(days: number[]): string {
  if (!days || days.length === 0) return '-';
  if (days.length === 1) {
    return `Setiap tanggal ${days[0]}`;
  }
  return `Tanggal ${days.join(', ')} setiap bulan`;
}

function getExecutionStatusText(rule: AutomationItem): { text: string; color: string } {
  const todayIso = new Date().toISOString().slice(0, 10);
  if (rule.lastExecutedDate === todayIso) {
    return { text: 'Sudah dicatat hari ini', color: 'text-emerald-600 dark:text-emerald-400' };
  }
  if (rule.lastCancelledDate === todayIso) {
    return { text: 'Dibatalkan untuk hari ini', color: 'text-slate-500 dark:text-slate-400' };
  }
  if (rule.snoozedUntil && new Date(rule.snoozedUntil).getTime() > Date.now()) {
    const snoozeDate = new Date(rule.snoozedUntil);
    const timeStr = `${String(snoozeDate.getHours()).padStart(2, '0')}:${String(snoozeDate.getMinutes()).padStart(2, '0')}`;
    return { text: `Ditunda s/d ${timeStr}`, color: 'text-blue-600 dark:text-blue-400' };
  }
  return { text: 'Menunggu jadwal', color: 'text-slate-500 dark:text-slate-400' };
}
</script>

<template>
  <div class="space-y-6 pb-20">
    <!-- Header Section -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Otomatisasi Transaksi
        </h1>
        <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Pencatatan transaksi berkala otomatis (Dengan Konfirmasi / Tanpa Konfirmasi)
        </p>
      </div>

      <div class="flex items-center gap-2.5">
        <button
          type="button"
          :disabled="isRefreshing"
          class="min-h-[42px] px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-all shadow-2xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
          title="Segarkan Jadwal Otomatis"
          @click="handleManualRefresh"
        >
          <RefreshCw class="w-4 h-4 text-emerald-600 dark:text-emerald-400" :class="{ 'animate-spin': isRefreshing }" />
          <span class="hidden sm:inline">Segarkan</span>
        </button>

        <button
          type="button"
          class="min-h-[42px] px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-all shadow-sm hover:shadow active:scale-95 flex items-center gap-2 cursor-pointer"
          @click="openAddModal"
        >
          <Plus class="w-4 h-4" />
          <span>Tambah Jadwal Otomatis</span>
        </button>
      </div>
    </div>

    <!-- Filter Tabs -->
    <div class="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
      <button
        type="button"
        class="px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
        :class="
          filterTab === 'all'
            ? 'bg-emerald-600 text-white shadow-2xs'
            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
        "
        @click="filterTab = 'all'"
      >
        Semua ({{ automationStore.rules.length }})
      </button>
      <button
        type="button"
        class="px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
        :class="
          filterTab === 'active'
            ? 'bg-emerald-600 text-white shadow-2xs'
            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
        "
        @click="filterTab = 'active'"
      >
        Aktif ({{ automationStore.activeRules.length }})
      </button>
      <button
        type="button"
        class="px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
        :class="
          filterTab === 'with_confirmation'
            ? 'bg-emerald-600 text-white shadow-2xs'
            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
        "
        @click="filterTab = 'with_confirmation'"
      >
        Dengan Konfirmasi
      </button>
      <button
        type="button"
        class="px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
        :class="
          filterTab === 'without_confirmation'
            ? 'bg-emerald-600 text-white shadow-2xs'
            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
        "
        @click="filterTab = 'without_confirmation'"
      >
        Tanpa Konfirmasi
      </button>
    </div>

    <!-- Empty State -->
    <div
      v-if="filteredRules.length === 0"
      class="rounded-3xl border border-dashed border-slate-300 dark:border-slate-800 p-12 text-center space-y-4 bg-white/50 dark:bg-slate-900/40"
    >
      <div class="w-14 h-14 mx-auto rounded-3xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
        <Clock class="w-7 h-7" />
      </div>
      <div class="max-w-md mx-auto space-y-1">
        <h3 class="text-base font-bold text-slate-800 dark:text-slate-200">
          Belum Ada Jadwal Otomatisasi
        </h3>
        <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
          Buat jadwal pengeluaran rutin (seperti sewa rumah, tagihan listrik, wifi) atau pemasukan berkala (gaji bulanan) untuk dicatat secara otomatis atau dengan konfirmasi cerdas.
        </p>
      </div>
      <div>
        <button
          type="button"
          class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold transition-all inline-flex items-center gap-1.5 cursor-pointer"
          @click="openAddModal"
        >
          <Plus class="w-4 h-4" />
          <span>Buat Jadwal Pertama</span>
        </button>
      </div>
    </div>

    <!-- Automations Grid List -->
    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <div
        v-for="rule in filteredRules"
        :key="rule.id"
        class="rounded-3xl border border-slate-200/90 dark:border-slate-800/90 bg-white dark:bg-slate-900 p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between gap-4"
        :class="!rule.isActive ? 'opacity-70 bg-slate-50 dark:bg-slate-900/50' : ''"
      >
        <div class="space-y-3.5">
          <!-- Card Top: Badges & Toggle -->
          <div class="flex items-start justify-between gap-2">
            <div class="flex flex-wrap items-center gap-1.5">
              <!-- Type Badge -->
              <span
                class="px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider"
                :class="{
                  'bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300': rule.type === 'expense',
                  'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300': rule.type === 'income',
                  'bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300': rule.type === 'transfer',
                }"
              >
                {{ t(`transactions.${rule.type}`) }}
              </span>

              <!-- Mode Badge -->
              <span
                class="px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider"
                :class="
                  rule.mode === 'with_confirmation'
                    ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300'
                    : 'bg-teal-100 dark:bg-teal-950/80 text-teal-700 dark:text-teal-300'
                "
              >
                {{ rule.mode === 'with_confirmation' ? 'Dengan Konfirmasi' : 'Tanpa Konfirmasi' }}
              </span>
            </div>

            <!-- Active Switch -->
            <label class="relative inline-flex items-center cursor-pointer select-none">
              <input
                type="checkbox"
                :checked="rule.isActive"
                class="sr-only peer"
                @change="automationStore.toggleActive(rule.id)"
              />
              <div class="w-9 h-5 bg-slate-200 peer-focus:outline-hidden rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>

          <!-- Title & Amount -->
          <div>
            <h3 class="text-base font-bold text-slate-900 dark:text-slate-100 truncate" :title="rule.name">
              {{ rule.name }}
            </h3>
            <div class="text-xl font-bold font-money mt-1 text-slate-900 dark:text-slate-100">
              {{ themeStore.formatMoney(rule.amount) }}
              <span
                v-if="rule.type === 'transfer' && rule.adminFee"
                class="text-xs font-normal text-slate-500 font-sans ml-1"
              >
                (+ Admin {{ themeStore.formatMoney(rule.adminFee) }})
              </span>
            </div>
          </div>

          <!-- Wallet, Category, Details -->
          <div class="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
            <div class="flex items-center gap-2">
              <Wallet class="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span class="truncate">
                {{ rule.walletName }}
                <template v-if="rule.fundOwnerName">({{ rule.fundOwnerName }})</template>
                <template v-if="rule.type === 'transfer' && rule.toWalletName">
                  → {{ rule.toWalletName }}
                  <template v-if="rule.toFundOwnerName">({{ rule.toFundOwnerName }})</template>
                </template>
              </span>
            </div>

            <div class="flex items-center gap-2">
              <Tags class="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span class="truncate">{{ rule.category }}</span>
            </div>

            <div class="flex items-center gap-2">
              <Calendar class="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span class="font-medium text-emerald-700 dark:text-emerald-300">
                {{ formatDaysDisplay(rule.scheduleDays) }} · Pukul {{ rule.executionTime }} WIB
              </span>
            </div>

            <p v-if="rule.note" class="text-[11px] text-slate-500 italic line-clamp-1">
              "{{ rule.note }}"
            </p>
          </div>

          <!-- Execution Status for Today -->
          <div class="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] flex items-center justify-between">
            <span class="text-slate-400">Status Hari Ini:</span>
            <span class="font-semibold" :class="getExecutionStatusText(rule).color">
              {{ getExecutionStatusText(rule).text }}
            </span>
          </div>
        </div>

        <!-- Actions -->
        <div class="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
          <!-- Button "Catat Sekarang (Lebih Cepat Dari Jadwal)" -->
          <button
            type="button"
            :disabled="executingRuleId === rule.id"
            class="flex-1 min-h-[36px] px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Catat lebih cepat dari jadwal untuk hari ini"
            @click="handleExecuteEarly(rule)"
          >
            <Play class="w-3 h-3 fill-current" />
            <span>Catat Lebih Cepat</span>
          </button>

          <!-- Edit & Delete -->
          <div class="flex items-center gap-1 shrink-0">
            <button
              type="button"
              class="w-9 h-9 rounded-xl text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer"
              title="Edit Jadwal"
              @click="openEditModal(rule)"
            >
              <Pencil class="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              class="w-9 h-9 rounded-xl text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/50 flex items-center justify-center transition-colors cursor-pointer"
              title="Hapus Jadwal"
              @click="automationStore.deleteAutomation(rule.id)"
            >
              <Trash2 class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Create / Edit Automation Modal (Identik dengan QuickTransactionModal, hanya beda penjadwalan & konfirmasi) -->
    <AppModal
      :open="modalOpen"
      :title="editingId ? 'Detail & Ubah Jadwal Otomatisasi' : 'Tambah Jadwal Otomatisasi'"
      max-width="lg"
      @close="modalOpen = false"
    >
      <div class="space-y-3.5">
        <!-- 1. Sumber Dana -->
        <CustomSelect
          v-model="walletId"
          :options="walletOptions"
          placeholder="Sumber Dana"
        />

        <!-- 2. Pemilik Sumber Dana -->
        <CustomSelect
          v-model="fundOwnerId"
          :options="sourceHolderOptions"
          :disabled="!walletId || availableSourceHolders.length === 0"
          placeholder="Pemilik"
        />

        <!-- 3. Segmented 3-Way Type Control: Income | Expense | Transfer -->
        <div class="grid grid-cols-3 rounded-full overflow-hidden border border-emerald-600/20 dark:border-emerald-500/20 bg-emerald-600/10 dark:bg-slate-800 p-1 gap-1">
          <button
            type="button"
            class="min-h-[44px] flex items-center justify-center gap-1 rounded-full text-xs sm:text-sm font-bold uppercase tracking-wide transition-all duration-150 px-2 cursor-pointer"
            :class="
              txType === 'income'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            "
            @click="txType = 'income'"
          >
            <ArrowDownLeft class="w-3.5 h-3.5 shrink-0 hidden sm:inline" />
            <span class="truncate">Income</span>
          </button>
          <button
            type="button"
            class="min-h-[44px] flex items-center justify-center gap-1 rounded-full text-xs sm:text-sm font-bold uppercase tracking-wide transition-all duration-150 px-2 cursor-pointer"
            :class="
              txType === 'expense'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            "
            @click="txType = 'expense'"
          >
            <ArrowUpRight class="w-3.5 h-3.5 shrink-0 hidden sm:inline" />
            <span class="truncate">Expense</span>
          </button>
          <button
            type="button"
            class="min-h-[44px] flex items-center justify-center gap-1 rounded-full text-xs sm:text-sm font-bold uppercase tracking-wide transition-all duration-150 px-2 cursor-pointer"
            :class="
              txType === 'transfer'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            "
            @click="txType = 'transfer'"
          >
            <ArrowLeftRight class="w-3.5 h-3.5 shrink-0 hidden sm:inline" />
            <span class="truncate">Transfer</span>
          </button>
        </div>

        <!-- 4. Penjadwalan & Konfirmasi Otomatisasi (Menggantikan Tanggal Transaksi) -->
        <div class="rounded-2xl border border-emerald-500/30 dark:border-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-950/20 p-3.5 space-y-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2 text-xs font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider">
              <Calendar class="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>Penjadwalan Otomatis</span>
            </div>
            <!-- Jam Pelaksanaan -->
            <div class="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 py-1">
              <Clock class="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span class="text-[11px] text-slate-500 font-medium">Jam:</span>
              <input
                v-model="formExecutionTime"
                type="time"
                required
                class="bg-transparent text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none"
              />
            </div>
          </div>

          <!-- Pilihan Jadwal Tanggal -->
          <div class="grid grid-cols-2 gap-2">
            <button
              type="button"
              class="min-h-[40px] px-3 py-2 rounded-xl text-xs font-semibold border transition-all text-left flex items-center justify-between cursor-pointer"
              :class="
                scheduleTypeMode === 'single'
                  ? 'border-emerald-600 bg-emerald-600 text-white shadow-xs'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
              "
              @click="scheduleTypeMode = 'single'"
            >
              <span>Tgl Tertentu Tiap Bulan</span>
              <Check v-if="scheduleTypeMode === 'single'" class="w-3.5 h-3.5 shrink-0" />
            </button>
            <button
              type="button"
              class="min-h-[40px] px-3 py-2 rounded-xl text-xs font-semibold border transition-all text-left flex items-center justify-between cursor-pointer"
              :class="
                scheduleTypeMode === 'multiple'
                  ? 'border-emerald-600 bg-emerald-600 text-white shadow-xs'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
              "
              @click="scheduleTypeMode = 'multiple'"
            >
              <span>Beberapa Tanggal</span>
              <Check v-if="scheduleTypeMode === 'multiple'" class="w-3.5 h-3.5 shrink-0" />
            </button>
          </div>

          <!-- Tanggal Tertentu (Single Select 1..31) -->
          <div v-if="scheduleTypeMode === 'single'">
            <CustomSelect
              v-model="singleDaySelectStr"
              :options="singleDayOptions"
              placeholder="Pilih Tanggal (1-31)"
            />
          </div>

          <!-- Beberapa Tanggal Pilihan (Multi-Select Grid 1..31) -->
          <div v-else class="space-y-1.5">
            <div class="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400">
              <span class="font-medium">Klik tanggal yang diinginkan:</span>
              <span class="font-bold text-emerald-600 dark:text-emerald-400">{{ formSelectedDays.length }} tanggal dipilih</span>
            </div>
            <div class="grid grid-cols-7 sm:grid-cols-11 gap-1">
              <button
                v-for="d in 31"
                :key="d"
                type="button"
                class="h-8 rounded-lg text-xs font-bold transition-all flex items-center justify-center cursor-pointer"
                :class="
                  formSelectedDays.includes(d)
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-emerald-500'
                "
                @click="toggleDaySelection(d)"
              >
                {{ d }}
              </button>
            </div>
          </div>

          <!-- Opsi Konfirmasi Otomatisasi -->
          <div class="pt-2 border-t border-emerald-200/60 dark:border-emerald-800/60 space-y-2">
            <div class="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Opsi Konfirmasi Eksekusi
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                class="p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-1"
                :class="
                  formMode === 'with_confirmation'
                    ? 'border-emerald-600 bg-white dark:bg-slate-900 ring-2 ring-emerald-600/20'
                    : 'border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 hover:border-slate-300'
                "
                @click="formMode = 'with_confirmation'"
              >
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-slate-100">
                    <BellRing class="w-3.5 h-3.5 text-emerald-600" />
                    <span>Dengan Konfirmasi</span>
                  </div>
                  <div class="w-4 h-4 rounded-full border flex items-center justify-center" :class="formMode === 'with_confirmation' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300'">
                    <Check v-if="formMode === 'with_confirmation'" class="w-2.5 h-2.5" />
                  </div>
                </div>
                <p class="text-[10px] text-slate-500 dark:text-slate-400 leading-snug">
                  Muncul banner konfirmasi saat buka aplikasi: lgsg catat, tunda, atau batalkan.
                </p>
              </button>

              <button
                type="button"
                class="p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-1"
                :class="
                  formMode === 'without_confirmation'
                    ? 'border-emerald-600 bg-white dark:bg-slate-900 ring-2 ring-emerald-600/20'
                    : 'border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 hover:border-slate-300'
                "
                @click="formMode = 'without_confirmation'"
              >
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-slate-100">
                    <Zap class="w-3.5 h-3.5 text-amber-500" />
                    <span>Tanpa Konfirmasi</span>
                  </div>
                  <div class="w-4 h-4 rounded-full border flex items-center justify-center" :class="formMode === 'without_confirmation' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300'">
                    <Check v-if="formMode === 'without_confirmation'" class="w-2.5 h-2.5" />
                  </div>
                </div>
                <p class="text-[10px] text-slate-500 dark:text-slate-400 leading-snug">
                  Sistem langsung mencatat otomatis saat memasuki jadwal tanpa konfirmasi.
                </p>
              </button>
            </div>
          </div>
        </div>

        <!-- 5. Deskripsi / Catatan -->
        <input
          v-model="note"
          type="text"
          maxlength="200"
          placeholder="Deskripsi"
          class="w-full min-h-[54px] sm:min-h-[50px] px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 text-sm sm:text-base text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:outline-none focus:border-emerald-600"
        />

        <!-- 6. Nominal Transaksi (Real-time Thousand Separator) -->
        <input
          :value="amountDisplay"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          placeholder="Nominal (Rp)"
          required
          class="w-full min-h-[54px] sm:min-h-[50px] px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 text-base sm:text-lg font-money font-semibold text-slate-900 dark:text-slate-100 placeholder:font-sans placeholder:font-normal placeholder:text-sm sm:placeholder:text-base placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:outline-none focus:border-emerald-600"
          @input="handleAmountInput"
        />

        <!-- 7A. Kategori (Untuk Income / Expense) -->
        <div v-if="txType !== 'transfer'" class="space-y-2.5">
          <CustomSelect
            v-model="category"
            :options="categoryOptions"
            searchable
            allow-custom-value
            search-placeholder="Ketik untuk mencari kategori..."
            placeholder="Kategori"
          />
        </div>

        <!-- 7B. Biaya Admin + Sumber Dana Tujuan + Pemilik Tujuan (Untuk Transfer) -->
        <Transition name="fade-slide">
          <div v-if="txType === 'transfer'" class="space-y-3.5">
            <input
              :value="adminFeeDisplay"
              type="text"
              inputmode="numeric"
              autocomplete="off"
              placeholder="Biaya Admin (Rp · Opsional)"
              class="w-full min-h-[54px] sm:min-h-[50px] px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 text-base sm:text-lg font-money font-semibold text-slate-900 dark:text-slate-100 placeholder:font-sans placeholder:font-normal placeholder:text-sm sm:placeholder:text-base placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:outline-none focus:border-indigo-600"
              @input="handleAdminFeeInput"
            />

            <CustomSelect
              v-model="toWalletId"
              :options="walletOptions"
              accent-color="indigo"
              placeholder="Sumber Dana Tujuan"
            />

            <CustomSelect
              v-model="toFundOwnerId"
              :options="destHolderOptions"
              :disabled="!toWalletId || availableDestHolders.length === 0"
              accent-color="indigo"
              placeholder="Pemilik Tujuan"
            />
          </div>
        </Transition>

        <p v-if="errorMsg" class="text-xs text-rose-600 dark:text-rose-400 font-medium px-1">
          {{ errorMsg }}
        </p>
      </div>

      <!-- Fixed Footer inside AppModal (Matching QuickTransactionModal) -->
      <template #footer>
        <div class="flex items-center justify-between gap-2.5">
          <button
            v-if="editingId"
            type="button"
            :disabled="isSaving"
            class="min-h-[44px] px-4 py-2 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0 disabled:opacity-50 cursor-pointer"
            @click="handleDeleteFromModal"
          >
            <Trash2 class="w-4 h-4 shrink-0" />
            <span>Hapus</span>
          </button>

          <button
            type="button"
            :disabled="isSaving"
            class="flex-1 min-h-[46px] px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 shadow-xs cursor-pointer"
            @click="handleSave"
          >
            <Check class="w-4 h-4 shrink-0" />
            <span>{{ editingId ? 'Simpan Perubahan' : 'Simpan Jadwal Otomatisasi' }}</span>
          </button>
        </div>
      </template>
    </AppModal>
  </div>
</template>
