<script setup lang="ts">
import { RouterLink } from 'vue-router';
import {
  Wallet,
  Mail,
  Phone,
  MapPin,
  Clock,
  ShieldCheck,
  ExternalLink,
  Heart,
} from 'lucide-vue-next';
import { scrollToPageTop, scrollToPageTopMultiFrame } from '../utils/scroll';

function handleFooterLinkClick() {
  scrollToPageTopMultiFrame();
}
</script>

<template>
  <footer class="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 transition-colors">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8 lg:gap-12">
        <!-- Brand & Description -->
        <div class="lg:col-span-2 space-y-4">
          <RouterLink to="/landing" @click="handleFooterLinkClick" class="flex items-center gap-2.5">
            <div
              class="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs"
            >
              <Wallet class="w-4 h-4" />
            </div>
            <span class="text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              SisaUang
            </span>
          </RouterLink>
          <p class="text-xs text-slate-600 dark:text-slate-400 leading-relaxed max-w-sm">
            Platform manajemen kas, arus dana, dan perencanaan anggaran modern untuk individu, wirausaha, serta lembaga. Dilengkapi laporan pembukuan berstandar akuntansi siap cetak PDF.
          </p>

          <!-- Endorsement & Sub-domain Info Card (Bit & Bait and Actudent) -->
          <div
            class="p-3.5 rounded-xl border border-emerald-200/80 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/30 text-xs text-slate-700 dark:text-slate-300 space-y-1.5"
          >
            <div class="font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
              <ShieldCheck class="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Publikasi & Dukungan Resmi</span>
            </div>
            <p class="text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
              Aplikasi ini didukung oleh
              <a
                href="https://bitdanbait.web.id"
                target="_blank"
                rel="noopener noreferrer"
                class="font-semibold text-emerald-700 dark:text-emerald-400 underline hover:text-emerald-800 transition-colors inline-flex items-center gap-0.5"
              >
                <span>Bit & Bait</span>
                <ExternalLink class="w-3 h-3" />
              </a>
              karena SisaUang dipublikasikan di sub-domain Bit & Bait (
              <a
                href="https://sisauang.bitdanbait.web.id"
                target="_blank"
                rel="noopener noreferrer"
                class="font-semibold text-emerald-700 dark:text-emerald-400 underline hover:text-emerald-800 transition-colors"
              >
                sisauang.bitdanbait.web.id
              </a>
              ) dan bermitra bersama
              <a
                href="https://actudent.com"
                target="_blank"
                rel="noopener noreferrer"
                class="font-semibold text-emerald-700 dark:text-emerald-400 underline hover:text-emerald-800 transition-colors inline-flex items-center gap-0.5"
              >
                <span>Actudent</span>
                <ExternalLink class="w-3 h-3" />
              </a>.
            </p>
          </div>
        </div>

        <!-- Features / Product -->
        <div class="space-y-3">
          <h4 class="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
            Fitur Utama
          </h4>
          <ul class="space-y-2 text-xs text-slate-600 dark:text-slate-400">
            <li>
              <RouterLink to="/landing#features" @click="handleFooterLinkClick" class="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
                Multi Sumber Dana & Bank
              </RouterLink>
            </li>
            <li>
              <RouterLink to="/landing#features" @click="handleFooterLinkClick" class="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
                Manajemen Kepemilikan Dana
              </RouterLink>
            </li>
            <li>
              <RouterLink to="/landing#features" @click="handleFooterLinkClick" class="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
                Pagu Anggaran Bulanan & Tahunan
              </RouterLink>
            </li>
            <li>
              <RouterLink to="/landing#features" @click="handleFooterLinkClick" class="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
                Laporan Kas Berstandar (PDF)
              </RouterLink>
            </li>
          </ul>
        </div>

        <!-- Legal & Compliance (Required by Midtrans) -->
        <div class="space-y-3">
          <h4 class="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
            Legal & Kepatuhan
          </h4>
          <ul class="space-y-2 text-xs text-slate-600 dark:text-slate-400">
            <li>
              <RouterLink to="/terms" @click="handleFooterLinkClick" class="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
                Syarat & Ketentuan Lisensi
              </RouterLink>
            </li>
            <li>
              <RouterLink to="/refund-policy" @click="handleFooterLinkClick" class="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
                Kebijakan Pengembalian Dana (Refund)
              </RouterLink>
            </li>
            <li>
              <RouterLink to="/privacy" @click="handleFooterLinkClick" class="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
                Kebijakan Privasi Data
              </RouterLink>
            </li>
            <li>
              <RouterLink to="/contact" @click="handleFooterLinkClick" class="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
                Kanal Bantuan & Layanan
              </RouterLink>
            </li>
          </ul>
        </div>

        <!-- Contact & Business Info -->
        <div class="space-y-3">
          <h4 class="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
            Kontak Bisnis
          </h4>
          <ul class="space-y-2.5 text-xs text-slate-600 dark:text-slate-400">
            <li class="flex items-start gap-2">
              <Mail class="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
              <a href="mailto:vuedevo@gmail.com" class="hover:text-emerald-600 transition-colors">
                vuedevo@gmail.com
              </a>
            </li>
            <li class="flex items-start gap-2">
              <Phone class="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
              <a
                href="https://wa.me/6285129634505"
                target="_blank"
                rel="noopener noreferrer"
                class="hover:text-emerald-600 transition-colors"
              >
                0851-2963-4505 (WhatsApp)
              </a>
            </li>
            <li class="flex items-start gap-2">
              <Clock class="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
              <span>Senin – Jumat (08.00 – 17.00 WIB)</span>
            </li>
          </ul>
        </div>
      </div>

      <!-- Bottom Bar -->
      <div
        class="mt-12 pt-6 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400"
      >
        <p>&copy; 2026 SisaUang. Hak cipta dilindungi undang-undang.</p>
        <div class="flex items-center gap-4 text-[11px]">
          <span>Mata Uang Transaksi: Rupiah (IDR)</span>
          <span aria-hidden="true">&middot;</span>
          <span>Diproses via Midtrans Payment Gateway</span>
        </div>
      </div>
    </div>
  </footer>
</template>
