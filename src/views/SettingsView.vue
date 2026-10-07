<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink } from 'vue-router';
import {
  Sun,
  Moon,
  Monitor,
  Globe,
  ShieldCheck,
  Database,
  Upload,
  Trash2,
  User as UserIcon,
  Save,
} from 'lucide-vue-next';
import { useThemeStore } from '../stores/theme';
import { useAuthStore } from '../stores/auth';

const { t, locale } = useI18n();
const themeStore = useThemeStore();
const authStore = useAuthStore();

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
              class="min-h-[44px] px-2 rounded-xl border text-xs font-mono font-semibold transition-colors"
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
              class="min-h-[44px] px-2 rounded-xl border text-xs font-mono font-semibold transition-colors"
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

      <form class="grid grid-cols-1 sm:grid-cols-2 gap-4" @submit.prevent="handleSaveProfile">
        <div>
          <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
            Nama Tampilan (Display Name · Bebas Spasi & Karakter)
          </label>
          <input
            v-model="profileDisplayName"
            type="text"
            required
            maxlength="80"
            placeholder="Contoh: Andika Keluarga Bahagia"
            class="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
          />
        </div>

        <div>
          <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
            Username (Dapat Digunakan untuk Login)
          </label>
          <input
            v-model="profileUsername"
            type="text"
            required
            maxlength="60"
            placeholder="Contoh: andika_keluarga"
            class="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs sm:text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
          />
        </div>

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
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-0.5 py-1.5">
          <span>Skema Database</span>
          <span class="font-mono text-slate-900 dark:text-slate-100">sisa-uang (Cloud Firestore)</span>
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
  </div>
</template>
