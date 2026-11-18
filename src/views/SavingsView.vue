<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  PiggyBank,
  Plus,
  Minus,
  Pencil,
  Trash2,
  Calendar,
  Wallet,
  Clock,
  Check,
  BellRing,
  BellOff,
  RefreshCw,
  ArrowDownLeft,
  ArrowUpRight,
  Target,
  Sparkles,
  CheckCircle2,
  X,
} from 'lucide-vue-next';
import { useAuthStore } from '../stores/auth';
import { useFinanceStore, formatHolderName } from '../stores/finance';
import { useSavingsStore } from '../stores/savings';
import { useThemeStore } from '../stores/theme';
import { useNotificationStore } from '../stores/notification';
import { getTodayIsoDate } from '../stores/automation';
import AppModal from '../components/AppModal.vue';
import CustomSelect, { type SelectOptionItem } from '../components/CustomSelect.vue';
import MaterialDatePicker from '../components/MaterialDatePicker.vue';
import {
  SAVINGS_CATEGORIES,
  SAVINGS_COLOR_OPTIONS,
  type SavingsGoalItem,
} from '../types/savings';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const financeStore = useFinanceStore();
const savingsStore = useSavingsStore();
const themeStore = useThemeStore();
const notificationStore = useNotificationStore();

const isRefreshing = ref(false);
const filterTab = ref<'all' | 'active' | 'completed' | 'reminder'>('all');

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
  tasks.push(savingsStore.loadSavings(uid, force));
  await Promise.all(tasks);
  savingsStore.refreshNotificationPermission();
  void savingsStore.checkAndTriggerReminders();
}

async function handleManualRefresh() {
  if (isRefreshing.value) return;
  isRefreshing.value = true;
  try {
    await ensureDataReady(true);
    notificationStore.notifySuccess(
      'Data Tabungan Disegarkan',
      'Daftar target tabungan, progress dana, dan saldo dompet telah diperbarui.'
    );
  } catch (err: any) {
    notificationStore.notifyError('Gagal Menyegarkan Data', err?.message || err);
  } finally {
    isRefreshing.value = false;
  }
}

onMounted(async () => {
  await ensureDataReady(false);
  handleExternalProgressRequest();
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
// Filtered Goals
// =========================================================================

const completedGoalsCount = computed(() =>
  savingsStore.activeGoals.filter(
    (g) => savingsStore.getGoalCollectedAmount(g.id) >= g.targetAmount
  ).length
);

const inProgressGoalsCount = computed(() =>
  savingsStore.activeGoals.filter(
    (g) => savingsStore.getGoalCollectedAmount(g.id) < g.targetAmount
  ).length
);

const reminderGoalsCount = computed(() =>
  savingsStore.activeGoals.filter((g) => g.reminderEnabled).length
);

const filteredGoals = computed(() => {
  const list = savingsStore.activeGoals;
  if (filterTab.value === 'completed') {
    return list.filter((g) => savingsStore.getGoalCollectedAmount(g.id) >= g.targetAmount);
  }
  if (filterTab.value === 'active') {
    return list.filter((g) => savingsStore.getGoalCollectedAmount(g.id) < g.targetAmount);
  }
  if (filterTab.value === 'reminder') {
    return list.filter((g) => g.reminderEnabled);
  }
  return list;
});

const savingsAllocationPercent = computed(() => {
  const total = financeStore.totalBalance;
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((savingsStore.totalSavingsBalance / total) * 100)));
});

// =========================================================================
// Formatting Helpers
// =========================================================================

function formatNominalDisplay(val: number | string | ''): string {
  const digits = String(val ?? '')
    .replace(/\D/g, '')
    .replace(/^0+/, '');
  if (!digits) return '';
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

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

function formatDateId(dateIso?: string | null): string {
  if (!dateIso) return '-';
  try {
    const [y, m, d] = dateIso.slice(0, 10).split('-').map(Number);
    const dt = new Date(y, (m || 1) - 1, d || 1);
    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(dt);
  } catch {
    return dateIso;
  }
}

function getDeadlineInfo(deadline?: string | null): { label: string; isOverdue: boolean } | null {
  if (!deadline) return null;
  const todayIso = getTodayIsoDate();
  const [ty, tm, td] = todayIso.split('-').map(Number);
  const [dy, dm, dd] = deadline.slice(0, 10).split('-').map(Number);
  const tDate = new Date(ty, tm - 1, td).getTime();
  const dDate = new Date(dy, dm - 1, dd).getTime();
  const diffDays = Math.round((dDate - tDate) / (24 * 60 * 60 * 1000));

  if (diffDays > 0) {
    return { label: `${formatDateId(deadline)} (${diffDays} hari lagi)`, isOverdue: false };
  }
  if (diffDays === 0) {
    return { label: `${formatDateId(deadline)} (Hari ini)`, isOverdue: false };
  }
  return { label: `${formatDateId(deadline)} (Lewat ${Math.abs(diffDays)} hari)`, isOverdue: true };
}

function formatDaysDisplay(days: number[]): string {
  if (!days || days.length === 0) return '-';
  if (days.length === 1) return `Tgl ${days[0]}`;
  return `Tgl ${days.join(', ')}`;
}

function getAccentBarClass(color?: string): string {
  switch (color) {
    case 'teal':
      return 'bg-teal-500';
    case 'indigo':
      return 'bg-indigo-500';
    case 'blue':
      return 'bg-blue-500';
    case 'amber':
      return 'bg-amber-500';
    case 'rose':
      return 'bg-rose-500';
    case 'violet':
      return 'bg-violet-500';
    default:
      return 'bg-emerald-600';
  }
}

function getAccentIconClass(color?: string): string {
  switch (color) {
    case 'teal':
      return 'bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400';
    case 'indigo':
      return 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400';
    case 'blue':
      return 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400';
    case 'amber':
      return 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400';
    case 'rose':
      return 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400';
    case 'violet':
      return 'bg-violet-50 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400';
    default:
      return 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400';
  }
}

function getGoalProgressPercent(goal: SavingsGoalItem): number {
  const collected = savingsStore.getGoalCollectedAmount(goal.id);
  const target = Math.max(1, Number(goal.targetAmount) || 1);
  return Math.min(100, Math.round((collected / target) * 100));
}

// =========================================================================
// Modal 1: Create / Edit Tabungan Goal
// =========================================================================

const goalModalOpen = ref(false);
const editingGoalId = ref<string | null>(null);
const goalName = ref('');
const goalTarget = ref<number | ''>('');
const goalCategory = ref('');
const goalDeadline = ref('');
const hasDeadline = ref(false);
const goalNote = ref('');
const goalColor = ref('emerald');
const goalReminderEnabled = ref(false);
const goalScheduleMode = ref<'single' | 'multiple'>('single');
const goalSingleDay = ref<number>(1);
const goalSelectedDays = ref<number[]>([1]);
const goalReminderTime = ref('09:00');
const goalReminderAmount = ref<number | ''>('');
const goalErrorMsg = ref<string | null>(null);
const isSavingGoal = ref(false);

const goalTargetDisplay = computed(() => formatNominalDisplay(goalTarget.value));
const goalReminderAmountDisplay = computed(() => formatNominalDisplay(goalReminderAmount.value));

const goalCategoryOptions = computed<SelectOptionItem[]>(() => {
  const list = [...SAVINGS_CATEGORIES];
  if (goalCategory.value && !list.includes(goalCategory.value)) {
    list.unshift(goalCategory.value);
  }
  return list.map((c) => ({ value: c, label: c }));
});

const singleDayOptions = computed<SelectOptionItem[]>(() =>
  Array.from({ length: 31 }, (_, i) => ({
    value: String(i + 1),
    label: `Setiap Tanggal ${i + 1}`,
  }))
);

const goalSingleDayStr = computed({
  get: () => String(goalSingleDay.value),
  set: (v: string) => {
    goalSingleDay.value = Number(v) || 1;
  },
});

function toggleGoalDaySelection(day: number) {
  if (goalSelectedDays.value.includes(day)) {
    if (goalSelectedDays.value.length > 1) {
      goalSelectedDays.value = goalSelectedDays.value.filter((d) => d !== day);
    }
  } else {
    goalSelectedDays.value = [...goalSelectedDays.value, day].sort((a, b) => a - b);
  }
}

function openCreateGoalModal() {
  editingGoalId.value = null;
  goalErrorMsg.value = null;
  goalName.value = '';
  goalTarget.value = '';
  goalCategory.value = SAVINGS_CATEGORIES[0];
  hasDeadline.value = false;
  goalDeadline.value = getTodayIsoDate();
  goalNote.value = '';
  goalColor.value = 'emerald';
  goalReminderEnabled.value = false;
  goalScheduleMode.value = 'single';
  goalSingleDay.value = 1;
  goalSelectedDays.value = [1];
  goalReminderTime.value = '09:00';
  goalReminderAmount.value = '';
  goalModalOpen.value = true;
}

function openEditGoalModal(goal: SavingsGoalItem) {
  editingGoalId.value = goal.id;
  goalErrorMsg.value = null;
  goalName.value = goal.name;
  goalTarget.value = goal.targetAmount;
  goalCategory.value = goal.category || SAVINGS_CATEGORIES[0];
  hasDeadline.value = Boolean(goal.deadline);
  goalDeadline.value = goal.deadline || getTodayIsoDate();
  goalNote.value = goal.note || '';
  goalColor.value = goal.color || 'emerald';
  goalReminderEnabled.value = Boolean(goal.reminderEnabled);
  if (goal.reminderDays && goal.reminderDays.length > 1) {
    goalScheduleMode.value = 'multiple';
    goalSelectedDays.value = [...goal.reminderDays];
  } else {
    goalScheduleMode.value = 'single';
    const d = goal.reminderDays?.[0] || 1;
    goalSingleDay.value = d;
    goalSelectedDays.value = [d];
  }
  goalReminderTime.value = goal.reminderTime || '09:00';
  goalReminderAmount.value = goal.reminderAmount || '';
  goalModalOpen.value = true;
}

async function handleSaveGoal() {
  goalErrorMsg.value = null;
  if (!goalName.value.trim()) {
    goalErrorMsg.value = 'Masukkan nama tabungan terlebih dahulu.';
    return;
  }
  const numericTarget = Number(goalTarget.value || 0);
  if (numericTarget <= 0) {
    goalErrorMsg.value = 'Masukkan target dana terkumpul yang valid (lebih dari 0).';
    return;
  }
  if (!goalCategory.value.trim()) {
    goalErrorMsg.value = 'Pilih kategori tabungan terlebih dahulu.';
    return;
  }

  const days =
    goalScheduleMode.value === 'single'
      ? [Number(goalSingleDay.value) || 1]
      : goalSelectedDays.value;

  isSavingGoal.value = true;
  try {
    const saved = await savingsStore.saveGoal({
      id: editingGoalId.value || undefined,
      name: goalName.value.trim(),
      category: goalCategory.value.trim(),
      targetAmount: numericTarget,
      deadline: hasDeadline.value && goalDeadline.value ? goalDeadline.value : null,
      note: goalNote.value.trim(),
      color: goalColor.value,
      reminderEnabled: goalReminderEnabled.value,
      reminderDays: days,
      reminderTime: goalReminderTime.value || '09:00',
      reminderAmount: goalReminderAmount.value ? Number(goalReminderAmount.value) : null,
    });
    if (saved) {
      goalModalOpen.value = false;
      if (detailGoalId.value === saved.id) {
        // Detail view updates reactively via computed
      }
    }
  } catch (err: any) {
    goalErrorMsg.value = err?.message || 'Gagal menyimpan target tabungan.';
  } finally {
    isSavingGoal.value = false;
  }
}

async function handleDeleteFromEditModal() {
  if (!editingGoalId.value) return;
  const ok = await savingsStore.deleteGoal(editingGoalId.value);
  if (ok) {
    goalModalOpen.value = false;
    if (detailGoalId.value === editingGoalId.value) {
      detailModalOpen.value = false;
    }
  }
}

// =========================================================================
// Modal 2: Detail Tabungan (Breakdown per Sumber Dana + Progress History)
// =========================================================================

const detailModalOpen = ref(false);
const detailGoalId = ref<string | null>(null);

const activeDetailGoal = computed(() =>
  detailGoalId.value
    ? savingsStore.activeGoals.find((g) => g.id === detailGoalId.value) || null
    : null
);

const detailCollected = computed(() =>
  activeDetailGoal.value ? savingsStore.getGoalCollectedAmount(activeDetailGoal.value.id) : 0
);

const detailBreakdown = computed(() =>
  activeDetailGoal.value
    ? savingsStore.getGoalSourceBreakdown(activeDetailGoal.value.id)
    : { byHolder: [], byWallet: [] }
);

const detailEntries = computed(() =>
  activeDetailGoal.value ? savingsStore.getGoalEntries(activeDetailGoal.value.id) : []
);

function openDetailModal(goal: SavingsGoalItem) {
  detailGoalId.value = goal.id;
  detailModalOpen.value = true;
}

// =========================================================================
// Modal 3: Tambah Progress / Tarik Dana
// =========================================================================

const progressModalOpen = ref(false);
const progressGoalId = ref<string>('');
const progressMode = ref<'deposit' | 'withdraw'>('deposit');
const progressWalletId = ref<string>('');
const progressFundOwnerId = ref<string>('');
const progressAmount = ref<number | ''>('');
const progressDate = ref<string>(getTodayIsoDate());
const progressNote = ref<string>('');
const progressErrorMsg = ref<string | null>(null);
const isSavingProgress = ref(false);
const isInitializingProgress = ref(false);

const progressAmountDisplay = computed(() => formatNominalDisplay(progressAmount.value));

const activeProgressGoal = computed(() =>
  savingsStore.activeGoals.find((g) => g.id === progressGoalId.value) || null
);

const progressWalletOptions = computed<SelectOptionItem[]>(() => {
  return financeStore.wallets
    .filter((w) => !w.deleted)
    .map((w) => {
      if (progressMode.value === 'deposit') {
        const operational = savingsStore.getWalletOperationalBalance(w.id);
        return {
          value: w.id,
          label: w.name,
          sublabel: `(Saldo Bergerak: ${themeStore.formatMoney(operational)})`,
        };
      } else {
        const inThisGoal = progressGoalId.value
          ? savingsStore.getGoalWalletSavedAmount(progressGoalId.value, w.id)
          : 0;
        return {
          value: w.id,
          label: w.name,
          sublabel: `(Di Tabungan Ini: ${themeStore.formatMoney(inThisGoal)})`,
        };
      }
    });
});

const progressAvailableHolders = computed(() =>
  progressWalletId.value ? financeStore.getHoldersByWalletId(progressWalletId.value) : []
);

const progressHolderOptions = computed<SelectOptionItem[]>(() => {
  return progressAvailableHolders.value.map((holder) => {
    if (progressMode.value === 'deposit') {
      const operational = savingsStore.getHolderOperationalBalance(progressWalletId.value, holder.id);
      return {
        value: holder.id,
        label: formatHolderName(holder.holderName),
        sublabel: `(Saldo Bergerak: ${themeStore.formatMoney(operational)})`,
      };
    } else {
      const inThisGoal = progressGoalId.value
        ? savingsStore.getGoalHolderSavedAmount(progressGoalId.value, progressWalletId.value, holder.id)
        : 0;
      return {
        value: holder.id,
        label: formatHolderName(holder.holderName),
        sublabel: `(Di Tabungan Ini: ${themeStore.formatMoney(inThisGoal)})`,
      };
    }
  });
});

const progressMaxAvailable = computed(() => {
  if (!progressWalletId.value) return 0;
  if (progressMode.value === 'deposit') {
    return Math.max(
      0,
      savingsStore.getHolderOperationalBalance(progressWalletId.value, progressFundOwnerId.value)
    );
  }
  if (!progressGoalId.value) return 0;
  return savingsStore.getGoalHolderSavedAmount(
    progressGoalId.value,
    progressWalletId.value,
    progressFundOwnerId.value
  );
});

watch(progressWalletId, (newWId) => {
  if (isInitializingProgress.value) return;
  if (!newWId) {
    progressFundOwnerId.value = '';
    return;
  }
  const holders = financeStore.getHoldersByWalletId(newWId);
  if (progressMode.value === 'withdraw' && progressGoalId.value) {
    const withBalance = holders.find(
      (h) => savingsStore.getGoalHolderSavedAmount(progressGoalId.value, newWId, h.id) > 0
    );
    progressFundOwnerId.value = withBalance?.id || holders[0]?.id || '';
  } else {
    progressFundOwnerId.value = holders[0]?.id || '';
  }
});

watch(progressMode, (newMode) => {
  if (isInitializingProgress.value) return;
  progressErrorMsg.value = null;
  if (newMode === 'withdraw' && progressGoalId.value) {
    // Auto-select a wallet & holder that actually holds funds in this goal
    const activeWallets = financeStore.wallets.filter((w) => !w.deleted);
    const holdingWallet = activeWallets.find(
      (w) => savingsStore.getGoalWalletSavedAmount(progressGoalId.value, w.id) > 0
    );
    if (holdingWallet) {
      progressWalletId.value = holdingWallet.id;
      const holders = financeStore.getHoldersByWalletId(holdingWallet.id);
      const holdingHolder = holders.find(
        (h) => savingsStore.getGoalHolderSavedAmount(progressGoalId.value, holdingWallet.id, h.id) > 0
      );
      progressFundOwnerId.value = holdingHolder?.id || holders[0]?.id || '';
    }
  }
});

async function openProgressModal(
  goal: SavingsGoalItem,
  mode: 'deposit' | 'withdraw' = 'deposit',
  suggestedAmount?: number
) {
  isInitializingProgress.value = true;
  progressErrorMsg.value = null;

  if (financeStore.wallets.length === 0 && authStore.user?.uid) {
    await financeStore.initFinanceData(authStore.user.uid);
  }

  progressGoalId.value = goal.id;
  progressMode.value = mode;
  progressDate.value = getTodayIsoDate();
  progressNote.value =
    mode === 'deposit' ? `Setoran tabungan ${goal.name}` : `Penarikan dana ${goal.name}`;

  const activeWallets = financeStore.wallets.filter((w) => !w.deleted);
  if (mode === 'withdraw') {
    const holdingWallet =
      activeWallets.find((w) => savingsStore.getGoalWalletSavedAmount(goal.id, w.id) > 0) ||
      activeWallets[0];
    progressWalletId.value = holdingWallet?.id || '';
    const holders = progressWalletId.value ? financeStore.getHoldersByWalletId(progressWalletId.value) : [];
    const holdingHolder =
      holders.find((h) => savingsStore.getGoalHolderSavedAmount(goal.id, progressWalletId.value, h.id) > 0) ||
      holders[0];
    progressFundOwnerId.value = holdingHolder?.id || '';
  } else {
    progressWalletId.value = activeWallets[0]?.id || '';
    const holders = progressWalletId.value ? financeStore.getHoldersByWalletId(progressWalletId.value) : [];
    progressFundOwnerId.value = holders[0]?.id || '';
  }

  progressAmount.value = suggestedAmount && suggestedAmount > 0 ? suggestedAmount : '';
  progressModalOpen.value = true;
  setTimeout(() => {
    isInitializingProgress.value = false;
  }, 50);
}

function handleExternalProgressRequest() {
  const req = savingsStore.progressModalRequest;
  const qGoalId = String(route.query.goalId || '').trim();
  const targetId = req?.goalId || (route.query.action === 'progress' ? qGoalId : '');
  if (!targetId) return;

  const targetGoal = savingsStore.activeGoals.find((g) => g.id === targetId);
  if (targetGoal) {
    const mode = req?.mode || 'deposit';
    const suggested = targetGoal.reminderAmount || undefined;
    savingsStore.clearProgressModalRequest();
    if (route.query.action || route.query.goalId) {
      void router.replace({ path: '/utilities/savings' });
    }
    void openProgressModal(targetGoal, mode, suggested);
  }
}

watch(
  () => [savingsStore.progressModalRequest, savingsStore.activeGoals.length] as const,
  () => {
    handleExternalProgressRequest();
  }
);

async function handleSaveProgress() {
  progressErrorMsg.value = null;
  if (!progressGoalId.value) return;
  if (!progressWalletId.value) {
    progressErrorMsg.value = 'Pilih Sumber Dana (Dompet) terlebih dahulu.';
    return;
  }
  if (progressAvailableHolders.value.length > 0 && !progressFundOwnerId.value) {
    progressErrorMsg.value = 'Pilih Kepemilikan Dana terlebih dahulu.';
    return;
  }
  const numericAmount = Number(progressAmount.value || 0);
  if (numericAmount <= 0) {
    progressErrorMsg.value = 'Masukkan Nominal yang valid (lebih dari 0).';
    return;
  }
  if (!progressNote.value.trim()) {
    progressErrorMsg.value = 'Masukkan deskripsi pencatatan progress tabungan.';
    return;
  }

  isSavingProgress.value = true;
  try {
    await savingsStore.recordProgress({
      savingsId: progressGoalId.value,
      type: progressMode.value,
      walletId: progressWalletId.value,
      fundOwnerId: progressFundOwnerId.value,
      amount: numericAmount,
      date: progressDate.value || getTodayIsoDate(),
      note: progressNote.value.trim(),
    });
    progressModalOpen.value = false;
  } catch (err: any) {
    progressErrorMsg.value = err?.message || 'Gagal mencatat progress tabungan.';
  } finally {
    isSavingProgress.value = false;
  }
}
</script>

<template>
  <div class="space-y-6 pb-20">
    <!-- Header Section -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 class="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Tabungan &amp; Perencanaan
        </h1>
        <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Rencanakan target tabungan dari berbagai dompet tanpa mengubah saldo keseluruhan Anda.
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <button
          v-if="savingsStore.notificationPermission !== 'unsupported'"
          type="button"
          class="min-h-[42px] px-3 py-2 text-xs font-semibold rounded-xl border transition-all flex items-center gap-1.5 cursor-pointer"
          :class="
            savingsStore.notificationPermission === 'granted'
              ? 'border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
          "
          title="Pengaturan izin Notifikasi Push untuk pengingat menabung"
          @click="savingsStore.requestNotificationPermission()"
        >
          <BellRing
            v-if="savingsStore.notificationPermission === 'granted'"
            class="w-3.5 h-3.5 shrink-0"
          />
          <BellOff v-else class="w-3.5 h-3.5 shrink-0 text-amber-500" />
          <span>
            {{
              savingsStore.notificationPermission === 'granted'
                ? 'Push Notifikasi Aktif'
                : 'Aktifkan Push Notifikasi'
            }}
          </span>
        </button>

        <button
          type="button"
          :disabled="isRefreshing"
          class="min-h-[42px] px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-all shadow-2xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
          title="Segarkan Data Tabungan"
          @click="handleManualRefresh"
        >
          <RefreshCw
            class="w-4 h-4 text-emerald-600 dark:text-emerald-400"
            :class="{ 'animate-spin': isRefreshing }"
          />
          <span class="hidden sm:inline">Segarkan</span>
        </button>

        <button
          type="button"
          class="min-h-[42px] px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-all shadow-sm hover:shadow active:scale-95 flex items-center gap-2 cursor-pointer"
          @click="openCreateGoalModal"
        >
          <Plus class="w-4 h-4" />
          <span>Tambah Tabungan</span>
        </button>
      </div>
    </div>

    <!-- Balance Accounting Breakdown Hero Card -->
    <section class="rounded-3xl border border-slate-200/90 dark:border-slate-800/90 bg-white dark:bg-slate-900 p-5 sm:p-6 space-y-4 shadow-sm">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
        <!-- Total Saldo Keseluruhan -->
        <div class="space-y-1">
          <div class="text-xs font-medium text-slate-500 dark:text-slate-400">
            Total Saldo Keseluruhan
          </div>
          <div class="text-2xl sm:text-3xl font-money font-bold tracking-tight text-slate-900 dark:text-slate-100 truncate">
            {{ themeStore.formatMoney(financeStore.totalBalance) }}
          </div>
          <p class="text-[11px] text-slate-500 dark:text-slate-400">
            Akumulasi seluruh dompet &amp; kepemilikan Anda
          </p>
        </div>

        <!-- Saldo Bergerak / Operasional (Di luar Tabungan) -->
        <div class="md:border-l border-slate-100 dark:border-slate-800 md:pl-5 space-y-1">
          <div class="text-xs font-medium text-slate-500 dark:text-slate-400">
            Saldo Bergerak / Operasional
          </div>
          <div
            class="text-2xl sm:text-3xl font-money font-bold tracking-tight truncate"
            :class="
              savingsStore.totalOperationalBalance >= 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-rose-600 dark:text-rose-400'
            "
          >
            {{ themeStore.formatMoney(savingsStore.totalOperationalBalance) }}
          </div>
          <p class="text-[11px] text-slate-500 dark:text-slate-400">
            Dana bebas di luar alokasi tabungan aktif
          </p>
        </div>

        <!-- Total Saldo Tabungan -->
        <div class="md:border-l border-slate-100 dark:border-slate-800 md:pl-5 space-y-1">
          <div class="text-xs font-medium text-slate-500 dark:text-slate-400">
            Total Saldo Tabungan
          </div>
          <div class="text-2xl sm:text-3xl font-money font-bold tracking-tight text-teal-600 dark:text-teal-400 truncate">
            {{ themeStore.formatMoney(savingsStore.totalSavingsBalance) }}
          </div>
          <p class="text-[11px] text-slate-500 dark:text-slate-400">
            Tersimpan di {{ savingsStore.activeGoals.length }} rencana tabungan
            <template v-if="savingsStore.totalTargetAmount > 0">
              · Target total {{ themeStore.formatMoney(savingsStore.totalTargetAmount) }}
            </template>
          </p>
        </div>
      </div>

      <!-- Allocation Bar -->
      <div v-if="financeStore.totalBalance > 0" class="pt-1 space-y-1.5">
        <div class="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
          <span>Proporsi Alokasi Tabungan vs Saldo Bergerak</span>
          <span class="font-money font-semibold text-teal-600 dark:text-teal-400">
            {{ savingsAllocationPercent }}% dialokasikan ke tabungan
          </span>
        </div>
        <div class="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
          <div
            class="h-full rounded-full bg-teal-600 transition-all duration-300"
            :style="{ width: `${savingsAllocationPercent}%` }"
          ></div>
        </div>
      </div>
    </section>

    <!-- Filter Tabs (Matching AutomationView) -->
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
        Semua ({{ savingsStore.activeGoals.length }})
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
        Berjalan ({{ inProgressGoalsCount }})
      </button>
      <button
        type="button"
        class="px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
        :class="
          filterTab === 'completed'
            ? 'bg-emerald-600 text-white shadow-2xs'
            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
        "
        @click="filterTab = 'completed'"
      >
        Tercapai ({{ completedGoalsCount }})
      </button>
      <button
        type="button"
        class="px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
        :class="
          filterTab === 'reminder'
            ? 'bg-emerald-600 text-white shadow-2xs'
            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
        "
        @click="filterTab = 'reminder'"
      >
        Dengan Pengingat ({{ reminderGoalsCount }})
      </button>
    </div>

    <!-- Empty State -->
    <div
      v-if="filteredGoals.length === 0"
      class="rounded-3xl border border-dashed border-slate-300 dark:border-slate-800 p-12 text-center space-y-4 bg-white/50 dark:bg-slate-900/40"
    >
      <div class="w-14 h-14 mx-auto rounded-3xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
        <PiggyBank class="w-7 h-7" />
      </div>
      <div class="max-w-md mx-auto space-y-1">
        <h3 class="text-base font-bold text-slate-800 dark:text-slate-200">
          Belum Ada Rencana Tabungan
        </h3>
        <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
          Buat rencana tabungan untuk membeli sesuatu atau menyiapkan dana khusus (seperti Laptop, Dana Darurat, atau Liburan) dengan sumber dana dari berbagai dompet dan kepemilikan.
        </p>
      </div>
      <div>
        <button
          type="button"
          class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold transition-all inline-flex items-center gap-1.5 cursor-pointer"
          @click="openCreateGoalModal"
        >
          <Plus class="w-4 h-4" />
          <span>Buat Tabungan Pertama</span>
        </button>
      </div>
    </div>

    <!-- Savings Cards Grid (Matching AutomationView Card System) -->
    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <div
        v-for="goal in filteredGoals"
        :key="goal.id"
        role="button"
        tabindex="0"
        class="rounded-3xl border border-slate-200/90 dark:border-slate-800/90 bg-white dark:bg-slate-900 p-5 shadow-sm hover:shadow-md hover:border-emerald-500/40 transition-all flex flex-col justify-between gap-4 cursor-pointer text-left"
        @click="openDetailModal(goal)"
        @keydown.enter="openDetailModal(goal)"
      >
        <div class="space-y-3.5">
          <!-- Card Header: Icon, Title, Category & Completion Status -->
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-3 min-w-0 flex-1">
              <div
                class="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
                :class="getAccentIconClass(goal.color)"
              >
                <PiggyBank class="w-5 h-5" />
              </div>
              <div class="min-w-0 flex-1">
                <h3
                  class="text-base font-bold text-slate-900 dark:text-slate-100 truncate"
                  :title="goal.name"
                >
                  {{ goal.name }}
                </h3>
                <div class="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {{ goal.category }}
                </div>
              </div>
            </div>

            <span
              class="px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider shrink-0"
              :class="
                savingsStore.getGoalCollectedAmount(goal.id) >= goal.targetAmount
                  ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              "
            >
              {{
                savingsStore.getGoalCollectedAmount(goal.id) >= goal.targetAmount
                  ? 'Tercapai'
                  : `${getGoalProgressPercent(goal)}%`
              }}
            </span>
          </div>

          <!-- Amount & Progress Bar -->
          <div class="space-y-2">
            <div class="flex items-baseline justify-between gap-2">
              <div class="text-xl font-bold font-money text-slate-900 dark:text-slate-100 truncate">
                {{ themeStore.formatMoney(savingsStore.getGoalCollectedAmount(goal.id)) }}
              </div>
              <div class="text-xs font-money text-slate-500 dark:text-slate-400 shrink-0">
                / {{ themeStore.formatMoney(goal.targetAmount) }}
              </div>
            </div>

            <div class="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                class="h-full rounded-full transition-all duration-300"
                :class="getAccentBarClass(goal.color)"
                :style="{ width: `${getGoalProgressPercent(goal)}%` }"
              ></div>
            </div>

            <div class="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-money">
              <span v-if="savingsStore.getGoalCollectedAmount(goal.id) < goal.targetAmount">
                Kurang {{ themeStore.formatMoney(Math.max(0, goal.targetAmount - savingsStore.getGoalCollectedAmount(goal.id))) }}
              </span>
              <span v-else class="text-emerald-600 dark:text-emerald-400 font-sans font-semibold flex items-center gap-1">
                <CheckCircle2 class="w-3.5 h-3.5" />
                Target dana telah terkumpul
              </span>
              <span>{{ savingsStore.getGoalEntries(goal.id).length }} riwayat</span>
            </div>
          </div>

          <!-- Source Wallets Summary, Deadline, Reminder Info -->
          <div class="space-y-1.5 text-xs text-slate-600 dark:text-slate-300 pt-1">
            <div class="flex items-center gap-2">
              <Wallet class="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span class="truncate">
                <template v-if="savingsStore.getGoalSourceBreakdown(goal.id).byWallet.length > 0">
                  {{
                    savingsStore
                      .getGoalSourceBreakdown(goal.id)
                      .byWallet.map((w) => `${w.walletName}: ${themeStore.formatMoney(w.amount)}`)
                      .join(' · ')
                  }}
                </template>
                <template v-else>Belum ada sumber dana</template>
              </span>
            </div>

            <div v-if="getDeadlineInfo(goal.deadline)" class="flex items-center gap-2">
              <Calendar class="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span
                class="truncate"
                :class="
                  getDeadlineInfo(goal.deadline)?.isOverdue
                    ? 'text-rose-600 dark:text-rose-400 font-medium'
                    : ''
                "
              >
                Deadline: {{ getDeadlineInfo(goal.deadline)?.label }}
              </span>
            </div>

            <div v-if="goal.reminderEnabled" class="flex items-center gap-2">
              <BellRing class="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span class="text-emerald-700 dark:text-emerald-300 font-medium truncate">
                Pengingat: {{ formatDaysDisplay(goal.reminderDays) }} · {{ goal.reminderTime || '09:00' }} WIB
              </span>
            </div>

            <p v-if="goal.note" class="text-[11px] text-slate-500 italic line-clamp-1">
              "{{ goal.note }}"
            </p>
          </div>
        </div>

        <!-- Card Quick Actions Footer (Stop propagation so card click opens Detail) -->
        <div
          class="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2"
          @click.stop
        >
          <div class="flex items-center gap-1.5 flex-1 min-w-0">
            <button
              type="button"
              class="flex-1 min-h-[38px] px-2.5 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
              @click="openProgressModal(goal, 'deposit', goal.reminderAmount || undefined)"
            >
              <Plus class="w-3.5 h-3.5 shrink-0" />
              <span>Progress</span>
            </button>

            <button
              type="button"
              :disabled="savingsStore.getGoalCollectedAmount(goal.id) <= 0"
              class="min-h-[38px] px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              title="Tarik dana dari tabungan ini"
              @click="openProgressModal(goal, 'withdraw')"
            >
              <Minus class="w-3.5 h-3.5 shrink-0" />
              <span>Tarik</span>
            </button>
          </div>

          <div class="flex items-center gap-1 shrink-0">
            <button
              type="button"
              class="w-9 h-9 rounded-xl text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer"
              title="Edit Tabungan"
              @click="openEditGoalModal(goal)"
            >
              <Pencil class="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              class="w-9 h-9 rounded-xl text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/50 flex items-center justify-center transition-colors cursor-pointer"
              title="Hapus Tabungan"
              @click="savingsStore.deleteGoal(goal.id)"
            >
              <Trash2 class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- =================================================================== -->
    <!-- MODAL 1: Detail Tabungan (Breakdown Sumber Dana & Progress History)  -->
    <!-- =================================================================== -->
    <AppModal
      :open="detailModalOpen && Boolean(activeDetailGoal)"
      :title="activeDetailGoal ? activeDetailGoal.name : 'Detail Tabungan'"
      max-width="xl"
      @close="detailModalOpen = false"
    >
      <div v-if="activeDetailGoal" class="space-y-5">
        <!-- Summary Card -->
        <div class="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 p-4 space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="text-xs text-slate-500 dark:text-slate-400">
              Kategori: <strong class="text-slate-800 dark:text-slate-200">{{ activeDetailGoal.category }}</strong>
            </div>
            <div class="text-xs font-bold text-emerald-600 dark:text-emerald-400">
              {{ getGoalProgressPercent(activeDetailGoal) }}% Tercapai
            </div>
          </div>

          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <div class="text-2xl font-money font-bold text-slate-900 dark:text-slate-100">
              {{ themeStore.formatMoney(detailCollected) }}
            </div>
            <div class="text-xs font-money text-slate-500 dark:text-slate-400">
              Target: {{ themeStore.formatMoney(activeDetailGoal.targetAmount) }}
            </div>
          </div>

          <div class="h-2.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
            <div
              class="h-full rounded-full transition-all duration-300"
              :class="getAccentBarClass(activeDetailGoal.color)"
              :style="{ width: `${getGoalProgressPercent(activeDetailGoal)}%` }"
            ></div>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            <span v-if="activeDetailGoal.deadline">
              Deadline: <strong>{{ getDeadlineInfo(activeDetailGoal.deadline)?.label }}</strong>
            </span>
            <span v-else>Tanpa deadline</span>
            <span v-if="activeDetailGoal.reminderEnabled" class="text-emerald-600 dark:text-emerald-400 font-medium">
              Pengingat: {{ formatDaysDisplay(activeDetailGoal.reminderDays) }} · {{ activeDetailGoal.reminderTime || '09:00' }} WIB
            </span>
          </div>

          <p v-if="activeDetailGoal.note" class="text-xs text-slate-600 dark:text-slate-300 italic pt-1 border-t border-slate-200/70 dark:border-slate-800">
            "{{ activeDetailGoal.note }}"
          </p>
        </div>

        <!-- Asal Sumber Dana Section -->
        <div class="space-y-2.5">
          <div class="flex items-center justify-between">
            <h4 class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Wallet class="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Rincian Asal Sumber Dana Tabungan</span>
            </h4>
            <span class="text-[11px] text-slate-500 font-money">
              {{ detailBreakdown.byWallet.length }} dompet
            </span>
          </div>

          <div
            v-if="detailBreakdown.byHolder.length === 0"
            class="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-4 text-center text-xs text-slate-500"
          >
            Belum ada dana yang ditambahkan ke tabungan ini.
          </div>

          <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div
              v-for="src in detailBreakdown.byHolder"
              :key="`${src.walletId}_${src.fundOwnerId}`"
              class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-2.5 flex items-center justify-between gap-2"
            >
              <div class="min-w-0">
                <div class="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                  {{ src.walletName }}
                </div>
                <div class="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  Pemilik: {{ src.fundOwnerName }}
                </div>
              </div>
              <div class="text-xs sm:text-sm font-money font-bold text-teal-600 dark:text-teal-400 shrink-0">
                {{ themeStore.formatMoney(src.amount) }}
              </div>
            </div>
          </div>
        </div>

        <!-- Complete Progress History Section -->
        <div class="space-y-2.5">
          <div class="flex items-center justify-between">
            <h4 class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Clock class="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Riwayat Progress Dana ({{ detailEntries.length }})</span>
            </h4>
          </div>

          <div
            v-if="detailEntries.length === 0"
            class="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-6 text-center text-xs text-slate-500"
          >
            Belum ada riwayat tambah progress atau penarikan dana.
          </div>

          <div v-else class="space-y-2 max-h-[300px] overflow-y-auto pr-1">
            <div
              v-for="entry in detailEntries"
              :key="entry.id"
              class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 flex items-center justify-between gap-3"
            >
              <div class="flex items-start gap-2.5 min-w-0 flex-1">
                <div
                  class="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                  :class="
                    entry.type === 'deposit'
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                      : 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400'
                  "
                >
                  <ArrowDownLeft v-if="entry.type === 'deposit'" class="w-4 h-4" />
                  <ArrowUpRight v-else class="w-4 h-4" />
                </div>

                <div class="min-w-0 flex-1 space-y-0.5">
                  <div class="flex flex-wrap items-center gap-1.5">
                    <span class="text-xs font-bold text-slate-900 dark:text-slate-100">
                      {{ entry.type === 'deposit' ? 'Tambah Progress' : 'Tarik Dana' }}
                    </span>
                    <span class="text-[11px] text-slate-400">·</span>
                    <span class="text-[11px] text-slate-600 dark:text-slate-300 font-medium">
                      {{ entry.walletName }} ({{ formatHolderName(entry.fundOwnerName) }})
                    </span>
                  </div>
                  <div class="text-xs text-slate-600 dark:text-slate-400 line-clamp-1">
                    {{ entry.note }}
                  </div>
                  <div class="text-[11px] text-slate-400">
                    {{ formatDateId(entry.date) }}
                  </div>
                </div>
              </div>

              <div class="flex items-center gap-2 shrink-0">
                <span
                  class="text-xs sm:text-sm font-money font-bold"
                  :class="
                    entry.type === 'deposit'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  "
                >
                  {{ entry.type === 'deposit' ? '+' : '-' }}{{ themeStore.formatMoney(entry.amount) }}
                </span>

                <button
                  type="button"
                  class="w-7 h-7 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center justify-center transition-colors cursor-pointer"
                  title="Hapus catatan riwayat ini"
                  @click="savingsStore.deleteEntry(entry.id)"
                >
                  <Trash2 class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <div v-if="activeDetailGoal" class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              @click="openEditGoalModal(activeDetailGoal)"
            >
              <Pencil class="w-3.5 h-3.5" />
              <span>Edit</span>
            </button>
            <button
              type="button"
              :disabled="detailCollected <= 0"
              class="min-h-[42px] px-3.5 py-2 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 text-xs font-semibold flex items-center gap-1.5 hover:bg-rose-100 dark:hover:bg-rose-900/40 cursor-pointer disabled:opacity-40"
              @click="openProgressModal(activeDetailGoal, 'withdraw')"
            >
              <Minus class="w-3.5 h-3.5" />
              <span>Tarik Dana</span>
            </button>
          </div>

          <button
            type="button"
            class="flex-1 sm:flex-none min-h-[42px] px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
            @click="openProgressModal(activeDetailGoal, 'deposit', activeDetailGoal.reminderAmount || undefined)"
          >
            <Plus class="w-4 h-4" />
            <span>Tambah Progress</span>
          </button>
        </div>
      </template>
    </AppModal>

    <!-- =================================================================== -->
    <!-- MODAL 2: Tambah / Edit Rencana Tabungan                             -->
    <!-- =================================================================== -->
    <AppModal
      :open="goalModalOpen"
      :title="editingGoalId ? 'Detail & Ubah Tabungan' : 'Tambah Tabungan Baru'"
      max-width="lg"
      @close="goalModalOpen = false"
    >
      <div class="space-y-3.5">
        <!-- Nama Tabungan -->
        <input
          v-model="goalName"
          type="text"
          maxlength="100"
          placeholder="Nama Tabungan (misal: Beli Laptop, Dana Darurat)"
          required
          class="w-full min-h-[54px] sm:min-h-[50px] px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 text-sm sm:text-base text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:outline-none focus:border-emerald-600"
        />

        <!-- Target Dana Terkumpul -->
        <input
          :value="goalTargetDisplay"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          placeholder="Target Dana Terkumpul (Rp)"
          required
          class="w-full min-h-[54px] sm:min-h-[50px] px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 text-base sm:text-lg font-money font-semibold text-slate-900 dark:text-slate-100 placeholder:font-sans placeholder:font-normal placeholder:text-sm sm:placeholder:text-base placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:outline-none focus:border-emerald-600"
          @input="applyFormattedNominalInput($event, goalTarget)"
        />

        <!-- Kategori Tabungan -->
        <CustomSelect
          v-model="goalCategory"
          :options="goalCategoryOptions"
          searchable
          allow-custom-value
          search-placeholder="Cari atau ketik kategori baru..."
          placeholder="Kategori Tabungan"
        />

        <!-- Deadline Opsional -->
        <div class="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 p-3.5 space-y-2.5">
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Calendar class="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Deadline Jangka Waktu Menabung (Opsional)</span>
            </span>
            <label class="relative inline-flex items-center cursor-pointer select-none">
              <input v-model="hasDeadline" type="checkbox" class="sr-only peer" />
              <div class="w-9 h-5 bg-slate-200 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>

          <div v-if="hasDeadline" class="flex items-center gap-2">
            <div class="flex-1">
              <MaterialDatePicker v-model="goalDeadline" label="Tanggal Target Deadline" />
            </div>
            <button
              type="button"
              class="min-h-[46px] px-3 rounded-xl border border-slate-200 dark:border-slate-800 text-xs text-slate-500 hover:text-rose-600 cursor-pointer"
              title="Hapus deadline"
              @click="hasDeadline = false"
            >
              <X class="w-4 h-4" />
            </button>
          </div>
        </div>

        <!-- Catatan Tambahan -->
        <input
          v-model="goalNote"
          type="text"
          maxlength="200"
          placeholder="Catatan / Rencana Detail (Opsional)"
          class="w-full min-h-[50px] px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:outline-none focus:border-emerald-600"
        />

        <!-- Warna Kartu -->
        <div class="flex items-center justify-between gap-2 px-1">
          <span class="text-xs font-semibold text-slate-600 dark:text-slate-400">
            Warna Aksen Tabungan
          </span>
          <div class="flex items-center gap-2">
            <button
              v-for="c in SAVINGS_COLOR_OPTIONS"
              :key="c.value"
              type="button"
              class="w-6 h-6 rounded-full transition-transform cursor-pointer flex items-center justify-center"
              :class="[
                c.dotClass,
                goalColor === c.value ? 'ring-2 ring-offset-2 ring-slate-900 dark:ring-white scale-110' : 'opacity-70 hover:opacity-100',
              ]"
              :title="c.label"
              @click="goalColor = c.value"
            >
              <Check v-if="goalColor === c.value" class="w-3.5 h-3.5 text-white" />
            </button>
          </div>
        </div>

        <!-- Penjadwalan Pengingat Menabung (Native Push + Banner In-App) -->
        <div class="rounded-2xl border border-emerald-500/30 dark:border-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-950/20 p-3.5 space-y-3">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2 text-xs font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider">
              <BellRing class="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>Pengingat Menabung Berjadwal</span>
            </div>
            <label class="relative inline-flex items-center cursor-pointer select-none">
              <input v-model="goalReminderEnabled" type="checkbox" class="sr-only peer" />
              <div class="w-9 h-5 bg-slate-200 rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>

          <div v-if="goalReminderEnabled" class="space-y-3 pt-1">
            <!-- Tanggal Mode Toggle -->
            <div class="grid grid-cols-2 gap-2">
              <button
                type="button"
                class="min-h-[40px] px-3 py-2 rounded-xl text-xs font-semibold border transition-all text-left flex items-center justify-between cursor-pointer"
                :class="
                  goalScheduleMode === 'single'
                    ? 'border-emerald-600 bg-emerald-600 text-white shadow-xs'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                "
                @click="goalScheduleMode = 'single'"
              >
                <span>Tgl Tertentu Tiap Bulan</span>
                <Check v-if="goalScheduleMode === 'single'" class="w-3.5 h-3.5 shrink-0" />
              </button>
              <button
                type="button"
                class="min-h-[40px] px-3 py-2 rounded-xl text-xs font-semibold border transition-all text-left flex items-center justify-between cursor-pointer"
                :class="
                  goalScheduleMode === 'multiple'
                    ? 'border-emerald-600 bg-emerald-600 text-white shadow-xs'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                "
                @click="goalScheduleMode = 'multiple'"
              >
                <span>Beberapa Tanggal</span>
                <Check v-if="goalScheduleMode === 'multiple'" class="w-3.5 h-3.5 shrink-0" />
              </button>
            </div>

            <div v-if="goalScheduleMode === 'single'">
              <CustomSelect
                v-model="goalSingleDayStr"
                :options="singleDayOptions"
                placeholder="Pilih Tanggal Pengingat (1-31)"
              />
            </div>

            <div v-else class="space-y-1.5">
              <div class="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400">
                <span class="font-medium">Klik tanggal yang diinginkan:</span>
                <span class="font-bold text-emerald-600 dark:text-emerald-400">
                  {{ goalSelectedDays.length }} tanggal dipilih
                </span>
              </div>
              <div class="grid grid-cols-7 sm:grid-cols-11 gap-1">
                <button
                  v-for="d in 31"
                  :key="d"
                  type="button"
                  class="h-8 rounded-lg text-xs font-bold transition-all flex items-center justify-center cursor-pointer"
                  :class="
                    goalSelectedDays.includes(d)
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-emerald-500'
                  "
                  @click="toggleGoalDaySelection(d)"
                >
                  {{ d }}
                </button>
              </div>
            </div>

            <!-- Jam & Nominal Saran Setoran -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div class="min-h-[46px] flex items-center justify-between bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2">
                <span class="text-xs text-slate-500 font-medium">Jam Pengingat:</span>
                <input
                  v-model="goalReminderTime"
                  type="time"
                  class="bg-transparent text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none cursor-pointer"
                />
              </div>

              <input
                :value="goalReminderAmountDisplay"
                type="text"
                inputmode="numeric"
                autocomplete="off"
                placeholder="Saran Setoran (Rp · Opsional)"
                class="w-full min-h-[46px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-money font-semibold text-slate-900 dark:text-slate-100 placeholder:font-sans placeholder:font-normal placeholder:text-slate-500 focus:outline-none focus:border-emerald-600"
                @input="applyFormattedNominalInput($event, goalReminderAmount)"
              />
            </div>

            <!-- Push Notification Status inside form -->
            <div class="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-400 pt-1">
              <span>Pengingat akan muncul sebagai banner in-app &amp; Push Notifikasi native.</span>
              <button
                v-if="savingsStore.notificationPermission !== 'granted' && savingsStore.notificationPermission !== 'unsupported'"
                type="button"
                class="font-bold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                @click="savingsStore.requestNotificationPermission()"
              >
                Izinkan Push Notifikasi →
              </button>
            </div>
          </div>
        </div>

        <p v-if="goalErrorMsg" class="text-xs text-rose-600 dark:text-rose-400 font-medium px-1">
          {{ goalErrorMsg }}
        </p>
      </div>

      <template #footer>
        <div class="flex items-center justify-between gap-2.5">
          <button
            v-if="editingGoalId"
            type="button"
            :disabled="isSavingGoal"
            class="min-h-[44px] px-4 py-2 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0 disabled:opacity-50 cursor-pointer"
            @click="handleDeleteFromEditModal"
          >
            <Trash2 class="w-4 h-4 shrink-0" />
            <span>Hapus</span>
          </button>

          <button
            type="button"
            :disabled="isSavingGoal"
            class="flex-1 min-h-[46px] px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 shadow-xs cursor-pointer"
            @click="handleSaveGoal"
          >
            <Check class="w-4 h-4 shrink-0" />
            <span>{{ editingGoalId ? 'Simpan Perubahan' : 'Simpan Tabungan' }}</span>
          </button>
        </div>
      </template>
    </AppModal>

    <!-- =================================================================== -->
    <!-- MODAL 3: Tambah Progress / Tarik Dana (Selaras QuickTransactionModal) -->
    <!-- =================================================================== -->
    <AppModal
      :open="progressModalOpen"
      :title="activeProgressGoal ? `Progress: ${activeProgressGoal.name}` : 'Catat Progress Tabungan'"
      max-width="lg"
      @close="progressModalOpen = false"
    >
      <div class="space-y-3.5">
        <!-- Segmented Control: Tambah Progress vs Tarik Dana -->
        <div class="grid grid-cols-2 rounded-full overflow-hidden border border-emerald-600/20 dark:border-emerald-500/20 bg-emerald-600/10 dark:bg-slate-800 p-1 gap-1">
          <button
            type="button"
            class="min-h-[44px] flex items-center justify-center gap-1.5 rounded-full text-xs sm:text-sm font-bold uppercase tracking-wide transition-all duration-150 px-2 cursor-pointer"
            :class="
              progressMode === 'deposit'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            "
            @click="progressMode = 'deposit'"
          >
            <ArrowDownLeft class="w-3.5 h-3.5 shrink-0" />
            <span>Tambah Progress</span>
          </button>
          <button
            type="button"
            class="min-h-[44px] flex items-center justify-center gap-1.5 rounded-full text-xs sm:text-sm font-bold uppercase tracking-wide transition-all duration-150 px-2 cursor-pointer"
            :class="
              progressMode === 'withdraw'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            "
            @click="progressMode = 'withdraw'"
          >
            <ArrowUpRight class="w-3.5 h-3.5 shrink-0" />
            <span>Tarik Dana</span>
          </button>
        </div>

        <!-- 1. Sumber Dana -->
        <CustomSelect
          v-model="progressWalletId"
          :options="progressWalletOptions"
          placeholder="Sumber Dana"
        />

        <!-- 2. Kepemilikan Dana -->
        <CustomSelect
          v-model="progressFundOwnerId"
          :options="progressHolderOptions"
          :disabled="!progressWalletId || progressAvailableHolders.length === 0"
          placeholder="Kepemilikan Dana"
        />

        <!-- Helper Available Balance Info -->
        <div class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/50 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span class="text-slate-600 dark:text-slate-400">
            {{
              progressMode === 'deposit'
                ? 'Saldo Bergerak Tersedia:'
                : 'Dana Tersimpan di Tabungan Ini:'
            }}
          </span>
          <div class="flex items-center gap-2">
            <strong
              class="font-money font-bold"
              :class="progressMaxAvailable > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'"
            >
              {{ themeStore.formatMoney(progressMaxAvailable) }}
            </strong>
            <button
              v-if="progressMaxAvailable > 0"
              type="button"
              class="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
              @click="progressAmount = progressMaxAvailable"
            >
              Isi Maks
            </button>
          </div>
        </div>

        <!-- 3. Tanggal Pencatatan -->
        <MaterialDatePicker
          v-model="progressDate"
          label="Tanggal Pencatatan"
        />

        <!-- 4. Deskripsi -->
        <input
          v-model="progressNote"
          type="text"
          maxlength="200"
          placeholder="Deskripsi / Keterangan Progress"
          class="w-full min-h-[54px] sm:min-h-[50px] px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 text-sm sm:text-base text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:outline-none focus:border-emerald-600"
        />

        <!-- 5. Nominal -->
        <input
          :value="progressAmountDisplay"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          placeholder="Nominal (Rp)"
          required
          class="w-full min-h-[54px] sm:min-h-[50px] px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 text-base sm:text-lg font-money font-semibold text-slate-900 dark:text-slate-100 placeholder:font-sans placeholder:font-normal placeholder:text-sm sm:placeholder:text-base placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:outline-none focus:border-emerald-600"
          @input="applyFormattedNominalInput($event, progressAmount)"
        />

        <p v-if="progressErrorMsg" class="text-xs text-rose-600 dark:text-rose-400 font-medium px-1">
          {{ progressErrorMsg }}
        </p>
      </div>

      <template #footer>
        <button
          type="button"
          :disabled="isSavingProgress"
          class="w-full min-h-[46px] px-5 py-2.5 rounded-xl text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 shadow-xs cursor-pointer"
          :class="
            progressMode === 'deposit'
              ? 'bg-emerald-600 hover:bg-emerald-700'
              : 'bg-rose-600 hover:bg-rose-700'
          "
          @click="handleSaveProgress"
        >
          <Check class="w-4 h-4 shrink-0" />
          <span>
            {{
              isSavingProgress
                ? 'Menyimpan...'
                : progressMode === 'deposit'
                  ? 'Simpan Progress Tabungan'
                  : 'Tarik Dana Tabungan'
            }}
          </span>
        </button>
      </template>
    </AppModal>
  </div>
</template>
