<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Check, Trash2 } from 'lucide-vue-next';
import { useFinanceStore, formatHolderName } from '../stores/finance';
import { useThemeStore } from '../stores/theme';
import AppModal from './AppModal.vue';
import CustomSelect, { type SelectOptionItem } from './CustomSelect.vue';
import MaterialDatePicker from './MaterialDatePicker.vue';

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

// Step 3: Input Transaksi (Category, Amount, AdminFee, Date, Note)
const amount = ref<number | ''>('');
const adminFee = ref<number | ''>('');
const category = ref<string>('');
const note = ref<string>('');
const date = ref<string>(new Date().toISOString().slice(0, 10));
const errorMsg = ref<string | null>(null);
const isSubmitting = ref(false);
const isInitializing = ref(false);

const isEditMode = computed(() => Boolean(financeStore.editingTransaction));

const categories = computed(() => {
  const base =
    txType.value === 'expense'
      ? financeStore.expenseCategoryNames
      : financeStore.incomeCategoryNames;
  if (category.value && !base.includes(category.value) && txType.value !== 'transfer') {
    return [category.value, ...base];
  }
  return base;
});

const categoryOptions = computed<SelectOptionItem[]>(() =>
  categories.value.map((cat) => ({
    value: cat,
    label: cat,
  }))
);

const walletOptions = computed<SelectOptionItem[]>(() =>
  financeStore.wallets.map((w) => ({
    value: w.id,
    label: w.name,
    sublabel: `(${themeStore.formatMoney(w.balance)})`,
  }))
);

const availableSourceHolders = computed(() =>
  walletId.value ? financeStore.getHoldersByWalletId(walletId.value) : []
);

const sourceHolderOptions = computed<SelectOptionItem[]>(() =>
  availableSourceHolders.value.map((holder) => ({
    value: holder.id,
    label: formatHolderName(holder.holderName),
    sublabel: `(${themeStore.formatMoney(holder.balance)})`,
  }))
);

const availableDestHolders = computed(() =>
  toWalletId.value ? financeStore.getHoldersByWalletId(toWalletId.value) : []
);

const destHolderOptions = computed<SelectOptionItem[]>(() =>
  availableDestHolders.value.map((holder) => ({
    value: holder.id,
    label: formatHolderName(holder.holderName),
    sublabel: `(${themeStore.formatMoney(holder.balance)})`,
  }))
);

watch(
  () => [financeStore.quickModalOpen, financeStore.editingTransaction] as const,
  async ([isOpen, editingTx]) => {
    if (!isOpen) return;
    isInitializing.value = true;
    errorMsg.value = null;

    if (editingTx) {
      txType.value = editingTx.type;
      walletId.value = editingTx.walletId || financeStore.wallets[0]?.id || '';
      const srcHolders = financeStore.getHoldersByWalletId(walletId.value);
      fundOwnerId.value =
        editingTx.fundOwnerId && srcHolders.some((h) => h.id === editingTx.fundOwnerId)
          ? editingTx.fundOwnerId
          : srcHolders[0]?.id || '';

      toWalletId.value =
        editingTx.toWalletId || editingTx.walletId || financeStore.wallets[0]?.id || '';
      const dstHolders = financeStore.getHoldersByWalletId(toWalletId.value);
      toFundOwnerId.value =
        editingTx.toFundOwnerId && dstHolders.some((h) => h.id === editingTx.toFundOwnerId)
          ? editingTx.toFundOwnerId
          : dstHolders[0]?.id || '';

      amount.value = editingTx.amount;
      adminFee.value = editingTx.adminFee && editingTx.adminFee > 0 ? editingTx.adminFee : '';
      category.value =
        editingTx.type === 'transfer'
          ? 'Transfer Dana'
          : editingTx.category || categories.value[0] || 'Lainnya';
      note.value = editingTx.note || '';
      date.value = editingTx.date || new Date().toISOString().slice(0, 10);
    } else {
      txType.value = 'expense';
      if (financeStore.wallets.length > 0) {
        walletId.value = financeStore.wallets[0].id;
      }
      const holders = financeStore.getHoldersByWalletId(walletId.value);
      fundOwnerId.value = holders[0]?.id || '';

      if (financeStore.wallets.length > 0) {
        toWalletId.value = financeStore.wallets[0].id;
      }
      const destHolders = financeStore.getHoldersByWalletId(toWalletId.value);
      if (destHolders.length > 1) {
        toFundOwnerId.value = destHolders[1].id;
      } else {
        toFundOwnerId.value = destHolders[0]?.id || '';
      }
      amount.value = '';
      adminFee.value = '';
      note.value = '';
      date.value = new Date().toISOString().slice(0, 10);
      category.value = categories.value[0] || 'Lainnya';
    }

    await nextTick();
    isInitializing.value = false;
  },
  { immediate: true }
);

watch(walletId, (newWalletId) => {
  if (isInitializing.value) return;
  const holders = financeStore.getHoldersByWalletId(newWalletId);
  if (!holders.some((h) => h.id === fundOwnerId.value)) {
    fundOwnerId.value = holders[0]?.id || '';
  }
});

watch(toWalletId, (newToWalletId) => {
  if (isInitializing.value) return;
  const holders = financeStore.getHoldersByWalletId(newToWalletId);
  if (!holders.some((h) => h.id === toFundOwnerId.value)) {
    const diffHolder = holders.find((h) => h.id !== fundOwnerId.value);
    toFundOwnerId.value = diffHolder?.id || holders[0]?.id || '';
  }
});

watch(txType, () => {
  if (isInitializing.value) return;
  category.value = categories.value[0] || 'Lainnya';
});

function addQuickAmount(val: number) {
  const current = Number(amount.value || 0);
  amount.value = current + val;
}

function addQuickAdminFee(val: number) {
  const current = Number(adminFee.value || 0);
  adminFee.value = current + val;
}

function closeModal() {
  financeStore.quickModalOpen = false;
  financeStore.editingTransaction = null;
}

async function handleDeleteCurrent() {
  if (!financeStore.editingTransaction) return;
  isSubmitting.value = true;
  try {
    await financeStore.removeTransaction(financeStore.editingTransaction.id);
    closeModal();
  } catch (err: any) {
    errorMsg.value = err instanceof Error ? err.message : 'Gagal menghapus transaksi.';
  } finally {
    isSubmitting.value = false;
  }
}

async function handleSubmit() {
  errorMsg.value = null;
  const numericAmount = Number(amount.value || 0);
  if (numericAmount <= 0) {
    errorMsg.value = 'Masukkan nominal transaksi yang valid (lebih dari 0).';
    return;
  }
  const numericAdminFee =
    txType.value === 'transfer' ? Math.max(0, Number(adminFee.value || 0)) : 0;

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
    const payload = {
      walletId: walletId.value,
      fundOwnerId: fundOwnerId.value,
      toWalletId: txType.value === 'transfer' ? toWalletId.value : undefined,
      toFundOwnerId: txType.value === 'transfer' ? toFundOwnerId.value : undefined,
      type: txType.value,
      category: txType.value === 'transfer' ? 'Transfer Dana' : category.value,
      amount: numericAmount,
      adminFee: numericAdminFee,
      note:
        note.value.trim() ||
        (txType.value === 'transfer' ? 'Transfer antar kepemilikan dana' : category.value),
      date: date.value,
    };

    if (financeStore.editingTransaction) {
      await financeStore.updateTransaction(financeStore.editingTransaction.id, payload);
    } else {
      await financeStore.addTransaction(payload);
    }

    amount.value = '';
    adminFee.value = '';
    note.value = '';
    closeModal();
  } catch (err: any) {
    errorMsg.value = err instanceof Error ? err.message : 'Gagal menyimpan transaksi.';
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <AppModal
    :open="financeStore.quickModalOpen"
    :title="isEditMode ? 'Detail & Ubah Transaksi' : t('dashboard.addTransaction')"
    max-width="lg"
    @close="closeModal"
  >
    <div class="space-y-4">
      <!-- Segmented 3-Way Type Control: Expense | Income | Transfer -->
      <div class="grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-slate-800/90 rounded-xl">
        <button
          type="button"
          class="min-h-[44px] flex items-center justify-center gap-1 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-150 px-1.5"
          :class="
            txType === 'expense'
              ? 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          "
          @click="txType = 'expense'"
        >
          <ArrowUpRight class="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
          <span class="truncate">{{ t('transactions.expense') }}</span>
        </button>
        <button
          type="button"
          class="min-h-[44px] flex items-center justify-center gap-1 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-150 px-1.5"
          :class="
            txType === 'income'
              ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          "
          @click="txType = 'income'"
        >
          <ArrowDownLeft class="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
          <span class="truncate">{{ t('transactions.income') }}</span>
        </button>
        <button
          type="button"
          class="min-h-[44px] flex items-center justify-center gap-1 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-150 px-1.5"
          :class="
            txType === 'transfer'
              ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          "
          @click="txType = 'transfer'"
        >
          <ArrowLeftRight class="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
          <span class="truncate">{{ t('transactions.transfer') }}</span>
        </button>
      </div>

      <!-- STEP 1 & STEP 2: Pilih Sumber Dana -> Pilih Pemilik Dana (Full-width on mobile) -->
      <div class="sm:rounded-2xl sm:border sm:border-slate-200/80 sm:dark:border-slate-800 sm:bg-slate-50/60 sm:dark:bg-slate-950/60 sm:p-3.5 space-y-3">
        <div class="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
          {{ txType === 'transfer' ? 'Asal Dana (Sumber & Kepemilikan)' : 'Sumber & Kepemilikan Dana' }}
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              1. Sumber Dana (Wallet)
            </label>
            <CustomSelect
              v-model="walletId"
              :options="walletOptions"
              placeholder="Pilih Sumber Dana..."
              aria-label="Sumber Dana"
            />
          </div>

          <div>
            <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              2. Pemilik Sumber Dana
            </label>
            <CustomSelect
              v-model="fundOwnerId"
              :options="sourceHolderOptions"
              :disabled="!walletId || availableSourceHolders.length === 0"
              placeholder="Pilih Pemilik Dana..."
              aria-label="Pemilik Sumber Dana"
            />
          </div>
        </div>
      </div>

      <!-- TRANSFER DESTINATION: Pilih Sumber Dana Tujuan -> Pilih Pemilik Dana Tujuan (Full-width on mobile) -->
      <Transition name="fade-slide">
        <div
          v-if="txType === 'transfer'"
          class="pt-2 border-t border-slate-200/70 dark:border-slate-800 sm:pt-3.5 sm:rounded-2xl sm:border sm:border-indigo-200/80 sm:dark:border-indigo-900/50 sm:bg-indigo-50/40 sm:dark:bg-indigo-950/20 sm:p-3.5 space-y-3"
        >
          <div class="text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
            Tujuan Transfer (Sumber & Kepemilikan Tujuan)
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Sumber Dana Tujuan
              </label>
              <CustomSelect
                v-model="toWalletId"
                :options="walletOptions"
                accent-color="indigo"
                placeholder="Pilih Dompet Tujuan..."
                aria-label="Sumber Dana Tujuan"
              />
            </div>

            <div>
              <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Pemilik Dana Tujuan
              </label>
              <CustomSelect
                v-model="toFundOwnerId"
                :options="destHolderOptions"
                :disabled="!toWalletId || availableDestHolders.length === 0"
                accent-color="indigo"
                placeholder="Pilih Pemilik Tujuan..."
                aria-label="Pemilik Dana Tujuan"
              />
            </div>
          </div>
        </div>
      </Transition>

      <!-- STEP 3: Input Detail Transaksi -->
      <div class="space-y-3.5 pt-2 border-t border-slate-200/70 dark:border-slate-800 sm:pt-0 sm:border-t-0">
        <div>
          <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
            3. {{ t('transactions.amount') }} Transaksi (IDR)
          </label>
          <div class="relative">
            <span
              class="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-money font-semibold text-slate-400"
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
              class="w-full min-h-[52px] sm:min-h-[48px] pl-11 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-lg font-money font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
            />
          </div>
          <!-- Quick nominal tap buttons -->
          <div class="flex items-center gap-1.5 mt-2 overflow-x-auto pb-1">
            <button
              v-for="preset in [25000, 50000, 100000, 250000, 500000]"
              :key="preset"
              type="button"
              class="min-h-[36px] px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-money text-slate-600 dark:text-slate-300 hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors whitespace-nowrap shrink-0"
              @click="addQuickAmount(preset)"
            >
              +{{ (preset / 1000).toLocaleString('id-ID') }}rb
            </button>
          </div>
        </div>

        <!-- Biaya Admin Transfer (Shown ONLY for Transfer Type) -->
        <Transition name="fade-slide">
          <div
            v-if="txType === 'transfer'"
            class="sm:rounded-2xl sm:border sm:border-indigo-200/70 sm:dark:border-indigo-900/50 sm:bg-indigo-50/30 sm:dark:bg-indigo-950/15 sm:p-3.5 space-y-2"
          >
            <div class="flex items-center justify-between gap-2">
              <label class="block text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                {{ t('transactions.adminFee') }} (Opsional · IDR)
              </label>
              <span class="text-[11px] text-slate-500 dark:text-slate-400">
                Dipotong dari saldo asal
              </span>
            </div>
            <div class="relative">
              <span
                class="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-money font-semibold text-slate-400"
              >
                Rp
              </span>
              <input
                v-model.number="adminFee"
                type="number"
                min="0"
                step="any"
                placeholder="0 (Tanpa biaya admin)"
                class="w-full min-h-[50px] sm:min-h-[46px] pl-11 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm sm:text-base font-money font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-indigo-600"
              />
            </div>
            <div class="flex items-center gap-1.5 overflow-x-auto pb-0.5">
              <button
                type="button"
                class="min-h-[34px] px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-medium text-slate-500 hover:border-indigo-500 hover:text-indigo-600 transition-colors whitespace-nowrap shrink-0"
                @click="adminFee = ''"
              >
                Gratis (Rp 0)
              </button>
              <button
                v-for="feePreset in [1000, 2500, 6500]"
                :key="feePreset"
                type="button"
                class="min-h-[34px] px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-money text-slate-600 dark:text-slate-300 hover:border-indigo-500 hover:text-indigo-600 transition-colors whitespace-nowrap shrink-0"
                @click="addQuickAdminFee(feePreset)"
              >
                +Rp {{ feePreset.toLocaleString('id-ID') }}
              </button>
            </div>
          </div>
        </Transition>

        <!-- Searchable Category Select (Shown for Income & Expense) + Google Material Date Picker -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div v-if="txType !== 'transfer'">
            <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              {{ t('transactions.category') }} (Ketik untuk mencari)
            </label>
            <CustomSelect
              v-model="category"
              :options="categoryOptions"
              searchable
              allow-custom-value
              search-placeholder="Ketik nama kategori..."
              placeholder="Pilih atau cari kategori..."
              aria-label="Pilih Kategori Transaksi"
            />
          </div>

          <div :class="txType === 'transfer' ? 'sm:col-span-2' : ''">
            <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              {{ t('transactions.date') }}
            </label>
            <MaterialDatePicker
              v-model="date"
              :label="t('transactions.date')"
            />
          </div>
        </div>

        <div>
          <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
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
            class="w-full min-h-[50px] sm:min-h-[46px] px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
          />
        </div>
      </div>

      <p v-if="errorMsg" class="text-xs text-rose-600 dark:text-rose-400 font-medium">
        {{ errorMsg }}
      </p>
    </div>

    <!-- Fixed Footer inside AppModal (No Batal button, only Delete if editing + Save CTA) -->
    <template #footer>
      <div class="flex items-center justify-between gap-2.5">
        <button
          v-if="isEditMode"
          type="button"
          :disabled="isSubmitting"
          class="min-h-[44px] px-4 py-2 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0 disabled:opacity-50"
          @click="handleDeleteCurrent"
        >
          <Trash2 class="w-4 h-4 shrink-0" />
          <span>Hapus</span>
        </button>

        <button
          type="button"
          :disabled="isSubmitting"
          class="flex-1 min-h-[46px] px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 shadow-xs"
          @click="handleSubmit"
        >
          <Check class="w-4 h-4 shrink-0" />
          <span>{{ isEditMode ? 'Simpan Perubahan' : t('transactions.save') }}</span>
        </button>
      </div>
    </template>
  </AppModal>
</template>
