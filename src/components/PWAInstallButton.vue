<script setup lang="ts">
import { ref } from 'vue';
import { Download, Smartphone, Monitor, Share, PlusSquare, CheckCircle2, ExternalLink } from 'lucide-vue-next';
import { usePWA } from '../composables/usePWA';
import AppModal from './AppModal.vue';

withDefaults(
  defineProps<{
    variant?: 'sidebar' | 'topbar' | 'card';
  }>(),
  {
    variant: 'sidebar',
  }
);

const { isInstallable, isInstalled, isIOS, isInIframe, install } = usePWA();
const showInstallGuideModal = ref(false);
const currentUrl = typeof window !== 'undefined' ? window.location.origin : '';

async function handleInstallClick() {
  if (isInstallable.value) {
    const res = await install();
    if (res !== 'unavailable') return;
  }
  showInstallGuideModal.value = true;
}
</script>

<template>
  <!-- Automatically suppress install button when already running in standalone mode -->
  <div v-if="!isInstalled">
    <!-- VARIANT 1: Compact Topbar / Header Button -->
    <button
      v-if="variant === 'topbar'"
      type="button"
      class="min-h-[38px] px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/70 border border-emerald-200/80 dark:border-emerald-800/70 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center gap-1.5 transition-colors shrink-0"
      title="Install Aplikasi Sisa Uang ke Homescreen / Start Menu"
      @click="handleInstallClick"
    >
      <Download class="w-3.5 h-3.5 shrink-0" />
      <span>Install App</span>
    </button>

    <!-- VARIANT 2: Sidebar / Mobile Drawer Full-Width Button -->
    <button
      v-else-if="variant === 'sidebar'"
      type="button"
      class="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-emerald-500/30 dark:border-emerald-500/30 bg-emerald-50/70 dark:bg-emerald-950/40 hover:bg-emerald-100/80 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center justify-between gap-2 transition-colors"
      @click="handleInstallClick"
    >
      <div class="flex items-center gap-2.5 min-w-0">
        <div class="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
          <Download class="w-3.5 h-3.5" />
        </div>
        <div class="text-left min-w-0">
          <div class="truncate">Install Sisa Uang</div>
          <div class="text-[10px] font-medium text-slate-500 dark:text-slate-400 truncate">
            Homescreen / Start Menu
          </div>
        </div>
      </div>
      <span class="px-2 py-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-bold shrink-0">
        PWA
      </span>
    </button>

    <!-- VARIANT 3: Settings Page Detailed Card -->
    <div
      v-else-if="variant === 'card'"
      class="rounded-2xl border border-emerald-200/80 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/25 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
    >
      <div class="flex items-start gap-3.5 min-w-0">
        <div class="w-11 h-11 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
          <Smartphone class="w-5 h-5" />
        </div>
        <div class="space-y-1 min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <h3 class="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
              Install Aplikasi Sisa Uang (PWA)
            </h3>
            <span class="px-2 py-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-bold">
              Siap Diinstall
            </span>
          </div>
          <p class="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Pasang Sisa Uang langsung ke <strong>Homescreen</strong> ponsel (Android/iOS) atau <strong>Start Menu / Desktop</strong> komputer Anda untuk akses cepat layar penuh tanpa bilah alamat browser.
          </p>
        </div>
      </div>

      <button
        type="button"
        class="w-full sm:w-auto min-h-[46px] px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-colors shrink-0 shadow-xs"
        @click="handleInstallClick"
      >
        <Download class="w-4 h-4 shrink-0" />
        <span>Install ke Perangkat</span>
      </button>
    </div>

    <!-- Modal Panduan Installasi (iOS Safari, Android Chrome, & Desktop Start Menu) -->
    <AppModal
      v-model="showInstallGuideModal"
      title="Install Aplikasi Sisa Uang"
    >
      <div class="space-y-4">
        <!-- Direct Native Prompt Button if available -->
        <div
          v-if="isInstallable"
          class="rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/40 p-4 space-y-3"
        >
          <div class="text-xs sm:text-sm font-bold text-emerald-800 dark:text-emerald-200">
            Browser Anda mendukung instalasi langsung satu klik:
          </div>
          <button
            type="button"
            class="w-full min-h-[48px] px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors"
            @click="install(); showInstallGuideModal = false"
          >
            <Download class="w-4 h-4 shrink-0" />
            <span>Pasang Sisa Uang Sekarang</span>
          </button>
        </div>

        <!-- Note when viewing inside preview iframe -->
        <div
          v-if="isInIframe"
          class="rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 p-3.5 space-y-2 text-xs text-amber-800 dark:text-amber-300"
        >
          <div class="font-bold flex items-center gap-1.5">
            <ExternalLink class="w-4 h-4 shrink-0" />
            <span>Buka di Tab Browser Penuh untuk Menginstall</span>
          </div>
          <p class="leading-relaxed">
            Saat ini aplikasi terbuka di dalam mode pratinjau (iframe). Buka URL aplikasi secara langsung di tab baru Chrome, Edge, atau Safari agar tombol <strong>Install Aplikasi</strong> muncul.
          </p>
          <a
            :href="currentUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1.5 min-h-[38px] px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-colors"
          >
            <ExternalLink class="w-3.5 h-3.5" />
            <span>Buka di Tab Baru</span>
          </a>
        </div>

        <!-- 1. Panduan Android Chrome / Edge Mobile -->
        <div
          v-if="!isIOS"
          class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-4 space-y-2.5"
        >
          <div class="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
            <Smartphone class="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>Cara Install di Android (Homescreen)</span>
          </div>
          <ol class="text-xs sm:text-sm text-slate-600 dark:text-slate-300 space-y-1.5 list-decimal list-inside leading-relaxed">
            <li>Ketuk ikon menu titik tiga <strong>(⋮)</strong> di pojok kanan atas browser Chrome.</li>
            <li>Pilih menu <strong>Tambahkan ke layar utama</strong> atau <strong>Install aplikasi</strong>.</li>
            <li>Ketuk <strong>Install</strong> — ikon <strong>Sisa Uang</strong> akan langsung muncul di layar utama ponsel Anda.</li>
          </ol>
        </div>

        <!-- 2. Panduan iPhone / iPad (iOS Safari) -->
        <div
          class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-4 space-y-2.5"
        >
          <div class="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
            <Share class="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>Cara Install di iPhone / iPad (Safari)</span>
          </div>
          <ol class="text-xs sm:text-sm text-slate-600 dark:text-slate-300 space-y-1.5 list-decimal list-inside leading-relaxed">
            <li>Ketuk tombol <strong>Bagikan (Share)</strong> di bilah bawah Safari.</li>
            <li>
              Geser ke bawah lalu pilih
              <strong class="inline-flex items-center gap-1">
                <PlusSquare class="w-3.5 h-3.5 inline text-emerald-600" />
                Tambah ke Layar Utama (Add to Home Screen)
              </strong>.
            </li>
            <li>Ketuk <strong>Tambah (Add)</strong> di pojok kanan atas.</li>
          </ol>
        </div>

        <!-- 3. Panduan Desktop Windows / macOS / Linux (Start Menu & Taskbar) -->
        <div
          class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-4 space-y-2.5"
        >
          <div class="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
            <Monitor class="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>Cara Install ke Start Menu / Desktop PC</span>
          </div>
          <ol class="text-xs sm:text-sm text-slate-600 dark:text-slate-300 space-y-1.5 list-decimal list-inside leading-relaxed">
            <li>Klik ikon <strong>Install Sisa Uang</strong> di sisi kanan bilah alamat (Address Bar) Chrome atau Microsoft Edge.</li>
            <li>Klik <strong>Install</strong> untuk menambahkan aplikasi ke <strong>Start Menu</strong>, Desktop, atau Taskbar.</li>
          </ol>
        </div>
      </div>

      <template #footer>
        <button
          type="button"
          class="w-full min-h-[48px] px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors"
          @click="showInstallGuideModal = false"
        >
          <CheckCircle2 class="w-4 h-4 shrink-0" />
          <span>Mengerti</span>
        </button>
      </template>
    </AppModal>
  </div>
</template>
