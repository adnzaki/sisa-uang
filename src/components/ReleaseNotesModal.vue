<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import {
  Sparkles,
  Database,
  PiggyBank,
  Tablet,
  Keyboard,
  Rocket,
  Layers,
  Check,
} from 'lucide-vue-next';
import { useNotificationStore } from '../stores/notification';
import { useAuthStore } from '../stores/auth';
import AppModal from './AppModal.vue';

const CHANGELOG_SEEN_KEY = 'sisa_uang_changelog_seen_v1_0_0_rc_4';
const RELEASE_VERSION = '1.0.0-rc.4';
const RELEASE_DATE = 'Oktober 2026';

const notificationStore = useNotificationStore();
const authStore = useAuthStore();

const activeFilter = ref<'all' | 'features' | 'interface' | 'accessibility' | 'performance'>('all');

export interface ChangelogItem {
  id: string;
  category: 'features' | 'interface' | 'accessibility' | 'performance';
  badge: string;
  badgeColor: 'emerald' | 'indigo' | 'amber' | 'rose' | 'sky';
  title: string;
  summary: string;
  icon: any;
}

const changelogItems: ChangelogItem[] = [
  {
    id: 'periodic-budget',
    category: 'features',
    badge: 'FITUR ANGGARAN',
    badgeColor: 'emerald',
    title: 'Peningkatan Fitur Anggaran dengan Dukungan Periodik Bulanan',
    summary:
      'Penyempurnaan alur penyusunan dan pemantauan anggaran yang kini berbasis periode bulan dengan pilihan tahun, pengelolaan kategori anggaran per periode, serta perhitungan serapan anggaran yang lebih akurat.',
    icon: PiggyBank,
  },
  {
    id: 'tablet-layout',
    category: 'interface',
    badge: 'TATA LETAK',
    badgeColor: 'indigo',
    title: 'Perbaikan Struktur Layout pada Layar Tablet',
    summary:
      'Penyesuaian tata letak dan proporsi antarmuka aplikasi pada perangkat berlayar tablet agar navigasi serta tampilan konten lebih rapi, proporsional, dan nyaman digunakan.',
    icon: Tablet,
  },
  {
    id: 'keyboard-tab-accessibility',
    category: 'accessibility',
    badge: 'AKSESIBILITAS',
    badgeColor: 'amber',
    title: 'Peningkatan Navigasi Tombol TAB (Aksesibilitas) pada Setiap Form Input',
    summary:
      'Optimalisasi urutan fokus dan responsivitas tombol TAB pada keyboard fisik di seluruh formulir input untuk memudahkan perpindahan antar kolom isian secara cepat dan berurutan.',
    icon: Keyboard,
  },
  {
    id: 'db-cache-optimization',
    category: 'performance',
    badge: 'PERFORMA & CACHE',
    badgeColor: 'sky',
    title: 'Peningkatan Performa Aplikasi melalui Optimalisasi Operasi Database dan Penggunaan Cache',
    summary:
      'Perombakan mekanisme pembacaan dan penulisan database dengan pemanfaatan cache pintar untuk memangkas beban operasi database secara signifikan serta mempercepat waktu muat aplikasi.',
    icon: Database,
  },
];

const filterTabs = [
  { id: 'all' as const, label: 'Semua Pembaruan', count: changelogItems.length },
  {
    id: 'features' as const,
    label: 'Fitur Anggaran',
    count: changelogItems.filter((i) => i.category === 'features').length,
  },
  {
    id: 'interface' as const,
    label: 'Tata Letak',
    count: changelogItems.filter((i) => i.category === 'interface').length,
  },
  {
    id: 'accessibility' as const,
    label: 'Aksesibilitas',
    count: changelogItems.filter((i) => i.category === 'accessibility').length,
  },
  {
    id: 'performance' as const,
    label: 'Performa & Cache',
    count: changelogItems.filter((i) => i.category === 'performance').length,
  },
];

const filteredChangelog = computed(() => {
  if (activeFilter.value === 'all') return changelogItems;
  return changelogItems.filter((item) => item.category === activeFilter.value);
});

function markChangelogSeenAndClose() {
  try {
    localStorage.setItem(CHANGELOG_SEEN_KEY, 'true');
  } catch {
    // Ignore storage error
  }
  notificationStore.closeChangelogModal();
}

// Automatically show the release notes modal once for authenticated users who haven't seen v1.0.0-rc.4 changelog yet
watch(
  () => [authStore.isReady, authStore.isAuthenticated, authStore.requiresOtp] as const,
  ([ready, authenticated, needOtp]) => {
    if (!ready || !authenticated || needOtp) return;
    try {
      const alreadySeen = localStorage.getItem(CHANGELOG_SEEN_KEY) === 'true';
      if (!alreadySeen) {
        notificationStore.openChangelogModal();
      }
    } catch {
      // Ignore storage error
    }
  },
  { immediate: true }
);
</script>

<template>
  <AppModal
    v-model="notificationStore.changelogModalOpen"
    title="Informasi Rilis Resmi & Catatan Pembaruan"
    max-width="2xl"
    @close="markChangelogSeenAndClose"
  >
    <template #header>
      <div class="flex items-center gap-2.5 min-w-0">
        <div
          class="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs"
        >
          <Sparkles class="w-4 h-4" />
        </div>
        <div class="min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <h2 class="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 truncate">
              Rilis Resmi Sisa Uang
            </h2>
            <span
              class="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-mono text-[11px] font-bold border border-emerald-500/30"
            >
              v{{ RELEASE_VERSION }}
            </span>
          </div>
          <p class="text-[11px] text-slate-500 dark:text-slate-400 truncate">
            Release Candidate 4 · {{ RELEASE_DATE }}
          </p>
        </div>
      </div>
    </template>

    <div class="space-y-5">
      <!-- Hero Banner -->
      <div
        class="relative overflow-hidden rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950 via-slate-900 to-slate-950 p-4 sm:p-5 text-white shadow-lg"
      >
        <div class="relative z-10 space-y-3">
          <div class="flex flex-wrap items-center gap-2">
            <span
              class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-[11px] font-bold uppercase tracking-wider"
            >
              <Rocket class="w-3.5 h-3.5" />
              <span>Rilis Baru · v{{ RELEASE_VERSION }}</span>
            </span>
            <span
              class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10 text-slate-200 text-[11px] font-mono"
            >
              <Layers class="w-3.5 h-3.5 text-emerald-400" />
              <span>4 Pembaruan Utama</span>
            </span>
          </div>

          <div class="space-y-1.5">
            <h3 class="text-base sm:text-lg font-bold tracking-tight text-white">
              Catatan Pembaruan Sisa Uang v{{ RELEASE_VERSION }}
            </h3>
            <p class="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Pembaruan versi <strong class="text-emerald-300 font-mono">{{ RELEASE_VERSION }}</strong> menghadirkan
              dukungan anggaran periodik bulanan, penyempurnaan tata letak layar tablet, peningkatan aksesibilitas
              navigasi tombol TAB pada formulir, serta optimalisasi operasi database dan penggunaan cache.
            </p>
          </div>
        </div>
      </div>

      <!-- Category Filter Tabs -->
      <div class="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        <button
          v-for="tab in filterTabs"
          :key="tab.id"
          type="button"
          class="min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition-colors shrink-0 border"
          :class="
            activeFilter === tab.id
              ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
              : 'bg-slate-50 dark:bg-slate-950/70 text-slate-600 dark:text-slate-400 border-slate-200/80 dark:border-slate-800 hover:text-slate-900 dark:hover:text-slate-200'
          "
          @click="activeFilter = tab.id"
        >
          <span>{{ tab.label }}</span>
          <span
            class="px-1.5 py-0.2 rounded-md text-[10px] font-mono"
            :class="
              activeFilter === tab.id
                ? 'bg-white/20 text-white'
                : 'bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
            "
          >
            {{ tab.count }}
          </span>
        </button>
      </div>

      <!-- Detailed Changelog Cards -->
      <div class="space-y-3.5">
        <div
          v-for="item in filteredChangelog"
          :key="item.id"
          class="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 p-4 sm:p-5 space-y-3 transition-colors hover:border-emerald-500/40"
        >
          <!-- Top Row: Icon & Colorful Badge Aligned Horizontally -->
          <div class="flex items-center gap-2.5">
            <div
              class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border"
              :class="[
                item.badgeColor === 'emerald'
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200/70 dark:border-emerald-900/60 text-emerald-600 dark:text-emerald-400'
                  : item.badgeColor === 'sky'
                    ? 'bg-sky-50 dark:bg-sky-950/60 border-sky-200/70 dark:border-sky-900/60 text-sky-600 dark:text-sky-400'
                    : item.badgeColor === 'indigo'
                      ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-200/70 dark:border-indigo-900/60 text-indigo-600 dark:text-indigo-400'
                      : item.badgeColor === 'amber'
                        ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-200/70 dark:border-amber-900/60 text-amber-600 dark:text-amber-400'
                        : 'bg-rose-50 dark:bg-rose-950/60 border-rose-200/70 dark:border-rose-900/60 text-rose-600 dark:text-rose-400',
              ]"
            >
              <component :is="item.icon" class="w-4 h-4" />
            </div>

            <span
              class="px-2.5 py-1 rounded-lg text-[10px] sm:text-[11px] font-bold uppercase tracking-wider"
              :class="[
                item.badgeColor === 'emerald'
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                  : item.badgeColor === 'sky'
                    ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
                    : item.badgeColor === 'indigo'
                      ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300'
                      : item.badgeColor === 'amber'
                        ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                        : 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
              ]"
            >
              {{ item.badge }}
            </span>
          </div>

          <!-- Title & Summary Description Full-Width Below -->
          <div class="space-y-1.5">
            <h4 class="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 leading-snug">
              {{ item.title }}
            </h4>
            <p class="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              {{ item.summary }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 w-full">
        <div class="text-[11px] text-slate-500 dark:text-slate-400">
          Anda dapat membuka kembali catatan rilis ini kapan saja melalui menu <strong>Pengaturan</strong> atau klik <strong>Versi {{ RELEASE_VERSION }}</strong>.
        </div>
        <button
          type="button"
          class="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-colors shrink-0 shadow-xs"
          @click="markChangelogSeenAndClose"
        >
          <Check class="w-4 h-4 shrink-0" />
          <span>Mengerti &amp; Mulai Gunakan</span>
        </button>
      </div>
    </template>
  </AppModal>
</template>
