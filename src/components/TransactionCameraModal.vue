<script setup lang="ts">
import { ref, watch, onBeforeUnmount, nextTick } from 'vue';
import { X, Camera, RefreshCw, Check, RotateCcw, ImagePlus, AlertCircle } from 'lucide-vue-next';

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'capture', file: File): void;
}>();

const videoRef = ref<HTMLVideoElement | null>(null);
const fallbackInputRef = ref<HTMLInputElement | null>(null);
const facingMode = ref<'environment' | 'user'>('environment');
const streamError = ref<string | null>(null);
const isStartingCamera = ref(false);
const capturedBlob = ref<Blob | null>(null);
const capturedPreviewUrl = ref<string | null>(null);

let activeStream: MediaStream | null = null;

function stopStream() {
  if (activeStream) {
    for (const track of activeStream.getTracks()) {
      track.stop();
    }
    activeStream = null;
  }
  if (videoRef.value) {
    videoRef.value.srcObject = null;
  }
}

function clearCapturedPreview() {
  if (capturedPreviewUrl.value) {
    URL.revokeObjectURL(capturedPreviewUrl.value);
    capturedPreviewUrl.value = null;
  }
  capturedBlob.value = null;
}

async function startCamera() {
  stopStream();
  streamError.value = null;

  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    streamError.value = 'Browser ini tidak mendukung akses kamera langsung. Gunakan kamera atau galeri perangkat di bawah.';
    return;
  }

  isStartingCamera.value = true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: facingMode.value },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    });
    if (!props.open) {
      for (const track of stream.getTracks()) track.stop();
      return;
    }
    activeStream = stream;
    await nextTick();
    if (videoRef.value) {
      videoRef.value.srcObject = stream;
      await videoRef.value.play().catch(() => {});
    }
  } catch (err: any) {
    streamError.value =
      err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError'
        ? 'Izin kamera ditolak oleh browser. Izinkan akses kamera atau ambil foto melalui galeri/kamera perangkat.'
        : 'Kamera langsung tidak tersedia pada perangkat ini. Silakan ambil foto lewat tombol di bawah.';
  } finally {
    isStartingCamera.value = false;
  }
}

function switchCamera() {
  facingMode.value = facingMode.value === 'environment' ? 'user' : 'environment';
  clearCapturedPreview();
  void startCamera();
}

function captureFrame() {
  const video = videoRef.value;
  if (!video || !video.videoWidth || !video.videoHeight) return;

  const maxEdge = 2048;
  let w = video.videoWidth;
  let h = video.videoHeight;
  if (w > maxEdge || h > maxEdge) {
    if (w >= h) {
      h = Math.round((h * maxEdge) / w);
      w = maxEdge;
    } else {
      w = Math.round((w * maxEdge) / h);
      h = maxEdge;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  if (facingMode.value === 'user') {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0, w, h);

  canvas.toBlob(
    (blob) => {
      if (!blob) return;
      clearCapturedPreview();
      capturedBlob.value = blob;
      capturedPreviewUrl.value = URL.createObjectURL(blob);
      stopStream();
    },
    'image/jpeg',
    0.88
  );
}

function retakePhoto() {
  clearCapturedPreview();
  void startCamera();
}

function confirmCapturedPhoto() {
  if (!capturedBlob.value) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const file = new File([capturedBlob.value], `kwitansi-${stamp}.jpg`, {
    type: 'image/jpeg',
  });
  closeCamera();
  emit('capture', file);
}

function handleFallbackFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  closeCamera();
  emit('capture', file);
}

function closeCamera() {
  stopStream();
  clearCapturedPreview();
  emit('close');
}

watch(
  () => props.open,
  (val) => {
    if (val) {
      clearCapturedPreview();
      void startCamera();
    } else {
      stopStream();
      clearCapturedPreview();
    }
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  stopStream();
  clearCapturedPreview();
});
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="open"
        class="fixed inset-0 z-[85] bg-black xl:bg-black/85 xl:backdrop-blur-xs flex items-stretch xl:items-center justify-center p-0 xl:p-6"
      >
        <!-- Fullscreen on Smartphone & Tablet (< xl), centered large viewfinder on Desktop (xl+) -->
        <div class="relative w-full h-dvh xl:h-[85dvh] xl:max-w-3xl xl:rounded-3xl bg-black overflow-hidden flex flex-col">
          <!-- Top Bar -->
          <div class="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-4 py-3.5 bg-gradient-to-b from-black/75 via-black/40 to-transparent">
            <button
              type="button"
              aria-label="Tutup kamera"
              class="w-11 h-11 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center transition-colors cursor-pointer"
              @click="closeCamera"
            >
              <X class="w-5 h-5" />
            </button>

            <span class="text-xs sm:text-sm font-semibold text-white/95 tracking-wide">
              {{ capturedPreviewUrl ? 'Pratinjau Foto Bukti' : 'Foto Invoice / Kwitansi' }}
            </span>

            <button
              v-if="!capturedPreviewUrl && !streamError"
              type="button"
              aria-label="Ganti kamera"
              title="Ganti kamera depan/belakang"
              class="w-11 h-11 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center transition-colors cursor-pointer"
              @click="switchCamera"
            >
              <RefreshCw class="w-5 h-5" />
            </button>
            <div v-else class="w-11 h-11" />
          </div>

          <!-- Viewfinder / Preview Area -->
          <div class="flex-1 min-h-0 relative flex items-center justify-center bg-black">
            <img
              v-if="capturedPreviewUrl"
              :src="capturedPreviewUrl"
              alt="Hasil foto bukti pembelanjaan"
              class="w-full h-full object-contain"
            />

            <div
              v-else-if="streamError"
              class="px-6 text-center max-w-sm space-y-4 text-white"
            >
              <div class="w-14 h-14 mx-auto rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                <AlertCircle class="w-7 h-7" />
              </div>
              <p class="text-sm text-slate-200 leading-relaxed">
                {{ streamError }}
              </p>
              <button
                type="button"
                class="min-h-[46px] px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
                @click="fallbackInputRef?.click()"
              >
                <ImagePlus class="w-4 h-4" />
                <span>Ambil / Pilih Foto</span>
              </button>
            </div>

            <video
              v-else
              ref="videoRef"
              autoplay
              playsinline
              muted
              class="w-full h-full object-cover"
              :class="facingMode === 'user' ? '-scale-x-100' : ''"
            />

            <input
              ref="fallbackInputRef"
              type="file"
              accept="image/*"
              capture="environment"
              class="hidden"
              @change="handleFallbackFileChange"
            />
          </div>

          <!-- Bottom Controls Bar -->
          <div class="shrink-0 z-20 px-6 py-5 bg-gradient-to-t from-black/90 via-black/70 to-black/30 flex items-center justify-center gap-5">
            <template v-if="capturedPreviewUrl">
              <button
                type="button"
                class="min-h-[48px] px-5 py-2.5 rounded-2xl bg-white/15 hover:bg-white/25 text-white text-xs sm:text-sm font-semibold flex items-center gap-2 transition-colors cursor-pointer"
                @click="retakePhoto"
              >
                <RotateCcw class="w-4 h-4" />
                <span>Foto Ulang</span>
              </button>
              <button
                type="button"
                class="min-h-[48px] px-6 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold flex items-center gap-2 shadow-lg transition-colors cursor-pointer"
                @click="confirmCapturedPhoto"
              >
                <Check class="w-4 h-4" />
                <span>Gunakan & Upload</span>
              </button>
            </template>

            <template v-else-if="!streamError">
              <button
                type="button"
                aria-label="Ambil dari galeri atau kamera perangkat"
                title="Kamera / Galeri Perangkat"
                class="w-12 h-12 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition-colors cursor-pointer"
                @click="fallbackInputRef?.click()"
              >
                <ImagePlus class="w-5 h-5" />
              </button>

              <button
                type="button"
                :disabled="isStartingCamera"
                aria-label="Ambil Foto"
                class="w-18 h-18 rounded-full border-4 border-white bg-white/20 hover:bg-white/30 active:scale-95 flex items-center justify-center transition-all cursor-pointer disabled:opacity-50"
                @click="captureFrame"
              >
                <span class="w-14 h-14 rounded-full bg-white flex items-center justify-center text-slate-900">
                  <Camera class="w-6 h-6" />
                </span>
              </button>

              <div class="w-12 h-12" />
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
