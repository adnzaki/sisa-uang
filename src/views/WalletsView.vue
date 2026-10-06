<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Wallet, Plus, Trash2, Check, X, Users, Pencil } from 'lucide-vue-next';
import { useFinanceStore, WalletItem, WalletOwnerItem, formatHolderName } from '../stores/finance';
import { useThemeStore } from '../stores/theme';

const { t } = useI18n();
const financeStore = useFinanceStore();
const themeStore = useThemeStore();

const showAddForm = ref(false);
const name = ref('');
const type = ref<WalletItem['type']>('bank');
const balance = ref<number | ''>('');
const initialHolderName = ref('Pribadi');
const color = ref('emerald');

// Inline add fund owner per wallet card
const activeAddHolderWalletId = ref<string | null>(null);
const newHolderName = ref('');
const newHolderBalance = ref<number | ''>('');

// Inline edit single fund owner (holderName & balance)
const editingHolderId = ref<string | null>(null);
const editHolderName = ref('');
const editHolderBalance = ref<number>(0);

// Inline global rename for a holderName across all wallets (e.g. "1" -> "Pribadi", "2" -> "Istri")
const renamingRawOwnerKey = ref<string | null>(null);
const renameOwnerNewLabel = ref('');

async function handleCreateWallet() {
  if (!name.value.trim()) return;
  await financeStore.addWallet({
    name: name.value.trim(),
    type: type.value,
    balance: Number(balance.value || 0),
    color: color.value,
    initialHolderName: initialHolderName.value.trim() || 'Pribadi',
  });
  name.value = '';
  balance.value = '';
  initialHolderName.value = 'Pribadi';
  showAddForm.value = false;
}

function openAddHolderForm(walletId: string) {
  activeAddHolderWalletId.value = walletId;
  newHolderName.value = '';
  newHolderBalance.value = '';
}

async function handleAddHolder(walletId: string) {
  if (!newHolderName.value.trim()) return;
  await financeStore.addWalletOwner({
    walletId,
    holderName: newHolderName.value.trim(),
    balance: Number(newHolderBalance.value || 0),
  });
  activeAddHolderWalletId.value = null;
  newHolderName.value = '';
  newHolderBalance.value = '';
}

function startEditHolder(holder: WalletOwnerItem) {
  editingHolderId.value = holder.id;
  editHolderName.value = holder.holderName;
  editHolderBalance.value = Number(holder.balance || 0);
}

async function saveEditHolder(holderId: string) {
  if (!editHolderName.value.trim()) return;
  await financeStore.updateWalletOwner(holderId, {
    holderName: editHolderName.value.trim(),
    balance: Number(editHolderBalance.value || 0),
  });
  editingHolderId.value = null;
}

function startGlobalRenameOwner(rawHolderName: string, currentDisplay: string) {
  renamingRawOwnerKey.value = rawHolderName;
  renameOwnerNewLabel.value = /^\d+$/.test(rawHolderName) ? '' : currentDisplay;
}

async function saveGlobalRenameOwner(rawHolderName: string) {
  if (!renameOwnerNewLabel.value.trim()) return;
  await financeStore.renameHolderGlobally(rawHolderName, renameOwnerNewLabel.value.trim());
  renamingRawOwnerKey.value = null;
  renameOwnerNewLabel.value = '';
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl sm:text-3xl font-display italic text-slate-900 dark:text-slate-100">
          {{ t('wallets.title') }} & Kepemilikan Dana
        </h1>
        <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
          Satu Sumber Dana (Wallet) dapat memiliki beberapa pemilik dana (contoh: Mandiri → Pribadi, Istri).
        </p>
      </div>

      <button
        type="button"
        class="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap self-start sm:self-auto"
        @click="showAddForm = !showAddForm"
      >
        <Plus class="w-4 h-4" />
        <span>{{ t('dashboard.addWallet') }}</span>
      </button>
    </div>

    <!-- Total Net Worth Summary -->
    <div class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <div class="text-xs text-slate-500 dark:text-slate-400">
          {{ t('dashboard.totalBalance') }} (Akumulasi Seluruh Kepemilikan Sumber Dana)
        </div>
        <div class="text-2xl sm:text-3xl font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100 mt-1">
          {{ themeStore.formatMoney(financeStore.totalBalance) }}
        </div>
      </div>
      <div class="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
        {{ financeStore.wallets.length }} sumber dana · {{ financeStore.walletOwners.length }} kepemilikan dana
      </div>
    </div>

    <!-- Ringkasan & Ubah Nama Cepat Pemilik Dana (Konsep Kepemilikan Dana SisaUang) -->
    <section
      v-if="financeStore.ownershipSummary.length > 0"
      class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3"
    >
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 class="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Users class="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Ringkasan Pemilik Sumber Dana Lintas Rekening</span>
          </h2>
          <p class="text-xs text-slate-500 dark:text-slate-400">
            Ubah nama pemilik (misal dari kode ID migrasi <code>Pemilik #1</code> menjadi <strong>Pribadi</strong> atau <strong>Istri</strong>) secara serentak di seluruh sumber dana.
          </p>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        <div
          v-for="owner in financeStore.ownershipSummary"
          :key="owner.rawHolderName"
          class="rounded-xl border border-slate-200/70 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 p-3.5 space-y-2"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="text-xs font-semibold text-slate-900 dark:text-slate-100">
              {{ owner.displayHolderName }}
            </div>
            <button
              type="button"
              class="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
              @click="startGlobalRenameOwner(owner.rawHolderName, owner.displayHolderName)"
            >
              <Pencil class="w-3 h-3" />
              <span>Ubah Nama</span>
            </button>
          </div>

          <div class="text-base font-mono font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
            {{ themeStore.formatMoney(owner.totalBalance) }}
          </div>

          <div class="text-[11px] text-slate-500 dark:text-slate-400">
            Tersebar di {{ owner.walletCount }} sumber dana:
            {{ owner.wallets.map((w) => w.walletName).join(', ') }}
          </div>

          <!-- Global Rename Form -->
          <form
            v-if="renamingRawOwnerKey === owner.rawHolderName"
            class="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center gap-1.5"
            @submit.prevent="saveGlobalRenameOwner(owner.rawHolderName)"
          >
            <input
              v-model="renameOwnerNewLabel"
              type="text"
              required
              maxlength="50"
              placeholder="Contoh: Pribadi / Istri"
              class="flex-1 min-h-[34px] px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
            />
            <button
              type="submit"
              class="min-h-[34px] px-2.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold"
            >
              Simpan
            </button>
            <button
              type="button"
              class="min-h-[34px] px-2 rounded-lg text-xs text-slate-500"
              @click="renamingRawOwnerKey = null"
            >
              Batal
            </button>
          </form>
        </div>
      </div>
    </section>

    <!-- Inline Create Wallet Card -->
    <form
      v-if="showAddForm"
      class="rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-white dark:bg-slate-900 p-5 space-y-4"
      @submit.prevent="handleCreateWallet"
    >
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Tambah Sumber Dana Baru beserta Pemilik Pertama
        </h2>
        <button
          type="button"
          class="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700"
          @click="showAddForm = false"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div>
          <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
            Nama Sumber Dana
          </label>
          <input
            v-model="name"
            type="text"
            required
            maxlength="60"
            placeholder="Contoh: Bank Mandiri, BCA..."
            class="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
          />
        </div>

        <div>
          <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
            {{ t('wallets.walletType') }}
          </label>
          <select
            v-model="type"
            class="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
          >
            <option value="bank">{{ t('wallets.bank') }}</option>
            <option value="ewallet">{{ t('wallets.ewallet') }}</option>
            <option value="cash">{{ t('wallets.cash') }}</option>
            <option value="investment">{{ t('wallets.investment') }}</option>
            <option value="credit">{{ t('wallets.credit') }}</option>
          </select>
        </div>

        <div>
          <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
            Pemilik Dana Pertama
          </label>
          <input
            v-model="initialHolderName"
            type="text"
            required
            maxlength="60"
            placeholder="Contoh: Pribadi / Istri"
            class="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
          />
        </div>

        <div>
          <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
            Saldo Awal Pemilik (IDR)
          </label>
          <input
            v-model.number="balance"
            type="number"
            step="any"
            required
            placeholder="0"
            class="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs sm:text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
          />
        </div>
      </div>

      <div class="flex items-center justify-end gap-2">
        <button
          type="button"
          class="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300"
          @click="showAddForm = false"
        >
          Batal
        </button>
        <button
          type="submit"
          class="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5"
        >
          <Check class="w-4 h-4" />
          <span>{{ t('wallets.saveWallet') }}</span>
        </button>
      </div>
    </form>

    <!-- Wallets Grid with Fund Ownership Breakdown -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div
        v-for="w in financeStore.wallets"
        :key="w.id"
        class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col justify-between gap-4"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="space-y-1 min-w-0">
            <div class="text-xs text-slate-500 dark:text-slate-400">
              {{ t(`wallets.${w.type}`) }}
            </div>
            <h3 class="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
              {{ w.name }}
            </h3>
          </div>
          <div class="flex items-center gap-2">
            <div class="text-right">
              <div class="text-[11px] text-slate-400">Total Saldo Sumber Dana</div>
              <div class="text-base sm:text-lg font-mono font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                {{ themeStore.formatMoney(w.balance) }}
              </div>
            </div>
            <div class="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center shrink-0">
              <Wallet class="w-4 h-4" />
            </div>
          </div>
        </div>

        <!-- Fund Owners (Kepemilikan Dana) List inside this Wallet -->
        <div class="rounded-xl border border-slate-200/70 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 p-3.5 space-y-2.5">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <Users class="w-3.5 h-3.5 text-emerald-600" />
              <span>Daftar Pemilik Dana ({{ financeStore.getHoldersByWalletId(w.id).length }})</span>
            </div>
            <button
              type="button"
              class="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
              @click="openAddHolderForm(w.id)"
            >
              <Plus class="w-3.5 h-3.5" />
              <span>Tambah Pemilik</span>
            </button>
          </div>

          <div class="divide-y divide-slate-200/60 dark:divide-slate-800/70">
            <div
              v-for="holder in financeStore.getHoldersByWalletId(w.id)"
              :key="holder.id"
              class="py-2 space-y-2 text-xs"
            >
              <div
                v-if="editingHolderId !== holder.id"
                class="flex items-center justify-between gap-2"
              >
                <span class="font-medium text-slate-800 dark:text-slate-200">
                  {{ formatHolderName(holder.holderName) }}
                </span>
                <div class="flex items-center gap-2">
                  <span class="font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                    {{ themeStore.formatMoney(holder.balance) }}
                  </span>
                  <button
                    type="button"
                    class="p-1 rounded-lg text-slate-400 hover:text-emerald-600 transition-colors"
                    title="Edit nama atau saldo pemilik"
                    @click="startEditHolder(holder)"
                  >
                    <Pencil class="w-3.5 h-3.5" />
                  </button>
                  <button
                    v-if="financeStore.getHoldersByWalletId(w.id).length > 1"
                    type="button"
                    class="p-1 rounded-lg text-slate-400 hover:text-rose-600 transition-colors"
                    title="Hapus pemilik dana"
                    @click="financeStore.removeWalletOwner(holder.id)"
                  >
                    <Trash2 class="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <!-- Inline Edit Holder Form -->
              <form
                v-else
                class="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center"
                @submit.prevent="saveEditHolder(holder.id)"
              >
                <input
                  v-model="editHolderName"
                  type="text"
                  required
                  placeholder="Nama pemilik"
                  class="sm:col-span-5 min-h-[34px] px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100"
                />
                <input
                  v-model.number="editHolderBalance"
                  type="number"
                  step="any"
                  required
                  placeholder="Saldo (Rp)"
                  class="sm:col-span-4 min-h-[34px] px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-mono text-slate-900 dark:text-slate-100"
                />
                <div class="sm:col-span-3 flex items-center justify-end gap-1">
                  <button
                    type="button"
                    class="min-h-[32px] px-2 rounded-lg text-xs text-slate-500"
                    @click="editingHolderId = null"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    class="min-h-[32px] px-2.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold"
                  >
                    Simpan
                  </button>
                </div>
              </form>
            </div>
          </div>

          <!-- Inline Add Fund Owner Form -->
          <form
            v-if="activeAddHolderWalletId === w.id"
            class="pt-2 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-12 gap-2 items-center"
            @submit.prevent="handleAddHolder(w.id)"
          >
            <input
              v-model="newHolderName"
              type="text"
              required
              placeholder="Nama pemilik (mis. Istri)"
              class="sm:col-span-5 min-h-[36px] px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100"
            />
            <input
              v-model.number="newHolderBalance"
              type="number"
              required
              placeholder="Saldo (Rp)"
              class="sm:col-span-4 min-h-[36px] px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-mono text-slate-900 dark:text-slate-100"
            />
            <div class="sm:col-span-3 flex items-center justify-end gap-1">
              <button
                type="button"
                class="min-h-[34px] px-2 rounded-lg text-xs text-slate-500"
                @click="activeAddHolderWalletId = null"
              >
                Batal
              </button>
              <button
                type="submit"
                class="min-h-[34px] px-2.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold"
              >
                Simpan
              </button>
            </div>
          </form>
        </div>

        <div class="flex items-center justify-between text-xs text-slate-400 pt-1">
          <span>ID: <code class="font-mono">{{ w.id }}</code></span>
          <button
            v-if="financeStore.wallets.length > 1"
            type="button"
            class="text-xs text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 flex items-center gap-1 transition-colors"
            @click="financeStore.removeWallet(w.id)"
          >
            <Trash2 class="w-3.5 h-3.5" />
            <span>Hapus Sumber Dana</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
