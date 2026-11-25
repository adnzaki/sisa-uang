<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue';
import {
  FileText,
  Image as ImageIcon,
  Eye,
  Download,
  Trash2,
  Loader2,
} from 'lucide-vue-next';
import type { TransactionAttachment } from '../stores/finance';
import { useNotificationStore } from '../stores/notification';
import {
  formatAttachmentSize,
  isPdfAttachment,
  fetchTransactionAttachmentBlob,
  downloadTransactionAttachment,
} from '../services/attachments';
import AppModal from './AppModal.vue';

const props = withDefaults(
  defineProps<{
    attachments: TransactionAttachment[];
    editable?: boolean;
    ownerUid?: string;
    disabled?: boolean;
  }>(),
  {
    editable: false,
    ownerUid: undefined,
    disabled: false,
  }
);

const emit = defineEmits<{
  (e: 'remove', attachment: TransactionAttachment): void;
}>();

const notificationStore = useNotificationStore();

const previewOpen = ref(false);
const previewTarget = ref<TransactionAttachment | null>(null);
const previewObjectUrl = ref<string | null>(null);
const openingId = ref<string | null>(null);
const downloadingId = ref<string | null>(null);

function cleanupPreviewUrl() {
  if (previewObjectUrl.value) {
    URL.revokeObjectURL(previewObjectUrl.value);
    previewObjectUrl.value = null;
  }
}

onBeforeUnmount(() => {
  cleanupPreviewUrl();
});

async function handleOpen(att: TransactionAttachment) {
  if (openingId.value) return;
  openingId.value = att.id;
  try {
    const blob = await fetchTransactionAttachmentBlob(att, 'inline', props.ownerUid);
    cleanupPreviewUrl();
    previewObjectUrl.value = URL.createObjectURL(blob);
    previewTarget.value = att;
    previewOpen.value = true;
  } catch (err: any) {
    notificationStore.notifyError(
      'Gagal Membuka Berkas',
      err instanceof Error ? err.message : 'Tidak dapat memuat pratinjau berkas.'
    );
  } finally {
    openingId.value = null;
  }
}

async function handleDownload(att: TransactionAttachment) {
  if (downloadingId.value) return;
  downloadingId.value = att.id;
  try {
    await downloadTransactionAttachment(att, props.ownerUid);
  } catch (err: any) {
    notificationStore.notifyError(
      'Gagal Mengunduh Berkas',
      err instanceof Error ? err.message : 'Tidak dapat mengunduh berkas.'
    );
  } finally {
    downloadingId.value = null;
  }
}

function handlePreviewClose() {
  previewOpen.value = false;
  previewTarget.value = null;
  cleanupPreviewUrl();
}
</script>

<template>
  <div v-if="attachments.length > 0" class="space-y-2">
    <div
      v-for="att in attachments"
      :key="att.id"
      class="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2.5 flex items-center justify-between gap-2.5"
    >
      <div class="flex items-center gap-2.5 min-w-0 flex-1">
        <div
          class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border"
          :class="
            isPdfAttachment(att)
              ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200/70 dark:border-rose-900/50 text-rose-600 dark:text-rose-400'
              : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200/70 dark:border-emerald-900/50 text-emerald-600 dark:text-emerald-400'
          "
        >
          <FileText v-if="isPdfAttachment(att)" class="w-4 h-4" />
          <ImageIcon v-else class="w-4 h-4" />
        </div>

        <div class="min-w-0 flex-1">
          <div class="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
            {{ att.name }}
          </div>
          <div class="text-[11px] text-slate-500 dark:text-slate-400 font-money">
            {{ formatAttachmentSize(att.size) }} · {{ isPdfAttachment(att) ? 'PDF' : 'Gambar' }}
          </div>
        </div>
      </div>

      <!-- Icon-only Buka & Download (+ optional Remove when editable) -->
      <div class="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          :disabled="disabled || openingId === att.id"
          aria-label="Buka berkas"
          title="Buka"
          class="w-9 h-9 min-w-[36px] min-h-[36px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400 text-slate-600 dark:text-slate-300 flex items-center justify-center transition-colors disabled:opacity-50 cursor-pointer"
          @click.stop="handleOpen(att)"
        >
          <Loader2 v-if="openingId === att.id" class="w-4 h-4 animate-spin" />
          <Eye v-else class="w-4 h-4" />
        </button>

        <button
          type="button"
          :disabled="disabled || downloadingId === att.id"
          aria-label="Download berkas"
          title="Download"
          class="w-9 h-9 min-w-[36px] min-h-[36px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 hover:border-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 text-slate-600 dark:text-slate-300 flex items-center justify-center transition-colors disabled:opacity-50 cursor-pointer"
          @click.stop="handleDownload(att)"
        >
          <Loader2 v-if="downloadingId === att.id" class="w-4 h-4 animate-spin" />
          <Download v-else class="w-4 h-4" />
        </button>

        <button
          v-if="editable"
          type="button"
          :disabled="disabled"
          aria-label="Hapus lampiran"
          title="Hapus lampiran"
          class="w-9 h-9 min-w-[36px] min-h-[36px] rounded-xl border border-rose-200/80 dark:border-rose-900/50 bg-rose-50/70 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-rose-600 dark:text-rose-400 flex items-center justify-center transition-colors disabled:opacity-50 cursor-pointer"
          @click.stop="emit('remove', att)"
        >
          <Trash2 class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- In-App File Preview Modal (Avoids window.open inside iFrame) -->
    <AppModal
      :open="previewOpen"
      :title="previewTarget?.name || 'Pratinjau Bukti Pembelanjaan'"
      max-width="2xl"
      z-index-class="z-[85]"
      @close="handlePreviewClose"
    >
      <div v-if="previewTarget && previewObjectUrl" class="space-y-3">
        <div
          v-if="!isPdfAttachment(previewTarget)"
          class="w-full rounded-2xl bg-slate-950/95 p-2 flex items-center justify-center overflow-hidden"
        >
          <img
            :src="previewObjectUrl"
            :alt="previewTarget.name"
            class="max-h-[70dvh] w-auto max-w-full object-contain rounded-xl"
          />
        </div>

        <div v-else class="w-full">
          <iframe
            :src="previewObjectUrl"
            :title="previewTarget.name"
            class="w-full h-[68dvh] rounded-xl border border-slate-200 dark:border-slate-800 bg-white"
          />
        </div>
      </div>

      <template #footer>
        <div class="flex items-center justify-between gap-2.5 w-full">
          <div class="text-xs text-slate-500 dark:text-slate-400 truncate">
            <span v-if="previewTarget">{{ formatAttachmentSize(previewTarget.size) }}</span>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <button
              v-if="previewTarget"
              type="button"
              :disabled="downloadingId === previewTarget.id"
              class="min-h-[42px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              @click="handleDownload(previewTarget)"
            >
              <Loader2 v-if="downloadingId === previewTarget.id" class="w-4 h-4 animate-spin" />
              <Download v-else class="w-4 h-4" />
              <span>Download</span>
            </button>
            <button
              type="button"
              class="min-h-[42px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold cursor-pointer"
              @click="handlePreviewClose"
            >
              Tutup
            </button>
          </div>
        </div>
      </template>
    </AppModal>
  </div>
</template>
