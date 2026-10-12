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
  ShieldAlert,
  Sparkles,
  SlidersHorizontal,
  Divide,
  RotateCcw,
  Coins,
  CheckCircle2,
  AlertTriangle,
  PencilLine,
  FileCheck2,
} from 'lucide-vue-next';
import {
  useFinanceStore,
  formatPeriodLabel,
  getCurrentMonthPeriod,
  MAX_STRICT_ANNUAL_REVISIONS,
  type AnnualBudgetMode,
  type AnnualCategoryBudgetItem,
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

const MONTH_KEYS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];

function getMonthNameShort(mm: string): string {
  const m = Number(mm) || 1;
  const loc = locale.value === 'id' ? 'id-ID' : 'en-US';
  return new Date(2026, m - 1, 1).toLocaleDateString(loc, { month: 'short' });
}

function getMonthNameLong(mm: string): string {
  const m = Number(mm) || 1;
  const loc = locale.value === 'id' ? 'id-ID' : 'en-US';
  return new Date(2026, m - 1, 1).toLocaleDateString(loc, { month: 'long' });
}

// Selected year in the Budgets Page Year Dropdown
const selectedYear = ref<string>(String(currentYearNum));

// Currently opened period ('YYYY-MM' or null when on the Year / Period List view)
const activeBudgetPeriod = ref<string | null>(null);

// Whether the currently selected year has Annual Full-Year Budget active
const isAnnualYearActive = computed(() =>
  financeStore.hasAnnualBudgetForYear(selectedYear.value)
);

const activeAnnualMeta = computed(() =>
  financeStore.getAnnualBudgetMeta(selectedYear.value)
);

const isAnnualDraft = computed(
  () => Boolean(activeAnnualMeta.value && activeAnnualMeta.value.status !== 'final')
);

const isAnnualFinal = computed(
  () => Boolean(activeAnnualMeta.value && activeAnnualMeta.value.status === 'final')
);

const canStartAnnualRevision = computed(() => {
  if (!activeAnnualMeta.value || activeAnnualMeta.value.status !== 'final') return false;
  if (
    activeAnnualMeta.value.mode === 'strict' &&
    activeAnnualMeta.value.revisionCount >= MAX_STRICT_ANNUAL_REVISIONS
  ) {
    return false;
  }
  return true;
});

const annualCategoriesForSelectedYear = computed<AnnualCategoryBudgetItem[]>(() =>
  financeStore.getAnnualCategoryBudgetsByYear(selectedYear.value)
);

const canFinalizeAnnualBudget = computed(() => {
  if (!isAnnualDraft.value) return false;
  if (annualCategoriesForSelectedYear.value.length === 0) return false;
  return annualCategoriesForSelectedYear.value.every((c) => c.unallocatedAmount === 0);
});

const annualSummary = computed(() => {
  const list = annualCategoriesForSelectedYear.value;
  const totalAnnualLimit = list.reduce((s, item) => s + Number(item.annualLimitAmount || 0), 0);
  const totalAllocated = list.reduce((s, item) => s + Number(item.allocatedTotal || 0), 0);
  const totalSpent = list.reduce((s, item) => s + Number(item.spentTotal || 0), 0);
  const rawPercent =
    totalAnnualLimit > 0 ? Math.round((totalSpent / totalAnnualLimit) * 100) : 0;
  const barWidth = Math.min(100, Math.max(0, rawPercent));
  const netVariance = totalAnnualLimit - totalSpent;
  const unmappedCategoriesCount = list.filter((i) => i.unallocatedAmount !== 0).length;

  return {
    categoriesCount: list.length,
    totalAnnualLimit,
    totalAllocated,
    totalSpent,
    rawPercent,
    barWidth,
    netVariance,
    unmappedCategoriesCount,
  };
});

// Ensure transactions for the full year are loaded when viewing an active annual budget year
watch(
  [selectedYear, isAnnualYearActive],
  ([yr, isAnnual]) => {
    if (isAnnual && /^\d{4}$/.test(yr)) {
      void financeStore.ensureTransactionsForDateRange(`${yr}-01-01`, `${yr}-12-31`);
    }
  },
  { immediate: true }
);

// All registered monthly periods (combining explicit budgetPeriods + periods that already have budget items)
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
  for (const yKey of Object.keys(financeStore.annualBudgetMetaMap)) {
    const y = Number(yKey);
    if (y >= 2000 && y <= 2100) {
      yearSet.add(y);
    }
  }
  const sortedYears = Array.from(yearSet).sort((a, b) => a - b);
  return sortedYears.map((y) => {
    const yStr = String(y);
    const hasAnnual = financeStore.hasAnnualBudgetForYear(yStr);
    let badge = '';
    if (hasAnnual) {
      const meta = financeStore.getAnnualBudgetMeta(yStr);
      const statusLabel = meta?.status === 'final' ? 'Final' : 'Draft';
      badge =
        meta?.mode === 'strict'
          ? `Setahun · Ketat (${statusLabel})`
          : `Setahun · Fleksibel (${statusLabel})`;
    } else if (y === currentYearNum) {
      badge = 'Tahun Berjalan';
    } else if (y === nextYearNum) {
      badge = 'Tahun Depan';
    } else {
      badge = 'Arsip';
    }

    return {
      value: yStr,
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

// Enriched budgets inside the currently opened monthly period
const activePeriodBudgets = computed(() => {
  if (!activeBudgetPeriod.value) return [];
  return financeStore.getEnrichedBudgetsByPeriod(activeBudgetPeriod.value);
});

watch(activeBudgetPeriod, (period) => {
  if (period && /^\d{4}-\d{2}$/.test(period)) {
    void financeStore.ensureTransactionsForDateRange(`${period}-01`, `${period}-31`);
  }
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
// Modal 1: Tambah Periode Anggaran Bulanan (Dicegah jika Tahun sudah Setahun Penuh)
// =========================================================================
const showAddPeriodModal = ref(false);
const newPeriodYear = ref<string>(String(currentYearNum));
const newPeriodMonth = ref<string>(String(currentMonthNum).padStart(2, '0'));

const allowedAddYearsOptions = computed<SelectOptionItem[]>(() =>
  [currentYearNum, nextYearNum].map((yr) => {
    const yStr = String(yr);
    const hasAnnual = financeStore.hasAnnualBudgetForYear(yStr);
    return {
      value: yStr,
      label: `${yr} (${yr === currentYearNum ? 'Tahun Berjalan' : 'Tahun Depan'})${hasAnnual ? ' — Sudah Anggaran Setahun' : ''}`,
      badge: hasAnnual
        ? 'Terkunci'
        : yr === currentYearNum
          ? 'Aktif'
          : authStore.isProUser
            ? 'Maks. Des'
            : 'PRO',
    };
  })
);

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
  if (isAnnualYearActive.value) {
    notificationStore.notifyError(
      'Anggaran Setahun Penuh Sudah Aktif',
      `Tahun ${selectedYear.value} sudah menggunakan Anggaran Setahun Penuh sekaligus. Anda tidak dapat menambahkan periode bulanan lagi pada tahun ini. Silakan kelola alokasi bulanan melalui fitur Mapping Bulanan.`
    );
    return;
  }

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

  const yNum = Number(selectedYear.value);
  if (yNum === currentYearNum || yNum === nextYearNum) {
    newPeriodYear.value = String(yNum);
  } else {
    newPeriodYear.value = String(currentYearNum);
  }

  const months = allowedAddMonthsOptions.value;
  const firstAvailable = months.find((m) => !m.label.includes('(Sudah Ada)')) || months[0];
  if (firstAvailable) {
    newPeriodMonth.value = firstAvailable.value;
  }
  showAddPeriodModal.value = true;
}

async function handleCreatePeriod() {
  if (financeStore.hasAnnualBudgetForYear(newPeriodYear.value)) {
    showAddPeriodModal.value = false;
    notificationStore.notifyError(
      'Anggaran Setahun Penuh Sudah Aktif',
      `Tahun ${newPeriodYear.value} sudah diatur menggunakan Anggaran Setahun Penuh. Penambahan anggaran dengan periode bulanan tidak diizinkan lagi pada tahun tersebut.`
    );
    return;
  }

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
  financeStore.selectedPeriod = period;
}

async function handleTryDeletePeriod(periodInfo: {
  period: string;
  label: string;
  itemsCount: number;
}) {
  if (isAnnualYearActive.value) {
    notificationStore.notifyError(
      'Dikelola Melalui Mapping Anggaran Tahunan',
      `Tahun ${selectedYear.value} menggunakan Anggaran Setahun Penuh. Untuk mengosongkan bulan ini, ubah alokasi bulan ${periodInfo.label} menjadi Rp 0 di dalam Mapping Bulanan.`
    );
    return;
  }
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
// Modal 2: Tambah / Ubah Kategori Anggaran Bulanan (Hanya untuk Tahun Non-Tahunan)
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
  const yr = activeBudgetPeriod.value.slice(0, 4);
  if (financeStore.hasAnnualBudgetForYear(yr)) {
    openAnnualMappingModal();
    return;
  }
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
  if (activeBudgetPeriod.value) {
    const yr = activeBudgetPeriod.value.slice(0, 4);
    if (financeStore.hasAnnualBudgetForYear(yr)) {
      const matchAnnual = annualCategoriesForSelectedYear.value.find(
        (item) => item.category.trim().toLowerCase() === b.category.trim().toLowerCase()
      );
      if (matchAnnual) {
        openAnnualMappingModal(matchAnnual);
        return;
      }
    }
  }
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

// =========================================================================
// Modal 3: Aktivasi & Pengaturan Mode Anggaran Setahun Penuh (Khusus PRO)
// =========================================================================
const showAnnualSetupModal = ref(false);
const annualSetupYear = ref<string>(String(currentYearNum));
const annualSetupMode = ref<AnnualBudgetMode>('strict');
const isSavingAnnualSetup = ref(false);

const annualSetupYearOptions = computed<SelectOptionItem[]>(() => {
  const yearSet = new Set<number>([currentYearNum, nextYearNum]);
  const selNum = Number(selectedYear.value);
  if (selNum >= 2000 && selNum <= 2100) yearSet.add(selNum);
  return Array.from(yearSet)
    .sort((a, b) => a - b)
    .map((y) => {
      const yStr = String(y);
      const existing = financeStore.getAnnualBudgetMeta(yStr);
      return {
        value: yStr,
        label: `Tahun ${y}`,
        badge: existing
          ? existing.mode === 'strict'
            ? 'Aktif · Ketat'
            : 'Aktif · Fleksibel'
          : y === currentYearNum
            ? 'Tahun Berjalan'
            : 'Tahun Depan',
      };
    });
});

function openAnnualSetupModal(targetYr?: string) {
  if (!authStore.isProUser) {
    notificationStore.openProModal({
      featureTitle: 'Anggaran Setahun Penuh & Mapping Bulanan',
      featureDescription:
        'Fitur pembuatan anggaran satu tahun penuh sekaligus beserta mapping alokasi bulanan per kategori dan pilihan Mode Ketat / Fleksibel khusus untuk pelanggan SisaUang Pro.',
      limitSummary: 'Fitur Eksklusif SisaUang Pro',
    });
    return;
  }

  const yr = targetYr || selectedYear.value || String(currentYearNum);
  annualSetupYear.value = yr;
  const existing = financeStore.getAnnualBudgetMeta(yr);
  annualSetupMode.value = existing ? existing.mode : 'strict';
  showAnnualSetupModal.value = true;
}

watch(annualSetupYear, (yr) => {
  const existing = financeStore.getAnnualBudgetMeta(yr);
  if (existing) {
    annualSetupMode.value = existing.mode;
  }
});

async function handleSaveAnnualSetup() {
  isSavingAnnualSetup.value = true;
  try {
    const ok = await financeStore.setupAnnualBudgetForYear(
      annualSetupYear.value,
      annualSetupMode.value
    );
    if (ok) {
      selectedYear.value = annualSetupYear.value;
      showAnnualSetupModal.value = false;
    }
  } finally {
    isSavingAnnualSetup.value = false;
  }
}

// =========================================================================
// Modal 4: Mapping Bulanan per Kategori Anggaran Setahun Penuh (Khusus PRO)
// =========================================================================
const showAnnualMappingModal = ref(false);
const isEditingAnnualCategory = ref(false);
const mappingCategory = ref<string>('');
const mappingAnnualLimit = ref<number | ''>('');
const mappingMonths = ref<Record<string, number | ''>>({
  '01': '',
  '02': '',
  '03': '',
  '04': '',
  '05': '',
  '06': '',
  '07': '',
  '08': '',
  '09': '',
  '10': '',
  '11': '',
  '12': '',
});
const isSavingAnnualMapping = ref(false);

const mappingAnnualLimitDisplay = computed(() =>
  formatNominalDisplay(mappingAnnualLimit.value)
);

function handleMappingAnnualLimitInput(event: Event) {
  const input = event.target as HTMLInputElement;
  const rawValue = input.value;
  const cleanDigits = rawValue.replace(/\D/g, '').replace(/^0+/, '');
  mappingAnnualLimit.value = cleanDigits ? Number(cleanDigits) : '';
  input.value = formatNominalDisplay(cleanDigits);
}

function getMonthInputDisplay(mm: string): string {
  return formatNominalDisplay(mappingMonths.value[mm] ?? '');
}

function handleMonthAllocationInput(mm: string, event: Event) {
  const input = event.target as HTMLInputElement;
  const rawValue = input.value;
  const cleanDigits = rawValue.replace(/\D/g, '').replace(/^0+/, '');
  mappingMonths.value[mm] = cleanDigits ? Number(cleanDigits) : '';
  input.value = formatNominalDisplay(cleanDigits);
}

const mappingTotalAllocated = computed<number>(() => {
  let sum = 0;
  for (const mm of MONTH_KEYS) {
    sum += Math.max(0, Math.round(Number(mappingMonths.value[mm]) || 0));
  }
  return sum;
});

const mappingTargetAnnualNum = computed<number>(() =>
  Math.max(0, Math.round(Number(mappingAnnualLimit.value) || 0))
);

// Selisih Penganggaran: positif jika belum teralokasi penuh, negatif jika kelebihan alokasi, 0 jika pas
const mappingDifference = computed<number>(
  () => mappingTargetAnnualNum.value - mappingTotalAllocated.value
);

const mappingActiveMonthsCount = computed<number>(
  () => MONTH_KEYS.filter((mm) => Number(mappingMonths.value[mm] || 0) > 0).length
);

const canSubmitAnnualMapping = computed<boolean>(() => {
  if (!mappingCategory.value.trim()) return false;
  if (mappingTargetAnnualNum.value <= 0) return false;
  if (mappingDifference.value !== 0) return false;
  if (
    activeAnnualMeta.value?.mode === 'strict' &&
    isEditingAnnualCategory.value &&
    activeAnnualMeta.value.revisionCount >= MAX_STRICT_ANNUAL_REVISIONS
  ) {
    return false;
  }
  return true;
});

function distributeEvenly12Months() {
  let target = mappingTargetAnnualNum.value;
  if (target <= 0 && mappingTotalAllocated.value > 0) {
    target = mappingTotalAllocated.value;
    mappingAnnualLimit.value = target;
  }
  if (target <= 0) {
    notificationStore.notifyError(
      'Isi Total Anggaran Setahun Terlebih Dahulu',
      'Masukkan nominal Total Anggaran Setahun sebelum membagi rata ke 12 bulan.'
    );
    return;
  }
  const basePerMonth = Math.floor(target / 12);
  const remainder = target - basePerMonth * 12;
  for (let i = 0; i < MONTH_KEYS.length; i++) {
    const mm = MONTH_KEYS[i];
    mappingMonths.value[mm] = i === 11 ? basePerMonth + remainder : basePerMonth;
  }
}

function syncAnnualTotalFromMonthlySum() {
  const sum = mappingTotalAllocated.value;
  if (sum <= 0) {
    notificationStore.notifyError(
      'Alokasi Bulanan Masih Kosong',
      'Isi nominal pada bulan-bulan yang diinginkan terlebih dahulu.'
    );
    return;
  }
  mappingAnnualLimit.value = sum;
}

function clearAllMonthlyMapping() {
  for (const mm of MONTH_KEYS) {
    mappingMonths.value[mm] = '';
  }
}

function allocateRemainingToMonth(mm: string) {
  if (mappingDifference.value === 0) return;
  const currentVal = Math.max(0, Math.round(Number(mappingMonths.value[mm]) || 0));
  const nextVal = Math.max(0, currentVal + mappingDifference.value);
  mappingMonths.value[mm] = nextVal > 0 ? nextVal : '';
}

function openAnnualMappingModal(existingItem?: AnnualCategoryBudgetItem) {
  if (!authStore.isProUser) {
    notificationStore.openProModal({
      featureTitle: 'Mapping Bulanan Anggaran Tahunan',
      featureDescription:
        'Fitur pemetaan (mapping) alokasi bulanan per kategori anggaran tahunan khusus untuk pelanggan SisaUang Pro.',
      limitSummary: 'Fitur Eksklusif SisaUang Pro',
    });
    return;
  }

  if (activeAnnualMeta.value?.status === 'final' && !existingItem) {
    notificationStore.notifyError(
      'Anggaran Sudah Berstatus Final',
      `Anggaran Tahun ${selectedYear.value} sudah berstatus Final. Klik tombol "Perubahan Anggaran" terlebih dahulu untuk mengaktifkan mode edit (Draft).`
    );
    return;
  }

  if (existingItem) {
    isEditingAnnualCategory.value = true;
    mappingCategory.value = existingItem.category;
    mappingAnnualLimit.value = existingItem.annualLimitAmount;
    for (const mm of MONTH_KEYS) {
      const val = Number(existingItem.monthlyAllocations[mm] || 0);
      mappingMonths.value[mm] = val > 0 ? val : '';
    }
  } else {
    isEditingAnnualCategory.value = false;
    mappingCategory.value = '';
    mappingAnnualLimit.value = '';
    for (const mm of MONTH_KEYS) {
      mappingMonths.value[mm] = '';
    }
  }
  showAnnualMappingModal.value = true;
}

async function handleStartAnnualRevision() {
  await financeStore.startAnnualBudgetRevision(selectedYear.value);
}

async function handleFinalizeAnnualBudget() {
  await financeStore.finalizeAnnualBudgetForYear(selectedYear.value);
}

async function handleSaveAnnualMapping() {
  if (!canSubmitAnnualMapping.value) return;
  isSavingAnnualMapping.value = true;
  try {
    const numericMap: Record<string, number> = {};
    for (const mm of MONTH_KEYS) {
      numericMap[mm] = Math.max(0, Math.round(Number(mappingMonths.value[mm]) || 0));
    }
    const ok = await financeStore.saveAnnualCategoryBudgetWithMapping({
      year: selectedYear.value,
      category: mappingCategory.value,
      annualLimitAmount: mappingTargetAnnualNum.value,
      monthlyAllocations: numericMap,
      isEditingExisting: isEditingAnnualCategory.value,
    });
    if (ok) {
      showAnnualMappingModal.value = false;
    }
  } finally {
    isSavingAnnualMapping.value = false;
  }
}

async function handleDeleteAnnualCategoryFromModal() {
  if (!isEditingAnnualCategory.value || !mappingCategory.value) return;
  const cat = mappingCategory.value;
  showAnnualMappingModal.value = false;
  await financeStore.removeAnnualCategoryBudget(selectedYear.value, cat);
}
</script>

<template>
  <div class="w-full max-w-full space-y-5 sm:space-y-6 overflow-x-hidden">
    <!-- =================================================================== -->
    <!-- VIEW 1: DAFTAR ANGGARAN TAHUNAN & PERIODE BULANAN                   -->
    <!-- =================================================================== -->
    <template v-if="!activeBudgetPeriod">
      <!-- Header & Year Dropdown + Action Buttons -->
      <div class="flex flex-col gap-3.5 w-full">
        <div
          class="flex flex-col gap-3 w-full"
          :class="isAnnualYearActive ? 'lg:flex-row lg:items-center lg:justify-between' : ''"
        >
          <div class="w-full min-w-0">
            <h1 class="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              {{ t('budgets.title') }}
            </h1>
            <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              <template v-if="isAnnualYearActive && isAnnualDraft">
                Anggaran Setahun Penuh ({{ selectedYear }}) berstatus <strong>DRAFT{{ activeAnnualMeta?.isRevisionSession ? ' (Proses Perubahan)' : '' }}</strong>. Selesaikan mapping bulanan lalu klik <strong>Finalisasi Anggaran</strong> agar anggaran resmi digunakan.
              </template>
              <template v-else-if="isAnnualYearActive">
                Anggaran Setahun Penuh ({{ selectedYear }}) berstatus <strong>FINAL</strong> dan resmi digunakan. Klik <strong>Perubahan Anggaran</strong> jika ingin merevisi alokasi.
              </template>
              <template v-else>
                Buat anggaran per bulan atau gunakan fitur <strong>Anggaran Setahun Penuh (PRO)</strong> dengan mapping bulanan otomatis.
              </template>
            </p>
          </div>

          <!-- Jika Tahun sudah menggunakan Anggaran Setahun Penuh: Posisikan opsi tahun di sebelah judul & deskripsi pada Desktop / Tablet Landscape, dan di bawah judul pada Tablet Portrait / Mobile -->
          <div v-if="isAnnualYearActive" class="w-full lg:w-48 lg:shrink-0 min-w-0">
            <CustomSelect
              v-model="selectedYear"
              :options="yearDropdownOptions"
              placeholder=""
              aria-label="Pilih Tahun Anggaran"
            >
              <template #icon>
                <Calendar class="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              </template>
            </CustomSelect>
          </div>
        </div>

        <!-- Baris Tombol Aksi Atas: Hanya tampil jika Tahun BELUM menggunakan Anggaran Setahun Penuh -->
        <div
          v-if="!isAnnualYearActive"
          class="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:items-center gap-2.5 w-full"
        >
          <!-- Dropdown Pilihan Tahun -->
          <div class="w-full sm:col-span-2 lg:w-44 lg:shrink-0 min-w-0">
            <CustomSelect
              v-model="selectedYear"
              :options="yearDropdownOptions"
              placeholder=""
              aria-label="Pilih Tahun Anggaran"
            >
              <template #icon>
                <Calendar class="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              </template>
            </CustomSelect>
          </div>

          <!-- Tombol Buat Anggaran Setahun Penuh (Khusus PRO) -->
          <button
            type="button"
            class="w-full lg:flex-1 min-w-0 h-[46px] min-h-[46px] px-4 py-2 rounded-xl border border-emerald-600/80 bg-emerald-50/80 dark:bg-emerald-950/40 hover:bg-emerald-100/80 dark:hover:bg-emerald-900/50 text-emerald-800 dark:text-emerald-200 text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors overflow-hidden cursor-pointer"
            @click="openAnnualSetupModal(selectedYear)"
          >
            <Sparkles class="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span class="truncate">Buat Anggaran Setahun</span>
            <span
              v-if="!authStore.isProUser"
              class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-400 text-slate-950 text-[10px] font-extrabold uppercase tracking-wider shrink-0"
            >
              <Crown class="w-3 h-3 shrink-0" />
              <span>PRO</span>
            </span>
          </button>

          <!-- Tombol Tambah Periode Bulan -->
          <button
            type="button"
            class="w-full lg:flex-1 min-w-0 h-[46px] min-h-[46px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors shadow-xs overflow-hidden cursor-pointer"
            @click="openAddPeriodModal"
          >
            <Plus class="w-4 h-4 shrink-0" />
            <span class="truncate">Tambah Periode Bulan</span>
            <span
              v-if="!authStore.isProUser && allRegisteredPeriods.includes(getCurrentMonthPeriod())"
              class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-400 text-slate-950 text-[10px] font-extrabold uppercase tracking-wider shrink-0"
            >
              <Crown class="w-3 h-3 shrink-0" />
              <span>PRO</span>
            </span>
          </button>
        </div>
      </div>

      <!-- ================================================================= -->
      <!-- PANEL ANGGARAN SETAHUN PENUH & MAPPING BULANAN (Jika Tahun Aktif) -->
      <!-- ================================================================= -->
      <section
        v-if="isAnnualYearActive && activeAnnualMeta"
        class="rounded-3xl border bg-white dark:bg-slate-900 p-4 sm:p-6 space-y-5 shadow-xs"
        :class="
          isAnnualDraft
            ? 'border-amber-500/50 dark:border-amber-500/40'
            : 'border-emerald-500/40 dark:border-emerald-500/30'
        "
      >
        <!-- Top Status Bar: Status Draft/Final + Mode Ketat / Fleksibel + Kuota Perubahan -->
        <div class="flex flex-col gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div class="space-y-2 min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-400 text-slate-950 text-[10px] font-extrabold uppercase tracking-wider">
                <Crown class="w-3 h-3 shrink-0" />
                <span>ANGGARAN SETAHUN PENUH {{ selectedYear }}</span>
              </span>

              <!-- Status Draft vs Final Badge -->
              <span
                class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-extrabold uppercase tracking-wider"
                :class="
                  isAnnualDraft
                    ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                    : 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                "
              >
                <AlertTriangle v-if="isAnnualDraft" class="w-3.5 h-3.5 shrink-0" />
                <FileCheck2 v-else class="w-3.5 h-3.5 shrink-0" />
                <span>
                  {{
                    isAnnualDraft
                      ? activeAnnualMeta.isRevisionSession
                        ? 'STATUS: DRAFT (PROSES PERUBAHAN)'
                        : 'STATUS: DRAFT (BELUM DIFINALISASI)'
                      : 'STATUS: FINAL (RESMI DIGUNAKAN)'
                  }}
                </span>
              </span>

              <!-- Mode Badge -->
              <span
                class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold"
                :class="
                  activeAnnualMeta.mode === 'strict'
                    ? 'bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border border-rose-200/70 dark:border-rose-900/50'
                    : 'bg-sky-100 dark:bg-sky-950/70 text-sky-700 dark:text-sky-300 border border-sky-200/70 dark:border-sky-900/50'
                "
              >
                <ShieldAlert v-if="activeAnnualMeta.mode === 'strict'" class="w-3.5 h-3.5 shrink-0" />
                <CheckCircle2 v-else class="w-3.5 h-3.5 shrink-0" />
                <span>
                  {{
                    activeAnnualMeta.mode === 'strict'
                      ? `Mode Ketat (Perubahan: ${activeAnnualMeta.revisionCount}/${MAX_STRICT_ANNUAL_REVISIONS}x)`
                      : `Mode Fleksibel (Perubahan: ${activeAnnualMeta.revisionCount}x · Tanpa Batas)`
                  }}
                </span>
              </span>

              <!-- Lock Monthly Addition Badge -->
              <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-semibold">
                <Lock class="w-3 h-3 shrink-0" />
                <span>Input Periode Bulanan Terpisah Dinonaktifkan</span>
              </span>
            </div>

            <p class="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              <template v-if="isAnnualDraft">
                <strong class="text-amber-700 dark:text-amber-400">
                  {{ activeAnnualMeta.isRevisionSession ? 'Mode Perubahan Anggaran (Draft):' : 'Mode Penyusunan Awal (Draft):' }}
                </strong>
                Selama anggaran berstatus <strong>Draft</strong>, Anda dapat menambahkan atau mengubah mapping bulanan kategori anggaran. Namun, <strong>pencatatan transaksi untuk kategori yang ada di dalam anggaran dikunci sementara</strong> hingga Anda mengklik tombol <strong>Finalisasi Anggaran</strong>.
                <template v-if="activeAnnualMeta.isRevisionSession">
                  Setelah difinalisasi, proses perubahan ini akan dihitung <strong>1x perubahan</strong>{{ activeAnnualMeta.mode === 'strict' ? ` (menjadi ${activeAnnualMeta.revisionCount + 1}/${MAX_STRICT_ANNUAL_REVISIONS}x pada Mode Ketat)` : '' }}.
                </template>
              </template>
              <template v-else-if="activeAnnualMeta.mode === 'strict'">
                <strong>Anggaran Final (Mode Ketat):</strong> Anggaran ini telah resmi difinalisasi dan siap digunakan. Untuk mengedit alokasi, klik <strong>Perubahan Anggaran</strong> (maksimal {{ MAX_STRICT_ANNUAL_REVISIONS }}x perubahan, tersisa <strong>{{ Math.max(0, MAX_STRICT_ANNUAL_REVISIONS - activeAnnualMeta.revisionCount) }}x</strong>). Transaksi yang belum memasuki bulan alokasi pertamanya tidak dapat disimpan.
              </template>
              <template v-else>
                <strong>Anggaran Final (Mode Fleksibel):</strong> Anggaran ini telah resmi difinalisasi dan siap digunakan. Untuk mengedit alokasi kapan saja tanpa batas revisi, klik tombol <strong>Perubahan Anggaran</strong> terlebih dahulu lalu finalisasi kembali.
              </template>
            </p>
          </div>

          <div
            class="grid grid-cols-1 gap-2.5 w-full pt-1"
            :class="isAnnualDraft ? 'sm:grid-cols-3' : 'sm:grid-cols-2'"
          >
            <button
              type="button"
              class="w-full min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:border-emerald-500 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              @click="openAnnualSetupModal(selectedYear)"
            >
              <SlidersHorizontal class="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Ubah Mode</span>
            </button>

            <template v-if="isAnnualDraft">
              <button
                type="button"
                class="w-full min-h-[44px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                @click="openAnnualMappingModal()"
              >
                <Plus class="w-4 h-4 shrink-0" />
                <span>Tambah Kategori</span>
              </button>

              <button
                type="button"
                :disabled="!canFinalizeAnnualBudget"
                class="w-full min-h-[44px] px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-1.5 transition-colors shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                @click="handleFinalizeAnnualBudget"
              >
                <FileCheck2 class="w-4 h-4 shrink-0" />
                <span>
                  {{
                    activeAnnualMeta.isRevisionSession
                      ? 'Finalisasi Perubahan'
                      : 'Finalisasi Anggaran'
                  }}
                </span>
              </button>
            </template>

            <template v-else>
              <button
                type="button"
                :disabled="!canStartAnnualRevision"
                class="w-full min-h-[44px] px-4 py-2 rounded-xl text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                :class="
                  canStartAnnualRevision
                    ? 'bg-amber-500 hover:bg-amber-600 text-slate-950 shadow-xs'
                    : 'border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 text-slate-400'
                "
                @click="handleStartAnnualRevision"
              >
                <PencilLine v-if="canStartAnnualRevision" class="w-4 h-4 shrink-0" />
                <Lock v-else class="w-4 h-4 shrink-0" />
                <span>
                  {{
                    canStartAnnualRevision
                      ? 'Perubahan Anggaran'
                      : 'Kuota Perubahan Habis'
                  }}
                </span>
              </button>
            </template>
          </div>
        </div>

        <!-- Annual Totals Summary Metrics -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50 p-3.5 space-y-1">
            <div class="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Total Anggaran Setahun ({{ selectedYear }})
            </div>
            <div class="text-lg sm:text-xl font-money font-bold text-slate-900 dark:text-slate-100 tabular-nums">
              {{ themeStore.formatMoney(annualSummary.totalAnnualLimit) }}
            </div>
            <div class="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
              {{ annualSummary.categoriesCount }} Kategori Terpetakan (Selisih Rp 0)
            </div>
          </div>

          <div class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50 p-3.5 space-y-1">
            <div class="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Total Realisasi Serapan ({{ selectedYear }})
            </div>
            <div class="text-lg sm:text-xl font-money font-bold text-rose-600 dark:text-rose-400 tabular-nums">
              {{ themeStore.formatMoney(annualSummary.totalSpent) }}
            </div>
            <div class="text-[11px] text-slate-500 dark:text-slate-400">
              {{ annualSummary.rawPercent }}% dari anggaran setahun
            </div>
          </div>

          <div class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50 p-3.5 space-y-1">
            <div class="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {{ annualSummary.netVariance >= 0 ? 'Sisa Pagu Anggaran Tahunan' : 'Kelebihan Realisasi Tahunan' }}
            </div>
            <div
              class="text-lg sm:text-xl font-money font-bold tabular-nums"
              :class="
                annualSummary.netVariance >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400'
              "
            >
              {{ themeStore.formatMoney(Math.abs(annualSummary.netVariance)) }}
            </div>
            <div class="text-[11px] text-slate-500 dark:text-slate-400">
              Terdistribusi pada {{ periodsForSelectedYear.length }} bulan aktif
            </div>
          </div>
        </div>

        <!-- Empty State if no annual categories added yet -->
        <div
          v-if="annualCategoriesForSelectedYear.length === 0"
          class="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-950/30 p-7 text-center space-y-3"
        >
          <div class="w-11 h-11 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
            <Coins class="w-5 h-5" />
          </div>
          <div class="space-y-1">
            <h3 class="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
              Belum Ada Kategori pada Anggaran Setahun Penuh {{ selectedYear }}
            </h3>
            <p class="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
              Tambahkan kategori pengeluaran beserta total anggaran setahun, lalu petakan (mapping) ke bulan-bulan yang direncanakan (tidak harus setiap bulan, misal hanya Mei, Juli, dan Agustus) hingga tidak ada selisih penganggaran.
            </p>
          </div>
          <button
            type="button"
            class="min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
            @click="openAnnualMappingModal()"
          >
            <Plus class="w-4 h-4 shrink-0" />
            <span>Tambah Kategori &amp; Mapping Bulanan Pertama</span>
          </button>
        </div>

        <!-- Daftar Kategori Anggaran Tahunan beserta Mapping Bulanannya -->
        <div v-else class="space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h3 class="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
              Daftar Mapping Bulanan per Kategori ({{ annualCategoriesForSelectedYear.length }} Kategori)
            </h3>
            <span class="text-[11px] text-slate-500 dark:text-slate-400">
              {{
                isAnnualDraft
                  ? 'Ketuk kartu kategori untuk melihat atau mengubah rincian mapping bulanan'
                  : 'Ketuk kartu kategori untuk melihat rincian mapping bulanan'
              }}
            </span>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div
              v-for="catItem in annualCategoriesForSelectedYear"
              :key="catItem.id"
              role="button"
              tabindex="0"
              class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-950/40 p-4 space-y-2.5 transition-all hover:border-emerald-500/60 active:scale-[0.995] cursor-pointer"
              @click="openAnnualMappingModal(catItem)"
              @keydown.enter="openAnnualMappingModal(catItem)"
            >
              <div class="flex items-start justify-between gap-2.5">
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-1.5">
                    <h4 class="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                      {{ catItem.category }}
                    </h4>
                    <span
                      v-if="catItem.unallocatedAmount === 0"
                      class="px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold"
                    >
                      Selisih Rp 0 ({{ catItem.allocatedMonthsList.length }} bln)
                    </span>
                    <span
                      v-else
                      class="px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 text-[10px] font-bold"
                    >
                      Selisih {{ themeStore.formatMoney(Math.abs(catItem.unallocatedAmount)) }}
                    </span>
                  </div>

                  <div class="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-money">
                    Total Setahun:
                    <strong class="text-slate-900 dark:text-slate-100">
                      {{ themeStore.formatMoney(catItem.annualLimitAmount) }}
                    </strong>
                    <span class="mx-1">·</span>
                    <span>
                      Terpakai:
                      <strong class="text-rose-600 dark:text-rose-400">
                        {{ themeStore.formatMoney(catItem.spentTotal) }}
                      </strong>
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  class="w-9 h-9 flex items-center justify-center rounded-xl border shrink-0 transition-colors cursor-pointer"
                  :class="
                    isAnnualDraft
                      ? 'border-rose-200/70 dark:border-rose-900/50 bg-rose-50/70 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-800/40 text-slate-400 dark:text-slate-500'
                  "
                  :title="
                    isAnnualDraft
                      ? 'Hapus Kategori Anggaran Tahunan'
                      : 'Anggaran sudah Final — Klik Perubahan Anggaran untuk menghapus/mengubah kategori'
                  "
                  @click.stop="financeStore.removeAnnualCategoryBudget(selectedYear, catItem.category)"
                >
                  <Trash2 v-if="isAnnualDraft" class="w-4 h-4" />
                  <Lock v-else class="w-4 h-4" />
                </button>
              </div>

              <div
                v-if="catItem.firstAllocatedPeriod"
                class="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between gap-2 pt-2 border-t border-slate-200/50 dark:border-slate-800/70"
              >
                <span>
                  Mulai periode alokasi:
                  <strong class="text-slate-800 dark:text-slate-200">
                    {{ formatPeriodLabel(catItem.firstAllocatedPeriod, locale === 'id' ? 'id-ID' : 'en-US') }}
                  </strong>
                </span>
                <span class="font-semibold text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1">
                  {{ isAnnualDraft ? 'Ubah Mapping →' : 'Lihat Rincian →' }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Empty State jika Tahun yang dipilih belum memiliki periode anggaran -->
      <div
        v-if="periodsForSelectedYear.length === 0 && !isAnnualYearActive"
        class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center space-y-3"
      >
        <div class="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200/60 dark:border-emerald-900/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
          <Calendar class="w-6 h-6" />
        </div>
        <div class="space-y-1.5">
          <h3 class="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
            Belum Ada Periode Anggaran di Tahun {{ selectedYear }}
          </h3>
          <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
            Anda dapat membuat <strong>Anggaran Setahun Penuh sekaligus (PRO)</strong> dengan mapping bulanan otomatis, atau menambahkan periode per bulan.
          </p>
        </div>
      </div>

      <!-- Grid Daftar Periode (Bulan) sesuai Tahun yang dipilih -->
      <div v-if="periodsForSelectedYear.length > 0" class="space-y-3">
        <div v-if="isAnnualYearActive" class="flex items-center justify-between gap-2">
          <h2 class="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
            Rincian Periode Bulan Hasil Mapping ({{ selectedYear }})
          </h2>
          <span class="text-xs text-slate-500 dark:text-slate-400">
            Ketuk bulan untuk melihat serapan per bulan
          </span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4">
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
                  <span
                    v-if="isAnnualYearActive"
                    class="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                  >
                    Mapping Tahunan
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

              <!-- Tombol Hapus Periode (Terkunci jika sudah terisi anggaran atau mode tahunan) -->
              <button
                type="button"
                class="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl border shrink-0 transition-colors"
                :class="
                  pItem.itemsCount > 0 || isAnnualYearActive
                    ? 'border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-800/40 text-slate-400 dark:text-slate-500 hover:border-amber-400/60 hover:text-amber-600 dark:hover:text-amber-400'
                    : 'border-rose-200/70 dark:border-rose-900/50 bg-rose-50/70 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400'
                "
                :title="
                  isAnnualYearActive
                    ? 'Dikelola melalui Mapping Bulanan Anggaran Setahun Penuh'
                    : pItem.itemsCount > 0
                      ? 'Kosongkan anggaran di dalam periode ini terlebih dahulu sebelum menghapus periode'
                      : 'Hapus Periode Anggaran'
                "
                @click.stop="handleTryDeletePeriod(pItem)"
              >
                <Lock v-if="pItem.itemsCount > 0 || isAnnualYearActive" class="w-4 h-4" />
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
            class="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
            @click="activeBudgetPeriod = null"
          >
            <ArrowLeft class="w-3.5 h-3.5" />
            <span>Kembali ke Daftar Anggaran ({{ selectedYear }})</span>
          </button>
          <h1 class="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 truncate">
            Anggaran {{ formatPeriodLabel(activeBudgetPeriod, locale === 'id' ? 'id-ID' : 'en-US') }}
          </h1>
          <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            <template v-if="isAnnualYearActive">
              Periode ini dikelola melalui <strong>Mapping Bulanan Anggaran Setahun Penuh ({{ selectedYear }})</strong>. Ketuk kartu kategori untuk membuka Mapping Bulanan.
            </template>
            <template v-else>
              Ketuk kartu kategori anggaran untuk mengubah batasnya, atau tambahkan kategori pengeluaran baru pada periode ini.
            </template>
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2 w-full">
          <button
            type="button"
            class="w-full sm:w-auto min-h-[46px] px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-1.5 transition-colors shadow-xs cursor-pointer"
            @click="openAddBudgetModal"
          >
            <Plus class="w-4 h-4 shrink-0" />
            <span>
              {{ isAnnualYearActive ? 'Kelola Mapping Kategori Tahunan' : t('budgets.addBudget') }}
            </span>
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
            class="min-h-[46px] px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
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
              class="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl border shrink-0 transition-colors"
              :class="
                isAnnualYearActive
                  ? 'border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-800/40 text-slate-400 dark:text-slate-500'
                  : 'border-rose-200/70 dark:border-rose-900/50 bg-rose-50/70 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400'
              "
              :title="
                isAnnualYearActive
                  ? 'Kelola melalui Mapping Bulanan Anggaran Setahun Penuh'
                  : 'Hapus Anggaran'
              "
              @click.stop="financeStore.removeBudget(b.id)"
            >
              <Lock v-if="isAnnualYearActive" class="w-4 h-4" />
              <Trash2 v-else class="w-5 h-5" />
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
            placeholder=""
            aria-label="Pilih Tahun"
          />
        </div>

        <div class="space-y-1.5">
          <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300">
            Bulan Anggaran
          </label>
          <CustomSelect
            v-model="newPeriodMonth"
            :options="allowedAddMonthsOptions"
            placeholder=""
            aria-label="Pilih Bulan"
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
    <!-- MODAL 2: Tambah / Ubah Kategori Anggaran di dalam Periode Bulanan   -->
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

    <!-- =================================================================== -->
    <!-- MODAL 3: Pengaturan Anggaran Setahun Penuh (Mode Ketat / Fleksibel) -->
    <!-- =================================================================== -->
    <AppModal
      v-model="showAnnualSetupModal"
      title="Pengaturan Anggaran Setahun Penuh (PRO)"
      subtitle="Rencanakan anggaran satu tahun penuh sekaligus dan petakan alokasi bulanannya per kategori"
      max-width="lg"
    >
      <div class="space-y-4">
        <div class="space-y-1.5">
          <label class="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
            1. Pilih Tahun Anggaran
          </label>
          <CustomSelect
            v-model="annualSetupYear"
            :options="annualSetupYearOptions"
            placeholder=""
            aria-label="Pilih Tahun Anggaran"
          />
          <p class="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            Setelah tahun ini diatur menggunakan <strong>Anggaran Setahun Penuh</strong>, penambahan anggaran dengan periode bulanan terpisah pada tahun tersebut akan dinonaktifkan dan seluruh alokasi dikelola melalui Mapping Bulanan.
          </p>
        </div>

        <div class="space-y-2">
          <label class="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
            2. Pilih Mode Penganggaran Satu Tahun
          </label>

          <div class="grid grid-cols-1 gap-2.5">
            <!-- Opsi 1: Mode Ketat -->
            <button
              type="button"
              class="w-full p-4 rounded-2xl border text-left transition-all flex items-start gap-3.5 cursor-pointer"
              :class="
                annualSetupMode === 'strict'
                  ? 'border-rose-600 bg-rose-50/60 dark:bg-rose-950/35 ring-2 ring-rose-500/15'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-950/40 hover:border-slate-300 dark:hover:border-slate-700'
              "
              @click="annualSetupMode = 'strict'"
            >
              <div
                class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 transition-colors"
                :class="
                  annualSetupMode === 'strict'
                    ? 'bg-rose-600 text-white'
                    : 'bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                "
              >
                <ShieldAlert class="w-5 h-5" />
              </div>

              <div class="min-w-0 flex-1 space-y-1">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <span class="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                    Mode Ketat (Disiplin Anggaran)
                  </span>
                  <span
                    class="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider"
                    :class="
                      annualSetupMode === 'strict'
                        ? 'bg-rose-600 text-white'
                        : 'bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                    "
                  >
                    Maks. {{ MAX_STRICT_ANNUAL_REVISIONS }}x Perubahan
                  </span>
                </div>
                <ul class="text-[11px] sm:text-xs text-slate-600 dark:text-slate-400 space-y-1 list-disc pl-4 leading-relaxed">
                  <li>
                    <strong>Tidak bisa menambahkan transaksi yang belum masuk waktu alokasi anggaran</strong> (misal kategori dialokasikan bulan Juni, namun transaksi ditambahkan di bulan April -> ditolak dan wajib mengubah anggaran terlebih dahulu).
                  </li>
                  <li>
                    Jika transaksi ditambahkan pada bulan <strong>setelah</strong> bulan alokasi minimum (misal setelah Juni), transaksi <strong>tetap bisa dibelanjakan</strong>.
                  </li>
                  <li>
                    Anggaran yang baru dibuat atau sedang direvisi akan berstatus <strong>Draft</strong> hingga Anda mengklik <strong>Finalisasi Anggaran</strong>. Selama proses perubahan (Draft), pencatatan transaksi untuk kategori di dalam anggaran dikunci sementara.
                  </li>
                  <li>
                    Perubahan anggaran tahunan (setelah difinalisasi) hanya dapat dilakukan <strong>maksimal {{ MAX_STRICT_ANNUAL_REVISIONS }}x</strong>.
                  </li>
                </ul>
              </div>
            </button>

            <!-- Opsi 2: Mode Fleksibel -->
            <button
              type="button"
              class="w-full p-4 rounded-2xl border text-left transition-all flex items-start gap-3.5 cursor-pointer"
              :class="
                annualSetupMode === 'flexible'
                  ? 'border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/35 ring-2 ring-emerald-500/15'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-950/40 hover:border-slate-300 dark:hover:border-slate-700'
              "
              @click="annualSetupMode = 'flexible'"
            >
              <div
                class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 transition-colors"
                :class="
                  annualSetupMode === 'flexible'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                "
              >
                <CheckCircle2 class="w-5 h-5" />
              </div>

              <div class="min-w-0 flex-1 space-y-1">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <span class="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                    Mode Fleksibel (Adaptif)
                  </span>
                  <span
                    class="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider"
                    :class="
                      annualSetupMode === 'flexible'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                    "
                  >
                    Tanpa Batas Revisi
                  </span>
                </div>
                <ul class="text-[11px] sm:text-xs text-slate-600 dark:text-slate-400 space-y-1 list-disc pl-4 leading-relaxed">
                  <li>
                    Saat menambahkan transaksi sebelum masuk periode yang dialokasikan (misal masih di April tapi alokasi Juni), Anda <strong>hanya diberi dialog konfirmasi</strong> dan tetap dapat menyimpan transaksi tersebut jika setuju.
                  </li>
                  <li>
                    Untuk mengubah anggaran yang sudah Final, klik <strong>Perubahan Anggaran</strong> (masuk status Draft sementara) lalu <strong>Finalisasi Anggaran</strong> kembali tanpa batasan jumlah perubahan.
                  </li>
                </ul>
              </div>
            </button>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="flex items-center justify-end gap-2 w-full">
          <button
            type="button"
            :disabled="isSavingAnnualSetup"
            class="w-full sm:w-auto min-h-[46px] px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
            @click="handleSaveAnnualSetup"
          >
            <Check class="w-4 h-4 shrink-0" />
            <span>
              {{
                financeStore.hasAnnualBudgetForYear(annualSetupYear)
                  ? `Simpan Mode Anggaran ${annualSetupYear}`
                  : `Aktifkan Anggaran Setahun ${annualSetupYear}`
              }}
            </span>
          </button>
        </div>
      </template>
    </AppModal>

    <!-- =================================================================== -->
    <!-- MODAL 4: Mapping Bulanan per Kategori Anggaran Setahun Penuh        -->
    <!-- =================================================================== -->
    <AppModal
      v-model="showAnnualMappingModal"
      :title="
        !isAnnualDraft
          ? `Rincian Mapping Anggaran Tahunan (${selectedYear})`
          : isEditingAnnualCategory
            ? `Ubah Mapping Anggaran Tahunan (${selectedYear})`
            : `Tambah Kategori & Mapping Bulanan (${selectedYear})`
      "
      :subtitle="
        activeAnnualMeta?.mode === 'strict'
          ? `Mode Ketat · Kuota Perubahan Terpakai: ${activeAnnualMeta.revisionCount} dari ${MAX_STRICT_ANNUAL_REVISIONS}x`
          : 'Mode Fleksibel · Bebas Revisi Kapan Saja'
      "
      max-width="xl"
    >
      <div class="space-y-4">
        <!-- 1. Pilih Kategori & Total Anggaran Setahun -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="space-y-1.5">
            <label class="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Kategori Pengeluaran
            </label>
            <CustomSelect
              v-model="mappingCategory"
              :options="expenseCategoryOptions"
              :disabled="isEditingAnnualCategory || !isAnnualDraft"
              searchable
              search-placeholder="Ketik untuk mencari kategori..."
              placeholder=""
              aria-label="Pilih Kategori Pengeluaran"
            />
          </div>

          <div class="space-y-1.5">
            <label class="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Total Anggaran Setahun (Rp)
            </label>
            <input
              :value="mappingAnnualLimitDisplay"
              type="text"
              inputmode="numeric"
              autocomplete="off"
              :disabled="!isAnnualDraft"
              placeholder="Contoh: 12.000.000"
              class="w-full h-[46px] min-h-[46px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 text-xs sm:text-sm font-money font-bold tabular-nums text-slate-900 dark:text-slate-100 placeholder:font-sans placeholder:font-normal placeholder:text-xs sm:placeholder:text-sm placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:outline-none focus:border-emerald-600 disabled:opacity-75"
              @input="handleMappingAnnualLimitInput"
            />
          </div>
        </div>

        <!-- 2. Indikator Selisih Penganggaran (Wajib Rp 0 untuk Menyimpan) -->
        <div
          class="rounded-2xl border p-3.5 space-y-2.5 transition-colors"
          :class="
            mappingTargetAnnualNum > 0 && mappingDifference === 0
              ? 'border-emerald-500/60 bg-emerald-50/60 dark:bg-emerald-950/30'
              : mappingDifference < 0
                ? 'border-rose-500/60 bg-rose-50/60 dark:bg-rose-950/30'
                : 'border-amber-400/70 bg-amber-50/60 dark:bg-amber-950/25'
          "
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-1.5 text-xs font-bold">
              <CheckCircle2
                v-if="mappingTargetAnnualNum > 0 && mappingDifference === 0"
                class="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0"
              />
              <AlertTriangle
                v-else
                class="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0"
              />
              <span class="text-slate-900 dark:text-slate-100">
                Status Mapping Bulanan ({{ mappingActiveMonthsCount }} dari 12 Bulan Diisi)
              </span>
            </div>

            <span
              class="px-2.5 py-0.5 rounded-md text-[11px] font-money font-bold"
              :class="
                mappingTargetAnnualNum > 0 && mappingDifference === 0
                  ? 'bg-emerald-600 text-white'
                  : mappingDifference < 0
                    ? 'bg-rose-600 text-white'
                    : 'bg-amber-500 text-slate-950'
              "
            >
              <template v-if="mappingTargetAnnualNum > 0 && mappingDifference === 0">
                Pas · Tidak Ada Selisih (Rp 0)
              </template>
              <template v-else-if="mappingDifference > 0">
                Belum Dipetakan: {{ themeStore.formatMoney(mappingDifference) }}
              </template>
              <template v-else-if="mappingDifference < 0">
                Kelebihan Mapping: {{ themeStore.formatMoney(Math.abs(mappingDifference)) }}
              </template>
              <template v-else>
                Isi Nominal Anggaran
              </template>
            </span>
          </div>

          <div class="grid grid-cols-3 gap-2 text-xs font-money pt-1 border-t border-slate-200/60 dark:border-slate-800/60">
            <div>
              <div class="text-[10px] font-sans text-slate-500 dark:text-slate-400">Target Setahun</div>
              <div class="font-bold text-slate-900 dark:text-slate-100 truncate">
                {{ themeStore.formatMoney(mappingTargetAnnualNum) }}
              </div>
            </div>
            <div>
              <div class="text-[10px] font-sans text-slate-500 dark:text-slate-400">Total Mapping Bulanan</div>
              <div class="font-bold text-emerald-600 dark:text-emerald-400 truncate">
                {{ themeStore.formatMoney(mappingTotalAllocated) }}
              </div>
            </div>
            <div class="text-right">
              <div class="text-[10px] font-sans text-slate-500 dark:text-slate-400">Selisih Penganggaran</div>
              <div
                class="font-bold truncate"
                :class="
                  mappingDifference === 0 && mappingTargetAnnualNum > 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                "
              >
                {{ mappingDifference === 0 ? 'Rp 0' : themeStore.formatMoney(Math.abs(mappingDifference)) }}
              </div>
            </div>
          </div>

          <!-- Quick Mapping Helper Buttons (hanya saat Draft) -->
          <div v-if="isAnnualDraft" class="flex flex-wrap items-center gap-1.5 pt-1">
            <button
              type="button"
              class="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-emerald-500 text-[11px] font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 transition-colors cursor-pointer"
              @click="distributeEvenly12Months"
            >
              <Divide class="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Bagi Rata 12 Bulan</span>
            </button>

            <button
              type="button"
              class="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-emerald-500 text-[11px] font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 transition-colors cursor-pointer"
              @click="syncAnnualTotalFromMonthlySum"
            >
              <Coins class="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Samakan Target Setahun dgn Total Bulan</span>
            </button>

            <button
              type="button"
              class="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-rose-500 text-[11px] font-semibold text-slate-600 dark:text-slate-300 inline-flex items-center gap-1 transition-colors cursor-pointer"
              @click="clearAllMonthlyMapping"
            >
              <RotateCcw class="w-3.5 h-3.5 text-rose-500 shrink-0" />
              <span>Reset Semua Bulan</span>
            </button>
          </div>
        </div>

        <!-- 3. Grid Mapping 12 Bulan (Januari s/d Desember) — Tidak harus diisi semua bulan -->
        <div class="space-y-2">
          <div class="flex flex-wrap items-center justify-between gap-1">
            <label class="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Pemetaan (Mapping) Bulanan Tahun {{ selectedYear }}
            </label>
            <span class="text-[11px] text-slate-500 dark:text-slate-400">
              {{
                isAnnualDraft
                  ? 'Kosongkan bulan yang tidak memiliki alokasi (misal hanya Mei, Juli & Agustus)'
                  : 'Status Final — Klik "Perubahan Anggaran" untuk mengedit rincian bulanan'
              }}
            </span>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
            <div
              v-for="mm in MONTH_KEYS"
              :key="mm"
              class="rounded-xl border p-2.5 space-y-1.5 transition-colors"
              :class="
                Number(mappingMonths[mm] || 0) > 0
                  ? 'border-emerald-500/60 bg-emerald-50/30 dark:bg-emerald-950/20'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40'
              "
            >
              <div class="flex items-center justify-between gap-1">
                <span class="text-xs font-bold text-slate-800 dark:text-slate-200">
                  {{ getMonthNameLong(mm) }}
                </span>
                <button
                  v-if="isAnnualDraft && mappingDifference !== 0 && mappingTargetAnnualNum > 0"
                  type="button"
                  class="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                  title="Masukkan sisa selisih ke bulan ini"
                  @click="allocateRemainingToMonth(mm)"
                >
                  {{ mappingDifference > 0 ? '+Isi Sisa' : 'Sesuaikan' }}
                </button>
                <span
                  v-else-if="Number(mappingMonths[mm] || 0) > 0"
                  class="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400"
                >
                  Dialokasikan
                </span>
                <span v-else class="text-[10px] text-slate-400">
                  Kosong
                </span>
              </div>

              <input
                :value="getMonthInputDisplay(mm)"
                type="text"
                inputmode="numeric"
                autocomplete="off"
                :disabled="!isAnnualDraft"
                placeholder="0 (Tidak dialokasikan)"
                class="w-full min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs sm:text-sm font-money font-semibold tabular-nums text-slate-900 dark:text-slate-100 placeholder:font-sans placeholder:font-normal placeholder:text-[11px] placeholder:text-slate-400 focus:outline-none focus:border-emerald-600 disabled:opacity-75"
                @input="handleMonthAllocationInput(mm, $event)"
              />
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <div v-if="isAnnualDraft" class="flex items-center justify-between gap-2 w-full">
          <button
            v-if="isEditingAnnualCategory"
            type="button"
            class="min-h-[46px] px-4 py-2.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors shrink-0 cursor-pointer"
            @click="handleDeleteAnnualCategoryFromModal"
          >
            <Trash2 class="w-4 h-4 shrink-0" />
            <span>Hapus Kategori</span>
          </button>
          <div v-else></div>

          <button
            type="button"
            :disabled="!canSubmitAnnualMapping || isSavingAnnualMapping"
            class="flex-1 sm:flex-initial min-h-[46px] px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
            @click="handleSaveAnnualMapping"
          >
            <Check class="w-4 h-4 shrink-0" />
            <span>
              {{
                mappingDifference !== 0 && mappingTargetAnnualNum > 0
                  ? 'Selesaikan Selisih Rp 0 untuk Menyimpan'
                  : 'Simpan Mapping Anggaran Tahunan'
              }}
            </span>
          </button>
        </div>
        <div v-else class="flex items-center justify-end gap-2 w-full">
          <button
            type="button"
            class="min-h-[46px] px-6 py-2.5 rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            @click="showAnnualMappingModal = false"
          >
            <span>Tutup Rincian</span>
          </button>
        </div>
      </template>
    </AppModal>
  </div>
</template>
