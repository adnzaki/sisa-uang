<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import {
  Sparkles,
  Rocket,
  Layers,
  Check,
  Clock,
  RotateCcw,
  Crown,
} from 'lucide-vue-next';
import { useNotificationStore } from '../stores/notification';
import { useAuthStore } from '../stores/auth';
import AppModal from './AppModal.vue';

const CHANGELOG_SEEN_KEY = 'sisa_uang_changelog_seen_v1_0_1';
const RELEASE_VERSION = '1.0.1';
const RELEASE_DATE = 'November 2026';
const BUILD_NUMBER = '10114';

const notificationStore = useNotificationStore();
const authStore = useAuthStore();

type ChangelogCategory = 'all' | 'system' | 'database';
const activeFilter = ref<ChangelogCategory>('all');

export interface ChangelogItem {
  id: string;
  category: 'system' | 'database';
  badge: string;
  badgeColor: 'emerald' | 'indigo' | 'amber' | 'rose' | 'sky';
  isProExclusive?: boolean;
  title: string;
  summary: string;
  details: string[];
  icon: any;
}

const changelogItems: ChangelogItem[] = [
  {
    id: 'automation-timezone-alignment',
    category: 'system',
    badge: 'ZONA WAKTU OTOMATISASI',
    badgeColor: 'indigo',
    title: 'Perbaikan Zona Waktu untuk Jadwal Otomatis',
    summary:
      'Penyelarasan menyeluruh evaluasi jadwal otomatis menggunakan acuan presisi Waktu Indonesia Barat (WIB / UTC+7) guna mencegah selisih waktu antara server dan perangkat:',
    details: [
      'Standardisasi Jam Eksekusi Berbasis WIB: Seluruh penghitungan tanggal dan jam jatuh tempo otomatis diseragamkan ke zona waktu Asia/Jakarta (UTC+7).',
      'Endpoint Diagnostik Sinkronisasi Jam (/api/time): Menyediakan acuan waktu server yang presisi untuk mendeteksi deviasi jam lokal dan mencegah eksekusi tertunda.',
      'Pencegahan Pergeseran Jam Eksekusi: Menghilangkan potensi pergeseran jadwal yang sebelumnya dapat terhambat oleh perbedaan zona waktu antara server UTC dan perangkat lokal.',
    ],
    icon: Clock,
  },
  {
    id: 'automation-execution-lifecycle-fix',
    category: 'system',
    badge: 'EKSEKUSI JADWAL OTOMATIS',
    badgeColor: 'emerald',
    title: 'Perbaikan Bug Jadwal Otomatis Tidak Berjalan',
    summary:
      'Peningkatan menyeluruh pada siklus hidup poller otomatis agar transaksi rutin yang telah melewati waktu jatuh tempo langsung dieksekusi secara andal:',
    details: [
      'Pemicu Otomatis Saat Aplikasi Dibuka: Evaluasi jadwal langsung berjalan seketika saat pengguna membuka aplikasi, berpindah halaman, atau melakukan interaksi aktif.',
      'Poller Aktif Latar Depan yang Disiplin: Poller otomatis hanya aktif saat aplikasi berada di latar depan (foreground) dan langsung dimatikan ketika berpindah tab atau aplikasi ditutup demi menghemat daya.',
      'Pembaruan Status Eksekusi Seketika: Jadwal yang telah jatuh tempo langsung dicatat dan status transaksi hari ini otomatis terbarui menjadi selesai tanpa perlu refresh manual.',
    ],
    icon: RotateCcw,
  },
  {
    id: 'multi-device-automation-deduplication',
    category: 'database',
    badge: 'DEDUPLIKASI MULTI-PERANGKAT',
    badgeColor: 'sky',
    title: 'Perbaikan Bug Transaksi Otomatis Berjalan Lebih dari Satu Kali saat Login di Lebih dari Satu Perangkat',
    summary:
      'Penerapan mekanisme penguncian sewa klaim atomik terdistribusi (atomic lease claim) dan deduplikasi ID transaksi untuk menjamin integritas data:',
    details: [
      'Klaim Eksekusi Atomik Terdistribusi: Setiap perangkat wajib memperoleh hak klaim eksklusif sebelum mengeksekusi jadwal, sehingga perangkat lain otomatis menolak pencatatan ulang.',
      'ID Transaksi Deterministik: Pembuatan ID unik harian berbasis aturan dan tanggal mencegah terjadinya pencatatan ganda pada database Cloud Firestore.',
      'Sinkronisasi Multi-Tab Lintas Jendela: Saluran komunikasi BroadcastChannel lokal saling mengabarkan keberhasilan transaksi secara instan antar-tab yang sedang terbuka.',
    ],
    icon: Layers,
  },
  {
    id: 'pro-free-account-switch-sync',
    category: 'database',
    badge: 'SINKRONISASI AKUN PRO & FREE',
    badgeColor: 'amber',
    title: 'Perbaikan Bug Sinkronisasi saat Peralihan Akun Pro dan Free',
    summary:
      'Penyempurnaan validasi hak akses lisensi langsung ke database Cloud Firestore dan pembersihan tuntas residu data saat berganti akun:',
    details: [
      'Validasi Status Lisensi Langsung ke Firestore: Pengecekan status Pro atau Free selalu merujuk langsung ke dokumen pengguna di Firestore tanpa mengandalkan cache lokal yang usang.',
      'Pembersihan Total Residu Sesi: Seluruh cache dompet, mutasi transaksi, aturan otomatisasi, dan status hak akses fitur dibersihkan tuntas setiap kali pengguna keluar atau berganti akun.',
      'Penegakan Batasan Fitur yang Akurat: Akun Free dipastikan mendapatkan pembatasan fitur sesuai paket dan akun Pro langsung memperoleh akses fitur eksklusif seketika tanpa tertukar.',
    ],
    icon: Crown,
  },
];

const filterTabs = computed(() => [
  { id: 'all' as const, label: 'Semua Pembaruan', count: changelogItems.length },
  {
    id: 'system' as const,
    label: 'Jadwal & Waktu',
    count: changelogItems.filter((i) => i.category === 'system').length,
  },
  {
    id: 'database' as const,
    label: 'Database & Sinkronisasi',
    count: changelogItems.filter((i) => i.category === 'database').length,
  },
]);

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

// Automatically show the release notes modal once for authenticated users who haven't seen v1.0.1 changelog yet
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
            Versi {{ RELEASE_VERSION }} (Build {{ BUILD_NUMBER }}) · {{ RELEASE_DATE }}
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
              <span>Rilis Pembaruan · v{{ RELEASE_VERSION }}</span>
            </span>
            <span
              class="inline-flex items-center px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-400/25 text-emerald-300 text-[11px] font-mono font-medium"
            >
              <span>Build {{ BUILD_NUMBER }}</span>
            </span>
            <span
              class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10 text-slate-200 text-[11px] font-mono"
            >
              <Layers class="w-3.5 h-3.5 text-emerald-400" />
              <span>{{ changelogItems.length }} Pembaruan Utama</span>
            </span>
          </div>

          <div class="space-y-1.5">
            <h3 class="text-base sm:text-lg font-bold tracking-tight text-white">
              Catatan Pembaruan Sisa Uang v{{ RELEASE_VERSION }}
            </h3>
            <p class="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Pembaruan versi <strong class="text-emerald-300 font-mono">v{{ RELEASE_VERSION }}</strong> (Build {{ BUILD_NUMBER }}) menghadirkan peningkatan keandalan pada jadwal transaksi otomatisasi, penyelarasan zona waktu WIB, perlindungan transaksi ganda lintas perangkat, serta penyempurnaan sinkronisasi saat beralih akun Pro dan Free.
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
          class="min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap flex items-center gap-1.5 transition-colors shrink-0 border cursor-pointer"
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
          <div class="flex flex-wrap items-center justify-between gap-2">
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

            <span
              v-if="item.isProExclusive"
              class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-100 dark:bg-amber-950/80 border border-amber-300/70 dark:border-amber-800/70 text-amber-800 dark:text-amber-300 text-[10px] font-bold uppercase tracking-wider"
            >
              <Crown class="w-3 h-3 shrink-0" />
              <span>Khusus Pro</span>
            </span>
          </div>

          <!-- Title, Summary & Detailed Bullet Points -->
          <div class="space-y-2">
            <h4 class="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 leading-snug">
              {{ item.title }}
            </h4>
            <p class="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              {{ item.summary }}
            </p>
            <ul class="space-y-1.5 pt-1 text-xs text-slate-600 dark:text-slate-300 list-disc pl-4 leading-relaxed">
              <li v-for="(detail, idx) in item.details" :key="idx">
                {{ detail }}
              </li>
            </ul>
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
          class="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-colors shrink-0 shadow-xs cursor-pointer"
          @click="markChangelogSeenAndClose"
        >
          <Check class="w-4 h-4 shrink-0" />
          <span>Mengerti &amp; Mulai Gunakan</span>
        </button>
      </div>
    </template>
  </AppModal>
</template>
