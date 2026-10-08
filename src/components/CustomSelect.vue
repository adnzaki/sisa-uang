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
const triggerRef = ref<HTMLElement | null>(null);
const popoverRef = ref<HTMLElement | null>(null);
const searchInputRef = ref<HTMLInputElement | null>(null);
const optionsListRef = ref<HTMLElement | null>(null);
const popoverStyle = ref<Record<string, string>>({});
const optionsMaxHeight = ref<string>('240px');

let maxObservedHeight = typeof window !== 'undefined' ? window.innerHeight : 800;

function updatePopoverPosition() {
  if (!isOpen.value || !triggerRef.value || typeof window === 'undefined') return;

  const vv = window.visualViewport;
  const vvTop = vv ? vv.offsetTop : 0;
  const vvHeight = vv ? vv.height : window.innerHeight;
  const viewportWidth = vv ? vv.width : window.innerWidth;

  if (window.innerHeight > maxObservedHeight) {
    maxObservedHeight = window.innerHeight;
  }
  if (vvHeight > maxObservedHeight) {
    maxObservedHeight = vvHeight;
  }

  const rect = triggerRef.value.getBoundingClientRect();
  const margin = 12;
  const gap = 6;
  const searchHeaderHeight = props.searchable ? 76 : 0;

  const width = Math.min(rect.width, viewportWidth - 16);
  const left = Math.max(8, Math.min(rect.left, viewportWidth - width - 8));

  const isMobile =
    window.innerWidth < 640 ||
    (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches);

  // On mobile with searchable=true, the virtual keyboard covers the bottom ~45-50% of the screen.
  // Always anchor by `top` in the upper keyboard-safe region so filtering down to 1 item
  // shrinks the bottom upward toward the search bar instead of dropping the list behind the keyboard.
  if (isMobile && props.searchable) {
    const baselineHeight = Math.max(maxObservedHeight, window.innerHeight, 640);
    const keyboardSafeHeight = Math.min(vvHeight, Math.round(baselineHeight * 0.52));
    const safeBottom = vvTop + Math.max(250, keyboardSafeHeight) - margin;
    const topMin = vvTop + 16;

    const maxAvailableHeight = Math.max(180, safeBottom - topMin);
    const listMax = Math.max(100, Math.min(210, maxAvailableHeight - searchHeaderHeight));
    const totalTargetHeight = searchHeaderHeight + listMax;

    let topPos: number;
    if (rect.bottom + gap >= topMin && rect.bottom + gap + totalTargetHeight <= safeBottom) {
      topPos = rect.bottom + gap;
    } else {
      topPos = Math.max(topMin + 40, safeBottom - totalTargetHeight);
      if (topPos + totalTargetHeight > safeBottom) {
        topPos = Math.max(topMin, safeBottom - totalTargetHeight);
      }
    }

    optionsMaxHeight.value = `${listMax}px`;
    popoverStyle.value = {
      position: 'fixed',
      top: `${Math.round(topPos)}px`,
      left: `${Math.round(left)}px`,
      width: `${Math.round(width)}px`,
      zIndex: '9999',
    };
    return;
  }

  const effectiveBottom = vvTop + vvHeight;
  const spaceBelow = effectiveBottom - rect.bottom - margin;
  const spaceAbove = rect.top - vvTop - margin;

  if (spaceBelow >= 220 || spaceBelow >= spaceAbove) {
    const availTotal = Math.max(160, Math.min(340, spaceBelow - gap));
    const listMax = Math.max(110, availTotal - searchHeaderHeight);
    optionsMaxHeight.value = `${listMax}px`;
    popoverStyle.value = {
      position: 'fixed',
      top: `${Math.round(rect.bottom + gap)}px`,
      left: `${Math.round(left)}px`,
      width: `${Math.round(width)}px`,
      zIndex: '9999',
    };
  } else if (props.searchable) {
    const availTotal = Math.max(160, Math.min(340, spaceAbove - gap));
    const listMax = Math.max(110, availTotal - searchHeaderHeight);
    const estimatedListHeight = Math.min(
      listMax,
      Math.max(1, normalizedOptions.value.length) * 42 + 12
    );
    const totalHeight = searchHeaderHeight + estimatedListHeight;
    const topPos = Math.max(vvTop + margin, rect.top - gap - totalHeight);
    optionsMaxHeight.value = `${listMax}px`;
    popoverStyle.value = {
      position: 'fixed',
      top: `${Math.round(topPos)}px`,
      left: `${Math.round(left)}px`,
      width: `${Math.round(width)}px`,
      zIndex: '9999',
    };
  } else {
    const availTotal = Math.max(160, Math.min(340, spaceAbove - gap));
    const listMax = Math.max(110, availTotal - searchHeaderHeight);
    optionsMaxHeight.value = `${listMax}px`;
    popoverStyle.value = {
      position: 'fixed',
      bottom: `${Math.round(window.innerHeight - rect.top + gap)}px`,
      left: `${Math.round(left)}px`,
      width: `${Math.round(width)}px`,
      zIndex: '9999',
    };
  }
}

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
  if (!props.searchable && typeof document !== 'undefined') {
    (document.activeElement as HTMLElement | null)?.blur?.();
  }
  isOpen.value = true;
  searchQuery.value = '';
  const idx = normalizedOptions.value.findIndex((o) => o.value === props.modelValue);
  highlightedIndex.value = idx >= 0 ? idx : 0;
  updatePopoverPosition();

  await nextTick();
  updatePopoverPosition();
  if (props.searchable && searchInputRef.value) {
    try {
      searchInputRef.value.focus({ preventScroll: true });
    } catch {
      searchInputRef.value.focus();
    }
  }
}

function closeDropdown() {
  if (props.searchable && searchInputRef.value) {
    searchInputRef.value.blur();
  }
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
  const target = e.target as Node;
  if (containerRef.value && containerRef.value.contains(target)) return;
  if (popoverRef.value && popoverRef.value.contains(target)) return;
  closeDropdown();
}

function handleViewportChange(e: Event) {
  if (!isOpen.value) return;
  // Ignore scroll events originating inside the dropdown options list itself
  if (e.type === 'scroll' && popoverRef.value && popoverRef.value.contains(e.target as Node)) {
    return;
  }
  updatePopoverPosition();
}

onMounted(() => {
  maxObservedHeight = Math.max(window.innerHeight, window.visualViewport?.height || 0);
  document.addEventListener('mousedown', handleClickOutside);
  window.addEventListener('resize', handleViewportChange);
  window.addEventListener('scroll', handleViewportChange, true);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', handleViewportChange);
    window.visualViewport.addEventListener('scroll', handleViewportChange);
  }
});

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleClickOutside);
  window.removeEventListener('resize', handleViewportChange);
  window.removeEventListener('scroll', handleViewportChange, true);
  if (window.visualViewport) {
    window.visualViewport.removeEventListener('resize', handleViewportChange);
    window.visualViewport.removeEventListener('scroll', handleViewportChange);
  }
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
      ref="triggerRef"
      type="button"
      :disabled="disabled"
      :aria-label="ariaLabel || placeholder"
      :aria-expanded="isOpen"
      class="w-full flex items-center justify-between gap-2.5 border text-left transition-all duration-150 focus:outline-none disabled:opacity-50"
      :class="[
        size === 'sm'
          ? 'min-h-[44px] sm:min-h-[40px] px-3.5 py-2 rounded-xl text-xs'
          : !placeholder
          ? 'h-[46px] min-h-[46px] px-4 py-2 rounded-xl text-xs sm:text-sm'
          : 'min-h-[54px] sm:min-h-[50px] px-4 py-2.5 rounded-2xl text-sm sm:text-base',
        isOpen
          ? accentColor === 'indigo'
            ? 'border-indigo-600 ring-2 ring-indigo-500/15 bg-white dark:bg-slate-900'
            : 'border-emerald-600 ring-2 ring-emerald-500/15 bg-white dark:bg-slate-900'
          : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700',
      ]"
      @click="toggleDropdown"
    >
      <div class="flex items-center gap-2.5 min-w-0 flex-1">
        <slot name="icon" />
        <div class="min-w-0 flex-1">
          <template v-if="selectedOption">
            <div
              v-if="size !== 'sm' && placeholder"
              class="text-[11px] font-medium text-slate-400 dark:text-slate-500 leading-tight truncate mb-0.5"
            >
              {{ placeholder }}
            </div>
            <div class="truncate">
              <span class="font-medium text-slate-900 dark:text-slate-100">
                {{ selectedOption.label }}
              </span>
              <span
                v-if="selectedOption.sublabel"
                class="ml-1.5 text-xs text-slate-500 dark:text-slate-400 font-money"
              >
                {{ selectedOption.sublabel }}
              </span>
            </div>
          </template>
          <template v-else-if="modelValue !== '' && modelValue !== null && modelValue !== undefined">
            <div
              v-if="size !== 'sm' && placeholder"
              class="text-[11px] font-medium text-slate-400 dark:text-slate-500 leading-tight truncate mb-0.5"
            >
              {{ placeholder }}
            </div>
            <div class="font-medium text-slate-900 dark:text-slate-100 truncate">
              {{ modelValue }}
            </div>
          </template>
          <span v-else class="block text-slate-500 dark:text-slate-400 truncate">
            {{ placeholder }}
          </span>
        </div>
      </div>

      <ChevronDown
        class="w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200"
        :class="isOpen ? 'rotate-180 text-emerald-600 dark:text-emerald-400' : ''"
      />
    </button>

    <!-- Teleported Dropdown Menu Popover at Top-Most Layer (z-[9999]) -->
    <Teleport to="body">
      <Transition name="dropdown">
        <div
          v-if="isOpen"
          ref="popoverRef"
          :style="popoverStyle"
          class="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden"
          @keydown="handleKeydown"
        >
          <!-- Search Input Bar (Shown when searchable="true") -->
          <div
            v-if="searchable"
            class="p-2.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/90"
          >
            <div class="w-full min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-2.5 focus-within:border-emerald-600 transition-colors">
              <Search class="w-4 h-4 text-slate-400 shrink-0" />
              <input
                ref="searchInputRef"
                v-model="searchQuery"
                type="text"
                :placeholder="searchPlaceholder"
                class="flex-1 w-full min-w-0 bg-transparent border-0 text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
                @click.stop
              />
              <button
                v-if="searchQuery"
                type="button"
                class="p-0.5 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0"
                @mousedown.prevent
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
            :style="{ maxHeight: optionsMaxHeight }"
            class="overflow-y-auto overscroll-contain p-1.5 space-y-0.5"
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
                @mousedown.prevent
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
              @mousedown.prevent
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
    </Teleport>
  </div>
</template>
