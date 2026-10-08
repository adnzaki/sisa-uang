<script setup lang="ts">
import { ref } from 'vue';
import { RefreshCw, Sparkles, HelpCircle, Trash2, X, AlertTriangle } from 'lucide-vue-next';
import { usePWA } from '../composables/usePWA';

const {
  needRefresh,
  isReloadingForUpdate,
  reloadDidNotUpdate,
  reloadAttemptCount,
  performFullAppReload,
  dismissUpdateNotice,
} = usePWA();

const showTroubleshootInfo = ref(false);
</script>

<template>
  <Transition name="toast">
    <div
      v-if="needRefresh"
      class="fixed bottom-20 md:bottom-5 left-3.5 right-3.5 md:left-auto md:right-6 md:w-full md:max-w-md z-[75]"
      role="status"
      aria-live="polite"
    >
      <div
        class="rounded-2xl border p-4 shadow-2xl backdrop-blur-md space-y-3 transition-all"
        :class="
          reloadDidNotUpdate
            ? 'border-amber-500/80 bg-slate-900/95 text-white'
            : 'border-emerald-500/80 bg-slate-900/95 text-white'
        "
      >
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-start gap-3 min-w-0">
            <div
              class="w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 mt-0.5"
              :class="
                reloadDidNotUpdate
                  ? 'bg-amber-500/20 border-amber-400/40 text-amber-300'
                  : 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300'
              "
            >
              <AlertTriangle v-if="reloadDidNotUpdate" class="w-5 h-5" />
              <Sparkles v-else class="w-5 h-5" />
            </div>

            <div class="space-y-1 min-w-0">
              <div
                class="text-[11px] font-bold uppercase tracking-wider"
                :class="reloadDidNotUpdate ? 'text-amber-300' : 'text-emerald-300'"
              >
                {{
                  reloadDidNotUpdate
                    ? 'Pembaruan Tertahan Cache'
                    : 'Pembaruan Aplikasi Tersedia'
                }}
              </div>
              <p class="text-xs sm:text-sm font-semibold text-white leading-relaxed">
                {{
                  reloadDidNotUpdate
                    ? 'Halaman sudah dimuat ulang namun versi terbaru belum aktif karena cache browser/Service Worker.'
                    : 'Versi terbaru Sisa Uang telah siap. Muat ulang halaman secara penuh untuk menerapkan pembaruan.'
                }}
              </p>
            </div>
          </div>

          <button
            type="button"
            class="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
            title="Tutup sementara"
            @click="dismissUpdateNotice()"
          >
            <X class="w-4 h-4" />
          </button>
        </div>

        <!-- Action Buttons -->
        <div class="flex flex-wrap items-center gap-2 pt-0.5">
          <button
            type="button"
            :disabled="isReloadingForUpdate"
            class="flex-1 min-h-[42px] px-4 py-2 rounded-xl text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors shadow-xs"
            :class="
              reloadDidNotUpdate
                ? 'bg-amber-600 hover:bg-amber-700'
                : 'bg-emerald-600 hover:bg-emerald-700'
            "
            @click="performFullAppReload(reloadDidNotUpdate)"
          >
            <RefreshCw
              class="w-3.5 h-3.5 shrink-0"
              :class="isReloadingForUpdate ? 'animate-spin' : ''"
            />
            <span>
              {{
                isReloadingForUpdate
                  ? 'Memuat Ulang Halaman...'
                  : reloadDidNotUpdate
                    ? 'Bersihkan Cache & Reload Paksa'
                    : 'Reload Halaman Penuh'
              }}
            </span>
          </button>

          <button
            type="button"
            class="min-h-[42px] px-3 py-2 rounded-xl border border-slate-700 hover:border-slate-600 bg-slate-800/80 hover:bg-slate-800 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shrink-0"
            @click="showTroubleshootInfo = !showTroubleshootInfo"
          >
            <HelpCircle class="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Belum Terupdate?</span>
          </button>
        </div>

        <!-- Expandable Info if already reloaded but still not updated -->
        <Transition name="fade-slide">
          <div
            v-if="showTroubleshootInfo || reloadDidNotUpdate"
            class="rounded-xl border border-slate-700/90 bg-slate-950/90 p-3 text-[11px] sm:text-xs text-slate-300 space-y-2 leading-relaxed"
          >
            <div class="font-bold text-amber-300 flex items-center gap-1.5">
              <AlertTriangle class="w-3.5 h-3.5 shrink-0" />
              <span>Sudah reload tapi aplikasi belum terupdate?</span>
            </div>
            <ul class="list-disc list-inside space-y-1 text-slate-300/95">
              <li>
                Tekan tombol <strong>Bersihkan Cache &amp; Reload Paksa</strong> di bawah untuk menghapus cache Service Worker lama secara otomatis.
              </li>
              <li>
                Jika menggunakan aplikasi PWA (Homescreen) atau memiliki beberapa tab terbuka, <strong>tutup semua tab/aplikasi Sisa Uang</strong> lalu buka kembali.
              </li>
              <li>
                Pada browser desktop, Anda juga dapat menekan <strong>Ctrl + Shift + R</strong> (Windows/Linux) atau <strong>Cmd + Shift + R</strong> (Mac).
              </li>
            </ul>

            <button
              v-if="!reloadDidNotUpdate"
              type="button"
              :disabled="isReloadingForUpdate"
              class="w-full min-h-[38px] mt-1 px-3 py-1.5 rounded-lg bg-amber-600/90 hover:bg-amber-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
              @click="performFullAppReload(true)"
            >
              <Trash2 class="w-3.5 h-3.5 shrink-0" />
              <span>
                Bersihkan Cache &amp; Reload Paksa
                {{ reloadAttemptCount > 0 ? `(Percobaan #${reloadAttemptCount + 1})` : '' }}
              </span>
            </button>
          </div>
        </Transition>
      </div>
    </div>
  </Transition>
</template>
