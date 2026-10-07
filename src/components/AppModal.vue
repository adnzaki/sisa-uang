<script setup lang="ts">
import { watch, onMounted, onBeforeUnmount } from 'vue';
import { X } from 'lucide-vue-next';

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    subtitle?: string;
    maxWidth?: 'md' | 'lg' | 'xl' | '2xl';
    hideFooter?: boolean;
  }>(),
  {
    subtitle: '',
    maxWidth: 'lg',
    hideFooter: false,
  }
);

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const modalInstanceKey = `su_modal_${Math.random().toString(36).slice(2, 9)}`;
let hasPushedHistoryState = false;
let isClosedByBackButton = false;

function handlePopState() {
  if (!props.open) return;
  if (hasPushedHistoryState) {
    isClosedByBackButton = true;
    hasPushedHistoryState = false;
    emit('close');
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (!props.open) return;
  if (e.key === 'Escape') {
    emit('close');
  }
}

watch(
  () => props.open,
  (isOpen) => {
    if (typeof window === 'undefined') return;
    if (isOpen) {
      isClosedByBackButton = false;
      try {
        const currentState = window.history.state || {};
        window.history.pushState(
          { ...currentState, __sisaUangModalKey: modalInstanceKey },
          '',
          window.location.href
        );
        hasPushedHistoryState = true;
      } catch {
        hasPushedHistoryState = false;
      }
    } else {
      if (hasPushedHistoryState && !isClosedByBackButton) {
        hasPushedHistoryState = false;
        try {
          if (window.history.state?.__sisaUangModalKey === modalInstanceKey) {
            window.history.back();
          }
        } catch {
          // Ignore history errors
        }
      }
      isClosedByBackButton = false;
    }
  },
  { immediate: true }
);

onMounted(() => {
  window.addEventListener('popstate', handlePopState);
  window.addEventListener('keydown', handleKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener('popstate', handlePopState);
  window.removeEventListener('keydown', handleKeydown);
  if (hasPushedHistoryState && !isClosedByBackButton && typeof window !== 'undefined') {
    hasPushedHistoryState = false;
    try {
      if (window.history.state?.__sisaUangModalKey === modalInstanceKey) {
        window.history.back();
      }
    } catch {
      // Ignore
    }
  }
});
</script>

<template>
  <Transition name="modal">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center bg-black/55 backdrop-blur-xs p-0 sm:p-4"
      @click.self="emit('close')"
    >
      <!--
        Mobile (< sm): Full screen (w-full h-dvh max-h-dvh rounded-none)
        Desktop (sm+): Centered modal card with rounded-2xl and max-h-[90dvh]
        Header is fixed at top (shrink-0), Footer is fixed at bottom (shrink-0),
        and ONLY the middle content area scrolls (flex-1 min-h-0 overflow-y-auto).
      -->
      <div
        class="modal-panel w-full h-dvh max-h-dvh sm:h-auto sm:max-h-[90dvh] flex flex-col overflow-hidden bg-white dark:bg-slate-900 sm:rounded-2xl sm:border border-slate-200 dark:border-slate-800 shadow-2xl"
        :class="[
          maxWidth === 'md'
            ? 'sm:max-w-md'
            : maxWidth === 'xl'
            ? 'sm:max-w-xl'
            : maxWidth === '2xl'
            ? 'sm:max-w-2xl'
            : 'sm:max-w-lg',
        ]"
      >
        <!-- FIXED MODAL HEADER (Top) -->
        <div class="shrink-0 px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-3 z-10">
          <div class="min-w-0 flex-1">
            <slot name="header">
              <h2 class="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 truncate">
                {{ title }}
              </h2>
              <p
                v-if="subtitle"
                class="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1"
              >
                {{ subtitle }}
              </p>
            </slot>
          </div>

          <div class="flex items-center gap-2 shrink-0">
            <slot name="header-actions" />
            <button
              type="button"
              aria-label="Tutup modal"
              class="min-h-[42px] min-w-[42px] flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              @click="emit('close')"
            >
              <X class="w-5 h-5" />
            </button>
          </div>
        </div>

        <!-- SCROLLABLE MODAL CONTENT (Middle) -->
        <div class="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 sm:p-6">
          <slot />
        </div>

        <!-- FIXED MODAL FOOTER (Bottom) -->
        <div
          v-if="!hideFooter && $slots.footer"
          class="shrink-0 px-4 sm:px-6 py-3.5 sm:py-4 border-t border-slate-200/80 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md z-10"
        >
          <slot name="footer" />
        </div>
      </div>
    </div>
  </Transition>
</template>
