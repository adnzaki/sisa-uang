<script setup lang="ts">
import { WifiOff } from 'lucide-vue-next';
import { usePWA } from '../composables/usePWA';

const { isOnline } = usePWA();
</script>

<template>
  <Transition name="toast">
    <div
      v-if="!isOnline"
      class="fixed bottom-20 md:bottom-5 left-3.5 right-3.5 md:left-auto md:right-6 md:max-w-sm z-50 flex items-center gap-2.5 rounded-2xl bg-amber-600 text-white px-4 py-3 text-xs font-semibold shadow-xl"
    >
      <span class="h-2.5 w-2.5 rounded-full bg-white animate-pulse shrink-0" />
      <WifiOff class="w-4 h-4 shrink-0" />
      <span>Mode Offline — Menampilkan data tersimpan di perangkat.</span>
    </div>
  </Transition>
</template>
