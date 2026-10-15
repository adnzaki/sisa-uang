<script setup lang="ts">
import { onMounted } from 'vue';
import PublicNavbar from '../components/PublicNavbar.vue';
import PublicFooter from '../components/PublicFooter.vue';
import { ShieldCheck, FileText, CheckCircle2 } from 'lucide-vue-next';
import { scrollToPageTopMultiFrame } from '../utils/scroll';

onMounted(() => {
  scrollToPageTopMultiFrame();
});
</script>

<template>
  <div class="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
    <PublicNavbar />

    <main class="flex-1 py-12 md:py-16">
      <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <!-- Header -->
        <div class="mb-10 pb-6 border-b border-slate-200 dark:border-slate-800 space-y-2">
          <div class="flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            <FileText class="w-4 h-4" />
            <span>Dokumen Perjanjian Lisensi Resmi (Digital Goods)</span>
          </div>
          <h1 class="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100">
            Syarat dan Ketentuan Layanan (Terms & Conditions)
          </h1>
          <p class="text-xs text-slate-500">
            Terakhir diperbarui: 15 Oktober 2026 · Mengadopsi Standar Lisensi Perangkat Lunak Digital Goods Midtrans
          </p>
        </div>

        <!-- Document Content -->
        <div class="prose prose-sm dark:prose-invert max-w-none text-slate-700 dark:text-slate-300 space-y-8 text-xs sm:text-sm leading-relaxed">
          <!-- Section 1 -->
          <section class="space-y-3">
            <h2 class="text-base font-bold text-slate-900 dark:text-slate-100">
              1. Ketentuan Umum & Definisi (Conditions of Use)
            </h2>
            <p>
              Selamat datang di <strong>SisaUang</strong> (<a href="https://sisauang.bitdanbait.web.id" class="text-emerald-600 underline">https://sisauang.bitdanbait.web.id</a>), platform berbasis cloud untuk manajemen kas, pemisahan pos kepemilikan dana, pagu anggaran, dan pelaporan keuangan. Dengan mendaftar, mengakses, atau membeli paket berlangganan SisaUang, Anda menyatakan telah membaca, memahami, dan menyetujui seluruh isi Syarat dan Ketentuan ini.
            </p>
            <p>
              Apabila Anda tidak menyetujui salah satu butir ketentuan ini, Anda dipersilakan untuk tidak melanjutkan penggunaan layanan platform kami.
            </p>
          </section>

          <!-- Section 2 -->
          <section class="space-y-3">
            <h2 class="text-base font-bold text-slate-900 dark:text-slate-100">
              2. Pemberian Lisensi Perangkat Lunak (Grant of License)
            </h2>
            <p>
              Pengelola memberikan kepada Anda lisensi non-eksklusif, tidak dapat dipindahtangankan, dan dapat dibatalkan untuk mengakses serta menggunakan fitur platform SisaUang sesuai dengan paket lisensi yang aktif:
            </p>
            <ul class="list-disc pl-5 space-y-1.5">
              <li><strong>Paket Starter (Gratis / Rp 0)</strong>: Lisensi penggunaan dasar untuk maksimal 5 sumber dana (wallet), 2 kepemilikan dana, anggaran bulan berjalan, dan analitik keuangan.</li>
              <li><strong>Paket SisaUang Pro Bulanan (Rp 21.500 / bulan)</strong>: Akses penuh Anggaran Setahun Penuh & Mapping Bulanan, Laporan PDF Resmi & Pengaturan Laporan (Kop Institusi, Judul, Penandatangan), serta lebih dari 5 sumber dana dan lebih dari 2 kepemilikan dana tanpa batas.</li>
              <li><strong>Paket SisaUang Pro Tahunan (Rp 215.000 / tahun)</strong>: Akses penuh seluruh fitur Pro selama 12 bulan kalender dengan diskon 2 bulan (hemat Rp 43.000 dibanding bulanan).</li>
            </ul>
            <p>
              Pengguna dilarang keras merekayasa balik (*reverse engineer*), mendekompilasi, menyalin kode sumber, atau menjual kembali lisensi platform kepada pihak ketiga tanpa izin tertulis dari pengelola SisaUang.
            </p>
          </section>

          <!-- Section 3 -->
          <section class="space-y-3">
            <h2 class="text-base font-bold text-slate-900 dark:text-slate-100">
              3. Tarif Berlangganan & Mata Uang Transaksi (Fees & Currency)
            </h2>
            <p>
              Seluruh harga produk dan paket berlangganan di website SisaUang tercantum dan ditagihkan dalam mata uang resmi <strong>Rupiah Indonesia (IDR / Rp)</strong>:
            </p>
            <div class="p-4 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5">
              <div>&bull; <strong>SisaUang Pro Bulanan:</strong> Rp 21.500 / bulan</div>
              <div>&bull; <strong>SisaUang Pro Tahunan:</strong> Rp 215.000 / tahun</div>
            </div>
            <p>
              Pembayaran diproses langsung di dalam website melalui mitra payment gateway resmi berlisensi Bank Indonesia (**Midtrans**). Kami menerima kanal pembayaran QRIS, Virtual Account bank nasional (BCA, Mandiri, BRI, BNI), GoPay, dan Kartu Kredit/Debit berstandar PCI-DSS Level 1.
            </p>
          </section>

          <!-- Section 4 -->
          <section class="space-y-3">
            <h2 class="text-base font-bold text-slate-900 dark:text-slate-100">
              4. Hak Kekayaan Intelektual (Proprietary Rights)
            </h2>
            <p>
              Seluruh hak cipta, merek dagang, desain antarmuka, basis data, dan kode sumber aplikasi SisaUang adalah hak milik eksklusif pengelola dan dilindungi oleh Undang-Undang Hak Cipta Republik Indonesia. Data catatan keuangan yang dimasukkan oleh pengguna tetap merupakan hak milik pribadi pengguna seutuhnya.
            </p>
          </section>

          <!-- Section 5 -->
          <section class="space-y-3">
            <h2 class="text-base font-bold text-slate-900 dark:text-slate-100">
              5. Ketersediaan Layanan & Bantuan Teknis (Support)
            </h2>
            <p>
              Kami berkomitmen menjaga tingkat ketersediaan layanan (*uptime*) cloud server mencapai 99,5%. Bantuan teknis dan pertanyaan seputar langganan dapat diajukan melalui:
            </p>
            <ul class="list-disc pl-5 space-y-1">
              <li>Email Resmi: <a href="mailto:vuedevo@gmail.com" class="text-emerald-600 underline">vuedevo@gmail.com</a></li>
              <li>WhatsApp Layanan: <a href="https://wa.me/6285129634505" class="text-emerald-600 underline">0851-2963-4505</a></li>
              <li>Jam Layanan: Senin – Jumat pukul 08.00 – 17.00 WIB.</li>
            </ul>
          </section>

          <!-- Section 6 -->
          <section class="space-y-3">
            <h2 class="text-base font-bold text-slate-900 dark:text-slate-100">
              6. Hukum yang Mengatur (Governing Law)
            </h2>
            <p>
              Syarat dan Ketentuan ini tunduk pada dan ditafsirkan sesuai dengan hukum yang berlaku di Negara Kesatuan Republik Indonesia. Setiap perselisihan yang timbul akan diupayakan untuk diselesaikan terlebih dahulu secara musyawarah untuk mufakat.
            </p>
          </section>
        </div>
      </div>
    </main>

    <PublicFooter />
  </div>
</template>
