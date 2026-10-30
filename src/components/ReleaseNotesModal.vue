<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import {
  Sparkles,
  Rocket,
  Layers,
  Check,
  Zap,
  CreditCard,
  Crown,
  Database,
  RotateCcw,
  SunMoon,
  TrendingUp,
} from 'lucide-vue-next';
import { useNotificationStore } from '../stores/notification';
import { useAuthStore } from '../stores/auth';
import AppModal from './AppModal.vue';

const CHANGELOG_SEEN_KEY = 'sisa_uang_changelog_seen_v1_0_0';
const RELEASE_VERSION = '1.0.0';
const RELEASE_DATE = 'Oktober 2026';

const notificationStore = useNotificationStore();
const authStore = useAuthStore();

type ChangelogCategory = 'all' | 'database' | 'payment' | 'ui' | 'system';
const activeFilter = ref<ChangelogCategory>('all');

export interface ChangelogItem {
  id: string;
  category: 'database' | 'payment' | 'ui' | 'system';
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
    id: 'database-operations-optimization',
    category: 'database',
    badge: 'OPTIMASI DATABASE',
    badgeColor: 'emerald',
    title: 'Mengoptimalkan Proses Operasi Database Firestore',
    summary:
      'Penataan ulang menyeluruh pada arsitektur pembacaan data Cloud Firestore untuk meningkatkan performa aplikasi:',
    details: [
      'Pemberhentian Background Polling Otomatis: Mematikan proses background looping dan kueri otomatis berkala saat aplikasi dalam posisi idle.',
      'Penerapan Batas Limit Kueri Ketat: Mencegah penarikan dokumen tak terbatas (unbounded queries) pada seluruh koleksi utama dengan menerapkan pembatasan dokumen proporsional.',
      'Zero-Read Idle State: Menjamin tidak ada penarikan data diam-diam dari database Firestore ketika perangkat pengguna sedang aktif namun tidak sedang digunakan.',
    ],
    icon: Database,
  },
  {
    id: 'sync-and-data-loading-system',
    category: 'database',
    badge: 'SINKRONISASI DATA',
    badgeColor: 'sky',
    title: 'Mengoptimalkan Sistem Sinkronisasi dan Pemuatan Data',
    summary:
      'Mekanisme sinkronisasi data cerdas berbasis pencocokan read token dan timestamp antara server Firestore dan perangkat lokal:',
    details: [
      'Validasi Timestamp Efisien (1 Read Token): Pengecekan status perubahan server hanya membaca dokumen yang diperlukan untuk memastikan efisiensi maksimal.',
      'Penarikan Data Terarah (Event-Driven): Penarikan data baru dari server hanya dipicu pada event penting: berpindah antar halaman/menu, mutasi data (tambah/ubah/hapus), reload manual, atau saat membuka detail data.',
      'Zero-Read Cache Restoration: Jika timestamp perangkat lokal cocok dengan server, seluruh koleksi disajikan instan langsung dari cache lokal tanpa harus menarik kembali data dari Firestore.',
    ],
    icon: RotateCcw,
  },
  {
    id: 'payment-gateway-modernization',
    category: 'payment',
    badge: 'PAYMENT GATEWAY',
    badgeColor: 'indigo',
    title: 'Memperbarui Sistem Payment Gateway Duitku V2',
    summary:
      'Pembaruan alur pembayaran in-site checkout langganan SisaUang Pro dengan kanal Virtual Account otomatis 24 jam yang lebih andal, aman, dan terverifikasi instan:',
    details: [
      'Dukungan 10 Bank Virtual Account Resmi: Mandiri, Permata, BRI (BRIVA), BNI, BSI, BNC (Neo), CIMB Niaga, Danamon, Maybank, dan Bank Sahabat Sampoerna.',
      'Penonaktifan Sementara QRIS & E-Wallet: Kanal QRIS dan dompet digital (OVO, DANA, ShopeePay) dinonaktifkan sementara dengan keterangan status transparan hingga gateway aktif.',
      'Penghapusan Kanal yang Tidak Didukung: Menghilangkan opsi BCA VA yang belum didukung serta mematikan simulasi pembayaran manual demi kepatuhan gateway resmi.',
    ],
    icon: CreditCard,
  },
  {
    id: 'theme-toggle-and-dark-mode-fix',
    category: 'ui',
    badge: 'TAMPILAN & TEMA',
    badgeColor: 'amber',
    title: 'Memperbaiki Tombol Dark/Light Mode di Halaman Publik',
    summary:
      'Perbaikan menyeluruh pada fungsi penggantian tema gelap/terang serta kenyamanan kontras visual di seluruh landing page dan komponen checkout:',
    details: [
      'Reaktivitas Tombol Tema Publik: Memperbaiki aksi tombol toggle tema di navbar publik sehingga transisi dark/light mode berjalan mulus dan reaktif seketika.',
      'Penyelarasan Warna Komponen Checkout: Memperbaiki styling kartu pilihan pembayaran agar memiliki kontras warna yang nyaman, tajam, dan tidak tampak putih pada mode gelap.',
      'Konsistensi Preferensi Tema: Menjaga persistensi tema yang dipilih pengguna di seluruh sesi penjelajahan publik maupun dashboard utama.',
    ],
    icon: SunMoon,
  },
  {
    id: 'budget-absorption-calculation-fix',
    category: 'ui',
    badge: 'KALKULASI ANGGARAN',
    badgeColor: 'emerald',
    title: 'Memperbaiki Perhitungan Serapan Anggaran pada Halaman Ringkasan',
    summary:
      'Kalkulasi realisasi belanja dan persentase serapan anggaran pada dashboard kini langsung terhitung akurat dan presisi tanpa perlu mengunjungi menu Anggaran terlebih dahulu:',
    details: [
      'Sinkronisasi Otomatis Periode Ringkasan: Sistem secara otomatis memuat data transaksi periode terpilih saat halaman Ringkasan pertama kali dibuka.',
      'Perhitungan Realisasi Pengeluaran Akurat: Nilai total serapan anggaran dan status sisa batas belanja per kategori disinkronkan langsung dari transaksi riil.',
      'Pencocokan Kategori yang Lebih Tangguh: Mendukung pencocokan kategori berbasis ID unik dan nama secara fleksibel untuk menjaga keakuratan histori anggaran.',
    ],
    icon: TrendingUp,
  },
  {
    id: 'server-side-pagination-system',
    category: 'system',
    badge: 'PAGINASI TRANSAKSI',
    badgeColor: 'sky',
    title: 'Memperbaiki Sistem Pagination Berbasis Server-Side',
    summary:
      'Mekanisme paginasi server-side yang tangguh pada riwayat transaksi tanpa membatasi jumlah data transaksi bulanan pengguna:',
    details: [
      'Paginasi 25 Data per Halaman: Mengambil 25 transaksi terakhir terlebih dahulu ke state lokal tanpa menarik seluruh riwayat transaksi sekaligus.',
      'Navigasi Halaman Dinamis: Berpindah halaman memicu pengambilan data secara presisi (misal halaman 2 mengambil data ke 26-50) menggunakan cursor Firestore.',
      'Dukungan Penuh Filter Periode Bulanan: Pagination tetap muncul dan bekerja sempurna saat filter periode bulanan (misal Juli) diaktifkan, berapapun jumlah transaksinya.',
    ],
    icon: Layers,
  },
  {
    id: 'automation-cache-system-fix',
    category: 'system',
    badge: 'PENJADWALAN & CACHE',
    badgeColor: 'indigo',
    title: 'Memperbaiki Sistem Cache pada Fitur Penjadwalan Transaksi',
    summary:
      'Optimalisasi pengelolaan cache memori dan persistensi lokal pada modul otomatisasi transaksi berulang:',
    details: [
      'Pencegahan Pembacaan Berulang: Memperbaiki sistem cache agar tidak melakukan refetch jadwal transaksi yang tidak mengalami perubahan.',
      'Eksekusi Tepat Waktu: Memastikan transaksi rutin berulang (bulanan) tereksekusi sesuai tanggal dan jam yang ditetapkan tanpa menduplikasi data.',
      'Penyelarasan Status Jadwal: Sinkronisasi instan status jadwal (aktif, tunda, lewati) ke cache lokal dan server secara aman dan konsisten.',
    ],
    icon: Zap,
  },
];

const filterTabs = computed(() => [
  { id: 'all' as const, label: 'Semua Pembaruan', count: changelogItems.length },
  {
    id: 'database' as const,
    label: 'Database & Sinkronisasi',
    count: changelogItems.filter((i) => i.category === 'database').length,
  },
  {
    id: 'payment' as const,
    label: 'Payment Gateway',
    count: changelogItems.filter((i) => i.category === 'payment').length,
  },
  {
    id: 'ui' as const,
    label: 'Tampilan & Kalkulasi',
    count: changelogItems.filter((i) => i.category === 'ui').length,
  },
  {
    id: 'system' as const,
    label: 'Sistem & Paginasi',
    count: changelogItems.filter((i) => i.category === 'system').length,
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

// Automatically show the release notes modal once for authenticated users who haven't seen v1.0.0 changelog yet
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
            Versi Final 1.0.0 · {{ RELEASE_DATE }}
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
              <span>Rilis Final · v{{ RELEASE_VERSION }}</span>
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
              Catatan Pembaruan Sisa Uang v{{ RELEASE_VERSION }} (Final)
            </h3>
            <p class="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Pembaruan versi final <strong class="text-emerald-300 font-mono">v{{ RELEASE_VERSION }}</strong> menghadirkan stabilitas tingkat produksi dengan optimasi efisiensi operasi database, pembaruan sistem payment gateway resmi, paginasi transaksi server-side yang tangguh, perbaikan kalkulasi serapan anggaran, serta penyempurnaan UI dan cache penjadwalan transaksi.
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
