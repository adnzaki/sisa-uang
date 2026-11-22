<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  HandCoins,
  Plus,
  Pencil,
  Trash2,
  Calendar,
  Wallet,
  Clock,
  Check,
  Bell,
  BellRing,
  BellOff,
  RefreshCw,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  X,
  Crown,
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

const isRefreshing = ref(false);
const filterTab = ref<'all' | 'debt' | 'receivable' | 'unpaid' | 'settled' | 'reminder'>('all');

// =========================================================================
// Load & Sync
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
  void debtsStore.checkAndTriggerReminders();
}

async function handleManualRefresh() {
  if (isRefreshing.value) return;
  isRefreshing.value = true;
  try {
    await ensureDataReady(true);
    notificationStore.notifySuccess(
      'Data Hutang & Piutang Disegarkan',
      'Daftar hutang/piutang, riwayat pelunasan, dan saldo dompet telah diperbarui.'
    );
  } catch (err: any) {
    notificationStore.notifyError('Gagal Menyegarkan Data', err?.message || err);
  } finally {
    isRefreshing.value = false;
  }
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
// Filtered Items & Summary Counters
// =========================================================================

const isBothFreeQuotaFull = computed(
  () =>
    !authStore.isProUser &&
    debtsStore.debtItems.length >= MAX_FREE_DEBTS_PER_TYPE &&
    debtsStore.receivableItems.length >= MAX_FREE_DEBTS_PER_TYPE
);

const unpaidCount = computed(
  () => debtsStore.activeDebts.filter((d) => !debtsStore.isDebtSettled(d)).length
);

const settledCount = computed(
  () => debtsStore.activeDebts.filter((d) => debtsStore.isDebtSettled(d)).length
);

const reminderCount = computed(
  () => debtsStore.activeDebts.filter((d) => d.reminderEnabled).length
);

const filteredDebts = computed(() => {
  const list = debtsStore.activeDebts;
  if (filterTab.value === 'debt') {
    return list.filter((d) => d.type === 'debt');
  }
  if (filterTab.value === 'receivable') {
    return list.filter((d) => d.type === 'receivable');
  }
  if (filterTab.value === 'unpaid') {
    return list.filter((d) => !debtsStore.isDebtSettled(d));
  }
  if (filterTab.value === 'settled') {
    return list.filter((d) => debtsStore.isDebtSettled(d));
  }
  if (filterTab.value === 'reminder') {
    return list.filter((d) => d.reminderEnabled);
  }
  return list;
});

function getDebtProgressPercent(debt: DebtItem): number {
  const paid = debtsStore.getDebtPaidAmount(debt.id);
  const principal = Math.max(1, Number(debt.amount) || 1);
  return Math.min(100, Math.round((paid / principal) * 100));
}

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

function formatDateShort(iso?: string | null): string {
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

// =========================================================================
// Navigation to Detail Page
// =========================================================================

function openDetailPage(debt: DebtItem) {
  void router.push(`/utilities/debts/${encodeURIComponent(debt.id)}`);
}

// =========================================================================
// MODAL 1: Create / Edit Debt or Receivable
// =========================================================================

const debtModalOpen = ref(false);
const editingDebtId = ref<string | null>(null);
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

const selectedDebtHolderOperationalBalance = computed(() => {
  if (!debtWalletId.value) return 0;
  return savingsStore.getHolderOperationalBalance(debtWalletId.value, debtFundOwnerId.value);
});

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

const singleDayOptions = computed<SelectOptionItem[]>(() =>
  Array.from({ length: 31 }, (_, i) => {
    const dayNum = i + 1;
    return {
      value: String(dayNum),
      label: `Setiap tanggal ${dayNum}`,
    };
  })
);

function handleSelectDebtType(targetType: DebtType) {
  const existing = editingDebtId.value
    ? debtsStore.activeDebts.find((d) => d.id === editingDebtId.value)
    : undefined;
  const needsQuotaCheck = !existing || existing.type !== targetType;

  if (needsQuotaCheck && !authStore.isProUser) {
    const count =
      targetType === 'debt' ? debtsStore.debtItems.length : debtsStore.receivableItems.length;
    if (count >= MAX_FREE_DEBTS_PER_TYPE) {
      notificationStore.openProModal({
        featureTitle:
          targetType === 'debt'
            ? `Batas Maksimal ${MAX_FREE_DEBTS_PER_TYPE} Catatan Hutang`
            : `Batas Maksimal ${MAX_FREE_DEBTS_PER_TYPE} Catatan Piutang`,
        featureDescription: `Pengguna paket Free hanya dapat menambahkan maksimal ${MAX_FREE_DEBTS_PER_TYPE} Hutang dan ${MAX_FREE_DEBTS_PER_TYPE} Piutang aktif. Upgrade ke SisaUang Pro untuk pencatatan tanpa batas.`,
        limitSummary: `${count} / ${MAX_FREE_DEBTS_PER_TYPE} ${targetType === 'debt' ? 'Hutang' : 'Piutang'} Aktif`,
      });
      return;
    }
  }

  debtType.value = targetType;
  if (!editingDebtId.value) {
    debtColor.value = targetType === 'receivable' ? 'emerald' : 'rose';
  }
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

function openCreateDebtModal() {
  if (financeStore.wallets.length === 0) {
    notificationStore.notifyWarning(
      'Belum Ada Sumber Dana',
      'Buat minimal 1 Dompet terlebih dahulu di menu Sumber Dana sebelum mencatat Hutang/Piutang.'
    );
    return;
  }

  const debtFull = !authStore.isProUser && debtsStore.debtItems.length >= MAX_FREE_DEBTS_PER_TYPE;
  const recFull = !authStore.isProUser && debtsStore.receivableItems.length >= MAX_FREE_DEBTS_PER_TYPE;

  if (debtFull && recFull) {
    notificationStore.openProModal({
      featureTitle: 'Batas Kuota Hutang & Piutang Free Tercapai',
      featureDescription: `Pengguna paket Free dibatasi maksimal ${MAX_FREE_DEBTS_PER_TYPE} Hutang dan ${MAX_FREE_DEBTS_PER_TYPE} Piutang aktif. Upgrade ke SisaUang Pro untuk menambahkan Hutang & Piutang tanpa batas.`,
      limitSummary: `Hutang ${debtsStore.debtItems.length}/${MAX_FREE_DEBTS_PER_TYPE} · Piutang ${debtsStore.receivableItems.length}/${MAX_FREE_DEBTS_PER_TYPE}`,
    });
    return;
  }

  const defaultType: DebtType = debtFull && !recFull ? 'receivable' : 'debt';
  editingDebtId.value = null;
  debtType.value = defaultType;
  const firstWallet = financeStore.wallets[0];
  debtWalletId.value = firstWallet?.id || '';
  const holders = firstWallet ? financeStore.getHoldersByWalletId(firstWallet.id) : [];
  debtFundOwnerId.value = holders[0]?.id || '';
  debtDate.value = getTodayIsoDate();
  debtDescription.value = '';
  debtAmount.value = '';
  debtAmountDisplay.value = '';
  hasDeadline.value = false;
  debtDeadline.value = getTodayIsoDate();
  debtNote.value = '';
  debtColor.value = defaultType === 'receivable' ? 'emerald' : 'rose';
  debtReminderEnabled.value = false;
  debtScheduleMode.value = 'single';
  debtSingleDayStr.value = '1';
  debtSelectedDays.value = [1];
  debtReminderTime.value = '09:00';
  debtReminderAmount.value = '';
  debtReminderAmountDisplay.value = '';
  debtModalOpen.value = true;
}

function openEditDebtModal(debt: DebtItem) {
  editingDebtId.value = debt.id;
  debtType.value = debt.type;
  debtWalletId.value = debt.walletId || financeStore.wallets[0]?.id || '';
  const holders = debtWalletId.value ? financeStore.getHoldersByWalletId(debtWalletId.value) : [];
  debtFundOwnerId.value =
    (debt.fundOwnerId && holders.some((h) => h.id === debt.fundOwnerId)
      ? debt.fundOwnerId
      : holders[0]?.id) || '';
  debtDate.value = debt.date || getTodayIsoDate();
  debtDescription.value = debt.description;
  const numAmount = Math.max(0, Number(debt.amount) || 0);
  debtAmount.value = numAmount > 0 ? String(numAmount) : '';
  debtAmountDisplay.value = numAmount > 0 ? numAmount.toLocaleString('id-ID') : '';
  hasDeadline.value = Boolean(debt.deadline);
  debtDeadline.value = debt.deadline || getTodayIsoDate();
  debtNote.value = debt.note || '';
  debtColor.value = debt.color || (debt.type === 'receivable' ? 'emerald' : 'rose');
  debtReminderEnabled.value = Boolean(debt.reminderEnabled);
  const days =
    debt.reminderDays && debt.reminderDays.length > 0 ? [...debt.reminderDays] : [1];
  if (days.length > 1) {
    debtScheduleMode.value = 'multiple';
    debtSelectedDays.value = days;
    debtSingleDayStr.value = String(days[0]);
  } else {
    debtScheduleMode.value = 'single';
    debtSingleDayStr.value = String(days[0]);
    debtSelectedDays.value = days;
  }
  debtReminderTime.value = debt.reminderTime || '09:00';
  const numReminder = debt.reminderAmount ? Number(debt.reminderAmount) : 0;
  debtReminderAmount.value = numReminder > 0 ? String(numReminder) : '';
  debtReminderAmountDisplay.value = numReminder > 0 ? numReminder.toLocaleString('id-ID') : '';
  debtModalOpen.value = true;
}

async function submitDebtForm() {
  if (isSavingDebt.value) return;
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
      id: editingDebtId.value || undefined,
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
      debtModalOpen.value = false;
    }
  } finally {
    isSavingDebt.value = false;
  }
}

// =========================================================================
// MODAL 2: Record Installment ("Cicil" for Hutang / "Terima" for Piutang)
// =========================================================================

const installmentModalOpen = ref(false);
const activeDebtForInstallment = ref<DebtItem | null>(null);
const instWalletId = ref<string>('');
const instFundOwnerId = ref<string>('');
const instAmount = ref<string>('');
const instAmountDisplay = ref<string>('');
const instDate = ref<string>(getTodayIsoDate());
const instNote = ref<string>('');
const instError = ref<string>('');
const isSubmittingInstallment = ref(false);

const instWalletOptions = computed<SelectOptionItem[]>(() => {
  return financeStore.wallets.map((w) => {
    const opBal = savingsStore.getWalletOperationalBalance(w.id);
    return {
      value: w.id,
      label: `${w.name} (Saldo Bebas: ${themeStore.formatMoney(opBal)})`,
    };
  });
});

const instHolders = computed(() =>
  instWalletId.value ? financeStore.getHoldersByWalletId(instWalletId.value) : []
);

const instHolderOptions = computed<SelectOptionItem[]>(() =>
  instHolders.value.map((h) => {
    const opBal = savingsStore.getHolderOperationalBalance(instWalletId.value, h.id);
    return {
      value: h.id,
      label: `${formatHolderName(h.holderName)} (Bebas: ${themeStore.formatMoney(opBal)})`,
    };
  })
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

function openInstallmentModal(debt: DebtItem, suggestedAmount?: number) {
  if (financeStore.wallets.length === 0) {
    notificationStore.notifyWarning(
      'Belum Ada Sumber Dana',
      'Buat minimal 1 Dompet terlebih dahulu di menu Sumber Dana.'
    );
    return;
  }

  const remaining = debtsStore.getDebtRemainingAmount(debt);
  if (remaining <= 0) {
    notificationStore.notifyInfo(
      'Sudah Lunas',
      `${debt.type === 'debt' ? 'Hutang' : 'Piutang'} "${debt.description}" sudah lunas sepenuhnya.`
    );
    return;
  }

  activeDebtForInstallment.value = debt;
  const preferredWallet =
    financeStore.wallets.find((w) => w.id === debt.walletId) || financeStore.wallets[0];
  instWalletId.value = preferredWallet?.id || '';
  const holders = preferredWallet ? financeStore.getHoldersByWalletId(preferredWallet.id) : [];
  instFundOwnerId.value =
    (debt.fundOwnerId && holders.some((h) => h.id === debt.fundOwnerId)
      ? debt.fundOwnerId
      : holders[0]?.id) || '';

  const initialAmount =
    suggestedAmount && suggestedAmount > 0
      ? Math.min(suggestedAmount, remaining)
      : debt.reminderAmount && debt.reminderAmount > 0
        ? Math.min(debt.reminderAmount, remaining)
        : 0;
  instAmount.value = initialAmount > 0 ? String(initialAmount) : '';
  instAmountDisplay.value = initialAmount > 0 ? initialAmount.toLocaleString('id-ID') : '';
  instDate.value = getTodayIsoDate();
  instNote.value =
    debt.type === 'debt'
      ? `Cicilan hutang: ${debt.description}`
      : `Penerimaan piutang: ${debt.description}`;
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
  if (!activeDebtForInstallment.value) return;
  const rem = debtsStore.getDebtRemainingAmount(activeDebtForInstallment.value);
  if (rem > 0) {
    instAmount.value = String(rem);
    instAmountDisplay.value = rem.toLocaleString('id-ID');
  }
}

async function submitInstallment() {
  if (!activeDebtForInstallment.value || isSubmittingInstallment.value) return;
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
      debtId: activeDebtForInstallment.value.id,
      walletId: instWalletId.value,
      fundOwnerId: instFundOwnerId.value || undefined,
      amount: numericAmount,
      date: instDate.value || getTodayIsoDate(),
      note:
        instNote.value.trim() ||
        (activeDebtForInstallment.value.type === 'debt'
          ? `Cicilan hutang: ${activeDebtForInstallment.value.description}`
          : `Penerimaan piutang: ${activeDebtForInstallment.value.description}`),
    });
    installmentModalOpen.value = false;
  } catch (err: any) {
    instError.value = err?.message || 'Gagal mencatat pelunasan.';
  } finally {
    isSubmittingInstallment.value = false;
  }
}

// Handle navigation from DebtReminderBanner
function handleExternalInstallmentRequest() {
  const req = debtsStore.installmentModalRequest;
  const queryDebtId = String(route.query.debtId || '').trim();
  const targetId = req?.debtId || queryDebtId;

  if (targetId && debtsStore.activeDebts.length > 0) {
    const targetDebt = debtsStore.activeDebts.find((d) => d.id === targetId);
    if (targetDebt) {
      debtsStore.clearInstallmentModalRequest();
      openInstallmentModal(targetDebt, targetDebt.reminderAmount || undefined);
      if (route.query.debtId || route.query.action) {
        void router.replace({ path: '/utilities/debts', query: {} });
      }
    }
  }
}

watch(
  () => [debtsStore.installmentModalRequest, debtsStore.activeDebts.length, route.query.debtId],
  () => {
    handleExternalInstallmentRequest();
  }
);
</script>

<template>
  <div class="space-y-6 pb-8">
    <!-- Header Section (Matching SavingsView Layout) -->
    <div class="grid grid-cols-[1fr_auto] sm:flex sm:items-center sm:justify-between gap-x-3 gap-y-3 sm:gap-4">
      <div class="col-span-1 min-w-0 sm:flex-1">
        <h1 class="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Hutang &amp; Piutang
        </h1>
        <p class="hidden sm:block text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Catat pinjaman &amp; piutang terintegrasi otomatis ke Transaksi lengkap dengan pengingat cicilan.
        </p>
      </div>

      <div class="contents sm:flex sm:items-center sm:gap-2 sm:shrink-0 sm:flex-nowrap">
        <div class="flex items-center justify-end gap-2 shrink-0 justify-self-end self-start sm:self-center">
          <button
            v-if="debtsStore.notificationPermission !== 'unsupported'"
            type="button"
            class="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl border transition-all flex items-center justify-center shrink-0 cursor-pointer active:scale-95"
            :class="
              debtsStore.notificationPermission === 'granted'
                ? 'border-teal-400/60 dark:border-teal-400/40 bg-gradient-to-br from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 text-white shadow-sm shadow-teal-600/20'
                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 shadow-2xs'
            "
            :title="
              debtsStore.notificationPermission === 'granted'
                ? 'Push Notifikasi Pengingat Cicilan Aktif'
                : 'Aktifkan Push Notifikasi Pengingat Cicilan'
            "
            :aria-label="
              debtsStore.notificationPermission === 'granted'
                ? 'Push Notifikasi Pengingat Cicilan Aktif'
                : 'Aktifkan Push Notifikasi Pengingat Cicilan'
            "
            @click="debtsStore.requestNotificationPermission()"
          >
            <Bell
              v-if="debtsStore.notificationPermission === 'granted'"
              class="w-4.5 h-4.5 shrink-0"
            />
            <BellOff v-else class="w-4.5 h-4.5 shrink-0 text-amber-500 dark:text-amber-400" />
          </button>

          <button
            type="button"
            :disabled="isRefreshing"
            class="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-all shadow-2xs flex items-center justify-center shrink-0 cursor-pointer disabled:opacity-50 active:scale-95"
            title="Segarkan Data Hutang & Piutang"
            aria-label="Segarkan Data Hutang & Piutang"
            @click="handleManualRefresh"
          >
            <RefreshCw
              class="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-400"
              :class="{ 'animate-spin': isRefreshing }"
            />
          </button>
        </div>

        <p class="col-span-2 sm:hidden text-xs text-slate-500 dark:text-slate-400 -mt-1">
          Catat pinjaman &amp; piutang terintegrasi otomatis ke Transaksi lengkap dengan pengingat cicilan.
        </p>

        <button
          type="button"
          class="col-span-2 sm:col-span-1 w-full sm:w-auto h-11 min-h-[44px] px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-all shadow-sm hover:shadow active:scale-[0.98] flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
          @click="openCreateDebtModal"
        >
          <Plus class="w-4 h-4 shrink-0" />
          <span>Tambah Catatan</span>
          <span
            v-if="isBothFreeQuotaFull"
            class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-400 text-slate-950 text-[10px] font-extrabold uppercase tracking-wider"
          >
            <Crown class="w-3 h-3 shrink-0" />
            <span>PRO</span>
          </span>
        </button>
      </div>
    </div>

    <!-- Hero Summary Overview Card (Matching SavingsView Hero Card) -->
    <section class="rounded-3xl border border-slate-200/90 dark:border-slate-800/90 bg-white dark:bg-slate-900 p-5 sm:p-6 space-y-4 shadow-sm">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
        <!-- Total Sisa Hutang -->
        <div class="space-y-1">
          <div class="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <ArrowDownLeft class="w-3.5 h-3.5 text-rose-500" />
            <span>Total Sisa Hutang</span>
          </div>
          <div class="text-2xl sm:text-3xl font-money font-bold tracking-tight text-rose-600 dark:text-rose-400 truncate">
            {{ themeStore.formatMoney(debtsStore.totalDebtRemaining) }}
          </div>
          <p class="text-[11px] text-slate-500 dark:text-slate-400 font-money">
            Terbayar {{ themeStore.formatMoney(debtsStore.totalDebtPaid) }} / {{ themeStore.formatMoney(debtsStore.totalDebtPrincipal) }}
          </p>
        </div>

        <!-- Total Sisa Piutang -->
        <div class="md:border-l border-slate-100 dark:border-slate-800 md:pl-5 space-y-1">
          <div class="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <ArrowUpRight class="w-3.5 h-3.5 text-emerald-500" />
            <span>Total Sisa Piutang</span>
          </div>
          <div class="text-2xl sm:text-3xl font-money font-bold tracking-tight text-emerald-600 dark:text-emerald-400 truncate">
            {{ themeStore.formatMoney(debtsStore.totalReceivableRemaining) }}
          </div>
          <p class="text-[11px] text-slate-500 dark:text-slate-400 font-money">
            Diterima {{ themeStore.formatMoney(debtsStore.totalReceivableCollected) }} / {{ themeStore.formatMoney(debtsStore.totalReceivablePrincipal) }}
          </p>
        </div>

        <!-- Posisi Bersih (Piutang - Hutang) -->
        <div class="md:border-l border-slate-100 dark:border-slate-800 md:pl-5 space-y-1">
          <div class="text-xs font-medium text-slate-500 dark:text-slate-400">
            Posisi Bersih (Piutang - Hutang)
          </div>
          <div
            class="text-2xl sm:text-3xl font-money font-bold tracking-tight truncate"
            :class="
              debtsStore.totalReceivableRemaining - debtsStore.totalDebtRemaining >= 0
                ? 'text-teal-600 dark:text-teal-400'
                : 'text-amber-600 dark:text-amber-400'
            "
          >
            {{ themeStore.formatMoney(debtsStore.totalReceivableRemaining - debtsStore.totalDebtRemaining) }}
          </div>
          <p class="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-1.5">
            <span>
              {{ debtsStore.debtItems.length }}{{ !authStore.isProUser ? ` / ${MAX_FREE_DEBTS_PER_TYPE}` : '' }} Hutang ·
              {{ debtsStore.receivableItems.length }}{{ !authStore.isProUser ? ` / ${MAX_FREE_DEBTS_PER_TYPE}` : '' }} Piutang
            </span>
            <span
              v-if="!authStore.isProUser"
              class="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] font-sans font-semibold text-slate-600 dark:text-slate-400"
            >
              Paket Free (Maks. {{ MAX_FREE_DEBTS_PER_TYPE }} per jenis)
            </span>
            <span
              v-else
              class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/60 text-[10px] font-sans font-semibold text-amber-700 dark:text-amber-300"
            >
              <Crown class="w-3 h-3 shrink-0" />
              <span>PRO Unlimited</span>
            </span>
          </p>
        </div>
      </div>

      <!-- Free Quota Footer Notice when nearing/at limit -->
      <div
        v-if="!authStore.isProUser && (debtsStore.debtItems.length >= MAX_FREE_DEBTS_PER_TYPE || debtsStore.receivableItems.length >= MAX_FREE_DEBTS_PER_TYPE)"
        class="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400"
      >
        <span>
          {{ unpaidCount }} catatan belum lunas · {{ settledCount }} sudah lunas
        </span>
        <button
          type="button"
          class="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-[11px] font-bold transition-colors cursor-pointer"
          @click="
            notificationStore.openProModal({
              featureTitle: 'Upgrade ke SisaUang Pro',
              featureDescription: 'Catat Hutang dan Piutang tanpa batas beserta pengingat cicilan & push notifikasi.',
              limitSummary: `Hutang ${debtsStore.debtItems.length}/${MAX_FREE_DEBTS_PER_TYPE} · Piutang ${debtsStore.receivableItems.length}/${MAX_FREE_DEBTS_PER_TYPE}`,
            })
          "
        >
          <Crown class="w-3 h-3" />
          <span>Upgrade Pro (Unlimited)</span>
        </button>
      </div>
    </section>

    <!-- Filter Tabs (Matching SavingsView) -->
    <div class="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
      <button
        v-for="tab in [
          { key: 'all', label: `Semua (${debtsStore.activeDebts.length})` },
          { key: 'debt', label: `Hutang (${debtsStore.debtItems.length})` },
          { key: 'receivable', label: `Piutang (${debtsStore.receivableItems.length})` },
          { key: 'unpaid', label: `Belum Lunas (${unpaidCount})` },
          { key: 'settled', label: `Lunas (${settledCount})` },
          { key: 'reminder', label: `Dengan Pengingat (${reminderCount})` },
        ]"
        :key="tab.key"
        type="button"
        class="px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
        :class="
          filterTab === tab.key
            ? 'bg-emerald-600 text-white shadow-2xs'
            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
        "
        @click="filterTab = tab.key as any"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- Empty State -->
    <div
      v-if="!debtsStore.isLoading && filteredDebts.length === 0"
      class="rounded-3xl border border-dashed border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-10 text-center space-y-4"
    >
      <div class="w-14 h-14 rounded-3xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
        <HandCoins class="w-7 h-7" />
      </div>
      <div class="max-w-md mx-auto space-y-1">
        <h3 class="text-base font-bold text-slate-800 dark:text-slate-200">
          Belum Ada Catatan Hutang atau Piutang
        </h3>
        <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
          Catat hutang atau piutang Anda secara terstruktur. Pencatatan baru maupun pembayaran cicilan akan langsung tersinkronisasi dengan daftar Transaksi &amp; saldo dompet Anda.
        </p>
      </div>
      <div>
        <button
          type="button"
          class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold transition-all inline-flex items-center gap-1.5 cursor-pointer"
          @click="openCreateDebtModal"
        >
          <Plus class="w-4 h-4" />
          <span>Buat Catatan Pertama</span>
          <span
            v-if="isBothFreeQuotaFull"
            class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-400 text-slate-950 text-[10px] font-extrabold uppercase tracking-wider"
          >
            <Crown class="w-3 h-3 shrink-0" />
            <span>PRO</span>
          </span>
        </button>
      </div>
    </div>

    <!-- Debt & Receivable Cards Grid (Matching SavingsView Card System) -->
    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <div
        v-for="debt in filteredDebts"
        :key="debt.id"
        role="button"
        tabindex="0"
        class="rounded-3xl border border-slate-200/90 dark:border-slate-800/90 bg-white dark:bg-slate-900 p-5 shadow-sm hover:shadow-md hover:border-emerald-500/40 transition-all flex flex-col justify-between gap-4 cursor-pointer text-left"
        @click="openDetailPage(debt)"
        @keydown.enter="openDetailPage(debt)"
      >
        <div class="space-y-3.5">
          <!-- Card Header: Icon, Description, Type & Settlement Status -->
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-3 min-w-0 flex-1">
              <div
                class="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
                :class="getAccentIconClass(debt.color)"
              >
                <ArrowDownLeft v-if="debt.type === 'debt'" class="w-5 h-5" />
                <ArrowUpRight v-else class="w-5 h-5" />
              </div>
              <div class="min-w-0 flex-1">
                <h3
                  class="text-base font-bold text-slate-900 dark:text-slate-100 truncate"
                  :title="debt.description"
                >
                  {{ debt.description }}
                </h3>
                <div class="text-xs font-semibold truncate">
                  <span
                    :class="
                      debt.type === 'debt'
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                    "
                  >
                    {{ debt.type === 'debt' ? 'Hutang' : 'Piutang' }}
                  </span>
                  <span class="text-slate-400 mx-1">·</span>
                  <span class="text-slate-500 dark:text-slate-400 font-normal">
                    {{ formatDateShort(debt.date) }}
                  </span>
                </div>
              </div>
            </div>

            <span
              class="px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider shrink-0"
              :class="
                debtsStore.isDebtSettled(debt)
                  ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              "
            >
              {{ debtsStore.isDebtSettled(debt) ? 'Lunas' : `${getDebtProgressPercent(debt)}%` }}
            </span>
          </div>

          <!-- Amount & Progress Bar -->
          <div class="space-y-2">
            <div class="flex items-baseline justify-between gap-2">
              <div class="text-xl font-bold font-money text-slate-900 dark:text-slate-100 truncate">
                {{ themeStore.formatMoney(debtsStore.getDebtPaidAmount(debt.id)) }}
              </div>
              <div class="text-xs font-money text-slate-500 dark:text-slate-400 shrink-0">
                / {{ themeStore.formatMoney(debt.amount) }}
              </div>
            </div>

            <div class="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                class="h-full rounded-full transition-all duration-300"
                :class="getAccentBarClass(debt.color)"
                :style="{ width: `${getDebtProgressPercent(debt)}%` }"
              ></div>
            </div>

            <div class="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-money">
              <span v-if="!debtsStore.isDebtSettled(debt)">
                Sisa {{ themeStore.formatMoney(debtsStore.getDebtRemainingAmount(debt)) }}
              </span>
              <span v-else class="text-emerald-600 dark:text-emerald-400 font-sans font-semibold flex items-center gap-1">
                <CheckCircle2 class="w-3.5 h-3.5" />
                {{ debt.type === 'debt' ? 'Hutang sudah lunas' : 'Piutang sudah diterima' }}
              </span>
              <span>{{ debtsStore.getDebtEntries(debt.id).length }} riwayat</span>
            </div>
          </div>

          <!-- Source Wallet, Deadline, Reminder Info -->
          <div class="space-y-1.5 text-xs text-slate-600 dark:text-slate-300 pt-1">
            <div class="flex items-center gap-2">
              <Wallet class="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span class="truncate">
                {{ debt.walletName }} · {{ formatHolderName(debt.fundOwnerName) }}
              </span>
            </div>

            <div v-if="getDeadlineInfo(debt.deadline)" class="flex items-center gap-2">
              <Calendar class="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span
                class="truncate"
                :class="
                  !debtsStore.isDebtSettled(debt) && getDeadlineInfo(debt.deadline)?.isOverdue
                    ? 'text-rose-600 dark:text-rose-400 font-medium'
                    : ''
                "
              >
                Deadline: {{ getDeadlineInfo(debt.deadline)?.label }}
              </span>
            </div>

            <div v-if="debt.reminderEnabled" class="flex items-center gap-2">
              <BellRing class="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span class="text-emerald-700 dark:text-emerald-300 font-medium truncate">
                Pengingat: {{ formatDaysDisplay(debt.reminderDays) }} · {{ debt.reminderTime || '09:00' }} WIB
              </span>
            </div>

            <p v-if="debt.note" class="text-[11px] text-slate-500 italic line-clamp-1">
              "{{ debt.note }}"
            </p>
          </div>
        </div>

        <!-- Card Quick Actions Footer -->
        <div
          class="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2"
          @click.stop
        >
          <button
            type="button"
            :disabled="debtsStore.isDebtSettled(debt)"
            class="flex-1 min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
            :class="
              debt.type === 'debt'
                ? 'bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300'
                : 'bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300'
            "
            @click="openInstallmentModal(debt)"
          >
            <Plus class="w-3.5 h-3.5 shrink-0" />
            <span>{{ debt.type === 'debt' ? 'Cicil' : 'Terima' }}</span>
          </button>

          <div class="flex items-center gap-1 shrink-0">
            <button
              type="button"
              class="w-9 h-9 rounded-xl text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer"
              title="Edit Catatan"
              @click="openEditDebtModal(debt)"
            >
              <Pencil class="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              class="w-9 h-9 rounded-xl text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/50 flex items-center justify-center transition-colors cursor-pointer"
              title="Hapus Catatan"
              @click="debtsStore.deleteDebt(debt.id)"
            >
              <Trash2 class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- =================================================================== -->
    <!-- MODAL 1: Tambah / Edit Hutang atau Piutang                          -->
    <!-- =================================================================== -->
    <AppModal
      :open="debtModalOpen"
      :title="editingDebtId ? 'Edit Hutang / Piutang' : 'Tambah Hutang / Piutang'"
      max-width="lg"
      @close="debtModalOpen = false"
    >
      <div class="space-y-3.5">
        <!-- 1. Sumber Dana & Kepemilikan Dana -->
        <div class="space-y-2.5">
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

          <div
            v-if="debtWalletId"
            class="px-3.5 py-2 rounded-2xl bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800 text-[11px] flex items-center justify-between gap-2"
          >
            <span class="text-slate-600 dark:text-slate-400">Saldo Bergerak Sumber Dana:</span>
            <span class="font-money font-bold text-slate-900 dark:text-slate-100">
              {{ themeStore.formatMoney(selectedDebtHolderOperationalBalance) }}
            </span>
          </div>
        </div>

        <!-- 2. Segmented Tab Control: Hutang | Piutang (Matching QuickTransactionModal) -->
        <div class="grid grid-cols-2 rounded-full overflow-hidden border border-emerald-600/20 dark:border-emerald-500/20 bg-emerald-600/10 dark:bg-slate-800 p-1 gap-1">
          <button
            type="button"
            class="min-h-[44px] flex items-center justify-center gap-1.5 rounded-full text-xs sm:text-sm font-bold uppercase tracking-wide transition-all duration-150 px-3 cursor-pointer"
            :class="
              debtType === 'debt'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            "
            @click="handleSelectDebtType('debt')"
          >
            <ArrowDownLeft class="w-3.5 h-3.5 shrink-0" />
            <span>Hutang</span>
            <span
              v-if="!authStore.isProUser && !editingDebtId && debtsStore.debtItems.length >= MAX_FREE_DEBTS_PER_TYPE"
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
            @click="handleSelectDebtType('receivable')"
          >
            <ArrowUpRight class="w-3.5 h-3.5 shrink-0" />
            <span>Piutang</span>
            <span
              v-if="!authStore.isProUser && !editingDebtId && debtsStore.receivableItems.length >= MAX_FREE_DEBTS_PER_TYPE"
              class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 text-[9px] font-extrabold"
            >
              <Crown class="w-2.5 h-2.5" />
              PRO
            </span>
          </button>
        </div>

        <!-- Helper badge explaining auto-linked transaction category -->
        <div
          class="px-3.5 py-2 rounded-xl text-[11px] font-medium border"
          :class="
            debtType === 'debt'
              ? 'bg-rose-50/80 dark:bg-rose-950/30 border-rose-200/80 dark:border-rose-900/50 text-rose-700 dark:text-rose-300'
              : 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-200/80 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-300'
          "
        >
          <span v-if="debtType === 'debt'">
            Otomatis mencatat transaksi <strong>Income</strong> kategori <strong>{{ DEBT_TX_CATEGORIES.debtCreate }}</strong> ke sumber dana terpilih.
          </span>
          <span v-else>
            Otomatis mencatat transaksi <strong>Expense</strong> kategori <strong>{{ DEBT_TX_CATEGORIES.receivableCreate }}</strong> dari sumber dana terpilih.
          </span>
        </div>

        <!-- 3. Tanggal Transaksi -->
        <MaterialDatePicker v-model="debtDate" label="Tanggal Transaksi" hide-iso-date />

        <!-- 4. Deskripsi -->
        <input
          v-model="debtDescription"
          type="text"
          maxlength="150"
          :placeholder="
            debtType === 'debt'
              ? 'Deskripsi Hutang (misal: Pinjaman ke Budi, Cicilan KTA)'
              : 'Deskripsi Piutang (misal: Pinjaman Rudi, Reimburse Kantor)'
          "
          required
          class="w-full min-h-[54px] sm:min-h-[50px] px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 text-sm sm:text-base text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:outline-none focus:border-emerald-600"
        />

        <!-- 5. Nominal -->
        <input
          :value="debtAmountDisplay"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          placeholder="Nominal Pokok (Rp)"
          required
          class="w-full min-h-[54px] sm:min-h-[50px] px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 text-base sm:text-lg font-money font-semibold text-slate-900 dark:text-slate-100 placeholder:font-sans placeholder:font-normal placeholder:text-sm sm:placeholder:text-base placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:outline-none focus:border-emerald-600"
          @input="handleDebtAmountInput"
        />

        <!-- 6. Deadline / Jatuh Tempo Opsional -->
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

        <!-- Catatan Tambahan -->
        <input
          v-model="debtNote"
          type="text"
          maxlength="200"
          placeholder="Catatan Tambahan (Opsional)"
          class="w-full min-h-[50px] px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:outline-none focus:border-emerald-600"
        />

        <!-- Warna Aksen -->
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

        <!-- 7. Opsi Pengingat Hutang / Piutang (Identical UI to Tabungan) -->
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
            <!-- Tanggal Mode Toggle -->
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

            <!-- Jam & Saran Nominal Cicilan -->
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
                class="w-full min-h-[46px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-money font-semibold text-slate-900 dark:text-slate-100 placeholder:font-sans placeholder:font-normal placeholder:text-slate-500 focus:outline-none focus:border-emerald-600"
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
          @click="submitDebtForm"
        >
          <Check class="w-4 h-4" />
          <span>{{ editingDebtId ? 'Simpan Perubahan' : `Simpan ${debtType === 'debt' ? 'Hutang' : 'Piutang'}` }}</span>
        </button>
      </div>
    </AppModal>

    <!-- =================================================================== -->
    <!-- MODAL 2: Catat Pelunasan ("Cicil" Hutang / "Terima" Piutang)         -->
    <!-- =================================================================== -->
    <AppModal
      :open="installmentModalOpen"
      :title="
        activeDebtForInstallment
          ? `${activeDebtForInstallment.type === 'debt' ? 'Cicil Hutang' : 'Terima Piutang'}: ${activeDebtForInstallment.description}`
          : 'Catat Pelunasan'
      "
      max-width="lg"
      @close="installmentModalOpen = false"
    >
      <div v-if="activeDebtForInstallment" class="space-y-3.5">
        <div
          class="px-3.5 py-2.5 rounded-2xl text-xs font-medium border flex items-center justify-between gap-2"
          :class="
            activeDebtForInstallment.type === 'debt'
              ? 'bg-rose-50/80 dark:bg-rose-950/30 border-rose-200/80 dark:border-rose-900/50 text-rose-700 dark:text-rose-300'
              : 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-200/80 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-300'
          "
        >
          <span>
            Sisa {{ activeDebtForInstallment.type === 'debt' ? 'Hutang' : 'Piutang' }}:
            <strong class="font-money font-bold">
              {{ themeStore.formatMoney(debtsStore.getDebtRemainingAmount(activeDebtForInstallment)) }}
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
          class="w-full min-h-[54px] sm:min-h-[50px] px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 text-base sm:text-lg font-money font-semibold text-slate-900 dark:text-slate-100 placeholder:font-sans placeholder:font-normal placeholder:text-sm sm:placeholder:text-base placeholder:text-slate-500 focus:outline-none focus:border-emerald-600"
          @input="handleInstallmentAmountInput"
        />

        <input
          v-model="instNote"
          type="text"
          maxlength="200"
          placeholder="Deskripsi / Catatan Pelunasan"
          class="w-full min-h-[50px] px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-600"
        />

        <div class="px-3 py-2 rounded-xl bg-slate-100/80 dark:bg-slate-800/60 text-[11px] text-slate-600 dark:text-slate-400">
          Otomatis mencatat ke menu Transaksi dengan kategori
          <strong class="text-slate-900 dark:text-slate-200">
            {{
              activeDebtForInstallment.type === 'debt'
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
            activeDebtForInstallment.type === 'debt'
              ? 'bg-rose-600 hover:bg-rose-700'
              : 'bg-emerald-600 hover:bg-emerald-700'
          "
          @click="submitInstallment"
        >
          <Check class="w-4 h-4" />
          <span>{{ activeDebtForInstallment.type === 'debt' ? 'Simpan Cicilan Hutang' : 'Simpan Penerimaan Piutang' }}</span>
        </button>
      </div>
    </AppModal>
  </div>
</template>
