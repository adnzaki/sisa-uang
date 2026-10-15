<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import {
  Wallet,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Layers,
  Users,
  FileSpreadsheet,
  PieChart,
  Lock,
  Sparkles,
  HelpCircle,
  CreditCard,
  QrCode,
  Building2,
  Check,
  Zap,
  Phone,
  Mail,
  ChevronDown,
} from 'lucide-vue-next';
import PublicNavbar from '../components/PublicNavbar.vue';
import PublicFooter from '../components/PublicFooter.vue';
import InSiteCheckoutModal from '../components/InSiteCheckoutModal.vue';
import { useAuthStore } from '../stores/auth';
import { scrollToPageTop } from '../utils/scroll';

const route = useRoute();
const authStore = useAuthStore();

onMounted(() => {
  if (!route.hash) {
    scrollToPageTop('instant');
  }
});

const checkoutModalOpen = ref(false);
const activePlanForCheckout = ref<'monthly' | 'yearly'>('yearly');

function openCheckout(plan: 'monthly' | 'yearly' = 'yearly') {
  activePlanForCheckout.value = plan;
  checkoutModalOpen.value = true;
}

const activeFaq = ref<number | null>(null);

function toggleFaq(index: number) {
  activeFaq.value = activeFaq.value === index ? null : index;
}

const faqs = [
  {
    q: 'Apakah semua transaksi dan paket harga menggunakan mata uang Rupiah?',
    a: 'Ya, seluruh transaksi di SisaUang menggunakan denominasi resmi Rupiah Indonesia (IDR). Paket SisaUang Pro ditawarkan seharga Rp 21.500 untuk paket bulanan dan Rp 215.000 untuk paket tahunan (hemat 2 bulan).',
  },
  {
    q: 'Bagaimana mekanisme pembayaran langganan dilakukan?',
    a: 'Pembayaran dilakukan langsung di dalam website SisaUang melalui payment gateway resmi Midtrans. Anda dapat memilih metode QRIS (GoPay, ShopeePay, BCA, Mandiri), Transfer Virtual Account, atau Kartu Kredit/Debit tanpa perlu berpindah ke website pihak ketiga.',
  },
  {
    q: 'Apakah ada jaminan pengembalian dana (refund policy)?',
    a: 'Ya. Kami memberikan jaminan kepuasan dan garansi pengembalian dana 100% dalam jangka waktu 7 hari kalender sejak aktivasi pertama jika sistem mengalami kendala teknis yang tidak dapat diselesaikan.',
  },
  {
    q: 'Apa keunggulan konsep Kepemilikan Dana di SisaUang dibanding aplikasi keuangan lain?',
    a: 'SisaUang memungkinkan Anda membedakan kepemilikan uang (misalnya dana pribadi, kas operasional kantor, kas tabungan bersama, atau kas sekolah) di dalam rekening yang sama tanpa harus membuka banyak rekening bank secara fisik.',
  },
  {
    q: 'Apakah laporan keuangan yang dihasilkan dapat langsung dicetak atau diserahkan ke pihak manajemen?',
    a: 'Tentu. Laporan Buku Kas Umum (BKU), Realisasi Anggaran, dan Rekonsiliasi Kas dirancang berstandar akuntansi resmi, lengkap dengan opsi untuk menambahkan Kop Surat Lembaga, stempel, dan tanda tangan penanggung jawab berformat PDF resolusi tinggi.',
  },
];
</script>

<template>
  <div class="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 selection:bg-emerald-500/20 selection:text-emerald-600">
    <!-- Top Public Navbar -->
    <PublicNavbar @open-checkout="openCheckout" />

    <!-- In-Site Checkout Modal -->
    <InSiteCheckoutModal
      :is-open="checkoutModalOpen"
      :initial-plan="activePlanForCheckout"
      @close="checkoutModalOpen = false"
    />

    <main class="flex-1">
      <!-- 1. HERO SECTION -->
      <section class="relative pt-12 pb-20 md:pt-20 md:pb-28 overflow-hidden border-b border-slate-200/60 dark:border-slate-800/60 bg-gradient-to-b from-white via-slate-50/50 to-slate-50 dark:from-slate-900 dark:via-slate-950 dark:to-slate-950">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="text-center max-w-3xl mx-auto space-y-6">
            <!-- Metadata kicker -->
            <div class="flex items-center justify-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/60">
                <ShieldCheck class="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Your Finance Assistant</span>
              </span>
            </div>

            <h1 class="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 leading-tight">
              Kendalikan Kas, Pisahkan Kepemilikan, dan Cetak Laporan Resmi.
            </h1>

            <p class="text-base sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed">
              Platform pembukuan modern untuk perorangan, pemilik usaha, bendahara sekolah, dan pengelola lembaga. Pantau saldo riil antar-sumber dana, kontrol pagu anggaran, serta generate laporan akuntansi PDF siap audit.
            </p>

            <!-- CTA Buttons -->
            <div class="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                type="button"
                class="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
                @click="openCheckout('yearly')"
              >
                <span>Berlangganan SisaUang Pro</span>
                <ArrowRight class="w-4 h-4" />
              </button>
              <RouterLink
                v-if="!authStore.isAuthenticated"
                to="/auth"
                class="w-full sm:w-auto px-6 py-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold text-sm transition-colors text-center"
              >
                Coba Akun Starter Gratis
              </RouterLink>
              <RouterLink
                v-else
                to="/"
                class="w-full sm:w-auto px-6 py-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold text-sm transition-colors text-center"
              >
                Buka Dashboard Saya
              </RouterLink>
            </div>

            <!-- Trust Bar / Pricing Note -->
            <div class="pt-4 flex items-center justify-center gap-4 sm:gap-6 text-xs text-slate-500 dark:text-slate-400">
              <div class="flex items-center gap-1.5">
                <Check class="w-3.5 h-3.5 text-emerald-600" />
                <span>Harga Resmi Mulai <strong>Rp 21.500 / bln</strong></span>
              </div>
              <span aria-hidden="true">&middot;</span>
              <div class="flex items-center gap-1.5">
                <Check class="w-3.5 h-3.5 text-emerald-600" />
                <span>Transaksi Langsung di Website</span>
              </div>
              <span aria-hidden="true">&middot;</span>
              <div class="flex items-center gap-1.5">
                <Check class="w-3.5 h-3.5 text-emerald-600" />
                <span>Garansi Uang Kembali 7 Hari</span>
              </div>
            </div>
          </div>

          <!-- Visual Platform Showcase -->
          <div class="mt-12 sm:mt-16 max-w-5xl mx-auto rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl overflow-hidden">
            <!-- Mock App Header -->
            <div class="px-4 py-3 bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700/60 flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="w-3 h-3 rounded-full bg-rose-500/80 inline-block"></span>
                <span class="w-3 h-3 rounded-full bg-amber-500/80 inline-block"></span>
                <span class="w-3 h-3 rounded-full bg-emerald-500/80 inline-block"></span>
                <span class="text-xs font-mono text-slate-500 ml-2">sisauang.bitdanbait.web.id/dashboard</span>
              </div>
              <span class="text-xs font-semibold text-emerald-600 dark:text-emerald-400">SisaUang Pro</span>
            </div>

            <!-- Mock Preview Grid -->
            <div class="p-6 grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50/50 dark:bg-slate-950/40 text-xs">
              <!-- Card 1 -->
              <div class="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2">
                <div class="text-slate-500 flex items-center justify-between">
                  <span>Total Saldo Riil</span>
                  <Wallet class="w-4 h-4 text-emerald-600" />
                </div>
                <div class="text-xl font-bold font-money text-slate-900 dark:text-slate-100">
                  Rp 14.850.000
                </div>
                <div class="text-[11px] text-slate-500 flex items-center justify-between">
                  <span>Kas Tunai + Bank + E-Wallet</span>
                  <span class="text-emerald-600 font-semibold">Tersinkron</span>
                </div>
              </div>

              <!-- Card 2 -->
              <div class="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2">
                <div class="text-slate-500 flex items-center justify-between">
                  <span>Pemisahan Kepemilikan</span>
                  <Users class="w-4 h-4 text-blue-600" />
                </div>
                <div class="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  Pribadi vs Operasional
                </div>
                <div class="text-[11px] text-slate-500">
                  Mencegah tercampurnya uang usaha & kas pribadi
                </div>
              </div>

              <!-- Card 3 -->
              <div class="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2">
                <div class="text-slate-500 flex items-center justify-between">
                  <span>Laporan Akuntansi PDF</span>
                  <FileSpreadsheet class="w-4 h-4 text-amber-600" />
                </div>
                <div class="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  BKU & Realisasi Anggaran
                </div>
                <div class="text-[11px] text-slate-500">
                  Siap cetak berkas PDF ber-Kop Surat resmi
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 2. CORE FEATURES SHOWCASE -->
      <section id="features" class="py-16 md:py-24 border-b border-slate-200/60 dark:border-slate-800/60">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="text-center max-w-2xl mx-auto space-y-3">
            <h2 class="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Solusi Lengkap Pembukuan
            </h2>
            <h3 class="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100">
              Fitur Utama Dirancang untuk Kebutuhan Riil
            </h3>
            <p class="text-sm text-slate-600 dark:text-slate-400">
              Lebih dari sekadar pencatat pengeluaran biasa — SisaUang menghadirkan tata kelola keuangan sistematis yang akurat.
            </p>
          </div>

          <div class="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <!-- Feature 1 -->
            <div class="p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
              <div class="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <Layers class="w-5 h-5" />
              </div>
              <h4 class="text-base font-bold text-slate-900 dark:text-slate-100">
                Multi Sumber Dana Terintegrasi
              </h4>
              <p class="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Kelola kas fisik tunai, multi rekening bank (BCA, Mandiri, BRI, BNI), dan e-wallet dalam satu dashboard. Setiap mutasi tercatat rapi tanpa selisih.
              </p>
            </div>

            <!-- Feature 2 -->
            <div class="p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
              <div class="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <Users class="w-5 h-5" />
              </div>
              <h4 class="text-base font-bold text-slate-900 dark:text-slate-100">
                Konsep Kepemilikan Dana Unik
              </h4>
              <p class="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Pisahkan pos dana pribadi, dana tabungan, dana operasional usaha, atau kas titipan meskipun uangnya berada di dalam satu rekening bank yang sama.
              </p>
            </div>

            <!-- Feature 3 -->
            <div class="p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
              <div class="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <PieChart class="w-5 h-5" />
              </div>
              <h4 class="text-base font-bold text-slate-900 dark:text-slate-100">
                Kontrol Pagu Anggaran Real-time
              </h4>
              <p class="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Tentukan batas belanja bulanan dan alokasi tahunan per kategori. Sistem memberi peringatan dini sebelum pos anggaran mengalami over-budget.
              </p>
            </div>

            <!-- Feature 4 -->
            <div class="p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
              <div class="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                <FileSpreadsheet class="w-5 h-5" />
              </div>
              <h4 class="text-base font-bold text-slate-900 dark:text-slate-100">
                Laporan Keuangan PDF Berstandar
              </h4>
              <p class="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Cetak Buku Kas Umum (BKU), Laporan Realisasi Anggaran Terkelompok, dan Rekonsiliasi Kas ber-Kop Surat serta Tanda Tangan Digital siap audit.
              </p>
            </div>

            <!-- Feature 5 -->
            <div class="p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
              <div class="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 flex items-center justify-center">
                <Zap class="w-5 h-5" />
              </div>
              <h4 class="text-base font-bold text-slate-900 dark:text-slate-100">
                Perhitungan Belanja Harian Aman
              </h4>
              <p class="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Algoritma cerdas yang menghitung saldo aman belanja per hari (Safe Daily Spend) agar kas Anda tetap bertahan hingga akhir siklus pembukuan.
              </p>
            </div>

            <!-- Feature 6 -->
            <div class="p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
              <div class="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                <Lock class="w-5 h-5" />
              </div>
              <h4 class="text-base font-bold text-slate-900 dark:text-slate-100">
                Keamanan & Perlindungan Data Penuh
              </h4>
              <p class="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Data disimpan terenkripsi di Google Cloud Platform. SisaUang tidak pernah menjual atau membagikan catatan keuangan Anda kepada pihak luar.
              </p>
            </div>
          </div>
        </div>
      </section>

      <!-- 3. PRICING SECTION (100% IDR COMPLIANT FOR MIDTRANS) -->
      <section id="pricing" class="py-16 md:py-24 border-b border-slate-200/60 dark:border-slate-800/60 bg-slate-100/50 dark:bg-slate-900/40">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="text-center max-w-2xl mx-auto space-y-3">
            <h2 class="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Paket Berlangganan Resmi (IDR)
            </h2>
            <h3 class="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100">
              Investasi Terjangkau untuk Tata Kelola Finansial Profesional
            </h3>
            <p class="text-sm text-slate-600 dark:text-slate-400">
              Pilih paket yang sesuai dengan kebutuhan Anda. Semua transaksi ditagihkan dalam mata uang Rupiah Indonesia (IDR) melalui Midtrans.
            </p>
          </div>

          <!-- Pricing Cards Grid -->
          <div class="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto items-stretch">
            <!-- Plan 1: Starter (Gratis) -->
            <div class="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between space-y-6">
              <div class="space-y-4">
                <div>
                  <h4 class="text-base font-bold text-slate-900 dark:text-slate-100">Starter</h4>
                  <p class="text-xs text-slate-500 mt-1">Untuk pencatatan personal sederhana</p>
                </div>
                <div class="pt-2">
                  <div class="text-3xl font-bold font-money text-slate-900 dark:text-slate-100">
                    Rp 0
                  </div>
                  <div class="text-xs text-slate-500">Gratis selamanya</div>
                </div>
                <ul class="space-y-2.5 text-xs text-slate-600 dark:text-slate-400 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <li class="flex items-center gap-2">
                    <Check class="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>5 Sumber Dana (Wallet)</span>
                  </li>
                  <li class="flex items-center gap-2">
                    <Check class="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>2 Kepemilikan Dana</span>
                  </li>
                  <li class="flex items-center gap-2">
                    <Check class="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Anggaran Bulan Berjalan</span>
                  </li>
                  <li class="flex items-center gap-2">
                    <Check class="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Analitik Keuangan</span>
                  </li>
                </ul>
              </div>

              <RouterLink
                to="/auth"
                class="w-full py-2.5 px-4 text-center rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold transition-colors"
              >
                Mulai Gratis
              </RouterLink>
            </div>

            <!-- Plan 2: Pro Bulanan (Rp 21.500 / bulan) -->
            <div class="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between space-y-6">
              <div class="space-y-4">
                <div>
                  <h4 class="text-base font-bold text-slate-900 dark:text-slate-100">SisaUang Pro Bulanan</h4>
                  <p class="text-xs text-slate-500 mt-1">Fleksibel langganan per bulan</p>
                </div>
                <div class="pt-2">
                  <div class="text-3xl font-bold font-money text-slate-900 dark:text-slate-100">
                    Rp 21.500
                  </div>
                  <div class="text-xs text-slate-500">per bulan (Termasuk PPN)</div>
                </div>
                <ul class="space-y-3 text-xs text-slate-600 dark:text-slate-400 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <li class="flex items-start gap-2">
                    <Check class="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span><strong>Anggaran Setahun Penuh &amp; Mapping Bulanan:</strong> Rencanakan anggaran satu tahun penuh sekaligus dengan pemetaan bulanan per kategori, alur Draft &amp; Finalisasi Anggaran, serta pilihan Mode Ketat atau Fleksibel.</span>
                  </li>
                  <li class="flex items-start gap-2">
                    <Check class="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span><strong>Laporan PDF Resmi &amp; Pengaturan Laporan:</strong> Unduh Laporan Kas Umum, Rekonsiliasi Kas, dan Realisasi Anggaran, serta kustomisasi Kop Institusi, Judul Laporan, dan Penandatangan PDF.</span>
                  </li>
                  <li class="flex items-start gap-2">
                    <Check class="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span><strong>Lebih dari 5 Sumber Dana (Wallet):</strong> Tambahkan rekening bank, e-wallet, kas tunai, dan investasi tanpa batas.</span>
                  </li>
                  <li class="flex items-start gap-2">
                    <Check class="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span><strong>Lebih dari 2 Kepemilikan Dana:</strong> Pisahkan alokasi kepemilikan dana keluarga atau bisnis di setiap dompet tanpa batas.</span>
                  </li>
                </ul>
              </div>

              <button
                type="button"
                class="w-full py-2.5 px-4 text-center rounded-xl bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white text-white dark:text-slate-900 text-xs font-semibold shadow-xs transition-colors"
                @click="openCheckout('monthly')"
              >
                Pilih Paket Bulanan (Rp 21.500)
              </button>
            </div>

            <!-- Plan 3: Pro Tahunan (Rp 215.000 / tahun) - BEST VALUE -->
            <div class="relative p-6 rounded-2xl border-2 border-emerald-600 dark:border-emerald-500 bg-emerald-50/30 dark:bg-emerald-950/20 flex flex-col justify-between space-y-6 shadow-md">
              <!-- Value Tag -->
              <div class="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-wider shadow-xs">
                Paling Hemat · Diskon 2 Bulan
              </div>

              <div class="space-y-4 pt-1">
                <div>
                  <h4 class="text-base font-bold text-slate-900 dark:text-slate-100">SisaUang Pro Tahunan</h4>
                  <p class="text-xs text-slate-500 mt-1">Akses penuh selama 12 bulan</p>
                </div>
                <div class="pt-2">
                  <div class="text-3xl font-bold font-money text-emerald-600 dark:text-emerald-400">
                    Rp 215.000
                  </div>
                  <div class="text-xs text-slate-600 dark:text-slate-400">
                    per tahun (~Rp 17.916 / bulan)
                  </div>
                </div>
                <div class="space-y-3.5 pt-4 border-t border-emerald-200/60 dark:border-emerald-900/60 text-xs">
                  <!-- Highlight Box: Hemat & Lebih Murah -->
                  <div class="p-3.5 rounded-xl bg-emerald-100/80 dark:bg-emerald-950/60 border border-emerald-300/60 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200 space-y-1.5">
                    <div class="flex items-center gap-1.5 font-bold text-emerald-800 dark:text-emerald-300">
                      <Sparkles class="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Jauh Lebih Murah · Hemat 2 Bulan</span>
                    </div>
                    <p class="text-xs leading-relaxed text-emerald-800 dark:text-emerald-300">
                      Mencakup seluruh fitur <strong>SisaUang Pro</strong> tanpa batasan, namun dengan harga yang jauh lebih murah (cukup bayar setara 10 bulan untuk akses 12 bulan penuh, hemat Rp 43.000).
                    </p>
                  </div>

                  <div class="p-3 rounded-xl bg-white/70 dark:bg-slate-900/60 border border-emerald-200/60 dark:border-emerald-900/40 text-slate-700 dark:text-slate-300 flex items-start gap-2.5">
                    <Check class="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span class="text-xs leading-relaxed">
                      Satu kali pembayaran aktif untuk 1 tahun penuh tanpa perlu repot perpanjangan tiap bulan.
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                class="w-full py-3 px-4 text-center rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition-colors"
                @click="openCheckout('yearly')"
              >
                Pilih Paket Tahunan (Rp 215.000)
              </button>
            </div>
          </div>

          <!-- In-Site Payment Guarantee Badge -->
          <div class="mt-10 max-w-xl mx-auto p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-2">
            <div class="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center justify-center gap-2">
              <ShieldCheck class="w-4 h-4 text-emerald-600" />
              <span>Halaman Pembayaran Terintegrasi (Tanpa Redirect Luar)</span>
            </div>
            <p class="text-[11px] text-slate-500 leading-relaxed">
              Transaksi diproses langsung di dalam portal ini bekerja sama dengan Midtrans Payment Gateway. Didukung QRIS, BCA, Mandiri, BRI, BNI, GoPay, dan Kartu Kredit.
            </p>
          </div>
        </div>
      </section>

      <!-- 4. FAQ SECTION -->
      <section class="py-16 md:py-24 border-b border-slate-200/60 dark:border-slate-800/60">
        <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="text-center max-w-xl mx-auto space-y-3 mb-10">
            <h2 class="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Pertanyaan Umum
            </h2>
            <h3 class="text-2xl font-extrabold text-slate-900 dark:text-slate-100">
              Frequently Asked Questions (FAQ)
            </h3>
          </div>

          <div class="space-y-3">
            <div
              v-for="(item, idx) in faqs"
              :key="idx"
              class="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
            >
              <button
                type="button"
                class="w-full p-4 text-left flex items-center justify-between gap-4 font-semibold text-sm text-slate-900 dark:text-slate-100 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                @click="toggleFaq(idx)"
              >
                <span>{{ item.q }}</span>
                <ChevronDown
                  class="w-4 h-4 shrink-0 transition-transform duration-200 text-slate-400"
                  :class="{ 'rotate-180': activeFaq === idx }"
                />
              </button>
              <div
                v-if="activeFaq === idx"
                class="px-4 pb-4 text-xs text-slate-600 dark:text-slate-400 leading-relaxed border-t border-slate-100 dark:border-slate-800 pt-3"
              >
                {{ item.a }}
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 5. CONTACT & READY TO START SECTION -->
      <section class="py-16 bg-slate-900 text-white text-center">
        <div class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          <h2 class="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Mulai Rapikan Keuangan & Pembukuan Anda Hari Ini
          </h2>
          <p class="text-xs sm:text-sm text-slate-300 max-w-xl mx-auto leading-relaxed">
            Bergabung bersama ratusan pengelola kas, bendahara, dan pemilik usaha yang mempercayakan pembukuan kas mereka kepada SisaUang.
          </p>
          <div class="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              type="button"
              class="w-full sm:w-auto px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs shadow-md transition-colors"
              @click="openCheckout('yearly')"
            >
              Berlangganan SisaUang Pro (Rp 215.000 / thn)
            </button>
            <RouterLink
              to="/contact"
              class="w-full sm:w-auto px-6 py-3 rounded-xl border border-slate-700 hover:bg-slate-800 text-white font-semibold text-xs transition-colors"
            >
              Hubungi Tim Dukungan Pelanggan
            </RouterLink>
          </div>
        </div>
      </section>
    </main>

    <!-- Public Footer -->
    <PublicFooter />
  </div>
</template>
