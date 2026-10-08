<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Search,
  Plus,
  Trash2,
  SlidersHorizontal,
  RotateCcw,
  Check,
  X,
} from 'lucide-vue-next';
import {
  useFinanceStore,
  formatPeriodLabel,
  formatTransactionDateBadge,
} from '../stores/finance';
import { useThemeStore } from '../stores/theme';
import AppModal from '../components/AppModal.vue';
import CustomSelect, { type SelectOptionItem } from '../components/CustomSelect.vue';

const { t, locale } = useI18n();
const financeStore = useFinanceStore();
const themeStore = useThemeStore();

const showFilterModal = ref(false);
const typeFilter = ref<'all' | 'income' | 'expense' | 'transfer'>('all');
const selectedCategoryFilter = ref<string>('all');
const searchQuery = ref('');
const selectedWalletId = ref<string>('all');
const selectedHolderFilter = ref<string>('all');

const periodFilterOptions = computed<SelectOptionItem[]>(() => [
  ...financeStore.availablePeriods.map((p) => ({
    value: p,
    label: formatPeriodLabel(p, locale.value === 'id' ? 'id-ID' : 'en-US'),
  })),
]);

const typeFilterOptions = computed<SelectOptionItem[]>(() => [
  { value: 'all', label: 'Semua Jenis Transaksi' },
  { value: 'expense', label: t('transactions.expense') },
  { value: 'income', label: t('transactions.income') },
  { value: 'transfer', label: t('transactions.transfer') },
]);

const categoryFilterOptions = computed<SelectOptionItem[]>(() => {
  const seen = new Set<string>();
  const items: SelectOptionItem[] = [{ value: 'all', label: 'Semua Kategori' }];

  for (const cat of financeStore.categories) {
    if (typeFilter.value === 'expense' && cat.type !== 'expense') continue;
    if (typeFilter.value === 'income' && cat.type !== 'income') continue;
    if (!seen.has(cat.name)) {
      seen.add(cat.name);
      items.push({
        value: cat.name,
        label: cat.name,
        badge: cat.type === 'income' ? 'Pemasukan' : 'Pengeluaran',
      });
    }
  }

  for (const tx of financeStore.transactions) {
    if (!tx.category) continue;
    if (typeFilter.value !== 'all' && tx.type !== typeFilter.value) continue;
    if (!seen.has(tx.category)) {
      seen.add(tx.category);
      items.push({
        value: tx.category,
        label: tx.category,
        badge:
          tx.type === 'income'
            ? 'Pemasukan'
            : tx.type === 'transfer'
            ? 'Transfer'
            : 'Pengeluaran',
      });
    }
  }

  return items;
});

const walletFilterOptions = computed<SelectOptionItem[]>(() => [
  { value: 'all', label: 'Semua Sumber Dana' },
  ...financeStore.wallets.map((w) => ({
    value: w.id,
    label: w.name,
  })),
]);

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

const activeFilterCount = computed(() => {
  let count = 0;
  if (typeFilter.value !== 'all') count++;
  if (selectedCategoryFilter.value !== 'all') count++;
  if (selectedWalletId.value !== 'all') count++;
  if (selectedHolderFilter.value !== 'all') count++;
  return count;
});

const activePeriodLabel = computed(() => {
  if (financeStore.selectedPeriod === 'all') return 'Semua Periode';
  return formatPeriodLabel(
    financeStore.selectedPeriod,
    locale.value === 'id' ? 'id-ID' : 'en-US'
  );
});

function resetFilters() {
  financeStore.selectedPeriod = financeStore.currentMonthKey;
  typeFilter.value = 'all';
  selectedCategoryFilter.value = 'all';
  selectedWalletId.value = 'all';
  selectedHolderFilter.value = 'all';
}

const filteredTransactions = computed(() => {
  return financeStore.periodTransactions.filter((tx) => {
    if (typeFilter.value !== 'all' && tx.type !== typeFilter.value) {
      return false;
    }
    if (
      selectedCategoryFilter.value !== 'all' &&
      tx.category !== selectedCategoryFilter.value
    ) {
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

function getDateBadge(dateStr: string) {
  return formatTransactionDateBadge(dateStr, locale.value === 'id' ? 'id-ID' : 'en-US');
}
</script>

<template>
  <div class="w-full max-w-full space-y-4 sm:space-y-6 overflow-x-hidden">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full">
      <div class="min-w-0 flex-1">
        <h1 class="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          {{ t('transactions.title') }}
        </h1>
        <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Catat dan pantau seluruh arus kas secara cepat. Ketuk transaksi untuk melihat detail atau mengubah data.
        </p>
      </div>

      <button
        type="button"
        class="w-full sm:w-auto h-[46px] min-h-[46px] px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-colors shrink-0 shadow-xs"
        @click="financeStore.openAddTransactionModal()"
      >
        <Plus class="w-4 h-4 shrink-0" />
        <span>{{ t('dashboard.addTransaction') }}</span>
      </button>
    </div>

    <!-- Search & Single Filter Button Bar -->
    <div class="w-full rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 sm:p-4 space-y-3">
      <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full">
        <!-- Search Input -->
        <div class="flex-1 w-full min-w-0 h-[46px] min-h-[46px] px-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950 flex items-center gap-3 focus-within:border-emerald-600 transition-colors">
          <Search class="w-4 h-4 text-slate-400 shrink-0" />
          <input
            v-model="searchQuery"
            type="text"
            :placeholder="t('transactions.searchPlaceholder')"
            class="flex-1 w-full min-w-0 bg-transparent border-0 text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
          />
          <button
            v-if="searchQuery"
            type="button"
            class="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0 transition-colors"
            title="Bersihkan pencarian"
            @click="searchQuery = ''"
          >
            <X class="w-4 h-4" />
          </button>
        </div>

        <!-- Unified Filter Modal Trigger Button (Harmonized across mobile & desktop) -->
        <button
          type="button"
          class="w-full sm:w-auto h-[46px] min-h-[46px] px-4 rounded-xl border text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-colors shrink-0 whitespace-nowrap"
          :class="
            activeFilterCount > 0
              ? 'border-emerald-600/80 bg-emerald-50/80 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100/70'
              : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950 hover:border-emerald-600 text-slate-700 dark:text-slate-200'
          "
          @click="showFilterModal = true"
        >
          <SlidersHorizontal class="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>Filter Transaksi</span>
          <span
            class="px-2 py-0.5 rounded-md text-[11px] font-bold"
            :class="
              activeFilterCount > 0
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
            "
          >
            {{ activeFilterCount > 0 ? `${activePeriodLabel} +${activeFilterCount}` : activePeriodLabel }}
          </span>
        </button>
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
          v-if="activeFilterCount > 0 || financeStore.selectedPeriod !== 'all'"
          type="button"
          class="min-h-[42px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-emerald-600 transition-colors"
          @click="
            financeStore.selectedPeriod = 'all';
            typeFilter = 'all';
            selectedCategoryFilter = 'all';
            selectedWalletId = 'all';
            selectedHolderFilter = 'all';
          "
        >
          Reset Semua Filter ({{ financeStore.transactions.length }})
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

    <!-- =================================================================== -->
    <!-- MODAL: Filter Riwayat Transaksi (Bulan, Jenis, Kategori, Sumber, Kepemilikan) -->
    <!-- =================================================================== -->
    <AppModal
      v-model="showFilterModal"
      title="Filter Riwayat Transaksi"
    >
      <div class="space-y-3.5">
        <CustomSelect
          v-model="financeStore.selectedPeriod"
          :options="periodFilterOptions"
          placeholder="Periode Bulan"
          aria-label="Pilih Periode Bulan"
        />

        <CustomSelect
          v-model="typeFilter"
          :options="typeFilterOptions"
          placeholder="Jenis Transaksi"
          aria-label="Filter Jenis Transaksi"
          @change="selectedCategoryFilter = 'all'"
        />

        <CustomSelect
          v-model="selectedCategoryFilter"
          :options="categoryFilterOptions"
          searchable
          search-placeholder="Ketik untuk mencari kategori..."
          placeholder="Kategori Transaksi"
          aria-label="Filter Kategori Transaksi"
        />

        <CustomSelect
          v-model="selectedWalletId"
          :options="walletFilterOptions"
          searchable
          search-placeholder="Ketik untuk mencari sumber dana..."
          placeholder="Sumber Dana"
          aria-label="Filter Sumber Dana"
        />

        <CustomSelect
          v-model="selectedHolderFilter"
          :options="holderFilterOptions"
          searchable
          search-placeholder="Ketik untuk mencari kepemilikan..."
          placeholder="Kepemilikan Dana"
          aria-label="Filter Kepemilikan Dana"
        />
      </div>

      <template #footer>
        <div class="flex items-center justify-between gap-2.5 w-full">
          <button
            type="button"
            class="min-h-[46px] px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors shrink-0"
            @click="resetFilters"
          >
            <RotateCcw class="w-4 h-4 shrink-0" />
            <span>Reset</span>
          </button>

          <button
            type="button"
            class="flex-1 sm:flex-initial min-h-[46px] px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-colors shadow-xs"
            @click="showFilterModal = false"
          >
            <Check class="w-4 h-4 shrink-0" />
            <span>Terapkan ({{ filteredTransactions.length }})</span>
          </button>
        </div>
      </template>
    </AppModal>
  </div>
</template>
