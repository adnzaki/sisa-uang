<script setup lang="ts">
import { ref } from 'vue';
import { Camera, Upload, Paperclip, Loader2 } from 'lucide-vue-next';
import type { TransactionAttachment } from '../stores/finance';
import {
  uploadTransactionAttachments,
  deleteTransactionAttachmentFile,
} from '../services/attachments';
import TransactionAttachmentList from './TransactionAttachmentList.vue';
import TransactionCameraModal from './TransactionCameraModal.vue';

const props = withDefaults(
  defineProps<{
    modelValue: TransactionAttachment[];
    ownerUid?: string;
    disabled?: boolean;
  }>(),
  {
    ownerUid: undefined,
    disabled: false,
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: TransactionAttachment[]): void;
  (e: 'session-uploaded', key: string): void;
}>();

const MAX_ATTACHMENTS = 10;

const fileInputRef = ref<HTMLInputElement | null>(null);
const cameraOpen = ref(false);
const isUploading = ref(false);
const uploadError = ref<string | null>(null);

async function processFilesUpload(files: File[]) {
  if (!files.length || isUploading.value || props.disabled) return;
  uploadError.value = null;

  const remainingSlots = Math.max(0, MAX_ATTACHMENTS - props.modelValue.length);
  if (remainingSlots <= 0) {
    uploadError.value = `Maksimal ${MAX_ATTACHMENTS} berkas bukti pembelanjaan per transaksi.`;
    return;
  }

  const batch = files.slice(0, remainingSlots);
  if (files.length > remainingSlots) {
    uploadError.value = `Hanya ${remainingSlots} berkas tambahan yang dapat diunggah (maksimal ${MAX_ATTACHMENTS} berkas).`;
  }

  isUploading.value = true;
  try {
    const uploaded = await uploadTransactionAttachments(batch, props.ownerUid);
    for (const att of uploaded) {
      emit('session-uploaded', att.key);
    }
    emit('update:modelValue', [...props.modelValue, ...uploaded]);
  } catch (err: any) {
    uploadError.value =
      err instanceof Error ? err.message : 'Gagal mengunggah bukti pembelanjaan.';
  } finally {
    isUploading.value = false;
  }
}

function handleFileInputChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const selected = input.files ? Array.from(input.files) : [];
  input.value = '';
  if (selected.length > 0) {
    void processFilesUpload(selected);
  }
}

function handleCameraCapture(file: File) {
  void processFilesUpload([file]);
}

function handleRemove(att: TransactionAttachment) {
  emit(
    'update:modelValue',
    props.modelValue.filter((item) => item.id !== att.id)
  );
  // Also attempt best-effort cleanup if user just uploaded this file and removes it
  void deleteTransactionAttachmentFile(att.key, props.ownerUid).catch(() => {});
}
</script>

<template>
  <div class="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 p-3.5 space-y-3">
    <div class="flex items-center justify-between gap-2">
      <div class="flex items-center gap-2 min-w-0">
        <Paperclip class="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
        <span class="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
          Bukti Pembelanjaan (Invoice / Kwitansi)
        </span>
      </div>
      <span class="text-[11px] font-medium text-slate-500 dark:text-slate-400 shrink-0">
        {{ modelValue.length > 0 ? `${modelValue.length}/${MAX_ATTACHMENTS} berkas` : 'Opsional' }}
      </span>
    </div>

    <div class="grid grid-cols-2 gap-2.5">
      <button
        type="button"
        :disabled="disabled || isUploading || modelValue.length >= MAX_ATTACHMENTS"
        class="min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-emerald-500 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 cursor-pointer"
        @click="cameraOpen = true"
      >
        <Camera class="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
        <span>Kamera</span>
      </button>

      <button
        type="button"
        :disabled="disabled || isUploading || modelValue.length >= MAX_ATTACHMENTS"
        class="min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-indigo-500 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 cursor-pointer"
        @click="fileInputRef?.click()"
      >
        <Upload class="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
        <span>Pilih File / Galeri</span>
      </button>
    </div>

    <input
      ref="fileInputRef"
      type="file"
      multiple
      accept="image/*,.pdf,application/pdf"
      class="hidden"
      @change="handleFileInputChange"
    />

    <p class="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
      Mendukung banyak file PDF atau gambar (JPG, PNG, WEBP, HEIC) hingga 10 MB per berkas.
    </p>

    <div
      v-if="isUploading"
      class="rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/80 dark:bg-emerald-950/30 px-3 py-2 flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300 font-medium"
    >
      <Loader2 class="w-4 h-4 animate-spin shrink-0" />
      <span>Mengunggah bukti pembelanjaan...</span>
    </div>

    <p v-if="uploadError" class="text-xs text-rose-600 dark:text-rose-400 font-medium">
      {{ uploadError }}
    </p>

    <!-- Immediately rendered file list with icon-only Buka & Download (+ Remove) -->
    <TransactionAttachmentList
      v-if="modelValue.length > 0"
      :attachments="modelValue"
      :owner-uid="ownerUid"
      :disabled="disabled || isUploading"
      editable
      @remove="handleRemove"
    />

    <TransactionCameraModal
      :open="cameraOpen"
      @close="cameraOpen = false"
      @capture="handleCameraCapture"
    />
  </div>
</template>
