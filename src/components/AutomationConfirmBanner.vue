<script setup lang="ts">
import { ref } from 'vue';
import {
  Clock,
  CheckCircle2,
  XCircle,
  Calendar,
  Wallet,
  Tags,
  AlertCircle,
  ChevronDown,
  Sparkles,
  ArrowRight,
  Loader2,
} from 'lucide-vue-next';
import { useAutomationStore } from '../stores/automation';
import { useThemeStore } from '../stores/theme';
import { SNOOZE_OPTIONS, type SnoozeDurationKey } from '../types/automation';

const automationStore = useAutomationStore();
const themeStore = useThemeStore();

const snoozeDropdownOpen = ref(false);
const selectedSnooze = ref<SnoozeDurationKey>('1h');
const isExecuting = ref(false);
const isSnoozing = ref(false);
const isCancelling = ref(false);

async function handleExecuteNow() {
  if (!automationStore.pendingConfirmation || isExecuting.value) return;
  isExecuting.value = true;
  try {
    await automationStore.executeTransaction(automationStore.pendingConfirmation, {
      isManualEarly: false,
    });
  } finally {
    isExecuting.value = false;
  }
}

async function handleSnoozeConfirm() {
  if (!automationStore.pendingConfirmation || isSnoozing.value) return;
  const opt = SNOOZE_OPTIONS.find((s) => s.key === selectedSnooze.value) || SNOOZE_OPTIONS[0];
  isSnoozing.value = true;
  try {
    await automationStore.snoozeRule(
      automationStore.pendingConfirmation.id,
      opt.durationMs,
      opt.label
    );
    snoozeDropdownOpen.value = false;
  } finally {
    isSnoozing.value = false;
  }
}

async function handleCancelToday() {
  if (!automationStore.pendingConfirmation || isCancelling.value) return;
  isCancelling.value = true;
  try {
    await automationStore.cancelRuleForToday(automationStore.pendingConfirmation.id);
  } finally {
    isCancelling.value = false;
  }
}
</script>

<template>
  <Transition
    enter-active-class="transition-all duration-300 ease-out"
    enter-from-class="-translate-y-8 opacity-0"
    enter-to-class="translate-y-0 opacity-100"
    leave-active-class="transition-all duration-200 ease-in"
    leave-from-class="translate-y-0 opacity-100"
    leave-to-class="-translate-y-8 opacity-0"
  >
    <div
      v-if="automationStore.pendingConfirmation"
      class="shrink-0 z-40 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white shadow-xl border-b border-emerald-500/50"
    >
      <div class="max-w-7xl mx-auto px-4 sm:px-6 py-3.5">
        <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
          <!-- Left: Info & Details -->
          <div class="flex items-start gap-3 min-w-0">
            <div class="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0 mt-0.5 shadow-inner">
              <Clock class="w-5 h-5 text-white animate-pulse" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-white/25 text-white">
                  <Sparkles class="w-3 h-3" />
                  Jadwal Catat Otomatis
                </span>
                <span class="text-xs text-emerald-100 font-medium">
                  Waktu Eksekusi: {{ automationStore.pendingConfirmation.executionTime }} WIB
                </span>
              </div>

              <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm">
                <span class="font-bold text-white text-sm sm:text-base">
                  {{ automationStore.pendingConfirmation.name }}
                </span>
                <span class="text-emerald-200">·</span>
                <span class="font-bold text-amber-200 font-money text-sm sm:text-base">
                  {{ themeStore.formatMoney(automationStore.pendingConfirmation.amount) }}
                </span>
                <span class="text-emerald-200">·</span>
                <span class="inline-flex items-center gap-1 text-emerald-100 text-xs">
                  <Wallet class="w-3.5 h-3.5 shrink-0" />
                  {{ automationStore.pendingConfirmation.walletName }}
                  <template v-if="automationStore.pendingConfirmation.fundOwnerName">
                    ({{ automationStore.pendingConfirmation.fundOwnerName }})
                  </template>
                </span>
                <span class="text-emerald-200">·</span>
                <span class="inline-flex items-center gap-1 text-emerald-100 text-xs">
                  <Tags class="w-3.5 h-3.5 shrink-0" />
                  {{ automationStore.pendingConfirmation.category }}
                </span>
              </div>

              <p
                v-if="automationStore.pendingConfirmation.note"
                class="text-xs text-emerald-100/90 mt-0.5 line-clamp-1 italic"
              >
                Catatan: "{{ automationStore.pendingConfirmation.note }}"
              </p>
            </div>
          </div>

          <!-- Right: Action Buttons (Catat Sekarang, Tunda, Batalkan) -->
          <div class="flex flex-wrap items-center gap-2 self-end lg:self-center shrink-0">
            <!-- 1. Catat Sekarang (Primary) -->
            <button
              type="button"
              :disabled="isExecuting || isSnoozing || isCancelling"
              class="px-4 py-2 rounded-xl bg-white text-emerald-800 text-xs font-bold hover:bg-emerald-50 active:scale-95 transition-all flex items-center gap-1.5 shadow-md cursor-pointer disabled:opacity-50"
              @click="handleExecuteNow"
            >
              <Loader2 v-if="isExecuting" class="w-3.5 h-3.5 animate-spin" />
              <CheckCircle2 v-else class="w-3.5 h-3.5 text-emerald-600" />
              <span>Catat Sekarang</span>
            </button>

            <!-- 2. Tunda (With Dropdown for 1-5 Jam / Besok s/d 5 Hari) -->
            <div class="relative">
              <button
                type="button"
                :disabled="isExecuting || isSnoozing || isCancelling"
                class="px-3 py-2 rounded-xl bg-emerald-800/80 hover:bg-emerald-800 text-white text-xs font-semibold active:scale-95 transition-all flex items-center gap-1.5 border border-emerald-500/40 cursor-pointer disabled:opacity-50"
                @click="snoozeDropdownOpen = !snoozeDropdownOpen"
              >
                <Clock class="w-3.5 h-3.5" />
                <span>Tunda</span>
                <ChevronDown
                  class="w-3 h-3 transition-transform"
                  :class="{ 'rotate-180': snoozeDropdownOpen }"
                />
              </button>

              <!-- Snooze Popover -->
              <Transition
                enter-active-class="transition duration-150 ease-out"
                enter-from-class="opacity-0 scale-95"
                enter-to-class="opacity-100 scale-100"
                leave-active-class="transition duration-100 ease-in"
                leave-from-class="opacity-100 scale-100"
                leave-to-class="opacity-0 scale-95"
              >
                <div
                  v-if="snoozeDropdownOpen"
                  class="absolute right-0 bottom-full lg:bottom-auto lg:top-full mb-2 lg:mb-0 lg:mt-2 w-56 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-3 z-50 text-slate-800 dark:text-slate-100 space-y-2.5"
                >
                  <div class="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Pilih Durasi Tunda
                  </div>
                  <select
                    v-model="selectedSnooze"
                    class="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-slate-800 dark:text-slate-200 font-medium focus:outline-emerald-500"
                  >
                    <option
                      v-for="opt in SNOOZE_OPTIONS"
                      :key="opt.key"
                      :value="opt.key"
                    >
                      {{ opt.label }}
                    </option>
                  </select>

                  <div class="flex items-center justify-end gap-1.5 pt-1">
                    <button
                      type="button"
                      class="px-2.5 py-1.5 rounded-lg text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-medium cursor-pointer"
                      @click="snoozeDropdownOpen = false"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      :disabled="isSnoozing"
                      class="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      @click="handleSnoozeConfirm"
                    >
                      <Loader2 v-if="isSnoozing" class="w-3 h-3 animate-spin" />
                      <span>Terapkan</span>
                    </button>
                  </div>
                </div>
              </Transition>
            </div>

            <!-- 3. Batalkan Pencatatan Hari Ini -->
            <button
              type="button"
              :disabled="isExecuting || isSnoozing || isCancelling"
              class="px-3 py-2 rounded-xl bg-emerald-900/40 hover:bg-emerald-900/70 text-emerald-100 hover:text-white text-xs font-semibold active:scale-95 transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
              title="Lewati atau batalkan pencatatan otomatis transaksi ini untuk hari ini"
              @click="handleCancelToday"
            >
              <Loader2 v-if="isCancelling" class="w-3.5 h-3.5 animate-spin" />
              <XCircle v-else class="w-3.5 h-3.5 text-rose-300" />
              <span>Batalkan</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>
