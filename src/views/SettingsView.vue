<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink } from 'vue-router';
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
} from 'lucide-vue-next';
import { useThemeStore } from '../stores/theme';
import { useAuthStore } from '../stores/auth';
import { useNotificationStore } from '../stores/notification';
import { usePWA } from '../composables/usePWA';
import PWAInstallButton from '../components/PWAInstallButton.vue';

const { t, locale } = useI18n();
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
</script>

<template>
  <div class="w-full max-w-full overflow-x-hidden space-y-6">
    <!-- Page Header -->
    <div>
      <h1 class="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
        {{ t('nav.settings') }}
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
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-0.5 py-1.5 border-b border-slate-100 dark:border-slate-800">
          <span>Skema Database</span>
          <span class="font-mono text-slate-900 dark:text-slate-100">sisa-uang (Cloud Firestore)</span>
        </div>
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-2 border-t border-slate-100 dark:border-slate-800">
          <div class="space-y-0.5">
            <div class="font-medium text-slate-900 dark:text-slate-100 flex items-center gap-2">
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
            <p class="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              Jika sudah reload namun tampilan aplikasi belum terupdate, gunakan tombol <strong>Bersihkan Cache &amp; Reload Penuh</strong> untuk memuat ulang seluruh aset terbaru dari server.
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              :disabled="isCheckingUpdate || isReloadingForUpdate"
              class="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-emerald-600 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              @click="handleManualCheckUpdate"
            >
              <RefreshCw class="w-3.5 h-3.5 shrink-0" :class="isCheckingUpdate ? 'animate-spin' : ''" />
              <span>Cek Update</span>
            </button>

            <button
              type="button"
              :disabled="isReloadingForUpdate"
              class="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs"
              @click="performFullAppReload(true)"
            >
              <RefreshCw class="w-3.5 h-3.5 shrink-0" :class="isReloadingForUpdate ? 'animate-spin' : ''" />
              <span>Bersihkan Cache &amp; Reload Penuh</span>
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
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
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

    <!-- Application Version Footer at the very bottom of Settings Page -->
    <div class="pt-2 pb-4 text-center space-y-1">
      <div class="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-500 dark:text-slate-400">
        <span class="font-semibold text-slate-700 dark:text-slate-300">Sisa Uang</span>
        <span aria-hidden="true">·</span>
        <span class="font-mono font-semibold text-emerald-600 dark:text-emerald-400">{{ currentAppVersion }}</span>
      </div>
    </div>
  </div>
</template>
