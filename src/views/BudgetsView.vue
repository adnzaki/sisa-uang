<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Plus, Check, Trash2, X, Tags } from 'lucide-vue-next';
import { useFinanceStore, CategoryItem } from '../stores/finance';
import { useThemeStore } from '../stores/theme';

const { t } = useI18n();
const financeStore = useFinanceStore();
const themeStore = useThemeStore();

// Budget Modal (Used for both Add and Edit Budget when tapping a budget card)
const showBudgetForm = ref(false);
const isEditingBudget = ref(false);
const editingBudgetId = ref<string | null>(null);
const category = ref(financeStore.expenseCategoryNames[0] || 'Makan dan Minum');
const limitAmount = ref<number | ''>(2000000);

// Category Management State
const showCategoryManager = ref(true);
const newCatName = ref('');
const newCatType = ref<'expense' | 'income'>('expense');

// Edit Custom Category Modal (Opened when tapping a custom category item)
const editingCategory = ref<CategoryItem | null>(null);
const editCatName = ref('');
const editCatType = ref<'expense' | 'income'>('expense');

function openAddBudgetModal() {
  isEditingBudget.value = false;
  editingBudgetId.value = null;
  category.value = financeStore.expenseCategoryNames[0] || 'Makan dan Minum';
  limitAmount.value = 2000000;
  showBudgetForm.value = true;
}

function openEditBudgetModal(b: { id: string; category: string; limitAmount: number }) {
  isEditingBudget.value = true;
  editingBudgetId.value = b.id;
  category.value = b.category;
  limitAmount.value = b.limitAmount;
  showBudgetForm.value = true;
}

async function handleSaveBudget() {
  const num = Number(limitAmount.value || 0);
  if (num <= 0) return;
  await financeStore.saveBudget({
    category: category.value,
    limitAmount: num,
  });
  showBudgetForm.value = false;
}

async function handleDeleteEditingBudget() {
  if (!editingBudgetId.value) return;
  const id = editingBudgetId.value;
  showBudgetForm.value = false;
  await financeStore.removeBudget(id);
}

async function handleAddCategory() {
  if (!newCatName.value.trim()) return;
  await financeStore.addCategory({
    name: newCatName.value.trim(),
    type: newCatType.value,
  });
  newCatName.value = '';
}

function openEditCategoryModal(cat: CategoryItem) {
  if (cat.isDefault) return;
  editingCategory.value = cat;
  editCatName.value = cat.name;
  editCatType.value = cat.type;
}

async function handleSaveEditCategory() {
  if (!editingCategory.value || !editCatName.value.trim()) return;
  await financeStore.updateCategory(editingCategory.value.id, {
    name: editCatName.value.trim(),
    type: editCatType.value,
  });
  editingCategory.value = null;
}

async function handleDeleteEditingCategory() {
  if (!editingCategory.value) return;
  const id = editingCategory.value.id;
  editingCategory.value = null;
  await financeStore.removeCategory(id);
}
</script>

<template>
  <div class="space-y-5 sm:space-y-6 max-w-full overflow-x-hidden">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div class="min-w-0">
        <h1 class="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          {{ t('budgets.title') }} & Kategori
        </h1>
        <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          Ketuk kartu anggaran atau kategori kustom untuk mengubahnya secara langsung.
        </p>
      </div>

      <div class="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2 w-full sm:w-auto">
        <button
          type="button"
          class="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-emerald-600 flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
          @click="showCategoryManager = !showCategoryManager"
        >
          <Tags class="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Manajemen Kategori ({{ financeStore.categories.length }})</span>
        </button>

        <button
          type="button"
          class="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shadow-xs"
          @click="openAddBudgetModal"
        >
          <Plus class="w-4 h-4 shrink-0" />
          <span>{{ t('budgets.addBudget') }}</span>
        </button>
      </div>
    </div>

    <!-- Budgets Empty State or Grid (Tap any card to Edit, enlarged Delete button on right) -->
    <div
      v-if="financeStore.enrichedBudgets.length === 0"
      class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center space-y-3"
    >
      <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100">
        Belum Ada Batas Anggaran Bulanan
      </h3>
      <p class="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
        Tetapkan batas anggaran pengeluaran bulanan pada kategori Anda agar Sisa Uang dapat memantau pemakaian harian secara otomatis.
      </p>
      <button
        type="button"
        class="min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
        @click="openAddBudgetModal"
      >
        <Plus class="w-4 h-4" />
        <span>{{ t('budgets.addBudget') }}</span>
      </button>
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-3.5 sm:gap-4">
      <div
        v-for="b in financeStore.enrichedBudgets"
        :key="b.id"
        role="button"
        tabindex="0"
        class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4 hover:border-emerald-500/50 active:scale-[0.99] transition-all cursor-pointer"
        @click="openEditBudgetModal(b)"
        @keydown.enter="openEditBudgetModal(b)"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <h3 class="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 truncate">
              {{ b.category }}
            </h3>
            <div class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Periode {{ b.period }}
              <span class="mx-1.5" aria-hidden="true">·</span>
              <span
                class="font-semibold"
                :class="
                  b.percentage >= 90
                    ? 'text-rose-600 dark:text-rose-400'
                    : b.percentage >= 70
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-emerald-600 dark:text-emerald-400'
                "
              >
                {{ b.percentage }}% terpakai
              </span>
            </div>
          </div>

          <button
            type="button"
            class="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl border border-rose-200/70 dark:border-rose-900/50 bg-rose-50/70 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 shrink-0 transition-colors"
            title="Hapus Anggaran"
            @click.stop="financeStore.removeBudget(b.id)"
          >
            <Trash2 class="w-5 h-5" />
          </button>
        </div>

        <div class="h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
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

        <div class="grid grid-cols-3 gap-2 pt-2.5 border-t border-slate-100 dark:border-slate-800 text-xs">
          <div class="min-w-0">
            <div class="text-slate-400 truncate">{{ t('budgets.spent') }}</div>
            <div class="font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100 mt-0.5 truncate">
              {{ themeStore.formatMoney(b.spentAmount) }}
            </div>
          </div>
          <div class="min-w-0">
            <div class="text-slate-400 truncate">{{ t('budgets.remaining') }}</div>
            <div class="font-mono font-bold tabular-nums text-emerald-600 dark:text-emerald-400 mt-0.5 truncate">
              {{ themeStore.formatMoney(b.remaining) }}
            </div>
          </div>
          <div class="text-right min-w-0">
            <div class="text-slate-400 truncate">{{ t('budgets.limit') }}</div>
            <div class="font-mono font-bold tabular-nums text-slate-700 dark:text-slate-300 mt-0.5 truncate">
              {{ themeStore.formatMoney(b.limitAmount) }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Category Management Panel (Manajemen Kategori SisaUang) -->
    <section
      v-if="showCategoryManager"
      class="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4"
    >
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <h2 class="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
            Manajemen Kategori Transaksi ({{ financeStore.userCategories.length }} Kustom · {{ financeStore.defaultCategories.length }} Bawaan)
          </h2>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Ketuk kategori berlabel <strong>Kustom</strong> untuk mengubah nama atau jenisnya.
          </p>
        </div>
        <button
          type="button"
          class="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
          @click="showCategoryManager = false"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <form class="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end" @submit.prevent="handleAddCategory">
        <div class="sm:col-span-6">
          <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            Nama Kategori Kustom Baru
          </label>
          <input
            v-model="newCatName"
            type="text"
            required
            maxlength="50"
            placeholder="Contoh: Belanja Dapur, Sedekah, Royalti..."
            class="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
          />
        </div>
        <div class="sm:col-span-3">
          <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            Jenis Kategori
          </label>
          <select
            v-model="newCatType"
            class="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
          >
            <option value="expense">Pengeluaran</option>
            <option value="income">Pemasukan</option>
          </select>
        </div>
        <div class="sm:col-span-3">
          <button
            type="submit"
            class="w-full min-h-[44px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5"
          >
            <Plus class="w-4 h-4 shrink-0" />
            <span>Tambah Kategori</span>
          </button>
        </div>
      </form>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
        <!-- Expense Categories -->
        <div class="rounded-2xl border border-slate-200/70 dark:border-slate-800 p-3.5 space-y-2.5 max-h-96 overflow-y-auto">
          <div class="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 sticky top-0 bg-white dark:bg-slate-900 py-1 z-10">
            Kategori Pengeluaran ({{ financeStore.categories.filter((c) => c.type === 'expense').length }})
          </div>
          <div class="space-y-1.5">
            <div
              v-for="cat in financeStore.categories.filter((c) => c.type === 'expense')"
              :key="cat.id"
              :role="cat.isDefault ? undefined : 'button'"
              :tabindex="cat.isDefault ? undefined : 0"
              class="min-h-[46px] px-3 py-2 rounded-xl border flex items-center justify-between text-xs gap-2 transition-all"
              :class="
                cat.isDefault
                  ? 'border-slate-100 dark:border-slate-800/70 bg-slate-50/50 dark:bg-slate-950/30'
                  : 'border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-950/80 hover:border-emerald-500/50 active:scale-[0.99] cursor-pointer'
              "
              @click="openEditCategoryModal(cat)"
            >
              <div class="flex items-center gap-2 min-w-0 flex-1">
                <span class="font-semibold text-slate-800 dark:text-slate-200 truncate">
                  {{ cat.name }}
                </span>
                <span
                  v-if="cat.isDefault"
                  class="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] text-slate-500 font-medium shrink-0"
                >
                  Bawaan
                </span>
                <span
                  v-else
                  class="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold shrink-0"
                >
                  Kustom
                </span>
              </div>
              <button
                v-if="!cat.isDefault"
                type="button"
                class="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl border border-rose-200/70 dark:border-rose-900/50 bg-rose-50/70 dark:bg-rose-950/30 hover:bg-rose-100 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 transition-colors"
                title="Hapus kategori kustom"
                @click.stop="financeStore.removeCategory(cat.id)"
              >
                <Trash2 class="w-4.5 h-4.5" />
              </button>
            </div>
          </div>
        </div>

        <!-- Income Categories -->
        <div class="rounded-2xl border border-slate-200/70 dark:border-slate-800 p-3.5 space-y-2.5 max-h-96 overflow-y-auto">
          <div class="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 sticky top-0 bg-white dark:bg-slate-900 py-1 z-10">
            Kategori Pemasukan ({{ financeStore.categories.filter((c) => c.type === 'income').length }})
          </div>
          <div class="space-y-1.5">
            <div
              v-for="cat in financeStore.categories.filter((c) => c.type === 'income')"
              :key="cat.id"
              :role="cat.isDefault ? undefined : 'button'"
              :tabindex="cat.isDefault ? undefined : 0"
              class="min-h-[46px] px-3 py-2 rounded-xl border flex items-center justify-between text-xs gap-2 transition-all"
              :class="
                cat.isDefault
                  ? 'border-slate-100 dark:border-slate-800/70 bg-slate-50/50 dark:bg-slate-950/30'
                  : 'border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-950/80 hover:border-emerald-500/50 active:scale-[0.99] cursor-pointer'
              "
              @click="openEditCategoryModal(cat)"
            >
              <div class="flex items-center gap-2 min-w-0 flex-1">
                <span class="font-semibold text-slate-800 dark:text-slate-200 truncate">
                  {{ cat.name }}
                </span>
                <span
                  v-if="cat.isDefault"
                  class="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] text-slate-500 font-medium shrink-0"
                >
                  Bawaan
                </span>
                <span
                  v-else
                  class="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold shrink-0"
                >
                  Kustom
                </span>
              </div>
              <button
                v-if="!cat.isDefault"
                type="button"
                class="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl border border-rose-200/70 dark:border-rose-900/50 bg-rose-50/70 dark:bg-rose-950/30 hover:bg-rose-100 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 transition-colors"
                title="Hapus kategori kustom"
                @click.stop="financeStore.removeCategory(cat.id)"
              >
                <Trash2 class="w-4.5 h-4.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- =================================================================== -->
    <!-- MODAL 1: Tambah / Ubah Anggaran Bulanan                             -->
    <!-- =================================================================== -->
    <div
      v-if="showBudgetForm"
      class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4"
      @click.self="showBudgetForm = false"
    >
      <div class="w-full max-w-md rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 p-5 shadow-xl space-y-4">
        <div class="w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto sm:hidden"></div>
        <div class="flex items-center justify-between gap-2">
          <h2 class="text-base font-bold text-slate-900 dark:text-slate-100">
            {{ isEditingBudget ? 'Detail & Ubah Anggaran' : 'Atur Batas Anggaran Bulanan' }}
          </h2>
          <button
            type="button"
            class="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            @click="showBudgetForm = false"
          >
            <X class="w-5 h-5" />
          </button>
        </div>

        <form class="space-y-3.5" @submit.prevent="handleSaveBudget">
          <div>
            <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Kategori Pengeluaran
            </label>
            <select
              v-model="category"
              :disabled="isEditingBudget"
              class="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600 disabled:opacity-60"
            >
              <option v-for="cat in financeStore.expenseCategoryNames" :key="cat" :value="cat">
                {{ cat }}
              </option>
            </select>
          </div>

          <div>
            <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              {{ t('budgets.limit') }} Bulanan (IDR)
            </label>
            <input
              v-model.number="limitAmount"
              type="number"
              min="10000"
              step="any"
              required
              class="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-base font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
            />
          </div>

          <div class="pt-2 flex items-center justify-between gap-2">
            <button
              v-if="isEditingBudget && editingBudgetId"
              type="button"
              class="min-h-[44px] px-3.5 py-2 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-center gap-1.5"
              @click="handleDeleteEditingBudget"
            >
              <Trash2 class="w-4 h-4" />
              <span>Hapus</span>
            </button>
            <div v-else></div>

            <div class="flex items-center gap-2">
              <button
                type="button"
                class="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300"
                @click="showBudgetForm = false"
              >
                Batal
              </button>
              <button
                type="submit"
                class="min-h-[44px] px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5"
              >
                <Check class="w-4 h-4" />
                <span>Simpan Anggaran</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>

    <!-- =================================================================== -->
    <!-- MODAL 2: Detail & Ubah Kategori Kustom                              -->
    <!-- =================================================================== -->
    <div
      v-if="editingCategory"
      class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4"
      @click.self="editingCategory = null"
    >
      <div class="w-full max-w-md rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 p-5 shadow-xl space-y-4">
        <div class="w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto sm:hidden"></div>
        <div class="flex items-center justify-between gap-2">
          <h2 class="text-base font-bold text-slate-900 dark:text-slate-100">
            Ubah Kategori Kustom
          </h2>
          <button
            type="button"
            class="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            @click="editingCategory = null"
          >
            <X class="w-5 h-5" />
          </button>
        </div>

        <form class="space-y-3.5" @submit.prevent="handleSaveEditCategory">
          <div>
            <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Nama Kategori
            </label>
            <input
              v-model="editCatName"
              type="text"
              required
              maxlength="50"
              class="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
            />
          </div>

          <div>
            <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Jenis Kategori
            </label>
            <select
              v-model="editCatType"
              class="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
            >
              <option value="expense">Pengeluaran</option>
              <option value="income">Pemasukan</option>
            </select>
          </div>

          <div class="pt-2 flex items-center justify-between gap-2">
            <button
              type="button"
              class="min-h-[44px] px-3.5 py-2 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-center gap-1.5"
              @click="handleDeleteEditingCategory"
            >
              <Trash2 class="w-4 h-4" />
              <span>Hapus</span>
            </button>

            <div class="flex items-center gap-2">
              <button
                type="button"
                class="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300"
                @click="editingCategory = null"
              >
                Batal
              </button>
              <button
                type="submit"
                class="min-h-[44px] px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5"
              >
                <Check class="w-4 h-4" />
                <span>Simpan</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
