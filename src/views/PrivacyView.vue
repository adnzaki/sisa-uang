<script setup lang="ts">
import { onMounted } from 'vue';
import PublicNavbar from '../components/PublicNavbar.vue';
import PublicFooter from '../components/PublicFooter.vue';
import { Lock, ShieldCheck, Database } from 'lucide-vue-next';
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
            <Lock class="w-4 h-4" />
            <span>Perlindungan Data & Kerahasiaan Pengguna</span>
          </div>
          <h1 class="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100">
            Kebijakan Privasi (Privacy Policy)
          </h1>
          <p class="text-xs text-slate-500">
            Terakhir diperbarui: 15 Oktober 2026 · Standar Perlindungan Data Pribadi (UU PDP No. 27 Tahun 2022)
          </p>
        </div>

        <!-- Content -->
        <div class="prose prose-sm dark:prose-invert max-w-none text-slate-700 dark:text-slate-300 space-y-8 text-xs sm:text-sm leading-relaxed">
          <!-- Section 1 -->
          <section class="space-y-3">
            <h2 class="text-base font-bold text-slate-900 dark:text-slate-100">
              1. Komitmen Privasi SisaUang
            </h2>
            <p>
              Privasi dan kerahasiaan data keuangan Anda adalah prioritas tertinggi bagi kami. Kebijakan Privasi ini menjelaskan bagaimana <strong>SisaUang</strong> (<a href="https://sisauang.bitdanbait.web.id" class="text-emerald-600 underline">sisauang.bitdanbait.web.id</a>) mengumpulkan, menyimpan, menggunakan, dan melindungi data pribadi serta catatan transaksi pengguna kami.
            </p>
          </section>

          <!-- Section 2 -->
          <section class="space-y-3">
            <h2 class="text-base font-bold text-slate-900 dark:text-slate-100">
              2. Data yang Kami Kumpulkan
            </h2>
            <p>
              Kami hanya mengumpulkan data yang secara sadar dan sukarela Anda berikan saat menggunakan sistem:
            </p>
            <ul class="list-disc pl-5 space-y-1.5">
              <li><strong>Informasi Akun</strong>: Nama tampilan, alamat email, dan nomor WhatsApp untuk keperluan otentikasi login serta notifikasi tagihan langganan.</li>
              <li><strong>Data Pembukuan Mandiri</strong>: Nama dompet/sumber dana, pos kepemilikan dana, kategori anggaran, dan nominal transaksi yang Anda input sendiri ke dalam aplikasi.</li>
              <li><strong>Log Audit Keamanan</strong>: Catatan waktu masuk (*login timestamp*), alamat IP, dan agen peramban untuk mencegah akses tidak sah ke akun Anda.</li>
            </ul>
          </section>

          <!-- Section 3 -->
          <section class="space-y-3">
            <h2 class="text-base font-bold text-slate-900 dark:text-slate-100">
              3. Keamanan Data Transaksi Pembayaran (Payment Gateway)
            </h2>
            <p>
              Ketika Anda berlangganan paket <strong>SisaUang Pro (Bulanan: Rp 21.500 atau Tahunan: Rp 215.000)</strong>, pemrosesan transaksi pembayaran dilakukan secara terenkripsi oleh mitra resmi berlisensi Bank Indonesia, yaitu <strong>Midtrans (PT Midtrans)</strong>:
            </p>
            <div class="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 space-y-2">
              <div class="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <ShieldCheck class="w-4 h-4 text-emerald-600" />
                <span>Sertifikasi PCI-DSS Level 1</span>
              </div>
              <p class="text-xs text-slate-600 dark:text-slate-400">
                SisaUang <strong>tidak pernah menyimpan atau memiliki akses</strong> terhadap nomor lengkap kartu kredit, CVV, PIN mobile banking, atau kredensial e-wallet Anda. Seluruh data pembayaran sensitif diproses langsung melalui protokol keamanan Midtrans berstandar internasional.
              </p>
            </div>
          </section>

          <!-- Section 4 -->
          <section class="space-y-3">
            <h2 class="text-base font-bold text-slate-900 dark:text-slate-100">
              4. Infrastruktur Penyimpanan & Enkripsi
            </h2>
            <p>
              Basis data SisaUang dihosting pada pusat data Google Cloud Platform (GCP) regional Asia Tenggara (Jakarta, Indonesia). Seluruh komunikasi data antar-klien dan server dilindungi protokol enkripsi <strong>TLS/SSL 256-bit</strong> yang aman dari penyadapan.
            </p>
          </section>

          <!-- Section 5 -->
          <section class="space-y-3">
            <h2 class="text-base font-bold text-slate-900 dark:text-slate-100">
              5. Jaminan Tanpa Penjualan Data
            </h2>
            <p>
              SisaUang menjamin bahwa kami tidak akan pernah menjual, menyewakan, meminjamkan, atau memperdagangkan data pribadi dan catatan keuangan Anda kepada biro iklan, lembaga kredit, atau pihak ketiga mana pun tanpa persetujuan eksplisit dari Anda.
            </p>
          </section>

          <!-- Section 6 -->
          <section class="space-y-3">
            <h2 class="text-base font-bold text-slate-900 dark:text-slate-100">
              6. Hak Pengguna & Penghapusan Akun
            </h2>
            <p>
              Sesuai dengan ketentuan Undang-Undang Perlindungan Data Pribadi (UU PDP), Anda berhak untuk melihat, mengedit, mengekspor salinan data, atau meminta penghapusan akun beserta seluruh data riwayat transaksi secara permanen melalui menu Pengaturan atau dengan menghubungi kami di <a href="mailto:vuedevo@gmail.com" class="text-emerald-600 underline">vuedevo@gmail.com</a>.
            </p>
          </section>
        </div>
      </div>
    </main>

    <PublicFooter />
  </div>
</template>
