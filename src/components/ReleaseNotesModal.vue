<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import {
  Sparkles,
  Rocket,
  Layers,
  Check,
  Crown,
  Database,
  Target,
  HandCoins,
  BellRing,
  Smartphone,
} from 'lucide-vue-next';
import { useNotificationStore } from '../stores/notification';
import { useAuthStore } from '../stores/auth';
import AppModal from './AppModal.vue';

const LAST_SEEN_VERSION_KEY = 'sisa_uang_last_seen_app_version';
const LAST_SEEN_BUILD_KEY = 'sisa_uang_last_seen_build_number';
const JUST_UPDATED_FLAG_KEY = 'sisa_uang_app_just_updated';
const PENDING_CHANGELOG_ACK_KEY = 'sisa_uang_pending_changelog_ack';
const RELEASE_VERSION = '1.0.3';
const RELEASE_DATE = 'November 2026';
const BUILD_NUMBER = '10326';
const CHANGELOG_SEEN_KEY = computed(
  () => `sisa_uang_changelog_seen_v${RELEASE_VERSION.replace(/\./g, '_')}_b${BUILD_NUMBER}`
);

const notificationStore = useNotificationStore();
const authStore = useAuthStore();

type ChangelogCategory = 'all' | 'feature' | 'database' | 'notification' | 'layout';
const activeFilter = ref<ChangelogCategory>('all');

export interface ChangelogItem {
  id: string;
  category: 'feature' | 'database' | 'notification' | 'layout';
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
    id: 'savings-feature',
    category: 'feature',
    badge: 'FITUR TABUNGAN',
    badgeColor: 'emerald',
    title: 'Menambahkan Fitur Tabungan',
    summary:
      'Hadir modul Tabungan & Perencanaan untuk membantu Anda menyisihkan dan memantau target dana tanpa mengganggu saldo utama:',
    details: [
      'Target Tabungan Terstruktur: Buat rencana tabungan dengan nominal target, tanggal tenggat (deadline), dan rincian riwayat setoran maupun penarikan.',
      'Integrasi Saldo Dompet & Kepemilikan: Kelola dana tabungan langsung dari dompet serta kepemilikan dana yang telah terdaftar dengan kalkulasi progres otomatis.',
      'Kuota Akun Free & Pro: Pengguna Free dapat membuat 1 rencana tabungan aktif, sedangkan pelanggan SisaUang Pro mendapatkan kuota tabungan tanpa batas.',
    ],
    icon: Target,
  },
  {
    id: 'debts-receivables-feature',
    category: 'feature',
    badge: 'HUTANG & PIUTANG',
    badgeColor: 'rose',
    title: 'Menambahkan Fitur Hutang / Piutang',
    summary:
      'Hadir modul pencatatan Hutang dan Piutang yang terintegrasi penuh dengan riwayat transaksi serta pengelolaan cicilan:',
    details: [
      'Pencatatan Terintegrasi Transaksi: Menambah hutang atau piutang serta mencatat pembayaran ("Cicil") maupun penerimaan ("Terima") otomatis tercatat ke dalam mutasi transaksi.',
      'Halaman Detail & Riwayat Pelunasan: Setiap kartu Hutang/Piutang memiliki halaman detail tersendiri lengkap dengan progres pelunasan dan riwayat angsuran.',
      'Kuota Akun Free & Pro: Akun Free mendapatkan masing-masing 1 kuota Hutang dan 1 kuota Piutang, sedangkan SisaUang Pro bebas tanpa batas.',
    ],
    icon: HandCoins,
  },
  {
    id: 'caching-database-performance',
    category: 'database',
    badge: 'PERFORMA & DATABASE',
    badgeColor: 'sky',
    title: 'Meningkatkan Performa Caching dan Operasi Database',
    summary:
      'Optimalisasi mekanisme caching dan operasi pembacaan/penulisan database agar aplikasi berjalan lebih cepat dan responsif:',
    details: [
      'Efisiensi Cache Lokal & Sinkronisasi: Mengurangi operasi baca berulang ke server dan Cloud Firestore dengan mekanisme cache lokal yang lebih terstruktur.',
      'Akses Data & Navigasi Lebih Cepat: Pemuatan ringkasan saldo, riwayat transaksi, dompet, tabungan, dan hutang/piutang terasa lebih ringan serta responsif.',
      'Kestabilan Operasi Data: Pengelolaan antrean pembacaan dan pembaruan data dioptimalkan untuk mencegah beban berlebih pada database.',
    ],
    icon: Database,
  },
  {
    id: 'push-notification-reminders',
    category: 'notification',
    badge: 'PUSH NOTIFICATION',
    badgeColor: 'amber',
    title: 'Mengimplementasikan Push Notification untuk Otomatisasi, Tabungan dan Hutang / Piutang',
    summary:
      'Dukungan notifikasi perangkat secara langsung agar jadwal transaksi rutin, setoran tabungan, dan cicilan tidak pernah terlewat:',
    details: [
      'Pengingat Otomatisasi Transaksi: Mengirimkan push notification sesuai jadwal otomatisasi yang telah dikonfirmasi maupun yang membutuhkan konfirmasi pengguna.',
      'Pengingat Rutin Tabungan & Hutang / Piutang: Mendukung notifikasi terjadwal untuk pengingat setoran tabungan serta jatuh tempo cicilan hutang maupun piutang.',
      'Kontrol Izin Notifikasi Langsung: Tersedia tombol pengaturan status izin push notification pada masing-masing halaman fitur.',
    ],
    icon: BellRing,
  },
  {
    id: 'mobile-menu-structure-fix',
    category: 'layout',
    badge: 'NAVIGASI MOBILE',
    badgeColor: 'indigo',
    title: 'Memperbaiki Struktur Menu pada Tampilan Mobile',
    summary:
      'Penataan ulang susunan menu pada sidebar mobile agar lebih ringkas, tidak duplikatif dengan bottom navbar, dan lebih mudah dijangkau:',
    details: [
      'Penghapusan Menu Duplikat di Sidebar Mobile: Menu Ringkasan, Transaksi, dan Dompet dihilangkan khusus dari sidebar mobile karena sudah tersedia di bottom navbar, sementara Pengaturan tetap dipertahankan.',
      'Menu Utilitas Menjadi Menu Utama di Mobile: Sub-menu Otomatisasi, Tabungan, dan Hutang & Piutang dikeluarkan dari grup Utilitas menjadi menu utama langsung di sidebar mobile.',
      'Konsistensi Tampilan Tablet & Desktop: Struktur menu lengkap beserta akordeon Utilitas tetap dipertahankan pada layar tablet dan desktop.',
    ],
    icon: Smartphone,
  },
  {
    id: 'sidebar-version-changelog-fix',
    category: 'layout',
    badge: 'PERBAIKAN INFO RILIS',
    badgeColor: 'emerald',
    title: 'Memperbaiki Informasi Versi dan Catatan Rilis pada Sidebar yang Tidak Menampilkan Info Versi dan Changelog',
    summary:
      'Memperbaiki kendala pada tombol informasi versi di bagian bawah sidebar agar modal detail versi dan catatan pembaruan tampil sempurna saat diklik:',
    details: [
      'Perbaikan Sinkronisasi State Modal & Drawer: Mengatasi konflik riwayat navigasi antara penutupan sidebar drawer dan pembukaan modal sehingga modal changelog tidak langsung tertutup kembali.',
      'Rendering Modal Tingkat Atas (Teleport): Memastikan modal informasi versi dan changelog selalu tampil di lapisan teratas baik pada perangkat desktop maupun mobile.',
      'Akses Konsisten dari Seluruh Titik Masuk: Tombol Versi & Info Rilis pada sidebar, menu akun, dan halaman Pengaturan kini berfungsi andal membuka informasi versi beserta daftar perubahannya.',
    ],
    icon: Sparkles,
  },
];

const filterTabs = computed(() => [
  { id: 'all' as const, label: 'Semua Pembaruan', count: changelogItems.length },
  {
    id: 'feature' as const,
    label: 'Fitur Baru',
    count: changelogItems.filter((i) => i.category === 'feature').length,
  },
  {
    id: 'database' as const,
    label: 'Cache & Database',
    count: changelogItems.filter((i) => i.category === 'database').length,
  },
  {
    id: 'notification' as const,
    label: 'Push Notification',
    count: changelogItems.filter((i) => i.category === 'notification').length,
  },
  {
    id: 'layout' as const,
    label: 'Menu & Perbaikan',
    count: changelogItems.filter((i) => i.category === 'layout').length,
  },
]);

const filteredChangelog = computed(() => {
  if (activeFilter.value === 'all') return changelogItems;
  return changelogItems.filter((item) => item.category === activeFilter.value);
});

function acknowledgeChangelogAndClose() {
  try {
    localStorage.setItem(LAST_SEEN_VERSION_KEY, RELEASE_VERSION);
    localStorage.setItem(LAST_SEEN_BUILD_KEY, BUILD_NUMBER);
    localStorage.setItem(CHANGELOG_SEEN_KEY.value, 'true');
    localStorage.removeItem(JUST_UPDATED_FLAG_KEY);
    sessionStorage.removeItem(JUST_UPDATED_FLAG_KEY);
    localStorage.removeItem(PENDING_CHANGELOG_ACK_KEY);
  } catch {
    // Ignore storage error
  }
  notificationStore.closeChangelogModal();
}

function dismissChangelogModal() {
  notificationStore.closeChangelogModal();
}

// One-time evaluation: Automatically show changelog after an update reload or new version/build,
// and keep prompting on load until user clicks "Mengerti & Mulai Gunakan".
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
    const hasPendingAck = localStorage.getItem(PENDING_CHANGELOG_ACK_KEY) === 'true';
    const currentSeenKey = CHANGELOG_SEEN_KEY.value;
    const releaseAcknowledged = localStorage.getItem(currentSeenKey) === 'true';

    // Clear one-time reload flags after reading
    if (sessionJustUpdated) sessionStorage.removeItem(JUST_UPDATED_FLAG_KEY);
    if (localJustUpdated) localStorage.removeItem(JUST_UPDATED_FLAG_KEY);

    // Condition 1: Explicit reload update triggered by PWA / update banner / settings reload
    const isExplicitUpdateReload = sessionJustUpdated || localJustUpdated;

    // Condition 2: Upgraded from an older stored version (e.g. 1.0.2 -> 1.0.3)
    const isVersionChanged = Boolean(prevVersion && prevVersion !== RELEASE_VERSION);

    // Condition 3: Build number changed (e.g. 10222 -> 10323)
    const isBuildChanged = Boolean(prevBuild && prevBuild !== BUILD_NUMBER);

    if (isExplicitUpdateReload || isVersionChanged || isBuildChanged || hasPendingAck) {
      // Mark pending acknowledgment until user explicitly clicks "Mengerti & Mulai Gunakan"
      localStorage.setItem(PENDING_CHANGELOG_ACK_KEY, 'true');
      localStorage.setItem(LAST_SEEN_VERSION_KEY, RELEASE_VERSION);
      localStorage.setItem(LAST_SEEN_BUILD_KEY, BUILD_NUMBER);
      notificationStore.openChangelogModal();
      return;
    }

    const isSameVersionAndBuild = prevVersion === RELEASE_VERSION && prevBuild === BUILD_NUMBER;
    if (isSameVersionAndBuild && releaseAcknowledged) {
      // User already clicked "Mengerti & Mulai Gunakan" for this version/build: never auto-open again
      return;
    }

    if (!prevVersion && !prevBuild) {
      // First visit / clean storage: record current version silently so initial visit doesn't pop up update dialog
      localStorage.setItem(LAST_SEEN_VERSION_KEY, RELEASE_VERSION);
      localStorage.setItem(LAST_SEEN_BUILD_KEY, BUILD_NUMBER);
      localStorage.setItem(currentSeenKey, 'true');
      return;
    }

    // Fallback: version/build exists in storage without acknowledgment -> record silently unless explicit update
    localStorage.setItem(LAST_SEEN_VERSION_KEY, RELEASE_VERSION);
    localStorage.setItem(LAST_SEEN_BUILD_KEY, BUILD_NUMBER);
    localStorage.setItem(currentSeenKey, 'true');
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
    :open="notificationStore.changelogModalOpen"
    title="Informasi Rilis Resmi & Catatan Pembaruan"
    max-width="2xl"
    @close="dismissChangelogModal"
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
              Pembaruan versi <strong class="text-emerald-300 font-mono">v{{ RELEASE_VERSION }}</strong> (Build {{ BUILD_NUMBER }}) menghadirkan fitur Tabungan, fitur Hutang / Piutang, peningkatan performa caching dan operasi database, implementasi Push Notification untuk Otomatisasi, Tabungan serta Hutang / Piutang, perbaikan struktur menu tampilan mobile, serta perbaikan tampilan informasi versi dan catatan rilis pada sidebar.
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
          @click="acknowledgeChangelogAndClose"
        >
          <Check class="w-4 h-4 shrink-0" />
          <span>Mengerti &amp; Mulai Gunakan</span>
        </button>
      </div>
    </template>
  </AppModal>
</template>
