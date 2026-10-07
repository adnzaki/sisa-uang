<script setup lang="ts">
import { ref, computed } from 'vue';
import { RouterLink } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { Wallet, Plus, Trash2, Check, Users } from 'lucide-vue-next';
import {
  useFinanceStore,
  WalletItem,
  WalletOwnerItem,
  OwnershipSummaryItem,
  formatHolderName,
} from '../stores/finance';
import { useThemeStore } from '../stores/theme';
import AppModal from '../components/AppModal.vue';
import CustomSelect, { type SelectOptionItem } from '../components/CustomSelect.vue';

const { t } = useI18n();
const financeStore = useFinanceStore();
const themeStore = useThemeStore();

// 1. Modal: Add Fund Owner (Either from Top Button or from a specific Wallet Card)
const showAddHolderModal = ref(false);
const selectedWalletId = ref<string>('');
const newHolderName = ref('');
const newHolderBalance = ref<number | ''>('');

// 2. Modal: Edit Single Fund Owner (Tap on Holder Row)
const editingHolder = ref<{ holder: WalletOwnerItem; walletName: string } | null>(null);
const editHolderName = ref('');
const editHolderBalance = ref<number | ''>(0);

const isEditHolderOpen = computed({
  get: () => editingHolder.value !== null,
  set: (val: boolean) => {
    if (!val) editingHolder.value = null;
  },
});

// 3. Modal: Global Rename Ownership Across Wallets (Tap on Summary Card)
const renamingGlobalOwner = ref<OwnershipSummaryItem | null>(null);
const renameOwnerNewLabel = ref('');

const isGlobalRenameOpen = computed({
  get: () => renamingGlobalOwner.value !== null,
  set: (val: boolean) => {
    if (!val) renamingGlobalOwner.value = null;
  },
});

const walletSelectOptions = computed<SelectOptionItem[]>(() =>
  financeStore.wallets.map((w) => ({
    value: w.id,
    label: w.name,
    sublabel: `Total Saldo: ${themeStore.formatMoney(w.balance)}`,
  }))
);

function openAddHolderModal(wallet?: WalletItem) {
  selectedWalletId.value = wallet?.id || financeStore.wallets[0]?.id || '';
  newHolderName.value = '';
  newHolderBalance.value = '';
  showAddHolderModal.value = true;
}

async function handleAddHolder() {
  if (!selectedWalletId.value || !newHolderName.value.trim()) return;
  await financeStore.addWalletOwner({
    walletId: selectedWalletId.value,
    holderName: newHolderName.value.trim(),
    balance: Number(newHolderBalance.value || 0),
  });
  showAddHolderModal.value = false;
}

function openEditHolderModal(holder: WalletOwnerItem, walletName: string) {
  editingHolder.value = { holder, walletName };
  editHolderName.value = formatHolderName(holder.holderName);
  editHolderBalance.value = Number(holder.balance || 0);
}

async function handleSaveEditHolder() {
  if (!editingHolder.value || !editHolderName.value.trim()) return;
  await financeStore.updateWalletOwner(editingHolder.value.holder.id, {
    holderName: editHolderName.value.trim(),
    balance: Number(editHolderBalance.value || 0),
  });
  editingHolder.value = null;
}

async function handleDeleteEditingHolder() {
  if (!editingHolder.value) return;
  const id = editingHolder.value.holder.id;
  editingHolder.value = null;
  await financeStore.removeWalletOwner(id);
}

function openGlobalRenameModal(owner: OwnershipSummaryItem) {
  renamingGlobalOwner.value = owner;
  renameOwnerNewLabel.value = /^\d+$/.test(owner.rawHolderName) ? '' : owner.displayHolderName;
}

async function handleSaveGlobalRename() {
  if (!renamingGlobalOwner.value || !renameOwnerNewLabel.value.trim()) return;
  await financeStore.renameHolderGlobally(
    renamingGlobalOwner.value.rawHolderName,
    renameOwnerNewLabel.value.trim()
  );
  renamingGlobalOwner.value = null;
}
</script>

<template>
  <div class="space-y-5 sm:space-y-6 max-w-full overflow-x-hidden">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div class="min-w-0">
        <h1 class="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          {{ t('nav.ownership') }}
        </h1>
        <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Kelola alokasi pemilik dana di setiap dompet (misal: Mandiri → Pribadi, Istri). Ketuk kartu untuk mengubah nama atau saldo.
        </p>
      </div>

      <button
        type="button"
        :disabled="financeStore.wallets.length === 0"
        class="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-colors shrink-0 shadow-xs disabled:opacity-50"
        @click="openAddHolderModal()"
      >
        <Plus class="w-4 h-4 shrink-0" />
        <span>Tambah Kepemilikan Dana</span>
      </button>
    </div>

    <!-- Ringkasan Total Kepemilikan Dana (Lintas Sumber Dana) -->
    <section
      v-if="financeStore.ownershipSummary.length > 0"
      class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-3.5"
    >
      <div class="space-y-1">
        <h2 class="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Users class="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>Ringkasan Total Kepemilikan Dana (Lintas Sumber Dana)</span>
        </h2>
        <p class="text-xs text-slate-500 dark:text-slate-400">
          Akumulasi saldo berdasarkan nama kepemilikan di seluruh sumber dana. Ketuk kartu untuk mengubah nama kepemilikan secara serentak.
        </p>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div
          v-for="owner in financeStore.ownershipSummary"
          :key="owner.rawHolderName"
          role="button"
          tabindex="0"
          class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 p-4 space-y-2.5 hover:border-emerald-500/50 active:scale-[0.99] transition-all cursor-pointer"
          @click="openGlobalRenameModal(owner)"
          @keydown.enter="openGlobalRenameModal(owner)"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 truncate">
              {{ owner.displayHolderName }}
            </span>
            <span class="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100/80 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 shrink-0">
              {{ owner.walletCount }} sumber
            </span>
          </div>

          <div class="text-lg sm:text-xl font-money font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
            {{ themeStore.formatMoney(owner.totalBalance) }}
          </div>

          <div class="pt-2 border-t border-slate-200/70 dark:border-slate-800/80 space-y-1">
            <div
              v-for="wItem in owner.wallets"
              :key="wItem.walletId"
              class="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400"
            >
              <span class="truncate">{{ wItem.walletName }}</span>
              <span class="font-money tabular-nums font-semibold text-slate-700 dark:text-slate-300 shrink-0">
                {{ themeStore.formatMoney(wItem.balance) }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Rincian Kepemilikan per Sumber Dana -->
    <section class="space-y-3">
      <div class="flex items-center justify-between gap-2">
        <h2 class="text-base font-bold text-slate-900 dark:text-slate-100">
          Rincian Kepemilikan per Dompet ({{ financeStore.wallets.length }})
        </h2>
        <RouterLink
          to="/wallets"
          class="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline shrink-0"
        >
          Kelola Dompet →
        </RouterLink>
      </div>

      <div
        v-if="financeStore.wallets.length === 0"
        class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center space-y-3"
      >
        <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
          Tambahkan dompet terlebih dahulu sebelum mengatur kepemilikan dana.
        </p>
        <RouterLink
          to="/wallets"
          class="min-h-[42px] px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold inline-flex items-center gap-1.5"
        >
          <Plus class="w-4 h-4" />
          <span>Ke Menu Dompet</span>
        </RouterLink>
      </div>

      <div v-else class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div
          v-for="w in financeStore.wallets"
          :key="w.id"
          class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-3.5"
        >
          <!-- Wallet Header inside Ownership Card -->
          <div class="flex items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div class="flex items-center gap-2.5 min-w-0">
              <div class="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <Wallet class="w-4.5 h-4.5" />
              </div>
              <div class="min-w-0">
                <h3 class="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                  {{ w.name }}
                </h3>
                <div class="text-xs font-money font-semibold text-emerald-600 dark:text-emerald-400">
                  Total: {{ themeStore.formatMoney(w.balance) }}
                </div>
              </div>
            </div>

            <button
              type="button"
              class="min-h-[38px] px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center gap-1 shrink-0 transition-colors"
              @click="openAddHolderModal(w)"
            >
              <Plus class="w-3.5 h-3.5 shrink-0" />
              <span>Tambah</span>
            </button>
          </div>

          <!-- Holders List in this Wallet -->
          <div class="space-y-2">
            <div
              v-for="holder in financeStore.getHoldersByWalletId(w.id)"
              :key="holder.id"
              role="button"
              tabindex="0"
              class="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3.5 flex items-center justify-between gap-3 hover:border-emerald-500/50 active:scale-[0.99] transition-all cursor-pointer"
              @click="openEditHolderModal(holder, w.name)"
              @keydown.enter="openEditHolderModal(holder, w.name)"
            >
              <div class="min-w-0 flex-1">
                <div class="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                  {{ formatHolderName(holder.holderName) }}
                </div>
                <div class="text-sm sm:text-base font-money font-bold tabular-nums text-slate-700 dark:text-slate-300 mt-0.5 truncate">
                  {{ themeStore.formatMoney(holder.balance) }}
                </div>
              </div>

              <button
                v-if="financeStore.getHoldersByWalletId(w.id).length > 1"
                type="button"
                class="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl border border-rose-200/70 dark:border-rose-900/50 bg-rose-50/70 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 transition-colors"
                title="Hapus pemilik dana"
                @click.stop="financeStore.removeWalletOwner(holder.id)"
              >
                <Trash2 class="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- =================================================================== -->
    <!-- MODAL 1: Tambah Kepemilikan Dana ke Sumber Dana (AppModal)          -->
    <!-- =================================================================== -->
    <AppModal
      v-model="showAddHolderModal"
      title="Tambah Kepemilikan Dana"
      subtitle="Alokasikan pemilik dana baru ke dalam salah satu sumber dana"
    >
      <form id="add-holder-form" class="space-y-4" @submit.prevent="handleAddHolder">
        <div>
          <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            Pilih Dompet / Sumber Dana
          </label>
          <CustomSelect
            v-model="selectedWalletId"
            :options="walletSelectOptions"
            placeholder="Pilih sumber dana"
          />
        </div>

        <div>
          <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            Nama Pemilik Dana
          </label>
          <input
            v-model="newHolderName"
            type="text"
            required
            maxlength="60"
            placeholder="Contoh: Istri, Pribadi, Tabungan Anak..."
            class="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
          />
        </div>

        <div>
          <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            Saldo Kepemilikan (IDR)
          </label>
          <input
            v-model.number="newHolderBalance"
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
            form="add-holder-form"
            class="w-full sm:w-auto min-h-[46px] px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-colors shadow-xs"
          >
            <Check class="w-4 h-4 shrink-0" />
            <span>Simpan Kepemilikan</span>
          </button>
        </div>
      </template>
    </AppModal>

    <!-- =================================================================== -->
    <!-- MODAL 2: Detail & Ubah Kepemilikan Dana (AppModal)                  -->
    <!-- =================================================================== -->
    <AppModal
      v-model="isEditHolderOpen"
      title="Detail & Ubah Kepemilikan Dana"
      :subtitle="editingHolder ? `Sumber Dana: ${editingHolder.walletName}` : ''"
    >
      <form
        v-if="editingHolder"
        id="edit-holder-form"
        class="space-y-4"
        @submit.prevent="handleSaveEditHolder"
      >
        <div>
          <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            Nama Pemilik Dana
          </label>
          <input
            v-model="editHolderName"
            type="text"
            required
            maxlength="60"
            class="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
          />
        </div>

        <div>
          <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            Saldo Saat Ini (IDR)
          </label>
          <input
            v-model.number="editHolderBalance"
            type="number"
            step="any"
            required
            class="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-base font-money font-semibold tabular-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
          />
        </div>
      </form>

      <template #footer>
        <div v-if="editingHolder" class="flex items-center justify-between gap-2 w-full">
          <button
            v-if="financeStore.getHoldersByWalletId(editingHolder.holder.walletId).length > 1"
            type="button"
            class="min-h-[46px] px-4 py-2.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors shrink-0"
            @click="handleDeleteEditingHolder"
          >
            <Trash2 class="w-4 h-4 shrink-0" />
            <span>Hapus</span>
          </button>
          <div v-else></div>

          <button
            type="submit"
            form="edit-holder-form"
            class="flex-1 sm:flex-initial min-h-[46px] px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-colors shadow-xs"
          >
            <Check class="w-4 h-4 shrink-0" />
            <span>Simpan Perubahan</span>
          </button>
        </div>
      </template>
    </AppModal>

    <!-- =================================================================== -->
    <!-- MODAL 3: Ubah Nama Kepemilikan Lintas Sumber Dana (AppModal)        -->
    <!-- =================================================================== -->
    <AppModal
      v-model="isGlobalRenameOpen"
      title="Ubah Nama Kepemilikan Serentak"
      :subtitle="
        renamingGlobalOwner
          ? `Mengubah ${renamingGlobalOwner.displayHolderName} di ${renamingGlobalOwner.walletCount} sumber dana`
          : ''
      "
    >
      <form
        v-if="renamingGlobalOwner"
        id="global-rename-form"
        class="space-y-4"
        @submit.prevent="handleSaveGlobalRename"
      >
        <div>
          <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            Nama Kepemilikan Baru
          </label>
          <input
            v-model="renameOwnerNewLabel"
            type="text"
            required
            maxlength="50"
            placeholder="Contoh: Pribadi / Istri"
            class="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
          />
        </div>
      </form>

      <template #footer>
        <div class="flex items-center justify-end w-full">
          <button
            type="submit"
            form="global-rename-form"
            class="w-full sm:w-auto min-h-[46px] px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-colors shadow-xs"
          >
            <Check class="w-4 h-4 shrink-0" />
            <span>Simpan Nama Baru</span>
          </button>
        </div>
      </template>
    </AppModal>
  </div>
</template>
