<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  ArrowLeft,
  ArrowDownLeft,
  ArrowUpRight,
  BellRing,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Crown,
  HandCoins,
  Pencil,
  Plus,
  Trash2,
  Wallet,
  X,
} from 'lucide-vue-next';
import { useAuthStore } from '../stores/auth';
import { useFinanceStore, formatHolderName } from '../stores/finance';
import { useSavingsStore } from '../stores/savings';
import { useDebtsStore, MAX_FREE_DEBTS_PER_TYPE } from '../stores/debts';
import { useThemeStore } from '../stores/theme';
import { useNotificationStore } from '../stores/notification';
import { getTodayIsoDate } from '../stores/automation';
import AppModal from '../components/AppModal.vue';
import CustomSelect, { type SelectOptionItem } from '../components/CustomSelect.vue';
import MaterialDatePicker from '../components/MaterialDatePicker.vue';
import {
  DEBT_COLOR_OPTIONS,
  DEBT_TX_CATEGORIES,
  type DebtType,
  type DebtItem,
} from '../types/debt';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const financeStore = useFinanceStore();
const savingsStore = useSavingsStore();
const debtsStore = useDebtsStore();
const themeStore = useThemeStore();
const notificationStore = useNotificationStore();

const debtId = computed(() => String(route.params.id || '').trim());

const debt = computed<DebtItem | null>(
  () => debtsStore.activeDebts.find((d) => d.id === debtId.value) || null
);

const paidAmount = computed(() =>
  debt.value ? debtsStore.getDebtPaidAmount(debt.value.id) : 0
);

const remainingAmount = computed(() =>
  debt.value ? debtsStore.getDebtRemainingAmount(debt.value) : 0
);

const isSettled = computed(() =>
  debt.value ? debtsStore.isDebtSettled(debt.value) : false
);

const progressPercent = computed(() => {
  if (!debt.value) return 0;
  const principal = Math.max(1, Number(debt.value.amount) || 1);
  return Math.min(100, Math.round((paidAmount.value / principal) * 100));
});

const breakdownByHolder = computed(() => {
  if (!debt.value) return [];
  return debtsStore.getDebtSourceBreakdown(debt.value.id);
});

const allEntries = computed(() => {
  if (!debt.value) return [];
  return debtsStore.getDebtEntries(debt.value.id);
});

// =========================================================================
// Load & Sync Data
// =========================================================================

async function ensureDataReady(force = false) {
  const uid = authStore.user?.uid;
  if (!uid) return;
  const tasks: Promise<any>[] = [];
  if (financeStore.wallets.length === 0) {
    tasks.push(financeStore.initFinanceData(uid));
  }
  tasks.push(debtsStore.loadDebts(uid, force));
  tasks.push(savingsStore.loadSavings(uid, false));
  await Promise.all(tasks);
  debtsStore.refreshNotificationPermission();
}

onMounted(async () => {
  await ensureDataReady(false);
  handleExternalInstallmentRequest();
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

// =========================================================================
// Helpers & Formatting
// =========================================================================

function getDeadlineInfo(deadline?: string | null): { label: string; isOverdue: boolean } | null {
  if (!deadline) return null;
  try {
    const dt = new Date(`${deadline}T00:00:00`);
    const today = new Date(`${getTodayIsoDate()}T00:00:00`);
    const isOverdue = dt.getTime() < today.getTime();
    const label = dt.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    return { label, isOverdue };
  } catch {
    return { label: deadline, isOverdue: false };
  }
}

function formatDateId(iso?: string | null): string {
  if (!iso) return '-';
  try {
    return new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function formatDaysDisplay(days: number[]): string {
  if (!days || days.length === 0) return '-';
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length <= 4) {
    return `Tgl ${sorted.join(', ')}`;
  }
  return `${sorted.length} tanggal/bln`;
}

function getAccentIconClass(color: string): string {
  switch (color) {
    case 'emerald':
      return 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400';
    case 'indigo':
      return 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400';
    case 'blue':
      return 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400';
    case 'amber':
      return 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400';
    case 'violet':
      return 'bg-violet-50 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400';
    case 'teal':
      return 'bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400';
    default:
      return 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400';
  }
}

function getAccentBarClass(color: string): string {
  switch (color) {
    case 'emerald':
      return 'bg-emerald-500';
    case 'indigo':
      return 'bg-indigo-500';
    case 'blue':
      return 'bg-blue-500';
    case 'amber':
      return 'bg-amber-500';
    case 'violet':
      return 'bg-violet-500';
    case 'teal':
      return 'bg-teal-500';
    default:
      return 'bg-rose-500';
  }
}

function getAccentDotClass(color: string): string {
  switch (color) {
    case 'emerald':
      return 'bg-emerald-500';
    case 'indigo':
      return 'bg-indigo-500';
    case 'blue':
      return 'bg-blue-500';
    case 'amber':
      return 'bg-amber-500';
    case 'violet':
      return 'bg-violet-500';
    case 'teal':
      return 'bg-teal-500';
    default:
      return 'bg-rose-500';
  }
}

function formatNumberInputWithSeparator(rawValue: string): { numericStr: string; formatted: string } {
  const digits = String(rawValue || '').replace(/[^\d]/g, '');
  if (!digits) {
    return { numericStr: '', formatted: '' };
  }
  const normalizedDigits = digits.replace(/^0+(?=\d)/, '');
  const numeric = Number(normalizedDigits);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return { numericStr: '', formatted: '' };
  }
  return {
    numericStr: String(numeric),
    formatted: numeric.toLocaleString('id-ID'),
  };
}

async function handleDeleteCurrentDebt() {
  if (!debt.value) return;
  const deleted = await debtsStore.deleteDebt(debt.value.id);
  if (deleted) {
    void router.push('/utilities/debts');
  }
}

// =========================================================================
// MODAL 1: Edit Debt / Receivable
// =========================================================================

const editModalOpen = ref(false);
const debtType = ref<DebtType>('debt');
const debtWalletId = ref<string>('');
const debtFundOwnerId = ref<string>('');
const debtDate = ref<string>(getTodayIsoDate());
const debtDescription = ref<string>('');
const debtAmount = ref<string>('');
const debtAmountDisplay = ref<string>('');
const hasDeadline = ref<boolean>(false);
const debtDeadline = ref<string>('');
const debtNote = ref<string>('');
const debtColor = ref<string>('rose');
const debtReminderEnabled = ref<boolean>(false);
const debtScheduleMode = ref<'single' | 'multiple'>('single');
const debtSingleDayStr = ref<string>('1');
const debtSelectedDays = ref<number[]>([1]);
const debtReminderTime = ref<string>('09:00');
const debtReminderAmount = ref<string>('');
const debtReminderAmountDisplay = ref<string>('');
const isSavingDebt = ref(false);

const debtWalletOptions = computed<SelectOptionItem[]>(() =>
  financeStore.wallets.map((w) => ({
    value: w.id,
    label: `${w.name} (${themeStore.formatMoney(savingsStore.getWalletOperationalBalance(w.id))} bebas)`,
  }))
);

const availableDebtHolders = computed(() =>
  debtWalletId.value ? financeStore.getHoldersByWalletId(debtWalletId.value) : []
);

const debtHolderOptions = computed<SelectOptionItem[]>(() =>
  availableDebtHolders.value.map((h) => ({
    value: h.id,
    label: `${formatHolderName(h.holderName)} (Bebas: ${themeStore.formatMoney(savingsStore.getHolderOperationalBalance(debtWalletId.value, h.id))})`,
  }))
);

const singleDayOptions = computed<SelectOptionItem[]>(() =>
  Array.from({ length: 31 }, (_, i) => {
    const dayNum = i + 1;
    return {
      value: String(dayNum),
      label: `Setiap tanggal ${dayNum}`,
    };
  })
);

watch(debtWalletId, (newWId) => {
  if (!newWId) {
    debtFundOwnerId.value = '';
    return;
  }
  const holders = financeStore.getHoldersByWalletId(newWId);
  if (holders.length > 0) {
    const exists = holders.some((h) => h.id === debtFundOwnerId.value);
    if (!exists) debtFundOwnerId.value = holders[0].id;
  } else {
    debtFundOwnerId.value = '';
  }
});

function handleSelectEditType(targetType: DebtType) {
  if (!debt.value) return;
  if (debt.value.type !== targetType && !authStore.isProUser) {
    const count =
      targetType === 'debt' ? debtsStore.debtItems.length : debtsStore.receivableItems.length;
    if (count >= MAX_FREE_DEBTS_PER_TYPE) {
      notificationStore.openProModal({
        featureTitle:
          targetType === 'debt'
            ? `Batas Maksimal ${MAX_FREE_DEBTS_PER_TYPE} Catatan Hutang`
            : `Batas Maksimal ${MAX_FREE_DEBTS_PER_TYPE} Catatan Piutang`,
        featureDescription: `Pengguna paket Free hanya dapat memiliki maksimal ${MAX_FREE_DEBTS_PER_TYPE} Hutang dan ${MAX_FREE_DEBTS_PER_TYPE} Piutang aktif.`,
        limitSummary: `${count} / ${MAX_FREE_DEBTS_PER_TYPE} ${targetType === 'debt' ? 'Hutang' : 'Piutang'} Aktif`,
      });
      return;
    }
  }
  debtType.value = targetType;
}

function handleDebtAmountInput(e: Event) {
  const inputEl = e.target as HTMLInputElement;
  const { numericStr, formatted } = formatNumberInputWithSeparator(inputEl.value);
  debtAmount.value = numericStr;
  debtAmountDisplay.value = formatted;
  inputEl.value = formatted;
}

function handleDebtReminderAmountInput(e: Event) {
  const inputEl = e.target as HTMLInputElement;
  const { numericStr, formatted } = formatNumberInputWithSeparator(inputEl.value);
  debtReminderAmount.value = numericStr;
  debtReminderAmountDisplay.value = formatted;
  inputEl.value = formatted;
}

function toggleDebtDaySelection(dayNum: number) {
  const idx = debtSelectedDays.value.indexOf(dayNum);
  if (idx >= 0) {
    if (debtSelectedDays.value.length > 1) {
      debtSelectedDays.value.splice(idx, 1);
    }
  } else {
    debtSelectedDays.value.push(dayNum);
    debtSelectedDays.value.sort((a, b) => a - b);
  }
}

function openEditModal() {
  if (!debt.value) return;
  const d = debt.value;
  debtType.value = d.type;
  debtWalletId.value = d.walletId || financeStore.wallets[0]?.id || '';
  const holders = debtWalletId.value ? financeStore.getHoldersByWalletId(debtWalletId.value) : [];
  debtFundOwnerId.value =
    (d.fundOwnerId && holders.some((h) => h.id === d.fundOwnerId)
      ? d.fundOwnerId
      : holders[0]?.id) || '';
  debtDate.value = d.date || getTodayIsoDate();
  debtDescription.value = d.description;
  const numAmount = Math.max(0, Number(d.amount) || 0);
  debtAmount.value = numAmount > 0 ? String(numAmount) : '';
  debtAmountDisplay.value = numAmount > 0 ? numAmount.toLocaleString('id-ID') : '';
  hasDeadline.value = Boolean(d.deadline);
  debtDeadline.value = d.deadline || getTodayIsoDate();
  debtNote.value = d.note || '';
  debtColor.value = d.color || (d.type === 'receivable' ? 'emerald' : 'rose');
  debtReminderEnabled.value = Boolean(d.reminderEnabled);
  const days = d.reminderDays && d.reminderDays.length > 0 ? [...d.reminderDays] : [1];
  if (days.length > 1) {
    debtScheduleMode.value = 'multiple';
    debtSelectedDays.value = days;
    debtSingleDayStr.value = String(days[0]);
  } else {
    debtScheduleMode.value = 'single';
    debtSingleDayStr.value = String(days[0]);
    debtSelectedDays.value = days;
  }
  debtReminderTime.value = d.reminderTime || '09:00';
  const numReminder = d.reminderAmount ? Number(d.reminderAmount) : 0;
  debtReminderAmount.value = numReminder > 0 ? String(numReminder) : '';
  debtReminderAmountDisplay.value = numReminder > 0 ? numReminder.toLocaleString('id-ID') : '';
  editModalOpen.value = true;
}

async function submitEditForm() {
  if (!debt.value || isSavingDebt.value) return;
  const numAmount = Math.abs(Number(debtAmount.value) || 0);
  if (!debtWalletId.value) {
    notificationStore.notifyError('Validasi', 'Pilih Sumber Dana terlebih dahulu.');
    return;
  }
  if (!debtDescription.value.trim()) {
    notificationStore.notifyError('Validasi', 'Deskripsi hutang/piutang wajib diisi.');
    return;
  }
  if (numAmount <= 0) {
    notificationStore.notifyError('Validasi', 'Nominal harus lebih dari Rp 0.');
    return;
  }

  const finalDays =
    debtScheduleMode.value === 'single'
      ? [Math.max(1, Math.min(31, Number(debtSingleDayStr.value) || 1))]
      : [...debtSelectedDays.value];

  const numReminderAmount = debtReminderAmount.value
    ? Math.abs(Number(debtReminderAmount.value) || 0)
    : null;

  isSavingDebt.value = true;
  try {
    const saved = await debtsStore.saveDebt({
      id: debt.value.id,
      type: debtType.value,
      description: debtDescription.value.trim(),
      amount: numAmount,
      walletId: debtWalletId.value,
      fundOwnerId: debtFundOwnerId.value || undefined,
      date: debtDate.value || getTodayIsoDate(),
      deadline: hasDeadline.value ? debtDeadline.value || null : null,
      note: debtNote.value.trim(),
      color: debtColor.value,
      reminderEnabled: debtReminderEnabled.value,
      reminderDays: finalDays,
      reminderTime: debtReminderTime.value || '09:00',
      reminderAmount: numReminderAmount,
    });
    if (saved) {
      editModalOpen.value = false;
    }
  } finally {
    isSavingDebt.value = false;
  }
}

// =========================================================================
// MODAL 2: Record Installment ("Cicil" / "Terima")
// =========================================================================

const installmentModalOpen = ref(false);
const instWalletId = ref<string>('');
const instFundOwnerId = ref<string>('');
const instAmount = ref<string>('');
const instAmountDisplay = ref<string>('');
const instDate = ref<string>(getTodayIsoDate());
const instNote = ref<string>('');
const instError = ref<string>('');
const isSubmittingInstallment = ref(false);

const instWalletOptions = computed<SelectOptionItem[]>(() =>
  financeStore.wallets.map((w) => ({
    value: w.id,
    label: `${w.name} (Saldo Bebas: ${themeStore.formatMoney(savingsStore.getWalletOperationalBalance(w.id))})`,
  }))
);

const instHolders = computed(() =>
  instWalletId.value ? financeStore.getHoldersByWalletId(instWalletId.value) : []
);

const instHolderOptions = computed<SelectOptionItem[]>(() =>
  instHolders.value.map((h) => ({
    value: h.id,
    label: `${formatHolderName(h.holderName)} (Bebas: ${themeStore.formatMoney(savingsStore.getHolderOperationalBalance(instWalletId.value, h.id))})`,
  }))
);

watch(instWalletId, (newWId) => {
  if (!newWId) {
    instFundOwnerId.value = '';
    return;
  }
  const holders = financeStore.getHoldersByWalletId(newWId);
  if (holders.length > 0) {
    const exists = holders.some((h) => h.id === instFundOwnerId.value);
    if (!exists) instFundOwnerId.value = holders[0].id;
  } else {
    instFundOwnerId.value = '';
  }
});

function openInstallmentModal(suggestedAmount?: number) {
  if (!debt.value) return;
  if (financeStore.wallets.length === 0) {
    notificationStore.notifyWarning(
      'Belum Ada Sumber Dana',
      'Buat minimal 1 Dompet terlebih dahulu di menu Sumber Dana.'
    );
    return;
  }
  const rem = remainingAmount.value;
  if (rem <= 0) {
    notificationStore.notifyInfo(
      'Sudah Lunas',
      `${debt.value.type === 'debt' ? 'Hutang' : 'Piutang'} ini sudah lunas sepenuhnya.`
    );
    return;
  }

  const preferredWallet =
    financeStore.wallets.find((w) => w.id === debt.value!.walletId) || financeStore.wallets[0];
  instWalletId.value = preferredWallet?.id || '';
  const holders = preferredWallet ? financeStore.getHoldersByWalletId(preferredWallet.id) : [];
  instFundOwnerId.value =
    (debt.value.fundOwnerId && holders.some((h) => h.id === debt.value!.fundOwnerId)
      ? debt.value.fundOwnerId
      : holders[0]?.id) || '';

  const initAmt =
    suggestedAmount && suggestedAmount > 0
      ? Math.min(suggestedAmount, rem)
      : debt.value.reminderAmount && debt.value.reminderAmount > 0
        ? Math.min(debt.value.reminderAmount, rem)
        : 0;
  instAmount.value = initAmt > 0 ? String(initAmt) : '';
  instAmountDisplay.value = initAmt > 0 ? initAmt.toLocaleString('id-ID') : '';
  instDate.value = getTodayIsoDate();
  instNote.value =
    debt.value.type === 'debt'
      ? `Cicilan hutang: ${debt.value.description}`
      : `Penerimaan piutang: ${debt.value.description}`;
  instError.value = '';
  installmentModalOpen.value = true;
}

function handleInstallmentAmountInput(e: Event) {
  const inputEl = e.target as HTMLInputElement;
  const { numericStr, formatted } = formatNumberInputWithSeparator(inputEl.value);
  instAmount.value = numericStr;
  instAmountDisplay.value = formatted;
  inputEl.value = formatted;
}

function fillRemainingAmount() {
  const rem = remainingAmount.value;
  if (rem > 0) {
    instAmount.value = String(rem);
    instAmountDisplay.value = rem.toLocaleString('id-ID');
  }
}

async function submitInstallment() {
  if (!debt.value || isSubmittingInstallment.value) return;
  instError.value = '';
  const numericAmount = Math.abs(Number(instAmount.value) || 0);
  if (numericAmount <= 0) {
    instError.value = 'Nominal harus lebih dari Rp 0.';
    return;
  }
  if (!instWalletId.value) {
    instError.value = 'Pilih Sumber Dana terlebih dahulu.';
    return;
  }

  isSubmittingInstallment.value = true;
  try {
    await debtsStore.recordInstallment({
      debtId: debt.value.id,
      walletId: instWalletId.value,
      fundOwnerId: instFundOwnerId.value || undefined,
      amount: numericAmount,
      date: instDate.value || getTodayIsoDate(),
      note:
        instNote.value.trim() ||
        (debt.value.type === 'debt'
          ? `Cicilan hutang: ${debt.value.description}`
          : `Penerimaan piutang: ${debt.value.description}`),
    });
    installmentModalOpen.value = false;
  } catch (err: any) {
    instError.value = err?.message || 'Gagal mencatat pelunasan.';
  } finally {
    isSubmittingInstallment.value = false;
  }
}

function handleExternalInstallmentRequest() {
  const req = debtsStore.installmentModalRequest;
  const wantsOpen =
    (req && req.debtId === debtId.value) || route.query.action === 'installment';

  if (wantsOpen && debt.value && !isSettled.value) {
    debtsStore.clearInstallmentModalRequest();
    openInstallmentModal(debt.value.reminderAmount || undefined);
    if (route.query.action) {
      void router.replace({ path: route.path, query: {} });
    }
  }
}

watch(
  () => [debtsStore.installmentModalRequest, debt.value, route.query.action],
  () => {
    handleExternalInstallmentRequest();
  }
);
</script>

<template>
  <div class="space-y-6 pb-20">
    <!-- Top Breadcrumb Back Link -->
    <div>
      <button
        type="button"
        class="inline-flex items-center gap-2 min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
        @click="router.push('/utilities/debts')"
      >
        <ArrowLeft class="w-4 h-4 shrink-0" />
        <span>Kembali ke Daftar Hutang &amp; Piutang</span>
      </button>
    </div>

    <!-- Not Found / Loading Empty State -->
    <div
      v-if="!debt"
      class="rounded-3xl border border-dashed border-slate-300 dark:border-slate-800 bg-white/60 dark:bg-slate-900/50 p-10 text-center space-y-4"
    >
      <div class="w-14 h-14 mx-auto rounded-3xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
        <HandCoins class="w-7 h-7" />
      </div>
      <div class="space-y-1">
        <h2 class="text-base font-bold text-slate-900 dark:text-slate-100">
          {{ debtsStore.isLoading ? 'Memuat Detail Hutang & Piutang...' : 'Catatan Tidak Ditemukan' }}
        </h2>
        <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
          {{
            debtsStore.isLoading
              ? 'Sedang mengambil detail hutang/piutang beserta riwayat pelunasan.'
              : 'Catatan hutang/piutang ini mungkin telah dihapus atau tautan tidak valid.'
          }}
        </p>
      </div>
      <div>
        <button
          type="button"
          class="min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
          @click="router.push('/utilities/debts')"
        >
          <ArrowLeft class="w-4 h-4" />
          <span>Kembali ke Hutang &amp; Piutang</span>
        </button>
      </div>
    </div>

    <!-- Main Detail Page Content -->
    <template v-else>
      <!-- Top Header with Title + Hapus, Edit, Cicil/Terima Actions -->
      <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div class="flex items-start gap-3.5 min-w-0">
          <div
            class="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 mt-0.5"
            :class="getAccentIconClass(debt.color)"
          >
            <ArrowDownLeft v-if="debt.type === 'debt'" class="w-6 h-6" />
            <ArrowUpRight v-else class="w-6 h-6" />
          </div>
          <div class="min-w-0 flex-1 space-y-1">
            <div class="flex flex-wrap items-center gap-2">
              <h1 class="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 break-words">
                {{ debt.description }}
              </h1>
              <span
                class="px-2.5 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider shrink-0"
                :class="
                  debt.type === 'debt'
                    ? 'bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300'
                    : 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300'
                "
              >
                {{ debt.type === 'debt' ? 'Hutang' : 'Piutang' }}
              </span>
              <span
                class="px-2.5 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider shrink-0"
                :class="
                  isSettled
                    ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                "
              >
                {{ isSettled ? 'Lunas' : `${progressPercent}%` }}
              </span>
            </div>

            <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              <span class="font-medium text-slate-700 dark:text-slate-300">
                Tgl: {{ formatDateId(debt.date) }}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {{ debt.walletName }} ({{ formatHolderName(debt.fundOwnerName) }})
              </span>
              <template v-if="getDeadlineInfo(debt.deadline)">
                <span aria-hidden="true">·</span>
                <span
                  :class="
                    !isSettled && getDeadlineInfo(debt.deadline)?.isOverdue
                      ? 'text-rose-600 dark:text-rose-400 font-semibold'
                      : ''
                  "
                >
                  Deadline: {{ getDeadlineInfo(debt.deadline)?.label }}
                </span>
              </template>
              <template v-if="debt.reminderEnabled">
                <span aria-hidden="true">·</span>
                <span class="text-emerald-600 dark:text-emerald-400 font-medium inline-flex items-center gap-1">
                  <BellRing class="w-3.5 h-3.5 shrink-0" />
                  <span>{{ formatDaysDisplay(debt.reminderDays) }} · {{ debt.reminderTime || '09:00' }} WIB</span>
                </span>
              </template>
            </div>
          </div>
        </div>

        <!-- Top Action Buttons: Hapus, Edit, Cicil/Terima -->
        <div class="grid grid-cols-2 sm:flex sm:items-center gap-2 sm:flex-nowrap shrink-0">
          <button
            type="button"
            class="h-11 min-h-[44px] px-4 py-2 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-700 dark:text-rose-300 text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
            @click="handleDeleteCurrentDebt"
          >
            <Trash2 class="w-4 h-4 shrink-0" />
            <span>Hapus</span>
          </button>

          <button
            type="button"
            class="h-11 min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer shadow-2xs"
            @click="openEditModal"
          >
            <Pencil class="w-4 h-4 shrink-0" />
            <span>Edit</span>
          </button>

          <button
            type="button"
            :disabled="isSettled"
            class="col-span-2 sm:col-span-1 w-full sm:w-auto h-11 min-h-[44px] px-5 py-2 rounded-xl text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-all shadow-sm hover:shadow active:scale-[0.98] whitespace-nowrap cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
            :class="
              debt.type === 'debt'
                ? 'bg-rose-600 hover:bg-rose-700'
                : 'bg-emerald-600 hover:bg-emerald-700'
            "
            @click="openInstallmentModal(debt.reminderAmount || undefined)"
          >
            <Plus class="w-4 h-4 shrink-0" />
            <span>{{ debt.type === 'debt' ? 'Cicil' : 'Terima' }}</span>
          </button>
        </div>
      </div>

      <!-- Hero Progress Overview Card -->
      <section class="rounded-3xl border border-slate-200/90 dark:border-slate-800/90 bg-white dark:bg-slate-900 p-5 sm:p-6 space-y-4 shadow-sm">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
          <div class="space-y-1">
            <div class="text-xs font-medium text-slate-500 dark:text-slate-400">
              {{ debt.type === 'debt' ? 'Sudah Dibayar' : 'Sudah Diterima' }}
            </div>
            <div class="text-2xl sm:text-3xl font-money font-bold tracking-tight text-slate-900 dark:text-slate-100 truncate">
              {{ themeStore.formatMoney(paidAmount) }}
            </div>
          </div>

          <div class="sm:border-l border-slate-100 dark:border-slate-800 sm:pl-5 space-y-1">
            <div class="text-xs font-medium text-slate-500 dark:text-slate-400">
              {{ debt.type === 'debt' ? 'Total Pokok Hutang' : 'Total Pokok Piutang' }}
            </div>
            <div
              class="text-2xl sm:text-3xl font-money font-bold tracking-tight truncate"
              :class="
                debt.type === 'debt'
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              "
            >
              {{ themeStore.formatMoney(debt.amount) }}
            </div>
          </div>

          <div class="sm:border-l border-slate-100 dark:border-slate-800 sm:pl-5 space-y-1">
            <div class="text-xs font-medium text-slate-500 dark:text-slate-400">
              {{ isSettled ? 'Status Pelunasan' : debt.type === 'debt' ? 'Sisa Hutang' : 'Sisa Piutang' }}
            </div>
            <div
              v-if="isSettled"
              class="text-lg sm:text-xl font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 pt-1"
            >
              <CheckCircle2 class="w-5 h-5 shrink-0" />
              <span>Lunas Sepenuhnya</span>
            </div>
            <div
              v-else
              class="text-2xl sm:text-3xl font-money font-bold tracking-tight text-slate-700 dark:text-slate-300 truncate"
            >
              {{ themeStore.formatMoney(remainingAmount) }}
            </div>
          </div>
        </div>

        <div class="space-y-1.5 pt-1">
          <div class="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Progress Pelunasan</span>
            <span class="font-money font-bold text-emerald-600 dark:text-emerald-400">
              {{ progressPercent }}%
            </span>
          </div>
          <div class="h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              class="h-full rounded-full transition-all duration-300"
              :class="getAccentBarClass(debt.color)"
              :style="{ width: `${progressPercent}%` }"
            ></div>
          </div>
        </div>

        <div class="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300">
          <div>
            Transaksi awal otomatis tercatat sebagai
            <strong class="text-slate-900 dark:text-slate-100">
              {{ debt.type === 'debt' ? `Income (${DEBT_TX_CATEGORIES.debtCreate})` : `Expense (${DEBT_TX_CATEGORIES.receivableCreate})` }}
            </strong>
            di {{ debt.walletName }} ({{ formatHolderName(debt.fundOwnerName) }}).
          </div>
          <p v-if="debt.note" class="italic text-slate-500 dark:text-slate-400">
            "{{ debt.note }}"
          </p>
        </div>
      </section>

      <!-- Breakdown Sumber Dana Pelunasan Section -->
      <section class="rounded-3xl border border-slate-200/90 dark:border-slate-800/90 bg-white dark:bg-slate-900 p-5 sm:p-6 space-y-4 shadow-sm">
        <div class="flex items-center justify-between gap-2">
          <div>
            <h2 class="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Wallet class="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>Rincian Sumber Dana Pelunasan</span>
            </h2>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Akumulasi {{ debt.type === 'debt' ? 'pembayaran cicilan' : 'penerimaan pelunasan' }} berdasarkan dompet dan pemilik dana.
            </p>
          </div>
          <span class="px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-money font-semibold text-slate-600 dark:text-slate-300 shrink-0">
            {{ breakdownByHolder.length }} sumber
          </span>
        </div>

        <div
          v-if="breakdownByHolder.length === 0"
          class="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-6 text-center text-xs sm:text-sm text-slate-500 dark:text-slate-400"
        >
          Belum ada riwayat pelunasan. Klik tombol <strong>{{ debt.type === 'debt' ? 'Cicil' : 'Terima' }}</strong> di atas untuk mencatat pembayaran.
        </div>

        <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div
            v-for="src in breakdownByHolder"
            :key="`${src.walletId}_${src.fundOwnerId}`"
            class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-4 flex items-center justify-between gap-3"
          >
            <div class="min-w-0 flex-1">
              <div class="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                {{ src.walletName }}
              </div>
              <div class="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                Pemilik: {{ src.fundOwnerName }}
              </div>
            </div>
            <div class="text-right shrink-0">
              <div class="text-sm sm:text-base font-money font-bold text-teal-600 dark:text-teal-400">
                {{ themeStore.formatMoney(src.amount) }}
              </div>
              <div
                v-if="paidAmount > 0"
                class="text-[11px] font-money text-slate-500 dark:text-slate-400"
              >
                {{ Math.round((src.amount / paidAmount) * 100) }}%
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Manageable Repayment History Section (Matching SavingsDetailView Full-Width List) -->
      <section class="rounded-3xl border border-slate-200/90 dark:border-slate-800/90 bg-white dark:bg-slate-900 p-5 sm:p-6 space-y-4 shadow-sm">
        <div>
          <h2 class="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Clock class="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>Riwayat Pelunasan ({{ allEntries.length }})</span>
          </h2>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Setiap pencatatan {{ debt.type === 'debt' ? 'cicilan (Pembayaran Hutang)' : 'penerimaan (Penerimaan Piutang)' }} otomatis tersinkron ke Transaksi.
          </p>
        </div>

        <div
          v-if="allEntries.length === 0"
          class="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-8 text-center text-xs sm:text-sm text-slate-500 dark:text-slate-400"
        >
          Belum ada catatan {{ debt.type === 'debt' ? 'pembayaran cicilan hutang' : 'penerimaan pelunasan piutang' }}.
        </div>

        <div v-else class="space-y-3">
          <div
            v-for="entry in allEntries"
            :key="entry.id"
            class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 p-4 space-y-3"
          >
            <!-- Top header & full-width source/description -->
            <div class="w-full space-y-2">
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-2 min-w-0">
                  <div
                    class="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                    :class="
                      debt.type === 'debt'
                        ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400'
                        : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                    "
                  >
                    <ArrowUpRight v-if="debt.type === 'debt'" class="w-4 h-4" />
                    <ArrowDownLeft v-else class="w-4 h-4" />
                  </div>
                  <span
                    class="text-xs sm:text-sm font-bold truncate"
                    :class="
                      debt.type === 'debt'
                        ? 'text-rose-700 dark:text-rose-400'
                        : 'text-emerald-700 dark:text-emerald-400'
                    "
                  >
                    {{
                      debt.type === 'debt'
                        ? DEBT_TX_CATEGORIES.debtPay
                        : DEBT_TX_CATEGORIES.receivableReceive
                    }}
                  </span>
                </div>
                <span class="text-[11px] font-medium text-slate-400 dark:text-slate-500 shrink-0">
                  {{ formatDateId(entry.date) }}
                </span>
              </div>

              <div class="w-full space-y-1">
                <div class="w-full text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 break-words">
                  {{ entry.walletName }}
                  <span class="font-normal text-slate-500 dark:text-slate-400">
                    ({{ formatHolderName(entry.fundOwnerName) }})
                  </span>
                </div>
                <p class="w-full text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed break-words">
                  {{ entry.note }}
                </p>
              </div>
            </div>

            <!-- Bottom row: Nominal on left, Red Delete button on right -->
            <div class="pt-2.5 border-t border-slate-200/70 dark:border-slate-800/80 flex items-center justify-between gap-3">
              <span
                class="text-sm sm:text-base font-money font-bold"
                :class="
                  debt.type === 'debt'
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-emerald-600 dark:text-emerald-400'
                "
              >
                {{ debt.type === 'debt' ? '-' : '+' }}{{ themeStore.formatMoney(entry.amount) }}
              </span>

              <button
                type="button"
                class="min-h-[36px] px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-xs transition-colors shrink-0 cursor-pointer"
                title="Hapus catatan pelunasan ini"
                @click="debtsStore.deleteEntry(entry.id)"
              >
                <Trash2 class="w-3.5 h-3.5 shrink-0" />
                <span>Hapus</span>
              </button>
            </div>
          </div>
        </div>
      </section>
    </template>

    <!-- =================================================================== -->
    <!-- MODAL 1: Edit Hutang / Piutang                                      -->
    <!-- =================================================================== -->
    <AppModal
      :open="editModalOpen"
      title="Edit Hutang / Piutang"
      max-width="lg"
      @close="editModalOpen = false"
    >
      <div class="space-y-3.5">
        <CustomSelect
          v-model="debtWalletId"
          :options="debtWalletOptions"
          placeholder="Sumber Dana"
        />

        <CustomSelect
          v-model="debtFundOwnerId"
          :options="debtHolderOptions"
          :disabled="!debtWalletId || availableDebtHolders.length === 0"
          placeholder="Kepemilikan Dana"
        />

        <!-- Segmented Tab Control: Hutang | Piutang -->
        <div class="grid grid-cols-2 rounded-full overflow-hidden border border-emerald-600/20 dark:border-emerald-500/20 bg-emerald-600/10 dark:bg-slate-800 p-1 gap-1">
          <button
            type="button"
            class="min-h-[44px] flex items-center justify-center gap-1.5 rounded-full text-xs sm:text-sm font-bold uppercase tracking-wide transition-all duration-150 px-3 cursor-pointer"
            :class="
              debtType === 'debt'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            "
            @click="handleSelectEditType('debt')"
          >
            <ArrowDownLeft class="w-3.5 h-3.5 shrink-0" />
            <span>Hutang</span>
            <span
              v-if="debt && debt.type !== 'debt' && !authStore.isProUser && debtsStore.debtItems.length >= MAX_FREE_DEBTS_PER_TYPE"
              class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 text-[9px] font-extrabold"
            >
              <Crown class="w-2.5 h-2.5" />
              PRO
            </span>
          </button>

          <button
            type="button"
            class="min-h-[44px] flex items-center justify-center gap-1.5 rounded-full text-xs sm:text-sm font-bold uppercase tracking-wide transition-all duration-150 px-3 cursor-pointer"
            :class="
              debtType === 'receivable'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            "
            @click="handleSelectEditType('receivable')"
          >
            <ArrowUpRight class="w-3.5 h-3.5 shrink-0" />
            <span>Piutang</span>
            <span
              v-if="debt && debt.type !== 'receivable' && !authStore.isProUser && debtsStore.receivableItems.length >= MAX_FREE_DEBTS_PER_TYPE"
              class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 text-[9px] font-extrabold"
            >
              <Crown class="w-2.5 h-2.5" />
              PRO
            </span>
          </button>
        </div>

        <MaterialDatePicker v-model="debtDate" label="Tanggal Transaksi" hide-iso-date />

        <input
          v-model="debtDescription"
          type="text"
          maxlength="150"
          placeholder="Deskripsi Hutang / Piutang"
          required
          class="w-full min-h-[54px] sm:min-h-[50px] px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 text-sm sm:text-base text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
        />

        <input
          :value="debtAmountDisplay"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          placeholder="Nominal Pokok (Rp)"
          required
          class="w-full min-h-[54px] sm:min-h-[50px] px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 text-base sm:text-lg font-money font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
          @input="handleDebtAmountInput"
        />

        <div class="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 p-3.5 space-y-2.5">
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Calendar class="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Deadline Jatuh Tempo (Opsional)</span>
            </span>
            <label class="relative inline-flex items-center cursor-pointer select-none">
              <input v-model="hasDeadline" type="checkbox" class="sr-only peer" />
              <div class="w-9 h-5 bg-slate-200 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>

          <div v-if="hasDeadline" class="flex items-center gap-2 min-w-0">
            <div class="flex-1 min-w-0">
              <MaterialDatePicker
                v-model="debtDeadline"
                label="Tanggal Jatuh Tempo"
                hide-iso-date
              />
            </div>
            <button
              type="button"
              class="w-11 h-[54px] sm:h-[50px] shrink-0 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 hover:text-rose-600 hover:border-rose-300 dark:hover:border-rose-800 flex items-center justify-center transition-colors cursor-pointer"
              title="Hapus deadline"
              @click="hasDeadline = false"
            >
              <X class="w-4 h-4" />
            </button>
          </div>
        </div>

        <input
          v-model="debtNote"
          type="text"
          maxlength="200"
          placeholder="Catatan Tambahan (Opsional)"
          class="w-full min-h-[50px] px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
        />

        <div class="flex items-center justify-between gap-2 px-1">
          <span class="text-xs font-semibold text-slate-600 dark:text-slate-400">
            Warna Aksen Kartu
          </span>
          <div class="flex items-center gap-2">
            <button
              v-for="c in DEBT_COLOR_OPTIONS"
              :key="c.value"
              type="button"
              class="w-6 h-6 rounded-full transition-transform cursor-pointer flex items-center justify-center"
              :class="[
                getAccentDotClass(c.value),
                debtColor === c.value ? 'ring-2 ring-offset-2 ring-slate-900 dark:ring-white scale-110' : 'opacity-70 hover:opacity-100',
              ]"
              :title="c.label"
              @click="debtColor = c.value"
            >
              <Check v-if="debtColor === c.value" class="w-3.5 h-3.5 text-white" />
            </button>
          </div>
        </div>

        <div class="rounded-2xl border border-emerald-500/30 dark:border-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-950/20 p-3.5 space-y-3">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2 text-xs font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider">
              <BellRing class="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>Pengingat {{ debtType === 'debt' ? 'Cicilan Hutang' : 'Penagihan Piutang' }}</span>
            </div>
            <label class="relative inline-flex items-center cursor-pointer select-none">
              <input v-model="debtReminderEnabled" type="checkbox" class="sr-only peer" />
              <div class="w-9 h-5 bg-slate-200 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>

          <div v-if="debtReminderEnabled" class="space-y-3 pt-1">
            <div class="grid grid-cols-2 gap-2">
              <button
                type="button"
                class="min-h-[40px] px-3 py-2 rounded-xl text-xs font-semibold border transition-all text-left flex items-center justify-between cursor-pointer"
                :class="
                  debtScheduleMode === 'single'
                    ? 'border-emerald-600 bg-emerald-600 text-white shadow-xs'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                "
                @click="debtScheduleMode = 'single'"
              >
                <span>Tgl Tertentu Tiap Bulan</span>
                <Check v-if="debtScheduleMode === 'single'" class="w-3.5 h-3.5 shrink-0" />
              </button>
              <button
                type="button"
                class="min-h-[40px] px-3 py-2 rounded-xl text-xs font-semibold border transition-all text-left flex items-center justify-between cursor-pointer"
                :class="
                  debtScheduleMode === 'multiple'
                    ? 'border-emerald-600 bg-emerald-600 text-white shadow-xs'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                "
                @click="debtScheduleMode = 'multiple'"
              >
                <span>Beberapa Tanggal</span>
                <Check v-if="debtScheduleMode === 'multiple'" class="w-3.5 h-3.5 shrink-0" />
              </button>
            </div>

            <div v-if="debtScheduleMode === 'single'">
              <CustomSelect
                v-model="debtSingleDayStr"
                :options="singleDayOptions"
                placeholder="Pilih Tanggal Pengingat (1-31)"
              />
            </div>

            <div v-else class="space-y-1.5">
              <div class="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400">
                <span class="font-medium">Klik tanggal yang diinginkan:</span>
                <span class="font-bold text-emerald-600 dark:text-emerald-400">
                  {{ debtSelectedDays.length }} tanggal dipilih
                </span>
              </div>
              <div class="grid grid-cols-7 sm:grid-cols-11 gap-1">
                <button
                  v-for="d in 31"
                  :key="d"
                  type="button"
                  class="h-8 rounded-lg text-xs font-bold transition-all flex items-center justify-center cursor-pointer"
                  :class="
                    debtSelectedDays.includes(d)
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-emerald-500'
                  "
                  @click="toggleDebtDaySelection(d)"
                >
                  {{ d }}
                </button>
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div class="min-h-[46px] flex items-center justify-between bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2">
                <span class="text-xs text-slate-500 font-medium">Jam Pengingat:</span>
                <input
                  v-model="debtReminderTime"
                  type="time"
                  class="bg-transparent text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none cursor-pointer"
                />
              </div>

              <input
                :value="debtReminderAmountDisplay"
                type="text"
                inputmode="numeric"
                autocomplete="off"
                placeholder="Saran Cicilan (Rp · Opsional)"
                class="w-full min-h-[46px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-money font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
                @input="handleDebtReminderAmountInput"
              />
            </div>

            <div class="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-400 pt-1">
              <span>Pengingat akan muncul sebagai banner in-app &amp; Push Notifikasi native.</span>
              <button
                v-if="debtsStore.notificationPermission !== 'granted'"
                type="button"
                class="text-emerald-600 dark:text-emerald-400 font-bold hover:underline cursor-pointer"
                @click="debtsStore.requestNotificationPermission()"
              >
                Izinkan Push Notifikasi &rarr;
              </button>
            </div>
          </div>
        </div>

        <button
          type="button"
          :disabled="isSavingDebt"
          class="w-full min-h-[50px] rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
          @click="submitEditForm"
        >
          <Check class="w-4 h-4" />
          <span>Simpan Perubahan</span>
        </button>
      </div>
    </AppModal>

    <!-- =================================================================== -->
    <!-- MODAL 2: Catat Pelunasan ("Cicil" / "Terima")                       -->
    <!-- =================================================================== -->
    <AppModal
      :open="installmentModalOpen"
      :title="
        debt
          ? `${debt.type === 'debt' ? 'Cicil Hutang' : 'Terima Piutang'}: ${debt.description}`
          : 'Catat Pelunasan'
      "
      max-width="lg"
      @close="installmentModalOpen = false"
    >
      <div v-if="debt" class="space-y-3.5">
        <div
          class="px-3.5 py-2.5 rounded-2xl text-xs font-medium border flex items-center justify-between gap-2"
          :class="
            debt.type === 'debt'
              ? 'bg-rose-50/80 dark:bg-rose-950/30 border-rose-200/80 dark:border-rose-900/50 text-rose-700 dark:text-rose-300'
              : 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-200/80 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-300'
          "
        >
          <span>
            Sisa {{ debt.type === 'debt' ? 'Hutang' : 'Piutang' }}:
            <strong class="font-money font-bold">
              {{ themeStore.formatMoney(remainingAmount) }}
            </strong>
          </span>
          <button
            type="button"
            class="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-current/20 text-[11px] font-bold hover:opacity-90 cursor-pointer"
            @click="fillRemainingAmount"
          >
            Lunasi Sisa
          </button>
        </div>

        <CustomSelect
          v-model="instWalletId"
          :options="instWalletOptions"
          placeholder="Sumber Dana"
        />

        <CustomSelect
          v-model="instFundOwnerId"
          :options="instHolderOptions"
          :disabled="!instWalletId || instHolders.length === 0"
          placeholder="Kepemilikan Dana"
        />

        <MaterialDatePicker v-model="instDate" label="Tanggal Pelunasan" hide-iso-date />

        <input
          :value="instAmountDisplay"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          placeholder="Nominal (Rp)"
          required
          class="w-full min-h-[54px] sm:min-h-[50px] px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 text-base sm:text-lg font-money font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
          @input="handleInstallmentAmountInput"
        />

        <input
          v-model="instNote"
          type="text"
          maxlength="200"
          placeholder="Deskripsi / Catatan Pelunasan"
          class="w-full min-h-[50px] px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
        />

        <div class="px-3 py-2 rounded-xl bg-slate-100/80 dark:bg-slate-800/60 text-[11px] text-slate-600 dark:text-slate-400">
          Otomatis mencatat ke menu Transaksi dengan kategori
          <strong class="text-slate-900 dark:text-slate-200">
            {{
              debt.type === 'debt'
                ? DEBT_TX_CATEGORIES.debtPay
                : DEBT_TX_CATEGORIES.receivableReceive
            }}
          </strong>.
        </div>

        <p v-if="instError" class="text-xs font-medium text-rose-600 dark:text-rose-400 px-1">
          {{ instError }}
        </p>

        <button
          type="button"
          :disabled="isSubmittingInstallment"
          class="w-full min-h-[50px] rounded-2xl text-white text-sm font-bold transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
          :class="
            debt.type === 'debt'
              ? 'bg-rose-600 hover:bg-rose-700'
              : 'bg-emerald-600 hover:bg-emerald-700'
          "
          @click="submitInstallment"
        >
          <Check class="w-4 h-4" />
          <span>{{ debt.type === 'debt' ? 'Simpan Cicilan Hutang' : 'Simpan Penerimaan Piutang' }}</span>
        </button>
      </div>
    </AppModal>
  </div>
</template>
