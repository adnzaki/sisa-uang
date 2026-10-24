<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
  ShieldCheck,
  Mail,
  Lock,
  User as UserIcon,
  ArrowRight,
  ArrowLeft,
  Home,
  RefreshCw,
  Sun,
  Moon,
  Monitor,
  Wallet,
  Eye,
  EyeOff,
  KeyRound,
} from 'lucide-vue-next';
import { useAuthStore } from '../stores/auth';
import { useThemeStore, ThemeMode } from '../stores/theme';
import { useNotificationStore } from '../stores/notification';
import PWAInstallButton from '../components/PWAInstallButton.vue';

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const themeStore = useThemeStore();
const notificationStore = useNotificationStore();

const activeTab = ref<'login' | 'register' | 'reset'>('login');
const email = ref('');
const username = ref('');
const password = ref('');
const confirmPassword = ref('');
const displayName = ref('');
const otpCode = ref('');

// Hide / Show Password states for Login, Register, and Reset Password
const showPassword = ref(false);
const showConfirmPassword = ref(false);

const isOtpStep = computed(
  () =>
    authStore.requiresOtp ||
    (route.query.step === 'otp' &&
      authStore.user?.email.toLowerCase() === 'vuedevo@gmail.com' &&
      !authStore.otpVerified)
);

const isAddAccountMode = computed(() => route.query.mode === 'add-account');

function getAccountInitials(nameOrEmail: string): string {
  const clean = (nameOrEmail || 'U').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase();
}

async function handleQuickSwitchFromAuth(targetUid: string) {
  const ok = await authStore.switchAccount(targetUid);
  if (ok) {
    const defaultTarget = authStore.isSuperAdmin ? '/control-panel' : '/dashboard';
    router.push(defaultTarget);
  }
}

onMounted(() => {
  authStore.clearError();
});

watch(activeTab, () => {
  authStore.clearError();
  showPassword.value = false;
  showConfirmPassword.value = false;
});

function cycleTheme() {
  const modes: ThemeMode[] = ['light', 'dark', 'system'];
  const next = modes[(modes.indexOf(themeStore.themeMode) + 1) % modes.length];
  themeStore.setTheme(next);
}

function toggleLanguage() {
  themeStore.setLocale(locale.value === 'id' ? 'en' : 'id');
}

async function handleEmailSubmit() {
  try {
    if (activeTab.value === 'login') {
      const res = await authStore.loginWithEmail(email.value, password.value);
      if (res.requiresOtp) {
        router.replace({ path: '/auth', query: { step: 'otp', redirect: '/control-panel' } });
        return;
      }
      const defaultTarget = authStore.isSuperAdmin ? '/control-panel' : '/dashboard';
      const redirectPath = (route.query.redirect as string) || defaultTarget;
      const forwardQuery: Record<string, string> = {};
      if (route.query.action) forwardQuery.action = String(route.query.action);
      if (route.query.plan) forwardQuery.plan = String(route.query.plan);
      router.push({ path: redirectPath, query: forwardQuery });
    } else if (activeTab.value === 'register') {
      const res = await authStore.registerWithEmail(
        displayName.value,
        email.value,
        password.value,
        username.value
      );
      if (res.requiresOtp) {
        router.replace({ path: '/auth', query: { step: 'otp', redirect: '/control-panel' } });
        return;
      }
      const defaultTarget = authStore.isSuperAdmin ? '/control-panel' : '/dashboard';
      const redirectPath = (route.query.redirect as string) || defaultTarget;
      const forwardQuery: Record<string, string> = {};
      if (route.query.action) forwardQuery.action = String(route.query.action);
      if (route.query.plan) forwardQuery.plan = String(route.query.plan);
      router.push({ path: redirectPath, query: forwardQuery });
    } else if (activeTab.value === 'reset') {
      if (password.value.length < 6) {
        notificationStore.notifyError(
          'Validasi Kata Sandi Gagal',
          'Kata sandi baru wajib terdiri dari minimal 6 karakter.'
        );
        return;
      }
      if (password.value !== confirmPassword.value) {
        notificationStore.notifyError(
          'Konfirmasi Kata Sandi Tidak Cocok',
          'Kata sandi baru dan konfirmasi kata sandi baru tidak sama.'
        );
        return;
      }
      const ok = await authStore.resetUserPassword(email.value, password.value);
      if (ok) {
        password.value = '';
        confirmPassword.value = '';
        activeTab.value = 'login';
      }
    }
  } catch {
    // Error handled in store
  }
}

async function handleGoogleLogin() {
  try {
    const res = await authStore.loginWithGoogle();
    if (res.requiresOtp) {
      router.replace({ path: '/auth', query: { step: 'otp', redirect: '/control-panel' } });
      return;
    }
    const defaultTarget = authStore.isSuperAdmin ? '/control-panel' : '/dashboard';
    const redirectPath = (route.query.redirect as string) || defaultTarget;
    const forwardQuery: Record<string, string> = {};
    if (route.query.action) forwardQuery.action = String(route.query.action);
    if (route.query.plan) forwardQuery.plan = String(route.query.plan);
    router.push({ path: redirectPath, query: forwardQuery });
  } catch {
    // Error handled in store
  }
}

async function handleVerifyOtp() {
  try {
    const ok = await authStore.verifySuperAdminOtp(otpCode.value);
    if (ok) {
      const target = (route.query.redirect as string) || '/control-panel';
      router.push(target);
    }
  } catch {
    // Error handled in store
  }
}

async function handleDirectBypassOtp() {
  try {
    const ok = await authStore.verifySuperAdminOtp('BYPASS');
    if (ok) {
      const target = (route.query.redirect as string) || '/control-panel';
      router.push(target);
    }
  } catch {
    // Error handled in store
  }
}

async function handleResendOtp() {
  try {
    const res = await authStore.requestSuperAdminOtp();
    if (res.autoVerified || !authStore.requiresOtp) {
      const target = (route.query.redirect as string) || '/control-panel';
      router.push(target);
    }
  } catch {
    // Error handled in store
  }
}

async function cancelOtpAndLogout() {
  await authStore.logout();
  otpCode.value = '';
  router.replace('/auth');
}
</script>

<template>
  <div class="min-h-screen flex flex-col justify-between bg-slate-50 dark:bg-slate-950 px-2 sm:px-6 py-4 sm:py-8">
    <!-- Top Minimal Bar -->
    <header class="w-full max-w-5xl mx-auto flex items-center justify-between gap-2 px-1 sm:px-0 py-2">
      <div class="flex items-center gap-2 sm:gap-3 shrink-0">
        <RouterLink
          to="/"
          class="flex items-center gap-2 group hover:opacity-90 transition-opacity"
          title="Ke Halaman Utama (Landing Page)"
        >
          <div
            v-if="themeStore.appLogoUrl"
            class="h-10 w-10 rounded-xl overflow-hidden flex items-center justify-center shrink-0"
          >
            <img
              :src="themeStore.appLogoUrl"
              alt="Logo Sisa Uang"
              class="h-9 w-9 object-contain"
            />
          </div>
          <div
            v-else
            class="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs"
            aria-label="Logo Sisa Uang"
          >
            <Wallet class="w-5 h-5" />
          </div>
          <span class="hidden sm:inline font-bold text-sm tracking-tight text-slate-900 dark:text-slate-100">
            Sisa Uang
          </span>
        </RouterLink>
      </div>
      <div class="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <PWAInstallButton variant="topbar" />
        <button
          type="button"
          class="min-h-[40px] px-2.5 sm:px-3 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-mono font-medium text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-900 transition-colors shrink-0"
          @click="toggleLanguage"
        >
          {{ locale.toUpperCase() }}
        </button>
        <button
          type="button"
          class="min-h-[40px] px-2.5 sm:px-3 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-900 flex items-center gap-1.5 transition-colors shrink-0 whitespace-nowrap"
          @click="cycleTheme"
        >
          <Sun v-if="themeStore.themeMode === 'light'" class="w-4 h-4 shrink-0" />
          <Moon v-else-if="themeStore.themeMode === 'dark'" class="w-4 h-4 shrink-0" />
          <Monitor v-else class="w-4 h-4 shrink-0" />
          <span>{{ t(`theme.${themeStore.themeMode}`) }}</span>
        </button>
      </div>
    </header>

    <!-- Main Auth Card Container -->
    <div class="w-full max-w-xl mx-auto my-4 sm:my-6">
      <!-- STEP 2: Exclusive Super Admin Email Verification Code (OTP) Screen -->
      <div
        v-if="isOtpStep"
        class="rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-8 shadow-xs space-y-6"
      >
        <div class="space-y-2">
          <div class="w-11 h-11 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <ShieldCheck class="w-6 h-6" />
          </div>
          <h1 class="text-2xl font-display italic text-slate-900 dark:text-slate-100">
            {{ t('auth.otpTitle') }}
          </h1>
          <p class="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            {{ t('auth.otpSubtitle') }}
            <strong class="text-slate-900 dark:text-slate-100 font-mono">
              {{ authStore.user?.email || 'vuedevo@gmail.com' }}
            </strong>
          </p>
        </div>

        <form class="space-y-4" @submit.prevent="handleVerifyOtp">
          <input
            v-model="otpCode"
            type="text"
            inputmode="numeric"
            maxlength="6"
            required
            placeholder="Kode Verifikasi 6 Digit (000000)"
            class="w-full min-h-[54px] px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950 text-center text-2xl font-mono font-semibold tracking-[0.35em] tabular-nums text-slate-900 dark:text-slate-100 placeholder:text-sm placeholder:tracking-normal placeholder:font-sans focus:outline-none focus:border-emerald-600"
          />

          <p v-if="authStore.error" class="text-xs text-rose-600 dark:text-rose-400">
            {{ authStore.error }}
          </p>

          <button
            type="submit"
            :disabled="authStore.isLoading || otpCode.trim().length < 6"
            class="w-full min-h-[48px] px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
          >
            <span>{{ t('auth.verifyOtpBtn') }}</span>
            <ArrowRight class="w-4 h-4" />
          </button>

          <button
            type="button"
            :disabled="authStore.isLoading"
            class="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            @click="handleDirectBypassOtp"
          >
            <span>Masuk Langsung ke Control Panel (Tanpa OTP Email)</span>
            <ArrowRight class="w-3.5 h-3.5" />
          </button>
        </form>

        <div class="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
          <button
            type="button"
            class="min-h-[40px] text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
            @click="cancelOtpAndLogout"
          >
            {{ t('auth.backToLogin') }}
          </button>
          <button
            type="button"
            class="min-h-[40px] flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400 hover:underline"
            @click="handleResendOtp"
          >
            <RefreshCw class="w-3.5 h-3.5" />
            <span>{{ t('auth.resendOtpBtn') }}</span>
          </button>
        </div>
      </div>

      <!-- STEP 1: Standard Login / Manual Registration / Reset Password / Google OAuth Card -->
      <div
        v-else
        class="rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-8 shadow-xs space-y-6"
      >
        <!-- Active Session Banner when opening /auth?mode=add-account -->
        <div
          v-if="isAddAccountMode && authStore.isAuthenticated && authStore.user"
          class="rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/40 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
        >
          <div class="text-xs text-emerald-900 dark:text-emerald-200">
            <span class="font-bold">Mode Tambah Multi-Akun:</span> Masuk atau daftar akun lain untuk mempermudah berpindah akun tanpa perlu login ulang.
          </div>
          <button
            type="button"
            class="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shrink-0 transition-colors cursor-pointer"
            @click="router.push(authStore.isSuperAdmin ? '/control-panel' : '/dashboard')"
          >
            Kembali ke {{ authStore.user.displayName }}
          </button>
        </div>

        <!-- Notice: User redirected here to login prior to SisaUang Pro checkout -->
        <div
          v-if="route.query.action === 'checkout'"
          class="rounded-2xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50/90 dark:bg-emerald-950/40 p-4 space-y-1.5"
        >
          <div class="flex items-center gap-2">
            <ShieldCheck class="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <h4 class="text-xs sm:text-sm font-bold text-emerald-950 dark:text-emerald-200">
              Autentikasi Akun untuk SisaUang Pro
            </h4>
          </div>
          <p class="text-xs text-emerald-900/90 dark:text-emerald-300/90 leading-relaxed">
            Silakan masuk atau daftarkan akun Anda terlebih dahulu. Setelah berhasil masuk, Anda akan langsung dikembalikan ke portal pembayaran dengan lisensi yang otomatis terhubung ke akun Anda.
          </p>
        </div>

        <!-- Back to Landing Page link inside card -->
        <div class="flex items-center justify-between pb-1">
          <RouterLink
            to="/"
            class="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors group"
          >
            <ArrowLeft class="w-3.5 h-3.5 transition-transform group-hover:-translate-x-1 shrink-0" />
            <span>Ke Halaman Utama (Landing Page)</span>
          </RouterLink>
        </div>

        <div class="space-y-1.5">
          <h1 class="text-2xl sm:text-3xl font-display italic text-slate-900 dark:text-slate-100">
            {{
              isAddAccountMode
                ? 'Tambah Akun Pengguna'
                : activeTab === 'login'
                  ? t('auth.welcomeBack')
                  : activeTab === 'register'
                    ? t('auth.createAccountTitle')
                    : 'Reset Kata Sandi'
            }}
          </h1>
          <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
            {{
              activeTab === 'reset'
                ? 'Masukkan email atau username terdaftar beserta kata sandi baru untuk memulihkan akses akun Anda.'
                : t('auth.subtitle')
            }}
          </p>
        </div>

        <!-- Saved Multi-Accounts Quick Switcher (shown if browser has saved accounts) -->
        <div
          v-if="authStore.savedAccounts.length > 0 && activeTab === 'login'"
          class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3.5 space-y-2.5"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Akun Tersimpan di Perangkat Ini ({{ authStore.savedAccounts.length }})
            </span>
            <span class="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
              Klik untuk beralih cepat
            </span>
          </div>
          <div class="space-y-1.5 max-h-44 overflow-y-auto pr-0.5">
            <div
              v-for="acc in authStore.savedAccounts"
              :key="acc.user.uid"
              class="flex items-center justify-between gap-2 p-2 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-emerald-500/60 transition-colors"
            >
              <button
                type="button"
                class="flex-1 min-w-0 flex items-center gap-2.5 text-left cursor-pointer"
                @click="handleQuickSwitchFromAuth(acc.user.uid)"
              >
                <div class="w-8 h-8 rounded-lg bg-emerald-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
                  {{ getAccountInitials(acc.user.displayName || acc.user.email) }}
                </div>
                <div class="min-w-0 flex-1">
                  <div class="text-xs font-bold text-slate-900 dark:text-slate-100 truncate flex items-center gap-1.5">
                    <span class="truncate">{{ acc.user.displayName }}</span>
                    <span
                      v-if="authStore.user?.uid === acc.user.uid && authStore.isAuthenticated"
                      class="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 text-[9px] font-bold shrink-0"
                    >
                      AKTIF
                    </span>
                  </div>
                  <div class="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                    @{{ acc.user.username }} · {{ acc.user.email }}
                  </div>
                </div>
              </button>
              <button
                type="button"
                class="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors shrink-0 cursor-pointer"
                title="Hapus dari daftar akun tersimpan"
                @click="authStore.removeSavedAccount(acc.user.uid)"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>

        <!-- Segmented Login / Register / Reset Password Switcher -->
        <div class="grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-slate-800/90 rounded-xl">
          <button
            type="button"
            class="min-h-[42px] px-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap"
            :class="
              activeTab === 'login'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-white/50 dark:hover:bg-slate-700/40'
            "
            @click="activeTab = 'login'"
          >
            {{ t('auth.loginTab') }}
          </button>
          <button
            type="button"
            class="min-h-[42px] px-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap"
            :class="
              activeTab === 'register'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-white/50 dark:hover:bg-slate-700/40'
            "
            @click="activeTab = 'register'"
          >
            {{ t('auth.registerTab') }}
          </button>
          <button
            type="button"
            class="min-h-[42px] px-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap"
            :class="
              activeTab === 'reset'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-white/50 dark:hover:bg-slate-700/40'
            "
            @click="activeTab = 'reset'"
          >
            Reset Sandi
          </button>
        </div>

        <!-- Google Sign-In Button (Shown on Login & Register tabs) -->
        <template v-if="activeTab !== 'reset'">
          <button
            type="button"
            :disabled="authStore.isLoading"
            class="w-full min-h-[48px] px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/70 text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center justify-center gap-2.5 transition-colors"
            @click="handleGoogleLogin"
          >
            <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.79-.07-1.54-.19-2.27h-11.3v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82Z"
              />
              <path
                fill="#34A853"
                d="M12.255 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96h-3.98v3.09C3.515 21.3 7.615 24 12.255 24Z"
              />
              <path
                fill="#FBBC05"
                d="M5.525 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62h-3.98a11.86 11.86 0 0 0 0 10.76l3.98-3.09Z"
              />
              <path
                fill="#EA4335"
                d="M12.255 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C18.205 1.19 15.495 0 12.255 0c-4.64 0-8.74 2.7-10.71 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96Z"
              />
            </svg>
            <span>{{ t('auth.googleBtn') }}</span>
          </button>

          <div class="relative flex items-center justify-center">
            <div class="border-t border-slate-200 dark:border-slate-800 w-full"></div>
            <span class="bg-white dark:bg-slate-900 px-3 text-[11px] text-slate-400 whitespace-nowrap">
              {{ t('auth.orDivider') }}
            </span>
            <div class="border-t border-slate-200 dark:border-slate-800 w-full"></div>
          </div>
        </template>

        <!-- Email / Username & Password Form (Login, Register & Reset Password) -->
        <form class="space-y-3.5" @submit.prevent="handleEmailSubmit">
          <div v-if="activeTab === 'register'" class="space-y-3.5">
            <div class="relative">
              <UserIcon class="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                v-model="displayName"
                type="text"
                required
                maxlength="80"
                placeholder="Nama Tampilan (Misal: Andika Pratama)"
                class="w-full min-h-[52px] pl-11 pr-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950 text-sm sm:text-base text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
              />
            </div>

            <div class="relative">
              <UserIcon class="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                v-model="username"
                type="text"
                required
                maxlength="60"
                placeholder="Username Login (Misal: andika_keluarga)"
                class="w-full min-h-[52px] pl-11 pr-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950 text-sm sm:text-base font-mono text-slate-900 dark:text-slate-100 placeholder:font-sans focus:outline-none focus:border-emerald-600"
              />
            </div>
          </div>

          <div class="relative">
            <Mail class="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              v-model="email"
              :type="activeTab === 'register' ? 'email' : 'text'"
              required
              maxlength="120"
              :placeholder="
                activeTab === 'register'
                  ? 'Alamat Email (nama@email.com)'
                  : 'Email atau Username Terdaftar'
              "
              class="w-full min-h-[52px] pl-11 pr-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950 text-sm sm:text-base text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
            />
          </div>

          <!-- Password Input (with Hide / Show Eye Toggle for Login, Register & Reset) -->
          <div class="relative">
            <Lock class="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              required
              minlength="6"
              :autocomplete="activeTab === 'login' ? 'current-password' : 'new-password'"
              :placeholder="
                activeTab === 'reset'
                  ? 'Kata Sandi Baru (Minimal 6 karakter)'
                  : t('auth.passwordLabel')
              "
              class="w-full min-h-[52px] pl-11 pr-12 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950 text-sm sm:text-base text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
            />
            <button
              type="button"
              tabindex="-1"
              class="absolute right-3.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
              :aria-label="showPassword ? 'Sembunyikan kata sandi' : 'Lihat kata sandi'"
              @click="showPassword = !showPassword"
            >
              <EyeOff v-if="showPassword" class="w-4 h-4" />
              <Eye v-else class="w-4 h-4" />
            </button>
          </div>

          <!-- Confirm New Password Input (Shown on Reset Password tab with Hide / Show Eye Toggle) -->
          <div v-if="activeTab === 'reset'" class="relative">
            <KeyRound class="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              v-model="confirmPassword"
              :type="showConfirmPassword ? 'text' : 'password'"
              required
              minlength="6"
              autocomplete="new-password"
              placeholder="Konfirmasi Kata Sandi Baru"
              class="w-full min-h-[52px] pl-11 pr-12 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950 text-sm sm:text-base text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
            />
            <button
              type="button"
              tabindex="-1"
              class="absolute right-3.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
              :aria-label="showConfirmPassword ? 'Sembunyikan konfirmasi kata sandi' : 'Lihat konfirmasi kata sandi'"
              @click="showConfirmPassword = !showConfirmPassword"
            >
              <EyeOff v-if="showConfirmPassword" class="w-4 h-4" />
              <Eye v-else class="w-4 h-4" />
            </button>
          </div>

          <!-- Quick link to Reset Password when on Login tab -->
          <div v-if="activeTab === 'login'" class="flex justify-end">
            <button
              type="button"
              class="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
              @click="activeTab = 'reset'"
            >
              Lupa / Reset Kata Sandi?
            </button>
          </div>

          <div
            v-if="authStore.error"
            class="flex items-center justify-between gap-2 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 px-3.5 py-2.5 text-xs text-rose-600 dark:text-rose-400"
          >
            <span>{{ authStore.error }}</span>
            <span
              v-if="authStore.error.includes('Terjadi kesalahan sistem')"
              class="text-[9px] font-mono text-rose-400/50 dark:text-rose-500/40 select-all shrink-0"
            >
              db-unhandled
            </span>
          </div>

          <button
            type="submit"
            :disabled="authStore.isLoading"
            class="w-full min-h-[48px] px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
          >
            <span>
              {{
                activeTab === 'login'
                  ? t('auth.loginBtn')
                  : activeTab === 'register'
                    ? t('auth.registerBtn')
                    : 'Simpan Kata Sandi Baru'
              }}
            </span>
            <ArrowRight class="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>

    <!-- Minimal Footer with Landing Page & Legal Links -->
    <footer class="w-full max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2.5 py-4 text-xs text-slate-500 dark:text-slate-400 text-center sm:text-left">
      <div>
        <span class="font-medium text-slate-700 dark:text-slate-300">Sisa Uang</span>
        <span class="mx-1.5" aria-hidden="true">·</span>
        <span>Your Finance Assistant</span>
      </div>
      <div class="flex items-center justify-center flex-wrap gap-x-3 gap-y-1">
        <RouterLink to="/" class="text-emerald-600 dark:text-emerald-400 hover:underline font-semibold flex items-center gap-1">
          <Home class="w-3.5 h-3.5 shrink-0" />
          <span>Landing Page</span>
        </RouterLink>
        <span aria-hidden="true">·</span>
        <RouterLink to="/pricing" class="hover:underline">
          Paket Harga
        </RouterLink>
        <span aria-hidden="true">·</span>
        <RouterLink to="/terms" class="hover:underline">
          Syarat &amp; Ketentuan
        </RouterLink>
        <span aria-hidden="true">·</span>
        <RouterLink to="/privacy" class="hover:underline">
          Kebijakan Privasi
        </RouterLink>
      </div>
    </footer>
  </div>
</template>
