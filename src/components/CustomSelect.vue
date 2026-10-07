<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { ChevronDown, Check, Search, X } from 'lucide-vue-next';

export interface SelectOptionItem {
  value: string | number;
  label: string;
  sublabel?: string;
  badge?: string;
}

const props = withDefaults(
  defineProps<{
    modelValue: string | number;
    options: Array<SelectOptionItem | string | number>;
    placeholder?: string;
    searchable?: boolean;
    searchPlaceholder?: string;
    disabled?: boolean;
    size?: 'sm' | 'md';
    accentColor?: 'emerald' | 'indigo' | 'rose';
    ariaLabel?: string;
    allowCustomValue?: boolean;
  }>(),
  {
    placeholder: 'Pilih opsi...',
    searchable: false,
    searchPlaceholder: 'Ketik untuk mencari...',
    disabled: false,
    size: 'md',
    accentColor: 'emerald',
    ariaLabel: 'Pilih opsi',
    allowCustomValue: false,
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: any): void;
  (e: 'change', value: any): void;
}>();

const isOpen = ref(false);
const searchQuery = ref('');
const highlightedIndex = ref(0);
const containerRef = ref<HTMLElement | null>(null);
const searchInputRef = ref<HTMLInputElement | null>(null);
const optionsListRef = ref<HTMLElement | null>(null);

const normalizedOptions = computed<SelectOptionItem[]>(() => {
  return props.options.map((opt) => {
    if (typeof opt === 'object' && opt !== null && 'value' in opt) {
      return opt;
    }
    return {
      value: opt,
      label: String(opt),
    };
  });
});

const selectedOption = computed<SelectOptionItem | undefined>(() => {
  return normalizedOptions.value.find((opt) => opt.value === props.modelValue);
});

const filteredOptions = computed<SelectOptionItem[]>(() => {
  if (!props.searchable || !searchQuery.value.trim()) {
    return normalizedOptions.value;
  }
  const q = searchQuery.value.trim().toLowerCase();
  return normalizedOptions.value.filter(
    (opt) =>
      opt.label.toLowerCase().includes(q) ||
      String(opt.value).toLowerCase().includes(q) ||
      (opt.sublabel && opt.sublabel.toLowerCase().includes(q))
  );
});

watch(filteredOptions, () => {
  highlightedIndex.value = 0;
});

async function openDropdown() {
  if (props.disabled) return;
  isOpen.value = true;
  searchQuery.value = '';
  const idx = normalizedOptions.value.findIndex((o) => o.value === props.modelValue);
  highlightedIndex.value = idx >= 0 ? idx : 0;

  await nextTick();
  if (props.searchable && searchInputRef.value) {
    searchInputRef.value.focus();
  }
}

function closeDropdown() {
  isOpen.value = false;
  searchQuery.value = '';
}

function toggleDropdown() {
  if (props.disabled) return;
  if (isOpen.value) {
    closeDropdown();
  } else {
    openDropdown();
  }
}

function selectOption(opt: SelectOptionItem) {
  emit('update:modelValue', opt.value);
  emit('change', opt.value);
  closeDropdown();
}

function selectCustomSearchValue() {
  const custom = searchQuery.value.trim();
  if (!custom) return;
  emit('update:modelValue', custom);
  emit('change', custom);
  closeDropdown();
}

function handleKeydown(e: KeyboardEvent) {
  if (props.disabled) return;
  if (!isOpen.value) {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault();
      openDropdown();
    }
    return;
  }

  if (e.key === 'Escape') {
    e.preventDefault();
    closeDropdown();
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (filteredOptions.value.length > 0) {
      highlightedIndex.value = (highlightedIndex.value + 1) % filteredOptions.value.length;
      scrollToHighlighted();
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (filteredOptions.value.length > 0) {
      highlightedIndex.value =
        (highlightedIndex.value - 1 + filteredOptions.value.length) %
        filteredOptions.value.length;
      scrollToHighlighted();
    }
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const target = filteredOptions.value[highlightedIndex.value];
    if (target) {
      selectOption(target);
    } else if (props.allowCustomValue && searchQuery.value.trim()) {
      selectCustomSearchValue();
    }
  }
}

function scrollToHighlighted() {
  nextTick(() => {
    if (!optionsListRef.value) return;
    const activeEl = optionsListRef.value.querySelector(
      `[data-opt-idx="${highlightedIndex.value}"]`
    ) as HTMLElement | null;
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  });
}

function handleClickOutside(e: MouseEvent) {
  if (!isOpen.value) return;
  if (containerRef.value && !containerRef.value.contains(e.target as Node)) {
    closeDropdown();
  }
}

onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside);
});

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleClickOutside);
});
</script>

<template>
  <div
    ref="containerRef"
    class="relative w-full min-w-0"
    @keydown="handleKeydown"
  >
    <!-- Trigger Button -->
    <button
      type="button"
      :disabled="disabled"
      :aria-label="ariaLabel"
      :aria-expanded="isOpen"
      class="w-full flex items-center justify-between gap-2 rounded-xl border text-left transition-all duration-150 focus:outline-none disabled:opacity-50"
      :class="[
        size === 'sm' ? 'min-h-[38px] px-3 py-1.5 text-xs' : 'min-h-[44px] px-3.5 py-2 text-xs sm:text-sm',
        isOpen
          ? accentColor === 'indigo'
            ? 'border-indigo-600 ring-2 ring-indigo-500/15 bg-white dark:bg-slate-900'
            : 'border-emerald-600 ring-2 ring-emerald-500/15 bg-white dark:bg-slate-900'
          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700',
      ]"
      @click="toggleDropdown"
    >
      <div class="flex items-center gap-2 min-w-0 flex-1">
        <slot name="icon" />
        <div class="min-w-0 flex-1 truncate">
          <span
            v-if="selectedOption"
            class="font-medium text-slate-900 dark:text-slate-100 truncate"
          >
            {{ selectedOption.label }}
          </span>
          <span
            v-else-if="modelValue !== '' && modelValue !== null && modelValue !== undefined"
            class="font-medium text-slate-900 dark:text-slate-100 truncate"
          >
            {{ modelValue }}
          </span>
          <span v-else class="text-slate-400 dark:text-slate-500 truncate">
            {{ placeholder }}
          </span>
          <span
            v-if="selectedOption?.sublabel"
            class="ml-1.5 text-xs text-slate-500 dark:text-slate-400 font-money"
          >
            {{ selectedOption.sublabel }}
          </span>
        </div>
      </div>

      <ChevronDown
        class="w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200"
        :class="isOpen ? 'rotate-180 text-emerald-600 dark:text-emerald-400' : ''"
      />
    </button>

    <!-- Dropdown Menu Popover -->
    <Transition name="dropdown">
      <div
        v-if="isOpen"
        class="absolute left-0 right-0 mt-1.5 z-[75] rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden"
      >
        <!-- Search Input Bar (Shown when searchable="true") -->
        <div
          v-if="searchable"
          class="p-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/80 sticky top-0 z-10"
        >
          <div class="relative flex items-center">
            <Search class="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none" />
            <input
              ref="searchInputRef"
              v-model="searchQuery"
              type="text"
              :placeholder="searchPlaceholder"
              class="w-full min-h-[38px] pl-8 pr-8 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
              @click.stop
            />
            <button
              v-if="searchQuery"
              type="button"
              class="absolute right-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              @click.stop="searchQuery = ''; searchInputRef?.focus()"
            >
              <X class="w-3.5 h-3.5" />
            </button>
          </div>
          <div class="px-1 pt-1.5 flex items-center justify-between text-[10px] text-slate-400">
            <span>Menampilkan {{ filteredOptions.length }} dari {{ normalizedOptions.length }} pilihan</span>
            <span v-if="searchQuery">Tekan Enter untuk memilih</span>
          </div>
        </div>

        <!-- Options List -->
        <div
          ref="optionsListRef"
          class="max-h-60 overflow-y-auto overscroll-contain p-1.5 space-y-0.5"
        >
          <div
            v-if="filteredOptions.length === 0"
            class="py-5 px-3 text-center space-y-2"
          >
            <p class="text-xs text-slate-500 dark:text-slate-400">
              Tidak ditemukan hasil untuk "<strong>{{ searchQuery }}</strong>"
            </p>
            <button
              v-if="allowCustomValue && searchQuery.trim()"
              type="button"
              class="min-h-[34px] px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
              @click.stop="selectCustomSearchValue"
            >
              <span>Gunakan "{{ searchQuery.trim() }}"</span>
            </button>
          </div>

          <button
            v-for="(opt, idx) in filteredOptions"
            :key="String(opt.value)"
            type="button"
            :data-opt-idx="idx"
            class="w-full min-h-[40px] px-3 py-2 rounded-xl text-left text-xs sm:text-sm flex items-center justify-between gap-2 transition-colors"
            :class="[
              opt.value === modelValue
                ? accentColor === 'indigo'
                  ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-semibold'
                  : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-semibold'
                : idx === highlightedIndex
                ? 'bg-slate-100 dark:bg-slate-800/80 text-slate-900 dark:text-slate-100'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50',
            ]"
            @mouseenter="highlightedIndex = idx"
            @click.stop="selectOption(opt)"
          >
            <div class="min-w-0 flex-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span class="truncate">{{ opt.label }}</span>
              <span
                v-if="opt.sublabel"
                class="text-xs font-money"
                :class="
                  opt.value === modelValue
                    ? accentColor === 'indigo'
                      ? 'text-indigo-600 dark:text-indigo-400'
                      : 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-400 dark:text-slate-500'
                "
              >
                {{ opt.sublabel }}
              </span>
              <span
                v-if="opt.badge"
                class="px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
              >
                {{ opt.badge }}
              </span>
            </div>

            <Check
              v-if="opt.value === modelValue"
              class="w-4 h-4 shrink-0"
              :class="
                accentColor === 'indigo'
                  ? 'text-indigo-600 dark:text-indigo-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              "
            />
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>
