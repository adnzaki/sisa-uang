<script setup lang="ts">
import { ref, computed } from 'vue';
import { RouterLink } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { Plus, Check, Trash2, Tags } from 'lucide-vue-next';
import { useFinanceStore } from '../stores/finance';
import { useThemeStore } from '../stores/theme';
import AppModal from '../components/AppModal.vue';
import CustomSelect, { type SelectOptionItem } from '../components/CustomSelect.vue';

const { t } = useI18n();
const financeStore = useFinanceStore();
const themeStore = useThemeStore();

// Budget Modal (Used for both Add and Edit Budget when tapping a budget card)
const showBudgetForm = ref(false);
const isEditingBudget = ref(false);
const editingBudgetId = ref<string | null>(null);
const category = ref(financeStore.expenseCategoryNames[0] || 'Makan dan Minum');
const limitAmount = ref<number | ''>(2000000);

const expenseCategoryOptions = computed<SelectOptionItem[]>(() =>
  financeStore.expenseCategoryNames.map((cat) => ({
    value: cat,
    label: cat,
    badge: 'Pengeluaran',
  }))
);

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
</script>

<template>
  <div class="space-y-5 sm:space-y-6 max-w-full overflow-x-hidden">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div class="min-w-0">
        <h1 class="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          {{ t('budgets.title') }}
        </h1>
        <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          {{ t('budgets.subtitle') }} Ketuk kartu anggaran untuk mengubah batasnya secara langsung.
        </p>
      </div>

      <div class="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2 w-full sm:w-auto">
        <RouterLink
          to="/categories"
          class="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-emerald-600 flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
        >
          <Tags class="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Kelola Kategori ({{ financeStore.categories.length }})</span>
        </RouterLink>

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
            class="h-full rounded-full transition-all duration-300"
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
            <div class="font-money font-bold tabular-nums text-slate-900 dark:text-slate-100 mt-0.5 truncate">
              {{ themeStore.formatMoney(b.spentAmount) }}
            </div>
          </div>
          <div class="min-w-0">
            <div class="text-slate-400 truncate">{{ t('budgets.remaining') }}</div>
            <div class="font-money font-bold tabular-nums text-emerald-600 dark:text-emerald-400 mt-0.5 truncate">
              {{ themeStore.formatMoney(b.remaining) }}
            </div>
          </div>
          <div class="text-right min-w-0">
            <div class="text-slate-400 truncate">{{ t('budgets.limit') }}</div>
            <div class="font-money font-bold tabular-nums text-slate-700 dark:text-slate-300 mt-0.5 truncate">
              {{ themeStore.formatMoney(b.limitAmount) }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- =================================================================== -->
    <!-- MODAL: Tambah / Ubah Anggaran Bulanan (AppModal)                    -->
    <!-- =================================================================== -->
    <AppModal
      v-model="showBudgetForm"
      :title="isEditingBudget ? 'Detail & Ubah Anggaran' : 'Atur Batas Anggaran Bulanan'"
      subtitle="Tetapkan batas pengeluaran bulanan untuk kategori pilihan"
    >
      <form id="budget-form" class="space-y-4" @submit.prevent="handleSaveBudget">
        <div>
          <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            Kategori Pengeluaran
          </label>
          <CustomSelect
            v-model="category"
            :options="expenseCategoryOptions"
            :disabled="isEditingBudget"
            searchable
            search-placeholder="Ketik untuk mencari kategori..."
            placeholder="Pilih kategori pengeluaran"
          />
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
            class="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-base font-money font-semibold tabular-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
          />
        </div>
      </form>

      <template #footer>
        <div class="flex items-center justify-between gap-2 w-full">
          <button
            v-if="isEditingBudget && editingBudgetId"
            type="button"
            class="min-h-[46px] px-4 py-2.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors shrink-0"
            @click="handleDeleteEditingBudget"
          >
            <Trash2 class="w-4 h-4 shrink-0" />
            <span>Hapus</span>
          </button>
          <div v-else></div>

          <button
            type="submit"
            form="budget-form"
            class="flex-1 sm:flex-initial min-h-[46px] px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-colors shadow-xs"
          >
            <Check class="w-4 h-4 shrink-0" />
            <span>Simpan Anggaran</span>
          </button>
        </div>
      </template>
    </AppModal>
  </div>
</template>
