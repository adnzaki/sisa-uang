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
} from 'lucide-vue-next';
import {
  useThemeStore,
  MAX_REPORT_SIGNERS,
  DEFAULT_REPORT_TITLES,
  type ReportCustomTitlesConfig,
} from '../stores/theme';
import { useAuthStore } from '../stores/auth';
import { useNotificationStore } from '../stores/notification';

const themeStore = useThemeStore();
const authStore = useAuthStore();
const notificationStore = useNotificationStore();

const newSignerName = ref('');
const newSignerRole = ref('');
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
        // Optimize & resize max width to 2400px (300 DPI print quality) while keeping aspect ratio so it fits smoothly in localStorage & PDF
        const maxWidth = 2400;
        const maxHeight = 600;
        let targetW = img.naturalWidth || img.width || 1800;
        let targetH = img.naturalHeight || img.height || 300;

        if (targetW > maxWidth) {
          const ratio = maxWidth / targetW;
          targetW = maxWidth;
          targetH = Math.round(targetH * ratio);
        }
        if (targetH > maxHeight) {
          const ratio = maxHeight / targetH;
          targetH = maxHeight;
          targetW = Math.round(targetW * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          // Fill white background if JPEG, preserve transparency if PNG
          const isPng = file.type === 'image/png';
          if (!isPng) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, targetW, targetH);
          }
          ctx.drawImage(img, 0, 0, targetW, targetH);
          const outputDataUrl = isPng
            ? canvas.toDataURL('image/png')
            : canvas.toDataURL('image/jpeg', 0.92);

          themeStore.updateReportLetterhead({
            enabled: true,
            mode: 'image',
            imageDataUrl: outputDataUrl,
            imageWidthPx: targetW,
            imageHeightPx: targetH,
          });
          notificationStore.notifySuccess(
            'Gambar Kop Berhasil Diunggah',
            `Resolusi tersimpan: ${targetW} × ${targetH} piksel. Siap dicetak pada dokumen PDF.`
          );
        }
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

  const added = themeStore.addReportSigner(cleanName, cleanRole);
  if (added) {
    newSignerName.value = '';
    newSignerRole.value = '';
    notificationStore.notifySuccess(
      'Penandatangan Ditambahkan',
      `"${added.name || added.role}" telah ditambahkan ke daftar penandatangan laporan.`
    );
  }
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
</script>

<template>
  <div class="w-full max-w-full overflow-x-hidden space-y-6">
    <!-- Page Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div class="min-w-0">
        <h1 class="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Pengaturan Laporan PDF
        </h1>
        <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
          Kustomisasi kop institusi/organisasi (seperti Masjid, Musholla, Komunitas, atau Lembaga), judul masing-masing laporan, serta daftar penandatangan laporan PDF.
        </p>
      </div>

      <RouterLink
        to="/analytics"
        class="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-colors shrink-0 shadow-xs"
      >
        <FileCheck2 class="w-4 h-4 shrink-0" />
        <span>Buka Analitik &amp; Cetak PDF</span>
      </RouterLink>
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
              <strong>Format &amp; Desain</strong>: Gunakan format <strong>PNG</strong> (latar belakang putih atau transparan) atau <strong>JPG/JPEG</strong> yang sudah memuat logo masjid/instansi beserta nama dan alamat lengkap dalam satu banner memanjang.
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
                · Garis ganda kop otomatis ditambahkan di bawah gambar.
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

        <!-- Image Kop Preview -->
        <div
          v-if="
            themeStore.reportLetterhead.mode === 'image' &&
            themeStore.reportLetterhead.imageDataUrl
          "
          class="pb-3 border-b-4 border-double border-slate-800 dark:border-slate-300"
        >
          <img
            :src="themeStore.reportLetterhead.imageDataUrl"
            alt="Pratinjau Kop Surat PDF"
            class="w-full max-h-36 object-contain mx-auto rounded-lg bg-white"
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
          <div class="sm:col-span-5">
            <input
              v-model="newSignerName"
              type="text"
              maxlength="80"
              placeholder="Nama Lengkap & Gelar (misal: H. Ahmad Fauzi)"
              class="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
            />
          </div>
          <div class="sm:col-span-5">
            <input
              v-model="newSignerRole"
              type="text"
              maxlength="80"
              placeholder="Jabatan / Peran (misal: Mengetahui, Ketua DKM / Bendahara)"
              class="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
            />
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
                  ({{
                    themeStore.reportSigners.length === 1
                      ? 'Posisi Kanan / Tunggal'
                      : idx === 0
                        ? 'Kolom Kiri'
                        : idx === themeStore.reportSigners.length - 1
                          ? 'Kolom Kanan'
                          : 'Kolom Tengah'
                  }})
                </span>
              </span>
            </div>

            <div class="flex items-center gap-1.5">
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
      </div>
    </section>
  </div>
</template>
