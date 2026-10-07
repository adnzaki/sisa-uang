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
      walletId.value = '';
      fundOwnerId.value = '';
      toWalletId.value = '';
      toFundOwnerId.value = '';
      amount.value = '';
      adminFee.value = '';
      note.value = '';
      date.value = new Date().toISOString().slice(0, 10);
      category.value = '';
    }

    await nextTick();
    isInitializing.value = false;
  },
  { immediate: true }
);

watch(walletId, (newWalletId) => {
  if (isInitializing.value) return;
  if (!newWalletId) {
    fundOwnerId.value = '';
    return;
  }
  const holders = financeStore.getHoldersByWalletId(newWalletId);
  if (!holders.some((h) => h.id === fundOwnerId.value)) {
    fundOwnerId.value = holders.length === 1 ? holders[0].id : '';
  }
});

watch(toWalletId, (newToWalletId) => {
  if (isInitializing.value) return;
  if (!newToWalletId) {
    toFundOwnerId.value = '';
    return;
  }
  const holders = financeStore.getHoldersByWalletId(newToWalletId);
  if (!holders.some((h) => h.id === toFundOwnerId.value)) {
    toFundOwnerId.value = holders.length === 1 ? holders[0].id : '';
  }
});

watch(txType, () => {
  if (isInitializing.value) return;
  if (
    category.value &&
    !categories.value.includes(category.value) &&
    txType.value !== 'transfer'
  ) {
    category.value = '';
  }
});

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
  if (!walletId.value) {
    errorMsg.value = 'Pilih Sumber Dana terlebih dahulu.';
    return;
  }
  if (availableSourceHolders.value.length > 0 && !fundOwnerId.value) {
    errorMsg.value = 'Pilih Pemilik terlebih dahulu.';
    return;
  }

  const numericAmount = Number(amount.value || 0);
  if (numericAmount <= 0) {
    errorMsg.value = 'Masukkan Nominal transaksi yang valid (lebih dari 0).';
    return;
  }
  const numericAdminFee =
    txType.value === 'transfer' ? Math.max(0, Number(adminFee.value || 0)) : 0;

  if (txType.value !== 'transfer' && !category.value.trim()) {
    errorMsg.value = 'Pilih Kategori terlebih dahulu.';
    return;
  }

  if (txType.value === 'transfer') {
    if (!toWalletId.value) {
      errorMsg.value = 'Pilih Sumber Dana Tujuan terlebih dahulu.';
      return;
    }
    if (availableDestHolders.value.length > 0 && !toFundOwnerId.value) {
      errorMsg.value = 'Pilih Pemilik Tujuan terlebih dahulu.';
      return;
    }
  }

  isSubmitting.value = true;
  try {
    const resolvedCategory =
      txType.value === 'transfer' ? 'Transfer Dana' : category.value.trim() || 'Lainnya';
    const payload = {
      walletId: walletId.value,
      fundOwnerId: fundOwnerId.value,
      toWalletId: txType.value === 'transfer' ? toWalletId.value : undefined,
      toFundOwnerId: txType.value === 'transfer' ? toFundOwnerId.value : undefined,
      type: txType.value,
      category: resolvedCategory,
      amount: numericAmount,
      adminFee: numericAdminFee,
      note:
        note.value.trim() ||
        (txType.value === 'transfer' ? 'Transfer antar kepemilikan dana' : resolvedCategory),
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
    <div class="space-y-3.5">
      <!-- 1. Sumber Dana -->
      <CustomSelect
        v-model="walletId"
        :options="walletOptions"
        placeholder="Sumber Dana"
      />

      <!-- 2. Pemilik Sumber Dana -->
      <CustomSelect
        v-model="fundOwnerId"
        :options="sourceHolderOptions"
        :disabled="!walletId || availableSourceHolders.length === 0"
        placeholder="Pemilik"
      />

      <!-- 3. Segmented 3-Way Type Control: Income | Expense | Transfer -->
      <div class="grid grid-cols-3 rounded-full overflow-hidden border border-emerald-600/20 dark:border-emerald-500/20 bg-emerald-600/10 dark:bg-slate-800 p-1 gap-1">
        <button
          type="button"
          class="min-h-[44px] flex items-center justify-center gap-1 rounded-full text-xs sm:text-sm font-bold uppercase tracking-wide transition-all duration-150 px-2"
          :class="
            txType === 'income'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
          "
          @click="txType = 'income'"
        >
          <ArrowDownLeft class="w-3.5 h-3.5 shrink-0 hidden sm:inline" />
          <span class="truncate">{{ t('transactions.income') }}</span>
        </button>
        <button
          type="button"
          class="min-h-[44px] flex items-center justify-center gap-1 rounded-full text-xs sm:text-sm font-bold uppercase tracking-wide transition-all duration-150 px-2"
          :class="
            txType === 'expense'
              ? 'bg-rose-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
          "
          @click="txType = 'expense'"
        >
          <ArrowUpRight class="w-3.5 h-3.5 shrink-0 hidden sm:inline" />
          <span class="truncate">{{ t('transactions.expense') }}</span>
        </button>
        <button
          type="button"
          class="min-h-[44px] flex items-center justify-center gap-1 rounded-full text-xs sm:text-sm font-bold uppercase tracking-wide transition-all duration-150 px-2"
          :class="
            txType === 'transfer'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
          "
          @click="txType = 'transfer'"
        >
          <ArrowLeftRight class="w-3.5 h-3.5 shrink-0 hidden sm:inline" />
          <span class="truncate">{{ t('transactions.transfer') }}</span>
        </button>
      </div>

      <!-- 4. Tanggal Transaksi (Google Material Date Picker) -->
      <MaterialDatePicker
        v-model="date"
        :label="t('transactions.date')"
      />

      <!-- 5. Deskripsi / Catatan -->
      <input
        v-model="note"
        type="text"
        maxlength="200"
        placeholder="Deskripsi"
        class="w-full min-h-[54px] sm:min-h-[50px] px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 text-sm sm:text-base text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:outline-none focus:border-emerald-600"
      />

      <!-- 6. Nominal Transaksi -->
      <input
        v-model.number="amount"
        type="number"
        min="1"
        step="any"
        placeholder="Nominal (Rp)"
        required
        class="w-full min-h-[54px] sm:min-h-[50px] px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 text-base sm:text-lg font-money font-semibold text-slate-900 dark:text-slate-100 placeholder:font-sans placeholder:font-normal placeholder:text-sm sm:placeholder:text-base placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:outline-none focus:border-emerald-600"
      />

      <!-- 7A. Kategori (Untuk Income / Expense) -->
      <div v-if="txType !== 'transfer'">
        <CustomSelect
          v-model="category"
          :options="categoryOptions"
          searchable
          allow-custom-value
          search-placeholder="Ketik untuk mencari kategori..."
          placeholder="Kategori"
        />
      </div>

      <!-- 7B. Biaya Admin + Sumber Dana Tujuan + Pemilik Tujuan (Untuk Transfer) -->
      <Transition name="fade-slide">
        <div v-if="txType === 'transfer'" class="space-y-3.5">
          <input
            v-model.number="adminFee"
            type="number"
            min="0"
            step="any"
            placeholder="Biaya Admin (Rp · Opsional)"
            class="w-full min-h-[54px] sm:min-h-[50px] px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 text-base sm:text-lg font-money font-semibold text-slate-900 dark:text-slate-100 placeholder:font-sans placeholder:font-normal placeholder:text-sm sm:placeholder:text-base placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:outline-none focus:border-indigo-600"
          />

          <CustomSelect
            v-model="toWalletId"
            :options="walletOptions"
            accent-color="indigo"
            placeholder="Sumber Dana Tujuan"
          />

          <CustomSelect
            v-model="toFundOwnerId"
            :options="destHolderOptions"
            :disabled="!toWalletId || availableDestHolders.length === 0"
            accent-color="indigo"
            placeholder="Pemilik Tujuan"
          />
        </div>
      </Transition>

      <p v-if="errorMsg" class="text-xs text-rose-600 dark:text-rose-400 font-medium px-1">
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
