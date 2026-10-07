<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { Calendar, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-vue-next';

const props = withDefaults(
  defineProps<{
    modelValue: string; // YYYY-MM-DD
    label?: string;
    disabled?: boolean;
  }>(),
  {
    label: 'Pilih Tanggal',
    disabled: false,
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();

const isOpen = ref(false);
const viewMode = ref<'days' | 'years'>('days');

function parseIsoDate(iso: string): Date {
  const parts = String(iso || '').slice(0, 10).split('-');
  if (parts.length === 3) {
    const y = Number(parts[0]);
    const m = Number(parts[1]);
    const d = Number(parts[2]);
    if (y && m && d) {
      return new Date(y, m - 1, d);
    }
  }
  return new Date();
}

function toIsoDateString(dt: Date): string {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const tempSelectedIso = ref<string>(props.modelValue || toIsoDateString(new Date()));
const currentViewMonth = ref<number>(parseIsoDate(props.modelValue).getMonth());
const currentViewYear = ref<number>(parseIsoDate(props.modelValue).getFullYear());

watch(
  () => props.modelValue,
  (val) => {
    if (val) {
      const parsed = parseIsoDate(val);
      tempSelectedIso.value = val.slice(0, 10);
      currentViewMonth.value = parsed.getMonth();
      currentViewYear.value = parsed.getFullYear();
    }
  }
);

function openPicker() {
  if (props.disabled) return;
  const parsed = parseIsoDate(props.modelValue);
  tempSelectedIso.value = props.modelValue ? props.modelValue.slice(0, 10) : toIsoDateString(parsed);
  currentViewMonth.value = parsed.getMonth();
  currentViewYear.value = parsed.getFullYear();
  viewMode.value = 'days';
  isOpen.value = true;
}

const formattedTriggerDate = computed(() => {
  const dt = parseIsoDate(props.modelValue);
  return dt.toLocaleDateString('id-ID', {
    weekday: 'short',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
});

const formattedHeaderHeadline = computed(() => {
  const dt = parseIsoDate(tempSelectedIso.value);
  return dt.toLocaleDateString('id-ID', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
});

const monthYearLabel = computed(() => {
  const dt = new Date(currentViewYear.value, currentViewMonth.value, 1);
  return dt.toLocaleDateString('id-ID', {
    month: 'long',
    year: 'numeric',
  });
});

const weekDayInitials = ['M', 'S', 'S', 'R', 'K', 'J', 'S'];

interface CalendarCell {
  iso: string;
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
}

const calendarCells = computed<CalendarCell[]>(() => {
  const year = currentViewYear.value;
  const month = currentViewMonth.value;
  const firstDayOfMonth = new Date(year, month, 1);
  const startDayOfWeek = firstDayOfMonth.getDay(); // 0 = Sun ... 6 = Sat
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const todayIso = toIsoDateString(new Date());
  const selectedIso = tempSelectedIso.value;

  const cells: CalendarCell[] = [];

  // Previous month trailing days
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const d = daysInPrevMonth - i;
    const dt = new Date(year, month - 1, d);
    const iso = toIsoDateString(dt);
    cells.push({
      iso,
      dayNumber: d,
      isCurrentMonth: false,
      isToday: iso === todayIso,
      isSelected: iso === selectedIso,
    });
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(year, month, d);
    const iso = toIsoDateString(dt);
    cells.push({
      iso,
      dayNumber: d,
      isCurrentMonth: true,
      isToday: iso === todayIso,
      isSelected: iso === selectedIso,
    });
  }

  // Next month leading days to fill 42 cells (6 rows)
  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    const dt = new Date(year, month + 1, d);
    const iso = toIsoDateString(dt);
    cells.push({
      iso,
      dayNumber: d,
      isCurrentMonth: false,
      isToday: iso === todayIso,
      isSelected: iso === selectedIso,
    });
  }

  return cells;
});

const yearRangeList = computed<number[]>(() => {
  const currentY = new Date().getFullYear();
  const years: number[] = [];
  for (let y = currentY - 15; y <= currentY + 5; y++) {
    years.push(y);
  }
  return years;
});

function prevMonth() {
  if (currentViewMonth.value === 0) {
    currentViewMonth.value = 11;
    currentViewYear.value -= 1;
  } else {
    currentViewMonth.value -= 1;
  }
}

function nextMonth() {
  if (currentViewMonth.value === 11) {
    currentViewMonth.value = 0;
    currentViewYear.value += 1;
  } else {
    currentViewMonth.value += 1;
  }
}

function selectDayCell(cell: CalendarCell) {
  tempSelectedIso.value = cell.iso;
  if (!cell.isCurrentMonth) {
    const parsed = parseIsoDate(cell.iso);
    currentViewMonth.value = parsed.getMonth();
    currentViewYear.value = parsed.getFullYear();
  }
}

function selectYear(year: number) {
  currentViewYear.value = year;
  const parsed = parseIsoDate(tempSelectedIso.value);
  const updated = new Date(year, currentViewMonth.value, Math.min(parsed.getDate(), 28));
  tempSelectedIso.value = toIsoDateString(updated);
  viewMode.value = 'days';
}

function selectToday() {
  const now = new Date();
  const iso = toIsoDateString(now);
  tempSelectedIso.value = iso;
  currentViewMonth.value = now.getMonth();
  currentViewYear.value = now.getFullYear();
  viewMode.value = 'days';
  emit('update:modelValue', iso);
  isOpen.value = false;
}

function confirmSelection() {
  emit('update:modelValue', tempSelectedIso.value);
  isOpen.value = false;
}
</script>

<template>
  <div class="w-full">
    <!-- Material-Styled Input Trigger Button -->
    <button
      type="button"
      :disabled="disabled"
      class="w-full min-h-[54px] sm:min-h-[50px] px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 hover:border-emerald-500/60 text-left flex items-center justify-between gap-2.5 transition-colors focus:outline-none focus:border-emerald-600 disabled:opacity-50"
      @click="openPicker"
    >
      <div class="flex items-center gap-3 min-w-0">
        <Calendar class="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
        <span class="text-sm sm:text-base font-medium text-slate-900 dark:text-slate-100 truncate">
          {{ formattedTriggerDate }}
        </span>
      </div>
      <span class="text-xs font-money text-slate-400 shrink-0">
        {{ modelValue }}
      </span>
    </button>

    <!-- Google Material Design 3 Date Picker Dialog -->
    <Transition name="modal">
      <div
        v-if="isOpen"
        class="fixed inset-0 z-[85] flex items-center justify-center bg-black/55 backdrop-blur-xs p-4"
        @click.self="isOpen = false"
      >
        <div
          class="modal-panel w-full max-w-[340px] rounded-[28px] bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xl overflow-hidden select-none"
        >
          <!-- Material Design 3 Header -->
          <div class="bg-emerald-600 dark:bg-emerald-700 text-white px-6 pt-5 pb-4 space-y-2">
            <div class="text-[11px] font-semibold uppercase tracking-widest text-emerald-100">
              {{ label }}
            </div>
            <div class="flex items-baseline justify-between gap-2">
              <div class="text-2xl font-bold tracking-tight">
                {{ formattedHeaderHeadline }}
              </div>
            </div>
          </div>

          <!-- Month / Year Bar & Navigation Arrows -->
          <div class="px-4 pt-3 pb-1 flex items-center justify-between">
            <button
              type="button"
              class="min-h-[36px] px-2.5 py-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1 transition-colors"
              @click="viewMode = viewMode === 'days' ? 'years' : 'days'"
            >
              <span>{{ monthYearLabel }}</span>
              <ChevronDown
                class="w-4 h-4 transition-transform duration-200"
                :class="viewMode === 'years' ? 'rotate-180 text-emerald-600' : ''"
              />
            </button>

            <div v-if="viewMode === 'days'" class="flex items-center gap-1">
              <button
                type="button"
                class="w-9 h-9 rounded-full flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                aria-label="Bulan sebelumnya"
                @click="prevMonth"
              >
                <ChevronLeft class="w-4.5 h-4.5" />
              </button>
              <button
                type="button"
                class="w-9 h-9 rounded-full flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                aria-label="Bulan berikutnya"
                @click="nextMonth"
              >
                <ChevronRight class="w-4.5 h-4.5" />
              </button>
            </div>
          </div>

          <!-- VIEW 1: Material 7-Column Calendar Grid -->
          <div v-if="viewMode === 'days'" class="px-4 pb-2">
            <!-- Day-of-Week Initials -->
            <div class="grid grid-cols-7 text-center py-1.5">
              <span
                v-for="(dayInit, idx) in weekDayInitials"
                :key="idx"
                class="text-[11px] font-semibold text-slate-400 dark:text-slate-500"
              >
                {{ dayInit }}
              </span>
            </div>

            <!-- 42 Day Cells -->
            <div class="grid grid-cols-7 gap-y-1 justify-items-center">
              <button
                v-for="cell in calendarCells"
                :key="cell.iso"
                type="button"
                class="w-9 h-9 rounded-full text-xs font-money flex items-center justify-center transition-all"
                :class="[
                  cell.isSelected
                    ? 'bg-emerald-600 text-white font-bold shadow-xs scale-105'
                    : cell.isToday
                    ? 'border border-emerald-600 text-emerald-600 dark:text-emerald-400 font-bold'
                    : cell.isCurrentMonth
                    ? 'text-slate-800 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/60 font-medium'
                    : 'text-slate-300 dark:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800/50',
                ]"
                @click="selectDayCell(cell)"
              >
                {{ cell.dayNumber }}
              </button>
            </div>
          </div>

          <!-- VIEW 2: Material 3-Column Year Picker Grid -->
          <div
            v-else
            class="px-4 py-2 max-h-[252px] overflow-y-auto grid grid-cols-3 gap-2 border-t border-slate-100 dark:border-slate-800"
          >
            <button
              v-for="yr in yearRangeList"
              :key="yr"
              type="button"
              class="h-9 rounded-full text-xs font-money font-semibold flex items-center justify-center transition-colors"
              :class="
                yr === currentViewYear
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              "
              @click="selectYear(yr)"
            >
              {{ yr }}
            </button>
          </div>

          <!-- Material Dialog Action Bar -->
          <div class="px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
            <button
              type="button"
              class="min-h-[36px] px-3 py-1.5 rounded-full text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 transition-colors"
              @click="selectToday"
            >
              Hari Ini
            </button>

            <div class="flex items-center gap-1">
              <button
                type="button"
                class="min-h-[36px] px-3.5 py-1.5 rounded-full text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                @click="isOpen = false"
              >
                Tutup
              </button>
              <button
                type="button"
                class="min-h-[36px] px-4 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors"
                @click="confirmSelection"
              >
                Pilih Tanggal
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>
