<script setup lang="ts">
import { ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import {
  Wallet,
  Menu,
  X,
  Sun,
  Moon,
  ArrowRight,
  ShieldCheck,
  LayoutDashboard,
} from 'lucide-vue-next';
import { useAuthStore } from '../stores/auth';
import { useThemeStore } from '../stores/theme';
import { scrollToPageTop, scrollToElement } from '../utils/scroll';

const emit = defineEmits<{
  (e: 'open-checkout', plan?: 'monthly' | 'yearly'): void;
}>();

const authStore = useAuthStore();
const themeStore = useThemeStore();
const router = useRouter();

const mobileMenuOpen = ref(false);

function triggerCheckout() {
  emit('open-checkout', 'yearly');
  mobileMenuOpen.value = false;
}

function navigateToSection(sectionId: 'features' | 'pricing') {
  mobileMenuOpen.value = false;
  const currentPath = router.currentRoute.value.path;
  const isLanding = currentPath === '/' || currentPath === '/landing';

  if (isLanding) {
    if (scrollToElement(sectionId, 'smooth', 70)) {
      history.pushState(null, '', `/#${sectionId}`);
      return;
    }
  }

  router.push({ path: '/', hash: `#${sectionId}` }).then(() => {
    requestAnimationFrame(() => scrollToElement(sectionId, 'smooth', 70));
    setTimeout(() => scrollToElement(sectionId, 'smooth', 70), 80);
    setTimeout(() => scrollToElement(sectionId, 'smooth', 70), 250);
  });
}

function handlePageNavClick() {
  mobileMenuOpen.value = false;
  scrollToPageTop('instant');
}
</script>

<template>
  <header
    class="sticky top-0 z-40 w-full border-b border-slate-200/80 dark:border-slate-800/80 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md transition-colors"
  >
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex items-center justify-between h-16">
        <!-- Brand / Logo -->
        <RouterLink to="/" class="flex items-center gap-2.5 group">
          <div
            class="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform"
          >
            <Wallet class="w-5 h-5" />
          </div>
          <span class="text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            SisaUang
          </span>
        </RouterLink>

        <!-- Desktop Navigation Links -->
        <nav class="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
          <a
            href="/#features"
            @click.prevent="navigateToSection('features')"
            class="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors cursor-pointer"
          >
            Fitur
          </a>
          <a
            href="/#pricing"
            @click.prevent="navigateToSection('pricing')"
            class="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors cursor-pointer"
          >
            Paket Harga (IDR)
          </a>
          <RouterLink
            to="/terms"
            @click="handlePageNavClick"
            class="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
          >
            Syarat & Ketentuan
          </RouterLink>
          <RouterLink
            to="/refund-policy"
            @click="handlePageNavClick"
            class="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
          >
            Kebijakan Refund
          </RouterLink>
          <RouterLink
            to="/contact"
            @click="handlePageNavClick"
            class="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
          >
            Hubungi Kami
          </RouterLink>
        </nav>

        <!-- Right Side Actions -->
        <div class="flex items-center gap-3">
          <!-- Theme Toggle -->
          <button
            type="button"
            class="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            :title="themeStore.resolvedTheme === 'dark' ? 'Beralih ke Mode Terang' : 'Beralih ke Mode Gelap'"
            :aria-label="themeStore.resolvedTheme === 'dark' ? 'Beralih ke Mode Terang' : 'Beralih ke Mode Gelap'"
            @click="themeStore.toggleTheme()"
          >
            <Sun v-if="themeStore.resolvedTheme === 'dark'" class="w-4 h-4 text-amber-400" />
            <Moon v-else class="w-4 h-4 text-slate-600" />
          </button>

          <!-- If Authenticated -->
          <template v-if="authStore.isAuthenticated">
            <RouterLink
              :to="authStore.isSuperAdmin ? '/control-panel' : '/dashboard'"
              class="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold hover:opacity-90 transition-opacity"
            >
              <LayoutDashboard class="w-4 h-4" />
              <span>Buka Dashboard</span>
            </RouterLink>
          </template>

          <!-- If Guest -->
          <template v-else>
            <RouterLink
              to="/auth"
              class="hidden sm:inline-block px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
            >
              Masuk
            </RouterLink>
            <button
              type="button"
              class="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              @click="triggerCheckout"
            >
              <span>Berlangganan Pro</span>
              <ArrowRight class="w-3.5 h-3.5" />
            </button>
          </template>

          <!-- Mobile Hamburger Toggle -->
          <button
            type="button"
            class="md:hidden p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            aria-label="Toggle Menu"
            @click="mobileMenuOpen = !mobileMenuOpen"
          >
            <X v-if="mobileMenuOpen" class="w-6 h-6" />
            <Menu v-else class="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>

    <!-- Mobile Dropdown Menu -->
    <div
      v-if="mobileMenuOpen"
      class="md:hidden border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 pt-2 pb-5 space-y-3"
    >
      <nav class="flex flex-col space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200">
        <a
          href="/#features"
          class="px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer block text-sm font-medium text-slate-700 dark:text-slate-200"
          @click.prevent="navigateToSection('features')"
        >
          Fitur Utama
        </a>
        <a
          href="/#pricing"
          class="px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer block text-sm font-medium text-slate-700 dark:text-slate-200"
          @click.prevent="navigateToSection('pricing')"
        >
          Paket Harga Resmi (IDR)
        </a>
        <RouterLink
          to="/terms"
          class="px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
          @click="handlePageNavClick"
        >
          Syarat & Ketentuan Lisensi
        </RouterLink>
        <RouterLink
          to="/refund-policy"
          class="px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
          @click="handlePageNavClick"
        >
          Kebijakan Pengembalian Dana
        </RouterLink>
        <RouterLink
          to="/privacy"
          class="px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
          @click="handlePageNavClick"
        >
          Kebijakan Privasi
        </RouterLink>
        <RouterLink
          to="/contact"
          class="px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
          @click="handlePageNavClick"
        >
          Hubungi Kami & WhatsApp
        </RouterLink>
      </nav>

      <!-- Mobile Theme Toggle -->
      <div class="pt-2 border-t border-slate-100 dark:border-slate-800">
        <button
          type="button"
          class="flex items-center justify-between w-full px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-medium text-slate-700 dark:text-slate-200 cursor-pointer transition-colors"
          @click="themeStore.toggleTheme()"
        >
          <span class="text-xs font-medium">Tema Tampilan</span>
          <span class="inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
            <Sun v-if="themeStore.resolvedTheme === 'dark'" class="w-3.5 h-3.5 text-amber-400" />
            <Moon v-else class="w-3.5 h-3.5 text-slate-600" />
            <span>{{ themeStore.resolvedTheme === 'dark' ? 'Mode Gelap' : 'Mode Terang' }}</span>
          </span>
        </button>
      </div>

      <div class="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-2">
        <template v-if="authStore.isAuthenticated">
          <RouterLink
            :to="authStore.isSuperAdmin ? '/control-panel' : '/dashboard'"
            class="w-full py-2.5 px-4 text-center rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold"
            @click="mobileMenuOpen = false"
          >
            Buka Dashboard SisaUang
          </RouterLink>
        </template>
        <template v-else>
          <RouterLink
            to="/auth"
            class="w-full py-2.5 px-4 text-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold"
            @click="mobileMenuOpen = false"
          >
            Masuk ke Akun
          </RouterLink>
          <button
            type="button"
            class="w-full py-2.5 px-4 text-center rounded-xl bg-emerald-600 text-white text-xs font-semibold shadow-xs"
            @click="triggerCheckout"
          >
            Berlangganan SisaUang Pro (Rp 21.500)
          </button>
        </template>
      </div>
    </div>
  </header>
</template>
