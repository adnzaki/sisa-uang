<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Plus, Check, Trash2, X, Tags } from 'lucide-vue-next';
import { useFinanceStore } from '../stores/finance';
import { useThemeStore } from '../stores/theme';

const { t } = useI18n();
const financeStore = useFinanceStore();
const themeStore = useThemeStore();

const showBudgetForm = ref(false);
const category = ref(financeStore.expenseCategoryNames[0] || 'Makan dan Minum');
const limitAmount = ref<number | ''>(2000000);

// Category Management State
const showCategoryManager = ref(true);
const newCatName = ref('');
const newCatType = ref<'expense' | 'income'>('expense');

async function handleSaveBudget() {
  const num = Number(limitAmount.value || 0);
  if (num <= 0) return;
  await financeStore.saveBudget({
    category: category.value,
    limitAmount: num,
  });
  showBudgetForm.value = false;
}

async function handleAddCategory() {
  if (!newCatName.value.trim()) return;
  await financeStore.addCategory({
    name: newCatName.value.trim(),
    type: newCatType.value,
  });
  newCatName.value = '';
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl sm:text-3xl font-display italic text-slate-900 dark:text-slate-100">
          {{ t('budgets.title') }} & Kategori
        </h1>
        <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
          Kelola daftar kategori transaksi (kustom milik Anda & bawaan SisaUang) serta batas anggaran bulanan.
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-2 self-start sm:self-auto">
        <button
          type="button"
          class="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-emerald-600 flex items-center gap-1.5 transition-colors whitespace-nowrap"
          @click="showCategoryManager = !showCategoryManager"
        >
          <Tags class="w-4 h-4 text-emerald-600" />
          <span>Manajemen Kategori ({{ financeStore.categories.length }})</span>
        </button>

        <button
          type="button"
          class="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
          @click="showBudgetForm = !showBudgetForm"
        >
          <Plus class="w-4 h-4" />
          <span>{{ t('budgets.addBudget') }}</span>
        </button>
      </div>
    </div>

    <!-- Category Management Panel (Manajemen Kategori SisaUang) -->
    <section
      v-if="showCategoryManager"
      class="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4"
    >
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Manajemen Kategori Transaksi ({{ financeStore.userCategories.length }} Kustom · {{ financeStore.defaultCategories.length }} Bawaan)
          </h2>
          <p class="text-xs text-slate-500 dark:text-slate-400">
            Menampilkan gabungan kategori pribadi Anda dan kategori bawaan sistem (<code>default_category</code>) dari Firestore.
          </p>
        </div>
        <button
          type="button"
          class="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400"
          @click="showCategoryManager = false"
        >
          <X class="w-4 h-4" />
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
            placeholder="Contoh: Belanja Kebutuhan Istri, Sedekah, Royalti..."
            class="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
          />
        </div>
        <div class="sm:col-span-3">
          <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            Jenis Kategori
          </label>
          <select
            v-model="newCatType"
            class="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
          >
            <option value="expense">Pengeluaran (Expense)</option>
            <option value="income">Pemasukan (Income)</option>
          </select>
        </div>
        <div class="sm:col-span-3">
          <button
            type="submit"
            class="w-full min-h-[42px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5"
          >
            <Plus class="w-4 h-4" />
            <span>Tambah Kategori</span>
          </button>
        </div>
      </form>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
        <!-- Expense Categories -->
        <div class="rounded-xl border border-slate-200/70 dark:border-slate-800 p-3.5 space-y-2 max-h-80 overflow-y-auto">
          <div class="text-xs font-semibold text-rose-600 dark:text-rose-400 sticky top-0 bg-white dark:bg-slate-900 py-1">
            Kategori Pengeluaran ({{ financeStore.categories.filter((c) => c.type === 'expense').length }})
          </div>
          <div class="divide-y divide-slate-100 dark:divide-slate-800/70">
            <div
              v-for="cat in financeStore.categories.filter((c) => c.type === 'expense')"
              :key="cat.id"
              class="py-1.5 flex items-center justify-between text-xs gap-2"
            >
              <div class="flex items-center gap-2 min-w-0">
                <span class="text-slate-800 dark:text-slate-200 truncate">{{ cat.name }}</span>
                <span
                  v-if="cat.isDefault"
                  class="text-[10px] text-slate-400 dark:text-slate-500 font-mono shrink-0"
                >
                  · Bawaan
                </span>
                <span
                  v-else
                  class="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono shrink-0"
                >
                  · Kustom
                </span>
              </div>
              <button
                v-if="!cat.isDefault"
                type="button"
                class="p-1 text-slate-400 hover:text-rose-600 shrink-0"
                title="Hapus kategori kustom"
                @click="financeStore.removeCategory(cat.id)"
              >
                <Trash2 class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        <!-- Income Categories -->
        <div class="rounded-xl border border-slate-200/70 dark:border-slate-800 p-3.5 space-y-2 max-h-80 overflow-y-auto">
          <div class="text-xs font-semibold text-emerald-600 dark:text-emerald-400 sticky top-0 bg-white dark:bg-slate-900 py-1">
            Kategori Pemasukan ({{ financeStore.categories.filter((c) => c.type === 'income').length }})
          </div>
          <div class="divide-y divide-slate-100 dark:divide-slate-800/70">
            <div
              v-for="cat in financeStore.categories.filter((c) => c.type === 'income')"
              :key="cat.id"
              class="py-1.5 flex items-center justify-between text-xs gap-2"
            >
              <div class="flex items-center gap-2 min-w-0">
                <span class="text-slate-800 dark:text-slate-200 truncate">{{ cat.name }}</span>
                <span
                  v-if="cat.isDefault"
                  class="text-[10px] text-slate-400 dark:text-slate-500 font-mono shrink-0"
                >
                  · Bawaan
                </span>
                <span
                  v-else
                  class="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono shrink-0"
                >
                  · Kustom
                </span>
              </div>
              <button
                v-if="!cat.isDefault"
                type="button"
                class="p-1 text-slate-400 hover:text-rose-600 shrink-0"
                title="Hapus kategori kustom"
                @click="financeStore.removeCategory(cat.id)"
              >
                <Trash2 class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Add/Update Budget Form -->
    <form
      v-if="showBudgetForm"
      class="rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-white dark:bg-slate-900 p-5 space-y-4"
      @submit.prevent="handleSaveBudget"
    >
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Atur Batas Anggaran Kategori Bulanan
        </h2>
        <button
          type="button"
          class="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400"
          @click="showBudgetForm = false"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
            Kategori Pengeluaran
          </label>
          <select
            v-model="category"
            class="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
          >
            <option v-for="cat in financeStore.expenseCategoryNames" :key="cat" :value="cat">
              {{ cat }}
            </option>
          </select>
        </div>

        <div>
          <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
            {{ t('budgets.limit') }} Bulanan (IDR)
          </label>
          <input
            v-model.number="limitAmount"
            type="number"
            min="10000"
            step="any"
            required
            class="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
          />
        </div>
      </div>

      <div class="flex items-center justify-end gap-2">
        <button
          type="button"
          class="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300"
          @click="showBudgetForm = false"
        >
          Batal
        </button>
        <button
          type="submit"
          class="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5"
        >
          <Check class="w-4 h-4" />
          <span>Simpan Anggaran</span>
        </button>
      </div>
    </form>

    <!-- Budgets Empty State or Grid -->
    <div
      v-if="financeStore.enrichedBudgets.length === 0"
      class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center space-y-3"
    >
      <h3 class="text-sm font-semibold text-slate-900 dark:text-slate-100">
        Belum Ada Batas Anggaran di Firestore
      </h3>
      <p class="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
        Koleksi <code>budgets</code> untuk akun ini masih kosong. Klik tombol di bawah untuk menetapkan batas anggaran pengeluaran bulanan pada salah satu kategori Anda.
      </p>
      <button
        type="button"
        class="min-h-[42px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
        @click="showBudgetForm = true"
      >
        <Plus class="w-4 h-4" />
        <span>{{ t('budgets.addBudget') }}</span>
      </button>
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div
        v-for="b in financeStore.enrichedBudgets"
        :key="b.id"
        class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4"
      >
        <div class="flex items-start justify-between gap-2">
          <div>
            <h3 class="text-base font-semibold text-slate-900 dark:text-slate-100">
              {{ b.category }}
            </h3>
            <div class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Periode {{ b.period }}
              <span class="mx-1.5" aria-hidden="true">·</span>
              <span>{{ b.percentage }}% terpakai</span>
            </div>
          </div>

          <button
            type="button"
            class="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
            title="Hapus Anggaran"
            @click="financeStore.removeBudget(b.id)"
          >
            <Trash2 class="w-4 h-4" />
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

        <div class="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
          <div>
            <div class="text-slate-400">{{ t('budgets.spent') }}</div>
            <div class="font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">
              {{ themeStore.formatMoney(b.spentAmount) }}
            </div>
          </div>
          <div>
            <div class="text-slate-400">{{ t('budgets.remaining') }}</div>
            <div class="font-mono font-semibold tabular-nums text-emerald-600 dark:text-emerald-400 mt-0.5">
              {{ themeStore.formatMoney(b.remaining) }}
            </div>
          </div>
          <div class="text-right">
            <div class="text-slate-400">{{ t('budgets.limit') }}</div>
            <div class="font-mono font-semibold tabular-nums text-slate-700 dark:text-slate-300 mt-0.5">
              {{ themeStore.formatMoney(b.limitAmount) }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
