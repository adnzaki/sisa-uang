<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Search,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  Trash2,
  Calendar,
} from 'lucide-vue-next';
import { useFinanceStore, formatPeriodLabel } from '../stores/finance';
import { useThemeStore } from '../stores/theme';

const { t, locale } = useI18n();
const financeStore = useFinanceStore();
const themeStore = useThemeStore();

const typeFilter = ref<'all' | 'income' | 'expense' | 'transfer'>('all');
const searchQuery = ref('');
const selectedWalletId = ref<string>('all');
const selectedHolderFilter = ref<string>('all');

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

const filteredTotalIncome = computed(() =>
  filteredTransactions.value
    .filter((tx) => tx.type === 'income')
    .reduce((acc, tx) => acc + Number(tx.amount || 0), 0)
);

const filteredTotalExpense = computed(() =>
  filteredTransactions.value
    .filter((tx) => tx.type === 'expense')
    .reduce((acc, tx) => acc + Number(tx.amount || 0), 0)
);

const filteredTotalTransfer = computed(() =>
  filteredTransactions.value
    .filter((tx) => tx.type === 'transfer')
    .reduce((acc, tx) => acc + Number(tx.amount || 0), 0)
);
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl sm:text-3xl font-display italic text-slate-900 dark:text-slate-100">
          {{ t('transactions.title') }}
        </h1>
        <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
          Catatan arus kas masuk, keluar, dan transfer antar kepemilikan sumber dana dari database Firestore.
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-2 self-start sm:self-auto">
        <!-- Period Selector -->
        <div class="relative flex items-center">
          <Calendar class="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 absolute left-3 pointer-events-none" />
          <select
            v-model="financeStore.selectedPeriod"
            aria-label="Pilih Periode Bulan"
            class="min-h-[44px] pl-8 pr-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-600"
          >
            <option value="all">Semua Periode ({{ financeStore.transactions.length }})</option>
            <option
              v-for="p in financeStore.availablePeriods"
              :key="p"
              :value="p"
            >
              {{ formatPeriodLabel(p, locale === 'id' ? 'id-ID' : 'en-US') }}
            </option>
          </select>
        </div>

        <button
          type="button"
          class="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
          @click="financeStore.quickModalOpen = true"
        >
          <Plus class="w-4 h-4" />
          <span>{{ t('dashboard.addTransaction') }}</span>
        </button>
      </div>
    </div>

    <!-- Filter Bar & Search -->
    <div class="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
      <!-- Interactive Segmented Filter Tabs (All, Expense, Income, Transfer) -->
      <div class="md:col-span-5 flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/90 rounded-xl overflow-x-auto">
        <button
          type="button"
          class="flex-1 min-h-[38px] px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
          :class="
            typeFilter === 'all'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          "
          @click="typeFilter = 'all'"
        >
          {{ t('transactions.all') }}
        </button>
        <button
          type="button"
          class="flex-1 min-h-[38px] px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
          :class="
            typeFilter === 'expense'
              ? 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          "
          @click="typeFilter = 'expense'"
        >
          {{ t('transactions.expense') }}
        </button>
        <button
          type="button"
          class="flex-1 min-h-[38px] px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
          :class="
            typeFilter === 'income'
              ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          "
          @click="typeFilter = 'income'"
        >
          {{ t('transactions.income') }}
        </button>
        <button
          type="button"
          class="flex-1 min-h-[38px] px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
          :class="
            typeFilter === 'transfer'
              ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          "
          @click="typeFilter = 'transfer'"
        >
          {{ t('transactions.transfer') }}
        </button>
      </div>

      <!-- Wallet Filter -->
      <div class="md:col-span-2">
        <select
          v-model="selectedWalletId"
          class="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-600"
        >
          <option value="all">Semua Sumber Dana</option>
          <option
            v-for="w in financeStore.wallets"
            :key="w.id"
            :value="w.id"
          >
            {{ w.name }}
          </option>
        </select>
      </div>

      <!-- Fund Owner Filter -->
      <div class="md:col-span-2">
        <select
          v-model="selectedHolderFilter"
          class="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-600"
        >
          <option value="all">Semua Pemilik Dana</option>
          <option
            v-for="holderName in uniqueHolderNames"
            :key="holderName"
            :value="holderName"
          >
            {{ holderName }}
          </option>
        </select>
      </div>

      <!-- Search Input -->
      <div class="md:col-span-3 relative">
        <Search class="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          v-model="searchQuery"
          type="text"
          :placeholder="t('transactions.searchPlaceholder')"
          class="w-full min-h-[44px] pl-10 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
        />
      </div>
    </div>

    <!-- Filtered Summary Strip -->
    <div class="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs">
      <div class="text-slate-500 dark:text-slate-400">
        Menampilkan <strong class="font-mono tabular-nums text-slate-900 dark:text-slate-100">{{ filteredTransactions.length }}</strong> transaksi
        ({{ formatPeriodLabel(financeStore.selectedPeriod, locale === 'id' ? 'id-ID' : 'en-US') }})
      </div>
      <div class="flex flex-wrap items-center gap-3 font-mono tabular-nums">
        <span class="text-emerald-600 dark:text-emerald-400">
          Masuk: +{{ themeStore.formatMoney(filteredTotalIncome) }}
        </span>
        <span aria-hidden="true" class="text-slate-300 dark:text-slate-700">·</span>
        <span class="text-rose-600 dark:text-rose-400">
          Keluar: -{{ themeStore.formatMoney(filteredTotalExpense) }}
        </span>
        <template v-if="filteredTotalTransfer > 0">
          <span aria-hidden="true" class="text-slate-300 dark:text-slate-700">·</span>
          <span class="text-indigo-600 dark:text-indigo-400">
            Transfer: ⇄ {{ themeStore.formatMoney(filteredTotalTransfer) }}
          </span>
        </template>
      </div>
    </div>

    <!-- Transaction List -->
    <div
      class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800/80"
    >
      <div
        v-if="filteredTransactions.length === 0"
        class="p-10 text-center space-y-3"
      >
        <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
          Tidak ada transaksi yang cocok dengan filter pencarian atau periode Anda.
        </p>
        <div class="flex items-center justify-center gap-2">
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
            @click="financeStore.quickModalOpen = true"
          >
            {{ t('dashboard.addTransaction') }}
          </button>
        </div>
      </div>

      <div
        v-for="tx in filteredTransactions"
        :key="tx.id"
        class="min-h-[64px] px-4 sm:px-5 py-3.5 flex items-center justify-between gap-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
      >
        <div class="flex items-center gap-3.5 min-w-0">
          <div
            class="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
            :class="
              tx.type === 'income'
                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                : tx.type === 'transfer'
                ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
            "
          >
            <ArrowDownLeft v-if="tx.type === 'income'" class="w-4 h-4" />
            <ArrowLeftRight v-else-if="tx.type === 'transfer'" class="w-4 h-4" />
            <ArrowUpRight v-else class="w-4 h-4" />
          </div>

          <div class="min-w-0">
            <div class="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
              {{ tx.note }}
            </div>
            <!-- Unboxed metadata with separators showing Wallet + Fund Owner (and Transfer target if transfer) -->
            <div class="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              <span>{{ tx.category }}</span>
              <span aria-hidden="true">·</span>
              <span v-if="tx.type === 'transfer'">
                {{ tx.walletName }} ({{ tx.fundOwnerName || 'Pribadi' }}) → {{ tx.toWalletName || tx.walletName }} ({{ tx.toFundOwnerName || 'Pribadi' }})
              </span>
              <span v-else>
                {{ tx.walletName }} ({{ tx.fundOwnerName || 'Pribadi' }})
              </span>
              <span aria-hidden="true">·</span>
              <span class="font-mono tabular-nums">{{ tx.date }}</span>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-3 shrink-0">
          <span
            class="text-sm sm:text-base font-mono font-semibold tabular-nums"
            :class="
              tx.type === 'income'
                ? 'text-emerald-600 dark:text-emerald-400'
                : tx.type === 'transfer'
                ? 'text-indigo-600 dark:text-indigo-400'
                : 'text-slate-900 dark:text-slate-100'
            "
          >
            {{ tx.type === 'income' ? '+' : tx.type === 'transfer' ? '⇄ ' : '-' }}{{ themeStore.formatMoney(tx.amount) }}
          </span>
          <button
            type="button"
            class="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
            :title="t('transactions.delete')"
            @click="financeStore.removeTransaction(tx.id)"
          >
            <Trash2 class="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
