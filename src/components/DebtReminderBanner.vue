<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  Clock,
  CheckCircle2,
  XCircle,
  ChevronDown,
  Sparkles,
  Loader2,
  HandCoins,
} from 'lucide-vue-next';
import { useDebtsStore } from '../stores/debts';
import { useThemeStore } from '../stores/theme';
import { SNOOZE_OPTIONS, type SnoozeOption } from '../types/automation';

const router = useRouter();
const debtsStore = useDebtsStore();
const themeStore = useThemeStore();

const snoozeDropdownOpen = ref(false);
const isSnoozing = ref(false);
const isSkipping = ref(false);

function handleOpenInstallment() {
  const debt = debtsStore.pendingReminder;
  if (!debt) return;
  snoozeDropdownOpen.value = false;
  debtsStore.requestOpenInstallmentModal(debt.id);
  void router.push({
    path: `/utilities/debts/${encodeURIComponent(debt.id)}`,
    query: { action: 'installment' },
  });
}

async function handleSelectSnooze(opt: SnoozeOption) {
  if (!debtsStore.pendingReminder || isSnoozing.value) return;
  isSnoozing.value = true;
  try {
    await debtsStore.snoozeReminder(
      debtsStore.pendingReminder.id,
      opt.durationMs,
      opt.label
    );
    snoozeDropdownOpen.value = false;
  } finally {
    isSnoozing.value = false;
  }
}

async function handleSkipToday() {
  if (!debtsStore.pendingReminder || isSkipping.value) return;
  snoozeDropdownOpen.value = false;
  isSkipping.value = true;
  try {
    await debtsStore.skipReminderToday(debtsStore.pendingReminder.id);
  } finally {
    isSkipping.value = false;
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
      v-if="debtsStore.pendingReminder"
      class="shrink-0 relative z-40 text-white shadow-xl border-b"
      :class="
        debtsStore.pendingReminder.type === 'debt'
          ? 'bg-gradient-to-r from-rose-700 via-rose-600 to-amber-700 border-rose-500/50'
          : 'bg-gradient-to-r from-emerald-700 via-teal-600 to-cyan-700 border-teal-500/50'
      "
    >
      <div class="max-w-7xl mx-auto px-4 sm:px-6 py-3.5">
        <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-3 sm:gap-4">
          <!-- Left: Debt/Receivable Reminder Info -->
          <div class="flex items-start gap-3 min-w-0">
            <div class="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0 mt-0.5 shadow-inner">
              <HandCoins class="w-5 h-5 text-white" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-white/25 text-white">
                  <Sparkles class="w-3 h-3" />
                  {{
                    debtsStore.pendingReminder.type === 'debt'
                      ? 'Pengingat Cicilan Hutang'
                      : 'Pengingat Penagihan Piutang'
                  }}
                </span>
                <span class="text-xs text-white/85 font-medium">
                  Jadwal: Pukul {{ debtsStore.pendingReminder.reminderTime || '09:00' }} WIB
                </span>
              </div>

              <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm">
                <span class="font-bold text-white text-sm sm:text-base">
                  {{ debtsStore.pendingReminder.description }}
                </span>
                <span class="text-white/70">·</span>
                <span class="inline-flex items-center gap-1 text-amber-200 font-bold font-money text-sm sm:text-base">
                  Sisa {{ themeStore.formatMoney(debtsStore.getDebtRemainingAmount(debtsStore.pendingReminder)) }}
                  / {{ themeStore.formatMoney(debtsStore.pendingReminder.amount) }}
                </span>
                <template v-if="debtsStore.pendingReminder.reminderAmount">
                  <span class="text-white/70">·</span>
                  <span class="text-xs text-white/90 font-money">
                    Saran Nominal: {{ themeStore.formatMoney(debtsStore.pendingReminder.reminderAmount) }}
                  </span>
                </template>
              </div>
            </div>
          </div>

          <!-- Right: Actions -->
          <div class="flex flex-wrap items-center gap-2 self-end lg:self-center shrink-0">
            <button
              type="button"
              :disabled="isSnoozing || isSkipping"
              class="px-4 py-2 rounded-xl bg-white text-slate-900 text-xs font-bold hover:bg-slate-50 active:scale-95 transition-all flex items-center gap-1.5 shadow-md cursor-pointer disabled:opacity-50"
              @click="handleOpenInstallment"
            >
              <CheckCircle2
                class="w-3.5 h-3.5"
                :class="debtsStore.pendingReminder.type === 'debt' ? 'text-rose-600' : 'text-emerald-600'"
              />
              <span>{{ debtsStore.pendingReminder.type === 'debt' ? 'Cicil' : 'Terima' }}</span>
            </button>

            <div class="relative">
              <button
                type="button"
                :disabled="isSnoozing || isSkipping"
                class="px-3 py-2 rounded-xl bg-black/25 hover:bg-black/40 text-white text-xs font-semibold active:scale-95 transition-all flex items-center gap-1.5 border border-white/20 cursor-pointer disabled:opacity-50"
                @click="snoozeDropdownOpen = !snoozeDropdownOpen"
              >
                <Clock class="w-3.5 h-3.5" />
                <span>Tunda</span>
                <ChevronDown
                  class="w-3 h-3 transition-transform"
                  :class="{ 'rotate-180': snoozeDropdownOpen }"
                />
              </button>

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
                  class="absolute right-0 top-full mt-2 w-52 max-w-[calc(100vw-2rem)] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-2 z-50 text-slate-800 dark:text-slate-100 space-y-1"
                >
                  <div class="px-2.5 py-1 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Tunda Selama
                  </div>
                  <button
                    v-for="opt in SNOOZE_OPTIONS"
                    :key="opt.key"
                    type="button"
                    :disabled="isSnoozing"
                    class="w-full px-3 py-2 rounded-xl text-left text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors flex items-center justify-between cursor-pointer disabled:opacity-50"
                    @click="handleSelectSnooze(opt)"
                  >
                    <span>{{ opt.label }}</span>
                    <Loader2 v-if="isSnoozing" class="w-3 h-3 animate-spin" />
                  </button>
                </div>
              </Transition>
            </div>

            <button
              type="button"
              :disabled="isSnoozing || isSkipping"
              class="px-3 py-2 rounded-xl bg-black/30 hover:bg-black/45 text-white/90 hover:text-white text-xs font-semibold active:scale-95 transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
              title="Lewati pengingat untuk hari ini"
              @click="handleSkipToday"
            >
              <Loader2 v-if="isSkipping" class="w-3.5 h-3.5 animate-spin" />
              <XCircle v-else class="w-3.5 h-3.5 text-rose-200" />
              <span>Lewati</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>
