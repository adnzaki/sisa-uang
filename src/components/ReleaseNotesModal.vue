<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import {
  Sparkles,
  Code2,
  Database,
  Palette,
  PiggyBank,
  Tags,
  Globe,
  UserCheck,
  Wallet,
  ShieldCheck,
  Smartphone,
  BarChart3,
  CheckCircle2,
  Rocket,
  Layers,
  Check,
} from 'lucide-vue-next';
import { useNotificationStore } from '../stores/notification';
import { useAuthStore } from '../stores/auth';
import AppModal from './AppModal.vue';

const CHANGELOG_SEEN_KEY = 'sisa_uang_changelog_seen_v1_0_0_rc_3';
const RELEASE_VERSION = '1.0.0-rc.3';
const RELEASE_DATE = 'Oktober 2026';

const notificationStore = useNotificationStore();
const authStore = useAuthStore();

const activeFilter = ref<'all' | 'architecture' | 'features' | 'personalization' | 'security'>('all');

export interface ChangelogItem {
  id: string;
  category: 'architecture' | 'features' | 'personalization' | 'security';
  badge: string;
  badgeColor: 'emerald' | 'indigo' | 'amber' | 'rose' | 'sky';
  title: string;
  summary: string;
  highlights: string[];
  icon: any;
}

const changelogItems: ChangelogItem[] = [
  {
    id: 'js-rewrite',
    category: 'architecture',
    badge: 'REWRITE TOTAL',
    badgeColor: 'emerald',
    title: 'Transformasi Penuh ke Ekosistem JavaScript Modern (Meninggalkan PHP)',
    summary:
      'Seluruh kode sumber aplikasi Sisa Uang telah ditulis ulang dari nol menggunakan ekosistem JavaScript/TypeScript full-stack modern, menggantikan arsitektur lama berbasis PHP (CodeIgniter 4).',
    highlights: [
      'Arsitektur Single Page Application (SPA) reaktif berbasis Vue 3 Composition API, Pinia, Vue Router, dan Vite untuk perpindahan halaman instan tanpa reload.',
      'Backend server berbasis Node.js & Express (TypeScript) yang cepat, ringan, dan terintegrasi langsung dengan API modern.',
      'Performa pemuatan halaman dan respons interaksi meningkat drastis di perangkat mobile maupun desktop.',
    ],
    icon: Code2,
  },
  {
    id: 'firestore-migration',
    category: 'architecture',
    badge: 'DATABASE CLOUD',
    badgeColor: 'sky',
    title: 'Migrasi Sistem Database dari MySQL ke Cloud Firestore',
    summary:
      'Beralih sepenuhnya dari database relasional MySQL ke Google Cloud Firestore (skema database "sisa-uang") yang mendukung sinkronisasi data real-time lintas perangkat.',
    highlights: [
      'Sinkronisasi otomatis secara real-time (live listener) untuk dompet, kepemilikan dana, transaksi, kategori, dan anggaran tanpa perlu refresh manual.',
      'Kompatibilitas penuh dengan data akun lama hasil migrasi MySQL/PHPMyAdmin (termasuk dukungan verifikasi hash kata sandi lama & alat konversi JSON migrasi).',
      'Mekanisme Soft Delete terstandarisasi sehingga penghapusan data tetap menjaga keutuhan histori dan audit.',
    ],
    icon: Database,
  },
  {
    id: 'ui-theme-redesign',
    category: 'personalization',
    badge: 'ANTARMUKA BARU',
    badgeColor: 'indigo',
    title: 'Pembaruan Total Antarmuka dengan Tema Terang, Gelap & Sistem',
    summary:
      'Desain ulang menyeluruh pada seluruh halaman aplikasi dengan tata letak modern yang bersih, proporsional, dan nyaman di mata pada segala ukuran layar.',
    highlights: [
      'Pilihan 3 mode tampilan: Tema Terang (Light), Tema Gelap (Dark), dan Otomatis mengikuti Sistem perangkat yang dapat diakses cepat dari menu profil di pojok kanan atas.',
      'Navigasi adaptif: Sidebar tetap & Topbar bersih di layar desktop, serta Bottom Navigation Bar ramah jempol (thumb-zone) dan Slide-Out Drawer di layar smartphone.',
      'Komponen pemilih tanggal bergaya kalender Material Design, modal dialog terfokus, serta dropdown pintar dengan pencarian instan (ketik untuk cari) yang bebas tertutup keyboard mobile.',
    ],
    icon: Palette,
  },
  {
    id: 'budget-planner',
    category: 'features',
    badge: 'FITUR BARU',
    badgeColor: 'emerald',
    title: 'Fitur Perencanaan & Pemantauan Anggaran Bulanan (Budgeting)',
    summary:
      'Kini Anda dapat menetapkan batas anggaran pengeluaran bulanan untuk setiap kategori guna menjaga pengeluaran tetap terkendali.',
    highlights: [
      'Indikator visual persentase pemakaian anggaran secara real-time (Hijau: Aman, Kuning: Waspada >=70%, Merah: Kritis >=90%).',
      'Perhitungan otomatis nominal terpakai, sisa anggaran kategori, serta rekomendasi batas aman pengeluaran harian di Dashboard.',
      'Ketuk langsung kartu anggaran untuk mengubah batas nominal atau menghapus anggaran dengan cepat.',
    ],
    icon: PiggyBank,
  },
  {
    id: 'editable-default-categories',
    category: 'features',
    badge: 'PENINGKATAN',
    badgeColor: 'amber',
    title: 'Kategori Bawaan Kini Dapat Diedit dan Dihapus Secara Fleksibel',
    summary:
      'Manajemen kategori pemasukan dan pengeluaran kini memberikan kendali penuh kepada pengguna, baik untuk kategori kustom maupun kategori bawaan sistem.',
    highlights: [
      'Kategori bawaan sistem (default) kini dapat langsung diketuk untuk diubah nama maupun tipenya; saat disimpan, kategori tersebut otomatis menjadi kategori Kustom milik Anda.',
      'Kategori bawaan yang tidak Anda gunakan kini dapat dihapus dari daftar aktif Anda tanpa memengaruhi pengguna lain.',
      'Tautan pintasan cepat "Kelola kategori di sini" langsung dari halaman Anggaran serta pencarian kategori instan.',
    ],
    icon: Tags,
  },
  {
    id: 'wallet-ownership-dashboard',
    category: 'features',
    badge: 'CORE UPGRADE',
    badgeColor: 'emerald',
    title: 'Peningkatan Fitur Kepemilikan Dana, Dompet & Tampilan Dashboard',
    summary:
      'Pengelolaan multi-dompet dan pemisahan kepemilikan dana dalam satu rekening kini jauh lebih rapi, akurat, dan terintegrasi.',
    highlights: [
      'Alur pencatatan transaksi terstruktur: Pilih Sumber Dana -> Pilih Pemilik Dana -> Input Nominal dengan pemisah ribuan otomatis (titik) saat mengetik.',
      'Dukungan penuh transaksi Pemasukan, Pengeluaran, dan Transfer Antar Dompet/Pemilik Dana beserta opsi pencatatan Biaya Admin otomatis.',
      'Dashboard eksekutif baru yang merangkum Sisa Uang Aktif, Arus Kas Bersih, Rasio Tabungan, Ringkasan Kepemilikan Dana, dan 5 Transaksi Terakhir.',
      'Filter transaksi terpadu dalam satu tombol & modal dialog (Periode Bulan, Jenis Transaksi, Kategori, Sumber Dana, dan Kepemilikan) serta halaman Analitik Visual interaktif.',
    ],
    icon: Wallet,
  },
  {
    id: 'language-currency-font',
    category: 'personalization',
    badge: 'PERSONALISASI',
    badgeColor: 'indigo',
    title: 'Pilihan Bahasa, Mata Uang & Tipografi Font Khusus Angka',
    summary:
      'Sesuaikan pengalaman membaca laporan keuangan dengan preferensi bahasa, format mata uang, dan gaya tipografi angka favorit Anda di halaman Pengaturan.',
    highlights: [
      'Dukungan multi-bahasa: Bahasa Indonesia dan Bahasa Inggris (English) secara instan.',
      'Pilihan format tampilan mata uang: Rupiah (IDR) dan Dolar AS (USD).',
      'Pilihan gaya font khusus nominal uang & angka (Font Angka) dengan dukungan tabular-nums agar deretan angka selalu sejajar dan tajam.',
    ],
    icon: Globe,
  },
  {
    id: 'display-name-profile',
    category: 'personalization',
    badge: 'PROFIL & AKUN',
    badgeColor: 'sky',
    title: 'Opsi Mengatur Tampilan Nama (Display Name), Username & Kata Sandi',
    summary:
      'Kelola identitas akun Anda secara mandiri kapan saja melalui halaman Pengaturan tanpa perlu membuat akun baru.',
    highlights: [
      'Opsi mengubah Nama Tampilan (Display Name) dan Username login secara langsung yang tersinkronisasi ke topbar dan database.',
      'Fitur Keamanan & Ubah Kata Sandi dengan verifikasi kata sandi lama dan tombol lihat/sembunyikan karakter.',
      'Menu Akun terpadu di pojok kanan atas layar yang menampilkan inisial profil, detail akun, pengatur tema, informasi rilis, dan tombol keluar.',
    ],
    icon: UserCheck,
  },
  {
    id: 'pwa-security-confirmation',
    category: 'security',
    badge: 'PWA & KEAMANAN',
    badgeColor: 'rose',
    title: 'Dukungan Aplikasi PWA, Konfirmasi Hapus & Pembaruan Otomatis',
    summary:
      'Dilengkapi perlindungan ekstra terhadap penghapusan tidak sengaja, autentikasi berlapis, serta kemampuan instalasi ke layar utama perangkat.',
    highlights: [
      'Modal Konfirmasi Hapus Data pada setiap aksi penghapusan (Transaksi, Dompet, Kepemilikan Dana, Kategori, Anggaran, dan Pengguna).',
      'Progressive Web App (PWA): Dapat diinstal ke Homescreen smartphone/desktop, indikator status offline, serta deteksi update versi baru dengan fitur Bersihkan Cache & Reload Penuh.',
      'Keamanan autentikasi Google OAuth, Email/Username, serta proteksi 2FA Real OTP via Email (SMTP) untuk akses Control Panel Super Admin.',
    ],
    icon: ShieldCheck,
  },
];

const filterTabs = [
  { id: 'all' as const, label: 'Semua Pembaruan', count: changelogItems.length },
  {
    id: 'architecture' as const,
    label: 'Arsitektur & DB',
    count: changelogItems.filter((i) => i.category === 'architecture').length,
  },
  {
    id: 'features' as const,
    label: 'Fitur Keuangan',
    count: changelogItems.filter((i) => i.category === 'features').length,
  },
  {
    id: 'personalization' as const,
    label: 'UI & Personalisasi',
    count: changelogItems.filter((i) => i.category === 'personalization').length,
  },
  {
    id: 'security' as const,
    label: 'PWA & Keamanan',
    count: changelogItems.filter((i) => i.category === 'security').length,
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

// Automatically show the release notes modal once for authenticated users who haven't seen v1.0.0-rc.3 changelog yet
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
            Major Rewrite Edition · {{ RELEASE_DATE }}
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
              <span>Major Release · v{{ RELEASE_VERSION }}</span>
            </span>
            <span
              class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10 text-slate-200 text-[11px] font-mono"
            >
              <Layers class="w-3.5 h-3.5 text-emerald-400" />
              <span>JavaScript + Cloud Firestore Rewrite</span>
            </span>
          </div>

          <div class="space-y-1.5">
            <h3 class="text-base sm:text-lg font-bold tracking-tight text-white">
              Selamat Datang di Generasi Baru Sisa Uang!
            </h3>
            <p class="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Versi <strong class="text-emerald-300 font-mono">{{ RELEASE_VERSION }}</strong> merupakan
              pembaruan besar (<em>major rewrite</em>) dari versi sebelumnya. Seluruh fondasi aplikasi telah
              ditulis ulang menggunakan ekosistem <strong>JavaScript modern</strong> dan database
              <strong>Cloud Firestore</strong>, menghadirkan antarmuka baru yang jauh lebih cepat, responsif,
              dan kaya fitur.
            </p>
          </div>

          <!-- Quick Summary Metrics -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
            <div class="rounded-xl bg-white/5 border border-white/10 px-3 py-2">
              <div class="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                Engine Baru
              </div>
              <div class="text-xs sm:text-sm font-bold text-emerald-300 mt-0.5">
                100% JavaScript
              </div>
            </div>
            <div class="rounded-xl bg-white/5 border border-white/10 px-3 py-2">
              <div class="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                Database
              </div>
              <div class="text-xs sm:text-sm font-bold text-sky-300 mt-0.5">
                Cloud Firestore
              </div>
            </div>
            <div class="rounded-xl bg-white/5 border border-white/10 px-3 py-2">
              <div class="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                Tampilan UI
              </div>
              <div class="text-xs sm:text-sm font-bold text-indigo-300 mt-0.5">
                Terang &amp; Gelap
              </div>
            </div>
            <div class="rounded-xl bg-white/5 border border-white/10 px-3 py-2">
              <div class="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                Total Pembaruan
              </div>
              <div class="text-xs sm:text-sm font-bold text-amber-300 mt-0.5">
                9 Pilar Utama
              </div>
            </div>
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

          <!-- Highlight Bullet Points -->
          <ul
            class="space-y-1.5 pt-2 border-t border-slate-200/60 dark:border-slate-800/80 pl-1"
          >
            <li
              v-for="(point, pIdx) in item.highlights"
              :key="pIdx"
              class="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300 leading-relaxed"
            >
              <CheckCircle2
                class="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5"
              />
              <span>{{ point }}</span>
            </li>
          </ul>
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
