<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { X, ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Check } from 'lucide-vue-next';
import { useFinanceStore, formatHolderName } from '../stores/finance';
import { useThemeStore } from '../stores/theme';

const { t } = useI18n();
const financeStore = useFinanceStore();
const themeStore = useThemeStore();

const txType = ref<'expense' | 'income' | 'transfer'>('expense');
// Step 1: Pilih Sumber Dana (Wallet)
const walletId = ref<string>('');
// Step 2: Pilih Pemilik Dana (Fund Owner)
const fundOwnerId = ref<string>('');

// Transfer Destination (For Transfer Type: Pilih Sumber Dana Tujuan -> Pilih Pemilik Dana Tujuan)
const toWalletId = ref<string>('');
const toFundOwnerId = ref<string>('');

// Step 3: Input Transaksi (Category, Amount, Date, Note)
const amount = ref<number | ''>('');
const category = ref<string>('');
const note = ref<string>('');
const date = ref<string>(new Date().toISOString().slice(0, 10));
const errorMsg = ref<string | null>(null);
const isSubmitting = ref(false);

const categories = computed(() =>
  txType.value === 'expense'
    ? financeStore.expenseCategoryNames
    : financeStore.incomeCategoryNames
);

const availableSourceHolders = computed(() =>
  walletId.value ? financeStore.getHoldersByWalletId(walletId.value) : []
);

const availableDestHolders = computed(() =>
  toWalletId.value ? financeStore.getHoldersByWalletId(toWalletId.value) : []
);

watch(
  () => financeStore.quickModalOpen,
  (isOpen) => {
    if (isOpen) {
      errorMsg.value = null;
      if (!walletId.value && financeStore.wallets.length > 0) {
        walletId.value = financeStore.wallets[0].id;
      }
      const holders = financeStore.getHoldersByWalletId(walletId.value);
      if (holders.length > 0) {
        fundOwnerId.value = holders[0].id;
      }
      if (!toWalletId.value && financeStore.wallets.length > 0) {
        toWalletId.value = financeStore.wallets[0].id;
      }
      const destHolders = financeStore.getHoldersByWalletId(toWalletId.value);
      if (destHolders.length > 1) {
        toFundOwnerId.value = destHolders[1].id;
      } else if (destHolders.length > 0) {
        toFundOwnerId.value = destHolders[0].id;
      }
      category.value = categories.value[0] || 'Lainnya';
    }
  }
);

watch(walletId, (newWalletId) => {
  const holders = financeStore.getHoldersByWalletId(newWalletId);
  fundOwnerId.value = holders[0]?.id || '';
});

watch(toWalletId, (newToWalletId) => {
  const holders = financeStore.getHoldersByWalletId(newToWalletId);
  const diffHolder = holders.find((h) => h.id !== fundOwnerId.value);
  toFundOwnerId.value = diffHolder?.id || holders[0]?.id || '';
});

watch(txType, () => {
  category.value = categories.value[0] || 'Lainnya';
});

function addQuickAmount(val: number) {
  const current = Number(amount.value || 0);
  amount.value = current + val;
}

function closeModal() {
  financeStore.quickModalOpen = false;
}

async function handleSubmit() {
  errorMsg.value = null;
  const numericAmount = Number(amount.value || 0);
  if (numericAmount <= 0) {
    errorMsg.value = 'Masukkan nominal transaksi yang valid (lebih dari 0).';
    return;
  }
  if (!walletId.value) {
    errorMsg.value = 'Langkah 1: Pilih sumber dana terlebih dahulu.';
    return;
  }
  if (availableSourceHolders.value.length > 0 && !fundOwnerId.value) {
    errorMsg.value = 'Langkah 2: Pilih pemilik sumber dana terlebih dahulu.';
    return;
  }

  isSubmitting.value = true;
  try {
    await financeStore.addTransaction({
      walletId: walletId.value,
      fundOwnerId: fundOwnerId.value,
      toWalletId: txType.value === 'transfer' ? toWalletId.value : undefined,
      toFundOwnerId: txType.value === 'transfer' ? toFundOwnerId.value : undefined,
      type: txType.value,
      category: txType.value === 'transfer' ? 'Transfer Dana' : category.value,
      amount: numericAmount,
      note:
        note.value.trim() ||
        (txType.value === 'transfer' ? 'Transfer antar kepemilikan dana' : category.value),
      date: date.value,
    });
    amount.value = '';
    note.value = '';
    financeStore.quickModalOpen = false;
  } catch (err: any) {
    errorMsg.value = err instanceof Error ? err.message : 'Gagal menyimpan transaksi.';
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <div
    v-if="financeStore.quickModalOpen"
    class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4"
    @click.self="closeModal"
  >
    <div
      class="w-full max-w-lg max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-xl transition-transform duration-150"
    >
      <!-- Mobile drag handle -->
      <div class="w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mb-4 sm:hidden"></div>

      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {{ t('dashboard.addTransaction') }}
          </h2>
          <p class="text-xs text-slate-500 dark:text-slate-400">
            Urutan: Pilih Sumber Dana → Pilih Pemilik Dana → Input Transaksi
          </p>
        </div>
        <button
          type="button"
          class="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          @click="closeModal"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- Segmented 3-Way Type Control: Expense | Income | Transfer -->
      <div class="grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-slate-800/90 rounded-xl mb-5">
        <button
          type="button"
          class="min-h-[42px] flex items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap"
          :class="
            txType === 'expense'
              ? 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          "
          @click="txType = 'expense'"
        >
          <ArrowUpRight class="w-4 h-4" />
          <span>{{ t('transactions.expense') }}</span>
        </button>
        <button
          type="button"
          class="min-h-[42px] flex items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap"
          :class="
            txType === 'income'
              ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          "
          @click="txType = 'income'"
        >
          <ArrowDownLeft class="w-4 h-4" />
          <span>{{ t('transactions.income') }}</span>
        </button>
        <button
          type="button"
          class="min-h-[42px] flex items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap"
          :class="
            txType === 'transfer'
              ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          "
          @click="txType = 'transfer'"
        >
          <ArrowLeftRight class="w-4 h-4" />
          <span>{{ t('transactions.transfer') }}</span>
        </button>
      </div>

      <form class="space-y-4" @submit.prevent="handleSubmit">
        <!-- STEP 1 & STEP 2: Pilih Sumber Dana -> Pilih Pemilik Dana -->
        <div class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 p-3.5 space-y-3">
          <div class="text-[11px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            {{ txType === 'transfer' ? 'Asal Dana (Sumber & Kepemilikan)' : 'Langkah 1 & 2 · Sumber & Kepemilikan Dana' }}
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                1. Pilih Sumber Dana (Wallet)
              </label>
              <select
                v-model="walletId"
                class="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
              >
                <option
                  v-for="w in financeStore.wallets"
                  :key="w.id"
                  :value="w.id"
                >
                  {{ w.name }} ({{ themeStore.formatMoney(w.balance) }})
                </option>
              </select>
            </div>

            <div>
              <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                2. Pilih Pemilik Sumber Dana
              </label>
              <select
                v-model="fundOwnerId"
                :disabled="!walletId || availableSourceHolders.length === 0"
                class="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600 disabled:opacity-50"
              >
                <option
                  v-for="holder in availableSourceHolders"
                  :key="holder.id"
                  :value="holder.id"
                >
                  {{ formatHolderName(holder.holderName) }} ({{ themeStore.formatMoney(holder.balance) }})
                </option>
              </select>
            </div>
          </div>
        </div>

        <!-- TRANSFER DESTINATION: Pilih Sumber Dana Tujuan -> Pilih Pemilik Dana Tujuan -->
        <div
          v-if="txType === 'transfer'"
          class="rounded-2xl border border-indigo-200/80 dark:border-indigo-900/50 bg-indigo-50/40 dark:bg-indigo-950/20 p-3.5 space-y-3"
        >
          <div class="text-[11px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
            Tujuan Transfer (Sumber & Kepemilikan Dana Tujuan)
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Sumber Dana Tujuan
              </label>
              <select
                v-model="toWalletId"
                class="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-600"
              >
                <option
                  v-for="w in financeStore.wallets"
                  :key="w.id"
                  :value="w.id"
                >
                  {{ w.name }} ({{ themeStore.formatMoney(w.balance) }})
                </option>
              </select>
            </div>

            <div>
              <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Pemilik Dana Tujuan
              </label>
              <select
                v-model="toFundOwnerId"
                :disabled="!toWalletId || availableDestHolders.length === 0"
                class="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-600 disabled:opacity-50"
              >
                <option
                  v-for="holder in availableDestHolders"
                  :key="holder.id"
                  :value="holder.id"
                >
                  {{ formatHolderName(holder.holderName) }} ({{ themeStore.formatMoney(holder.balance) }})
                </option>
              </select>
            </div>
          </div>
        </div>

        <!-- STEP 3: Input Detail Transaksi -->
        <div class="space-y-3">
          <div>
            <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              3. {{ t('transactions.amount') }} Transaksi (IDR)
            </label>
            <div class="relative">
              <span
                class="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-mono font-semibold text-slate-400"
              >
                Rp
              </span>
              <input
                v-model.number="amount"
                type="number"
                min="1"
                step="any"
                placeholder="0"
                required
                class="w-full min-h-[46px] pl-11 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-lg font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
              />
            </div>
            <!-- Quick nominal tap buttons -->
            <div class="flex items-center gap-2 mt-2 overflow-x-auto pb-1">
              <button
                v-for="preset in [25000, 50000, 100000, 250000, 500000]"
                :key="preset"
                type="button"
                class="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300 hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors whitespace-nowrap shrink-0"
                @click="addQuickAmount(preset)"
              >
                +{{ (preset / 1000).toLocaleString('id-ID') }}rb
              </button>
            </div>
          </div>

          <!-- Category (Shown for Income & Expense) + Date -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div v-if="txType !== 'transfer'">
              <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                {{ t('transactions.category') }}
              </label>
              <select
                v-model="category"
                class="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
              >
                <option v-for="cat in categories" :key="cat" :value="cat">
                  {{ cat }}
                </option>
              </select>
            </div>

            <div :class="txType === 'transfer' ? 'sm:col-span-2' : ''">
              <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                {{ t('transactions.date') }}
              </label>
              <input
                v-model="date"
                type="date"
                required
                class="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs sm:text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
              />
            </div>
          </div>

          <div>
            <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              {{ t('transactions.note') }}
            </label>
            <input
              v-model="note"
              type="text"
              maxlength="200"
              :placeholder="
                txType === 'transfer'
                  ? 'Contoh: Pindah dana belanja dari Pribadi ke Istri...'
                  : 'Contoh: Makan siang, Belanja dapur, Listrik...'
              "
              class="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
            />
          </div>
        </div>

        <p v-if="errorMsg" class="text-xs text-rose-600 dark:text-rose-400">
          {{ errorMsg }}
        </p>

        <div class="pt-2 flex items-center justify-end gap-2.5">
          <button
            type="button"
            class="min-h-[42px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
            @click="closeModal"
          >
            Batal
          </button>
          <button
            type="submit"
            :disabled="isSubmitting"
            class="min-h-[42px] px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap disabled:opacity-50"
          >
            <Check class="w-4 h-4" />
            <span>{{ t('transactions.save') }}</span>
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
