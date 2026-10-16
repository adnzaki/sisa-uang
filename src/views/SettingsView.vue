<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink, useRouter, useRoute } from 'vue-router';
import {
  Sun,
  Moon,
  Monitor,
  Globe,
  Type,
  Code2,
  ShieldCheck,
  Database,
  Upload,
  Trash2,
  User as UserIcon,
  Save,
  RefreshCw,
  KeyRound,
  Eye,
  EyeOff,
  Sparkles,
  Crown,
  Clock,
  Smartphone,
  Laptop,
  Tablet,
  Mail,
  UserPlus,
  CheckCircle2,
  LogOut,
  ShieldAlert,
  PenTool,
  Plus,
  ArrowUp,
  ArrowDown,
  MapPin,
  FileCheck2,
} from 'lucide-vue-next';
import { useThemeStore, MAX_REPORT_SIGNERS } from '../stores/theme';
import { useAuthStore } from '../stores/auth';
import { useNotificationStore } from '../stores/notification';
import { usePWA } from '../composables/usePWA';
import PWAInstallButton from '../components/PWAInstallButton.vue';

const { t, locale } = useI18n();
const router = useRouter();
const route = useRoute();
const themeStore = useThemeStore();
const authStore = useAuthStore();
const notificationStore = useNotificationStore();
const {
  needRefresh,
  isReloadingForUpdate,
  currentAppVersion,
  checkForAppUpdates,
  performFullAppReload,
} = usePWA();

const isCheckingUpdate = ref(false);

async function handleManualCheckUpdate() {
  isCheckingUpdate.value = true;
  try {
    const hasUpdate = await checkForAppUpdates();
    if (!hasUpdate) {
      notificationStore.notifySuccess(
        'Aplikasi Sudah Versi Terbaru',
        `Anda sedang menggunakan Sisa Uang versi terbaru (${currentAppVersion.value}). Jika tampilan belum berubah, gunakan tombol "Bersihkan Cache & Reload Penuh".`
      );
    }
  } finally {
    isCheckingUpdate.value = false;
  }
}

// =========================================================================
// User Profile Settings (DisplayName & Username)
// =========================================================================
const profileDisplayName = ref<string>(authStore.user?.displayName || '');
const profileUsername = ref<string>(
  authStore.user?.username || authStore.user?.email.split('@')[0] || ''
);

async function handleSaveProfile() {
  await authStore.updateUserProfile(profileDisplayName.value, profileUsername.value);
  if (authStore.user) {
    profileDisplayName.value = authStore.user.displayName;
    profileUsername.value = authStore.user.username;
  }
}

// =========================================================================
// Change Password State & Handler
// =========================================================================
const currentPassword = ref('');
const newPassword = ref('');
const confirmNewPassword = ref('');
const showCurrentPassword = ref(false);
const showNewPassword = ref(false);
const showConfirmPassword = ref(false);
const isChangingPassword = ref(false);

async function handleChangePassword() {
  if (newPassword.value.length < 6) {
    notificationStore.notifyError(
      'Validasi Kata Sandi Gagal',
      'Kata sandi baru wajib terdiri dari minimal 6 karakter.'
    );
    return;
  }

  if (newPassword.value !== confirmNewPassword.value) {
    notificationStore.notifyError(
      'Konfirmasi Kata Sandi Tidak Cocok',
      'Kata sandi baru dan konfirmasi kata sandi baru tidak sama.'
    );
    return;
  }

  if (currentPassword.value && currentPassword.value === newPassword.value) {
    notificationStore.notifyError(
      'Kata Sandi Sama',
      'Kata sandi baru harus berbeda dari kata sandi saat ini.'
    );
    return;
  }

  isChangingPassword.value = true;
  try {
    const ok = await authStore.changeUserPassword(currentPassword.value, newPassword.value);
    if (ok) {
      currentPassword.value = '';
      newPassword.value = '';
      confirmNewPassword.value = '';
      showCurrentPassword.value = false;
      showNewPassword.value = false;
      showConfirmPassword.value = false;
    }
  } finally {
    isChangingPassword.value = false;
  }
}

// =========================================================================
// Device & Session Management + Primary Device OTP + Multi-Account Switcher
// =========================================================================
const primaryOtpInput = ref('');
const customDeviceLabel = ref(
  typeof localStorage !== 'undefined'
    ? localStorage.getItem('sisa_uang_custom_device_name_v1') || ''
    : ''
);

onMounted(() => {
  themeStore.loadReportSignatureConfig(authStore.user?.uid);
  void authStore.fetchDeviceSessions();
  checkAndScrollToSection();
});

watch(
  () => authStore.user?.uid,
  (uid) => {
    themeStore.loadReportSignatureConfig(uid);
    if (uid) {
      profileDisplayName.value = authStore.user?.displayName || '';
      profileUsername.value =
        authStore.user?.username || authStore.user?.email.split('@')[0] || '';
      primaryOtpInput.value = '';
      void authStore.fetchDeviceSessions();
    }
  }
);

// =========================================================================
// Report Signature Configuration (Up to 3 Signers + Per-Report Assignment)
// =========================================================================
const signatureSectionRef = ref<HTMLElement | null>(null);
const highlightSignatureSection = ref(false);
const newSignerName = ref('');
const newSignerRole = ref('');

const reportTypeDefinitions = [
  {
    id: 'kas_umum',
    label: 'Laporan Kas Umum (Buku Kas Umum)',
    shortLabel: 'Kas Umum',
  },
  {
    id: 'rekonsiliasi_kas',
    label: 'Laporan Rekonsiliasi Kas & Kepemilikan',
    shortLabel: 'Rekonsiliasi Kas',
  },
  {
    id: 'realisasi_anggaran',
    label: 'Laporan Realisasi / Serapan Anggaran',
    shortLabel: 'Realisasi Anggaran',
  },
];

function checkAndScrollToSection() {
  if (
    route.query.section === 'report-signatures' ||
    route.hash === '#report-signatures'
  ) {
    handleOpenReportSettings();
  }
}

function handleOpenReportSettings() {
  router.push('/report-settings');
}

watch(
  () => [route.query.section, route.hash],
  () => {
    checkAndScrollToSection();
  }
);

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

function formatSessionTimestamp(iso?: string | null): string {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function getAccountInitials(nameOrEmail?: string): string {
  const clean = (nameOrEmail || 'U').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase();
}

async function handleRequestPrimaryOtp() {
  try {
    primaryOtpInput.value = '';
    await authStore.requestPrimaryDeviceOtp(customDeviceLabel.value);
  } catch {
    // Handled in store
  }
}

async function handleVerifyPrimaryOtp() {
  const ok = await authStore.verifyPrimaryDeviceOtp(primaryOtpInput.value);
  if (ok) {
    primaryOtpInput.value = '';
  }
}

async function handleRevokeSession(targetDeviceId: string, deviceName: string) {
  const confirmed = await notificationStore.requestConfirmation({
    title: 'Cabut Sesi Perangkat?',
    message: `Apakah Anda yakin ingin menghapus dan mencabut sesi login pada perangkat "${deviceName}"?`,
    detail: `Perangkat tersebut akan langsung keluar dari akun ${authStore.user?.email}.`,
    confirmLabel: 'Ya, Cabut Sesi',
    cancelLabel: 'Batal',
    variant: 'danger',
  });
  if (!confirmed) return;
  await authStore.revokeDeviceSession(targetDeviceId);
}

async function handleRevokeAllOtherSessions() {
  const otherCount = authStore.deviceSessions.filter(
    (s) => s.deviceId !== authStore.currentDeviceId
  ).length;
  if (otherCount === 0) return;

  const confirmed = await notificationStore.requestConfirmation({
    title: 'Cabut Semua Sesi Perangkat Lain?',
    message: `Apakah Anda yakin ingin mencabut ${otherCount} sesi aktif di perangkat lain?`,
    detail: 'Hanya sesi pada Perangkat Utama ini yang akan tetap aktif.',
    confirmLabel: 'Ya, Cabut Semua',
    cancelLabel: 'Batal',
    variant: 'danger',
  });
  if (!confirmed) return;
  await authStore.revokeAllOtherDeviceSessions();
}

async function handleSwitchSavedAccount(targetUid: string) {
  if (targetUid === authStore.user?.uid) return;
  const ok = await authStore.switchAccount(targetUid);
  if (ok) {
    router.push(authStore.isSuperAdmin ? '/control-panel' : '/dashboard');
  }
}

function handleGoToAddAccount() {
  router.push({ path: '/auth', query: { mode: 'add-account' } });
}
</script>

<template>
  <div class="w-full max-w-full overflow-x-hidden space-y-6">
    <!-- Page Header -->
    <div>
      <h1 class="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
        {{ t('nav.settings') }} · {{ t('nav.settingsGeneral') }}
      </h1>
      <p class="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
        Konfigurasi tema tampilan, bahasa antarmuka, dan profil akun personal Anda.
      </p>
    </div>

    <!-- PWA Home Screen / Start Menu Installation Card -->
    <PWAInstallButton variant="card" />

    <!-- Appearance & Theme -->
    <section class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4 w-full min-w-0">
      <div>
        <h2 class="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {{ t('theme.label') }}
        </h2>
        <p class="text-xs text-slate-500 dark:text-slate-400">
          Mendukung tema terang, gelap, maupun otomatis mengikuti pengaturan sistem perangkat Anda.
        </p>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <button
          type="button"
          class="min-h-[44px] px-4 py-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
          :class="
            themeStore.themeMode === 'light'
              ? 'border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
              : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
          "
          @click="themeStore.setTheme('light')"
        >
          <Sun class="w-4 h-4 shrink-0" />
          <span>{{ t('theme.light') }}</span>
        </button>

        <button
          type="button"
          class="min-h-[44px] px-4 py-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
          :class="
            themeStore.themeMode === 'dark'
              ? 'border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
              : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
          "
          @click="themeStore.setTheme('dark')"
        >
          <Moon class="w-4 h-4 shrink-0" />
          <span>{{ t('theme.dark') }}</span>
        </button>

        <button
          type="button"
          class="min-h-[44px] px-4 py-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
          :class="
            themeStore.themeMode === 'system'
              ? 'border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
              : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
          "
          @click="themeStore.setTheme('system')"
        >
          <Monitor class="w-4 h-4 shrink-0" />
          <span>{{ t('theme.system') }}</span>
        </button>
      </div>
    </section>

    <!-- Language & Currency (Intlify vue-i18n) -->
    <section class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4 w-full min-w-0">
      <div class="flex items-center gap-2">
        <Globe class="w-4 h-4 text-emerald-600 shrink-0" />
        <h2 class="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Bahasa & Format Lokal
        </h2>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div :class="authStore.isSuperAdmin ? 'sm:col-span-2' : ''">
          <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
            Bahasa Antarmuka (Intlify Vue I18n)
          </label>
          <div class="grid grid-cols-2 gap-2">
            <button
              type="button"
              class="min-h-[44px] px-2 rounded-xl border text-xs font-semibold transition-colors"
              :class="
                locale === 'id'
                  ? 'border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                  : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
              "
              @click="themeStore.setLocale('id')"
            >
              Bahasa Indonesia
            </button>
            <button
              type="button"
              class="min-h-[44px] px-2 rounded-xl border text-xs font-semibold transition-colors"
              :class="
                locale === 'en'
                  ? 'border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                  : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
              "
              @click="themeStore.setLocale('en')"
            >
              English
            </button>
          </div>
        </div>

        <div v-if="!authStore.isSuperAdmin">
          <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
            Tampilan Mata Uang
          </label>
          <div class="grid grid-cols-2 gap-2">
            <button
              type="button"
              class="min-h-[44px] px-2 rounded-xl border text-xs font-money font-semibold transition-colors"
              :class="
                themeStore.currency === 'IDR'
                  ? 'border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                  : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
              "
              @click="themeStore.setCurrency('IDR')"
            >
              IDR (Rp)
            </button>
            <button
              type="button"
              class="min-h-[44px] px-2 rounded-xl border text-xs font-money font-semibold transition-colors"
              :class="
                themeStore.currency === 'USD'
                  ? 'border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                  : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
              "
              @click="themeStore.setCurrency('USD')"
            >
              USD ($)
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- Typography for Money Numbers (Sans Default vs Monospace / Coding Font) -->
    <section class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4 w-full min-w-0">
      <div class="flex items-start justify-between gap-3">
        <div class="space-y-0.5">
          <div class="flex items-center gap-2">
            <Type class="w-4 h-4 text-emerald-600 shrink-0" />
            <h2 class="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Tipografi & Jenis Font Angka Uang
            </h2>
          </div>
          <p class="text-xs text-slate-500 dark:text-slate-400">
            Pilih jenis huruf untuk menampilkan nominal saldo, pemasukan, dan pengeluaran di seluruh aplikasi.
          </p>
        </div>

        <span class="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200/70 dark:border-emerald-900/50 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 shrink-0">
          {{ themeStore.moneyFont === 'sans' ? 'Standar (Default)' : 'Coding / Mono' }}
        </span>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <!-- Option 1: Font Standar Aplikasi (Plus Jakarta Sans) - Default -->
        <button
          type="button"
          class="p-4 rounded-2xl border text-left transition-all flex flex-col justify-between gap-3 cursor-pointer"
          :class="
            themeStore.moneyFont === 'sans'
              ? 'border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/35 ring-2 ring-emerald-500/15'
              : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/40 dark:bg-slate-950/40'
          "
          @click="themeStore.setMoneyFont('sans')"
        >
          <div class="flex items-start justify-between gap-2 w-full">
            <div class="flex items-center gap-2">
              <div
                class="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                :class="
                  themeStore.moneyFont === 'sans'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                "
              >
                <Type class="w-4 h-4" />
              </div>
              <div>
                <div class="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                  Font Standar Aplikasi
                </div>
                <div class="text-[11px] text-slate-500 dark:text-slate-400">
                  Plus Jakarta Sans (Selaras teks aplikasi · Default)
                </div>
              </div>
            </div>
          </div>

          <div
            class="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 text-base sm:text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400"
            style="font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif"
          >
            Rp 12.450.000
          </div>
        </button>

        <!-- Option 2: Font Coding / Monospace (JetBrains Mono) -->
        <button
          type="button"
          class="p-4 rounded-2xl border text-left transition-all flex flex-col justify-between gap-3 cursor-pointer"
          :class="
            themeStore.moneyFont === 'mono'
              ? 'border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/35 ring-2 ring-emerald-500/15'
              : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/40 dark:bg-slate-950/40'
          "
          @click="themeStore.setMoneyFont('mono')"
        >
          <div class="flex items-start justify-between gap-2 w-full">
            <div class="flex items-center gap-2">
              <div
                class="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                :class="
                  themeStore.moneyFont === 'mono'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                "
              >
                <Code2 class="w-4 h-4" />
              </div>
              <div>
                <div class="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                  Font Coding / Monospace
                </div>
                <div class="text-[11px] text-slate-500 dark:text-slate-400">
                  JetBrains Mono (Gaya angka finansial & koding)
                </div>
              </div>
            </div>
          </div>

          <div
            class="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 text-base sm:text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400"
            style="font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, monospace"
          >
            Rp 12.450.000
          </div>
        </button>
      </div>
    </section>

    <!-- Dedicated Report Settings Page Shortcut Card (for Regular Users) -->
    <section
      v-if="!authStore.isSuperAdmin"
      class="rounded-2xl border border-emerald-200/80 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/25 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 w-full min-w-0"
    >
      <div class="flex items-start gap-3 min-w-0">
        <div class="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
          <PenTool class="w-5 h-5" />
        </div>
        <div class="space-y-1 min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="text-sm font-bold text-slate-900 dark:text-slate-100">
              Pengaturan Laporan PDF (Kop Institusi, Judul &amp; Tanda Tangan)
            </h2>
            <span
              v-if="!authStore.isProUser"
              class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 text-[10px] font-bold uppercase tracking-wider"
            >
              <Crown class="w-3 h-3 shrink-0" />
              <span>Khusus Pelanggan Pro</span>
            </span>
          </div>
          <p class="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Pengaturan kop masjid/musholla/organisasi, kustomisasi judul laporan, serta daftar penandatangan kini tersedia di sub-menu <strong>Pengaturan &rarr; Laporan</strong> (eksklusif untuk pelanggan SisaUang Pro).
          </p>
        </div>
      </div>

      <RouterLink
        to="/report-settings"
        class="w-full sm:w-auto min-h-[42px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shrink-0 transition-colors"
      >
        <FileCheck2 class="w-4 h-4 shrink-0" />
        <span>Buka Pengaturan Laporan</span>
      </RouterLink>
    </section>

    <!-- Account Profile Summary + DisplayName & Username Editor -->
    <section class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-5 w-full min-w-0">
      <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
        <div class="flex items-start sm:items-center gap-2 min-w-0">
          <UserIcon class="w-4 h-4 text-emerald-600 shrink-0 mt-0.5 sm:mt-0" />
          <div class="min-w-0">
            <h2 class="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Profil Akun (Display Name & Username Login)
            </h2>
            <p class="text-xs text-slate-500 dark:text-slate-400 break-words">
              Atur <strong>Display Name</strong> (mendukung spasi & karakter bebas) dan <strong>Username</strong> yang dapat digunakan untuk login layaknya alamat email.
            </p>
          </div>
        </div>
      </div>

      <form class="grid grid-cols-1 sm:grid-cols-2 gap-3.5" @submit.prevent="handleSaveProfile">
        <input
          v-model="profileDisplayName"
          type="text"
          required
          maxlength="80"
          placeholder="Nama Tampilan (Display Name)"
          class="w-full min-h-[52px] px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950 text-sm sm:text-base text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
        />

        <input
          v-model="profileUsername"
          type="text"
          required
          maxlength="60"
          placeholder="Username Login"
          class="w-full min-h-[52px] px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950 text-sm sm:text-base font-mono text-slate-900 dark:text-slate-100 placeholder:font-sans focus:outline-none focus:border-emerald-600"
        />

        <div class="sm:col-span-2 flex justify-end">
          <button
            type="submit"
            :disabled="authStore.isLoading"
            class="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
          >
            <Save class="w-4 h-4 shrink-0" />
            <span>Simpan Perubahan Profil</span>
          </button>
        </div>
      </form>

      <div class="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2 text-xs text-slate-600 dark:text-slate-400">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-0.5 py-1.5 border-b border-slate-100 dark:border-slate-800">
          <span>Display Name Saat Ini</span>
          <span class="font-medium text-slate-900 dark:text-slate-100 break-words">{{ authStore.user?.displayName }}</span>
        </div>
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-0.5 py-1.5 border-b border-slate-100 dark:border-slate-800">
          <span>Username Login</span>
          <span class="font-mono text-emerald-600 dark:text-emerald-400 font-semibold break-all">@{{ authStore.user?.username || authStore.user?.email.split('@')[0] }}</span>
        </div>
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-0.5 py-1.5 border-b border-slate-100 dark:border-slate-800">
          <span>Email Terdaftar</span>
          <span class="font-mono text-slate-900 dark:text-slate-100 break-all">{{ authStore.user?.email }}</span>
        </div>
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-0.5 py-1.5 border-b border-slate-100 dark:border-slate-800">
          <span>Hak Akses (Role)</span>
          <span class="font-semibold text-emerald-600 dark:text-emerald-400">
            {{ authStore.isSuperAdmin ? 'Administrator (Super Admin)' : 'Pengguna Standar' }}
          </span>
        </div>
        <div
          v-if="!authStore.isSuperAdmin"
          class="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 py-2 border-b border-slate-100 dark:border-slate-800"
        >
          <span>Status Langganan SisaUang Pro</span>
          <div class="flex flex-wrap items-center gap-2">
            <span
              v-if="authStore.isProUser"
              class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 font-bold"
            >
              <Crown class="w-3.5 h-3.5 shrink-0" />
              <span>
                SisaUang Pro ({{ authStore.user?.subscriptionPlan === 'yearly' ? 'Tahunan' : 'Bulanan' }} · Aktif s/d {{ authStore.user?.subscriptionExpiresAt || '-' }})
              </span>
            </span>
            <span
              v-else-if="authStore.isPendingProUser"
              class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 font-bold"
            >
              <Clock class="w-3.5 h-3.5 shrink-0" />
              <span>PENDING (Menunggu Verifikasi 1–24 Jam)</span>
            </span>
            <span v-else class="font-semibold text-slate-700 dark:text-slate-300">
              Paket Free
            </span>

            <button
              v-if="!authStore.isProUser"
              type="button"
              class="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold inline-flex items-center gap-1 transition-colors cursor-pointer"
              @click="notificationStore.openProModal()"
            >
              <Crown class="w-3 h-3 shrink-0" />
              <span>Info SisaUang Pro</span>
            </button>
          </div>
        </div>
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-0.5 py-1.5 border-b border-slate-100 dark:border-slate-800">
          <span>Skema Database</span>
          <span class="font-mono text-slate-900 dark:text-slate-100">sisa-uang (Cloud Firestore)</span>
        </div>
        <div class="flex flex-col gap-3 py-2.5 border-t border-slate-100 dark:border-slate-800 w-full">
          <div class="w-full space-y-1">
            <div class="font-medium text-slate-900 dark:text-slate-100 flex flex-wrap items-center gap-2">
              <span>Versi &amp; Pembaruan Aplikasi</span>
              <span class="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                {{ currentAppVersion }}
              </span>
              <span
                v-if="needRefresh"
                class="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[10px] font-bold"
              >
                Update Tersedia
              </span>
            </div>
            <p class="w-full text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Jika sudah reload namun tampilan aplikasi belum terupdate, gunakan tombol <strong>Bersihkan Cache &amp; Reload Penuh</strong> untuk memuat ulang seluruh aset terbaru dari server.
            </p>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-12 gap-2.5 w-full">
            <button
              type="button"
              class="sm:col-span-4 w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/40 hover:bg-emerald-100/80 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
              @click="notificationStore.openChangelogModal()"
            >
              <Sparkles class="w-3.5 h-3.5 shrink-0" />
              <span class="truncate">Catatan Rilis (Changelog)</span>
            </button>

            <button
              type="button"
              :disabled="isCheckingUpdate || isReloadingForUpdate"
              class="sm:col-span-4 w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-emerald-600 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
              @click="handleManualCheckUpdate"
            >
              <RefreshCw class="w-3.5 h-3.5 shrink-0" :class="isCheckingUpdate ? 'animate-spin' : ''" />
              <span class="truncate">Cek Update</span>
            </button>

            <button
              type="button"
              :disabled="isReloadingForUpdate"
              class="sm:col-span-4 w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
              @click="performFullAppReload(true)"
            >
              <RefreshCw class="w-3.5 h-3.5 shrink-0" :class="isReloadingForUpdate ? 'animate-spin' : ''" />
              <span class="truncate">Bersihkan Cache &amp; Reload Penuh</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Super Admin Quick Navigation Shortcuts -->
      <div v-if="authStore.isSuperAdmin" class="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
        <div class="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
          <Database class="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Pintasan Menu Super Admin</span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <RouterLink
            to="/database?tab=import"
            class="min-h-[42px] px-3.5 py-2 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/60 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center justify-center gap-2 hover:bg-emerald-100/70 transition-colors"
          >
            <Upload class="w-3.5 h-3.5 shrink-0" />
            <span>Impor Database</span>
          </RouterLink>
          <RouterLink
            to="/database?tab=delete"
            class="min-h-[42px] px-3.5 py-2 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/60 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 text-xs font-semibold flex items-center justify-center gap-2 hover:bg-rose-100/70 transition-colors"
          >
            <Trash2 class="w-3.5 h-3.5 shrink-0" />
            <span>Hapus Database</span>
          </RouterLink>
          <RouterLink
            to="/control-panel"
            class="min-h-[42px] px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-slate-800 text-white text-xs font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
          >
            <ShieldCheck class="w-3.5 h-3.5 shrink-0" />
            <span>Control Panel</span>
          </RouterLink>
        </div>
      </div>
    </section>

    <!-- Security & Change Password Section -->
    <section class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4 w-full min-w-0">
      <div class="flex items-start sm:items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 gap-3">
        <div class="flex items-start sm:items-center gap-2 min-w-0">
          <KeyRound class="w-4 h-4 text-emerald-600 shrink-0 mt-0.5 sm:mt-0" />
          <div class="min-w-0">
            <h2 class="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Keamanan &amp; Ubah Kata Sandi
            </h2>
            <p class="text-xs text-slate-500 dark:text-slate-400 break-words">
              Perbarui kata sandi akun Anda secara berkala untuk menjaga keamanan data keuangan Anda.
            </p>
          </div>
        </div>
      </div>

      <form class="space-y-3.5" @submit.prevent="handleChangePassword">
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-3.5">
          <!-- Current Password -->
          <div class="space-y-1.5">
            <label class="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Kata Sandi Saat Ini
            </label>
            <div class="relative">
              <input
                v-model="currentPassword"
                :type="showCurrentPassword ? 'text' : 'password'"
                :required="authStore.user?.authProvider !== 'google'"
                autocomplete="current-password"
                placeholder="Masukkan kata sandi lama"
                class="w-full min-h-[48px] pl-4 pr-11 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
              />
              <button
                type="button"
                tabindex="-1"
                class="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                :aria-label="showCurrentPassword ? 'Sembunyikan kata sandi' : 'Lihat kata sandi'"
                @click="showCurrentPassword = !showCurrentPassword"
              >
                <EyeOff v-if="showCurrentPassword" class="w-4 h-4" />
                <Eye v-else class="w-4 h-4" />
              </button>
            </div>
          </div>

          <!-- New Password -->
          <div class="space-y-1.5">
            <label class="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Kata Sandi Baru
            </label>
            <div class="relative">
              <input
                v-model="newPassword"
                :type="showNewPassword ? 'text' : 'password'"
                required
                minlength="6"
                autocomplete="new-password"
                placeholder="Minimal 6 karakter"
                class="w-full min-h-[48px] pl-4 pr-11 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
              />
              <button
                type="button"
                tabindex="-1"
                class="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                :aria-label="showNewPassword ? 'Sembunyikan kata sandi baru' : 'Lihat kata sandi baru'"
                @click="showNewPassword = !showNewPassword"
              >
                <EyeOff v-if="showNewPassword" class="w-4 h-4" />
                <Eye v-else class="w-4 h-4" />
              </button>
            </div>
          </div>

          <!-- Confirm New Password -->
          <div class="space-y-1.5">
            <label class="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Konfirmasi Kata Sandi Baru
            </label>
            <div class="relative">
              <input
                v-model="confirmNewPassword"
                :type="showConfirmPassword ? 'text' : 'password'"
                required
                minlength="6"
                autocomplete="new-password"
                placeholder="Ulangi kata sandi baru"
                class="w-full min-h-[48px] pl-4 pr-11 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
              />
              <button
                type="button"
                tabindex="-1"
                class="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                :aria-label="showConfirmPassword ? 'Sembunyikan konfirmasi kata sandi' : 'Lihat konfirmasi kata sandi'"
                @click="showConfirmPassword = !showConfirmPassword"
              >
                <EyeOff v-if="showConfirmPassword" class="w-4 h-4" />
                <Eye v-else class="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1">
          <p class="text-[11px] text-slate-500 dark:text-slate-400">
            Kata sandi baru akan langsung tersinkronisasi dengan sistem autentikasi dan database Cloud Firestore.
          </p>
          <button
            type="submit"
            :disabled="authStore.isLoading || isChangingPassword"
            class="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 shrink-0"
          >
            <KeyRound class="w-4 h-4 shrink-0" />
            <span>{{ isChangingPassword ? 'Memperbarui Kata Sandi...' : 'Simpan Kata Sandi Baru' }}</span>
          </button>
        </div>
      </form>
    </section>

    <!-- Multi-Account Switcher Section -->
    <section class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4 w-full min-w-0">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 gap-3">
        <div class="flex items-start sm:items-center gap-2 min-w-0">
          <UserPlus class="w-4 h-4 text-emerald-600 shrink-0 mt-0.5 sm:mt-0" />
          <div class="min-w-0">
            <h2 class="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Manajemen Multi-Akun (Pindah Akun Cepat)
            </h2>
            <p class="text-xs text-slate-500 dark:text-slate-400 break-words">
              Simpan beberapa akun pengguna di perangkat ini dan beralih antar akun secara instan tanpa harus memasukkan ulang kata sandi.
            </p>
          </div>
        </div>

        <button
          type="button"
          class="min-h-[40px] px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shrink-0 cursor-pointer"
          @click="handleGoToAddAccount"
        >
          <UserPlus class="w-3.5 h-3.5 shrink-0" />
          <span>Tambah Akun Lain</span>
        </button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div
          v-for="acc in authStore.savedAccounts"
          :key="acc.user.uid"
          class="p-3.5 rounded-2xl border transition-all flex flex-col justify-between gap-3"
          :class="
            acc.user.uid === authStore.user?.uid
              ? 'border-emerald-600 bg-emerald-50/40 dark:bg-emerald-950/30 ring-2 ring-emerald-500/15'
              : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 hover:border-emerald-500/50'
          "
        >
          <div class="flex items-start gap-3 min-w-0 w-full">
            <div
              class="w-10 h-10 rounded-xl font-bold text-xs flex items-center justify-center shrink-0"
              :class="
                acc.user.uid === authStore.user?.uid
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
              "
            >
              {{ getAccountInitials(acc.user.displayName || acc.user.email) }}
            </div>
            <div class="min-w-0 flex-1 space-y-0.5">
              <div class="flex flex-wrap items-center gap-1.5">
                <span class="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                  {{ acc.user.displayName }}
                </span>
                <span
                  v-if="acc.user.uid === authStore.user?.uid"
                  class="px-2 py-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-bold"
                >
                  SEDANG AKTIF
                </span>
                <span
                  v-else-if="acc.user.role === 'admin'"
                  class="px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-semibold"
                >
                  Admin
                </span>
              </div>
              <div class="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                @{{ acc.user.username }} · {{ acc.user.email }}
              </div>
              <div class="text-[10px] text-slate-400 dark:text-slate-500">
                Terakhir digunakan: {{ formatSessionTimestamp(acc.lastUsedAt) }}
              </div>

              <div
                v-if="acc.user.uid !== authStore.user?.uid"
                class="pt-2 flex items-center gap-2"
              >
                <button
                  type="button"
                  class="flex-1 min-h-[38px] px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center justify-center transition-colors cursor-pointer"
                  @click="handleSwitchSavedAccount(acc.user.uid)"
                >
                  Beralih
                </button>
                <button
                  type="button"
                  class="min-h-[38px] px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 hover:bg-rose-100/70 dark:hover:bg-rose-950/60 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shrink-0"
                  title="Hapus akun dari daftar multi-akun"
                  @click="authStore.removeSavedAccount(acc.user.uid)"
                >
                  <Trash2 class="w-3.5 h-3.5 shrink-0" />
                  <span>Hapus</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Device & Session Management Section (Primary Device with Email OTP & Remote Session Revocation) -->
    <section class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4 w-full min-w-0">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 gap-3">
        <div class="flex items-start sm:items-center gap-2 min-w-0">
          <Smartphone class="w-4 h-4 text-emerald-600 shrink-0 mt-0.5 sm:mt-0" />
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Manajemen Perangkat &amp; Sesi Aktif
              </h2>
              <span
                v-if="authStore.isCurrentDevicePrimary"
                class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold"
              >
                <ShieldCheck class="w-3 h-3 shrink-0" />
                <span>Perangkat Utama</span>
              </span>
            </div>
            <p class="text-xs text-slate-500 dark:text-slate-400 break-words mt-0.5">
              Pantau seluruh perangkat yang masuk ke akun ini. Hanya <strong>Perangkat Utama</strong> (diverifikasi melalui OTP ke email terdaftar <strong>{{ authStore.user?.email }}</strong>) yang dapat menghapus atau mencabut sesi di perangkat lain.
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <button
            type="button"
            :disabled="authStore.isSessionsLoading"
            class="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-emerald-600 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer"
            @click="authStore.fetchDeviceSessions()"
          >
            <RefreshCw class="w-3.5 h-3.5" :class="authStore.isSessionsLoading ? 'animate-spin' : ''" />
            <span>Segarkan Sesi</span>
          </button>

          <button
            v-if="
              authStore.isCurrentDevicePrimary &&
              authStore.deviceSessions.filter((s) => s.deviceId !== authStore.currentDeviceId).length > 0
            "
            type="button"
            :disabled="authStore.isSessionsLoading"
            class="min-h-[38px] px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            @click="handleRevokeAllOtherSessions"
          >
            <LogOut class="w-3.5 h-3.5 shrink-0" />
            <span>Cabut Semua Sesi Lain</span>
          </button>
        </div>
      </div>

      <!-- Primary Device Status & Email OTP Verification Box -->
      <div
        v-if="!authStore.isCurrentDevicePrimary"
        class="rounded-2xl border border-amber-200/90 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 p-4 space-y-3.5"
      >
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div class="space-y-2.5 min-w-0">
            <div class="flex items-center gap-3 min-w-0">
              <div class="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
                <ShieldAlert class="w-5 h-5" />
              </div>
              <div class="text-xs sm:text-sm font-bold text-amber-950 dark:text-amber-200 leading-snug min-w-0">
                Perangkat Ini Belum Diatur Sebagai Perangkat Utama
              </div>
            </div>
            <p class="text-xs text-amber-900/90 dark:text-amber-200/80 leading-relaxed">
              Untuk dapat menghapus atau mencabut (revoke) sesi login di perangkat lain, tetapkan perangkat ini sebagai <strong>Perangkat Utama</strong> terlebih dahulu melalui verifikasi kode OTP 6 digit ke email terdaftar (<strong>{{ authStore.user?.email }}</strong>).
            </p>
          </div>

          <button
            v-if="!authStore.primaryDeviceOtpPending"
            type="button"
            :disabled="authStore.isSessionsLoading"
            class="min-h-[42px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center justify-center gap-2 shrink-0 transition-colors cursor-pointer disabled:opacity-50"
            @click="handleRequestPrimaryOtp"
          >
            <Mail class="w-4 h-4 shrink-0" />
            <span>Kirim OTP Perangkat Utama</span>
          </button>
        </div>

        <!-- Optional Custom Device Name Input before requesting OTP -->
        <div v-if="!authStore.primaryDeviceOtpPending" class="pt-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <input
            v-model="customDeviceLabel"
            type="text"
            maxlength="60"
            placeholder="Nama perangkat ini (opsional, misal: Laptop Kerja / iPhone Pribadi)"
            class="flex-1 min-h-[42px] px-3.5 py-2 rounded-xl border border-amber-300/80 dark:border-amber-800/70 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
          />
        </div>

        <!-- Active OTP Verification Form for Primary Device -->
        <div
          v-if="authStore.primaryDeviceOtpPending"
          class="rounded-xl border border-emerald-300 dark:border-emerald-800/70 bg-white dark:bg-slate-900 p-4 space-y-3"
        >
          <div class="flex items-start justify-between gap-2">
            <div class="space-y-1">
              <div class="text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                <Mail class="w-3.5 h-3.5 shrink-0" />
                <span>Verifikasi Kode OTP Email ({{ authStore.primaryDeviceOtpPending.email }})</span>
              </div>
              <p class="text-[11px] text-slate-600 dark:text-slate-400">
                Masukkan 6 digit kode OTP yang dikirim ke email terdaftar untuk menjadikan <strong>{{ authStore.primaryDeviceOtpPending.deviceName }}</strong> sebagai Perangkat Utama.
              </p>
              <div
                v-if="authStore.primaryDeviceOtpPending.fallbackCode"
                class="mt-1.5 inline-flex flex-wrap items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-800/60 text-xs text-emerald-800 dark:text-emerald-200"
              >
                <span>Kode OTP Verifikasi Email Anda:</span>
                <strong class="font-mono text-sm tracking-widest text-emerald-700 dark:text-emerald-300 select-all">
                  {{ authStore.primaryDeviceOtpPending.fallbackCode }}
                </strong>
              </div>
            </div>
          </div>

          <form class="flex flex-col lg:flex-row items-stretch lg:items-center gap-2.5" @submit.prevent="handleVerifyPrimaryOtp">
            <input
              v-model="primaryOtpInput"
              type="text"
              inputmode="numeric"
              maxlength="6"
              required
              placeholder="Masukkan 6 Digit OTP (000000)"
              class="w-full lg:flex-1 min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 font-mono text-sm font-bold tracking-[0.25em] text-center lg:text-left text-slate-900 dark:text-slate-100 placeholder:tracking-normal placeholder:font-sans focus:outline-none focus:border-emerald-600"
            />
            <div class="flex flex-col lg:flex-row items-stretch lg:items-center gap-2 w-full lg:w-auto">
              <button
                type="submit"
                :disabled="authStore.isSessionsLoading || primaryOtpInput.trim().length < 6"
                class="w-full lg:w-auto min-h-[44px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap"
              >
                <CheckCircle2 class="w-4 h-4 shrink-0" />
                <span>Verifikasi &amp; Jadikan Utama</span>
              </button>
              <div class="grid grid-cols-2 lg:flex lg:items-center gap-2 w-full lg:w-auto">
                <button
                  type="button"
                  :disabled="authStore.isSessionsLoading"
                  class="w-full lg:w-auto min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer whitespace-nowrap"
                  @click="handleRequestPrimaryOtp"
                >
                  Kirim Ulang
                </button>
                <button
                  type="button"
                  class="w-full lg:w-auto min-h-[44px] px-3 py-2 rounded-xl border border-rose-200/80 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/30 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-100/70 dark:hover:bg-rose-950/60 flex items-center justify-center transition-colors cursor-pointer whitespace-nowrap"
                  @click="authStore.cancelPrimaryDeviceOtp()"
                >
                  Batal
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      <!-- Active Primary Device Banner when current device IS already primary -->
      <div
        v-else
        class="rounded-2xl border border-emerald-200/80 dark:border-emerald-900/60 bg-emerald-50/60 dark:bg-emerald-950/30 p-3.5 sm:p-4 space-y-2"
      >
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
            <ShieldCheck class="w-5 h-5" />
          </div>
          <div class="text-xs sm:text-sm font-bold text-emerald-950 dark:text-emerald-200 leading-snug min-w-0">
            Perangkat Ini Adalah Perangkat Utama Anda
          </div>
        </div>
        <p class="text-[11px] sm:text-xs text-emerald-800/90 dark:text-emerald-300/80 leading-relaxed">
          Terverifikasi melalui OTP Email. Anda memiliki otoritas penuh untuk menghapus atau mencabut sesi login pada perangkat lain di bawah ini.
        </p>
      </div>

      <!-- Device Sessions List -->
      <div class="space-y-2.5">
        <div
          v-for="sess in authStore.deviceSessions"
          :key="sess.sessionId"
          class="p-3.5 sm:p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          :class="
            sess.deviceId === authStore.currentDeviceId
              ? 'border-emerald-500/70 bg-emerald-50/30 dark:bg-emerald-950/20'
              : 'border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40'
          "
        >
          <div class="flex items-start sm:items-center gap-3 min-w-0 flex-1">
            <div
              class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              :class="
                sess.isPrimary
                  ? 'bg-emerald-600 text-white'
                  : sess.deviceId === authStore.currentDeviceId
                    ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300'
                    : 'bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              "
            >
              <Smartphone v-if="sess.deviceType === 'mobile'" class="w-5 h-5" />
              <Tablet v-else-if="sess.deviceType === 'tablet'" class="w-5 h-5" />
              <Laptop v-else class="w-5 h-5" />
            </div>

            <div class="min-w-0 flex-1 space-y-1">
              <div class="flex flex-wrap items-center gap-1.5">
                <span class="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                  {{ sess.deviceName }}
                </span>
                <span
                  v-if="sess.deviceId === authStore.currentDeviceId"
                  class="px-2 py-0.5 rounded-md bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-[10px] font-bold"
                >
                  PERANGKAT INI
                </span>
                <span
                  v-if="sess.isPrimary"
                  class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-bold"
                >
                  <ShieldCheck class="w-3 h-3 shrink-0" />
                  <span>PERANGKAT UTAMA</span>
                </span>
              </div>

              <div class="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span>{{ sess.os }} · {{ sess.browser }}</span>
                <span aria-hidden="true">•</span>
                <span class="font-mono">IP: {{ sess.ipAddress }}</span>
                <span aria-hidden="true">•</span>
                <span>Aktif: {{ formatSessionTimestamp(sess.lastActiveAt) }}</span>
              </div>
            </div>
          </div>

          <!-- Actions for Other Devices -->
          <div class="flex items-center justify-end gap-2 shrink-0">
            <template v-if="sess.deviceId !== authStore.currentDeviceId">
              <button
                v-if="authStore.isCurrentDevicePrimary"
                type="button"
                :disabled="authStore.isSessionsLoading"
                class="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900/70 border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                @click="handleRevokeSession(sess.deviceId, sess.deviceName)"
              >
                <Trash2 class="w-3.5 h-3.5 shrink-0" />
                <span>Cabut / Hapus Sesi</span>
              </button>
              <span
                v-else
                class="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[11px] font-medium"
                title="Atur perangkat ini sebagai Perangkat Utama untuk mencabut sesi perangkat lain"
              >
                Butuh Akses Perangkat Utama
              </span>
            </template>
            <span
              v-else
              class="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 px-2"
            >
              Sesi Saat Ini
            </span>
          </div>
        </div>
      </div>
    </section>

    <!-- Legal & Support Section for Midtrans Compliance -->
    <section class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-4 sm:p-6 space-y-4 shadow-2xs">
      <div class="border-b border-slate-100 dark:border-slate-800 pb-3 flex items-center justify-between">
        <div>
          <h2 class="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Legalitas, Kebijakan &amp; Bantuan Pelanggan
          </h2>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Informasi lisensi platform, kebijakan transaksi pembayaran, serta saluran bantuan resmi SisaUang.
          </p>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <RouterLink
          to="/terms"
          class="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-emerald-500/60 bg-slate-50/50 dark:bg-slate-800/40 text-xs space-y-1 transition-colors block"
        >
          <div class="font-semibold text-slate-900 dark:text-slate-100">Syarat &amp; Ketentuan</div>
          <div class="text-[11px] text-slate-500">Perjanjian lisensi digital goods</div>
        </RouterLink>

        <RouterLink
          to="/refund-policy"
          class="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-emerald-500/60 bg-slate-50/50 dark:bg-slate-800/40 text-xs space-y-1 transition-colors block"
        >
          <div class="font-semibold text-slate-900 dark:text-slate-100">Kebijakan Refund</div>
          <div class="text-[11px] text-slate-500">Garansi kepuasan 7 hari kalender</div>
        </RouterLink>

        <RouterLink
          to="/privacy"
          class="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-emerald-500/60 bg-slate-50/50 dark:bg-slate-800/40 text-xs space-y-1 transition-colors block"
        >
          <div class="font-semibold text-slate-900 dark:text-slate-100">Kebijakan Privasi</div>
          <div class="text-[11px] text-slate-500">Keamanan data &amp; PCI-DSS</div>
        </RouterLink>

        <RouterLink
          to="/contact"
          class="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-emerald-500/60 bg-slate-50/50 dark:bg-slate-800/40 text-xs space-y-1 transition-colors block"
        >
          <div class="font-semibold text-slate-900 dark:text-slate-100">Hubungi Kami</div>
          <div class="text-[11px] text-slate-500">vuedevo@gmail.com &amp; WhatsApp</div>
        </RouterLink>
      </div>

      <!-- Endorsement Note -->
      <div class="text-[11px] text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-1.5">
        <span>Didukung oleh <a href="https://bitdanbait.web.id" target="_blank" class="text-emerald-600 underline font-semibold">Bit &amp; Bait</a> (<a href="https://sisauang.bitdanbait.web.id" target="_blank" class="text-emerald-600 underline">sisauang.bitdanbait.web.id</a>) dan <a href="https://actudent.com" target="_blank" class="text-emerald-600 underline font-semibold">Actudent</a>.</span>
      </div>
    </section>

    <!-- Application Version Footer at the very bottom of Settings Page -->
    <div class="pt-2 pb-4 text-center space-y-1">
      <button
        type="button"
        class="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-slate-200/80 dark:border-slate-800 hover:border-emerald-500/50 bg-white dark:bg-slate-900 text-xs text-slate-500 dark:text-slate-400 transition-colors cursor-pointer"
        @click="notificationStore.openChangelogModal()"
      >
        <Sparkles class="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
        <span class="font-semibold text-slate-700 dark:text-slate-300">Sisa Uang</span>
        <span aria-hidden="true">·</span>
        <span class="font-mono font-semibold text-emerald-600 dark:text-emerald-400">{{ currentAppVersion }}</span>
        <span aria-hidden="true">·</span>
        <span class="text-emerald-600 dark:text-emerald-400 font-semibold">Lihat Catatan Rilis</span>
      </button>
    </div>
  </div>
</template>
