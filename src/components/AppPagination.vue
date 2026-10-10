<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-vue-next';

const props = withDefaults(
  defineProps<{
    currentPage: number;
    totalItems: number;
    pageSize?: number;
    itemLabel?: string;
  }>(),
  {
    pageSize: 25,
    itemLabel: 'data',
  }
);

const emit = defineEmits<{
  (e: 'update:currentPage', page: number): void;
}>();

const totalPages = computed(() =>
  Math.max(1, Math.ceil(props.totalItems / props.pageSize))
);

const safeCurrentPage = computed(() =>
  Math.min(Math.max(1, props.currentPage), totalPages.value)
);

const pageInputText = ref<string>(String(safeCurrentPage.value));

watch(
  [safeCurrentPage, totalPages],
  ([nextPage]) => {
    pageInputText.value = String(nextPage);
  },
  { immediate: true }
);

const startItem = computed(() => {
  if (props.totalItems === 0) return 0;
  return (safeCurrentPage.value - 1) * props.pageSize + 1;
});

const endItem = computed(() => {
  if (props.totalItems === 0) return 0;
  return Math.min(safeCurrentPage.value * props.pageSize, props.totalItems);
});

function goToPage(page: number) {
  const clamped = Math.min(Math.max(1, page), totalPages.value);
  pageInputText.value = String(clamped);
  if (clamped !== props.currentPage) {
    emit('update:currentPage', clamped);
  }
}

function submitPageJump(event?: Event) {
  const raw = pageInputText.value.replace(/\D/g, '').trim();
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    pageInputText.value = String(safeCurrentPage.value);
  } else {
    goToPage(parsed);
  }
  if (event && event.target instanceof HTMLInputElement) {
    event.target.blur();
  }
}

function handlePageInputFocus(event: FocusEvent) {
  if (event.target instanceof HTMLInputElement) {
    event.target.select();
  }
}

function handlePageInputEscape(event: KeyboardEvent) {
  pageInputText.value = String(safeCurrentPage.value);
  if (event.target instanceof HTMLInputElement) {
    event.target.blur();
  }
}
</script>

<template>
  <nav
    v-if="totalItems > 0"
    aria-label="Navigasi Halaman"
    class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-3.5 py-3 sm:px-5 sm:py-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 w-full"
  >
    <!-- Info Ringkasan Baris Data -->
    <div class="text-xs text-slate-600 dark:text-slate-400 text-center sm:text-left">
      Menampilkan
      <span class="font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums">
        {{ startItem }}–{{ endItem }}
      </span>
      dari
      <span class="font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
        {{ totalItems }}
      </span>
      {{ itemLabel }}
    </div>

    <!-- Kontrol Navigasi Halaman Kompak (Seragam di Semua Ukuran Layar) -->
    <div v-if="totalPages > 1" class="flex items-center justify-center gap-1.5 w-full sm:w-auto">
      <!-- Ke Halaman Pertama -->
      <button
        type="button"
        :disabled="safeCurrentPage <= 1"
        title="Halaman Pertama"
        aria-label="Halaman Pertama"
        class="w-9 h-9 min-w-[36px] min-h-[36px] rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400 disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center transition-colors cursor-pointer shrink-0"
        @click="goToPage(1)"
      >
        <ChevronsLeft class="w-4 h-4" />
      </button>

      <!-- Halaman Sebelumnya (Ikon Saja) -->
      <button
        type="button"
        :disabled="safeCurrentPage <= 1"
        title="Halaman Sebelumnya"
        aria-label="Halaman Sebelumnya"
        class="w-9 h-9 min-w-[36px] min-h-[36px] rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400 disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center transition-colors cursor-pointer shrink-0"
        @click="goToPage(safeCurrentPage - 1)"
      >
        <ChevronLeft class="w-4 h-4 shrink-0" />
      </button>

      <!-- Indikator & Input Lompat Halaman (Hal [X] / Y) -->
      <div
        class="flex items-center justify-center gap-1.5 px-2.5 h-9 min-h-[36px] rounded-xl bg-slate-100 dark:bg-slate-800/90 text-xs font-mono font-bold text-slate-800 dark:text-slate-200 tabular-nums shrink-0"
      >
        <span class="text-slate-500 dark:text-slate-400 font-semibold select-none">Hal</span>
        <input
          v-model="pageInputText"
          type="text"
          inputmode="numeric"
          pattern="[0-9]*"
          :aria-label="`Ketik nomor halaman (1 sampai ${totalPages})`"
          :title="`Ketik nomor halaman lalu tekan Enter (1–${totalPages})`"
          class="w-11 h-6 rounded-lg border border-slate-300/90 dark:border-slate-700 bg-white dark:bg-slate-900 px-1.5 text-center font-mono text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all tabular-nums"
          @focus="handlePageInputFocus"
          @keydown.enter.prevent="submitPageJump"
          @keydown.esc.prevent="handlePageInputEscape"
          @blur="submitPageJump"
        />
        <span class="text-slate-400 dark:text-slate-500 select-none">/</span>
        <span>{{ totalPages }}</span>
      </div>

      <!-- Halaman Berikutnya (Ikon Saja) -->
      <button
        type="button"
        :disabled="safeCurrentPage >= totalPages"
        title="Halaman Berikutnya"
        aria-label="Halaman Berikutnya"
        class="w-9 h-9 min-w-[36px] min-h-[36px] rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400 disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center transition-colors cursor-pointer shrink-0"
        @click="goToPage(safeCurrentPage + 1)"
      >
        <ChevronRight class="w-4 h-4 shrink-0" />
      </button>

      <!-- Ke Halaman Terakhir -->
      <button
        type="button"
        :disabled="safeCurrentPage >= totalPages"
        title="Halaman Terakhir"
        aria-label="Halaman Terakhir"
        class="w-9 h-9 min-w-[36px] min-h-[36px] rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400 disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center transition-colors cursor-pointer shrink-0"
        @click="goToPage(totalPages)"
      >
        <ChevronsRight class="w-4 h-4" />
      </button>
    </div>
  </nav>
</template>
