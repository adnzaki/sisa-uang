<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  TrendingUp,
  TrendingDown,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  CalendarRange,
} from 'lucide-vue-next';
import {
  useFinanceStore,
  formatHolderName,
  type TransactionItem,
} from '../stores/finance';
import { useThemeStore } from '../stores/theme';
import CustomSelect, { type SelectOptionItem } from '../components/CustomSelect.vue';
import MaterialDatePicker from '../components/MaterialDatePicker.vue';

export type AnalyticsRangeType = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';

const { locale } = useI18n();
const financeStore = useFinanceStore();
const themeStore = useThemeStore();

// Collapsible filter state ("SEMBUNYIKAN FILTER TANGGAL" / "TAMPILKAN FILTER TANGGAL")
const showDateFilter = ref(true);

// Range type: Harian, Mingguan, Bulanan, Tahunan, Custom
const rangeType = ref<AnalyticsRangeType>('monthly');

// Owner filter: 'all' ("Semua") or specific formatted holder name
const selectedOwner = ref<string>('all');

// Helper to format Date object as local YYYY-MM-DD
function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseIsoDate(iso: string): Date {
  const parts = String(iso || '').slice(0, 10).split('-');
  if (parts.length === 3) {
    const y = Number(parts[0]);
    const m = Number(parts[1]);
    const d = Number(parts[2]);
    if (y && m && d) {
      return new Date(y, m - 1, d);
    }
  }
  return new Date();
}

function getInitialAnchorDate(): Date {
  const sp = financeStore.selectedPeriod;
  if (sp && /^\d{4}-\d{2}$/.test(sp)) {
    const [y, m] = sp.split('-').map(Number);
    const now = new Date();
    if (now.getFullYear() === y && now.getMonth() + 1 === m) {
      return now;
    }
    return new Date(y, m - 1, 1);
  }
  if (financeStore.transactions.length > 0) {
    const latest = financeStore.transactions[0]?.date;
    if (latest) return parseIsoDate(latest);
  }
  return new Date();
}

const anchorDate = ref<Date>(getInitialAnchorDate());

// Custom range dates (YYYY-MM-DD)
const customStartDate = ref<string>(
  toIsoDate(new Date(anchorDate.value.getFullYear(), anchorDate.value.getMonth(), 1))
);
const customEndDate = ref<string>(
  toIsoDate(new Date(anchorDate.value.getFullYear(), anchorDate.value.getMonth() + 1, 0))
);

// Sync initial anchorDate if transactions load from Firestore and update selectedPeriod
watch(
  () => financeStore.selectedPeriod,
  (newPeriod) => {
    if (rangeType.value === 'monthly' && newPeriod && /^\d{4}-\d{2}$/.test(newPeriod)) {
      const [y, m] = newPeriod.split('-').map(Number);
      if (
        anchorDate.value.getFullYear() !== y ||
        anchorDate.value.getMonth() + 1 !== m
      ) {
        anchorDate.value = new Date(y, m - 1, 1);
      }
    }
  }
);

// Ensure customStartDate <= customEndDate when edited
watch([customStartDate, customEndDate], ([start, end]) => {
  if (start && end && start > end) {
    customEndDate.value = start;
  }
});

// When switching into 'custom' mode, initialize customStartDate & customEndDate from current active range
watch(rangeType, (newMode, oldMode) => {
  if (newMode === 'custom' && oldMode !== 'custom') {
    const currentBounds = computeBoundsForMode(oldMode, anchorDate.value);
    customStartDate.value = currentBounds.startIso;
    customEndDate.value = currentBounds.endIso;
  }
});

function computeBoundsForMode(
  mode: AnalyticsRangeType,
  refDate: Date
): { startIso: string; endIso: string } {
  const y = refDate.getFullYear();
  const m = refDate.getMonth();
  const d = refDate.getDate();

  if (mode === 'daily') {
    const iso = toIsoDate(new Date(y, m, d));
    return { startIso: iso, endIso: iso };
  }

  if (mode === 'weekly') {
    // Monday as start of week, Sunday as end of week
    const current = new Date(y, m, d);
    const dayOfWeek = current.getDay(); // 0 (Sun) .. 6 (Sat)
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(y, m, d + diffToMonday);
    const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
    return {
      startIso: toIsoDate(monday),
      endIso: toIsoDate(sunday),
    };
  }

  if (mode === 'monthly') {
    const firstDay = new Date(y, m, 1);
    const lastDay = new Date(y, m + 1, 0);
    return {
      startIso: toIsoDate(firstDay),
      endIso: toIsoDate(lastDay),
    };
  }

  if (mode === 'yearly') {
    const firstDay = new Date(y, 0, 1);
    const lastDay = new Date(y, 11, 31);
    return {
      startIso: toIsoDate(firstDay),
      endIso: toIsoDate(lastDay),
    };
  }

  // Custom mode
  const start = customStartDate.value || toIsoDate(new Date(y, m, 1));
  const end = customEndDate.value || toIsoDate(new Date(y, m + 1, 0));
  return {
    startIso: start <= end ? start : end,
    endIso: end >= start ? end : start,
  };
}

const activeBounds = computed(() => computeBoundsForMode(rangeType.value, anchorDate.value));

// Navigate backward (-1) or forward (+1) according to current rangeType
function navigatePeriod(direction: -1 | 1) {
  const current = anchorDate.value;
  const y = current.getFullYear();
  const m = current.getMonth();
  const d = current.getDate();

  if (rangeType.value === 'daily') {
    anchorDate.value = new Date(y, m, d + direction);
    return;
  }

  if (rangeType.value === 'weekly') {
    anchorDate.value = new Date(y, m, d + direction * 7);
    return;
  }

  if (rangeType.value === 'monthly') {
    const nextMonth = new Date(y, m + direction, 1);
    anchorDate.value = nextMonth;
    const ym = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}`;
    financeStore.selectedPeriod = ym;
    return;
  }

  if (rangeType.value === 'yearly') {
    anchorDate.value = new Date(y + direction, m, 1);
    return;
  }

  if (rangeType.value === 'custom') {
    const s = parseIsoDate(activeBounds.value.startIso);
    const e = parseIsoDate(activeBounds.value.endIso);
    const spanDays = Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000) + 1);
    const nextStart = new Date(s.getFullYear(), s.getMonth(), s.getDate() + direction * spanDays);
    const nextEnd = new Date(e.getFullYear(), e.getMonth(), e.getDate() + direction * spanDays);
    customStartDate.value = toIsoDate(nextStart);
    customEndDate.value = toIsoDate(nextEnd);
  }
}

function applyCustomPreset(days: number) {
  const end = new Date();
  const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - (days - 1));
  customStartDate.value = toIsoDate(start);
  customEndDate.value = toIsoDate(end);
}

// Format date as "01 Okt 2026"
function formatShortDisplayDate(iso: string): string {
  const d = parseIsoDate(iso);
  const day = String(d.getDate()).padStart(2, '0');
  const loc = locale.value === 'id' ? 'id-ID' : 'en-US';
  const month = d.toLocaleDateString(loc, { month: 'short' });
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

const formattedPeriodRangeLabel = computed(() => {
  const { startIso, endIso } = activeBounds.value;
  if (rangeType.value === 'daily' && startIso === endIso) {
    return formatShortDisplayDate(startIso);
  }
  return `${formatShortDisplayDate(startIso)} - ${formatShortDisplayDate(endIso)}`;
});

// Dropdown 1: Pilih rentang waktu (matches Screenshot 2: Harian, Mingguan, Bulanan, Tahunan, Custom)
const rangeTypeOptions = computed<SelectOptionItem[]>(() => [
  { value: 'daily', label: 'Harian' },
  { value: 'weekly', label: 'Mingguan' },
  { value: 'monthly', label: 'Bulanan' },
  { value: 'yearly', label: 'Tahunan' },
  { value: 'custom', label: 'Custom' },
]);

// Dropdown 2: Pemilik ("Semua" + all unique fund owners from walletOwners & transactions)
const ownerOptions = computed<SelectOptionItem[]>(() => {
  const names = new Set<string>();
  for (const item of financeStore.ownershipSummary) {
    if (item.displayHolderName) {
      names.add(item.displayHolderName);
    }
  }
  for (const tx of financeStore.transactions) {
    if (tx.fundOwnerName) {
      names.add(formatHolderName(tx.fundOwnerName));
    }
    if (tx.toFundOwnerName) {
      names.add(formatHolderName(tx.toFundOwnerName));
    }
  }
  const sortedNames = Array.from(names).sort((a, b) => a.localeCompare(b));
  return [
    { value: 'all', label: 'Semua' },
    ...sortedNames.map((name) => ({
      value: name,
      label: name,
    })),
  ];
});

// Helper: does transaction involve the selected owner?
function isTxMatchingOwner(tx: TransactionItem, owner: string): boolean {
  if (!owner || owner === 'all') return true;
  const sourceOwner = formatHolderName(tx.fundOwnerName);
  const destOwner = tx.toFundOwnerName ? formatHolderName(tx.toFundOwnerName) : '';
  return sourceOwner === owner || destOwner === owner;
}

// Helper: compute net balance change caused by a single transaction for the selected owner scope
function getTransactionNetDelta(tx: TransactionItem, owner: string): number {
  const amt = Number(tx.amount || 0);
  const fee = Number(tx.adminFee || 0);

  if (!owner || owner === 'all') {
    if (tx.type === 'income') return amt;
    if (tx.type === 'expense') return -amt;
    if (tx.type === 'transfer') return -fee;
    return 0;
  }

  const sourceOwner = formatHolderName(tx.fundOwnerName);
  const destOwner = tx.toFundOwnerName ? formatHolderName(tx.toFundOwnerName) : '';

  if (tx.type === 'income') {
    return sourceOwner === owner ? amt : 0;
  }
  if (tx.type === 'expense') {
    return sourceOwner === owner ? -amt : 0;
  }
  if (tx.type === 'transfer') {
    let delta = 0;
    if (sourceOwner === owner) {
      delta -= amt + fee;
    }
    if (destOwner === owner) {
      delta += amt;
    }
    return delta;
  }
  return 0;
}

// Current live balance for the selected owner ('all' or specific holder)
const currentScopeLiveBalance = computed(() => {
  if (selectedOwner.value === 'all') {
    return financeStore.totalBalance;
  }
  const found = financeStore.ownershipSummary.find(
    (o) => o.displayHolderName === selectedOwner.value || o.rawHolderName === selectedOwner.value
  );
  return found ? found.totalBalance : 0;
});

// Transactions inside active [startIso, endIso] and matching selectedOwner
const filteredPeriodTransactions = computed<TransactionItem[]>(() => {
  const { startIso, endIso } = activeBounds.value;
  return financeStore.transactions.filter((tx) => {
    const d = String(tx.date || '').slice(0, 10);
    if (d < startIso || d > endIso) return false;
    return isTxMatchingOwner(tx, selectedOwner.value);
  });
});

// Saldo Awal & Saldo Akhir calculation for the selected [startIso, endIso] and selectedOwner
const saldoAkhir = computed(() => {
  const { endIso } = activeBounds.value;
  const owner = selectedOwner.value;
  let netAfterEnd = 0;
  for (const tx of financeStore.transactions) {
    const d = String(tx.date || '').slice(0, 10);
    if (d > endIso) {
      netAfterEnd += getTransactionNetDelta(tx, owner);
    }
  }
  return currentScopeLiveBalance.value - netAfterEnd;
});

const periodNetDelta = computed(() => {
  const { startIso, endIso } = activeBounds.value;
  const owner = selectedOwner.value;
  let netInPeriod = 0;
  for (const tx of financeStore.transactions) {
    const d = String(tx.date || '').slice(0, 10);
    if (d >= startIso && d <= endIso) {
      netInPeriod += getTransactionNetDelta(tx, owner);
    }
  }
  return netInPeriod;
});

const saldoAwal = computed(() => saldoAkhir.value - periodNetDelta.value);

// Period Income & Expense for selected range and owner (strictly pure income & pure expense + admin fee)
const periodIncome = computed(() => {
  const owner = selectedOwner.value;
  let sum = 0;
  for (const tx of filteredPeriodTransactions.value) {
    if (tx.type === 'income') {
      if (owner === 'all' || formatHolderName(tx.fundOwnerName) === owner) {
        sum += Number(tx.amount || 0);
      }
    }
  }
  return sum;
});

const periodExpense = computed(() => {
  const owner = selectedOwner.value;
  let sum = 0;
  for (const tx of filteredPeriodTransactions.value) {
    const isSource = owner === 'all' || formatHolderName(tx.fundOwnerName) === owner;
    if (tx.type === 'expense' && isSource) {
      sum += Number(tx.amount || 0);
    } else if (tx.type === 'transfer' && isSource && Number(tx.adminFee || 0) > 0) {
      sum += Number(tx.adminFee || 0);
    }
  }
  return sum;
});

// Pure Cashflow Difference (Total Pemasukan - Total Pengeluaran)
const periodCashflowDiff = computed(() => periodIncome.value - periodExpense.value);

// Cross-owner transfer in/out when a specific owner is selected
const periodCrossOwnerTransferIn = computed(() => {
  const owner = selectedOwner.value;
  if (!owner || owner === 'all') return 0;
  let sum = 0;
  for (const tx of filteredPeriodTransactions.value) {
    if (tx.type === 'transfer') {
      const srcOwner = formatHolderName(tx.fundOwnerName);
      const dstOwner = tx.toFundOwnerName ? formatHolderName(tx.toFundOwnerName) : srcOwner;
      if (dstOwner === owner && srcOwner !== owner) {
        sum += Number(tx.amount || 0);
      }
    }
  }
  return sum;
});

const periodCrossOwnerTransferOut = computed(() => {
  const owner = selectedOwner.value;
  if (!owner || owner === 'all') return 0;
  let sum = 0;
  for (const tx of filteredPeriodTransactions.value) {
    if (tx.type === 'transfer') {
      const srcOwner = formatHolderName(tx.fundOwnerName);
      const dstOwner = tx.toFundOwnerName ? formatHolderName(tx.toFundOwnerName) : srcOwner;
      if (srcOwner === owner && dstOwner !== owner) {
        sum += Number(tx.amount || 0);
      }
    }
  }
  return sum;
});

const periodNetTransferDelta = computed(
  () => periodCrossOwnerTransferIn.value - periodCrossOwnerTransferOut.value
);

const periodSavingsRate = computed(() => {
  if (periodIncome.value <= 0) return 0;
  const saved = periodIncome.value - periodExpense.value;
  return Math.round((saved / periodIncome.value) * 100);
});

const categoryBreakdown = computed(() => {
  const map = new Map<string, number>();
  const owner = selectedOwner.value;

  for (const tx of filteredPeriodTransactions.value) {
    const isSource = owner === 'all' || formatHolderName(tx.fundOwnerName) === owner;
    if (!isSource) continue;

    if (tx.type === 'expense') {
      map.set(tx.category, (map.get(tx.category) || 0) + Number(tx.amount || 0));
    } else if (tx.type === 'transfer' && Number(tx.adminFee || 0) > 0) {
      map.set(
        'Biaya Admin Transfer',
        (map.get('Biaya Admin Transfer') || 0) + Number(tx.adminFee || 0)
      );
    }
  }

  const totalExp = Math.max(
    1,
    Array.from(map.values()).reduce((a, b) => a + b, 0)
  );
  return Array.from(map.entries())
    .map(([category, amount]) => ({
      category,
      amount,
      share: Math.round((amount / totalExp) * 100),
    }))
    .sort((a, b) => b.amount - a.amount);
});

const incomeCategoryBreakdown = computed(() => {
  const map = new Map<string, number>();
  const owner = selectedOwner.value;

  for (const tx of filteredPeriodTransactions.value) {
    if (tx.type === 'income') {
      if (owner === 'all' || formatHolderName(tx.fundOwnerName) === owner) {
        map.set(tx.category, (map.get(tx.category) || 0) + Number(tx.amount || 0));
      }
    }
  }

  const totalInc = Math.max(
    1,
    Array.from(map.values()).reduce((a, b) => a + b, 0)
  );
  return Array.from(map.entries())
    .map(([category, amount]) => ({
      category,
      amount,
      share: Math.round((amount / totalInc) * 100),
    }))
    .sort((a, b) => b.amount - a.amount);
});

const walletAllocation = computed(() => {
  if (selectedOwner.value !== 'all') {
    const ownerItem = financeStore.ownershipSummary.find(
      (o) =>
        o.displayHolderName === selectedOwner.value || o.rawHolderName === selectedOwner.value
    );
    if (!ownerItem) return [];
    const total = Math.max(1, ownerItem.totalBalance);
    return ownerItem.wallets
      .map((w) => ({
        id: w.holderId,
        name: w.walletName,
        balance: w.balance,
        share: Math.max(0, Math.round((w.balance / total) * 100)),
      }))
      .sort((a, b) => b.balance - a.balance);
  }

  const total = Math.max(1, financeStore.totalBalance);
  return financeStore.wallets
    .map((w) => ({
      id: w.id,
      name: w.name,
      balance: w.balance,
      share: Math.max(0, Math.round((w.balance / total) * 100)),
    }))
    .sort((a, b) => b.balance - a.balance);
});
</script>

<template>
  <div class="space-y-5 sm:space-y-6 max-w-full overflow-x-hidden">
    <!-- Page Title Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
      <div class="min-w-0">
        <h1 class="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Statistik & Analitik Keuangan
        </h1>
        <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Pantau saldo awal, saldo akhir, dan arus kas berdasarkan rentang waktu serta kepemilikan dana.
        </p>
      </div>
    </div>

    <!-- =================================================================== -->
    <!-- FILTER & PERIOD NAVIGATION CARD (Sisa Uang Style)                   -->
    <!-- =================================================================== -->
    <section class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4">
      <!-- Collapsible Filter Controls (Pilih rentang waktu, Pemilik, Custom Dates) -->
      <Transition name="dropdown">
        <div v-if="showDateFilter" class="space-y-3.5">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <!-- 1. Pilih rentang waktu (Harian, Mingguan, Bulanan, Tahunan, Custom) -->
            <CustomSelect
              v-model="rangeType"
              :options="rangeTypeOptions"
              placeholder="Pilih rentang waktu"
            />

            <!-- 2. Pemilik (Semua / Specific Fund Owner) -->
            <CustomSelect
              v-model="selectedOwner"
              :options="ownerOptions"
              placeholder="Pemilik"
            />
          </div>

          <!-- Custom Date Range Pickers (Shown when rangeType === 'custom') -->
          <Transition name="dropdown">
            <div
              v-if="rangeType === 'custom'"
              class="rounded-2xl border border-emerald-200/80 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20 p-3.5 space-y-3"
            >
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="flex items-center gap-1.5 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                  <CalendarRange class="w-4 h-4 shrink-0" />
                  <span>Rentang Tanggal Kustom</span>
                </div>
                <div class="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    class="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-300 hover:border-emerald-500 transition-colors"
                    @click="applyCustomPreset(7)"
                  >
                    7 Hari Terakhir
                  </button>
                  <button
                    type="button"
                    class="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-300 hover:border-emerald-500 transition-colors"
                    @click="applyCustomPreset(30)"
                  >
                    30 Hari Terakhir
                  </button>
                  <button
                    type="button"
                    class="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-300 hover:border-emerald-500 transition-colors"
                    @click="applyCustomPreset(90)"
                  >
                    90 Hari Terakhir
                  </button>
                </div>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <MaterialDatePicker
                  v-model="customStartDate"
                  label="Tanggal Mulai"
                />
                <MaterialDatePicker
                  v-model="customEndDate"
                  label="Tanggal Akhir"
                />
              </div>
            </div>
          </Transition>
        </div>
      </Transition>

      <!-- Pill Button: SEMBUNYIKAN / TAMPILKAN FILTER TANGGAL -->
      <!-- <button
        type="button"
        class="w-full min-h-[46px] px-5 py-2.5 rounded-full bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white text-xs sm:text-sm font-bold uppercase tracking-wider shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer"
        @click="showDateFilter = !showDateFilter"
      >
        <SlidersHorizontal class="w-4 h-4 shrink-0" />
        <span>
          {{ showDateFilter ? 'SEMBUNYIKAN FILTER TANGGAL' : 'TAMPILKAN FILTER TANGGAL' }}
        </span>
      </button> -->

      <!-- Direct Period Navigation Bar (< 01 Okt 2026 - 31 Okt 2026 >) -->
      <div class="pt-1 flex items-center justify-between gap-2 sm:gap-4">
        <button
          type="button"
          class="min-h-[44px] min-w-[44px] rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:border-emerald-500/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center transition-colors shrink-0 cursor-pointer"
          aria-label="Periode Sebelumnya"
          title="Periode Sebelumnya"
          @click="navigatePeriod(-1)"
        >
          <ChevronLeft class="w-5 h-5 stroke-[2.5]" />
        </button>

        <button
          type="button"
          class="flex-1 min-w-0 py-2 px-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 text-center transition-colors cursor-pointer"
          title="Ketuk untuk mengatur filter periode"
          @click="showDateFilter = true"
        >
          <div class="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight truncate">
            {{ formattedPeriodRangeLabel }}
          </div>
          <div class="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate mt-0.5">
            <span>{{ rangeTypeOptions.find((o) => o.value === rangeType)?.label }}</span>
            <span class="mx-1.5">·</span>
            <span>Pemilik: {{ selectedOwner === 'all' ? 'Semua' : selectedOwner }}</span>
            <span class="mx-1.5">·</span>
            <span>{{ filteredPeriodTransactions.length }} Transaksi</span>
          </div>
        </button>

        <button
          type="button"
          class="min-h-[44px] min-w-[44px] rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:border-emerald-500/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center transition-colors shrink-0 cursor-pointer"
          aria-label="Periode Berikutnya"
          title="Periode Berikutnya"
          @click="navigatePeriod(1)"
        >
          <ChevronRight class="w-5 h-5 stroke-[2.5]" />
        </button>
      </div>
    </section>

    <!-- =================================================================== -->
    <!-- SALDO AWAL & SALDO AKHIR HERO CARDS (Matching Screenshot 1)         -->
    <!-- =================================================================== -->
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <!-- Card 1: Saldo Awal -->
      <div class="rounded-3xl bg-gradient-to-br from-teal-600 to-emerald-600 dark:from-teal-700 dark:to-emerald-800 p-5 sm:p-6 text-white shadow-md flex flex-col justify-between gap-4 min-w-0">
        <div class="flex items-start justify-between gap-3">
          <div class="space-y-1">
            <h2 class="text-xl sm:text-2xl font-bold tracking-tight text-white">
              Saldo Awal
            </h2>
            <p class="text-xs text-emerald-50/90">
              Posisi saldo pada awal periode ({{ formatShortDisplayDate(activeBounds.startIso) }})
            </p>
          </div>
          <div class="w-10 h-10 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
            <Wallet class="w-5 h-5 text-white" />
          </div>
        </div>

        <div>
          <span class="inline-block px-3.5 py-1.5 rounded-xl bg-white text-slate-900 font-money font-bold text-base sm:text-lg tabular-nums shadow-xs">
            {{ themeStore.formatMoney(saldoAwal) }}
          </span>
        </div>
      </div>

      <!-- Card 2: Saldo Akhir -->
      <div class="rounded-3xl bg-gradient-to-br from-emerald-600 to-emerald-700 dark:from-emerald-600 dark:to-teal-800 p-5 sm:p-6 text-white shadow-md flex flex-col justify-between gap-4 min-w-0">
        <div class="flex items-start justify-between gap-3">
          <div class="space-y-1">
            <h2 class="text-xl sm:text-2xl font-bold tracking-tight text-white">
              Saldo Akhir
            </h2>
            <p class="text-xs text-emerald-50/90">
              Posisi saldo pada akhir periode ({{ formatShortDisplayDate(activeBounds.endIso) }})
            </p>
          </div>
          <div class="w-10 h-10 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
            <TrendingUp v-if="saldoAkhir >= saldoAwal" class="w-5 h-5 text-white" />
            <TrendingDown v-else class="w-5 h-5 text-white" />
          </div>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="inline-block px-3.5 py-1.5 rounded-xl bg-white text-slate-900 font-money font-bold text-base sm:text-lg tabular-nums shadow-xs">
            {{ themeStore.formatMoney(saldoAkhir) }}
          </span>

          <span
            class="text-xs font-money font-bold px-2.5 py-1 rounded-lg bg-black/20 text-white tabular-nums"
          >
            {{ periodNetDelta >= 0 ? '+' : '' }}{{ themeStore.formatMoney(periodNetDelta) }}
          </span>
        </div>
      </div>
    </div>

    <!-- =================================================================== -->
    <!-- PEMASUKAN, PENGELUARAN & RASIO TABUNGAN PADA PERIODE INI            -->
    <!-- =================================================================== -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3.5 sm:gap-4">
      <div class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-1.5 min-w-0">
        <div class="flex items-center justify-between gap-2">
          <span class="text-xs text-slate-500 dark:text-slate-400">Total Pemasukan Periode</span>
          <ArrowDownRight class="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
        </div>
        <div class="text-xl sm:text-2xl font-money font-bold tabular-nums text-emerald-600 dark:text-emerald-400 truncate">
          {{ themeStore.formatMoney(periodIncome) }}
        </div>
        <div class="text-xs text-slate-500 dark:text-slate-400 truncate">
          {{ formattedPeriodRangeLabel }}
        </div>
      </div>

      <div class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-1.5 min-w-0">
        <div class="flex items-center justify-between gap-2">
          <span class="text-xs text-slate-500 dark:text-slate-400">Total Pengeluaran Periode</span>
          <ArrowUpRight class="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
        </div>
        <div class="text-xl sm:text-2xl font-money font-bold tabular-nums text-rose-600 dark:text-rose-400 truncate">
          {{ themeStore.formatMoney(periodExpense) }}
        </div>
        <div class="text-xs text-slate-500 dark:text-slate-400 truncate">
          {{ formattedPeriodRangeLabel }}
        </div>
      </div>

      <div class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-1.5 min-w-0">
        <div class="text-xs text-slate-500 dark:text-slate-400">Selisih Arus Kas & Rasio Sisa</div>
        <div
          class="text-xl sm:text-2xl font-money font-bold tabular-nums truncate"
          :class="
            periodCashflowDiff >= 0
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-rose-600 dark:text-rose-400'
          "
        >
          {{ periodCashflowDiff >= 0 ? '+' : '' }}{{ themeStore.formatMoney(periodCashflowDiff) }}
        </div>
        <div class="text-xs text-slate-500 dark:text-slate-400 truncate">
          Rasio Tabungan: <strong class="font-money">{{ periodSavingsRate }}%</strong>
          <template v-if="selectedOwner !== 'all' && periodNetTransferDelta !== 0">
            <span class="mx-1">·</span>
            <span>
              Mutasi Antar Pemilik:
              <strong
                class="font-money"
                :class="
                  periodNetTransferDelta >= 0
                    ? 'text-indigo-600 dark:text-indigo-400'
                    : 'text-amber-600 dark:text-amber-400'
                "
              >
                {{ periodNetTransferDelta >= 0 ? '+' : '' }}{{ themeStore.formatMoney(periodNetTransferDelta) }}
              </strong>
            </span>
          </template>
        </div>
      </div>
    </div>

    <!-- =================================================================== -->
    <!-- TWO COLUMN BREAKDOWN (KATEGORI PENGELUARAN, PEMASUKAN & ALOKASI)    -->
    <!-- =================================================================== -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
      <!-- Category Expense Distribution -->
      <section class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4 min-w-0">
        <div>
          <h2 class="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
            Distribusi Pengeluaran per Kategori
          </h2>
          <p class="text-xs text-slate-500 dark:text-slate-400">
            {{ formattedPeriodRangeLabel }} · Pemilik: {{ selectedOwner === 'all' ? 'Semua' : selectedOwner }}
          </p>
        </div>

        <div v-if="categoryBreakdown.length === 0" class="py-8 text-center text-xs text-slate-500">
          Belum ada data pengeluaran pada rentang waktu ini.
        </div>

        <div v-else class="space-y-3.5">
          <div
            v-for="item in categoryBreakdown"
            :key="item.category"
            class="space-y-1.5"
          >
            <div class="flex items-center justify-between gap-2 text-xs min-w-0">
              <span class="font-semibold text-slate-800 dark:text-slate-200 truncate">
                {{ item.category }}
              </span>
              <span class="font-money tabular-nums text-slate-600 dark:text-slate-300 shrink-0">
                {{ themeStore.formatMoney(item.amount) }} · {{ item.share }}%
              </span>
            </div>
            <div class="h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                class="h-full rounded-full bg-rose-500 transition-all duration-300"
                :style="{ width: `${item.share}%` }"
              ></div>
            </div>
          </div>
        </div>
      </section>

      <!-- Wallet Asset Allocation & Income Breakdown -->
      <div class="space-y-4 sm:space-y-6 min-w-0">
        <section class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4">
          <div>
            <h2 class="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
              Alokasi Dana Lintas Sumber Dana
            </h2>
            <p class="text-xs text-slate-500 dark:text-slate-400">
              Komposisi saldo saat ini ({{ selectedOwner === 'all' ? 'Semua Pemilik' : `Pemilik: ${selectedOwner}` }})
            </p>
          </div>

          <div v-if="walletAllocation.length === 0" class="py-6 text-center text-xs text-slate-500">
            Belum ada sumber dana untuk pemilik ini.
          </div>

          <div v-else class="space-y-3.5">
            <div
              v-for="w in walletAllocation"
              :key="w.id"
              class="space-y-1.5"
            >
              <div class="flex items-center justify-between gap-2 text-xs min-w-0">
                <span class="font-semibold text-slate-800 dark:text-slate-200 truncate">
                  {{ w.name }}
                </span>
                <span class="font-money tabular-nums text-slate-600 dark:text-slate-300 shrink-0">
                  {{ themeStore.formatMoney(w.balance) }} · {{ w.share }}%
                </span>
              </div>
              <div class="h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  class="h-full rounded-full bg-emerald-600 transition-all duration-300"
                  :style="{ width: `${w.share}%` }"
                ></div>
              </div>
            </div>
          </div>
        </section>

        <section
          v-if="incomeCategoryBreakdown.length > 0"
          class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4"
        >
          <div>
            <h2 class="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
              Sumber Pemasukan per Kategori
            </h2>
            <p class="text-xs text-slate-500 dark:text-slate-400">
              {{ formattedPeriodRangeLabel }} · Pemilik: {{ selectedOwner === 'all' ? 'Semua' : selectedOwner }}
            </p>
          </div>

          <div class="space-y-3.5">
            <div
              v-for="item in incomeCategoryBreakdown"
              :key="item.category"
              class="space-y-1.5"
            >
              <div class="flex items-center justify-between gap-2 text-xs min-w-0">
                <span class="font-semibold text-slate-800 dark:text-slate-200 truncate">
                  {{ item.category }}
                </span>
                <span class="font-money tabular-nums text-slate-600 dark:text-slate-300 shrink-0">
                  {{ themeStore.formatMoney(item.amount) }} · {{ item.share }}%
                </span>
              </div>
              <div class="h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  class="h-full rounded-full bg-emerald-600 transition-all duration-300"
                  :style="{ width: `${item.share}%` }"
                ></div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
