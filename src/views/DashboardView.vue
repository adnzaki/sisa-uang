<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
  Wallet,
  ShieldAlert,
  ChevronRight,
  Trash2,
  Calendar,
  Users,
} from 'lucide-vue-next';
import {
  useFinanceStore,
  formatHolderName,
  formatPeriodLabel,
  formatTransactionDateBadge,
} from '../stores/finance';
import { useThemeStore } from '../stores/theme';
import { useAuthStore } from '../stores/auth';
import CustomSelect, { type SelectOptionItem } from '../components/CustomSelect.vue';

const { t, locale } = useI18n();
const financeStore = useFinanceStore();
const themeStore = useThemeStore();
const authStore = useAuthStore();

const recentTransactions = computed(() => financeStore.periodTransactions.slice(0, 8));

const periodOptions = computed<SelectOptionItem[]>(() => [
  {
    value: 'all',
    label: `Semua Periode (${financeStore.transactions.length} Transaksi)`,
  },
  ...financeStore.availablePeriods.map((p) => ({
    value: p,
    label: formatPeriodLabel(p, locale.value === 'id' ? 'id-ID' : 'en-US'),
  })),
]);

const budgetUtilizationPercent = computed(() => {
  if (financeStore.totalBudgetLimit <= 0) return 0;
  return Math.min(
    100,
    Math.round((financeStore.monthlyExpense / financeStore.totalBudgetLimit) * 100)
  );
});

const activePeriodLabel = computed(() =>
  formatPeriodLabel(financeStore.selectedPeriod, locale.value === 'id' ? 'id-ID' : 'en-US')
);

function getDateBadge(dateStr: string) {
  return formatTransactionDateBadge(dateStr, locale.value === 'id' ? 'id-ID' : 'en-US');
}
</script>

<template>
  <div class="space-y-5 sm:space-y-7 max-w-full overflow-x-hidden">
    <!-- Top Greeting, Active Period Filter & Quick Actions -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-3">
      <div class="min-w-0">
        <h1 class="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 truncate">
          Halo, {{ authStore.user?.displayName || authStore.user?.username }}
        </h1>
        <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          <span>{{ t('app.tagline') }}</span>
          <span aria-hidden="true">·</span>
          <span class="font-mono text-emerald-600 dark:text-emerald-400">
            @{{ authStore.user?.username }}
          </span>
          <span aria-hidden="true">·</span>
          <span>{{ financeStore.daysRemainingInMonth }} {{ t('app.daysRemaining') }}</span>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2">
        <!-- Period Selector (CustomSelect synced with real Firestore transaction months) -->
        <div class="w-full sm:w-64">
          <CustomSelect
            v-model="financeStore.selectedPeriod"
            :options="periodOptions"
            aria-label="Pilih Periode Bulan"
          >
            <template #icon>
              <Calendar class="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            </template>
          </CustomSelect>
        </div>

        <RouterLink
          v-if="authStore.isSuperAdmin"
          to="/control-panel"
          class="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:border-emerald-600 flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
        >
          <ShieldAlert class="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>{{ t('nav.controlPanel') }}</span>
        </RouterLink>
      </div>
    </div>

    <!-- Primary Focal Anchor: Sisa Uang Aktif & Cashflow Summary -->
    <section
      class="rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-7"
    >
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-center">
        <!-- Dominant Sisa Uang Metric -->
        <div class="lg:col-span-7 space-y-3.5">
          <div class="flex flex-wrap items-center justify-between gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>{{ t('app.sisaUangLabel') }} (Total Saldo Sumber Dana)</span>
            <span class="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
              Periode: {{ activePeriodLabel }}
            </span>
          </div>
          <div
            class="text-2xl sm:text-4xl font-money font-bold tracking-tight text-slate-900 dark:text-slate-100 truncate"
          >
            {{ themeStore.formatMoney(financeStore.sisaUangBulanIni) }}
          </div>

          <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
            <span>
              {{ t('app.safeDailySpend') }}:
              <strong class="font-money text-emerald-600 dark:text-emerald-400">
                {{ themeStore.formatMoney(financeStore.safeDailySpend) }}/hari
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Rasio Tabungan:
              <strong class="font-money text-slate-900 dark:text-slate-100">
                {{ financeStore.savingsRate }}%
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Selisih Periode:
              <strong
                class="font-money"
                :class="
                  financeStore.periodNetCashflow >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                "
              >
                {{ financeStore.periodNetCashflow >= 0 ? '+' : '' }}{{ themeStore.formatMoney(financeStore.periodNetCashflow) }}
              </strong>
            </span>
          </div>

          <!-- Clean Utilization Progress Bar -->
          <div v-if="financeStore.totalBudgetLimit > 0" class="space-y-1.5 pt-1">
            <div class="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Serapan Anggaran ({{ activePeriodLabel }})</span>
              <span class="font-money">{{ budgetUtilizationPercent }}% terpakai</span>
            </div>
            <div class="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                class="h-full rounded-full transition-all duration-200"
                :class="
                  budgetUtilizationPercent > 85
                    ? 'bg-rose-600'
                    : budgetUtilizationPercent > 65
                    ? 'bg-amber-500'
                    : 'bg-emerald-600'
                "
                :style="{ width: `${budgetUtilizationPercent}%` }"
              ></div>
            </div>
          </div>
          <div v-else class="pt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>
              {{ financeStore.wallets.length }} sumber dana ·
              {{ financeStore.walletOwners.length }} kepemilikan ·
              {{ financeStore.periodTransactions.length }} transaksi
            </span>
            <RouterLink
              to="/budgets"
              class="text-emerald-600 dark:text-emerald-400 font-semibold hover:underline"
            >
              Atur Anggaran →
            </RouterLink>
          </div>
        </div>

        <!-- Secondary Cashflow & Net Worth Breakdown -->
        <div
          class="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2.5 pt-4 lg:pt-0 border-t lg:border-t-0 lg:border-l border-slate-100 dark:border-slate-800 lg:pl-6"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs text-slate-500 dark:text-slate-400 truncate">
              {{ t('dashboard.totalBalance') }}
            </span>
            <span class="text-sm font-money font-bold text-slate-900 dark:text-slate-100 shrink-0">
              {{ themeStore.formatMoney(financeStore.totalBalance) }}
            </span>
          </div>

          <div class="flex items-center justify-between gap-2">
            <span class="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 truncate">
              <ArrowDownLeft class="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span class="truncate">{{ t('dashboard.monthlyIncome') }}</span>
            </span>
            <span class="text-sm font-money font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
              +{{ themeStore.formatMoney(financeStore.monthlyIncome) }}
            </span>
          </div>

          <div class="flex items-center justify-between gap-2">
            <span class="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 truncate">
              <ArrowUpRight class="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
              <span class="truncate">{{ t('dashboard.monthlyExpense') }}</span>
            </span>
            <span class="text-sm font-money font-bold text-rose-600 dark:text-rose-400 shrink-0">
              -{{ themeStore.formatMoney(financeStore.monthlyExpense) }}
            </span>
          </div>

          <div v-if="financeStore.monthlyTransfer > 0" class="flex items-center justify-between gap-2">
            <span class="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 truncate">
              <ArrowLeftRight class="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <span class="truncate">Transfer Antar Dana</span>
            </span>
            <span class="text-sm font-money font-bold text-indigo-600 dark:text-indigo-400 shrink-0">
              ⇄ {{ themeStore.formatMoney(financeStore.monthlyTransfer) }}
            </span>
          </div>
        </div>
      </div>
    </section>

    <!-- Ringkasan Kepemilikan Sumber Dana (Touchable Cards) -->
    <section v-if="financeStore.ownershipSummary.length > 0" class="space-y-3">
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2 min-w-0">
          <Users class="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <h2 class="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
            Alokasi Kepemilikan Dana
          </h2>
        </div>
        <RouterLink
          to="/ownership"
          class="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-0.5 shrink-0"
        >
          <span>Kelola</span>
          <ChevronRight class="w-3.5 h-3.5" />
        </RouterLink>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <RouterLink
          v-for="owner in financeStore.ownershipSummary"
          :key="owner.rawHolderName"
          to="/ownership"
          class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2 hover:border-emerald-500/50 active:scale-[0.99] transition-all block"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
              {{ owner.displayHolderName }}
            </span>
            <span class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 shrink-0">
              {{ owner.walletCount }} sumber
            </span>
          </div>
          <div class="text-lg font-money font-bold text-emerald-600 dark:text-emerald-400 truncate">
            {{ themeStore.formatMoney(owner.totalBalance) }}
          </div>
          <div class="text-xs text-slate-500 dark:text-slate-400 truncate font-money">
            {{ owner.wallets.map((w) => `${w.walletName}: ${themeStore.formatMoney(w.balance)}`).join(' · ') }}
          </div>
        </RouterLink>
      </div>
    </section>

    <!-- Wallets Grid (Touchable Cards) -->
    <section class="space-y-3">
      <div class="flex items-center justify-between gap-2">
        <h2 class="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
          {{ t('dashboard.walletOverview') }} ({{ financeStore.wallets.length }})
        </h2>
        <RouterLink
          to="/wallets"
          class="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-0.5 shrink-0"
        >
          <span>Kelola Sumber Dana</span>
          <ChevronRight class="w-3.5 h-3.5" />
        </RouterLink>
      </div>

      <div
        v-if="financeStore.wallets.length === 0"
        class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center space-y-3"
      >
        <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
          Belum ada sumber dana pada akun ini di database Firestore.
        </p>
        <RouterLink
          to="/wallets"
          class="inline-flex items-center gap-1.5 min-h-[42px] px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold"
        >
          <Plus class="w-4 h-4" />
          <span>Tambah Sumber Dana Pertama</span>
        </RouterLink>
      </div>

      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <RouterLink
          v-for="wallet in financeStore.wallets"
          :key="wallet.id"
          to="/wallets"
          class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2 hover:border-emerald-500/50 active:scale-[0.99] transition-all block"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">
              {{ t(`wallets.${wallet.type}`) }}
            </span>
            <Wallet class="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          </div>
          <div class="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 truncate">
            {{ wallet.name }}
          </div>
          <div class="text-base sm:text-lg font-money font-bold text-emerald-600 dark:text-emerald-400 truncate">
            {{ themeStore.formatMoney(wallet.balance) }}
          </div>
          <div class="text-xs text-slate-500 dark:text-slate-400 truncate">
            Pemilik:
            <span class="font-money">
              {{
                financeStore
                  .getHoldersByWalletId(wallet.id)
                  .map((h) => `${formatHolderName(h.holderName)} (${themeStore.formatMoney(h.balance)})`)
                  .join(', ') || 'Pribadi'
              }}
            </span>
          </div>
        </RouterLink>
      </div>
    </section>

    <!-- Two-Column Layout: Recent Transactions & Budget / Top Expense Summary -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <!-- Left: Recent Transactions List (Tap any card to View/Edit, enlarged Delete button on right) -->
      <section class="lg:col-span-7 space-y-3">
        <div class="flex items-center justify-between gap-2">
          <h2 class="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
            {{ t('dashboard.recentTransactions') }} ({{ activePeriodLabel }})
          </h2>
          <RouterLink
            to="/transactions"
            class="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-0.5 shrink-0"
          >
            <span>{{ t('dashboard.viewAll') }} ({{ financeStore.periodTransactions.length }})</span>
            <ChevronRight class="w-3.5 h-3.5" />
          </RouterLink>
        </div>

        <div
          v-if="recentTransactions.length === 0"
          class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center space-y-3"
        >
          <p class="text-xs text-slate-500 dark:text-slate-400">
            {{ t('dashboard.noTransactions') }} pada periode {{ activePeriodLabel }}.
          </p>
          <div class="flex flex-wrap items-center justify-center gap-2">
            <button
              v-if="financeStore.selectedPeriod !== 'all' && financeStore.transactions.length > 0"
              type="button"
              class="min-h-[42px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200"
              @click="financeStore.selectedPeriod = 'all'"
            >
              Lihat Semua Periode ({{ financeStore.transactions.length }})
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

        <div v-else class="space-y-2.5">
          <div
            v-for="tx in recentTransactions"
            :key="tx.id"
            role="button"
            tabindex="0"
            class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 flex items-center justify-between gap-3 hover:border-emerald-500/50 active:scale-[0.995] transition-all cursor-pointer"
            @click="financeStore.openEditTransactionModal(tx)"
            @keydown.enter="financeStore.openEditTransactionModal(tx)"
          >
            <div class="flex items-center gap-3 min-w-0 flex-1">
              <!-- Date Badge Box -->
              <div
                class="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl flex flex-col items-center justify-center shrink-0 border"
                :class="
                  tx.type === 'income'
                    ? 'bg-emerald-50/90 dark:bg-emerald-950/40 border-emerald-200/60 dark:border-emerald-900/50 text-emerald-600 dark:text-emerald-400'
                    : tx.type === 'transfer'
                    ? 'bg-indigo-50/90 dark:bg-indigo-950/40 border-indigo-200/60 dark:border-indigo-900/50 text-indigo-600 dark:text-indigo-400'
                    : 'bg-rose-50/90 dark:bg-rose-950/40 border-rose-200/60 dark:border-rose-900/50 text-rose-600 dark:text-rose-400'
                "
              >
                <span class="text-sm sm:text-base font-bold font-money leading-none">
                  {{ getDateBadge(tx.date).day }}
                </span>
                <span class="text-[10px] font-semibold leading-tight mt-1 text-center px-0.5 truncate max-w-full">
                  {{ getDateBadge(tx.date).monthYear }}
                </span>
              </div>

              <div class="min-w-0 flex-1">
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

                <div class="text-sm font-bold text-slate-900 dark:text-slate-100 truncate mt-1">
                  {{ tx.note }}
                </div>

                <div class="flex flex-wrap items-center gap-2 mt-0.5">
                  <span
                    class="text-sm font-money font-bold"
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
      </section>

      <!-- Right: Category Budget Health -->
      <section class="lg:col-span-5 space-y-3">
        <div class="flex items-center justify-between gap-2">
          <h2 class="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
            {{ t('dashboard.budgetHealth') }}
          </h2>
          <RouterLink
            to="/budgets"
            class="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-0.5 shrink-0"
          >
            <span>Atur Anggaran</span>
            <ChevronRight class="w-3.5 h-3.5" />
          </RouterLink>
        </div>

        <div
          class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-3.5"
        >
          <div
            v-if="financeStore.enrichedBudgets.length === 0"
            class="py-6 text-center space-y-3"
          >
            <p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Belum ada batas anggaran bulanan yang ditetapkan. Tersedia
              <strong>{{ financeStore.categories.length }} kategori</strong> untuk mulai menyusun anggaran.
            </p>
            <RouterLink
              to="/budgets"
              class="inline-flex items-center gap-1.5 min-h-[42px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors"
            >
              <Plus class="w-4 h-4" />
              <span>Buat Anggaran Kategori</span>
            </RouterLink>
          </div>

          <RouterLink
            v-for="b in financeStore.enrichedBudgets"
            :key="b.id"
            to="/budgets"
            class="block rounded-xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-950/40 p-3 space-y-1.5 hover:border-emerald-500/40 transition-colors"
          >
            <div class="flex items-center justify-between gap-2 text-xs">
              <span class="font-bold text-slate-800 dark:text-slate-200 truncate">
                {{ b.category }}
              </span>
              <span class="font-money text-slate-500 dark:text-slate-400 shrink-0">
                {{ t('budgets.remaining') }}:
                <strong class="text-slate-900 dark:text-slate-100">
                  {{ themeStore.formatMoney(b.remaining) }}
                </strong>
              </span>
            </div>

            <div class="h-2 w-full rounded-full bg-slate-200/70 dark:bg-slate-800 overflow-hidden">
              <div
                class="h-full rounded-full transition-all duration-200"
                :class="
                  b.percentage >= 90
                    ? 'bg-rose-600'
                    : b.percentage >= 70
                    ? 'bg-amber-500'
                    : 'bg-emerald-600'
                "
                :style="{ width: `${b.percentage}%` }"
              ></div>
            </div>

            <div class="flex items-center justify-between text-[11px] text-slate-400 font-money">
              <span>Terpakai {{ themeStore.formatMoney(b.spentAmount) }}</span>
              <span>Batas {{ themeStore.formatMoney(b.limitAmount) }} ({{ b.percentage }}%)</span>
            </div>
          </RouterLink>
        </div>
      </section>
    </div>
  </div>
</template>
