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
import { useFinanceStore, formatHolderName, formatPeriodLabel } from '../stores/finance';
import { useThemeStore } from '../stores/theme';
import { useAuthStore } from '../stores/auth';

const { t, locale } = useI18n();
const financeStore = useFinanceStore();
const themeStore = useThemeStore();
const authStore = useAuthStore();

const recentTransactions = computed(() => financeStore.periodTransactions.slice(0, 8));

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
</script>

<template>
  <div class="space-y-7">
    <!-- Top Greeting, Active Period Filter & Quick Actions -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl sm:text-3xl font-display italic text-slate-900 dark:text-slate-100">
          Halo, {{ authStore.user?.displayName || authStore.user?.username }}
        </h1>
        <div class="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          <span>{{ t('app.tagline') }}</span>
          <span aria-hidden="true">·</span>
          <span class="font-mono text-emerald-600 dark:text-emerald-400">
            @{{ authStore.user?.username }}
          </span>
          <span aria-hidden="true">·</span>
          <span>{{ financeStore.daysRemainingInMonth }} {{ t('app.daysRemaining') }}</span>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2.5">
        <!-- Period Selector (Synced with real Firestore transaction months) -->
        <div class="relative flex items-center">
          <Calendar class="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 absolute left-3 pointer-events-none" />
          <select
            v-model="financeStore.selectedPeriod"
            aria-label="Pilih Periode Bulan"
            class="min-h-[44px] pl-8 pr-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-600"
          >
            <option value="all">Semua Periode ({{ financeStore.transactions.length }} Transaksi)</option>
            <option
              v-for="p in financeStore.availablePeriods"
              :key="p"
              :value="p"
            >
              {{ formatPeriodLabel(p, locale === 'id' ? 'id-ID' : 'en-US') }}
            </option>
          </select>
        </div>

        <RouterLink
          v-if="authStore.isSuperAdmin"
          to="/control-panel"
          class="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:border-emerald-600 flex items-center gap-2 transition-colors whitespace-nowrap"
        >
          <ShieldAlert class="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span>{{ t('nav.controlPanel') }}</span>
        </RouterLink>

        <button
          type="button"
          class="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
          @click="financeStore.quickModalOpen = true"
        >
          <Plus class="w-4 h-4" />
          <span>{{ t('dashboard.addTransaction') }}</span>
        </button>
      </div>
    </div>

    <!-- Primary Focal Anchor: Sisa Uang Aktif & Cashflow Summary -->
    <section
      class="rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-7"
    >
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        <!-- Dominant Sisa Uang Metric -->
        <div class="lg:col-span-7 space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>{{ t('app.sisaUangLabel') }} (Total Saldo Sumber Dana)</span>
            <span class="font-mono text-slate-600 dark:text-slate-300">
              Periode Arus Kas: {{ activePeriodLabel }}
            </span>
          </div>
          <div
            class="text-3xl sm:text-4xl font-mono font-bold tabular-nums tracking-tight text-slate-900 dark:text-slate-100"
          >
            {{ themeStore.formatMoney(financeStore.sisaUangBulanIni) }}
          </div>

          <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
            <span>
              {{ t('app.safeDailySpend') }}:
              <strong class="font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                {{ themeStore.formatMoney(financeStore.safeDailySpend) }}/hari
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Rasio Tabungan ({{ activePeriodLabel }}):
              <strong class="font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {{ financeStore.savingsRate }}%
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Selisih Periode:
              <strong
                class="font-mono tabular-nums"
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
              <span class="font-mono tabular-nums">{{ budgetUtilizationPercent }}% terpakai</span>
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
          <div v-else class="pt-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>
              {{ financeStore.wallets.length }} sumber dana ·
              {{ financeStore.walletOwners.length }} kepemilikan ·
              {{ financeStore.periodTransactions.length }} transaksi pada {{ activePeriodLabel }}
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
          class="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3 pt-4 lg:pt-0 border-t lg:border-t-0 lg:border-l border-slate-100 dark:border-slate-800 lg:pl-6"
        >
          <div class="flex items-center justify-between">
            <span class="text-xs text-slate-500 dark:text-slate-400">
              {{ t('dashboard.totalBalance') }}
            </span>
            <span class="text-sm font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {{ themeStore.formatMoney(financeStore.totalBalance) }}
            </span>
          </div>

          <div class="flex items-center justify-between">
            <span class="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <ArrowDownLeft class="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              {{ t('dashboard.monthlyIncome') }} ({{ activePeriodLabel }})
            </span>
            <span class="text-sm font-mono font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
              +{{ themeStore.formatMoney(financeStore.monthlyIncome) }}
            </span>
          </div>

          <div class="flex items-center justify-between">
            <span class="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <ArrowUpRight class="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
              {{ t('dashboard.monthlyExpense') }} ({{ activePeriodLabel }})
            </span>
            <span class="text-sm font-mono font-semibold tabular-nums text-rose-600 dark:text-rose-400">
              -{{ themeStore.formatMoney(financeStore.monthlyExpense) }}
            </span>
          </div>

          <div v-if="financeStore.monthlyTransfer > 0" class="flex items-center justify-between">
            <span class="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <ArrowLeftRight class="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              Transfer Antar Dana ({{ activePeriodLabel }})
            </span>
            <span class="text-sm font-mono font-semibold tabular-nums text-indigo-600 dark:text-indigo-400">
              ⇄ {{ themeStore.formatMoney(financeStore.monthlyTransfer) }}
            </span>
          </div>
        </div>
      </div>
    </section>

    <!-- Ringkasan Kepemilikan Sumber Dana (Konsep Kepemilikan Dana SisaUang) -->
    <section v-if="financeStore.ownershipSummary.length > 0" class="space-y-3">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <Users class="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <h2 class="text-base font-semibold text-slate-900 dark:text-slate-100">
            Alokasi Kepemilikan Dana
          </h2>
        </div>
        <RouterLink
          to="/wallets"
          class="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
        >
          <span>Ubah Nama / Saldo Kepemilikan</span>
          <ChevronRight class="w-3.5 h-3.5" />
        </RouterLink>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div
          v-for="owner in financeStore.ownershipSummary"
          :key="owner.rawHolderName"
          class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2"
        >
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold text-slate-800 dark:text-slate-200">
              {{ owner.displayHolderName }}
            </span>
            <span class="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
              {{ owner.walletCount }} sumber dana
            </span>
          </div>
          <div class="text-lg font-mono font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
            {{ themeStore.formatMoney(owner.totalBalance) }}
          </div>
          <div class="text-[11px] text-slate-500 dark:text-slate-400 truncate">
            {{ owner.wallets.map((w) => `${w.walletName} (${themeStore.formatMoney(w.balance)})`).join(' · ') }}
          </div>
        </div>
      </div>
    </section>

    <!-- Wallets Grid -->
    <section class="space-y-3">
      <div class="flex items-center justify-between">
        <h2 class="text-base font-semibold text-slate-900 dark:text-slate-100">
          {{ t('dashboard.walletOverview') }} ({{ financeStore.wallets.length }})
        </h2>
        <RouterLink
          to="/wallets"
          class="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
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
          class="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold"
        >
          <Plus class="w-4 h-4" />
          <span>Tambah Sumber Dana Pertama</span>
        </RouterLink>
      </div>

      <div v-else class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div
          v-for="wallet in financeStore.wallets"
          :key="wallet.id"
          class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2"
        >
          <div class="flex items-center justify-between">
            <span class="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">
              {{ t(`wallets.${wallet.type}`) }}
            </span>
            <Wallet class="w-4 h-4 text-slate-400 shrink-0" />
          </div>
          <div class="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
            {{ wallet.name }}
          </div>
          <div class="text-base font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {{ themeStore.formatMoney(wallet.balance) }}
          </div>
          <div class="text-[11px] text-slate-500 dark:text-slate-400 truncate">
            Pemilik:
            {{
              financeStore
                .getHoldersByWalletId(wallet.id)
                .map((h) => `${formatHolderName(h.holderName)} (${themeStore.formatMoney(h.balance)})`)
                .join(', ') || 'Pribadi'
            }}
          </div>
        </div>
      </div>
    </section>

    <!-- Two-Column Layout: Recent Transactions & Budget / Top Expense Summary -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <!-- Left: Recent Transactions List -->
      <section class="lg:col-span-7 space-y-3">
        <div class="flex items-center justify-between">
          <h2 class="text-base font-semibold text-slate-900 dark:text-slate-100">
            {{ t('dashboard.recentTransactions') }} ({{ activePeriodLabel }})
          </h2>
          <RouterLink
            to="/transactions"
            class="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
          >
            <span>{{ t('dashboard.viewAll') }} ({{ financeStore.periodTransactions.length }})</span>
            <ChevronRight class="w-3.5 h-3.5" />
          </RouterLink>
        </div>

        <div
          class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800/80"
        >
          <div
            v-if="recentTransactions.length === 0"
            class="p-8 text-center space-y-3"
          >
            <p class="text-xs text-slate-500 dark:text-slate-400">
              {{ t('dashboard.noTransactions') }} pada periode {{ activePeriodLabel }}.
            </p>
            <div class="flex items-center justify-center gap-2">
              <button
                v-if="financeStore.selectedPeriod !== 'all' && financeStore.transactions.length > 0"
                type="button"
                class="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200"
                @click="financeStore.selectedPeriod = 'all'"
              >
                Lihat Semua Periode ({{ financeStore.transactions.length }})
              </button>
              <button
                type="button"
                class="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold"
                @click="financeStore.quickModalOpen = true"
              >
                {{ t('dashboard.addTransaction') }}
              </button>
            </div>
          </div>

          <div
            v-for="tx in recentTransactions"
            :key="tx.id"
            class="min-h-[64px] px-4 py-3 flex items-center justify-between gap-3 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
          >
            <div class="flex items-center gap-3 min-w-0">
              <div
                class="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
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
                <!-- Clean unboxed metadata with typographic separators -->
                <div class="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 truncate">
                  <span>{{ tx.category }}</span>
                  <span aria-hidden="true">·</span>
                  <span v-if="tx.type === 'transfer'">
                    {{ tx.walletName }} ({{ tx.fundOwnerName }}) → {{ tx.toWalletName }} ({{ tx.toFundOwnerName }})
                  </span>
                  <span v-else>
                    {{ tx.walletName }} ({{ tx.fundOwnerName }})
                  </span>
                  <span aria-hidden="true">·</span>
                  <span class="font-mono tabular-nums">{{ tx.date }}</span>
                </div>
              </div>
            </div>

            <div class="flex items-center gap-2 shrink-0">
              <span
                class="text-sm font-mono font-semibold tabular-nums"
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
                class="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                :title="t('transactions.delete')"
                @click="financeStore.removeTransaction(tx.id)"
              >
                <Trash2 class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- Right: Category Budget Health -->
      <section class="lg:col-span-5 space-y-3">
        <div class="flex items-center justify-between">
          <h2 class="text-base font-semibold text-slate-900 dark:text-slate-100">
            {{ t('dashboard.budgetHealth') }}
          </h2>
          <RouterLink
            to="/budgets"
            class="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
          >
            <span>Atur Anggaran & Kategori ({{ financeStore.categories.length }})</span>
            <ChevronRight class="w-3.5 h-3.5" />
          </RouterLink>
        </div>

        <div
          class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4"
        >
          <div
            v-if="financeStore.enrichedBudgets.length === 0"
            class="py-6 text-center space-y-3"
          >
            <p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Belum ada batas anggaran bulanan yang ditetapkan di Firestore. Tersedia
              <strong>{{ financeStore.categories.length }} kategori</strong> dari database untuk mulai menyusun anggaran.
            </p>
            <RouterLink
              to="/budgets"
              class="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors"
            >
              <Plus class="w-4 h-4" />
              <span>Buat Anggaran Kategori</span>
            </RouterLink>
          </div>

          <div
            v-for="b in financeStore.enrichedBudgets"
            :key="b.id"
            class="space-y-1.5"
          >
            <div class="flex items-center justify-between text-xs">
              <span class="font-medium text-slate-800 dark:text-slate-200">
                {{ b.category }}
              </span>
              <span class="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {{ t('budgets.remaining') }}:
                <strong class="text-slate-900 dark:text-slate-100">
                  {{ themeStore.formatMoney(b.remaining) }}
                </strong>
              </span>
            </div>

            <div class="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
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

            <div class="flex items-center justify-between text-[11px] text-slate-400 font-mono tabular-nums">
              <span>Terpakai {{ themeStore.formatMoney(b.spentAmount) }}</span>
              <span>Batas {{ themeStore.formatMoney(b.limitAmount) }} ({{ b.percentage }}%)</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
