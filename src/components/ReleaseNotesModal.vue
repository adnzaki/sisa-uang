<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import {
  Sparkles,
  Rocket,
  Layers,
  Check,
  FileSpreadsheet,
  PieChart,
  Crown,
} from 'lucide-vue-next';
import { useNotificationStore } from '../stores/notification';
import { useAuthStore } from '../stores/auth';
import AppModal from './AppModal.vue';

const CHANGELOG_SEEN_KEY = 'sisa_uang_changelog_seen_v1_0_0_rc_6';
const RELEASE_VERSION = '1.0.0-rc.6';
const RELEASE_DATE = 'Oktober 2026';

const notificationStore = useNotificationStore();
const authStore = useAuthStore();

const activeFilter = ref<'all' | 'report' | 'budget'>('all');

export interface ChangelogItem {
  id: string;
  category: 'report' | 'budget';
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
    id: 'pro-report-settings',
    category: 'report',
    badge: 'PENGATURAN LAPORAN PDF',
    badgeColor: 'emerald',
    isProExclusive: true,
    title: 'Menambahkan Pengaturan Laporan PDF Resmi (Khusus Pelanggan Pro)',
    summary:
      'Halaman khusus Pengaturan Laporan (Pengaturan → Laporan) yang memberikan kendali penuh bagi pelanggan SisaUang Pro dalam menyesuaikan identitas dokumen resmi pada Laporan Kas Umum, Rekonsiliasi Kas & Kepemilikan, serta Realisasi Anggaran:',
    details: [
      'Kop Laporan Institusi / Organisasi (Mode Teks & Gambar Banner): Mendukung pembuatan kop surat teks (Nama Masjid, Musholla, DKM, RT/RW, Yayasan, atau Organisasi beserta sub-judul dan alamat sekretariat) dilengkapi preset instan, maupun unggah gambar banner kop surat dengan resolusi proporsional asli.',
      'Visibilitas Kop Fleksibel per Jenis Laporan: Opsi pemilihan laporan mana saja yang menampilkan Kop Surat karena tidak semua laporan resmi membutuhkan kop.',
      'Kustomisasi Judul Dokumen Laporan: Ubah judul utama masing-masing jenis laporan PDF sesuai kebutuhan acara, kepanitiaan, atau periode pelaporan.',
      'Manajemen Penandatangan & Tata Letak Tanda Tangan Formal: Tambahkan hingga 3 penandatangan laporan lengkap dengan Kota/Tempat penetapan, pengaturan urutan, penempatan Baris Atas / Baris Bawah, aktivasi penandatangan per laporan, serta tata letak formal otomatis (jika hanya 1 penandatangan otomatis ditempatkan di sisi kanan).',
    ],
    icon: FileSpreadsheet,
  },
  {
    id: 'pro-annual-budget-mapping',
    category: 'budget',
    badge: 'ANGGARAN SETAHUN PENUH',
    badgeColor: 'amber',
    isProExclusive: true,
    title: 'Menambahkan Opsi Anggaran Setahun Penuh & Mapping Bulanan (Khusus Pelanggan Pro)',
    summary:
      'Fitur penganggaran komprehensif untuk merencanakan anggaran satu tahun penuh sekaligus beserta pemetaan alokasi bulanan dan pengendalian disiplin belanja:',
    details: [
      'Mapping Bulanan Fleksibel Tanpa Selisih (Rp 0): Petakan total anggaran tahunan tiap kategori ke bulan-bulan yang direncanakan (tidak wajib diisi setiap bulan, misalnya hanya dialokasikan pada bulan Mei, Juli, dan Agustus) hingga selisih penganggaran Rp 0. Saat anggaran tahunan aktif, penambahan periode bulanan terpisah pada tahun tersebut otomatis dikunci.',
      'Alur Status Draft, Finalisasi & Perubahan Anggaran: Anggaran yang baru disusun atau sedang diedit berstatus Draft hingga pengguna mengklik "Finalisasi Anggaran". Selama berstatus Draft atau dalam masa "Perubahan Anggaran", pencatatan transaksi untuk kategori di dalam anggaran dikunci sementara hingga anggaran difinalisasi kembali.',
      'Opsi Mode Ketat (Disiplin Anggaran): Menolak pencatatan transaksi pengeluaran apabila belum memasuki bulan alokasi anggaran (wajib melakukan perubahan anggaran terlebih dahulu), tetap mengizinkan transaksi setelah melewati batas minimum bulan alokasi, serta membatasi revisi maksimal 5x setelah finalisasi.',
      'Opsi Mode Fleksibel (Adaptif): Menampilkan konfirmasi pengingat apabila pengguna mencatat transaksi sebelum memasuki bulan alokasi yang direncanakan namun tetap mengizinkan penyimpanan transaksi, serta mendukung perubahan anggaran kapan saja tanpa batas jumlah revisi.',
    ],
    icon: PieChart,
  },
];

const filterTabs = [
  { id: 'all' as const, label: 'Semua Pembaruan', count: changelogItems.length },
  {
    id: 'report' as const,
    label: 'Pengaturan Laporan (PRO)',
    count: changelogItems.filter((i) => i.category === 'report').length,
  },
  {
    id: 'budget' as const,
    label: 'Anggaran Setahun (PRO)',
    count: changelogItems.filter((i) => i.category === 'budget').length,
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

// Automatically show the release notes modal once for authenticated users who haven't seen v1.0.0-rc.6 changelog yet
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
            Release Candidate 6 · {{ RELEASE_DATE }}
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
              class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-400/30 text-amber-300 text-[11px] font-bold uppercase tracking-wider"
            >
              <Crown class="w-3.5 h-3.5" />
              <span>Eksklusif SisaUang Pro</span>
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
              Pembaruan versi <strong class="text-emerald-300 font-mono">{{ RELEASE_VERSION }}</strong> menghadirkan
              dua fitur unggulan khusus pelanggan <strong class="text-amber-300">SisaUang Pro</strong>:
              <strong>Pengaturan Laporan PDF Resmi</strong> (Kop Surat Teks/Gambar, Visibilitas Kop per Laporan, Judul Kustom &amp; Tata Letak Penandatangan Formal) serta
              <strong>Opsi Anggaran Setahun Penuh</strong> dengan Mapping Bulanan, sistem Draft &amp; Finalisasi, dan pilihan Mode Ketat atau Fleksibel.
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
