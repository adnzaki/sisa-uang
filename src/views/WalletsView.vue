<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { Wallet, Plus, Trash2, Check, Users, ChevronRight, Crown, RefreshCw } from 'lucide-vue-next';
import {
  useFinanceStore,
  WalletItem,
  formatHolderName,
} from '../stores/finance';
import { useThemeStore } from '../stores/theme';
import { useAuthStore } from '../stores/auth';
import { useNotificationStore } from '../stores/notification';
import AppModal from '../components/AppModal.vue';
import CustomSelect, { type SelectOptionItem } from '../components/CustomSelect.vue';

const { t } = useI18n();
const financeStore = useFinanceStore();
const themeStore = useThemeStore();
const authStore = useAuthStore();
const notificationStore = useNotificationStore();

const isSyncing = ref(false);
async function handleSyncWallets() {
  const uid = authStore.user?.uid;
  if (!uid || uid === 'guest') return;
  isSyncing.value = true;
  try {
    await financeStore.loadRouteDataFromFirestore('/wallets', uid, true);
    notificationStore.notifySuccess(
      'Saldo Berhasil Disinkronkan',
      'Data dompet dan saldo telah diperbarui langsung dari server.'
    );
  } catch (err: any) {
    notificationStore.notifyError('Gagal Sinkronisasi Saldo', err?.message || err);
  } finally {
    isSyncing.value = false;
  }
}

onMounted(async () => {
  const uid = authStore.user?.uid;
  if (uid && uid !== 'guest') {
    if (!financeStore.isSyncedWithFirestore) {
      await financeStore.initFinanceData(uid);
    } else {
      await financeStore.loadRouteDataFromFirestore('/wallets', uid, true);
    }
  }
});

// 1. Modal: Add New Wallet
const showAddForm = ref(false);
const name = ref('');
const type = ref<WalletItem['type']>('bank');
const balance = ref<number | ''>('');
const color = ref('emerald');
const isCustomHolder = ref(false);
const selectedHolder = ref('Pribadi');
const customHolderName = ref('');

function formatNominalDisplay(val: number | string | ''): string {
  if (val === '' || val === null || val === undefined) return '';
  const str = String(val).trim();
  if (str === '0') return '0';
  const digits = str.replace(/\D/g, '').replace(/^0+/, '');
  if (!digits) return str.includes('0') ? '0' : '';
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

const balanceDisplay = computed(() => formatNominalDisplay(balance.value));

function handleBalanceInput(event: Event) {
  const input = event.target as HTMLInputElement;
  const rawValue = input.value;
  const selectionStart = input.selectionStart ?? rawValue.length;
  const rawSlice = rawValue.slice(0, selectionStart);
  const digitsBeforeCursor =
    rawSlice.replace(/\D/g, '') === '0'
      ? 1
      : rawSlice.replace(/\D/g, '').replace(/^0+/, '').length;

  const allDigits = rawValue.replace(/\D/g, '');
  if (!allDigits) {
    balance.value = '';
    input.value = '';
    return;
  }

  const cleanDigits = allDigits.replace(/^0+/, '');
  balance.value = cleanDigits ? Number(cleanDigits) : 0;

  const formatted = cleanDigits
    ? cleanDigits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
    : '0';
  input.value = formatted;

  if (document.activeElement === input) {
    let newCursorPos = 0;
    if (digitsBeforeCursor > 0) {
      let seenDigits = 0;
      for (let i = 0; i < formatted.length; i++) {
        if (/\d/.test(formatted[i])) {
          seenDigits++;
          if (seenDigits === digitsBeforeCursor) {
            newCursorPos = i + 1;
            break;
          }
        }
      }
    }
    input.setSelectionRange(newCursorPos, newCursorPos);
  }
}

// 2. Modal: Edit Existing Wallet (Tap on Wallet Card)
const editingWallet = ref<WalletItem | null>(null);
const editWalletName = ref('');
const editWalletType = ref<WalletItem['type']>('bank');
const isEditCustomHolder = ref(false);
const editSelectedHolder = ref('');
const editCustomHolderName = ref('');
const editHolderId = ref('');

const editingWalletHolders = computed(() => {
  if (!editingWallet.value) return [];
  return financeStore.getHoldersByWalletId(editingWallet.value.id);
});
const isEditSingleHolder = computed(() => editingWalletHolders.value.length === 1);

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

const existingOwnerOptions = computed<SelectOptionItem[]>(() => {
  const map = new Map<string, SelectOptionItem>();
  for (const o of financeStore.ownershipSummary) {
    const raw = String(o.rawHolderName || '').trim();
    if (!raw) continue;
    if (!map.has(raw.toLowerCase())) {
      map.set(raw.toLowerCase(), {
        value: raw,
        label: formatHolderName(raw),
        sublabel: `${o.walletCount} sumber dana`,
      });
    }
  }
  for (const fo of financeStore.walletOwners) {
    if (fo.deleted) continue;
    const raw = String(fo.holderName || '').trim();
    if (!raw) continue;
    if (!map.has(raw.toLowerCase())) {
      map.set(raw.toLowerCase(), {
        value: raw,
        label: formatHolderName(raw),
        sublabel: 'Sumber Dana',
      });
    }
  }
  const result = Array.from(map.values());
  if (result.length === 0) {
    result.push({
      value: 'Pribadi',
      label: 'Pribadi',
      sublabel: 'Default',
    });
  }
  return result;
});

function enableCustomHolder() {
  if (!authStore.isProUser && financeStore.ownershipSummary.length >= 2) {
    notificationStore.openProModal({
      featureTitle: 'Batas Maksimal 2 Kepemilikan Dana',
      featureDescription:
        'Pengguna paket Free hanya dapat memiliki maksimal 2 kepemilikan dana berbeda. Pilih dari daftar kepemilikan yang sudah ada atau berlangganan SisaUang Pro untuk membuat kepemilikan baru tanpa batas.',
      limitSummary: `${financeStore.ownershipSummary.length} / 2 Kepemilikan Aktif`,
    });
    return;
  }
  isCustomHolder.value = true;
  customHolderName.value = '';
}

function enableEditCustomHolder() {
  if (!authStore.isProUser && financeStore.ownershipSummary.length >= 2) {
    notificationStore.openProModal({
      featureTitle: 'Batas Maksimal 2 Kepemilikan Dana',
      featureDescription:
        'Pengguna paket Free hanya dapat memiliki maksimal 2 kepemilikan dana berbeda. Pilih dari daftar kepemilikan yang sudah ada atau berlangganan SisaUang Pro untuk membuat kepemilikan baru tanpa batas.',
      limitSummary: `${financeStore.ownershipSummary.length} / 2 Kepemilikan Aktif`,
    });
    return;
  }
  isEditCustomHolder.value = true;
  editCustomHolderName.value = '';
}

function openAddWalletModal() {
  if (!authStore.isProUser && financeStore.wallets.length >= 5) {
    notificationStore.openProModal({
      featureTitle: 'Batas Maksimal 5 Sumber Dana (Wallet)',
      featureDescription:
        'Pengguna paket Free hanya dapat menambahkan maksimal 5 sumber dana (wallet). Berlangganan SisaUang Pro untuk menambahkan sumber dana tanpa batas.',
      limitSummary: `${financeStore.wallets.length} / 5 Sumber Dana Aktif`,
    });
    return;
  }
  name.value = '';
  type.value = 'bank';
  balance.value = '';
  isCustomHolder.value = false;
  selectedHolder.value = (existingOwnerOptions.value[0]?.value as string) || 'Pribadi';
  customHolderName.value = '';
  showAddForm.value = true;
}

async function handleCreateWallet() {
  if (!name.value.trim()) return;
  const targetHolder = isCustomHolder.value
    ? customHolderName.value.trim()
    : String(selectedHolder.value || '').trim() || 'Pribadi';
  if (!targetHolder) return;

  const created = await financeStore.addWallet({
    name: name.value.trim(),
    type: type.value,
    balance: Number(balance.value || 0),
    color: color.value,
    initialHolderName: targetHolder,
  });
  if (created) {
    showAddForm.value = false;
  }
}

function openEditWalletModal(w: WalletItem) {
  editingWallet.value = w;
  editWalletName.value = w.name;
  editWalletType.value = w.type;
  const holders = financeStore.getHoldersByWalletId(w.id);
  if (holders.length === 1) {
    editHolderId.value = holders[0].id;
    isEditCustomHolder.value = false;
    editSelectedHolder.value = holders[0].holderName;
    editCustomHolderName.value = '';
  } else {
    editHolderId.value = '';
    isEditCustomHolder.value = false;
    editSelectedHolder.value = '';
    editCustomHolderName.value = '';
  }
}

async function handleSaveEditWallet() {
  if (!editingWallet.value || !editWalletName.value.trim()) return;
  const walletId = editingWallet.value.id;
  await financeStore.updateWallet(walletId, {
    name: editWalletName.value.trim(),
    type: editWalletType.value,
  });

  const holders = financeStore.getHoldersByWalletId(walletId);
  if (holders.length === 1 && editHolderId.value) {
    const targetHolder = holders.find((h) => h.id === editHolderId.value);
    if (targetHolder) {
      const finalHolderName = isEditCustomHolder.value
        ? editCustomHolderName.value.trim()
        : String(editSelectedHolder.value || '').trim();
      if (finalHolderName && finalHolderName !== targetHolder.holderName) {
        await financeStore.updateWalletOwner(targetHolder.id, {
          holderName: finalHolderName,
          balance: targetHolder.balance,
        });
      }
    }
  }

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

      <div class="flex items-center gap-2 w-full sm:w-auto">
        <button
          type="button"
          :disabled="isSyncing"
          class="min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-colors shrink-0 shadow-xs cursor-pointer disabled:opacity-50"
          title="Sinkronkan saldo dengan server Firestore"
          @click="handleSyncWallets"
        >
          <RefreshCw class="w-4 h-4 shrink-0" :class="{ 'animate-spin': isSyncing }" />
          <span class="hidden sm:inline">Sinkronkan</span>
        </button>

        <button
          type="button"
          class="flex-1 sm:flex-none min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-colors shrink-0 shadow-xs cursor-pointer"
          @click="openAddWalletModal"
        >
          <Plus class="w-4 h-4 shrink-0" />
          <span>{{ t('dashboard.addWallet') }}</span>
          <span
            v-if="!authStore.isProUser && financeStore.wallets.length >= 5"
            class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-400 text-slate-950 text-[10px] font-extrabold uppercase tracking-wider"
          >
            <Crown class="w-3 h-3 shrink-0" />
            <span>PRO</span>
          </span>
        </button>
      </div>
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
        <div class="text-xs text-slate-500 dark:text-slate-400 font-money tabular-nums mt-0.5 flex flex-wrap items-center gap-1.5">
          <span>
            {{ financeStore.wallets.length }}{{ !authStore.isProUser ? ' / 5' : '' }} dompet &amp; rekening aktif
          </span>
          <span
            v-if="!authStore.isProUser"
            class="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] font-sans font-semibold text-slate-600 dark:text-slate-400"
          >
            Paket Free (Maks. 5)
          </span>
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
    >
      <form id="add-wallet-form" class="space-y-3.5" @submit.prevent="handleCreateWallet">
        <input
          v-model="name"
          type="text"
          required
          maxlength="60"
          placeholder="Nama Sumber Dana (Misal: Bank Mandiri, BCA, GoPay)"
          class="w-full min-h-[54px] sm:min-h-[50px] px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 text-sm sm:text-base text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:outline-none focus:border-emerald-600"
        />

        <CustomSelect
          v-model="type"
          :options="walletTypeOptions"
          :placeholder="t('wallets.walletType')"
        />

        <div class="space-y-1.5">
          <label class="block text-xs font-semibold text-slate-500 dark:text-slate-400 px-1">
            Pemilik Dana
          </label>
          <template v-if="!isCustomHolder">
            <CustomSelect
              v-model="selectedHolder"
              :options="existingOwnerOptions"
              placeholder="Pilih Pemilik Dana"
            />
            <div class="flex items-center justify-between px-1 text-xs">
              <span class="text-slate-400 dark:text-slate-500 text-[11px]">
                Pilih dari kepemilikan yang sudah ada
              </span>
              <button
                type="button"
                class="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors cursor-pointer"
                @click="enableCustomHolder"
              >
                <Plus class="w-3.5 h-3.5 shrink-0" />
                <span>Tambah Pemilik</span>
              </button>
            </div>
          </template>
          <template v-else>
            <input
              v-model="customHolderName"
              type="text"
              required
              maxlength="60"
              placeholder="Pemilik Dana Pertama (Misal: Pribadi, Istri, Tabungan)"
              class="w-full min-h-[54px] sm:min-h-[50px] px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 text-sm sm:text-base text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:outline-none focus:border-emerald-600"
            />
            <div class="flex items-center justify-between px-1 text-xs">
              <span class="text-slate-400 dark:text-slate-500 text-[11px]">
                Ketik nama kepemilikan baru
              </span>
              <button
                type="button"
                class="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
                @click="isCustomHolder = false"
              >
                <span>← Pilih dari Daftar Pemilik</span>
              </button>
            </div>
          </template>
        </div>

        <input
          :value="balanceDisplay"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          required
          placeholder="Saldo Awal (Rp)"
          class="w-full min-h-[54px] sm:min-h-[50px] px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 text-base sm:text-lg font-money font-semibold tabular-nums text-slate-900 dark:text-slate-100 placeholder:font-sans placeholder:font-normal placeholder:text-sm sm:placeholder:text-base placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:outline-none focus:border-emerald-600"
          @input="handleBalanceInput"
        />
      </form>

      <template #footer>
        <div class="flex items-center justify-end w-full">
          <button
            type="submit"
            form="add-wallet-form"
            class="w-full sm:w-auto min-h-[48px] px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-colors shadow-xs"
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
    >
      <form
        v-if="editingWallet"
        id="edit-wallet-form"
        class="space-y-3.5"
        @submit.prevent="handleSaveEditWallet"
      >
        <input
          v-model="editWalletName"
          type="text"
          required
          maxlength="60"
          placeholder="Nama Sumber Dana"
          class="w-full min-h-[54px] sm:min-h-[50px] px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 text-sm sm:text-base text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:outline-none focus:border-emerald-600"
        />

        <CustomSelect
          v-model="editWalletType"
          :options="walletTypeOptions"
          :placeholder="t('wallets.walletType')"
        />

        <div v-if="isEditSingleHolder" class="space-y-1.5">
          <label class="block text-xs font-semibold text-slate-500 dark:text-slate-400 px-1">
            Pemilik Dana
          </label>
          <template v-if="!isEditCustomHolder">
            <CustomSelect
              v-model="editSelectedHolder"
              :options="existingOwnerOptions"
              placeholder="Pilih Pemilik Dana"
            />
            <div class="flex items-center justify-between px-1 text-xs">
              <span class="text-slate-400 dark:text-slate-500 text-[11px]">
                Pilih dari kepemilikan yang sudah ada
              </span>
              <button
                type="button"
                class="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors"
                @click="enableEditCustomHolder"
              >
                <Plus class="w-3.5 h-3.5 shrink-0" />
                <span>Tambah Pemilik</span>
              </button>
            </div>
          </template>
          <template v-else>
            <input
              v-model="editCustomHolderName"
              type="text"
              required
              maxlength="60"
              placeholder="Nama Pemilik Dana (Misal: Pribadi, Istri, Tabungan)"
              class="w-full min-h-[54px] sm:min-h-[50px] px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 text-sm sm:text-base text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:outline-none focus:border-emerald-600"
            />
            <div class="flex items-center justify-between px-1 text-xs">
              <span class="text-slate-400 dark:text-slate-500 text-[11px]">
                Ketik nama kepemilikan baru
              </span>
              <button
                type="button"
                class="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
                @click="isEditCustomHolder = false"
              >
                <span>← Pilih dari Daftar Pemilik</span>
              </button>
            </div>
          </template>
        </div>

        <div v-else-if="editingWalletHolders.length > 1" class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3.5 space-y-2">
          <div class="flex items-center justify-between text-xs">
            <span class="font-semibold text-slate-700 dark:text-slate-300">
              Pemilik Dana ({{ editingWalletHolders.length }} pemilik)
            </span>
            <RouterLink
              to="/ownership"
              class="font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
              @click="editingWallet = null"
            >
              Kelola di Kepemilikan →
            </RouterLink>
          </div>
          <div class="flex flex-wrap gap-1.5 pt-1">
            <span
              v-for="h in editingWalletHolders"
              :key="h.id"
              class="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50"
            >
              {{ formatHolderName(h.holderName) }}
            </span>
          </div>
        </div>

        <div v-if="isEditSingleHolder" class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3.5 flex items-center justify-between text-xs">
          <span class="text-slate-500 dark:text-slate-400">
            Ingin menambah pemilik lain atau mengubah saldo di dompet ini?
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
