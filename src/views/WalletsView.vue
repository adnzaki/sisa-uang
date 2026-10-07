<script setup lang="ts">
import { ref, computed } from 'vue';
import { RouterLink } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { Wallet, Plus, Trash2, Check, Users, ChevronRight } from 'lucide-vue-next';
import {
  useFinanceStore,
  WalletItem,
  formatHolderName,
} from '../stores/finance';
import { useThemeStore } from '../stores/theme';
import AppModal from '../components/AppModal.vue';
import CustomSelect, { type SelectOptionItem } from '../components/CustomSelect.vue';

const { t } = useI18n();
const financeStore = useFinanceStore();
const themeStore = useThemeStore();

// 1. Modal: Add New Wallet
const showAddForm = ref(false);
const name = ref('');
const type = ref<WalletItem['type']>('bank');
const balance = ref<number | ''>('');
const initialHolderName = ref('Pribadi');
const color = ref('emerald');

// 2. Modal: Edit Existing Wallet (Tap on Wallet Card)
const editingWallet = ref<WalletItem | null>(null);
const editWalletName = ref('');
const editWalletType = ref<WalletItem['type']>('bank');

const isEditWalletOpen = computed({
  get: () => editingWallet.value !== null,
  set: (val: boolean) => {
    if (!val) editingWallet.value = null;
  },
});

const walletTypeOptions = computed<SelectOptionItem[]>(() => [
  { value: 'bank', label: t('wallets.bank'), badge: 'BANK' },
  { value: 'ewallet', label: t('wallets.ewallet'), badge: 'E-WALLET' },
  { value: 'cash', label: t('wallets.cash'), badge: 'TUNAI' },
  { value: 'investment', label: t('wallets.investment'), badge: 'INVESTASI' },
  { value: 'credit', label: t('wallets.credit'), badge: 'KREDIT' },
]);

function openAddWalletModal() {
  name.value = '';
  type.value = 'bank';
  balance.value = '';
  initialHolderName.value = 'Pribadi';
  showAddForm.value = true;
}

async function handleCreateWallet() {
  if (!name.value.trim()) return;
  await financeStore.addWallet({
    name: name.value.trim(),
    type: type.value,
    balance: Number(balance.value || 0),
    color: color.value,
    initialHolderName: initialHolderName.value.trim() || 'Pribadi',
  });
  showAddForm.value = false;
}

function openEditWalletModal(w: WalletItem) {
  editingWallet.value = w;
  editWalletName.value = w.name;
  editWalletType.value = w.type;
}

async function handleSaveEditWallet() {
  if (!editingWallet.value || !editWalletName.value.trim()) return;
  await financeStore.updateWallet(editingWallet.value.id, {
    name: editWalletName.value.trim(),
    type: editWalletType.value,
  });
  editingWallet.value = null;
}

async function handleDeleteEditingWallet() {
  if (!editingWallet.value) return;
  const id = editingWallet.value.id;
  editingWallet.value = null;
  await financeStore.removeWallet(id);
}
</script>

<template>
  <div class="space-y-5 sm:space-y-6 max-w-full overflow-x-hidden">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div class="min-w-0">
        <h1 class="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          {{ t('wallets.title') }}
        </h1>
        <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          {{ t('wallets.subtitle') }} Ketuk kartu dompet untuk mengubah nama atau jenis rekening.
        </p>
      </div>

      <button
        type="button"
        class="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-colors shrink-0 shadow-xs"
        @click="openAddWalletModal"
      >
        <Plus class="w-4 h-4 shrink-0" />
        <span>{{ t('dashboard.addWallet') }}</span>
      </button>
    </div>

    <!-- Total Balance Summary + Quick Link to Kepemilikan Dana -->
    <div class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <div class="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {{ t('dashboard.totalBalance') }}
        </div>
        <div class="text-2xl sm:text-3xl font-money font-bold tabular-nums text-emerald-600 dark:text-emerald-400 mt-1">
          {{ themeStore.formatMoney(financeStore.totalBalance) }}
        </div>
        <div class="text-xs text-slate-500 dark:text-slate-400 font-money tabular-nums mt-0.5">
          {{ financeStore.wallets.length }} dompet & rekening aktif
        </div>
      </div>

      <RouterLink
        to="/ownership"
        class="min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 hover:border-emerald-500/60 text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center justify-between sm:justify-center gap-2 transition-colors shrink-0"
      >
        <div class="flex items-center gap-2">
          <Users class="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>Kelola Kepemilikan Dana ({{ financeStore.walletOwners.length }})</span>
        </div>
        <ChevronRight class="w-4 h-4 text-slate-400 shrink-0" />
      </RouterLink>
    </div>

    <!-- Empty State -->
    <div
      v-if="financeStore.wallets.length === 0"
      class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center space-y-3"
    >
      <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
        Belum ada dompet atau sumber dana terdaftar.
      </p>
      <button
        type="button"
        class="min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
        @click="openAddWalletModal"
      >
        <Plus class="w-4 h-4" />
        <span>{{ t('dashboard.addWallet') }}</span>
      </button>
    </div>

    <!-- Clean Wallets Grid (Focused purely on Wallets) -->
    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
      <div
        v-for="w in financeStore.wallets"
        :key="w.id"
        role="button"
        tabindex="0"
        class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 flex flex-col justify-between gap-4 hover:border-emerald-500/50 active:scale-[0.99] transition-all cursor-pointer shadow-2xs"
        @click="openEditWalletModal(w)"
        @keydown.enter="openEditWalletModal(w)"
      >
        <!-- Top Row: Wallet Identity & Delete Button -->
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-center gap-3 min-w-0 flex-1">
            <div class="w-11 h-11 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200/60 dark:border-emerald-900/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Wallet class="w-5 h-5" />
            </div>
            <div class="min-w-0 flex-1">
              <h3 class="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 truncate">
                {{ w.name }}
              </h3>
              <div class="text-xs text-slate-500 dark:text-slate-400 truncate">
                {{ t(`wallets.${w.type}`) }} · IDR
              </div>
            </div>
          </div>

          <button
            v-if="financeStore.wallets.length > 1"
            type="button"
            class="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl border border-rose-200/70 dark:border-rose-900/50 bg-rose-50/70 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 transition-colors"
            title="Hapus Sumber Dana"
            @click.stop="financeStore.removeWallet(w.id)"
          >
            <Trash2 class="w-5 h-5" />
          </button>
        </div>

        <!-- Balance Display -->
        <div class="rounded-xl border border-emerald-200/60 dark:border-emerald-900/40 bg-emerald-50/40 dark:bg-emerald-950/25 p-3.5">
          <div class="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            TOTAL SALDO DOMPET
          </div>
          <div class="text-xl sm:text-2xl font-money font-bold tabular-nums text-emerald-600 dark:text-emerald-400 mt-0.5 truncate">
            {{ themeStore.formatMoney(w.balance) }}
          </div>
        </div>

        <!-- Compact Holder Info Footer -->
        <div class="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 pt-0.5">
          <span class="truncate">
            Pemilik:
            <strong class="text-slate-700 dark:text-slate-300">
              {{
                financeStore
                  .getHoldersByWalletId(w.id)
                  .map((h) => formatHolderName(h.holderName))
                  .join(', ') || 'Pribadi'
              }}
            </strong>
          </span>
          <span class="text-[11px] font-money text-emerald-600 dark:text-emerald-400 shrink-0">
            {{ financeStore.getHoldersByWalletId(w.id).length }} pemilik
          </span>
        </div>
      </div>
    </div>

    <!-- =================================================================== -->
    <!-- MODAL 1: Tambah Sumber Dana Baru (AppModal Full-Screen on Mobile)   -->
    <!-- =================================================================== -->
    <AppModal
      v-model="showAddForm"
      title="Tambah Dompet / Sumber Dana Baru"
      subtitle="Tambahkan rekening bank, e-wallet, atau kas tunai ke akun Anda"
    >
      <form id="add-wallet-form" class="space-y-4" @submit.prevent="handleCreateWallet">
        <div>
          <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            Nama Sumber Dana
          </label>
          <input
            v-model="name"
            type="text"
            required
            maxlength="60"
            placeholder="Contoh: Bank Mandiri, BCA, GoPay..."
            class="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
          />
        </div>

        <div>
          <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            {{ t('wallets.walletType') }}
          </label>
          <CustomSelect
            v-model="type"
            :options="walletTypeOptions"
            placeholder="Pilih jenis sumber dana"
          />
        </div>

        <div>
          <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            Pemilik Dana Pertama
          </label>
          <input
            v-model="initialHolderName"
            type="text"
            required
            maxlength="60"
            placeholder="Contoh: Pribadi / Istri / Tabungan"
            class="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
          />
        </div>

        <div>
          <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            Saldo Awal (IDR)
          </label>
          <input
            v-model.number="balance"
            type="number"
            step="any"
            required
            placeholder="0"
            class="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-base font-money font-semibold tabular-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
          />
        </div>
      </form>

      <template #footer>
        <div class="flex items-center justify-end w-full">
          <button
            type="submit"
            form="add-wallet-form"
            class="w-full sm:w-auto min-h-[46px] px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-colors shadow-xs"
          >
            <Check class="w-4 h-4 shrink-0" />
            <span>{{ t('wallets.saveWallet') }}</span>
          </button>
        </div>
      </template>
    </AppModal>

    <!-- =================================================================== -->
    <!-- MODAL 2: Detail & Ubah Sumber Dana (AppModal Full-Screen on Mobile) -->
    <!-- =================================================================== -->
    <AppModal
      v-model="isEditWalletOpen"
      title="Detail & Ubah Dompet"
      :subtitle="editingWallet ? `ID: ${editingWallet.id}` : ''"
    >
      <form
        v-if="editingWallet"
        id="edit-wallet-form"
        class="space-y-4"
        @submit.prevent="handleSaveEditWallet"
      >
        <div>
          <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            Nama Sumber Dana
          </label>
          <input
            v-model="editWalletName"
            type="text"
            required
            maxlength="60"
            class="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
          />
        </div>

        <div>
          <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            {{ t('wallets.walletType') }}
          </label>
          <CustomSelect
            v-model="editWalletType"
            :options="walletTypeOptions"
            placeholder="Pilih jenis sumber dana"
          />
        </div>

        <div class="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3.5 flex items-center justify-between text-xs">
          <span class="text-slate-500 dark:text-slate-400">
            Ingin mengubah rincian pemilik & saldo di dalam dompet ini?
          </span>
          <RouterLink
            to="/ownership"
            class="font-semibold text-emerald-600 dark:text-emerald-400 hover:underline shrink-0 ml-2"
            @click="editingWallet = null"
          >
            Buka Kepemilikan →
          </RouterLink>
        </div>
      </form>

      <template #footer>
        <div class="flex items-center justify-between gap-2 w-full">
          <button
            v-if="financeStore.wallets.length > 1"
            type="button"
            class="min-h-[46px] px-4 py-2.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors shrink-0"
            @click="handleDeleteEditingWallet"
          >
            <Trash2 class="w-4 h-4 shrink-0" />
            <span>Hapus</span>
          </button>
          <div v-else></div>

          <button
            type="submit"
            form="edit-wallet-form"
            class="flex-1 sm:flex-initial min-h-[46px] px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-colors shadow-xs"
          >
            <Check class="w-4 h-4 shrink-0" />
            <span>Simpan Perubahan</span>
          </button>
        </div>
      </template>
    </AppModal>
  </div>
</template>
