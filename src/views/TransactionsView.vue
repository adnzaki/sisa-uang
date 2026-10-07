<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Search,
  Plus,
  Trash2,
} from 'lucide-vue-next';
import {
  useFinanceStore,
  formatPeriodLabel,
  formatTransactionDateBadge,
} from '../stores/finance';
import { useThemeStore } from '../stores/theme';
import CustomSelect, { type SelectOptionItem } from '../components/CustomSelect.vue';

const { t, locale } = useI18n();
const financeStore = useFinanceStore();
const themeStore = useThemeStore();

const typeFilter = ref<'all' | 'income' | 'expense' | 'transfer'>('all');
const searchQuery = ref('');
const selectedWalletId = ref<string>('all');
const selectedHolderFilter = ref<string>('all');

const periodFilterOptions = computed<SelectOptionItem[]>(() => [
  { value: 'all', label: 'Semua Periode' },
  ...financeStore.availablePeriods.map((p) => ({
    value: p,
    label: formatPeriodLabel(p, locale.value === 'id' ? 'id-ID' : 'en-US'),
  })),
]);

const typeFilterOptions = computed<SelectOptionItem[]>(() => [
  { value: 'all', label: 'Semua Jenis' },
  { value: 'expense', label: t('transactions.expense') },
  { value: 'income', label: t('transactions.income') },
  { value: 'transfer', label: t('transactions.transfer') },
]);

const walletFilterOptions = computed<SelectOptionItem[]>(() => [
  { value: 'all', label: 'Semua Sumber Dana' },
  ...financeStore.wallets.map((w) => ({
    value: w.id,
    label: w.name,
  })),
]);

const filteredTransactions = computed(() => {
  return financeStore.periodTransactions.filter((tx) => {
    if (typeFilter.value !== 'all' && tx.type !== typeFilter.value) {
      return false;
    }
    if (
      selectedWalletId.value !== 'all' &&
      tx.walletId !== selectedWalletId.value &&
      tx.toWalletId !== selectedWalletId.value
    ) {
      return false;
    }
    if (
      selectedHolderFilter.value !== 'all' &&
      tx.fundOwnerName !== selectedHolderFilter.value &&
      tx.toFundOwnerName !== selectedHolderFilter.value
    ) {
      return false;
    }
    if (searchQuery.value.trim()) {
      const q = searchQuery.value.toLowerCase();
      return (
        tx.note.toLowerCase().includes(q) ||
        tx.category.toLowerCase().includes(q) ||
        tx.walletName.toLowerCase().includes(q) ||
        String(tx.toWalletName || '').toLowerCase().includes(q) ||
        String(tx.fundOwnerName || '').toLowerCase().includes(q) ||
        String(tx.toFundOwnerName || '').toLowerCase().includes(q)
      );
    }
    return true;
  });
});

const uniqueHolderNames = computed(() => {
  const set = new Set<string>();
  for (const o of financeStore.ownershipSummary) {
    set.add(o.displayHolderName);
  }
  for (const tx of financeStore.transactions) {
    if (tx.fundOwnerName) set.add(tx.fundOwnerName);
  }
  return Array.from(set);
});

const holderFilterOptions = computed<SelectOptionItem[]>(() => [
  { value: 'all', label: 'Semua Kepemilikan' },
  ...uniqueHolderNames.value.map((name) => ({
    value: name,
    label: name,
  })),
]);

const filteredTotalIncome = computed(() =>
  filteredTransactions.value
    .filter((tx) => tx.type === 'income')
    .reduce((acc, tx) => acc + Number(tx.amount || 0), 0)
);

const filteredTotalExpense = computed(() =>
  filteredTransactions.value.reduce((acc, tx) => {
    if (tx.type === 'expense') return acc + Number(tx.amount || 0);
    if (tx.type === 'transfer' && Number(tx.adminFee || 0) > 0) {
      return acc + Number(tx.adminFee || 0);
    }
    return acc;
  }, 0)
);

const filteredNetDifference = computed(
  () => filteredTotalIncome.value - filteredTotalExpense.value
);

function getDateBadge(dateStr: string) {
  return formatTransactionDateBadge(dateStr, locale.value === 'id' ? 'id-ID' : 'en-US');
}
</script>

<template>
  <div class="space-y-4 sm:space-y-6 max-w-full overflow-x-hidden">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div class="min-w-0">
        <h1 class="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          {{ t('transactions.title') }}
        </h1>
        <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Catat dan pantau seluruh arus kas secara cepat. Ketuk transaksi untuk melihat detail atau mengubah data.
        </p>
      </div>

      <button
        type="button"
        class="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-colors shrink-0 shadow-xs"
        @click="financeStore.openAddTransactionModal()"
      >
        <Plus class="w-4 h-4 shrink-0" />
        <span>{{ t('dashboard.addTransaction') }}</span>
      </button>
    </div>

    <!-- 3 Summary Cards (Matching Published Mobile Reference) -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-4">
      <div class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <div class="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          TOTAL PEMASUKAN
        </div>
        <div class="text-xl sm:text-2xl font-money font-bold text-emerald-600 dark:text-emerald-400 mt-1 truncate">
          {{ themeStore.formatMoney(filteredTotalIncome) }}
        </div>
      </div>

      <div class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <div class="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          TOTAL PENGELUARAN
        </div>
        <div class="text-xl sm:text-2xl font-money font-bold text-rose-600 dark:text-rose-400 mt-1 truncate">
          {{ themeStore.formatMoney(filteredTotalExpense) }}
        </div>
      </div>

      <div class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <div class="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          SELISIH BERSIH
        </div>
        <div
          class="text-xl sm:text-2xl font-money font-bold mt-1 truncate"
          :class="
            filteredNetDifference >= 0
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-slate-900 dark:text-slate-100'
          "
        >
          {{ filteredNetDifference >= 0 ? '+' : '-' }}{{ themeStore.formatMoney(Math.abs(filteredNetDifference)) }}
        </div>
      </div>
    </div>

    <!-- Search & Filter Box -->
    <div class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 sm:p-4 space-y-3">
      <!-- Search Input -->
      <div class="relative">
        <Search class="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          v-model="searchQuery"
          type="text"
          :placeholder="t('transactions.searchPlaceholder')"
          class="w-full min-h-[44px] pl-10 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
        />
      </div>

      <!-- 2x2 Filter Grid on Mobile, 4 Columns on Desktop (Using CustomSelect) -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        <CustomSelect
          v-model="financeStore.selectedPeriod"
          :options="periodFilterOptions"
          size="sm"
          aria-label="Pilih Periode Bulan"
        />

        <CustomSelect
          v-model="typeFilter"
          :options="typeFilterOptions"
          size="sm"
          aria-label="Filter Jenis Transaksi"
        />

        <CustomSelect
          v-model="selectedWalletId"
          :options="walletFilterOptions"
          size="sm"
          searchable
          search-placeholder="Cari sumber dana..."
          aria-label="Filter Sumber Dana"
        />

        <CustomSelect
          v-model="selectedHolderFilter"
          :options="holderFilterOptions"
          size="sm"
          searchable
          search-placeholder="Cari kepemilikan..."
          aria-label="Filter Kepemilikan"
        />
      </div>
    </div>

    <!-- Empty State -->
    <div
      v-if="filteredTransactions.length === 0"
      class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 sm:p-10 text-center space-y-3"
    >
      <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
        Tidak ada transaksi yang cocok dengan filter pencarian atau periode Anda.
      </p>
      <div class="flex flex-wrap items-center justify-center gap-2">
        <button
          v-if="financeStore.selectedPeriod !== 'all' && financeStore.transactions.length > 0"
          type="button"
          class="min-h-[42px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200"
          @click="financeStore.selectedPeriod = 'all'"
        >
          Tampilkan Semua Periode ({{ financeStore.transactions.length }})
        </button>
        <button
          type="button"
          class="min-h-[42px] px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold"
          @click="financeStore.openAddTransactionModal()"
        >
          {{ t('dashboard.addTransaction') }}
        </button>
      </div>
    </div>

    <!-- Clean Mobile-First Transaction Cards (Tap anywhere on card to View/Edit, enlarged Delete button on right) -->
    <div v-else class="space-y-2.5">
      <div
        v-for="tx in filteredTransactions"
        :key="tx.id"
        role="button"
        tabindex="0"
        class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 sm:p-4 flex items-center justify-between gap-3 hover:border-emerald-500/50 hover:shadow-xs active:scale-[0.995] transition-all cursor-pointer"
        @click="financeStore.openEditTransactionModal(tx)"
        @keydown.enter="financeStore.openEditTransactionModal(tx)"
      >
        <div class="flex items-center gap-3 sm:gap-3.5 min-w-0 flex-1">
          <!-- Date Badge Box -->
          <div
            class="w-14 h-14 sm:w-15 sm:h-15 rounded-2xl flex flex-col items-center justify-center shrink-0 border"
            :class="
              tx.type === 'income'
                ? 'bg-emerald-50/90 dark:bg-emerald-950/40 border-emerald-200/60 dark:border-emerald-900/50 text-emerald-600 dark:text-emerald-400'
                : tx.type === 'transfer'
                ? 'bg-indigo-50/90 dark:bg-indigo-950/40 border-indigo-200/60 dark:border-indigo-900/50 text-indigo-600 dark:text-indigo-400'
                : 'bg-rose-50/90 dark:bg-rose-950/40 border-rose-200/60 dark:border-rose-900/50 text-rose-600 dark:text-rose-400'
            "
          >
            <span class="text-base sm:text-lg font-bold font-money leading-none">
              {{ getDateBadge(tx.date).day }}
            </span>
            <span class="text-[10px] font-semibold leading-tight mt-1 text-center px-0.5 truncate max-w-full">
              {{ getDateBadge(tx.date).monthYear }}
            </span>
          </div>

          <!-- Transaction Details -->
          <div class="min-w-0 flex-1">
            <!-- Category Badge + Wallet & Holder -->
            <div class="flex flex-wrap items-center gap-1.5">
              <span
                class="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold shrink-0"
                :class="
                  tx.type === 'income'
                    ? 'bg-emerald-100/80 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300'
                    : tx.type === 'transfer'
                    ? 'bg-indigo-100/80 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300'
                    : 'bg-rose-100/80 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300'
                "
              >
                {{ tx.category }}
              </span>
              <span class="text-xs text-slate-500 dark:text-slate-400 truncate">
                <template v-if="tx.type === 'transfer'">
                  {{ tx.walletName }} · {{ tx.fundOwnerName || 'Pribadi' }} → {{ tx.toWalletName || tx.walletName }} · {{ tx.toFundOwnerName || 'Pribadi' }}
                </template>
                <template v-else>
                  {{ tx.walletName }} · {{ tx.fundOwnerName || 'Pribadi' }}
                </template>
              </span>
            </div>

            <!-- Note / Title -->
            <div class="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 truncate mt-1">
              {{ tx.note }}
            </div>

            <!-- Amount + Optional Admin Fee Badge -->
            <div class="flex flex-wrap items-center gap-2 mt-0.5">
              <span
                class="text-sm sm:text-base font-money font-bold"
                :class="
                  tx.type === 'income'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : tx.type === 'transfer'
                    ? 'text-indigo-600 dark:text-indigo-400'
                    : 'text-rose-600 dark:text-rose-400'
                "
              >
                {{ tx.type === 'income' ? '+' : tx.type === 'transfer' ? '⇄ ' : '-' }}{{ themeStore.formatMoney(tx.amount) }}
              </span>
              <span
                v-if="tx.type === 'transfer' && Number(tx.adminFee || 0) > 0"
                class="px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 text-[10px] font-money font-semibold"
              >
                +Biaya Admin {{ themeStore.formatMoney(Number(tx.adminFee)) }}
              </span>
            </div>
          </div>
        </div>

        <!-- Enlarged Delete Button -->
        <button
          type="button"
          class="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl border border-rose-200/70 dark:border-rose-900/50 bg-rose-50/70 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 shrink-0 transition-colors"
          :title="t('transactions.delete')"
          @click.stop="financeStore.removeTransaction(tx.id)"
        >
          <Trash2 class="w-5 h-5" />
        </button>
      </div>
    </div>
  </div>
</template>
