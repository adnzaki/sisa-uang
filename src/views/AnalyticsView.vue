<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useFinanceStore, formatPeriodLabel } from '../stores/finance';
import { useThemeStore } from '../stores/theme';
import CustomSelect, { type SelectOptionItem } from '../components/CustomSelect.vue';

const { locale } = useI18n();
const financeStore = useFinanceStore();
const themeStore = useThemeStore();

const periodOptions = computed<SelectOptionItem[]>(() => [
  {
    value: 'all',
    label: `Semua Periode (${financeStore.transactions.length} Transaksi)`,
    badge: 'SEMUA',
  },
  ...financeStore.availablePeriods.map((p) => ({
    value: p,
    label: formatPeriodLabel(p, locale.value === 'id' ? 'id-ID' : 'en-US'),
    badge: p,
  })),
]);

const categoryBreakdown = computed(() => {
  const map = new Map<string, number>();
  for (const tx of financeStore.periodTransactions) {
    if (tx.type === 'expense') {
      map.set(tx.category, (map.get(tx.category) || 0) + Number(tx.amount || 0));
    } else if (tx.type === 'transfer' && Number(tx.adminFee || 0) > 0) {
      map.set('Biaya Admin Transfer', (map.get('Biaya Admin Transfer') || 0) + Number(tx.adminFee || 0));
    }
  }
  const totalExp = Math.max(1, financeStore.monthlyExpense);
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
  for (const tx of financeStore.periodTransactions) {
    if (tx.type === 'income') {
      map.set(tx.category, (map.get(tx.category) || 0) + Number(tx.amount || 0));
    }
  }
  const totalInc = Math.max(1, financeStore.monthlyIncome);
  return Array.from(map.entries())
    .map(([category, amount]) => ({
      category,
      amount,
      share: Math.round((amount / totalInc) * 100),
    }))
    .sort((a, b) => b.amount - a.amount);
});

const walletAllocation = computed(() => {
  const total = Math.max(1, financeStore.totalBalance);
  return financeStore.wallets
    .map((w) => ({
      id: w.id,
      name: w.name,
      type: w.type,
      balance: w.balance,
      share: Math.max(0, Math.round((w.balance / total) * 100)),
    }))
    .sort((a, b) => b.balance - a.balance);
});
</script>

<template>
  <div class="space-y-5 sm:space-y-6 max-w-full overflow-x-hidden">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div class="min-w-0">
        <h1 class="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Analitik Arus Kas & Sisa Uang
        </h1>
        <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Evaluasi struktur pengeluaran, pemasukan, dan distribusi aset lintas sumber dana.
        </p>
      </div>

      <!-- Period Selector (CustomSelect) -->
      <div class="w-full sm:w-64">
        <CustomSelect
          v-model="financeStore.selectedPeriod"
          :options="periodOptions"
          searchable
          search-placeholder="Cari bulan atau tahun..."
          placeholder="Pilih Periode Bulan"
        />
      </div>
    </div>

    <!-- Top Key Ratios -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3.5 sm:gap-4">
      <div class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-1.5 min-w-0">
        <div class="text-xs text-slate-500 dark:text-slate-400">Rasio Sisa Uang (Tabungan)</div>
        <div class="text-xl sm:text-2xl font-money font-bold tabular-nums text-emerald-600 dark:text-emerald-400 truncate">
          {{ financeStore.savingsRate }}%
        </div>
        <div class="text-xs text-slate-500 dark:text-slate-400 truncate">
          Periode {{ formatPeriodLabel(financeStore.selectedPeriod, locale === 'id' ? 'id-ID' : 'en-US') }}
        </div>
      </div>

      <div class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-1.5 min-w-0">
        <div class="text-xs text-slate-500 dark:text-slate-400">Batas Aman Harian</div>
        <div class="text-xl sm:text-2xl font-money font-bold tabular-nums text-slate-900 dark:text-slate-100 truncate">
          {{ themeStore.formatMoney(financeStore.safeDailySpend) }}
        </div>
        <div class="text-xs text-slate-500 dark:text-slate-400 truncate">
          Untuk {{ financeStore.daysRemainingInMonth }} hari ke depan
        </div>
      </div>

      <div class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-1.5 min-w-0">
        <div class="text-xs text-slate-500 dark:text-slate-400">Selisih Kas Bersih</div>
        <div
          class="text-xl sm:text-2xl font-money font-bold tabular-nums truncate"
          :class="
            financeStore.periodNetCashflow >= 0
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-rose-600 dark:text-rose-400'
          "
        >
          {{ themeStore.formatMoney(financeStore.periodNetCashflow) }}
        </div>
        <div class="text-xs text-slate-500 dark:text-slate-400 font-money tabular-nums truncate">
          Masuk {{ themeStore.formatMoney(financeStore.monthlyIncome) }} · Keluar {{ themeStore.formatMoney(financeStore.monthlyExpense) }}
        </div>
      </div>
    </div>

    <!-- Two Column Breakdown -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
      <!-- Category Expense Distribution -->
      <section class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4 min-w-0">
        <div>
          <h2 class="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
            Distribusi Pengeluaran per Kategori
          </h2>
          <p class="text-xs text-slate-500 dark:text-slate-400">
            Proporsi pengeluaran pada {{ formatPeriodLabel(financeStore.selectedPeriod, locale === 'id' ? 'id-ID' : 'en-US') }}
          </p>
        </div>

        <div v-if="categoryBreakdown.length === 0" class="py-8 text-center text-xs text-slate-500">
          Belum ada data pengeluaran pada periode ini.
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
              Persentase penempatan saldo pada masing-masing rekening
            </p>
          </div>

          <div class="space-y-3.5">
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
              Komposisi pemasukan pada {{ formatPeriodLabel(financeStore.selectedPeriod, locale === 'id' ? 'id-ID' : 'en-US') }}
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
