<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import {
  Sparkles,
  Rocket,
  Layers,
  Check,
  Clock,
  RotateCcw,
  Crown,
  QrCode,
  Wrench,
  Database,
  Users,
} from 'lucide-vue-next';
import { useNotificationStore } from '../stores/notification';
import { useAuthStore } from '../stores/auth';
import AppModal from './AppModal.vue';

const LAST_SEEN_VERSION_KEY = 'sisa_uang_last_seen_app_version';
const LAST_SEEN_BUILD_KEY = 'sisa_uang_last_seen_build_number';
const JUST_UPDATED_FLAG_KEY = 'sisa_uang_app_just_updated';
const RELEASE_VERSION = '1.0.2';
const RELEASE_DATE = 'November 2026';
const BUILD_NUMBER = '10219';
const CHANGELOG_SEEN_KEY = computed(
  () => `sisa_uang_changelog_seen_v${RELEASE_VERSION.replace(/\./g, '_')}_b${BUILD_NUMBER}`
);

const notificationStore = useNotificationStore();
const authStore = useAuthStore();

type ChangelogCategory = 'all' | 'payment' | 'navigation' | 'database' | 'feature';
const activeFilter = ref<ChangelogCategory>('all');

export interface ChangelogItem {
  id: string;
  category: 'payment' | 'navigation' | 'database' | 'feature';
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
    id: 'qris-nusapay-support',
    category: 'payment',
    badge: 'PEMBAYARAN QRIS (NUSAPAY)',
    badgeColor: 'emerald',
    title: 'Dukungan Pembayaran Instan via QRIS (Nusapay)',
    summary:
      'Integrasi resmi metode pembayaran instan QRIS melalui kanal gateway Nusapay dengan verifikasi transaksi real-time dan aktivasi otomatis paket SisaUang Pro:',
    details: [
      'Barcode QRIS Standar Nasional Dinamis: Mendukung pemindaian langsung dari seluruh aplikasi perbankan (BCA, Mandiri, BRI, BNI, Permata, dll.) serta dompet digital ternama (GoPay, OVO, DANA, ShopeePay, LinkAja).',
      'Aktivasi Lisensi Pro Otomatis Tanpa Upload Bukti: Sistem pembayaran secara seketika memverifikasi notifikasi gateway dan langsung meningkatkan status akun ke SisaUang Pro tanpa perlu upload bukti transfer.',
      'Fallback Multi-Kanal Cerdas: Arsitektur payment gateway dilengkapi sistem failover cerdas demi menjamin ketersediaan layanan QRIS yang stabil dan dapat diandalkan setiap saat.',
    ],
    icon: QrCode,
  },
  {
    id: 'utilities-menu-reorder',
    category: 'navigation',
    badge: 'NAVIGASI & TATA LETAK',
    badgeColor: 'indigo',
    title: 'Pemindahan Menu Utilitas ke Posisi Atas Pengaturan',
    summary:
      'Penyempurnaan hierarki navigasi dan penataan urutan menu guna menghadirkan alur kerja yang lebih ergonomis dan teratur:',
    details: [
      'Penempatan Strategis Menu Utilitas: Menu Utilitas beserta submenu Otomatisasi kini diposisikan tepat di atas Pengaturan pada bilah navigasi utama.',
      'Tata Letak Sinkron Desktop & Mobile: Tatanan menu diterapkan secara konsisten baik pada sidebar desktop layar lebar maupun panel drawer navigasi pada layar ponsel.',
      'Akses Cepat Fitur Otomatisasi: Memudahkan pengguna membuka dan memantau jadwal transaksi rutin harian tanpa harus menggulir melewati menu pengaturan umum.',
    ],
    icon: Wrench,
  },
  {
    id: 'automation-transaction-schema-sync',
    category: 'database',
    badge: 'SINKRONISASI SKEMA DATA',
    badgeColor: 'sky',
    title: 'Sinkronisasi Skema Otomatisasi dan Transaksi',
    summary:
      'Penyelarasan menyeluruh antara struktur skema data jadwal otomatisasi dengan catatan mutasi transaksi pada database Cloud Firestore:',
    details: [
      'Standardisasi Parameter Transaksi Otomatis: Menyelaraskan seluruh atribut transaksi terjadwal, meliputi ID aturan (automationRuleId), relasi kategori, rincian kepemilikan dana, serta biaya admin transfer.',
      'Pencegahan Transaksi Ganda Multi-Perangkat: Penerapan ID transaksi deterministik harian yang sinkron memastikan transaksi otomatis hanya dicatat tepat satu kali meski aplikasi terbuka di banyak tab atau perangkat.',
      'Integritas Saldo & Akuntansi Presisi: Seluruh mutasi saldo dompet dan rincian alokasi kepemilikan dana hasil eksekusi otomatis tersinkronisasi akurat sesuai aturan akuntansi ganda.',
    ],
    icon: Database,
  },
  {
    id: 'wallet-existing-owner-selector',
    category: 'feature',
    badge: 'MANAJEMEN DOMPET',
    badgeColor: 'amber',
    title: 'Dukungan Pemilihan Pemilik Dana yang Sudah Ada pada Form Dompet',
    summary:
      'Peningkatan fleksibilitas form penambahan dan pengubahan dompet dengan fitur pemilihan pemilik dana yang telah terdaftar sebelumnya:',
    details: [
      'Pilihan Cepat Pemilik Dana Terdaftar: Form pembuatan dan pengubahan dompet kini menyediakan opsi pilihan langsung dari seluruh kepemilikan dana yang telah ada tanpa perlu mengetik ulang nama dari awal.',
      'Fleksibilitas Tambah Pemilik Baru: Tetap menyediakan opsi beralih instan untuk mengetik nama pemilik baru secara leluasa bila ingin membuat alokasi terpisah.',
      'Pencegahan Typo & Duplikasi Kepemilikan: Mencegah timbulnya variasi penamaan pemilik dana yang serupa sehingga laporan keuangan per kepemilikan tetap rapi dan konsisten.',
    ],
    icon: Users,
  },
];

const filterTabs = computed(() => [
  { id: 'all' as const, label: 'Semua Pembaruan', count: changelogItems.length },
  {
    id: 'payment' as const,
    label: 'QRIS (Nusapay)',
    count: changelogItems.filter((i) => i.category === 'payment').length,
  },
  {
    id: 'navigation' as const,
    label: 'Tata Letak Menu',
    count: changelogItems.filter((i) => i.category === 'navigation').length,
  },
  {
    id: 'database' as const,
    label: 'Skema Database',
    count: changelogItems.filter((i) => i.category === 'database').length,
  },
  {
    id: 'feature' as const,
    label: 'Manajemen Dompet',
    count: changelogItems.filter((i) => i.category === 'feature').length,
  },
]);

const filteredChangelog = computed(() => {
  if (activeFilter.value === 'all') return changelogItems;
  return changelogItems.filter((item) => item.category === activeFilter.value);
});

function markChangelogSeenAndClose() {
  try {
    localStorage.setItem(LAST_SEEN_VERSION_KEY, RELEASE_VERSION);
    localStorage.setItem(LAST_SEEN_BUILD_KEY, BUILD_NUMBER);
    localStorage.setItem(CHANGELOG_SEEN_KEY.value, 'true');
    localStorage.removeItem(JUST_UPDATED_FLAG_KEY);
    sessionStorage.removeItem(JUST_UPDATED_FLAG_KEY);
  } catch {
    // Ignore storage error
  }
  notificationStore.closeChangelogModal();
}

// Watch modal closure to ensure seen keys are recorded even if dismissed via backdrop or Esc
watch(
  () => notificationStore.changelogModalOpen,
  (isOpen) => {
    if (!isOpen) {
      try {
        localStorage.setItem(LAST_SEEN_VERSION_KEY, RELEASE_VERSION);
        localStorage.setItem(LAST_SEEN_BUILD_KEY, BUILD_NUMBER);
        localStorage.setItem(CHANGELOG_SEEN_KEY.value, 'true');
        localStorage.removeItem(JUST_UPDATED_FLAG_KEY);
        sessionStorage.removeItem(JUST_UPDATED_FLAG_KEY);
      } catch {
        // Ignore storage error
      }
    }
  }
);

// One-time evaluation: Only show automatically when the application was JUST updated (new version or new build number)
let hasEvaluatedAutoOpen = false;

function checkAutoOpenOnUpdate() {
  if (hasEvaluatedAutoOpen || typeof window === 'undefined') return;

  // Do not interrupt if user is in the middle of OTP verification
  if (authStore.requiresOtp) return;

  hasEvaluatedAutoOpen = true;

  try {
    const prevVersion = localStorage.getItem(LAST_SEEN_VERSION_KEY);
    const prevBuild = localStorage.getItem(LAST_SEEN_BUILD_KEY);
    const sessionJustUpdated = sessionStorage.getItem(JUST_UPDATED_FLAG_KEY) === 'true';
    const localJustUpdated = localStorage.getItem(JUST_UPDATED_FLAG_KEY) === 'true';
    const currentSeenKey = CHANGELOG_SEEN_KEY.value;
    const releaseAlreadySeen = localStorage.getItem(currentSeenKey) === 'true';

    // Clear one-time reload flags
    if (sessionJustUpdated) sessionStorage.removeItem(JUST_UPDATED_FLAG_KEY);
    if (localJustUpdated) localStorage.removeItem(JUST_UPDATED_FLAG_KEY);

    // Condition 1: Upgraded from an older stored version (e.g. 1.0.1 -> 1.0.2)
    const isVersionChanged = Boolean(prevVersion && prevVersion !== RELEASE_VERSION);

    // Condition 2: Build number changed (e.g. 10218 -> 10219)
    const isBuildChanged = Boolean(prevBuild && prevBuild !== BUILD_NUMBER);

    // Condition 3: Explicit reload update triggered by PWA / update banner
    const isExplicitUpdateReload = sessionJustUpdated || localJustUpdated;

    // If both version and build number already match and this release was seen, do not pop up again
    const isSameVersionAndBuild = prevVersion === RELEASE_VERSION && prevBuild === BUILD_NUMBER;
    if (isSameVersionAndBuild || releaseAlreadySeen) {
      localStorage.setItem(LAST_SEEN_VERSION_KEY, RELEASE_VERSION);
      localStorage.setItem(LAST_SEEN_BUILD_KEY, BUILD_NUMBER);
      localStorage.setItem(currentSeenKey, 'true');
      return;
    }

    if (isVersionChanged || isBuildChanged || isExplicitUpdateReload) {
      // Show automatically once because version or build number changed
      localStorage.setItem(LAST_SEEN_VERSION_KEY, RELEASE_VERSION);
      localStorage.setItem(LAST_SEEN_BUILD_KEY, BUILD_NUMBER);
      localStorage.setItem(currentSeenKey, 'true');
      notificationStore.openChangelogModal();
    } else {
      // First visit or fresh install: record silently so regular reloads don't pop up
      localStorage.setItem(LAST_SEEN_VERSION_KEY, RELEASE_VERSION);
      localStorage.setItem(LAST_SEEN_BUILD_KEY, BUILD_NUMBER);
      localStorage.setItem(currentSeenKey, 'true');
    }
  } catch {
    // Ignore storage errors
  }
}

onMounted(() => {
  setTimeout(() => {
    checkAutoOpenOnUpdate();
  }, 100);
});

// If auth state resolves after mount and requiresOtp clears, check once
watch(
  () => [authStore.isReady, authStore.requiresOtp] as const,
  ([ready, needOtp]) => {
    if (ready && !needOtp && !hasEvaluatedAutoOpen) {
      checkAutoOpenOnUpdate();
    }
  }
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
              Pembaruan versi <strong class="text-emerald-300 font-mono">v{{ RELEASE_VERSION }}</strong> (Build {{ BUILD_NUMBER }}) menghadirkan dukungan pembayaran instan via QRIS (Nusapay), penataan posisi menu Utilitas di atas Pengaturan, sinkronisasi skema otomatisasi dan transaksi, serta kemudahan memilih pemilik dana yang sudah ada pada form dompet.
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
