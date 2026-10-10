<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
  Plus,
  Check,
  Trash2,
  ArrowRight,
  ArrowLeft,
  Calendar,
  FolderOpen,
  Lock,
  PieChart,
  Crown,
} from 'lucide-vue-next';
import {
  useFinanceStore,
  formatPeriodLabel,
  getCurrentMonthPeriod,
} from '../stores/finance';
import { useThemeStore } from '../stores/theme';
import { useAuthStore } from '../stores/auth';
import { useNotificationStore } from '../stores/notification';
import AppModal from '../components/AppModal.vue';
import CustomSelect, { type SelectOptionItem } from '../components/CustomSelect.vue';

const { t, locale } = useI18n();
const financeStore = useFinanceStore();
const themeStore = useThemeStore();
const authStore = useAuthStore();
const notificationStore = useNotificationStore();

const now = new Date();
const currentYearNum = now.getFullYear();
const currentMonthNum = now.getMonth() + 1;
const nextYearNum = currentYearNum + 1;

// Selected year in the Budgets Page Year Dropdown
const selectedYear = ref<string>(String(currentYearNum));

// Currently opened period ('YYYY-MM' or null when on the Period List view)
const activeBudgetPeriod = ref<string | null>(null);

// All registered periods (combining explicit budgetPeriods + periods that already have budget items)
const allRegisteredPeriods = computed<string[]>(() => {
  const set = new Set<string>(financeStore.budgetPeriods);
  for (const b of financeStore.budgets) {
    if (!b.deleted && b.period && /^\d{4}-\d{2}$/.test(b.period)) {
      set.add(b.period);
    }
  }
  return Array.from(set).sort((a, b) => b.localeCompare(a));
});

// Dropdown Pilihan Tahun:
// Tahun yang sudah terisi anggaran + tahun berjalan + tahun depan (misal 2025, 2026, dan 2027)
const yearDropdownOptions = computed<SelectOptionItem[]>(() => {
  const yearSet = new Set<number>([currentYearNum, nextYearNum]);
  for (const p of allRegisteredPeriods.value) {
    const y = Number(p.slice(0, 4));
    if (y >= 2000 && y <= 2100) {
      yearSet.add(y);
    }
  }
  const sortedYears = Array.from(yearSet).sort((a, b) => a - b);
  return sortedYears.map((y) => {
    const countInYear = allRegisteredPeriods.value.filter((p) => p.startsWith(`${y}-`)).length;
    let badge = '';
    if (y === currentYearNum) badge = 'Tahun Berjalan';
    else if (y === nextYearNum) badge = 'Tahun Depan';
    else badge = 'Arsip';

    return {
      value: String(y),
      label: `Tahun ${y}`,
      badge,
    };
  });
});

// Ensure selectedYear is always valid
watch(
  yearDropdownOptions,
  (opts) => {
    if (opts.length > 0 && !opts.some((o) => o.value === selectedYear.value)) {
      selectedYear.value = String(currentYearNum);
    }
  },
  { immediate: true }
);

// Close detail view if user switches the year dropdown to a different year
watch(selectedYear, (newYear) => {
  if (activeBudgetPeriod.value && !activeBudgetPeriod.value.startsWith(`${newYear}-`)) {
    activeBudgetPeriod.value = null;
  }
});

// Daftar periode yang ditampilkan sesuai dengan dropdown tahun yang dipilih
const periodsForSelectedYear = computed(() => {
  const prefix = `${selectedYear.value}-`;
  const matching = allRegisteredPeriods.value
    .filter((p) => p.startsWith(prefix))
    .sort((a, b) => a.localeCompare(b));

  return matching.map((period) => {
    const items = financeStore.getEnrichedBudgetsByPeriod(period);
    const totalLimit = items.reduce((sum, b) => sum + Number(b.limitAmount || 0), 0);
    const totalSpent = items.reduce((sum, b) => sum + Number(b.spentAmount || 0), 0);
    const rawPercent = totalLimit > 0 ? Math.round((totalSpent / totalLimit) * 100) : 0;
    const barWidth = Math.min(100, Math.max(0, rawPercent));
    const netVariance = totalLimit - totalSpent;

    return {
      period,
      label: formatPeriodLabel(period, locale.value === 'id' ? 'id-ID' : 'en-US'),
      itemsCount: items.length,
      totalLimit,
      totalSpent,
      rawPercent,
      barWidth,
      netVariance,
    };
  });
});

// Enriched budgets inside the currently opened period
const activePeriodBudgets = computed(() => {
  if (!activeBudgetPeriod.value) return [];
  return financeStore.getEnrichedBudgetsByPeriod(activeBudgetPeriod.value);
});

const activePeriodSummary = computed(() => {
  const items = activePeriodBudgets.value;
  const totalLimit = items.reduce((sum, b) => sum + Number(b.limitAmount || 0), 0);
  const totalSpent = items.reduce((sum, b) => sum + Number(b.spentAmount || 0), 0);
  const rawPercent = totalLimit > 0 ? Math.round((totalSpent / totalLimit) * 100) : 0;
  const barWidth = Math.min(100, Math.max(0, rawPercent));
  const netVariance = totalLimit - totalSpent;
  return {
    itemsCount: items.length,
    totalLimit,
    totalSpent,
    rawPercent,
    barWidth,
    netVariance,
  };
});

// =========================================================================
// Modal 1: Tambah Periode Anggaran (Bulan berjalan s/d Desember tahun depan)
// =========================================================================
const showAddPeriodModal = ref(false);
const newPeriodYear = ref<string>(String(currentYearNum));
const newPeriodMonth = ref<string>(String(currentMonthNum).padStart(2, '0'));

const allowedAddYearsOptions = computed<SelectOptionItem[]>(() => [
  {
    value: String(currentYearNum),
    label: `${currentYearNum} (Tahun Berjalan)`,
    badge: 'Aktif',
  },
  {
    value: String(nextYearNum),
    label: `${nextYearNum} (Tahun Depan)`,
    badge: authStore.isProUser ? 'Maks. Des' : 'PRO',
  },
]);

const allowedAddMonthsOptions = computed<SelectOptionItem[]>(() => {
  const targetYear = Number(newPeriodYear.value) || currentYearNum;
  const startMonth = targetYear === currentYearNum ? currentMonthNum : 1;
  const loc = locale.value === 'id' ? 'id-ID' : 'en-US';
  const currentPeriodKey = getCurrentMonthPeriod();
  const list: SelectOptionItem[] = [];

  for (let m = startMonth; m <= 12; m++) {
    const mm = String(m).padStart(2, '0');
    const periodKey = `${targetYear}-${mm}`;
    const alreadyAdded = allRegisteredPeriods.value.includes(periodKey);
    const isFuturePeriod = periodKey > currentPeriodKey;
    const monthName = new Date(targetYear, m - 1, 1).toLocaleDateString(loc, {
      month: 'long',
    });

    let badge: string | undefined;
    if (alreadyAdded) {
      badge = 'Terdaftar';
    } else if (isFuturePeriod && !authStore.isProUser) {
      badge = 'PRO';
    }

    list.push({
      value: mm,
      label: `${monthName} ${targetYear}${alreadyAdded ? ' (Sudah Ada)' : ''}`,
      badge,
    });
  }
  return list;
});

watch(newPeriodYear, () => {
  const validMonths = allowedAddMonthsOptions.value;
  if (validMonths.length > 0 && !validMonths.some((m) => m.value === newPeriodMonth.value)) {
    const firstAvailable =
      validMonths.find((m) => !m.label.includes('(Sudah Ada)')) || validMonths[0];
    newPeriodMonth.value = firstAvailable.value;
  }
});

function openAddPeriodModal() {
  const currentPeriodKey = getCurrentMonthPeriod();
  const currentMonthAlreadyRegistered = allRegisteredPeriods.value.includes(currentPeriodKey);

  // If Free user already has the current month registered, any new period they add would be a future period
  if (!authStore.isProUser && currentMonthAlreadyRegistered) {
    notificationStore.openProModal({
      featureTitle: 'Anggaran Periode Akan Datang',
      featureDescription: `Pengguna paket Free hanya mendukung pembuatan anggaran pada bulan saat ini (${formatPeriodLabel(currentPeriodKey)}). Berlangganan SisaUang Pro untuk membuat anggaran pada bulan-bulan yang akan datang.`,
      limitSummary: `Paket Free: Hanya Bulan Ini (${formatPeriodLabel(currentPeriodKey)})`,
    });
    return;
  }

  if (!authStore.isProUser) {
    newPeriodYear.value = String(currentYearNum);
    newPeriodMonth.value = String(currentMonthNum).padStart(2, '0');
    showAddPeriodModal.value = true;
    return;
  }

  // Default to selectedYear if it is currentYear or nextYear, otherwise currentYear
  const yNum = Number(selectedYear.value);
  if (yNum === currentYearNum || yNum === nextYearNum) {
    newPeriodYear.value = String(yNum);
  } else {
    newPeriodYear.value = String(currentYearNum);
  }

  // Pick first month not yet added in that year
  const months = allowedAddMonthsOptions.value;
  const firstAvailable = months.find((m) => !m.label.includes('(Sudah Ada)')) || months[0];
  if (firstAvailable) {
    newPeriodMonth.value = firstAvailable.value;
  }
  showAddPeriodModal.value = true;
}

async function handleCreatePeriod() {
  const periodStr = `${newPeriodYear.value}-${newPeriodMonth.value}`;
  const currentPeriodKey = getCurrentMonthPeriod();
  if (!authStore.isProUser && periodStr > currentPeriodKey) {
    showAddPeriodModal.value = false;
    notificationStore.openProModal({
      featureTitle: 'Anggaran Periode Akan Datang',
      featureDescription: `Pengguna paket Free hanya mendukung pembuatan anggaran pada bulan saat ini (${formatPeriodLabel(currentPeriodKey)}). Berlangganan SisaUang Pro untuk merencanakan anggaran periode mendatang.`,
      limitSummary: `Paket Free: Hanya Bulan Ini (${formatPeriodLabel(currentPeriodKey)})`,
    });
    return;
  }
  const created = await financeStore.addBudgetPeriod(periodStr);
  if (created) {
    showAddPeriodModal.value = false;
    selectedYear.value = newPeriodYear.value;
  }
}

function openPeriodDetail(period: string) {
  activeBudgetPeriod.value = period;
  // Also sync financeStore.selectedPeriod so Dashboard & global period context match
  financeStore.selectedPeriod = period;
}

async function handleTryDeletePeriod(periodInfo: {
  period: string;
  label: string;
  itemsCount: number;
}) {
  if (periodInfo.itemsCount > 0) {
    notificationStore.notifyError(
      'Periode Tidak Dapat Dihapus',
      `Periode ${periodInfo.label} masih berisi ${periodInfo.itemsCount} kategori anggaran. Buka periode ini dan hapus seluruh anggaran di dalamnya terlebih dahulu.`
    );
    return;
  }
  const deleted = await financeStore.removeBudgetPeriod(periodInfo.period);
  if (deleted && activeBudgetPeriod.value === periodInfo.period) {
    activeBudgetPeriod.value = null;
  }
}

// =========================================================================
// Modal 2: Tambah / Ubah Kategori Anggaran di dalam Periode yang Dibuka
// =========================================================================
const showBudgetForm = ref(false);
const isEditingBudget = ref(false);
const editingBudgetId = ref<string | null>(null);
const category = ref('');
const limitAmount = ref<number | ''>('');

function formatNominalDisplay(val: number | string | ''): string {
  const digits = String(val ?? '')
    .replace(/\D/g, '')
    .replace(/^0+/, '');
  if (!digits) return '';
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

const limitAmountDisplay = computed(() => formatNominalDisplay(limitAmount.value));

function handleLimitAmountInput(event: Event) {
  const input = event.target as HTMLInputElement;
  const rawValue = input.value;
  const selectionStart = input.selectionStart ?? rawValue.length;
  const digitsBeforeCursor = rawValue
    .slice(0, selectionStart)
    .replace(/\D/g, '')
    .replace(/^0+/, '').length;

  const cleanDigits = rawValue.replace(/\D/g, '').replace(/^0+/, '');
  limitAmount.value = cleanDigits ? Number(cleanDigits) : '';

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

const expenseCategoryOptions = computed<SelectOptionItem[]>(() =>
  financeStore.expenseCategoryNames.map((cat) => ({
    value: cat,
    label: cat,
    badge: 'Pengeluaran',
  }))
);

function openAddBudgetModal() {
  if (!activeBudgetPeriod.value) return;
  const currentPeriodKey = getCurrentMonthPeriod();
  if (!authStore.isProUser && activeBudgetPeriod.value > currentPeriodKey) {
    notificationStore.openProModal({
      featureTitle: 'Anggaran Periode Akan Datang',
      featureDescription: `Pengguna paket Free hanya mendukung pembuatan anggaran pada bulan saat ini (${formatPeriodLabel(currentPeriodKey)}). Berlangganan SisaUang Pro untuk menambahkan kategori anggaran di periode akan datang.`,
      limitSummary: `Paket Free: Hanya Bulan Ini (${formatPeriodLabel(currentPeriodKey)})`,
    });
    return;
  }
  isEditingBudget.value = false;
  editingBudgetId.value = null;
  category.value = '';
  limitAmount.value = '';
  showBudgetForm.value = true;
}

function openEditBudgetModal(b: { id: string; category: string; limitAmount: number }) {
  isEditingBudget.value = true;
  editingBudgetId.value = b.id;
  category.value = b.category;
  limitAmount.value = b.limitAmount;
  showBudgetForm.value = true;
}

async function handleSaveBudget() {
  if (!activeBudgetPeriod.value) return;
  const num = Number(limitAmount.value || 0);
  if (!category.value.trim() || num <= 0) return;

  await financeStore.saveBudget({
    id: isEditingBudget.value ? editingBudgetId.value : null,
    category: category.value,
    limitAmount: num,
    period: activeBudgetPeriod.value,
  });
  showBudgetForm.value = false;
}

async function handleDeleteEditingBudget() {
  if (!editingBudgetId.value) return;
  const id = editingBudgetId.value;
  showBudgetForm.value = false;
  await financeStore.removeBudget(id);
}
</script>

<template>
  <div class="w-full max-w-full space-y-5 sm:space-y-6 overflow-x-hidden">
    <!-- =================================================================== -->
    <!-- VIEW 1: DAFTAR PERIODE ANGGARAN (Berdasarkan Tahun yang Dipilih)    -->
    <!-- =================================================================== -->
    <template v-if="!activeBudgetPeriod">
      <!-- Header & Year Dropdown + Add Period Action (Stacked below title & description) -->
      <div class="flex flex-col gap-3.5 w-full">
        <div class="w-full min-w-0">
          <h1 class="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            {{ t('budgets.title') }}
          </h1>
          <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Tambahkan periode bulan terlebih dahulu, lalu klik periode untuk mengelola kategori anggaran di dalamnya.
          </p>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap items-stretch lg:items-center gap-2.5 w-full">
          <!-- Dropdown Pilihan Tahun -->
          <div class="w-full lg:w-56 min-w-0">
            <CustomSelect
              v-model="selectedYear"
              :options="yearDropdownOptions"
              aria-label="Pilih Tahun Anggaran"
            >
              <template #icon>
                <Calendar class="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              </template>
            </CustomSelect>
          </div>

          <!-- Tombol Tambah Periode (Bulan) -->
          <button
            type="button"
            class="w-full lg:w-auto min-h-[46px] px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-1.5 transition-colors shadow-xs whitespace-nowrap"
            @click="openAddPeriodModal"
          >
            <Plus class="w-4 h-4 shrink-0" />
            <span>Tambah Periode Bulan</span>
            <span
              v-if="!authStore.isProUser && allRegisteredPeriods.includes(getCurrentMonthPeriod())"
              class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-400 text-slate-950 text-[10px] font-extrabold uppercase tracking-wider"
            >
              <Crown class="w-3 h-3 shrink-0" />
              <span>PRO</span>
            </span>
          </button>
        </div>
      </div>

      <!-- Empty State jika Tahun yang dipilih belum memiliki periode anggaran -->
      <div
        v-if="periodsForSelectedYear.length === 0"
        class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center space-y-4"
      >
        <div class="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200/60 dark:border-emerald-900/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
          <Calendar class="w-6 h-6" />
        </div>
        <div class="space-y-1.5">
          <h3 class="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
            Belum Ada Periode Anggaran di Tahun {{ selectedYear }}
          </h3>
          <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
            Tambahkan periode bulan terlebih dahulu (tersedia mulai bulan berjalan hingga Desember {{ nextYearNum }}), kemudian klik periode tersebut untuk menambahkan kategori anggaran.
          </p>
        </div>

        <div class="pt-1 flex flex-col items-center gap-3">
          <button
            type="button"
            class="min-h-[46px] px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 transition-colors shadow-xs"
            @click="openAddPeriodModal"
          >
            <Plus class="w-4 h-4 shrink-0" />
            <span>Tambah Periode Bulan</span>
          </button>
        </div>
      </div>

      <!-- Grid Daftar Periode (Bulan) sesuai Tahun yang dipilih -->
      <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4">
        <div
          v-for="pItem in periodsForSelectedYear"
          :key="pItem.period"
          role="button"
          tabindex="0"
          class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4 hover:border-emerald-500/60 active:scale-[0.99] transition-all cursor-pointer group"
          @click="openPeriodDetail(pItem.period)"
          @keydown.enter="openPeriodDetail(pItem.period)"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <h3 class="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                  {{ pItem.label }}
                </h3>
                <span
                  v-if="pItem.period === getCurrentMonthPeriod()"
                  class="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300"
                >
                  Bulan Ini
                </span>
              </div>

              <div class="text-xs text-slate-500 dark:text-slate-400 mt-1 flex flex-wrap items-center gap-1.5">
                <span class="font-semibold text-slate-700 dark:text-slate-300">
                  {{ pItem.itemsCount }} Kategori Anggaran
                </span>
                <template v-if="pItem.itemsCount > 0">
                  <span aria-hidden="true">·</span>
                  <span
                    class="font-money font-semibold"
                    :class="
                      pItem.rawPercent > 100
                        ? 'text-rose-600 dark:text-rose-400'
                        : pItem.rawPercent >= 85
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-emerald-600 dark:text-emerald-400'
                    "
                  >
                    {{ pItem.rawPercent }}% terserap
                  </span>
                </template>
                <template v-else>
                  <span aria-hidden="true">·</span>
                  <span class="text-amber-600 dark:text-amber-400 font-medium">
                    Klik untuk tambah kategori
                  </span>
                </template>
              </div>
            </div>

            <!-- Tombol Hapus Periode (Dicegah jika sudah terisi anggaran) -->
            <button
              type="button"
              class="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl border shrink-0 transition-colors"
              :class="
                pItem.itemsCount > 0
                  ? 'border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-800/40 text-slate-400 dark:text-slate-500 hover:border-amber-400/60 hover:text-amber-600 dark:hover:text-amber-400'
                  : 'border-rose-200/70 dark:border-rose-900/50 bg-rose-50/70 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400'
              "
              :title="
                pItem.itemsCount > 0
                  ? 'Kosongkan anggaran di dalam periode ini terlebih dahulu sebelum menghapus periode'
                  : 'Hapus Periode Anggaran'
              "
              @click.stop="handleTryDeletePeriod(pItem)"
            >
              <Lock v-if="pItem.itemsCount > 0" class="w-4 h-4" />
              <Trash2 v-else class="w-5 h-5" />
            </button>
          </div>

          <!-- Progress Bar Serapan Periode -->
          <div class="h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              class="h-full rounded-full transition-all duration-300"
              :class="
                pItem.rawPercent > 100
                  ? 'bg-rose-600'
                  : pItem.rawPercent >= 85
                    ? 'bg-amber-500'
                    : 'bg-emerald-600'
              "
              :style="{ width: `${pItem.barWidth}%` }"
            ></div>
          </div>

          <div class="grid grid-cols-3 gap-2 pt-2.5 border-t border-slate-100 dark:border-slate-800 text-xs">
            <div class="min-w-0">
              <div class="text-slate-400 truncate">{{ t('budgets.spent') }}</div>
              <div class="font-money font-bold tabular-nums text-slate-900 dark:text-slate-100 mt-0.5 truncate">
                {{ themeStore.formatMoney(pItem.totalSpent) }}
              </div>
            </div>
            <div class="min-w-0">
              <div class="text-slate-400 truncate">
                {{ pItem.netVariance >= 0 ? t('budgets.remaining') : 'Kelebihan' }}
              </div>
              <div
                class="font-money font-bold tabular-nums mt-0.5 truncate"
                :class="
                  pItem.netVariance >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                "
              >
                {{ themeStore.formatMoney(Math.abs(pItem.netVariance)) }}
              </div>
            </div>
            <div class="text-right min-w-0">
              <div class="text-slate-400 truncate">Total {{ t('budgets.limit') }}</div>
              <div class="font-money font-bold tabular-nums text-slate-700 dark:text-slate-300 mt-0.5 truncate">
                {{ themeStore.formatMoney(pItem.totalLimit) }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- =================================================================== -->
    <!-- VIEW 2: DETAIL PERIODE ANGGARAN (Tambah & Kelola Kategori Anggaran) -->
    <!-- =================================================================== -->
    <template v-else>
      <div class="flex flex-col gap-3 w-full">
        <div class="space-y-1 w-full min-w-0">
          <button
            type="button"
            class="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
            @click="activeBudgetPeriod = null"
          >
            <ArrowLeft class="w-3.5 h-3.5" />
            <span>Kembali ke Daftar Periode ({{ selectedYear }})</span>
          </button>
          <h1 class="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 truncate">
            Anggaran {{ formatPeriodLabel(activeBudgetPeriod, locale === 'id' ? 'id-ID' : 'en-US') }}
          </h1>
          <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Ketuk kartu kategori anggaran untuk mengubah batasnya, atau tambahkan kategori pengeluaran baru pada periode ini.
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2 w-full">
          <button
            type="button"
            class="w-full sm:w-auto min-h-[46px] px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-1.5 transition-colors shadow-xs"
            @click="openAddBudgetModal"
          >
            <Plus class="w-4 h-4 shrink-0" />
            <span>{{ t('budgets.addBudget') }}</span>
          </button>
        </div>
      </div>

      <!-- Ringkasan Serapan Periode Ini -->
      <div class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <PieChart class="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span class="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
              Total Serapan Anggaran ({{ formatPeriodLabel(activeBudgetPeriod, locale === 'id' ? 'id-ID' : 'en-US') }})
            </span>
          </div>
          <span
            class="text-xs font-money font-bold"
            :class="
              activePeriodSummary.rawPercent > 100
                ? 'text-rose-600 dark:text-rose-400'
                : activePeriodSummary.rawPercent >= 85
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-emerald-600 dark:text-emerald-400'
            "
          >
            {{ activePeriodSummary.rawPercent }}% terpakai
          </span>
        </div>

        <div class="h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
          <div
            class="h-full rounded-full transition-all duration-300"
            :class="
              activePeriodSummary.rawPercent > 100
                ? 'bg-rose-600'
                : activePeriodSummary.rawPercent >= 85
                  ? 'bg-amber-500'
                  : 'bg-emerald-600'
            "
            :style="{ width: `${activePeriodSummary.barWidth}%` }"
          ></div>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 font-money">
          <span>
            Terpakai: <strong class="text-slate-900 dark:text-slate-100">{{ themeStore.formatMoney(activePeriodSummary.totalSpent) }}</strong> dari <strong class="text-slate-900 dark:text-slate-100">{{ themeStore.formatMoney(activePeriodSummary.totalLimit) }}</strong>
          </span>
          <RouterLink
            to="/categories"
            class="group inline-flex items-center gap-1 font-sans text-[11px] sm:text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
          >
            <span>Kelola kategori di sini</span>
            <ArrowRight class="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
          </RouterLink>
        </div>
      </div>

      <!-- Empty State Kategori di Dalam Periode Ini -->
      <div
        v-if="activePeriodBudgets.length === 0"
        class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center space-y-4"
      >
        <div class="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center mx-auto">
          <FolderOpen class="w-6 h-6" />
        </div>
        <div class="space-y-1.5">
          <h3 class="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
            Periode Ini Belum Memiliki Kategori Anggaran
          </h3>
          <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
            Tambahkan kategori pengeluaran dan batas anggarannya untuk periode {{ formatPeriodLabel(activeBudgetPeriod, locale === 'id' ? 'id-ID' : 'en-US') }}.
          </p>
        </div>
        <div class="pt-1 flex flex-wrap items-center justify-center gap-2.5">
          <button
            type="button"
            class="min-h-[46px] px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 transition-colors shadow-xs"
            @click="openAddBudgetModal"
          >
            <Plus class="w-4 h-4 shrink-0" />
            <span>{{ t('budgets.addBudget') }}</span>
          </button>
        </div>
      </div>

      <!-- Daftar Kartu Kategori Anggaran di Dalam Periode -->
      <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4">
        <div
          v-for="b in activePeriodBudgets"
          :key="b.id"
          role="button"
          tabindex="0"
          class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4 hover:border-emerald-500/50 active:scale-[0.99] transition-all cursor-pointer"
          @click="openEditBudgetModal(b)"
          @keydown.enter="openEditBudgetModal(b)"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <h3 class="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 truncate">
                {{ b.category }}
              </h3>
              <div class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {{ formatPeriodLabel(b.period, locale === 'id' ? 'id-ID' : 'en-US') }}
                <span class="mx-1.5" aria-hidden="true">·</span>
                <span
                  class="font-semibold"
                  :class="
                    b.rawPercentage > 100
                      ? 'text-rose-600 dark:text-rose-400'
                      : b.rawPercentage >= 85
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                  "
                >
                  {{ b.rawPercentage }}% terpakai
                </span>
              </div>
            </div>

            <button
              type="button"
              class="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl border border-rose-200/70 dark:border-rose-900/50 bg-rose-50/70 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 shrink-0 transition-colors"
              title="Hapus Anggaran"
              @click.stop="financeStore.removeBudget(b.id)"
            >
              <Trash2 class="w-5 h-5" />
            </button>
          </div>

          <div class="h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              class="h-full rounded-full transition-all duration-300"
              :class="
                b.rawPercentage > 100
                  ? 'bg-rose-600'
                  : b.rawPercentage >= 85
                    ? 'bg-amber-500'
                    : 'bg-emerald-600'
              "
              :style="{ width: `${b.percentage}%` }"
            ></div>
          </div>

          <div class="grid grid-cols-3 gap-2 pt-2.5 border-t border-slate-100 dark:border-slate-800 text-xs">
            <div class="min-w-0">
              <div class="text-slate-400 truncate">{{ t('budgets.spent') }}</div>
              <div class="font-money font-bold tabular-nums text-slate-900 dark:text-slate-100 mt-0.5 truncate">
                {{ themeStore.formatMoney(b.spentAmount) }}
              </div>
            </div>
            <div class="min-w-0">
              <div class="text-slate-400 truncate">
                {{ b.overAmount > 0 ? 'Kelebihan' : t('budgets.remaining') }}
              </div>
              <div
                class="font-money font-bold tabular-nums mt-0.5 truncate"
                :class="
                  b.overAmount > 0
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-emerald-600 dark:text-emerald-400'
                "
              >
                {{ themeStore.formatMoney(b.overAmount > 0 ? b.overAmount : b.remaining) }}
              </div>
            </div>
            <div class="text-right min-w-0">
              <div class="text-slate-400 truncate">{{ t('budgets.limit') }}</div>
              <div class="font-money font-bold tabular-nums text-slate-700 dark:text-slate-300 mt-0.5 truncate">
                {{ themeStore.formatMoney(b.limitAmount) }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- =================================================================== -->
    <!-- MODAL 1: Tambah Periode Bulan Anggaran (Bulan Berjalan s/d Des Thn Depan) -->
    <!-- =================================================================== -->
    <AppModal
      v-model="showAddPeriodModal"
      title="Tambah Periode Anggaran Baru"
    >
      <form id="add-budget-period-form" class="space-y-4" @submit.prevent="handleCreatePeriod">
        <p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          Pilih bulan dan tahun anggaran yang ingin dibuat. Anda dapat menambahkan periode mulai dari bulan berjalan hingga Desember {{ nextYearNum }}.
        </p>

        <div class="space-y-1.5">
          <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300">
            Tahun Anggaran
          </label>
          <CustomSelect
            v-model="newPeriodYear"
            :options="allowedAddYearsOptions"
            placeholder="Pilih Tahun"
          />
        </div>

        <div class="space-y-1.5">
          <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300">
            Bulan Anggaran
          </label>
          <CustomSelect
            v-model="newPeriodMonth"
            :options="allowedAddMonthsOptions"
            placeholder="Pilih Bulan"
          />
        </div>
      </form>

      <template #footer>
        <div class="flex items-center justify-end gap-2 w-full">
          <button
            type="submit"
            form="add-budget-period-form"
            class="w-full sm:w-auto min-h-[46px] px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-colors shadow-xs"
          >
            <Check class="w-4 h-4 shrink-0" />
            <span>Simpan Periode</span>
          </button>
        </div>
      </template>
    </AppModal>

    <!-- =================================================================== -->
    <!-- MODAL 2: Tambah / Ubah Kategori Anggaran di dalam Periode           -->
    <!-- =================================================================== -->
    <AppModal
      v-model="showBudgetForm"
      :title="
        isEditingBudget
          ? `Ubah Anggaran (${formatPeriodLabel(activeBudgetPeriod || '', locale === 'id' ? 'id-ID' : 'en-US')})`
          : `Tambah Kategori Anggaran (${formatPeriodLabel(activeBudgetPeriod || '', locale === 'id' ? 'id-ID' : 'en-US')})`
      "
    >
      <form id="budget-form" class="space-y-3.5" @submit.prevent="handleSaveBudget">
        <CustomSelect
          v-model="category"
          :options="expenseCategoryOptions"
          :disabled="isEditingBudget"
          searchable
          search-placeholder="Ketik untuk mencari kategori..."
          placeholder="Kategori Pengeluaran"
        />

        <input
          :value="limitAmountDisplay"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          required
          :placeholder="`${t('budgets.limit')} Bulanan (Rp)`"
          class="w-full min-h-[54px] sm:min-h-[50px] px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 text-base sm:text-lg font-money font-semibold tabular-nums text-slate-900 dark:text-slate-100 placeholder:font-sans placeholder:font-normal placeholder:text-sm sm:placeholder:text-base placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:outline-none focus:border-emerald-600"
          @input="handleLimitAmountInput"
        />
      </form>

      <template #footer>
        <div class="flex items-center justify-between gap-2 w-full">
          <button
            v-if="isEditingBudget && editingBudgetId"
            type="button"
            class="min-h-[46px] px-4 py-2.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors shrink-0"
            @click="handleDeleteEditingBudget"
          >
            <Trash2 class="w-4 h-4 shrink-0" />
            <span>Hapus</span>
          </button>
          <div v-else></div>

          <button
            type="submit"
            form="budget-form"
            class="flex-1 sm:flex-initial min-h-[46px] px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-colors shadow-xs"
          >
            <Check class="w-4 h-4 shrink-0" />
            <span>Simpan Anggaran</span>
          </button>
        </div>
      </template>
    </AppModal>
  </div>
</template>
