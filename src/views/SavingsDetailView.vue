<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  ArrowLeft,
  Target,
  Plus,
  Minus,
  Pencil,
  Trash2,
  Calendar,
  Wallet,
  Clock,
  Check,
  BellRing,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  X,
} from 'lucide-vue-next';
import { useAuthStore } from '../stores/auth';
import { useFinanceStore, formatHolderName } from '../stores/finance';
import { useSavingsStore } from '../stores/savings';
import { useThemeStore } from '../stores/theme';
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

const goalId = computed(() => decodeURIComponent(String(route.params.id || '')));
const historyFilter = ref<'all' | 'deposit' | 'withdraw'>('all');

// =========================================================================
// Data Initialization
// =========================================================================

async function ensureDataReady(force = false) {
  const uid = authStore.user?.uid;
  if (!uid) return;
  const tasks: Promise<any>[] = [];
  if (financeStore.wallets.length === 0) {
    tasks.push(financeStore.initFinanceData(uid));
  }
  if (savingsStore.goals.length === 0 || force) {
    tasks.push(savingsStore.loadSavings(uid, force));
  }
  await Promise.all(tasks);
}

onMounted(async () => {
  await ensureDataReady(false);
});

watch(
  () => [authStore.user?.uid, goalId.value] as const,
  async ([uid]) => {
    if (uid) {
      await ensureDataReady(false);
    }
  }
);

// =========================================================================
// Reactive Goal & Accounting Computed Values
// =========================================================================

const goal = computed<SavingsGoalItem | null>(
  () => savingsStore.activeGoals.find((g) => g.id === goalId.value) || null
);

const collectedAmount = computed(() =>
  goal.value ? savingsStore.getGoalCollectedAmount(goal.value.id) : 0
);

const progressPercent = computed(() => {
  if (!goal.value) return 0;
  const target = Math.max(1, Number(goal.value.targetAmount) || 1);
  return Math.min(100, Math.round((collectedAmount.value / target) * 100));
});

const breakdown = computed(() =>
  goal.value
    ? savingsStore.getGoalSourceBreakdown(goal.value.id)
    : { byHolder: [], byWallet: [] }
);

const allEntries = computed(() =>
  goal.value ? savingsStore.getGoalEntries(goal.value.id) : []
);

const depositEntriesCount = computed(
  () => allEntries.value.filter((e) => e.type === 'deposit').length
);

const withdrawEntriesCount = computed(
  () => allEntries.value.filter((e) => e.type === 'withdraw').length
);

const filteredEntries = computed(() => {
  if (historyFilter.value === 'deposit') {
    return allEntries.value.filter((e) => e.type === 'deposit');
  }
  if (historyFilter.value === 'withdraw') {
    return allEntries.value.filter((e) => e.type === 'withdraw');
  }
  return allEntries.value;
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

function handleGoalTargetInput(event: Event) {
  applyFormattedNominalInput(event, goalTarget);
}

function handleGoalReminderAmountInput(event: Event) {
  applyFormattedNominalInput(event, goalReminderAmount);
}

function handleProgressAmountInput(event: Event) {
  applyFormattedNominalInput(event, progressAmount);
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

// =========================================================================
// Modal 1: Edit Rencana Tabungan
// =========================================================================

const goalModalOpen = ref(false);
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

function openEditModal() {
  if (!goal.value) return;
  goalErrorMsg.value = null;
  goalName.value = goal.value.name;
  goalTarget.value = goal.value.targetAmount;
  goalCategory.value = goal.value.category || SAVINGS_CATEGORIES[0];
  hasDeadline.value = Boolean(goal.value.deadline);
  goalDeadline.value = goal.value.deadline || getTodayIsoDate();
  goalNote.value = goal.value.note || '';
  goalColor.value = goal.value.color || 'emerald';
  goalReminderEnabled.value = Boolean(goal.value.reminderEnabled);
  if (goal.value.reminderDays && goal.value.reminderDays.length > 1) {
    goalScheduleMode.value = 'multiple';
    goalSelectedDays.value = [...goal.value.reminderDays];
  } else {
    goalScheduleMode.value = 'single';
    const d = goal.value.reminderDays?.[0] || 1;
    goalSingleDay.value = d;
    goalSelectedDays.value = [d];
  }
  goalReminderTime.value = goal.value.reminderTime || '09:00';
  goalReminderAmount.value = goal.value.reminderAmount || '';
  goalModalOpen.value = true;
}

async function handleSaveGoal() {
  if (!goal.value) return;
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
      id: goal.value.id,
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
    }
  } catch (err: any) {
    goalErrorMsg.value = err?.message || 'Gagal menyimpan perubahan tabungan.';
  } finally {
    isSavingGoal.value = false;
  }
}

async function handleDeleteGoal() {
  if (!goal.value) return;
  const ok = await savingsStore.deleteGoal(goal.value.id);
  if (ok) {
    goalModalOpen.value = false;
    void router.push('/utilities/savings');
  }
}

// =========================================================================
// Modal 2: Tambah Progress / Tarik Dana
// =========================================================================

const progressModalOpen = ref(false);
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
        const inThisGoal = goal.value
          ? savingsStore.getGoalWalletSavedAmount(goal.value.id, w.id)
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
      const inThisGoal = goal.value
        ? savingsStore.getGoalHolderSavedAmount(goal.value.id, progressWalletId.value, holder.id)
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
  if (!goal.value) return 0;
  return savingsStore.getGoalHolderSavedAmount(
    goal.value.id,
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
  if (progressMode.value === 'withdraw' && goal.value) {
    const withBalance = holders.find(
      (h) => savingsStore.getGoalHolderSavedAmount(goal.value!.id, newWId, h.id) > 0
    );
    progressFundOwnerId.value = withBalance?.id || holders[0]?.id || '';
  } else {
    progressFundOwnerId.value = holders[0]?.id || '';
  }
});

watch(progressMode, (newMode) => {
  if (isInitializingProgress.value) return;
  progressErrorMsg.value = null;
  if (newMode === 'withdraw' && goal.value) {
    const activeWallets = financeStore.wallets.filter((w) => !w.deleted);
    const holdingWallet = activeWallets.find(
      (w) => savingsStore.getGoalWalletSavedAmount(goal.value!.id, w.id) > 0
    );
    if (holdingWallet) {
      progressWalletId.value = holdingWallet.id;
      const holders = financeStore.getHoldersByWalletId(holdingWallet.id);
      const holdingHolder = holders.find(
        (h) => savingsStore.getGoalHolderSavedAmount(goal.value!.id, holdingWallet.id, h.id) > 0
      );
      progressFundOwnerId.value = holdingHolder?.id || holders[0]?.id || '';
    }
  }
});

async function openProgressModal(mode: 'deposit' | 'withdraw' = 'deposit', suggestedAmount?: number) {
  if (!goal.value) return;
  isInitializingProgress.value = true;
  progressErrorMsg.value = null;

  if (financeStore.wallets.length === 0 && authStore.user?.uid) {
    await financeStore.initFinanceData(authStore.user.uid);
  }

  progressMode.value = mode;
  progressDate.value = getTodayIsoDate();
  progressNote.value =
    mode === 'deposit' ? `Setoran tabungan ${goal.value.name}` : `Penarikan dana ${goal.value.name}`;

  const activeWallets = financeStore.wallets.filter((w) => !w.deleted);
  if (mode === 'withdraw') {
    const holdingWallet =
      activeWallets.find((w) => savingsStore.getGoalWalletSavedAmount(goal.value!.id, w.id) > 0) ||
      activeWallets[0];
    progressWalletId.value = holdingWallet?.id || '';
    const holders = progressWalletId.value ? financeStore.getHoldersByWalletId(progressWalletId.value) : [];
    const holdingHolder =
      holders.find((h) => savingsStore.getGoalHolderSavedAmount(goal.value!.id, progressWalletId.value, h.id) > 0) ||
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

async function handleSaveProgress() {
  if (!goal.value) return;
  progressErrorMsg.value = null;
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
      savingsId: goal.value.id,
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
    <!-- Top Breadcrumb Back Link -->
    <div>
      <button
        type="button"
        class="inline-flex items-center gap-2 min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
        @click="router.push('/utilities/savings')"
      >
        <ArrowLeft class="w-4 h-4 shrink-0" />
        <span>Kembali ke Daftar Tabungan</span>
      </button>
    </div>

    <!-- Not Found / Loading Empty State -->
    <div
      v-if="!goal"
      class="rounded-3xl border border-dashed border-slate-300 dark:border-slate-800 bg-white/60 dark:bg-slate-900/50 p-10 text-center space-y-4"
    >
      <div class="w-14 h-14 mx-auto rounded-3xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
        <Target class="w-7 h-7" />
      </div>
      <div class="space-y-1">
        <h2 class="text-base font-bold text-slate-900 dark:text-slate-100">
          {{ savingsStore.isLoading ? 'Memuat Detail Tabungan...' : 'Data Tabungan Tidak Ditemukan' }}
        </h2>
        <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
          {{
            savingsStore.isLoading
              ? 'Sedang mengambil data tabungan dan riwayat progress Anda.'
              : 'Rencana tabungan ini mungkin telah dihapus atau tautan tidak valid.'
          }}
        </p>
      </div>
      <div>
        <button
          type="button"
          class="min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
          @click="router.push('/utilities/savings')"
        >
          <ArrowLeft class="w-4 h-4" />
          <span>Kembali ke Tabungan</span>
        </button>
      </div>
    </div>

    <!-- Main Detail Page Content -->
    <template v-else>
      <!-- Top Header with Title + Tarik Dana, Edit, Tambah Progress Actions -->
      <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div class="flex items-start gap-3.5 min-w-0">
          <div
            class="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 mt-0.5"
            :class="getAccentIconClass(goal.color)"
          >
            <Target class="w-6 h-6" />
          </div>
          <div class="min-w-0 flex-1 space-y-1">
            <div class="flex flex-wrap items-center gap-2">
              <h1 class="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 break-words">
                {{ goal.name }}
              </h1>
              <span
                class="px-2.5 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider shrink-0"
                :class="
                  collectedAmount >= goal.targetAmount
                    ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                "
              >
                {{ collectedAmount >= goal.targetAmount ? 'Tercapai' : `${progressPercent}%` }}
              </span>
            </div>
            <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              <span class="font-medium text-slate-700 dark:text-slate-300">{{ goal.category }}</span>
              <template v-if="getDeadlineInfo(goal.deadline)">
                <span aria-hidden="true">·</span>
                <span
                  :class="
                    getDeadlineInfo(goal.deadline)?.isOverdue
                      ? 'text-rose-600 dark:text-rose-400 font-semibold'
                      : ''
                  "
                >
                  Deadline: {{ getDeadlineInfo(goal.deadline)?.label }}
                </span>
              </template>
              <template v-if="goal.reminderEnabled">
                <span aria-hidden="true">·</span>
                <span class="text-emerald-600 dark:text-emerald-400 font-medium inline-flex items-center gap-1">
                  <BellRing class="w-3.5 h-3.5 shrink-0" />
                  <span>{{ formatDaysDisplay(goal.reminderDays) }} · {{ goal.reminderTime || '09:00' }} WIB</span>
                </span>
              </template>
            </div>
          </div>
        </div>

        <!-- Top Page Action Buttons: Tarik Dana, Edit, Tambah Progress -->
        <div class="grid grid-cols-2 sm:flex sm:items-center gap-2 sm:flex-nowrap shrink-0">
          <button
            type="button"
            :disabled="collectedAmount <= 0"
            class="h-11 min-h-[44px] px-4 py-2 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-700 dark:text-rose-300 text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            @click="openProgressModal('withdraw')"
          >
            <Minus class="w-4 h-4 shrink-0" />
            <span>Tarik Dana</span>
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
            class="col-span-2 sm:col-span-1 w-full sm:w-auto h-11 min-h-[44px] px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-all shadow-sm hover:shadow active:scale-[0.98] whitespace-nowrap cursor-pointer"
            @click="openProgressModal('deposit', goal.reminderAmount || undefined)"
          >
            <Plus class="w-4 h-4 shrink-0" />
            <span>Tambah Progress</span>
          </button>
        </div>
      </div>

      <!-- Hero Progress Overview Card -->
      <section class="rounded-3xl border border-slate-200/90 dark:border-slate-800/90 bg-white dark:bg-slate-900 p-5 sm:p-6 space-y-4 shadow-sm">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
          <div class="space-y-1">
            <div class="text-xs font-medium text-slate-500 dark:text-slate-400">
              Dana Terkumpul
            </div>
            <div class="text-2xl sm:text-3xl font-money font-bold tracking-tight text-slate-900 dark:text-slate-100 truncate">
              {{ themeStore.formatMoney(collectedAmount) }}
            </div>
          </div>

          <div class="sm:border-l border-slate-100 dark:border-slate-800 sm:pl-5 space-y-1">
            <div class="text-xs font-medium text-slate-500 dark:text-slate-400">
              Target Dana
            </div>
            <div class="text-2xl sm:text-3xl font-money font-bold tracking-tight text-teal-600 dark:text-teal-400 truncate">
              {{ themeStore.formatMoney(goal.targetAmount) }}
            </div>
          </div>

          <div class="sm:border-l border-slate-100 dark:border-slate-800 sm:pl-5 space-y-1">
            <div class="text-xs font-medium text-slate-500 dark:text-slate-400">
              {{ collectedAmount >= goal.targetAmount ? 'Status Target' : 'Sisa Kekurangan' }}
            </div>
            <div
              v-if="collectedAmount >= goal.targetAmount"
              class="text-lg sm:text-xl font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 pt-1"
            >
              <CheckCircle2 class="w-5 h-5 shrink-0" />
              <span>Target Tercapai</span>
            </div>
            <div
              v-else
              class="text-2xl sm:text-3xl font-money font-bold tracking-tight text-slate-700 dark:text-slate-300 truncate"
            >
              {{ themeStore.formatMoney(Math.max(0, goal.targetAmount - collectedAmount)) }}
            </div>
          </div>
        </div>

        <div class="space-y-1.5 pt-1">
          <div class="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Progress Pencapaian</span>
            <span class="font-money font-bold text-emerald-600 dark:text-emerald-400">
              {{ progressPercent }}%
            </span>
          </div>
          <div class="h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              class="h-full rounded-full transition-all duration-300"
              :class="getAccentBarClass(goal.color)"
              :style="{ width: `${progressPercent}%` }"
            ></div>
          </div>
        </div>

        <p
          v-if="goal.note"
          class="text-xs sm:text-sm text-slate-600 dark:text-slate-300 italic pt-3 border-t border-slate-100 dark:border-slate-800"
        >
          "{{ goal.note }}"
        </p>
      </section>

      <!-- Asal Sumber Dana Section -->
      <section class="rounded-3xl border border-slate-200/90 dark:border-slate-800/90 bg-white dark:bg-slate-900 p-5 sm:p-6 space-y-4 shadow-sm">
        <div class="flex items-center justify-between gap-2">
          <div>
            <h2 class="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Wallet class="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>Rincian Asal Sumber Dana Tabungan</span>
            </h2>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Akumulasi dana tabungan berdasarkan dompet dan kepemilikan sumber dana.
            </p>
          </div>
          <span class="px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-money font-semibold text-slate-600 dark:text-slate-300 shrink-0">
            {{ breakdown.byWallet.length }} dompet
          </span>
        </div>

        <div
          v-if="breakdown.byHolder.length === 0"
          class="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-6 text-center text-xs sm:text-sm text-slate-500 dark:text-slate-400"
        >
          Belum ada dana yang ditambahkan ke tabungan ini. Klik <strong>Tambah Progress</strong> di atas untuk mulai mengalokasikan dana.
        </div>

        <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div
            v-for="src in breakdown.byHolder"
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
                v-if="collectedAmount > 0"
                class="text-[11px] font-money text-slate-500 dark:text-slate-400"
              >
                {{ Math.round((src.amount / collectedAmount) * 100) }}%
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Complete Progress History Section -->
      <section class="rounded-3xl border border-slate-200/90 dark:border-slate-800/90 bg-white dark:bg-slate-900 p-5 sm:p-6 space-y-4 shadow-sm">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 class="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Clock class="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>Riwayat Progress Dana ({{ allEntries.length }})</span>
            </h2>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Catatan lengkap setiap penambahan dana dan penarikan dana pada tabungan ini.
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              class="px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              :class="
                historyFilter === 'all'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              "
              @click="historyFilter = 'all'"
            >
              Semua ({{ allEntries.length }})
            </button>
            <button
              type="button"
              class="px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              :class="
                historyFilter === 'deposit'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              "
              @click="historyFilter = 'deposit'"
            >
              Masuk ({{ depositEntriesCount }})
            </button>
            <button
              type="button"
              class="px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              :class="
                historyFilter === 'withdraw'
                  ? 'bg-rose-600 text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              "
              @click="historyFilter = 'withdraw'"
            >
              Tarik Dana ({{ withdrawEntriesCount }})
            </button>
          </div>
        </div>

        <div
          v-if="filteredEntries.length === 0"
          class="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-8 text-center text-xs sm:text-sm text-slate-500 dark:text-slate-400"
        >
          {{
            allEntries.length === 0
              ? 'Belum ada riwayat tambah progress atau penarikan dana.'
              : 'Tidak ada catatan pada filter ini.'
          }}
        </div>

        <div v-else class="space-y-3">
          <div
            v-for="entry in filteredEntries"
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
                      entry.type === 'deposit'
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                        : 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400'
                    "
                  >
                    <ArrowDownLeft v-if="entry.type === 'deposit'" class="w-4 h-4" />
                    <ArrowUpRight v-else class="w-4 h-4" />
                  </div>
                  <span
                    class="text-xs sm:text-sm font-bold truncate"
                    :class="
                      entry.type === 'deposit'
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-rose-700 dark:text-rose-400'
                    "
                  >
                    {{ entry.type === 'deposit' ? 'Tambah Progress' : 'Tarik Dana' }}
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
                  entry.type === 'deposit'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                "
              >
                {{ entry.type === 'deposit' ? '+' : '-' }}{{ themeStore.formatMoney(entry.amount) }}
              </span>

              <button
                type="button"
                class="min-h-[36px] px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-xs transition-colors shrink-0 cursor-pointer"
                title="Hapus catatan riwayat ini"
                @click="savingsStore.deleteEntry(entry.id)"
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
    <!-- MODAL 1: Edit Rencana Tabungan                                      -->
    <!-- =================================================================== -->
    <AppModal
      :open="goalModalOpen"
      title="Detail & Ubah Tabungan"
      max-width="lg"
      @close="goalModalOpen = false"
    >
      <div class="space-y-3.5">
        <input
          v-model="goalName"
          type="text"
          maxlength="100"
          placeholder="Nama Tabungan (misal: Beli Laptop, Dana Darurat)"
          required
          class="w-full min-h-[54px] sm:min-h-[50px] px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 text-sm sm:text-base text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:outline-none focus:border-emerald-600"
        />

        <input
          :value="goalTargetDisplay"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          placeholder="Target Dana Terkumpul (Rp)"
          required
          class="w-full min-h-[54px] sm:min-h-[50px] px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 text-base sm:text-lg font-money font-semibold text-slate-900 dark:text-slate-100 placeholder:font-sans placeholder:font-normal placeholder:text-sm sm:placeholder:text-base placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:outline-none focus:border-emerald-600"
          @input="handleGoalTargetInput"
        />

        <CustomSelect
          v-model="goalCategory"
          :options="goalCategoryOptions"
          searchable
          allow-custom-value
          search-placeholder="Cari atau ketik kategori baru..."
          placeholder="Kategori Tabungan"
        />

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

          <div v-if="hasDeadline" class="flex items-center gap-2 min-w-0">
            <div class="flex-1 min-w-0">
              <MaterialDatePicker
                v-model="goalDeadline"
                label="Tanggal Target Deadline"
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
          v-model="goalNote"
          type="text"
          maxlength="200"
          placeholder="Catatan / Rencana Detail (Opsional)"
          class="w-full min-h-[50px] px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:outline-none focus:border-emerald-600"
        />

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
                @input="handleGoalReminderAmountInput"
              />
            </div>

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
            type="button"
            :disabled="isSavingGoal"
            class="min-h-[44px] px-4 py-2 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0 disabled:opacity-50 cursor-pointer"
            @click="handleDeleteGoal"
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
            <span>Simpan Perubahan</span>
          </button>
        </div>
      </template>
    </AppModal>

    <!-- =================================================================== -->
    <!-- MODAL 2: Tambah Progress / Tarik Dana                               -->
    <!-- =================================================================== -->
    <AppModal
      :open="progressModalOpen"
      :title="goal ? `Progress: ${goal.name}` : 'Catat Progress Tabungan'"
      max-width="lg"
      @close="progressModalOpen = false"
    >
      <div class="space-y-3.5">
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

        <CustomSelect
          v-model="progressWalletId"
          :options="progressWalletOptions"
          placeholder="Sumber Dana"
        />

        <CustomSelect
          v-model="progressFundOwnerId"
          :options="progressHolderOptions"
          :disabled="!progressWalletId || progressAvailableHolders.length === 0"
          placeholder="Kepemilikan Dana"
        />

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

        <MaterialDatePicker
          v-model="progressDate"
          label="Tanggal Pencatatan"
        />

        <input
          v-model="progressNote"
          type="text"
          maxlength="200"
          placeholder="Deskripsi / Keterangan Progress"
          class="w-full min-h-[54px] sm:min-h-[50px] px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 text-sm sm:text-base text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:outline-none focus:border-emerald-600"
        />

        <input
          :value="progressAmountDisplay"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          placeholder="Nominal (Rp)"
          required
          class="w-full min-h-[54px] sm:min-h-[50px] px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 text-base sm:text-lg font-money font-semibold text-slate-900 dark:text-slate-100 placeholder:font-sans placeholder:font-normal placeholder:text-sm sm:placeholder:text-base placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:outline-none focus:border-emerald-600"
          @input="handleProgressAmountInput"
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
