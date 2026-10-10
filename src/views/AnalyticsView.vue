<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  CalendarRange,
  FileDown,
  FileText,
  Scale,
  PieChart,
  Check,
  Crown,
} from 'lucide-vue-next';
import {
  useFinanceStore,
  formatHolderName,
  type TransactionItem,
} from '../stores/finance';
import { useThemeStore } from '../stores/theme';
import { useAuthStore } from '../stores/auth';
import { useNotificationStore } from '../stores/notification';
import AppModal from '../components/AppModal.vue';
import CustomSelect, { type SelectOptionItem } from '../components/CustomSelect.vue';
import MaterialDatePicker from '../components/MaterialDatePicker.vue';
import {
  computePdfReportPreview,
  generateAnalyticsPdfDocument,
  doesTxMatchScope,
  getScopeNetDeltaForTx,
  getScopeLiveBalance,
  type PdfReportType,
} from '../utils/pdfReportGenerator';

export type AnalyticsRangeType = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';

const { locale } = useI18n();
const financeStore = useFinanceStore();
const themeStore = useThemeStore();
const authStore = useAuthStore();
const notificationStore = useNotificationStore();

// Collapsible filter state ("SEMBUNYIKAN FILTER TANGGAL" / "TAMPILKAN FILTER TANGGAL")
const showDateFilter = ref(true);

// Range type: Harian, Mingguan, Bulanan, Tahunan, Custom
const rangeType = ref<AnalyticsRangeType>('monthly');

// Wallet filter: 'all' ("Semua Sumber Dana") or specific walletId
const selectedWallet = ref<string>('all');

// Owner filter: 'all' ("Semua Kepemilikan") or specific formatted holder name
const selectedOwner = ref<string>('all');

// =========================================================================
// PDF Report Generator Modal State
// =========================================================================
const pdfModalOpen = ref(false);
const pdfReportType = ref<PdfReportType>('kas_umum');
const pdfSelectedWallet = ref<string>('all');
const pdfSelectedOwner = ref<string>('all');
const isGeneratingPdf = ref(false);

const pdfReportTypeCards: {
  id: PdfReportType;
  title: string;
  subtitle: string;
  icon: any;
  badge: string;
}[] = [
  {
    id: 'kas_umum',
    title: 'Laporan Kas Umum',
    subtitle:
      'Buku kas umum kronologis berisi saldo awal, rincian kas masuk (debit), kas keluar (kredit), mutasi transfer, dan saldo berjalan hingga akhir periode.',
    icon: FileText,
    badge: 'Buku Kas Umum',
  },
  {
    id: 'rekonsiliasi_kas',
    title: 'Laporan Rekonsiliasi Kas',
    subtitle:
      'Evaluasi kesesuaian antara saldo awal, akumulasi mutasi pemasukan/pengeluaran/transfer per pos dana, dengan saldo aktual sistem.',
    icon: Scale,
    badge: 'Audit & Rekonsiliasi',
  },
  {
    id: 'realisasi_anggaran',
    title: 'Realisasi / Serapan Anggaran',
    subtitle:
      'Perbandingan pagu anggaran bulanan terhadap realisasi pengeluaran aktual per kategori, lengkap dengan persentase serapan dan status evaluasi.',
    icon: PieChart,
    badge: 'Evaluasi Anggaran',
  },
];

function openPdfGeneratorModal() {
  if (!authStore.isProUser) {
    notificationStore.openProModal({
      featureTitle: 'Generate Laporan PDF Analitik',
      featureDescription:
        'Fitur cetak & unduh Laporan PDF resmi (Laporan Kas Umum, Laporan Rekonsiliasi Kas, dan Realisasi / Serapan Anggaran) hanya tersedia untuk pelanggan SisaUang Pro.',
      limitSummary: 'Fitur Khusus SisaUang Pro',
    });
    return;
  }
  pdfSelectedWallet.value = selectedWallet.value;
  pdfSelectedOwner.value = selectedOwner.value;
  pdfModalOpen.value = true;
}

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

watch(
  activeBounds,
  (bounds) => {
    if (bounds.startIso && bounds.endIso) {
      void financeStore.ensureTransactionsForDateRange(bounds.startIso, bounds.endIso);
    }
  },
  { immediate: true }
);

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

// Dropdown 1: Pilih rentang waktu (Harian, Mingguan, Bulanan, Tahunan, Custom)
const rangeTypeOptions = computed<SelectOptionItem[]>(() => [
  { value: 'daily', label: 'Harian' },
  { value: 'weekly', label: 'Mingguan' },
  { value: 'monthly', label: 'Bulanan' },
  { value: 'yearly', label: 'Tahunan' },
  { value: 'custom', label: 'Custom' },
]);

// Dropdown 2: Sumber Dana ("Semua Sumber Dana" + active wallets)
const walletOptions = computed<SelectOptionItem[]>(() => {
  const activeWallets = financeStore.wallets.filter((w) => !w.deleted);
  return [
    { value: 'all', label: 'Semua Sumber Dana' },
    ...activeWallets.map((w) => ({
      value: w.id,
      label: w.name,
      badge: themeStore.formatMoney(Number(w.balance || 0)),
    })),
  ];
});

// Dropdown 3: Kepemilikan ("Semua Kepemilikan" + unique fund owners)
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
    { value: 'all', label: 'Semua Kepemilikan' },
    ...sortedNames.map((name) => ({
      value: name,
      label: name,
    })),
  ];
});

const selectedWalletLabel = computed(() => {
  if (selectedWallet.value === 'all') return 'Semua Sumber Dana';
  const found = financeStore.wallets.find((w) => w.id === selectedWallet.value);
  return found ? found.name : 'Sumber Dana Tertentu';
});

function isTxSourceInScope(tx: TransactionItem, walletId: string, owner: string): boolean {
  const walletOk = walletId === 'all' || tx.walletId === walletId;
  const srcOwner = formatHolderName(tx.fundOwnerName);
  const ownerOk = owner === 'all' || srcOwner === owner;
  return walletOk && ownerOk;
}

function isTxDestInScope(tx: TransactionItem, walletId: string, owner: string): boolean {
  if (tx.type !== 'transfer') return false;
  const dstWalletId = tx.toWalletId || tx.walletId;
  const dstOwner = tx.toFundOwnerName
    ? formatHolderName(tx.toFundOwnerName)
    : formatHolderName(tx.fundOwnerName);
  const walletOk = walletId === 'all' || dstWalletId === walletId;
  const ownerOk = owner === 'all' || dstOwner === owner;
  return walletOk && ownerOk;
}

// Current live balance for the selected (wallet, owner) scope
const currentScopeLiveBalance = computed(() =>
  getScopeLiveBalance(
    financeStore.wallets,
    financeStore.walletOwners,
    selectedWallet.value,
    selectedOwner.value
  )
);

// Transactions inside active [startIso, endIso] and matching selected (wallet, owner)
const filteredPeriodTransactions = computed<TransactionItem[]>(() => {
  const { startIso, endIso } = activeBounds.value;
  return financeStore.transactions.filter((tx) => {
    const d = String(tx.date || '').slice(0, 10);
    if (d < startIso || d > endIso) return false;
    return doesTxMatchScope(tx, selectedWallet.value, selectedOwner.value);
  });
});

// Saldo Awal & Saldo Akhir calculation for the selected [startIso, endIso], selectedWallet, and selectedOwner
const saldoAkhir = computed(() => {
  const { endIso } = activeBounds.value;
  let netAfterEnd = 0;
  for (const tx of financeStore.transactions) {
    const d = String(tx.date || '').slice(0, 10);
    if (d > endIso) {
      netAfterEnd += getScopeNetDeltaForTx(tx, selectedWallet.value, selectedOwner.value);
    }
  }
  return currentScopeLiveBalance.value - netAfterEnd;
});

const periodNetDelta = computed(() => {
  const { startIso, endIso } = activeBounds.value;
  let netInPeriod = 0;
  for (const tx of financeStore.transactions) {
    const d = String(tx.date || '').slice(0, 10);
    if (d >= startIso && d <= endIso) {
      netInPeriod += getScopeNetDeltaForTx(tx, selectedWallet.value, selectedOwner.value);
    }
  }
  return netInPeriod;
});

const saldoAwal = computed(() => saldoAkhir.value - periodNetDelta.value);

// Period Income & Expense for selected range, wallet, and owner
const periodIncome = computed(() => {
  let sum = 0;
  for (const tx of filteredPeriodTransactions.value) {
    if (tx.type === 'income' && isTxSourceInScope(tx, selectedWallet.value, selectedOwner.value)) {
      sum += Number(tx.amount || 0);
    }
  }
  return sum;
});

const periodExpense = computed(() => {
  let sum = 0;
  for (const tx of filteredPeriodTransactions.value) {
    const isSource = isTxSourceInScope(tx, selectedWallet.value, selectedOwner.value);
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

// Cross-scope transfer in/out when a specific wallet or owner is selected
const periodCrossScopeTransferIn = computed(() => {
  if (selectedWallet.value === 'all' && selectedOwner.value === 'all') return 0;
  let sum = 0;
  for (const tx of filteredPeriodTransactions.value) {
    if (tx.type === 'transfer') {
      const inSrc = isTxSourceInScope(tx, selectedWallet.value, selectedOwner.value);
      const inDst = isTxDestInScope(tx, selectedWallet.value, selectedOwner.value);
      if (inDst && !inSrc) {
        sum += Number(tx.amount || 0);
      }
    }
  }
  return sum;
});

const periodCrossScopeTransferOut = computed(() => {
  if (selectedWallet.value === 'all' && selectedOwner.value === 'all') return 0;
  let sum = 0;
  for (const tx of filteredPeriodTransactions.value) {
    if (tx.type === 'transfer') {
      const inSrc = isTxSourceInScope(tx, selectedWallet.value, selectedOwner.value);
      const inDst = isTxDestInScope(tx, selectedWallet.value, selectedOwner.value);
      if (inSrc && !inDst) {
        sum += Number(tx.amount || 0);
      }
    }
  }
  return sum;
});

const periodNetTransferDelta = computed(
  () => periodCrossScopeTransferIn.value - periodCrossScopeTransferOut.value
);

const periodSavingsRate = computed(() => {
  if (periodIncome.value <= 0) return 0;
  const saved = periodIncome.value - periodExpense.value;
  return Math.round((saved / periodIncome.value) * 100);
});

const categoryBreakdown = computed(() => {
  const map = new Map<string, number>();

  for (const tx of filteredPeriodTransactions.value) {
    const isSource = isTxSourceInScope(tx, selectedWallet.value, selectedOwner.value);
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

  for (const tx of filteredPeriodTransactions.value) {
    if (tx.type === 'income' && isTxSourceInScope(tx, selectedWallet.value, selectedOwner.value)) {
      map.set(tx.category, (map.get(tx.category) || 0) + Number(tx.amount || 0));
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
    const filteredWallets =
      selectedWallet.value === 'all'
        ? ownerItem.wallets
        : ownerItem.wallets.filter((w) => w.walletId === selectedWallet.value);
    const total = Math.max(
      1,
      filteredWallets.reduce((s, w) => s + Number(w.balance || 0), 0)
    );
    return filteredWallets
      .map((w) => ({
        id: w.holderId,
        name: w.walletName,
        balance: w.balance,
        share: Math.max(0, Math.round((w.balance / total) * 100)),
      }))
      .sort((a, b) => b.balance - a.balance);
  }

  const targetWallets =
    selectedWallet.value === 'all'
      ? financeStore.wallets
      : financeStore.wallets.filter((w) => w.id === selectedWallet.value);

  const total = Math.max(
    1,
    targetWallets.reduce((s, w) => s + Number(w.balance || 0), 0)
  );
  return targetWallets
    .map((w) => ({
      id: w.id,
      name: w.name,
      balance: w.balance,
      share: Math.max(0, Math.round((w.balance / total) * 100)),
    }))
    .sort((a, b) => b.balance - a.balance);
});

// Live preview inside the PDF Modal for the chosen report type & scope
const pdfPreviewSummary = computed(() =>
  computePdfReportPreview({
    reportType: pdfReportType.value,
    startIso: activeBounds.value.startIso,
    endIso: activeBounds.value.endIso,
    periodRangeLabel: formattedPeriodRangeLabel.value,
    rangeModeLabel:
      rangeTypeOptions.value.find((o) => o.value === rangeType.value)?.label || 'Bulanan',
    selectedWalletId: pdfSelectedWallet.value,
    selectedOwnerName: pdfSelectedOwner.value,
    wallets: financeStore.wallets,
    walletOwners: financeStore.walletOwners,
    allTransactions: financeStore.transactions,
    budgets: financeStore.budgets,
    formatMoney: (n: number) => themeStore.formatMoney(n),
    userDisplayName: authStore.user?.displayName || 'Pengguna Sisa Uang',
    userEmail: authStore.user?.email || '-',
    locale: locale.value === 'en' ? 'en' : 'id',
  })
);

function handleDownloadPdfReport() {
  if (!authStore.isProUser) {
    pdfModalOpen.value = false;
    notificationStore.openProModal({
      featureTitle: 'Generate Laporan PDF Analitik',
      featureDescription:
        'Fitur cetak & unduh Laporan PDF resmi di halaman Analitik hanya tersedia untuk pelanggan SisaUang Pro.',
      limitSummary: 'Fitur Khusus SisaUang Pro',
    });
    return;
  }
  isGeneratingPdf.value = true;
  try {
    const fileName = generateAnalyticsPdfDocument({
      reportType: pdfReportType.value,
      startIso: activeBounds.value.startIso,
      endIso: activeBounds.value.endIso,
      periodRangeLabel: formattedPeriodRangeLabel.value,
      rangeModeLabel:
        rangeTypeOptions.value.find((o) => o.value === rangeType.value)?.label || 'Bulanan',
      selectedWalletId: pdfSelectedWallet.value,
      selectedOwnerName: pdfSelectedOwner.value,
      wallets: financeStore.wallets,
      walletOwners: financeStore.walletOwners,
      allTransactions: financeStore.transactions,
      budgets: financeStore.budgets,
      formatMoney: (n: number) => themeStore.formatMoney(n),
      userDisplayName: authStore.user?.displayName || 'Pengguna Sisa Uang',
      userEmail: authStore.user?.email || '-',
      locale: locale.value === 'en' ? 'en' : 'id',
    });

    pdfModalOpen.value = false;
    notificationStore.notifySuccess(
      'Laporan PDF Berhasil Diunduh',
      `${pdfPreviewSummary.value.reportTitle} (${formattedPeriodRangeLabel.value}) telah disimpan sebagai ${fileName}.`
    );
  } catch (err) {
    notificationStore.notifyError('Gagal Membuat Laporan PDF', err);
  } finally {
    isGeneratingPdf.value = false;
  }
}
</script>

<template>
  <div class="space-y-5 sm:space-y-6 max-w-full overflow-x-hidden">
    <!-- Page Title Header & Generate PDF Button -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div class="min-w-0">
        <h1 class="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Statistik & Analitik Keuangan
        </h1>
        <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Pantau saldo awal, saldo akhir, arus kas, serta cetak laporan PDF resmi berdasarkan sumber dana dan kepemilikan.
        </p>
      </div>

      <button
        type="button"
        class="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-colors shrink-0 shadow-xs cursor-pointer"
        @click="openPdfGeneratorModal"
      >
        <FileDown class="w-4 h-4 shrink-0" />
        <span>Generate Laporan PDF</span>
        <span
          v-if="!authStore.isProUser"
          class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-400 text-slate-950 text-[10px] font-extrabold uppercase tracking-wider"
        >
          <Crown class="w-3 h-3 shrink-0" />
          <span>PRO</span>
        </span>
      </button>
    </div>

    <!-- =================================================================== -->
    <!-- FILTER & PERIOD NAVIGATION CARD (Sisa Uang Style)                   -->
    <!-- =================================================================== -->
    <section class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4">
      <!-- Collapsible Filter Controls (Pilih rentang waktu, Sumber Dana, Kepemilikan, Custom Dates) -->
      <Transition name="dropdown">
        <div v-if="showDateFilter" class="space-y-3.5">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            <!-- 1. Pilih rentang waktu (Harian, Mingguan, Bulanan, Tahunan, Custom) -->
            <CustomSelect
              v-model="rangeType"
              :options="rangeTypeOptions"
              placeholder="Pilih rentang waktu"
            />

            <!-- 2. Sumber Dana (Semua Sumber Dana / Sumber Dana Tertentu) -->
            <CustomSelect
              v-model="selectedWallet"
              :options="walletOptions"
              placeholder="Sumber Dana"
              searchable
              search-placeholder="Cari sumber dana..."
            />

            <!-- 3. Kepemilikan (Semua Kepemilikan / Kepemilikan Tertentu) -->
            <CustomSelect
              v-model="selectedOwner"
              :options="ownerOptions"
              placeholder="Kepemilikan Dana"
              searchable
              search-placeholder="Cari pemilik dana..."
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
            <span>{{ selectedWalletLabel }}</span>
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
    <div class="grid grid-cols-1 md:grid-cols-3 gap-3.5 sm:gap-4">
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
            {{ formattedPeriodRangeLabel }} · {{ selectedWalletLabel }} · Pemilik: {{ selectedOwner === 'all' ? 'Semua' : selectedOwner }}
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
              Komposisi saldo saat ini ({{ selectedWalletLabel }} · {{ selectedOwner === 'all' ? 'Semua Pemilik' : `Pemilik: ${selectedOwner}` }})
            </p>
          </div>

          <div v-if="walletAllocation.length === 0" class="py-6 text-center text-xs text-slate-500">
            Belum ada sumber dana untuk cakupan ini.
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
              {{ formattedPeriodRangeLabel }} · {{ selectedWalletLabel }} · Pemilik: {{ selectedOwner === 'all' ? 'Semua' : selectedOwner }}
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

    <!-- =================================================================== -->
    <!-- MODAL GENERATE LAPORAN PDF RESMI                                    -->
    <!-- =================================================================== -->
    <AppModal
      v-model="pdfModalOpen"
      title="Generate Laporan Keuangan PDF"
      :subtitle="`Periode Aktif: ${formattedPeriodRangeLabel} (${rangeTypeOptions.find((o) => o.value === rangeType)?.label})`"
      max-width="xl"
    >
      <div class="space-y-5">
        <!-- 1. Pilih Jenis Laporan PDF -->
        <div class="space-y-2">
          <label class="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
            1. Pilih Jenis Laporan PDF
          </label>
          <div class="grid grid-cols-1 gap-2.5">
            <button
              v-for="card in pdfReportTypeCards"
              :key="card.id"
              type="button"
              class="w-full p-3.5 sm:p-4 rounded-2xl border text-left transition-all flex items-start gap-3.5 cursor-pointer"
              :class="
                pdfReportType === card.id
                  ? 'border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/35 ring-2 ring-emerald-500/15'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-950/40 hover:border-slate-300 dark:hover:border-slate-700'
              "
              @click="pdfReportType = card.id"
            >
              <div
                class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 transition-colors"
                :class="
                  pdfReportType === card.id
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                "
              >
                <component :is="card.icon" class="w-5 h-5" />
              </div>

              <div class="min-w-0 flex-1 space-y-1">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <span class="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                    {{ card.title }}
                  </span>
                  <span
                    class="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider"
                    :class="
                      pdfReportType === card.id
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                    "
                  >
                    {{ card.badge }}
                  </span>
                </div>
                <p class="text-[11px] sm:text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {{ card.subtitle }}
                </p>
              </div>
            </button>
          </div>
        </div>

        <!-- 2. Opsi Cakupan Sumber Dana & Kepemilikan Dana -->
        <div class="space-y-2.5">
          <label class="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
            2. Opsi Cakupan Sumber Dana &amp; Kepemilikan
          </label>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div class="space-y-1.5">
              <span class="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                Cakupan Sumber Dana
              </span>
              <CustomSelect
                v-model="pdfSelectedWallet"
                :options="walletOptions"
                placeholder="Semua Sumber Dana"
                searchable
                search-placeholder="Cari sumber dana..."
              />
            </div>

            <div class="space-y-1.5">
              <span class="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                Cakupan Kepemilikan Dana
              </span>
              <CustomSelect
                v-model="pdfSelectedOwner"
                :options="ownerOptions"
                placeholder="Semua Kepemilikan"
                searchable
                search-placeholder="Cari pemilik dana..."
              />
            </div>
          </div>
        </div>

        <!-- 3. Ringkasan Pratinjau Data yang Akan Dicetak ke PDF -->
        <div class="rounded-2xl border border-emerald-200/80 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/25 p-4 space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-200/60 dark:border-emerald-900/50 pb-2.5">
            <div>
              <div class="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                {{ pdfPreviewSummary.reportTitle }}
              </div>
              <div class="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                {{ pdfPreviewSummary.scopeWalletLabel }} · {{ pdfPreviewSummary.scopeOwnerLabel }} · {{ formattedPeriodRangeLabel }}
              </div>
            </div>
            <span class="px-2.5 py-1 rounded-lg bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 text-[11px] font-mono font-bold">
              {{
                pdfReportType === 'realisasi_anggaran'
                  ? `${pdfPreviewSummary.budgetItemCount} Pos Anggaran`
                  : `${pdfPreviewSummary.matchingTxCount} Transaksi`
              }}
            </span>
          </div>

          <!-- Preview metrics for Kas Umum & Rekonsiliasi Kas -->
          <div
            v-if="pdfReportType !== 'realisasi_anggaran'"
            class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs"
          >
            <div class="rounded-xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/70 dark:border-slate-800 p-2.5">
              <div class="text-[10px] text-slate-500 dark:text-slate-400">Saldo Awal</div>
              <div class="font-money font-bold text-slate-900 dark:text-slate-100 mt-0.5 truncate">
                {{ themeStore.formatMoney(pdfPreviewSummary.saldoAwal) }}
              </div>
            </div>
            <div class="rounded-xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/70 dark:border-slate-800 p-2.5">
              <div class="text-[10px] text-slate-500 dark:text-slate-400">Pemasukan</div>
              <div class="font-money font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 truncate">
                +{{ themeStore.formatMoney(pdfPreviewSummary.totalIncome) }}
              </div>
            </div>
            <div class="rounded-xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/70 dark:border-slate-800 p-2.5">
              <div class="text-[10px] text-slate-500 dark:text-slate-400">Pengeluaran</div>
              <div class="font-money font-bold text-rose-600 dark:text-rose-400 mt-0.5 truncate">
                -{{ themeStore.formatMoney(pdfPreviewSummary.totalExpense) }}
              </div>
            </div>
            <div class="rounded-xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/70 dark:border-slate-800 p-2.5">
              <div class="text-[10px] text-slate-500 dark:text-slate-400">Saldo Akhir</div>
              <div class="font-money font-bold text-slate-900 dark:text-slate-100 mt-0.5 truncate">
                {{ themeStore.formatMoney(pdfPreviewSummary.saldoAkhir) }}
              </div>
            </div>
          </div>

          <!-- Preview metrics for Realisasi / Serapan Anggaran -->
          <div v-else class="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
            <div class="rounded-xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/70 dark:border-slate-800 p-2.5">
              <div class="text-[10px] text-slate-500 dark:text-slate-400">Total Pagu Anggaran</div>
              <div class="font-money font-bold text-slate-900 dark:text-slate-100 mt-0.5 truncate">
                {{ themeStore.formatMoney(pdfPreviewSummary.totalBudgetLimit) }}
              </div>
            </div>
            <div class="rounded-xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/70 dark:border-slate-800 p-2.5">
              <div class="text-[10px] text-slate-500 dark:text-slate-400">Realisasi Terpakai</div>
              <div class="font-money font-bold text-rose-600 dark:text-rose-400 mt-0.5 truncate">
                {{ themeStore.formatMoney(pdfPreviewSummary.totalBudgetRealized) }}
              </div>
            </div>
            <div class="col-span-2 sm:col-span-1 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/70 dark:border-slate-800 p-2.5">
              <div class="text-[10px] text-slate-500 dark:text-slate-400">Serapan Anggaran</div>
              <div class="font-money font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 truncate">
                {{ pdfPreviewSummary.budgetAbsorptionRate }}%
              </div>
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="flex flex-col sm:flex-row sm:items-center justify-end gap-2.5 w-full">
          <button
            type="button"
            class="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            @click="pdfModalOpen = false"
          >
            Batal
          </button>
          <button
            type="button"
            :disabled="isGeneratingPdf"
            class="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
            @click="handleDownloadPdfReport"
          >
            <Check v-if="!isGeneratingPdf" class="w-4 h-4 shrink-0" />
            <span>{{ isGeneratingPdf ? 'Menyiapkan Dokumen PDF...' : 'Unduh Laporan PDF' }}</span>
          </button>
        </div>
      </template>
    </AppModal>
  </div>
</template>
