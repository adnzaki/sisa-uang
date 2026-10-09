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
  RefreshCw,
  Sun,
  Moon,
  Monitor,
  Wallet,
} from 'lucide-vue-next';
import { useAuthStore } from '../stores/auth';
import { useThemeStore, ThemeMode } from '../stores/theme';
import PWAInstallButton from '../components/PWAInstallButton.vue';

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const themeStore = useThemeStore();

const activeTab = ref<'login' | 'register'>('login');
const email = ref('');
const username = ref('');
const password = ref('');
const displayName = ref('');
const otpCode = ref('');

const isOtpStep = computed(
  () =>
    authStore.requiresOtp ||
    (route.query.step === 'otp' &&
      authStore.user?.email.toLowerCase() === 'vuedevo@gmail.com' &&
      !authStore.otpVerified)
);

onMounted(() => {
  authStore.clearError();
});

watch(activeTab, () => {
  authStore.clearError();
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
      const defaultTarget = authStore.isSuperAdmin ? '/control-panel' : '/';
      const target = (route.query.redirect as string) || defaultTarget;
      router.push(target);
    } else {
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
      router.push(authStore.isSuperAdmin ? '/control-panel' : '/');
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
    const defaultTarget = authStore.isSuperAdmin ? '/control-panel' : '/';
    const target = (route.query.redirect as string) || defaultTarget;
    router.push(target);
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
      <div class="flex items-center shrink-0">
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

      <!-- STEP 1: Standard Login / Manual Registration / Google OAuth Card -->
      <div
        v-else
        class="rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-8 shadow-xs space-y-6"
      >
        <div class="space-y-1.5">
          <h1 class="text-2xl sm:text-3xl font-display italic text-slate-900 dark:text-slate-100">
            {{ activeTab === 'login' ? t('auth.welcomeBack') : t('auth.createAccountTitle') }}
          </h1>
          <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
            {{ t('auth.subtitle') }}
          </p>
        </div>

        <!-- Segmented Login / Register Switcher -->
        <div class="grid grid-cols-2 gap-1 p-1 bg-slate-100 dark:bg-slate-800/90 rounded-xl">
          <button
            type="button"
            class="min-h-[42px] rounded-lg text-xs font-semibold transition-colors whitespace-nowrap"
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
            class="min-h-[42px] rounded-lg text-xs font-semibold transition-colors whitespace-nowrap"
            :class="
              activeTab === 'register'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-white/50 dark:hover:bg-slate-700/40'
            "
            @click="activeTab = 'register'"
          >
            {{ t('auth.registerTab') }}
          </button>
        </div>

        <!-- Google Sign-In Button -->
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

        <!-- Email / Username & Password Form -->
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
              :type="activeTab === 'login' ? 'text' : 'email'"
              required
              maxlength="120"
              :placeholder="activeTab === 'login' ? 'Email atau Username' : 'Alamat Email (nama@email.com)'"
              class="w-full min-h-[52px] pl-11 pr-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950 text-sm sm:text-base text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
            />
          </div>

          <div class="relative">
            <Lock class="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              v-model="password"
              type="password"
              required
              minlength="6"
              :placeholder="t('auth.passwordLabel')"
              class="w-full min-h-[52px] pl-11 pr-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950 text-sm sm:text-base text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
            />
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
            <span>{{ activeTab === 'login' ? t('auth.loginBtn') : t('auth.registerBtn') }}</span>
            <ArrowRight class="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>

    <!-- Minimal Footer -->
    <footer class="w-full max-w-5xl mx-auto text-center py-3 text-xs text-slate-400 dark:text-slate-500">
      <span>Sisa Uang</span>
      <span class="mx-1.5" aria-hidden="true">·</span>
      <span>Your Finance Assistant</span>
    </footer>
  </div>
</template>
