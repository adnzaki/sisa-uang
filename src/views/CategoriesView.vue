<script setup lang="ts">
import { ref, computed } from 'vue';
import { RouterLink } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
  Tags,
  Plus,
  Check,
  Trash2,
  Search,
  X,
  ArrowDownLeft,
  ArrowUpRight,
  PieChart,
} from 'lucide-vue-next';
import { useFinanceStore, CategoryItem } from '../stores/finance';
import AppModal from '../components/AppModal.vue';
import CustomSelect, { type SelectOptionItem } from '../components/CustomSelect.vue';

const { t } = useI18n();
const financeStore = useFinanceStore();

// Add New Custom Category Form State
const newCatName = ref('');
const newCatType = ref<'expense' | 'income'>('expense');
const showAddCategoryModal = ref(false);

// Search & Filter State
const searchQuery = ref('');
const filterSource = ref<'all' | 'custom' | 'default'>('all');

// Edit Custom Category Modal State
const editingCategory = ref<CategoryItem | null>(null);
const editCatName = ref('');
const editCatType = ref<'expense' | 'income'>('expense');

const isEditCategoryOpen = computed({
  get: () => editingCategory.value !== null,
  set: (val: boolean) => {
    if (!val) editingCategory.value = null;
  },
});

const categoryTypeOptions = computed<SelectOptionItem[]>(() => [
  { value: 'expense', label: 'Pengeluaran', badge: 'KELUAR' },
  { value: 'income', label: 'Pemasukan', badge: 'MASUK' },
]);

const sourceFilterOptions = computed<SelectOptionItem[]>(() => [
  {
    value: 'all',
    label: `Semua Kategori (${financeStore.categories.length})`,
  },
  {
    value: 'custom',
    label: `Kategori Kustom (${financeStore.userCategories.length})`,
    badge: 'KUSTOM',
  },
  {
    value: 'default',
    label: `Kategori Bawaan (${financeStore.defaultCategories.length})`,
    badge: 'BAWAAN',
  },
]);

const filteredCategories = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  return financeStore.categories.filter((cat) => {
    if (filterSource.value === 'custom' && cat.isDefault) return false;
    if (filterSource.value === 'default' && !cat.isDefault) return false;
    if (q && !cat.name.toLowerCase().includes(q)) return false;
    return true;
  });
});

const expenseCategories = computed(() =>
  filteredCategories.value.filter((c) => c.type === 'expense')
);

const incomeCategories = computed(() =>
  filteredCategories.value.filter((c) => c.type === 'income')
);

function openAddModal(defaultType: 'expense' | 'income' = 'expense') {
  newCatName.value = '';
  newCatType.value = defaultType;
  showAddCategoryModal.value = true;
}

async function handleAddCategory() {
  if (!newCatName.value.trim()) return;
  await financeStore.addCategory({
    name: newCatName.value.trim(),
    type: newCatType.value,
  });
  newCatName.value = '';
  showAddCategoryModal.value = false;
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
  <div class="w-full max-w-full space-y-5 sm:space-y-6 overflow-x-hidden">
    <!-- Page Header -->
    <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5 w-full">
      <div class="min-w-0 flex-1">
        <h1 class="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          {{ t('categories.title') }}
        </h1>
        <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          {{ t('categories.subtitle') }}
        </p>
      </div>

      <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full lg:w-auto shrink-0">
        <RouterLink
          to="/budgets"
          class="h-[46px] min-h-[46px] px-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 hover:border-emerald-600 flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0"
        >
          <PieChart class="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Ke Menu Anggaran</span>
        </RouterLink>

        <button
          type="button"
          class="h-[46px] min-h-[46px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-colors whitespace-nowrap shadow-xs shrink-0"
          @click="openAddModal('expense')"
        >
          <Plus class="w-4 h-4 shrink-0" />
          <span>Tambah Kategori Kustom</span>
        </button>
      </div>
    </div>

    <!-- Summary Card + Inline Quick Add Form -->
    <section class="w-full rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
        <div class="flex items-center gap-2.5 min-w-0">
          <div class="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <Tags class="w-4.5 h-4.5" />
          </div>
          <div class="min-w-0">
            <h2 class="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
              Tambah Kategori Kustom Cepat
            </h2>
            <p class="text-xs text-slate-500 dark:text-slate-400">
              Total {{ financeStore.categories.length }} kategori aktif ({{ financeStore.userCategories.length }} Kustom · {{ financeStore.defaultCategories.length }} Bawaan Sistem)
            </p>
          </div>
        </div>
      </div>

      <form class="grid grid-cols-1 md:grid-cols-12 gap-3 items-stretch w-full" @submit.prevent="handleAddCategory">
        <div class="md:col-span-6 w-full min-w-0">
          <input
            v-model="newCatName"
            type="text"
            required
            maxlength="50"
            placeholder="Nama kategori kustom baru (Contoh: Belanja Dapur, Sedekah, Royalti...)"
            class="w-full h-[46px] min-h-[46px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-emerald-600 transition-colors"
          />
        </div>
        <div class="md:col-span-3 w-full min-w-0">
          <CustomSelect
            v-model="newCatType"
            :options="categoryTypeOptions"
            placeholder=""
            aria-label="Jenis Kategori"
          />
        </div>
        <div class="md:col-span-3 w-full min-w-0">
          <button
            type="submit"
            class="w-full h-[46px] min-h-[46px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-colors shadow-2xs whitespace-nowrap"
          >
            <Plus class="w-4 h-4 shrink-0" />
            <span>Tambah Kategori</span>
          </button>
        </div>
      </form>
    </section>

    <!-- Search & Filter Bar -->
    <div class="grid grid-cols-1 md:grid-cols-12 gap-3 items-stretch w-full">
      <div class="md:col-span-8 w-full min-w-0">
        <div class="w-full h-[46px] min-h-[46px] px-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-3 focus-within:border-emerald-600 transition-colors">
          <Search class="w-4 h-4 text-slate-400 shrink-0" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Cari nama kategori pengeluaran atau pemasukan..."
            class="flex-1 w-full min-w-0 bg-transparent border-0 text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
          />
          <button
            v-if="searchQuery"
            type="button"
            class="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0 transition-colors"
            title="Bersihkan pencarian"
            @click="searchQuery = ''"
          >
            <X class="w-4 h-4" />
          </button>
        </div>
      </div>

      <div class="md:col-span-4 w-full min-w-0">
        <CustomSelect
          v-model="filterSource"
          :options="sourceFilterOptions"
          placeholder=""
          aria-label="Filter Sumber Kategori"
        />
      </div>
    </div>

    <!-- Category Lists Grid (Fixed Header Outside Scroll Container so Title Never Collides with Items) -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5 w-full">
      <!-- 1. Expense Categories Card -->
      <div class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col overflow-hidden shadow-2xs">
        <!-- Fixed Non-Scrolling Card Header -->
        <div class="px-4 py-3.5 border-b border-slate-200/80 dark:border-slate-800 bg-rose-50/40 dark:bg-slate-900 flex items-center justify-between gap-2 shrink-0">
          <div class="flex items-center gap-2 min-w-0">
            <div class="w-7 h-7 rounded-lg bg-rose-100 dark:bg-rose-950/70 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
              <ArrowUpRight class="w-4 h-4" />
            </div>
            <h3 class="text-xs sm:text-sm font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 truncate">
              Kategori Pengeluaran ({{ expenseCategories.length }})
            </h3>
          </div>

          <button
            type="button"
            class="min-h-[32px] px-2.5 py-1 rounded-lg bg-rose-100/80 dark:bg-rose-950/60 hover:bg-rose-200/70 text-rose-700 dark:text-rose-300 text-[11px] font-bold flex items-center gap-1 shrink-0 transition-colors"
            @click="openAddModal('expense')"
          >
            <Plus class="w-3.5 h-3.5" />
            <span>Tambah</span>
          </button>
        </div>

        <!-- Dedicated Scrollable List Body -->
        <div class="p-3.5 space-y-2 max-h-[460px] overflow-y-auto overscroll-contain">
          <div
            v-if="expenseCategories.length === 0"
            class="py-8 text-center text-xs text-slate-400"
          >
            Tidak ada kategori pengeluaran yang cocok dengan pencarian.
          </div>

          <div
            v-for="cat in expenseCategories"
            :key="cat.id"
            :role="cat.isDefault ? undefined : 'button'"
            :tabindex="cat.isDefault ? undefined : 0"
            class="min-h-[48px] px-3.5 py-2.5 rounded-xl border flex items-center justify-between text-xs sm:text-sm gap-2 transition-all"
            :class="
              cat.isDefault
                ? 'border-slate-100 dark:border-slate-800/70 bg-slate-50/50 dark:bg-slate-950/30'
                : 'border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-950/80 hover:border-emerald-500/50 active:scale-[0.99] cursor-pointer'
            "
            @click="openEditCategoryModal(cat)"
            @keydown.enter="openEditCategoryModal(cat)"
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
              class="w-10 h-10 min-w-[40px] min-h-[40px] rounded-xl border border-rose-200/70 dark:border-rose-900/50 bg-rose-50/70 dark:bg-rose-950/30 hover:bg-rose-100 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 transition-colors"
              title="Hapus kategori kustom"
              @click.stop="financeStore.removeCategory(cat.id)"
            >
              <Trash2 class="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <!-- 2. Income Categories Card -->
      <div class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col overflow-hidden shadow-2xs">
        <!-- Fixed Non-Scrolling Card Header -->
        <div class="px-4 py-3.5 border-b border-slate-200/80 dark:border-slate-800 bg-emerald-50/40 dark:bg-slate-900 flex items-center justify-between gap-2 shrink-0">
          <div class="flex items-center gap-2 min-w-0">
            <div class="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <ArrowDownLeft class="w-4 h-4" />
            </div>
            <h3 class="text-xs sm:text-sm font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 truncate">
              Kategori Pemasukan ({{ incomeCategories.length }})
            </h3>
          </div>

          <button
            type="button"
            class="min-h-[32px] px-2.5 py-1 rounded-lg bg-emerald-100/80 dark:bg-emerald-950/60 hover:bg-emerald-200/70 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold flex items-center gap-1 shrink-0 transition-colors"
            @click="openAddModal('income')"
          >
            <Plus class="w-3.5 h-3.5" />
            <span>Tambah</span>
          </button>
        </div>

        <!-- Dedicated Scrollable List Body -->
        <div class="p-3.5 space-y-2 max-h-[460px] overflow-y-auto overscroll-contain">
          <div
            v-if="incomeCategories.length === 0"
            class="py-8 text-center text-xs text-slate-400"
          >
            Tidak ada kategori pemasukan yang cocok dengan pencarian.
          </div>

          <div
            v-for="cat in incomeCategories"
            :key="cat.id"
            :role="cat.isDefault ? undefined : 'button'"
            :tabindex="cat.isDefault ? undefined : 0"
            class="min-h-[48px] px-3.5 py-2.5 rounded-xl border flex items-center justify-between text-xs sm:text-sm gap-2 transition-all"
            :class="
              cat.isDefault
                ? 'border-slate-100 dark:border-slate-800/70 bg-slate-50/50 dark:bg-slate-950/30'
                : 'border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-950/80 hover:border-emerald-500/50 active:scale-[0.99] cursor-pointer'
            "
            @click="openEditCategoryModal(cat)"
            @keydown.enter="openEditCategoryModal(cat)"
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
              class="w-10 h-10 min-w-[40px] min-h-[40px] rounded-xl border border-rose-200/70 dark:border-rose-900/50 bg-rose-50/70 dark:bg-rose-950/30 hover:bg-rose-100 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 transition-colors"
              title="Hapus kategori kustom"
              @click.stop="financeStore.removeCategory(cat.id)"
            >
              <Trash2 class="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- =================================================================== -->
    <!-- MODAL 1: Tambah Kategori Kustom Baru (AppModal)                     -->
    <!-- =================================================================== -->
    <AppModal
      v-model="showAddCategoryModal"
      title="Tambah Kategori Kustom Baru"
    >
      <form id="add-category-modal-form" class="space-y-3.5" @submit.prevent="handleAddCategory">
        <input
          v-model="newCatName"
          type="text"
          required
          maxlength="50"
          placeholder="Nama Kategori Kustom (Misal: Belanja Dapur, Sedekah)"
          class="w-full min-h-[54px] sm:min-h-[50px] px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 text-sm sm:text-base text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:outline-none focus:border-emerald-600"
        />

        <CustomSelect
          v-model="newCatType"
          :options="categoryTypeOptions"
          placeholder=""
          aria-label="Jenis Kategori"
        />
      </form>

      <template #footer>
        <div class="flex items-center justify-end w-full">
          <button
            type="submit"
            form="add-category-modal-form"
            class="w-full sm:w-auto min-h-[48px] px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-colors shadow-xs"
          >
            <Check class="w-4 h-4 shrink-0" />
            <span>Simpan Kategori</span>
          </button>
        </div>
      </template>
    </AppModal>

    <!-- =================================================================== -->
    <!-- MODAL 2: Detail & Ubah Kategori Kustom (AppModal)                   -->
    <!-- =================================================================== -->
    <AppModal
      v-model="isEditCategoryOpen"
      title="Ubah Kategori Kustom"
    >
      <form
        v-if="editingCategory"
        id="edit-category-modal-form"
        class="space-y-3.5"
        @submit.prevent="handleSaveEditCategory"
      >
        <input
          v-model="editCatName"
          type="text"
          required
          maxlength="50"
          placeholder="Nama Kategori"
          class="w-full min-h-[54px] sm:min-h-[50px] px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 text-sm sm:text-base text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:outline-none focus:border-emerald-600"
        />

        <CustomSelect
          v-model="editCatType"
          :options="categoryTypeOptions"
          placeholder=""
          aria-label="Jenis Kategori"
        />
      </form>

      <template #footer>
        <div class="flex items-center justify-between gap-2 w-full">
          <button
            type="button"
            class="min-h-[46px] px-4 py-2.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors shrink-0"
            @click="handleDeleteEditingCategory"
          >
            <Trash2 class="w-4 h-4 shrink-0" />
            <span>Hapus</span>
          </button>

          <button
            type="submit"
            form="edit-category-modal-form"
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
