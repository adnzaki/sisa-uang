<script setup lang="ts">
import { onMounted } from 'vue';
import PublicNavbar from '../components/PublicNavbar.vue';
import PublicFooter from '../components/PublicFooter.vue';
import { ShieldAlert, ArrowLeftRight, CheckCircle2, Clock } from 'lucide-vue-next';
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
            <ArrowLeftRight class="w-4 h-4" />
            <span>Kebijakan Transaksi Konsumen SisaUang</span>
          </div>
          <h1 class="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100">
            Kebijakan Pengembalian Dana (Refund & Cancellation Policy)
          </h1>
          <p class="text-xs text-slate-500">
            Berlaku untuk seluruh pembelian lisensi perangkat lunak SisaUang Pro · Terakhir diperbarui: 15 Oktober 2026
          </p>
        </div>

        <!-- Content -->
        <div class="prose prose-sm dark:prose-invert max-w-none text-slate-700 dark:text-slate-300 space-y-8 text-xs sm:text-sm leading-relaxed">
          <!-- Guarantee Banner -->
          <div class="p-4 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/30 flex items-start gap-3">
            <CheckCircle2 class="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div class="space-y-1">
              <div class="font-bold text-slate-900 dark:text-slate-100 text-sm">
                Garansi Kepuasan Pelanggan 7 Hari Kalender (100% Refund)
              </div>
              <p class="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Kami memberikan garansi pengembalian dana 100% tanpa potongan biaya administrasi jika Anda mengalami kendala teknis atau platform SisaUang Pro tidak berfungsi sesuai spesifikasi dalam jangka waktu 7 hari sejak pembelian pertama.
              </p>
            </div>
          </div>

          <!-- Section 1 -->
          <section class="space-y-3">
            <h2 class="text-base font-bold text-slate-900 dark:text-slate-100">
              1. Kondisi dan Syarat Klaim Pengembalian Dana
            </h2>
            <p>
              Pengembalian dana (*refund*) dapat diajukan oleh pemegang akun lisensi SisaUang Pro apabila memenuhi salah satu dari kondisi berikut:
            </p>
            <ul class="list-disc pl-5 space-y-1.5">
              <li>
                <strong>Kegagalan Sistemik Terverifikasi</strong>: Terjadi galat (*error*) kritis berulang pada basis data atau fitur ekspor laporan yang diverifikasi oleh tim pengembang dan tidak dapat diperbaiki dalam kurun waktu 3x24 jam kerja.
              </li>
              <li>
                <strong>Transaksi Ganda (*Double Charge*)</strong>: Terjadi pemotongan saldo atau penerbitan tagihan ganda untuk satu periode langganan yang sama akibat kendala jaringan pada payment gateway Midtrans.
              </li>
              <li>
                <strong>Aktivasi Gagal</strong>: Pembayaran telah berstatus Lunas (*Settlement / Success*) di Midtrans, namun status akun tidak ter-upgrade dan kendala tidak dapat diselesaikan oleh tim teknis.
              </li>
            </ul>
          </section>

          <!-- Section 2 -->
          <section class="space-y-3">
            <h2 class="text-base font-bold text-slate-900 dark:text-slate-100">
              2. Batasan yang Tidak Memenuhi Kriteria Refund
            </h2>
            <p>
              Pengembalian dana tidak dapat diberikan dalam situasi berikut:
            </p>
            <ul class="list-disc pl-5 space-y-1">
              <li>Permohonan diajukan melebihi batas waktu 7 (tujuh) hari kalender setelah transaksi dinyatakan berhasil.</li>
              <li>Kelalaian pengguna dalam menjaga kerahasiaan kata sandi atau akun diblokir karena melanggar ketentuan hukum.</li>
              <li>Kesalahan input data keuangan mandiri yang dilakukan oleh pengguna sendiri.</li>
            </ul>
          </section>

          <!-- Section 3 -->
          <section class="space-y-3">
            <h2 class="text-base font-bold text-slate-900 dark:text-slate-100">
              3. Alur & Tata Cara Pengajuan Refund
            </h2>
            <p>
              Untuk memproses pengembalian dana, pemegang lisensi dapat mengikuti langkah-langkah resmi berikut:
            </p>
            <ol class="list-decimal pl-5 space-y-2">
              <li>
                Kirimkan email ke alamat resmi: <a href="mailto:vuedevo@gmail.com" class="text-emerald-600 underline font-semibold">vuedevo@gmail.com</a> atau WhatsApp layanan ke <a href="https://wa.me/6285129634505" class="text-emerald-600 underline font-semibold">0851-2963-4505</a>.
              </li>
              <li>
                Gunakan subjek: <strong>[PERMOHONAN REFUND] - Nomor Invoice / Email Akun</strong>.
              </li>
              <li>
                Sertakan dokumen pendukung:
                <ul class="list-disc pl-5 mt-1 space-y-1">
                  <li>Nomor Order ID / Invoice Midtrans (contoh: <code>INV-SU-XXXXXX</code>)</li>
                  <li>Email terdaftar pada akun SisaUang</li>
                  <li>Bukti tangkapan layar transaksi atau kendala teknis yang dialami</li>
                  <li>Nomor rekening bank atau nomor e-wallet tujuan pengembalian dana (harus atas nama yang sama dengan pemesan)</li>
                </ul>
              </li>
              <li>
                Tim verifikasi kami akan meninjau kelayakan dalam jangka waktu maksimal <strong>2x24 jam kerja</strong>.
              </li>
              <li>
                Setelah disetujui, dana akan dikembalikan ke rekening/e-wallet asal dalam waktu 3–5 hari kerja perbankan.
              </li>
            </ol>
          </section>

          <!-- Section 4 -->
          <section class="space-y-3">
            <h2 class="text-base font-bold text-slate-900 dark:text-slate-100">
              4. Pembatalan Perpanjangan Berlangganan
            </h2>
            <p>
              Pengguna paket SisaUang Pro Bulanan (Rp 21.500) maupun Tahunan (Rp 215.000) bebas membatalkan perpanjangan langganan kapan saja melalui menu Pengaturan Akun tanpa dikenakan denda atau biaya penalti apa pun. Akses fitur Pro akan tetap aktif hingga akhir masa sewa yang telah dibayar.
            </p>
          </section>
        </div>
      </div>
    </main>

    <PublicFooter />
  </div>
</template>
