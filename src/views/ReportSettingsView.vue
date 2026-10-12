<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { RouterLink } from 'vue-router';
import {
  Building2,
  FileText,
  PenTool,
  Plus,
  ArrowUp,
  ArrowDown,
  Trash2,
  MapPin,
  FileCheck2,
  RotateCcw,
  Sparkles,
  Check,
  Scale,
  PieChart,
  Image as ImageIcon,
  Upload,
  Info,
  Type,
  Crown,
  RefreshCw,
  CheckCircle2,
} from 'lucide-vue-next';
import {
  useThemeStore,
  MAX_REPORT_SIGNERS,
  DEFAULT_REPORT_TITLES,
  type ReportCustomTitlesConfig,
  type ReportSignerRowPosition,
  type ReportSignerItem,
} from '../stores/theme';
import { useAuthStore } from '../stores/auth';
import { useNotificationStore } from '../stores/notification';

const themeStore = useThemeStore();
const authStore = useAuthStore();
const notificationStore = useNotificationStore();

const newSignerName = ref('');
const newSignerRole = ref('');
const newSignerRowPosition = ref<ReportSignerRowPosition>('top');
const kopImageInputRef = ref<HTMLInputElement | null>(null);
const isProcessingImage = ref(false);

function triggerKopImageSelect() {
  kopImageInputRef.value?.click();
}

function handleKopImageUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    notificationStore.notifyError(
      'Format File Tidak Didukung',
      'Silakan pilih file gambar berformat PNG, JPG, JPEG, atau WebP.'
    );
    input.value = '';
    return;
  }

  if (file.size > 8 * 1024 * 1024) {
    notificationStore.notifyError(
      'Ukuran File Terlalu Besar',
      'Maksimal ukuran file gambar kop adalah 8 MB.'
    );
    input.value = '';
    return;
  }

  isProcessingImage.value = true;
  const reader = new FileReader();
  reader.onload = () => {
    const rawDataUrl = String(reader.result || '');
    const img = new Image();
    img.onload = () => {
      try {
        // Preserve original dimensions & aspect ratio as uploaded; only scale down proportionally if exceeding 2400px
        const maxDimension = 2400;
        const naturalW = img.naturalWidth || img.width || 1200;
        const naturalH = img.naturalHeight || img.height || 300;
        const scale = Math.min(1, maxDimension / naturalW, maxDimension / naturalH);
        const targetW = Math.max(1, Math.round(naturalW * scale));
        const targetH = Math.max(1, Math.round(naturalH * scale));

        let outputDataUrl = rawDataUrl;
        if (scale < 1 || file.size > 1.5 * 1024 * 1024) {
          const canvas = document.createElement('canvas');
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            const isPng = file.type === 'image/png';
            if (!isPng) {
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, 0, targetW, targetH);
            }
            ctx.drawImage(img, 0, 0, targetW, targetH);
            outputDataUrl = isPng
              ? canvas.toDataURL('image/png')
              : canvas.toDataURL('image/jpeg', 0.92);
          }
        }

        themeStore.updateReportLetterhead({
          enabled: true,
          mode: 'image',
          imageDataUrl: outputDataUrl,
          imageWidthPx: targetW,
          imageHeightPx: targetH,
        });
        notificationStore.notifySuccess(
          'Gambar Kop Berhasil Diunggah',
          `Resolusi asli dipertahankan (${targetW} × ${targetH} piksel) tanpa di-stretch.`
        );
      } catch {
        notificationStore.notifyError(
          'Gagal Memproses Gambar',
          'Terjadi kendala saat mengoptimalkan gambar kop.'
        );
      } finally {
        isProcessingImage.value = false;
        input.value = '';
      }
    };
    img.onerror = () => {
      isProcessingImage.value = false;
      input.value = '';
      notificationStore.notifyError(
        'Gambar Tidak Valid',
        'File gambar tidak dapat dibaca. Silakan coba gambar lain.'
      );
    };
    img.src = rawDataUrl;
  };
  reader.onerror = () => {
    isProcessingImage.value = false;
    input.value = '';
  };
  reader.readAsDataURL(file);
}

function handleRemoveKopImage() {
  themeStore.updateReportLetterhead({
    imageDataUrl: '',
    imageWidthPx: 0,
    imageHeightPx: 0,
  });
  notificationStore.notifySuccess(
    'Gambar Kop Dihapus',
    'Gambar kop surat telah dihapus dari pengaturan laporan.'
  );
}

onMounted(() => {
  themeStore.loadReportSignatureConfig(authStore.user?.uid);
});

watch(
  () => authStore.user?.uid,
  (uid) => {
    themeStore.loadReportSignatureConfig(uid);
  }
);

const reportTypeDefinitions: {
  id: keyof ReportCustomTitlesConfig;
  label: string;
  shortLabel: string;
  defaultTitle: string;
  placeholder: string;
  icon: any;
}[] = [
  {
    id: 'kas_umum',
    label: 'Laporan Kas Umum (Buku Kas Umum)',
    shortLabel: 'Kas Umum',
    defaultTitle: DEFAULT_REPORT_TITLES.kas_umum,
    placeholder: 'Contoh: Laporan Kas Umum DKM Masjid Al-Ikhlas',
    icon: FileText,
  },
  {
    id: 'rekonsiliasi_kas',
    label: 'Laporan Rekonsiliasi Kas & Kepemilikan',
    shortLabel: 'Rekonsiliasi Kas',
    defaultTitle: DEFAULT_REPORT_TITLES.rekonsiliasi_kas,
    placeholder: 'Contoh: Laporan Rekonsiliasi Kas Musholla Ar-Rahman',
    icon: Scale,
  },
  {
    id: 'realisasi_anggaran',
    label: 'Laporan Realisasi / Serapan Anggaran',
    shortLabel: 'Realisasi Anggaran',
    defaultTitle: DEFAULT_REPORT_TITLES.realisasi_anggaran,
    placeholder: 'Contoh: Laporan Realisasi Anggaran Kegiatan Ramadhan',
    icon: PieChart,
  },
];

function applyInstitutionPreset(presetType: 'masjid' | 'musholla' | 'organisasi') {
  if (presetType === 'masjid') {
    themeStore.updateReportLetterhead({
      enabled: true,
      mode: 'text',
      organizationName: 'DEWAN KEMAKMURAN MASJID (DKM) AL-IKHLAS',
      subtitle: 'Pengurus Takmir & Pengelolaan Kas Kemakmuran Masjid',
      addressLine: 'Jl. Contoh Raya No. 10, RT 01 / RW 02 · Sekretariat DKM',
    });
    themeStore.updateReportCustomTitle('kas_umum', 'LAPORAN KAS UMUM MASJID');
    themeStore.updateReportCustomTitle('rekonsiliasi_kas', 'LAPORAN REKONSILIASI KAS MASJID');
    themeStore.updateReportCustomTitle(
      'realisasi_anggaran',
      'LAPORAN REALISASI ANGGARAN KEGIATAN MASJID'
    );
  } else if (presetType === 'musholla') {
    themeStore.updateReportLetterhead({
      enabled: true,
      mode: 'text',
      organizationName: 'PENGURUS MUSHOLLA AR-RAHMAN',
      subtitle: 'Panitia Pengelolaan Dana Kas & Operasional Musholla',
      addressLine: ' Lingkungan RT 04 / RW 02 · Sekretariat Pengurus Musholla',
    });
    themeStore.updateReportCustomTitle('kas_umum', 'LAPORAN KAS UMUM MUSHOLLA');
    themeStore.updateReportCustomTitle('rekonsiliasi_kas', 'LAPORAN REKONSILIASI KAS MUSHOLLA');
    themeStore.updateReportCustomTitle(
      'realisasi_anggaran',
      'LAPORAN REALISASI ANGGARAN MUSHOLLA'
    );
  } else {
    themeStore.updateReportLetterhead({
      enabled: true,
      mode: 'text',
      organizationName: 'PENGURUS KAS & BENDAHARA ORGANISASI',
      subtitle: 'Divisi Keuangan dan Administrasi Pelaporan',
      addressLine: 'Sekretariat Resmi · Laporan Keuangan Berkala',
    });
  }

  notificationStore.notifySuccess(
    'Template Kop & Judul Diterapkan',
    'Silakan sesuaikan nama masjid, musholla, atau institusi sesuai kebutuhan Anda.'
  );
}

function handleResetTitles() {
  themeStore.resetReportCustomTitles();
  notificationStore.notifySuccess(
    'Judul Laporan Direset',
    'Seluruh judul laporan dikembalikan ke judul standar bawaan aplikasi.'
  );
}

function handleAddReportSigner() {
  if (themeStore.reportSigners.length >= MAX_REPORT_SIGNERS) {
    notificationStore.notifyError(
      'Batas Maksimal Penandatangan',
      `Anda hanya dapat menambahkan maksimal ${MAX_REPORT_SIGNERS} penandatangan laporan.`
    );
    return;
  }

  const cleanName = newSignerName.value.trim();
  const cleanRole = newSignerRole.value.trim();
  if (!cleanName && !cleanRole) {
    notificationStore.notifyError(
      'Data Penandatangan Kosong',
      'Silakan isi minimal Nama Lengkap atau Jabatan Penandatangan terlebih dahulu.'
    );
    return;
  }

  const added = themeStore.addReportSigner(
    cleanName,
    cleanRole,
    newSignerRowPosition.value
  );
  if (added) {
    newSignerName.value = '';
    newSignerRole.value = '';
    // If 2 signers are already in top row, default next slot to bottom row for convenience
    const topCount = themeStore.reportSigners.filter((s) => s.rowPosition !== 'bottom').length;
    newSignerRowPosition.value = topCount >= 2 ? 'bottom' : 'top';
    notificationStore.notifySuccess(
      'Penandatangan Ditambahkan',
      `"${added.name || added.role}" telah ditambahkan pada ${added.rowPosition === 'bottom' ? 'Baris Bawah' : 'Baris Atas'}.`
    );
  }
}

function getSignerPositionDescription(signer: ReportSignerItem): string {
  const isBottom = signer.rowPosition === 'bottom';
  const rowLabel = isBottom ? 'Baris Bawah' : 'Baris Atas';
  const sameRowSigners = themeStore.reportSigners.filter(
    (s) => (s.rowPosition === 'bottom') === isBottom
  );
  const posIdx = sameRowSigners.findIndex((s) => s.id === signer.id);
  if (sameRowSigners.length <= 1) {
    if (themeStore.reportSigners.length === 1 || !isBottom) {
      return `${rowLabel} · Posisi Kanan (Tunggal)`;
    }
    return `${rowLabel} · Posisi Tengah`;
  }
  if (posIdx === 0) return `${rowLabel} · Kolom Kiri`;
  if (posIdx === sameRowSigners.length - 1) return `${rowLabel} · Kolom Kanan`;
  return `${rowLabel} · Kolom Tengah`;
}

function handleRemoveReportSigner(id: string, displayLabel: string) {
  themeStore.removeReportSigner(id);
  notificationStore.notifySuccess(
    'Penandatangan Dihapus',
    `Penandatangan "${displayLabel}" telah dihapus dari daftar.`
  );
}

function isSignerEnabledForReport(reportType: string, signerId: string): boolean {
  return (themeStore.reportActiveSignerIds[reportType] || []).includes(signerId);
}

const isManualSyncing = ref(false);

async function handleManualSync() {
  if (isManualSyncing.value) return;
  isManualSyncing.value = true;
  try {
    const ok = await themeStore.syncReportSettingsNow(true);
    if (ok) {
      notificationStore.notifySuccess(
        'Sinkronisasi Cloud Berhasil',
        'Pengaturan kop laporan dan penandatangan berhasil dimuat dari Cloud. Data tersinkron otomatis antara Laptop & HP.'
      );
    } else {
      notificationStore.notifyInfo(
        'Sinkronisasi Selesai',
        'Pengaturan laporan sudah menggunakan data terbaru.'
      );
    }
  } catch {
    notificationStore.notifyError(
      'Gagal Menyinkronkan',
      'Terjadi kendala saat menghubungi Cloud Firestore. Pengaturan lokal tetap aktif.'
    );
  } finally {
    isManualSyncing.value = false;
  }
}
</script>

<template>
  <div class="w-full max-w-full overflow-x-hidden space-y-6">
    <!-- Page Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <h1 class="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Pengaturan · Laporan PDF
          </h1>
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold uppercase tracking-wider">
            <span>SisaUang Pro</span>
          </span>
        </div>
        <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
          Kustomisasi kop institusi/organisasi (seperti Masjid, Musholla, Komunitas, atau Lembaga), judul masing-masing laporan, serta daftar penandatangan laporan PDF. Tersinkron otomatis di semua perangkat (Laptop &amp; HP).
        </p>
      </div>

      <div class="flex flex-wrap sm:flex-nowrap items-center gap-2.5 w-full sm:w-auto shrink-0">
        <button
          type="button"
          :disabled="isManualSyncing || themeStore.isReportSettingsSyncing"
          class="w-full sm:w-auto min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-emerald-500 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-60 cursor-pointer shadow-xs"
          @click="handleManualSync"
        >
          <RefreshCw
            class="w-4 h-4 text-emerald-600 shrink-0"
            :class="{ 'animate-spin': isManualSyncing || themeStore.isReportSettingsSyncing }"
          />
          <span>{{ isManualSyncing || themeStore.isReportSettingsSyncing ? 'Menyinkronkan...' : 'Sinkronkan Cloud' }}</span>
        </button>

        <RouterLink
          to="/analytics"
          class="w-full sm:w-auto min-h-[42px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-colors shrink-0 shadow-xs"
        >
          <FileCheck2 class="w-4 h-4 shrink-0" />
          <span>Buka Analitik &amp; Cetak PDF</span>
        </RouterLink>
      </div>
    </div>

    <!-- Real-time Cloud Sync Status Banner -->
    <div
      class="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2.5 text-xs text-slate-600 dark:text-slate-400"
    >
      <div class="flex items-center gap-2 min-w-0">
        <div
          class="w-2 h-2 rounded-full shrink-0"
          :class="
            themeStore.isReportSettingsSyncing
              ? 'bg-amber-500 animate-pulse'
              : themeStore.reportSettingsSyncStatus === 'error'
                ? 'bg-rose-500'
                : 'bg-emerald-500'
          "
        />
        <div class="truncate">
          <span class="font-medium text-slate-900 dark:text-slate-200">
            {{
              themeStore.isReportSettingsSyncing
                ? 'Sedang menyinkronkan pengaturan ke Cloud...'
                : 'Status Sinkronisasi Cloud:'
            }}
          </span>
          <span class="ml-1 text-slate-500 dark:text-slate-400">
            {{
              themeStore.isReportSettingsSyncing
                ? 'Mohon tunggu sesaat'
                : 'Tersimpan & siap dibuka di Laptop maupun HP'
            }}
          </span>
        </div>
      </div>

      <div class="flex items-center gap-2 shrink-0 text-[11px] text-slate-500 dark:text-slate-400">
        <CheckCircle2 class="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
        <span>Cloud Firestore Aktif</span>
      </div>
    </div>

    <!-- Pro Banner if Free User -->
    <div
      v-if="!authStore.isProUser"
      class="rounded-2xl border border-amber-200/90 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 p-4 sm:p-4.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-900 dark:text-amber-200"
    >
      <div class="flex items-start gap-3">
        <div class="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
          <Crown class="w-5 h-5" />
        </div>
        <div class="space-y-0.5 text-xs sm:text-sm">
          <div class="font-bold">
            Fitur Eksklusif SisaUang Pro
          </div>
          <div class="text-xs text-amber-800/80 dark:text-amber-300/80">
            Kustomisasi kop laporan, judul dokumen, dan penandatangan akan otomatis tercetak pada PDF laporan saat berlangganan paket SisaUang Pro.
          </div>
        </div>
      </div>
      <button
        type="button"
        class="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shrink-0 transition-colors cursor-pointer"
        @click="notificationStore.openProModal()"
      >
        Lihat Paket Pro
      </button>
    </div>

    <!-- =================================================================== -->
    <!-- SECTION 1: KOP LAPORAN / IDENTITAS INSTITUSI (MASJID / MUSHOLLA)    -->
    <!-- =================================================================== -->
    <section class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-5 w-full min-w-0">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3.5 gap-3">
        <div class="space-y-1 min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <Building2 class="w-4 h-4 text-emerald-600 shrink-0" />
            <h2 class="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
              1. Kop Laporan &amp; Identitas Institusi / Organisasi
            </h2>
            <span
              class="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider"
              :class="
                themeStore.reportLetterhead.enabled
                  ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
              "
            >
              {{ themeStore.reportLetterhead.enabled ? 'Kop Aktif' : 'Kop Nonaktif' }}
            </span>
          </div>
          <p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Aktifkan kop laporan apabila Anda mencetak laporan keuangan untuk <strong>Masjid</strong>, <strong>Musholla</strong>, <strong>RT/RW</strong>, <strong>Yayasan</strong>, maupun organisasi lainnya.
          </p>
        </div>

        <!-- Toggle Enable Letterhead -->
        <button
          type="button"
          class="min-h-[40px] px-4 py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-colors shrink-0 cursor-pointer"
          :class="
            themeStore.reportLetterhead.enabled
              ? 'border-emerald-600 bg-emerald-600 text-white'
              : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:border-emerald-500'
          "
          @click="
            themeStore.updateReportLetterhead({
              enabled: !themeStore.reportLetterhead.enabled,
            })
          "
        >
          <Check v-if="themeStore.reportLetterhead.enabled" class="w-4 h-4 shrink-0" />
          <span>
            {{
              themeStore.reportLetterhead.enabled
                ? 'Kop Laporan Diaktifkan'
                : 'Aktifkan Kop Laporan'
            }}
          </span>
        </button>
      </div>

      <!-- Mode Kop Selector: Teks vs Gambar Kop Banner -->
      <div class="space-y-2">
        <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300">
          Pilih Jenis / Mode Kop Laporan
        </label>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <button
            type="button"
            class="min-h-[48px] p-3 rounded-xl border text-left flex items-center justify-between gap-3 transition-all cursor-pointer"
            :class="
              themeStore.reportLetterhead.mode !== 'image'
                ? 'border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/35 ring-1 ring-emerald-500/20'
                : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50 hover:border-slate-300'
            "
            @click="themeStore.updateReportLetterhead({ mode: 'text', enabled: true })"
          >
            <div class="flex items-center gap-2.5 min-w-0">
              <div
                class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                :class="
                  themeStore.reportLetterhead.mode !== 'image'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                "
              >
                <Type class="w-4 h-4" />
              </div>
              <div class="min-w-0">
                <div class="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                  Kop Teks Instansi / Masjid
                </div>
                <div class="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  Ketik langsung nama masjid, musholla, &amp; alamat
                </div>
              </div>
            </div>
            <span
              v-if="themeStore.reportLetterhead.mode !== 'image'"
              class="px-2 py-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-bold uppercase shrink-0"
            >
              Dipilih
            </span>
          </button>

          <button
            type="button"
            class="min-h-[48px] p-3 rounded-xl border text-left flex items-center justify-between gap-3 transition-all cursor-pointer"
            :class="
              themeStore.reportLetterhead.mode === 'image'
                ? 'border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/35 ring-1 ring-emerald-500/20'
                : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50 hover:border-slate-300'
            "
            @click="themeStore.updateReportLetterhead({ mode: 'image', enabled: true })"
          >
            <div class="flex items-center gap-2.5 min-w-0">
              <div
                class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                :class="
                  themeStore.reportLetterhead.mode === 'image'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                "
              >
                <ImageIcon class="w-4 h-4" />
              </div>
              <div class="min-w-0">
                <div class="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                  Upload Gambar Kop Surat (Banner)
                </div>
                <div class="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  Unggah desain gambar kop lengkap berlogo (PNG/JPG)
                </div>
              </div>
            </div>
            <span
              v-if="themeStore.reportLetterhead.mode === 'image'"
              class="px-2 py-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-bold uppercase shrink-0"
            >
              Dipilih
            </span>
          </button>
        </div>
      </div>

      <!-- ================================================================= -->
      <!-- MODE A: KOP TEKS INSTANSI / MASJID / MUSHOLLA                     -->
      <!-- ================================================================= -->
      <div v-if="themeStore.reportLetterhead.mode !== 'image'" class="space-y-4">
        <!-- Quick Template Presets (Masjid, Musholla, Organisasi) -->
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1">
            <Sparkles class="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>Isi Cepat Contoh Kop:</span>
          </span>
          <button
            type="button"
            class="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:border-emerald-500 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
            @click="applyInstitutionPreset('masjid')"
          >
            Template DKM Masjid
          </button>
          <button
            type="button"
            class="px-3 py-1.5 rounded-xl border border-slate-200 dark:bg-slate-950 dark:border-slate-800 bg-slate-50 hover:border-emerald-500 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
            @click="applyInstitutionPreset('musholla')"
          >
            Template Pengurus Musholla
          </button>
          <button
            type="button"
            class="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:border-emerald-500 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
            @click="applyInstitutionPreset('organisasi')"
          >
            Template Organisasi / Lembaga
          </button>
        </div>

        <div class="grid grid-cols-1 gap-3.5">
          <div class="space-y-1.5">
            <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Nama Institusi / Masjid / Musholla / Organisasi (Baris Utama Kop)
            </label>
            <input
              :value="themeStore.reportLetterhead.organizationName"
              type="text"
              maxlength="100"
              placeholder="Contoh: DEWAN KEMAKMURAN MASJID (DKM) AL-IKHLAS / PENGURUS MUSHOLLA AR-RAHMAN"
              class="w-full min-h-[46px] px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950 text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
              @input="
                themeStore.updateReportLetterhead({
                  organizationName: ($event.target as HTMLInputElement).value,
                })
              "
            />
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div class="space-y-1.5">
              <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Sub-Judul / Unit / Kepanitiaan (Baris Kedua Kop - Opsional)
              </label>
              <input
                :value="themeStore.reportLetterhead.subtitle"
                type="text"
                maxlength="120"
                placeholder="Contoh: Panitia Pembangunan & Pengelolaan Kas Umat"
                class="w-full min-h-[46px] px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
                @input="
                  themeStore.updateReportLetterhead({
                    subtitle: ($event.target as HTMLInputElement).value,
                  })
                "
              />
            </div>

            <div class="space-y-1.5">
              <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Alamat / Sekretariat / Kontak (Baris Ketiga Kop - Opsional)
              </label>
              <input
                :value="themeStore.reportLetterhead.addressLine"
                type="text"
                maxlength="160"
                placeholder="Contoh: Jl. Melati No. 12, RT 04 / RW 02 · Telp: 0812-xxxx-xxxx"
                class="w-full min-h-[46px] px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
                @input="
                  themeStore.updateReportLetterhead({
                    addressLine: ($event.target as HTMLInputElement).value,
                  })
                "
              />
            </div>
          </div>
        </div>
      </div>

      <!-- ================================================================= -->
      <!-- MODE B: UPLOAD GAMBAR KOP SURAT (BANNER PENUH) + REKOMENDASI PX   -->
      <!-- ================================================================= -->
      <div v-else class="space-y-4">
        <input
          ref="kopImageInputRef"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          class="hidden"
          @change="handleKopImageUpload"
        />

        <!-- Pixel Dimension Recommendation Guide Box -->
        <div class="rounded-2xl border border-emerald-200/80 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20 p-3.5 sm:p-4 space-y-2">
          <div class="flex items-center gap-2 text-xs font-bold text-emerald-900 dark:text-emerald-200">
            <Info class="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Rekomendasi Ukuran Piksel (Pixel) Gambar Kop Surat PDF:</span>
          </div>
          <ul class="text-xs text-slate-600 dark:text-slate-300 space-y-1 list-disc list-inside leading-relaxed">
            <li>
              <strong>Ukuran Ideal (Tajam Setara Cetak 300 DPI)</strong>:
              <span class="font-bold text-emerald-700 dark:text-emerald-300">2400 × 400 piksel</span>
              (atau <span class="font-semibold">2480 × 350 piksel</span>, rasio lebar:tinggi sekitar <strong>6 : 1</strong> hingga <strong>7 : 1</strong>).
            </li>
            <li>
              <strong>Ukuran Standar (Ringan &amp; Tetap Jernih)</strong>:
              <span class="font-bold text-emerald-700 dark:text-emerald-300">1800 × 300 piksel</span>
              (atau minimal <span class="font-semibold">1200 × 200 piksel</span>).
            </li>
            <li>
              <strong>Format &amp; Desain</strong>: Gunakan format <strong>PNG</strong> (latar belakang putih atau transparan) atau <strong>JPG/JPEG</strong>. <em>Catatan: Ukuran di atas hanya bersifat rekomendasi — gambar kop yang Anda unggah akan ditampilkan apa adanya sesuai proporsi asli tanpa di-stretch.</em>
            </li>
          </ul>
        </div>

        <!-- Upload Dropzone / Action Card -->
        <div class="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-950/50 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div class="space-y-1 min-w-0">
            <div class="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100">
              {{
                themeStore.reportLetterhead.imageDataUrl
                  ? 'Gambar Kop Surat Telah Terpasang'
                  : 'Belum Ada Gambar Kop Surat yang Diunggah'
              }}
            </div>
            <p class="text-xs text-slate-500 dark:text-slate-400">
              <template v-if="themeStore.reportLetterhead.imageDataUrl">
                Resolusi gambar saat ini:
                <strong class="text-emerald-700 dark:text-emerald-400">
                  {{ themeStore.reportLetterhead.imageWidthPx || 'Auto' }} × {{ themeStore.reportLetterhead.imageHeightPx || 'Auto' }} px
                </strong>
                · Ditampilkan apa adanya sesuai gambar asli.
              </template>
              <template v-else>
                Pilih gambar banner kop surat dari perangkat Anda (PNG/JPG, maks. 8 MB).
              </template>
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              :disabled="isProcessingImage"
              class="min-h-[42px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
              @click="triggerKopImageSelect"
            >
              <Upload class="w-4 h-4 shrink-0" />
              <span>
                {{
                  isProcessingImage
                    ? 'Memproses...'
                    : themeStore.reportLetterhead.imageDataUrl
                      ? 'Ganti Gambar Kop'
                      : 'Pilih Gambar Kop'
                }}
              </span>
            </button>

            <button
              v-if="themeStore.reportLetterhead.imageDataUrl"
              type="button"
              class="min-h-[42px] px-3.5 py-2 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:bg-rose-100/80 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              @click="handleRemoveKopImage"
            >
              <Trash2 class="w-4 h-4 shrink-0" />
              <span>Hapus Gambar</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Per-Report Letterhead Assignment Toggles -->
      <div class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 p-3.5 sm:p-4 space-y-2.5">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <span class="text-xs font-semibold text-slate-700 dark:text-slate-200">
            Tampilkan Kop pada Jenis Laporan Berikut:
          </span>
          <span class="text-[11px] text-slate-500 dark:text-slate-400">
            Pilih laporan mana saja yang menggunakan kop surat (fleksibel per laporan)
          </span>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <button
            v-for="rep in reportTypeDefinitions"
            :key="`lh_rep_${rep.id}`"
            type="button"
            class="min-h-[42px] px-3.5 py-2 rounded-xl border text-left text-xs font-semibold flex items-center justify-between gap-2 transition-colors cursor-pointer"
            :class="
              themeStore.isLetterheadActiveForReport(rep.id)
                ? 'border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200'
                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400'
            "
            @click="themeStore.toggleLetterheadForReport(rep.id)"
          >
            <div class="flex items-center gap-2 min-w-0">
              <component :is="rep.icon" class="w-4 h-4 shrink-0 text-emerald-600" />
              <span class="truncate">{{ rep.shortLabel }}</span>
            </div>
            <span
              class="px-2 py-0.5 rounded text-[10px] font-bold uppercase shrink-0"
              :class="
                themeStore.isLetterheadActiveForReport(rep.id)
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
              "
            >
              {{ themeStore.isLetterheadActiveForReport(rep.id) ? 'Pakai Kop' : 'Tanpa Kop' }}
            </span>
          </button>
        </div>
      </div>

      <!-- Live Visual Preview of the Kop Laporan (Both Image Mode and Text Mode) -->
      <div
        v-if="
          themeStore.reportLetterhead.enabled &&
          ((themeStore.reportLetterhead.mode === 'image' &&
            themeStore.reportLetterhead.imageDataUrl) ||
            (themeStore.reportLetterhead.mode !== 'image' &&
              (themeStore.reportLetterhead.organizationName.trim() ||
                themeStore.reportLetterhead.subtitle.trim() ||
                themeStore.reportLetterhead.addressLine.trim())))
        "
        class="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-4 sm:p-5 space-y-2.5 shadow-2xs"
      >
        <div class="flex items-center justify-between gap-2">
          <div class="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            Pratinjau Tampilan Kop di Bagian Atas Dokumen PDF:
          </div>
          <span class="text-[10px] font-semibold text-slate-400">
            {{
              themeStore.reportLetterhead.mode === 'image'
                ? 'Mode: Gambar Kop Banner'
                : 'Mode: Teks Kop Standar'
            }}
          </span>
        </div>

        <!-- Image Kop Preview (no extra bottom border line; border only applies to text mode) -->
        <div
          v-if="
            themeStore.reportLetterhead.mode === 'image' &&
            themeStore.reportLetterhead.imageDataUrl
          "
        >
          <img
            :src="themeStore.reportLetterhead.imageDataUrl"
            alt="Pratinjau Kop Surat PDF"
            class="max-w-full h-auto max-h-48 object-contain mx-auto rounded-lg bg-white"
          />
        </div>

        <!-- Text Kop Preview -->
        <div
          v-else
          class="text-center space-y-0.5 pb-3 border-b-4 border-double border-slate-800 dark:border-slate-300"
        >
          <div
            v-if="themeStore.reportLetterhead.organizationName.trim()"
            class="text-sm sm:text-base font-extrabold tracking-wide text-slate-900 dark:text-slate-100 uppercase"
          >
            {{ themeStore.reportLetterhead.organizationName }}
          </div>
          <div
            v-if="themeStore.reportLetterhead.subtitle.trim()"
            class="text-xs sm:text-sm font-bold text-emerald-700 dark:text-emerald-400"
          >
            {{ themeStore.reportLetterhead.subtitle }}
          </div>
          <div
            v-if="themeStore.reportLetterhead.addressLine.trim()"
            class="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400"
          >
            {{ themeStore.reportLetterhead.addressLine }}
          </div>
        </div>
      </div>
    </section>

    <!-- =================================================================== -->
    <!-- SECTION 2: KUSTOMISASI JUDUL LAPORAN PDF                            -->
    <!-- =================================================================== -->
    <section class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-5 w-full min-w-0">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3.5 gap-3">
        <div class="space-y-1 min-w-0">
          <div class="flex items-center gap-2">
            <FileText class="w-4 h-4 text-emerald-600 shrink-0" />
            <h2 class="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
              2. Kustomisasi Judul Laporan PDF
            </h2>
          </div>
          <p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Ubah judul utama untuk masing-masing jenis laporan sesuai kebutuhan organisasi Anda (kosongkan jika ingin menggunakan judul standar aplikasi).
          </p>
        </div>

        <button
          type="button"
          class="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-emerald-500 text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center justify-center gap-1.5 shrink-0 transition-colors cursor-pointer"
          @click="handleResetTitles"
        >
          <RotateCcw class="w-3.5 h-3.5 shrink-0" />
          <span>Reset ke Judul Standar</span>
        </button>
      </div>

      <div class="grid grid-cols-1 gap-3.5">
        <div
          v-for="rep in reportTypeDefinitions"
          :key="rep.id"
          class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 p-3.5 sm:p-4 space-y-2"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <component :is="rep.icon" class="w-4 h-4 text-emerald-600 shrink-0" />
              <span class="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                {{ rep.label }}
              </span>
            </div>
            <span class="text-[11px] text-slate-500 dark:text-slate-400">
              Default: <strong>{{ rep.defaultTitle }}</strong>
            </span>
          </div>

          <input
            :value="themeStore.reportCustomTitles[rep.id]"
            type="text"
            maxlength="100"
            :placeholder="rep.placeholder"
            class="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
            @input="
              themeStore.updateReportCustomTitle(
                rep.id,
                ($event.target as HTMLInputElement).value
              )
            "
          />

          <div class="text-[11px] text-slate-500 dark:text-slate-400">
            Judul yang akan tercetak di PDF:
            <strong class="text-emerald-700 dark:text-emerald-400 uppercase">
              {{ themeStore.getResolvedReportTitle(rep.id) }}
            </strong>
          </div>
        </div>
      </div>
    </section>

    <!-- =================================================================== -->
    <!-- SECTION 3: PENANDATANGAN LAPORAN PDF (MAKSIMAL 3 PENANDATANGAN)      -->
    <!-- =================================================================== -->
    <section
      id="report-signatures"
      class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-5 w-full min-w-0"
    >
      <div class="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3.5 gap-3">
        <div class="space-y-1 min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <PenTool class="w-4 h-4 text-emerald-600 shrink-0" />
            <h2 class="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
              3. Daftar Penandatangan Laporan PDF
            </h2>
            <span
              class="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider"
              :class="
                themeStore.reportSigners.length >= MAX_REPORT_SIGNERS
                  ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300'
                  : 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300'
              "
            >
              {{ themeStore.reportSigners.length }} / {{ MAX_REPORT_SIGNERS }} Penandatangan
            </span>
          </div>
          <p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Tambahkan hingga maksimal <strong>3 penandatangan</strong> (misal: Ketua DKM, Sekretaris, dan Bendahara) dengan nama serta jabatan yang fleksibel. Setiap laporan bisa diatur siapa saja yang menandatangani.
          </p>
        </div>
      </div>

      <!-- Optional Location / City Input for Signature Date Line -->
      <div class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 p-3.5 sm:p-4 space-y-2">
        <label class="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
          <MapPin class="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span>Kota / Lokasi Tempat Tanda Tangan (Opsional)</span>
        </label>
        <div class="flex flex-col sm:flex-row sm:items-center gap-2">
          <input
            :value="themeStore.reportSignPlace"
            type="text"
            maxlength="60"
            placeholder="Contoh: Jakarta / Bandung / Surabaya (Kosongkan jika hanya ingin menampilkan Tanggal Cetak)"
            class="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
            @input="themeStore.setReportSignPlace(($event.target as HTMLInputElement).value)"
          />
        </div>
        <p class="text-[11px] text-slate-500 dark:text-slate-400">
          Pratinjau baris tanggal cetak di atas tanda tangan kanan:
          <strong class="text-slate-800 dark:text-slate-200">
            {{
              themeStore.reportSignPlace.trim()
                ? `${themeStore.reportSignPlace.trim()}, 11 Oktober 2026`
                : 'Tanggal Cetak: 11 Oktober 2026'
            }}
          </strong>
        </p>
      </div>

      <!-- Add New Signer Form (Shown when < 3 signers) -->
      <form
        v-if="themeStore.reportSigners.length < MAX_REPORT_SIGNERS"
        class="rounded-2xl border border-emerald-200/80 dark:border-emerald-900/50 bg-emerald-50/35 dark:bg-emerald-950/20 p-3.5 sm:p-4 space-y-3"
        @submit.prevent="handleAddReportSigner"
      >
        <div class="flex items-center justify-between gap-2">
          <span class="text-xs font-bold text-emerald-900 dark:text-emerald-200">
            Tambah Penandatangan Baru (Slot ke-{{ themeStore.reportSigners.length + 1 }} dari {{ MAX_REPORT_SIGNERS }})
          </span>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
          <div class="sm:col-span-4">
            <input
              v-model="newSignerName"
              type="text"
              maxlength="80"
              placeholder="Nama Lengkap & Gelar (misal: H. Ahmad Fauzi)"
              class="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
            />
          </div>
          <div class="sm:col-span-4">
            <input
              v-model="newSignerRole"
              type="text"
              maxlength="80"
              placeholder="Jabatan / Peran (misal: Sekretaris / Bendahara / Ketua)"
              class="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
            />
          </div>
          <div class="sm:col-span-2 flex rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1 min-h-[44px]">
            <button
              type="button"
              class="flex-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer"
              :class="
                newSignerRowPosition !== 'bottom'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              "
              @click="newSignerRowPosition = 'top'"
            >
              Atas
            </button>
            <button
              type="button"
              class="flex-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer"
              :class="
                newSignerRowPosition === 'bottom'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              "
              @click="newSignerRowPosition = 'bottom'"
            >
              Bawah
            </button>
          </div>
          <div class="sm:col-span-2">
            <button
              type="submit"
              class="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus class="w-4 h-4 shrink-0" />
              <span>Tambah</span>
            </button>
          </div>
        </div>
        <p class="text-[11px] text-slate-500 dark:text-slate-400">
          Tips: Pilih <strong>Atas</strong> untuk penandatangan sejajar di baris pertama (misal: Sekretaris &amp; Bendahara), dan pilih <strong>Bawah</strong> untuk penandatangan di baris kedua bawah (misal: Mengetahui, Ketua / Kepala).
        </p>
      </form>

      <!-- Maximum Reached Banner -->
      <div
        v-else
        class="rounded-xl border border-amber-200/80 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/25 px-3.5 py-2.5 text-xs text-amber-800 dark:text-amber-200 flex items-center justify-between gap-2"
      >
        <span>
          Batas maksimal <strong>{{ MAX_REPORT_SIGNERS }} penandatangan</strong> telah tercapai. Anda tetap dapat mengubah nama, jabatan, urutan, atau penugasan laporan di bawah ini.
        </span>
      </div>

      <!-- Empty State -->
      <div
        v-if="themeStore.reportSigners.length === 0"
        class="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-6 text-center space-y-1.5"
      >
        <div class="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300">
          Belum Ada Penandatangan Laporan
        </div>
        <p class="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
          Tambahkan 1 hingga 3 penandatangan di atas agar laporan PDF yang diunduh memiliki kolom tanda tangan resmi di bagian bawah dokumen.
        </p>
      </div>

      <!-- Signers List & Per-Report Checkboxes -->
      <div v-else class="space-y-3">
        <div
          v-for="(signer, idx) in themeStore.reportSigners"
          :key="signer.id"
          class="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 p-3.5 sm:p-4 space-y-3.5"
        >
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/60 dark:border-slate-800 pb-2.5">
            <div class="flex items-center gap-2">
              <span class="w-6 h-6 rounded-lg bg-emerald-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
                {{ idx + 1 }}
              </span>
              <span class="text-xs font-bold text-slate-800 dark:text-slate-200">
                Penandatangan #{{ idx + 1 }}
                <span class="font-normal text-slate-500 dark:text-slate-400">
                  ({{ getSignerPositionDescription(signer) }})
                </span>
              </span>
            </div>

            <div class="flex flex-wrap items-center gap-1.5">
              <!-- Toggle Posisi Baris Atas / Bawah -->
              <div class="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-0.5 mr-1">
                <button
                  type="button"
                  class="px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors cursor-pointer"
                  :class="
                    signer.rowPosition !== 'bottom'
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                  "
                  title="Tempatkan di Baris Atas pada halaman PDF"
                  @click="themeStore.updateReportSigner(signer.id, signer.name, signer.role, 'top')"
                >
                  Baris Atas
                </button>
                <button
                  type="button"
                  class="px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors cursor-pointer"
                  :class="
                    signer.rowPosition === 'bottom'
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                  "
                  title="Tempatkan di Baris Bawah pada halaman PDF"
                  @click="themeStore.updateReportSigner(signer.id, signer.name, signer.role, 'bottom')"
                >
                  Baris Bawah
                </button>
              </div>

              <button
                type="button"
                :disabled="idx === 0"
                class="min-h-[34px] px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:border-emerald-500 disabled:opacity-40 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer disabled:cursor-not-allowed"
                title="Geser urutan ke kiri/atas"
                @click="themeStore.moveReportSigner(signer.id, -1)"
              >
                <ArrowUp class="w-3.5 h-3.5" />
                <span class="hidden sm:inline">Naik</span>
              </button>
              <button
                type="button"
                :disabled="idx === themeStore.reportSigners.length - 1"
                class="min-h-[34px] px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:border-emerald-500 disabled:opacity-40 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer disabled:cursor-not-allowed"
                title="Geser urutan ke kanan/bawah"
                @click="themeStore.moveReportSigner(signer.id, 1)"
              >
                <ArrowDown class="w-3.5 h-3.5" />
                <span class="hidden sm:inline">Turun</span>
              </button>
              <button
                type="button"
                class="min-h-[34px] px-2.5 py-1 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:bg-rose-100/80 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                title="Hapus penandatangan ini"
                @click="handleRemoveReportSigner(signer.id, signer.name || signer.role || `#${idx + 1}`)"
              >
                <Trash2 class="w-3.5 h-3.5" />
                <span>Hapus</span>
              </button>
            </div>
          </div>

          <!-- Editable Name & Role Inputs -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div class="space-y-1">
              <label class="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                Nama Lengkap Penandatangan
              </label>
              <input
                :value="signer.name"
                type="text"
                maxlength="80"
                placeholder="Nama lengkap beserta gelar"
                class="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
                @input="
                  themeStore.updateReportSigner(
                    signer.id,
                    ($event.target as HTMLInputElement).value,
                    signer.role
                  )
                "
              />
            </div>

            <div class="space-y-1">
              <label class="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                Jabatan / Keterangan Peran
              </label>
              <input
                :value="signer.role"
                type="text"
                maxlength="80"
                placeholder="Contoh: Mengetahui, Ketua DKM / Bendahara"
                class="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
                @input="
                  themeStore.updateReportSigner(
                    signer.id,
                    signer.name,
                    ($event.target as HTMLInputElement).value
                  )
                "
              />
            </div>
          </div>

          <!-- Per-Report Active Assignment Toggles -->
          <div class="space-y-1.5 pt-1">
            <span class="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
              Ikut Menandatangani pada Laporan Berikut:
            </span>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                v-for="rep in reportTypeDefinitions"
                :key="rep.id"
                type="button"
                class="min-h-[38px] px-3 py-2 rounded-xl border text-left text-xs font-semibold flex items-center justify-between gap-2 transition-colors cursor-pointer"
                :class="
                  isSignerEnabledForReport(rep.id, signer.id)
                    ? 'border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400'
                "
                @click="themeStore.toggleSignerForReport(rep.id, signer.id)"
              >
                <span class="truncate">{{ rep.shortLabel }}</span>
                <span
                  class="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase shrink-0"
                  :class="
                    isSignerEnabledForReport(rep.id, signer.id)
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                  "
                >
                  {{ isSignerEnabledForReport(rep.id, signer.id) ? 'Aktif' : 'Nonaktif' }}
                </span>
              </button>
            </div>
          </div>
        </div>

        <!-- Live Preview of Signature Block Layout (Baris Atas & Baris Bawah) -->
        <div class="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-4 sm:p-5 space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2.5">
            <div class="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Pratinjau Posisi Tanda Tangan di Dokumen PDF (Atas &amp; Bawah)
            </div>
            <span class="text-[11px] text-slate-400">
              {{
                themeStore.reportSigners.some((s) => s.rowPosition === 'bottom') &&
                themeStore.reportSigners.some((s) => s.rowPosition !== 'bottom')
                  ? 'Mode 2 Baris (Atas & Bawah)'
                  : 'Mode 1 Baris Sejajar'
              }}
            </span>
          </div>

          <div class="space-y-5 py-1">
            <!-- Row 1: Baris Atas -->
            <div
              v-if="themeStore.reportSigners.some((s) => s.rowPosition !== 'bottom')"
              class="space-y-1.5"
            >
              <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400 text-center">
                Baris Atas
              </div>
              <div
                class="grid gap-4"
                :style="{
                  gridTemplateColumns: `repeat(${themeStore.reportSigners.filter((s) => s.rowPosition !== 'bottom').length}, minmax(0, 1fr))`,
                }"
              >
                <div
                  v-for="(s, rIdx) in themeStore.reportSigners.filter((item) => item.rowPosition !== 'bottom')"
                  :key="`preview_top_${s.id}`"
                  class="text-center space-y-5 p-2.5 rounded-xl bg-slate-50/70 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800"
                  :class="
                    themeStore.reportSigners.filter((item) => item.rowPosition !== 'bottom').length === 1
                      ? 'max-w-xs w-full ml-auto'
                      : ''
                  "
                >
                  <div class="space-y-0.5">
                    <div
                      v-if="
                        rIdx ===
                        themeStore.reportSigners.filter((item) => item.rowPosition !== 'bottom').length - 1
                      "
                      class="text-[10px] text-slate-500 dark:text-slate-400"
                    >
                      {{
                        themeStore.reportSignPlace.trim()
                          ? `${themeStore.reportSignPlace.trim()}, 11 Oktober 2026`
                          : 'Tanggal Cetak: 11 Oktober 2026'
                      }}
                    </div>
                    <div class="text-xs text-slate-700 dark:text-slate-300">
                      {{ s.role || 'Penandatangan' }}
                    </div>
                  </div>
                  <div class="text-xs font-bold text-slate-900 dark:text-slate-100 underline underline-offset-4">
                    {{ s.name || '........................................' }}
                  </div>
                </div>
              </div>
            </div>

            <!-- Row 2: Baris Bawah -->
            <div
              v-if="themeStore.reportSigners.some((s) => s.rowPosition === 'bottom')"
              class="space-y-1.5"
            >
              <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400 text-center">
                Baris Bawah
              </div>
              <div
                class="grid gap-4"
                :style="{
                  gridTemplateColumns: `repeat(${themeStore.reportSigners.filter((s) => s.rowPosition === 'bottom').length}, minmax(0, 1fr))`,
                }"
              >
                <div
                  v-for="(s, rIdx) in themeStore.reportSigners.filter((item) => item.rowPosition === 'bottom')"
                  :key="`preview_bottom_${s.id}`"
                  class="text-center space-y-5 p-2.5 rounded-xl bg-slate-50/70 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800"
                  :class="
                    themeStore.reportSigners.filter((item) => item.rowPosition === 'bottom').length === 1
                      ? themeStore.reportSigners.length === 1
                        ? 'max-w-xs w-full ml-auto'
                        : 'max-w-xs w-full mx-auto'
                      : ''
                  "
                >
                  <div class="space-y-0.5">
                    <div
                      v-if="
                        !themeStore.reportSigners.some((item) => item.rowPosition !== 'bottom') &&
                        rIdx ===
                          themeStore.reportSigners.filter((item) => item.rowPosition === 'bottom').length - 1
                      "
                      class="text-[10px] text-slate-500 dark:text-slate-400"
                    >
                      {{
                        themeStore.reportSignPlace.trim()
                          ? `${themeStore.reportSignPlace.trim()}, 11 Oktober 2026`
                          : 'Tanggal Cetak: 11 Oktober 2026'
                      }}
                    </div>
                    <div class="text-xs text-slate-700 dark:text-slate-300">
                      {{ s.role || 'Penandatangan' }}
                    </div>
                  </div>
                  <div class="text-xs font-bold text-slate-900 dark:text-slate-100 underline underline-offset-4">
                    {{ s.name || '........................................' }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
