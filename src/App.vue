<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useRoute, useRouter, RouterLink, RouterView } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  Tags,
  PieChart,
  BarChart3,
  Settings,
  ShieldAlert,
  Users,
  Activity,
  Plus,
  Menu,
  X,
  Sun,
  Moon,
  Monitor,
  LogOut,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Globe,
  Database,
  ChevronDown,
  User,
  Sparkles,
} from 'lucide-vue-next';
import { useAuthStore } from './stores/auth';
import { useThemeStore, ThemeMode } from './stores/theme';
import { useFinanceStore } from './stores/finance';
import { useAdminStore } from './stores/admin';
import { useNotificationStore } from './stores/notification';
import QuickTransactionModal from './components/QuickTransactionModal.vue';
import AppModal from './components/AppModal.vue';
import PWAInstallButton from './components/PWAInstallButton.vue';
import OfflineIndicator from './components/OfflineIndicator.vue';
import AppUpdateBanner from './components/AppUpdateBanner.vue';
import ReleaseNotesModal from './components/ReleaseNotesModal.vue';

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const themeStore = useThemeStore();
const financeStore = useFinanceStore();
const adminStore = useAdminStore();
const notificationStore = useNotificationStore();

const mobileDrawerOpen = ref(false);
const accountMenuOpen = ref(false);
const desktopAccountMenuRef = ref<HTMLElement | null>(null);
const mobileAccountMenuRef = ref<HTMLElement | null>(null);
const deniedBannerVisible = ref(false);
const mainScrollContainer = ref<HTMLElement | null>(null);

const userInitials = computed(() => {
  const name = (authStore.user?.displayName || authStore.user?.email || 'U').trim();
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
});

function handleAccountMenuClickOutside(e: MouseEvent) {
  if (!accountMenuOpen.value) return;
  const target = e.target as Node;
  if (desktopAccountMenuRef.value && desktopAccountMenuRef.value.contains(target)) return;
  if (mobileAccountMenuRef.value && mobileAccountMenuRef.value.contains(target)) return;
  accountMenuOpen.value = false;
}

// Support mobile hardware back button to close the mobile slide-out drawer
const drawerHistoryKey = 'su_mobile_drawer';
let hasPushedDrawerHistory = false;
let isClosedByBack = false;

function handleDrawerPopState() {
  if (!mobileDrawerOpen.value) return;
  if (hasPushedDrawerHistory) {
    isClosedByBack = true;
    hasPushedDrawerHistory = false;
    mobileDrawerOpen.value = false;
  }
}

watch(mobileDrawerOpen, (isOpen) => {
  if (typeof window === 'undefined') return;
  if (isOpen) {
    isClosedByBack = false;
    try {
      const currentState = window.history.state || {};
      window.history.pushState(
        { ...currentState, __sisaUangDrawerKey: drawerHistoryKey },
        '',
        window.location.href
      );
      hasPushedDrawerHistory = true;
    } catch {
      hasPushedDrawerHistory = false;
    }
  } else {
    if (hasPushedDrawerHistory && !isClosedByBack) {
      hasPushedDrawerHistory = false;
      try {
        if (window.history.state?.__sisaUangDrawerKey === drawerHistoryKey) {
          window.history.back();
        }
      } catch {
        // Ignore
      }
    }
    isClosedByBack = false;
  }
});

function handleAppVisibilityOrFocus() {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  if (authStore.isAuthenticated && !authStore.isSuperAdmin && authStore.user?.uid) {
    void financeStore.checkAndSyncIfRemoteChanged(authStore.user.uid);
  }
}

onMounted(() => {
  themeStore.initThemeListener();
  authStore.initAuth();
  window.addEventListener('popstate', handleDrawerPopState);
  window.addEventListener('focus', handleAppVisibilityOrFocus);
  document.addEventListener('visibilitychange', handleAppVisibilityOrFocus);
  document.addEventListener('mousedown', handleAccountMenuClickOutside);
});

onBeforeUnmount(() => {
  window.removeEventListener('popstate', handleDrawerPopState);
  window.removeEventListener('focus', handleAppVisibilityOrFocus);
  document.removeEventListener('visibilitychange', handleAppVisibilityOrFocus);
  document.removeEventListener('mousedown', handleAccountMenuClickOutside);
});

watch(
  () => authStore.user?.uid,
  (uid) => {
    if (uid && authStore.isAuthenticated) {
      if (authStore.isSuperAdmin) {
        financeStore.cleanupListeners();
        if (authStore.canAccessControlPanel) {
          adminStore.startRealtimeMonitoring();
        }
      } else {
        adminStore.stopRealtimeMonitoring();
        financeStore.initFinanceData(uid);
      }
    } else {
      financeStore.cleanupListeners();
      adminStore.stopRealtimeMonitoring();
    }
  },
  { immediate: true }
);

watch(
  () => authStore.canAccessControlPanel,
  (allowed) => {
    if (allowed && authStore.isSuperAdmin) {
      adminStore.startRealtimeMonitoring();
    }
  }
);

watch(
  () => route.fullPath,
  () => {
    mobileDrawerOpen.value = false;
    accountMenuOpen.value = false;
    if (mainScrollContainer.value) {
      mainScrollContainer.value.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    }
    if (route.query.denied === 'admin_only') {
      deniedBannerVisible.value = true;
    }
    if (authStore.isAuthenticated && !authStore.isSuperAdmin && authStore.user?.uid) {
      void financeStore.checkAndSyncIfRemoteChanged(authStore.user.uid);
    }
  }
);

watch(
  () => financeStore.selectedPeriod,
  () => {
    if (authStore.isAuthenticated && !authStore.isSuperAdmin && authStore.user?.uid) {
      void financeStore.checkAndSyncIfRemoteChanged(authStore.user.uid);
    }
  }
);

const isAuthRoute = computed(() => route.path === '/auth');

// Regular user navigation items (Personal Finance Management - Desktop Sidebar & Mobile Sidebar Drawer)
const userNavItems = computed(() => [
  { name: t('nav.dashboard'), path: '/', icon: LayoutDashboard },
  { name: t('nav.transactions'), path: '/transactions', icon: ArrowLeftRight },
  { name: t('nav.wallets'), path: '/wallets', icon: Wallet },
  { name: t('nav.ownership'), path: '/ownership', icon: Users },
  { name: t('nav.categories'), path: '/categories', icon: Tags },
  { name: t('nav.budgets'), path: '/budgets', icon: PieChart },
  { name: t('nav.analytics'), path: '/analytics', icon: BarChart3 },
  { name: t('nav.settings'), path: '/settings', icon: Settings },
]);

// Super Admin navigation items (Strictly User Management, Activity Logs, Alerts, and Settings)
const adminNavItems = computed(() => [
  {
    name: t('admin.userManagement'),
    path: '/control-panel?tab=users',
    tab: 'users',
    icon: Users,
  },
  {
    name: t('admin.activityLogs'),
    path: '/control-panel?tab=logs',
    tab: 'logs',
    icon: Activity,
  },
  {
    name: t('admin.securityAlerts'),
    path: '/control-panel?tab=alerts',
    tab: 'alerts',
    icon: ShieldAlert,
    badge: adminStore.openAlertsCount,
  },
  {
    name: t('nav.database'),
    path: '/database',
    tab: null,
    icon: Database,
  },
  {
    name: t('nav.settings'),
    path: '/settings',
    tab: null,
    icon: Settings,
  },
]);

function isAdminNavActive(item: { path: string; tab: string | null }): boolean {
  if (item.tab === null) {
    return route.path === item.path;
  }
  if (route.path !== '/control-panel') return false;
  const currentTab = (route.query.tab as string) || 'users';
  return currentTab === item.tab;
}

function cycleTheme() {
  const order: ThemeMode[] = ['light', 'dark', 'system'];
  const nextIdx = (order.indexOf(themeStore.themeMode) + 1) % order.length;
  themeStore.setTheme(order[nextIdx]);
}

function toggleLocale() {
  const next = locale.value === 'id' ? 'en' : 'id';
  themeStore.setLocale(next);
}

async function handleLogout() {
  mobileDrawerOpen.value = false;
  accountMenuOpen.value = false;
  await authStore.logout();
  router.push('/auth');
}
</script>

<template>
  <div class="h-dvh max-h-dvh w-full max-w-full overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
    <!-- Instant Suspicious Activity Notification Banner (Super Admin Real-Time Alert) -->
    <div
      v-if="adminStore.instantAlertNotification && authStore.isSuperAdmin"
      class="shrink-0 bg-rose-600 text-white px-4 py-3 shadow-md z-50 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
    >
      <div class="flex items-start sm:items-center gap-2.5">
        <AlertTriangle class="w-5 h-5 shrink-0 mt-0.5 sm:mt-0" />
        <div class="text-xs sm:text-sm">
          <span class="font-semibold">{{ adminStore.instantAlertNotification.title }}</span>
          <span class="mx-1.5 opacity-75">·</span>
          <span class="opacity-95">{{ adminStore.instantAlertNotification.description }}</span>
        </div>
      </div>
      <div class="flex items-center gap-2 self-end sm:self-center shrink-0">
        <RouterLink
          to="/control-panel?tab=alerts"
          class="px-3 py-1.5 rounded-lg bg-white text-rose-700 text-xs font-semibold whitespace-nowrap hover:bg-rose-50 transition-colors"
        >
          Lihat Peringatan
        </RouterLink>
        <button
          type="button"
          class="px-2.5 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-800 text-white text-xs font-medium whitespace-nowrap transition-colors"
          @click="adminStore.dismissInstantAlertBanner()"
        >
          Tutup
        </button>
      </div>
    </div>

    <!-- ===================================================================== -->
    <!-- GLOBAL FLOATING POPUP BANNER STACK (Success & Error Notifications)   -->
    <!-- ===================================================================== -->
    <div
      v-if="notificationStore.banners.length > 0"
      class="fixed top-4 inset-x-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-full sm:max-w-xl z-[80] flex flex-col gap-2.5 pointer-events-none"
    >
      <div
        v-for="banner in notificationStore.banners"
        :key="banner.id"
        class="pointer-events-auto rounded-2xl border p-4 shadow-2xl backdrop-blur-md flex items-start justify-between gap-3 transition-all"
        :class="
          banner.type === 'success'
            ? 'border-emerald-500/80 bg-emerald-950/95 text-white'
            : banner.type === 'warning'
            ? 'border-amber-500/80 bg-amber-950/95 text-white'
            : 'border-rose-500/80 bg-rose-950/95 text-white'
        "
        role="alert"
      >
        <div class="flex items-start gap-3 min-w-0">
          <div
            class="w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 mt-0.5"
            :class="
              banner.type === 'success'
                ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300'
                : banner.type === 'warning'
                ? 'bg-amber-500/20 border-amber-400/40 text-amber-300'
                : 'bg-rose-500/20 border-rose-400/40 text-rose-300'
            "
          >
            <CheckCircle2 v-if="banner.type === 'success'" class="w-5 h-5" />
            <AlertTriangle v-else-if="banner.type === 'warning'" class="w-5 h-5" />
            <AlertCircle v-else class="w-5 h-5" />
          </div>

          <div class="space-y-1 text-xs min-w-0">
            <div
              class="font-semibold uppercase tracking-wider text-[11px]"
              :class="
                banner.type === 'success'
                  ? 'text-emerald-300'
                  : banner.type === 'warning'
                  ? 'text-amber-300'
                  : 'text-rose-300'
              "
            >
              {{ banner.title }}
            </div>
            <p class="text-xs sm:text-sm font-semibold text-white leading-relaxed break-words">
              {{ banner.message }}
            </p>
            <p
              v-if="banner.detail"
              class="text-[11px] font-mono leading-relaxed break-words"
              :class="
                banner.type === 'success'
                  ? 'text-emerald-200/90'
                  : banner.type === 'warning'
                  ? 'text-amber-200/90'
                  : 'text-rose-200/90'
              "
            >
              {{ banner.detail }}
            </p>
            <div
              v-if="banner.errorCode"
              class="pt-0.5 flex items-center justify-between gap-2 select-all"
            >
              <span class="text-[9px] font-mono tracking-wider text-rose-300/35">
                code: {{ banner.errorCode }}
              </span>
            </div>
            <div v-if="banner.actionRoute && banner.actionLabel" class="pt-1.5">
              <RouterLink
                :to="banner.actionRoute"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-semibold transition-colors"
                @click="notificationStore.dismissBanner(banner.id)"
              >
                <span>{{ banner.actionLabel }}</span>
              </RouterLink>
            </div>
          </div>
        </div>

        <button
          type="button"
          class="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors shrink-0"
          title="Tutup notifikasi"
          @click="notificationStore.dismissBanner(banner.id)"
        >
          <X class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- Middleware Access Denied Notice -->
    <div
      v-if="deniedBannerVisible"
      class="shrink-0 bg-amber-600 text-white px-4 py-2.5 text-xs flex items-center justify-between gap-3 z-40"
    >
      <span>
        Akses ke endpoint <strong>/control-panel</strong> ditolak oleh middleware: Halaman tersebut hanya dapat diakses oleh akun ber-role Administrator (vuedevo@gmail.com).
      </span>
      <button
        type="button"
        class="underline font-semibold whitespace-nowrap"
        @click="deniedBannerVisible = false"
      >
        Mengerti
      </button>
    </div>

    <!-- Blocked Account Fullscreen Interception -->
    <div
      v-if="authStore.user && authStore.user.status === 'blocked'"
      class="flex-1 min-h-0 overflow-y-auto flex items-center justify-center p-6"
    >
      <div class="max-w-md w-full rounded-2xl border border-rose-200 dark:border-rose-900/60 bg-white dark:bg-slate-900 p-6 text-center space-y-4">
        <div class="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
          <ShieldAlert class="w-6 h-6" />
        </div>
        <h1 class="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Akses Akun Diblokir
        </h1>
        <p class="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
          Akun <strong>{{ authStore.user.email }}</strong> sedang dinonaktifkan sementara oleh Super Administrator melalui Control Panel.
        </p>
        <button
          type="button"
          class="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold hover:opacity-90 transition-opacity"
          @click="handleLogout"
        >
          Keluar dari Akun
        </button>
      </div>
    </div>

    <!-- Auth View (Login / Register / Super Admin OTP) -->
    <div
      v-else-if="isAuthRoute || !authStore.isAuthenticated"
      class="flex-1 min-h-0 w-full overflow-y-auto overflow-x-hidden"
    >
      <RouterView />
    </div>

    <!-- Main Authenticated Workspace (Fixed Desktop Sidebar + Fixed Top Navbar + Scrollable Main Content) -->
    <div v-else class="flex-1 flex min-h-0 w-full max-w-full overflow-hidden">
      <!-- Desktop Left Sidebar (lg:flex) - Hidden by default on Mobile & Tablet (< lg), locked on Desktop -->
      <aside
        class="hidden lg:flex lg:w-68 shrink-0 flex-col border-r border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900/95 h-full max-h-full overflow-y-auto p-4 justify-between gap-4 z-30"
      >
        <!-- Top & Scrollable Menu Area -->
        <div class="space-y-4">
          <!-- Brand Logo Container (Replaces Sisa Uang text in Sidebar) -->
          <div class="flex items-center justify-between gap-2 px-1 pt-0.5">
            <RouterLink
              :to="authStore.isSuperAdmin ? '/control-panel' : '/'"
              class="flex-1 min-w-0 flex items-center"
              aria-label="Logo Aplikasi"
            >
              <div
                v-if="themeStore.appLogoUrl"
                class="h-11 w-full rounded-xl overflow-hidden flex items-center justify-start px-2"
              >
                <img
                  :src="themeStore.appLogoUrl"
                  alt="Logo Aplikasi"
                  class="max-h-9 w-auto object-contain"
                />
              </div>
              <div
                v-else
                class="h-11 w-full rounded-xl border border-dashed border-emerald-500/40 dark:border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/30 px-3 flex items-center gap-2.5 group hover:border-emerald-500 transition-colors"
              >
                <div class="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                  <Wallet class="w-4 h-4" />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 truncate">
                    Sisa Uang
                  </div>
                  <div class="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                    Your Finance Assistant
                  </div>
                </div>
              </div>
            </RouterLink>
            <button
              type="button"
              class="min-h-[38px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-mono font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
              @click="toggleLocale"
            >
              {{ locale.toUpperCase() }}
            </button>
          </div>

          <!-- Sisa Uang Compact Anchor Card (ONLY for Regular Users, hidden for Super Admin) -->
          <div
            v-if="!authStore.isSuperAdmin"
            class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3.5 space-y-1.5"
          >
            <div class="text-xs text-slate-500 dark:text-slate-400">
              {{ t('app.sisaUangLabel') }}
            </div>
            <div class="text-base font-money font-semibold text-emerald-600 dark:text-emerald-400">
              {{ themeStore.formatMoney(financeStore.sisaUangBulanIni) }}
            </div>
            <div class="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <span>{{ t('app.safeDailySpend') }}</span>
              <span aria-hidden="true">·</span>
              <span class="font-money font-medium text-slate-700 dark:text-slate-300">
                {{ themeStore.formatMoney(financeStore.safeDailySpend) }}/hr
              </span>
            </div>
          </div>

          <!-- Super Admin Identity Card (ONLY for Super Admin) -->
          <div
            v-else
            class="rounded-2xl border border-emerald-200/80 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/30 p-3.5 space-y-1"
          >
            <div class="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              Super Administrator
            </div>
            <div class="text-[11px] text-slate-600 dark:text-slate-400">
              Pengawasan pengguna & keamanan sistem real-time
            </div>
          </div>

          <!-- Navigation Links: Strictly separated by role -->
          <nav v-if="!authStore.isSuperAdmin" class="space-y-1">
            <RouterLink
              v-for="item in userNavItems"
              :key="item.path"
              :to="item.path"
              class="min-h-[42px] flex items-center gap-3 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium transition-colors"
              :class="
                route.path === item.path
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/70'
              "
            >
              <component :is="item.icon" class="w-4 h-4 shrink-0" />
              <span class="truncate">{{ item.name }}</span>
            </RouterLink>
          </nav>

          <!-- Super Admin Navigation Menu (No Finance Menus) -->
          <nav v-else class="space-y-1">
            <RouterLink
              v-for="item in adminNavItems"
              :key="item.path"
              :to="item.path"
              class="min-h-[42px] flex items-center justify-between px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium transition-colors"
              :class="
                isAdminNavActive(item)
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/70'
              "
            >
              <div class="flex items-center gap-3 truncate">
                <component :is="item.icon" class="w-4 h-4 shrink-0" />
                <span class="truncate">{{ item.name }}</span>
              </div>
              <span
                v-if="item.badge && item.badge > 0"
                class="text-xs font-mono tabular-nums font-semibold"
              >
                {{ item.badge }}
              </span>
            </RouterLink>
          </nav>
        </div>

        <!-- Sidebar Bottom Controls: Install Button & Application Version -->
        <div class="space-y-2.5 pt-3 border-t border-slate-200/80 dark:border-slate-800 shrink-0">
          <!-- In-App PWA Install Button -->
          <PWAInstallButton variant="sidebar" />

          <!-- Application Version & Release Notes Trigger at very bottom of Desktop Sidebar -->
          <button
            type="button"
            class="w-full py-1.5 px-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/80 text-center text-[11px] font-mono text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 flex items-center justify-center gap-1.5 transition-colors"
            title="Lihat Informasi Rilis &amp; Changelog v1.0.0-rc.4"
            @click="notificationStore.openChangelogModal()"
          >
            <Sparkles class="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>Versi 1.0.0-rc.4 · Info Rilis</span>
          </button>
        </div>
      </aside>

      <!-- Main Column (Fixed Top Header + Independent Scrollable Content Area) -->
      <div class="flex-1 flex flex-col min-w-0 max-w-full h-full max-h-full overflow-hidden">
        <!-- Desktop Top Bar (lg+): Permanently pinned at top of Main Column -->
        <header
          class="hidden lg:flex shrink-0 items-center justify-between px-8 py-3.5 border-b border-slate-200/80 dark:border-slate-800/80 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md z-30"
        >
          <RouterLink
            :to="authStore.isSuperAdmin ? '/control-panel' : '/'"
            class="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap"
          >
            Sisa Uang
          </RouterLink>

          <div class="flex items-center gap-2.5">
            <!-- "+ Catat Transaksi" ONLY for Regular Users (hidden on /transactions page) -->
            <button
              v-if="!authStore.isSuperAdmin && route.path !== '/transactions'"
              type="button"
              class="min-h-[40px] px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors whitespace-nowrap flex items-center gap-1.5"
              @click="financeStore.openAddTransactionModal()"
            >
              <Plus class="w-4 h-4" />
              <span>{{ t('dashboard.addTransaction') }}</span>
            </button>

            <!-- Unified User Account Menu at Rightmost Corner of Desktop Topbar -->
            <div ref="desktopAccountMenuRef" class="relative">
              <button
                type="button"
                class="min-h-[40px] pl-2 pr-3 py-1.5 rounded-xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/70 hover:border-emerald-600/60 dark:hover:border-emerald-500/50 flex items-center gap-2.5 transition-colors"
                :aria-expanded="accountMenuOpen"
                aria-label="Menu Akun Pengguna"
                @click="accountMenuOpen = !accountMenuOpen"
              >
                <div class="w-7 h-7 rounded-lg bg-emerald-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                  {{ userInitials }}
                </div>
                <span class="max-w-[140px] text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">
                  {{ authStore.user?.displayName || 'Akun Saya' }}
                </span>
                <ChevronDown
                  class="w-3.5 h-3.5 text-slate-400 transition-transform duration-150 shrink-0"
                  :class="accountMenuOpen ? 'rotate-180 text-emerald-600 dark:text-emerald-400' : ''"
                />
              </button>

              <!-- Account Dropdown Popover -->
              <Transition name="dropdown">
                <div
                  v-if="accountMenuOpen"
                  class="
                    absolute right-0 mt-2 w-72 rounded-2xl border border-slate-200 dark:border-slate-800
                    bg-white dark:bg-slate-900 shadow-2xl p-3.5 space-y-3.5 z-50
                  "
                >
                  <!-- User Info -->
                  <div class="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                    <div class="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 font-bold text-xs flex items-center justify-center shrink-0 border border-emerald-200/60 dark:border-emerald-900/50">
                      {{ userInitials }}
                    </div>
                    <div class="min-w-0 flex-1">
                      <div class="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                        {{ authStore.user?.displayName }}
                      </div>
                      <div class="text-[11px] text-slate-500 dark:text-slate-400 truncate font-mono">
                        {{ authStore.user?.email }}
                      </div>
                      <div class="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
                        {{ authStore.isSuperAdmin ? 'Super Administrator' : 'Pengguna Personal' }}
                      </div>
                    </div>
                  </div>

                  <!-- Theme Options 3-Way Segmented Control -->
                  <div class="space-y-1.5">
                    <div class="text-[11px] font-medium text-slate-500 dark:text-slate-400 px-0.5">
                      {{ t('theme.label') }}
                    </div>
                    <div class="grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                      <button
                        type="button"
                        class="min-h-[34px] rounded-lg text-xs font-medium flex items-center justify-center gap-1 transition-colors whitespace-nowrap"
                        :class="
                          themeStore.themeMode === 'light'
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                        "
                        @click="themeStore.setTheme('light')"
                      >
                        <Sun class="w-3.5 h-3.5" />
                        <span>{{ t('theme.light') }}</span>
                      </button>
                      <button
                        type="button"
                        class="min-h-[34px] rounded-lg text-xs font-medium flex items-center justify-center gap-1 transition-colors whitespace-nowrap"
                        :class="
                          themeStore.themeMode === 'dark'
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                        "
                        @click="themeStore.setTheme('dark')"
                      >
                        <Moon class="w-3.5 h-3.5" />
                        <span>{{ t('theme.dark') }}</span>
                      </button>
                      <button
                        type="button"
                        class="min-h-[34px] rounded-lg text-xs font-medium flex items-center justify-center gap-1 transition-colors whitespace-nowrap"
                        :class="
                          themeStore.themeMode === 'system'
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                        "
                        @click="themeStore.setTheme('system')"
                      >
                        <Monitor class="w-3.5 h-3.5" />
                        <span>{{ t('theme.system') }}</span>
                      </button>
                    </div>
                  </div>

                  <!-- Release Notes / What's New Button -->
                  <button
                    type="button"
                    class="w-full min-h-[38px] px-3.5 py-2 rounded-xl border border-emerald-200/80 dark:border-emerald-900/60 bg-emerald-50/60 dark:bg-emerald-950/30 hover:bg-emerald-100/70 dark:hover:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center justify-between gap-2 transition-colors"
                    @click="accountMenuOpen = false; notificationStore.openChangelogModal()"
                  >
                    <span class="flex items-center gap-2 truncate">
                      <Sparkles class="w-3.5 h-3.5 shrink-0" />
                      <span>Apa yang Baru (v1.0.0-rc.4)</span>
                    </span>
                    <span class="px-1.5 py-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-mono font-bold shrink-0">
                      BARU
                    </span>
                  </button>

                  <!-- Logout Button -->
                  <button
                    type="button"
                    class="w-full min-h-[40px] px-3.5 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-950/80 text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
                    @click="handleLogout"
                  >
                    <LogOut class="w-4 h-4 shrink-0" />
                    <span>{{ t('nav.logout') }}</span>
                  </button>
                </div>
              </Transition>
            </div>
          </div>
        </header>

        <!-- Mobile & Tablet Top App Bar (< lg) - Hamburger Menu for Slide-Out Sidebar -->
        <header
          class="lg:hidden shrink-0 z-30 h-14 px-3.5 sm:px-5 flex items-center justify-between gap-2 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80"
        >
          <button
            type="button"
            class="min-h-[44px] min-w-[44px] -ml-1.5 flex items-center justify-center rounded-xl text-slate-700 dark:text-slate-200 shrink-0 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Buka Menu Sidebar"
            @click="mobileDrawerOpen = true"
          >
            <Menu class="w-5 h-5" />
          </button>

          <!-- Empty spacer on mobile & tablet -->
          <div class="flex-1"></div>

          <div class="flex items-center gap-2 shrink-0">
            <!-- "+ Catat Transaksi" on Tablet (sm to <lg) for quick access -->
            <button
              v-if="!authStore.isSuperAdmin && route.path !== '/transactions'"
              type="button"
              class="hidden sm:flex min-h-[40px] px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors whitespace-nowrap items-center gap-1.5"
              @click="financeStore.openAddTransactionModal()"
            >
              <Plus class="w-4 h-4 shrink-0" />
              <span>{{ t('dashboard.addTransaction') }}</span>
            </button>

            <!-- Unified User Account Menu at Rightmost Corner of Mobile/Tablet Topbar -->
            <div ref="mobileAccountMenuRef" class="relative">
              <button
                type="button"
                class="min-h-[40px] pl-2 pr-2.5 py-1 rounded-xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/70 hover:border-emerald-600/60 flex items-center gap-1.5 sm:gap-2 transition-colors"
                :aria-expanded="accountMenuOpen"
                aria-label="Menu Akun Pengguna"
                @click="accountMenuOpen = !accountMenuOpen"
              >
                <div class="w-7 h-7 rounded-lg bg-emerald-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                  {{ userInitials }}
                </div>
                <span class="max-w-[100px] sm:max-w-[150px] text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">
                  {{ authStore.user?.displayName || 'Akun' }}
                </span>
                <ChevronDown
                  class="w-3.5 h-3.5 text-slate-400 transition-transform duration-150 shrink-0"
                  :class="accountMenuOpen ? 'rotate-180 text-emerald-600 dark:text-emerald-400' : ''"
                />
              </button>

              <!-- Mobile & Tablet Account Dropdown Popover -->
              <Transition name="dropdown">
                <div
                  v-if="accountMenuOpen"
                  class="
                    absolute right-0 mt-2 w-72 max-w-[calc(100vw-28px)] rounded-2xl border border-slate-200 dark:border-slate-800
                    bg-white dark:bg-slate-900 shadow-2xl p-3.5 space-y-3.5 z-50
                  "
                >
                  <!-- User Info -->
                  <div class="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                    <div class="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 font-bold text-xs flex items-center justify-center shrink-0 border border-emerald-200/60 dark:border-emerald-900/50">
                      {{ userInitials }}
                    </div>
                    <div class="min-w-0 flex-1">
                      <div class="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                        {{ authStore.user?.displayName }}
                      </div>
                      <div class="text-[11px] text-slate-500 dark:text-slate-400 truncate font-mono">
                        {{ authStore.user?.email }}
                      </div>
                      <div class="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
                        {{ authStore.isSuperAdmin ? 'Super Administrator' : 'Pengguna Personal' }}
                      </div>
                    </div>
                  </div>

                  <!-- Theme Options 3-Way Segmented Control -->
                  <div class="space-y-1.5">
                    <div class="text-[11px] font-medium text-slate-500 dark:text-slate-400 px-0.5">
                      {{ t('theme.label') }}
                    </div>
                    <div class="grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                      <button
                        type="button"
                        class="min-h-[36px] rounded-lg text-xs font-medium flex items-center justify-center gap-1 transition-colors whitespace-nowrap"
                        :class="
                          themeStore.themeMode === 'light'
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                            : 'text-slate-600 dark:text-slate-400'
                        "
                        @click="themeStore.setTheme('light')"
                      >
                        <Sun class="w-3.5 h-3.5" />
                        <span>{{ t('theme.light') }}</span>
                      </button>
                      <button
                        type="button"
                        class="min-h-[36px] rounded-lg text-xs font-medium flex items-center justify-center gap-1 transition-colors whitespace-nowrap"
                        :class="
                          themeStore.themeMode === 'dark'
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                            : 'text-slate-600 dark:text-slate-400'
                        "
                        @click="themeStore.setTheme('dark')"
                      >
                        <Moon class="w-3.5 h-3.5" />
                        <span>{{ t('theme.dark') }}</span>
                      </button>
                      <button
                        type="button"
                        class="min-h-[36px] rounded-lg text-xs font-medium flex items-center justify-center gap-1 transition-colors whitespace-nowrap"
                        :class="
                          themeStore.themeMode === 'system'
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                            : 'text-slate-600 dark:text-slate-400'
                        "
                        @click="themeStore.setTheme('system')"
                      >
                        <Monitor class="w-3.5 h-3.5" />
                        <span>{{ t('theme.system') }}</span>
                      </button>
                    </div>
                  </div>

                  <!-- Release Notes / What's New Button -->
                  <button
                    type="button"
                    class="w-full min-h-[38px] px-3.5 py-2 rounded-xl border border-emerald-200/80 dark:border-emerald-900/60 bg-emerald-50/60 dark:bg-emerald-950/30 hover:bg-emerald-100/70 dark:hover:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center justify-between gap-2 transition-colors"
                    @click="accountMenuOpen = false; notificationStore.openChangelogModal()"
                  >
                    <span class="flex items-center gap-2 truncate">
                      <Sparkles class="w-3.5 h-3.5 shrink-0" />
                      <span>Apa yang Baru (v1.0.0-rc.4)</span>
                    </span>
                    <span class="px-1.5 py-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-mono font-bold shrink-0">
                      BARU
                    </span>
                  </button>

                  <!-- Logout Button -->
                  <button
                    type="button"
                    class="w-full min-h-[40px] px-3.5 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-950/80 text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
                    @click="handleLogout"
                  >
                    <LogOut class="w-4 h-4 shrink-0" />
                    <span>{{ t('nav.logout') }}</span>
                  </button>
                </div>
              </Transition>
            </div>
          </div>
        </header>

        <!-- Scrollable Main View Content -->
        <main
          ref="mainScrollContainer"
          class="flex-1 min-h-0 w-full max-w-full overflow-y-auto overflow-x-hidden pb-24 md:pb-8"
        >
          <div class="w-full max-w-full min-w-0 px-3.5 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-7">
            <RouterView v-slot="{ Component }">
              <Transition name="page" mode="out-in">
                <component :is="Component" />
              </Transition>
            </RouterView>
          </div>
        </main>
      </div>

      <!-- Mobile & Tablet Slide-Out Sidebar Drawer (< lg) with Smooth Transition -->
      <Transition name="drawer">
        <div
          v-if="mobileDrawerOpen"
          class="lg:hidden fixed inset-0 z-50 flex bg-black/50 backdrop-blur-xs"
          @click.self="mobileDrawerOpen = false"
        >
          <div
            class="drawer-panel w-72 sm:w-80 max-w-[85vw] bg-white dark:bg-slate-900 h-dvh max-h-dvh overflow-y-auto p-5 flex flex-col justify-between gap-4 border-r border-slate-200 dark:border-slate-800 shadow-2xl"
          >
            <div class="space-y-5">
              <!-- Dedicated App Logo Container + Language Toggle + Close Button at top of Slide-Out Sidebar -->
              <div class="flex items-center justify-between gap-2">
                <div class="flex-1 min-w-0">
                  <div
                    v-if="themeStore.appLogoUrl"
                    class="h-11 w-full rounded-xl overflow-hidden flex items-center justify-start px-2"
                  >
                    <img
                      :src="themeStore.appLogoUrl"
                      alt="Logo Aplikasi"
                      class="max-h-9 w-auto object-contain"
                    />
                  </div>
                  <div
                    v-else
                    class="h-11 w-full rounded-xl border border-dashed border-emerald-500/40 dark:border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/30 px-3 flex items-center gap-2.5"
                  >
                    <div class="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                      <Wallet class="w-4 h-4" />
                    </div>
                    <div class="min-w-0 flex-1">
                      <div class="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 truncate">
                        Sisa Uang
                      </div>
                      <div class="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                        Your Finance Assistant
                      </div>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  class="min-h-[40px] px-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-mono font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
                  title="Ganti Bahasa"
                  @click="toggleLocale"
                >
                  {{ locale.toUpperCase() }}
                </button>
                <button
                  type="button"
                  class="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
                  aria-label="Tutup Menu Sidebar"
                  @click="mobileDrawerOpen = false"
                >
                  <X class="w-5 h-5" />
                </button>
              </div>

              <!-- Sisa Uang Compact Anchor Card (ONLY for Regular Users, shown in Mobile & Tablet Sidebar too) -->
              <div
                v-if="!authStore.isSuperAdmin"
                class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3.5 space-y-1.5"
              >
                <div class="text-xs text-slate-500 dark:text-slate-400">
                  {{ t('app.sisaUangLabel') }}
                </div>
                <div class="text-base font-money font-semibold text-emerald-600 dark:text-emerald-400">
                  {{ themeStore.formatMoney(financeStore.sisaUangBulanIni) }}
                </div>
                <div class="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <span>{{ t('app.safeDailySpend') }}</span>
                  <span aria-hidden="true">·</span>
                  <span class="font-money font-medium text-slate-700 dark:text-slate-300">
                    {{ themeStore.formatMoney(financeStore.safeDailySpend) }}/hr
                  </span>
                </div>
              </div>

              <!-- Super Admin Identity Card (ONLY for Super Admin) -->
              <div
                v-else
                class="rounded-2xl border border-emerald-200/80 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/30 p-3.5 space-y-1"
              >
                <div class="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  Super Administrator
                </div>
                <div class="text-[11px] text-slate-600 dark:text-slate-400">
                  Pengawasan pengguna & keamanan sistem real-time
                </div>
              </div>

            <!-- Mobile & Tablet Drawer Navigation: Regular User -->
            <nav v-if="!authStore.isSuperAdmin" class="space-y-1">
              <RouterLink
                v-for="item in userNavItems"
                :key="item.path"
                :to="item.path"
                class="min-h-[44px] flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors"
                :class="
                  route.path === item.path
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                "
              >
                <component :is="item.icon" class="w-4 h-4 shrink-0" />
                <span>{{ item.name }}</span>
              </RouterLink>
            </nav>

            <!-- Mobile & Tablet Drawer Navigation: Super Admin (No Finance Menus) -->
            <nav v-else class="space-y-1">
              <RouterLink
                v-for="item in adminNavItems"
                :key="item.path"
                :to="item.path"
                class="min-h-[44px] flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors"
                :class="
                  isAdminNavActive(item)
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                "
              >
                <div class="flex items-center gap-3">
                  <component :is="item.icon" class="w-4 h-4 shrink-0" />
                  <span>{{ item.name }}</span>
                </div>
                <span
                  v-if="item.badge && item.badge > 0"
                  class="text-xs font-mono tabular-nums font-semibold"
                >
                  {{ item.badge }}
                </span>
              </RouterLink>
            </nav>
          </div>

          <!-- Mobile & Tablet Sidebar Footer Controls: Install Button & Version -->
          <div class="space-y-2.5 pt-4 border-t border-slate-200 dark:border-slate-800 shrink-0">
            <PWAInstallButton variant="sidebar" />

            <!-- Application Version & Release Notes Trigger at very bottom of Mobile Sidebar Drawer -->
            <button
              type="button"
              class="w-full py-1.5 px-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/80 text-center text-[11px] font-mono text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 flex items-center justify-center gap-1.5 transition-colors"
              @click="mobileDrawerOpen = false; notificationStore.openChangelogModal()"
            >
              <Sparkles class="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>Versi 1.0.0-rc.4 · Info Rilis</span>
            </button>
          </div>
        </div>
      </div>
      </Transition>

      <!-- Mobile Fixed Bottom Navigation Bar (< md) - Natural Thumb Zone -->
      <!-- 1. Regular User Bottom Navigation (Personal Finance) -->
      <nav
        v-if="!authStore.isSuperAdmin"
        class="md:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-800/80 grid grid-cols-5 items-center px-1 sm:px-6"
      >
        <RouterLink
          to="/"
          class="min-h-[48px] flex flex-col items-center justify-center gap-0.5 transition-colors"
          :class="
            route.path === '/'
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-slate-500 dark:text-slate-400'
          "
        >
          <LayoutDashboard class="w-5 h-5" />
          <span class="text-[10px] sm:text-xs font-medium tracking-tight whitespace-nowrap">
            {{ t('nav.dashboard') }}
          </span>
        </RouterLink>

        <RouterLink
          to="/transactions"
          class="min-h-[48px] flex flex-col items-center justify-center gap-0.5 transition-colors"
          :class="
            route.path === '/transactions'
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-slate-500 dark:text-slate-400'
          "
        >
          <ArrowLeftRight class="w-5 h-5" />
          <span class="text-[10px] sm:text-xs font-medium tracking-tight whitespace-nowrap">
            {{ t('nav.transactions') }}
          </span>
        </RouterLink>

        <!-- Center Primary Quick Add CTA -->
        <div class="flex items-center justify-center">
          <button
            type="button"
            class="h-11 w-11 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center shadow-md active:scale-95 transition-transform"
            :aria-label="t('nav.quickAdd')"
            @click="financeStore.openAddTransactionModal()"
          >
            <Plus class="w-5 h-5" />
          </button>
        </div>

        <RouterLink
          to="/wallets"
          class="min-h-[48px] flex flex-col items-center justify-center gap-0.5 transition-colors"
          :class="
            route.path === '/wallets'
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-slate-500 dark:text-slate-400'
          "
        >
          <Wallet class="w-5 h-5" />
          <span class="text-[10px] sm:text-xs font-medium tracking-tight whitespace-nowrap">
            {{ t('nav.wallets') }}
          </span>
        </RouterLink>

        <RouterLink
          to="/settings"
          class="min-h-[48px] flex flex-col items-center justify-center gap-0.5 transition-colors"
          :class="
            route.path === '/settings'
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-slate-500 dark:text-slate-400'
          "
        >
          <Settings class="w-5 h-5" />
          <span class="text-[10px] sm:text-xs font-medium tracking-tight whitespace-nowrap">
            {{ t('nav.settings') }}
          </span>
        </RouterLink>
      </nav>

      <!-- 2. Super Admin Mobile Bottom Navigation (< md) -->
      <nav
        v-else
        class="md:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-800/80 grid grid-cols-5 items-center px-1 sm:px-6"
      >
        <RouterLink
          to="/control-panel?tab=users"
          class="min-h-[48px] flex flex-col items-center justify-center gap-0.5 transition-colors"
          :class="
            route.path === '/control-panel' && (!route.query.tab || route.query.tab === 'users')
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-slate-500 dark:text-slate-400'
          "
        >
          <Users class="w-5 h-5" />
          <span class="text-[10px] sm:text-xs font-medium tracking-tight whitespace-nowrap">
            Pengguna
          </span>
        </RouterLink>

        <RouterLink
          to="/control-panel?tab=logs"
          class="min-h-[48px] flex flex-col items-center justify-center gap-0.5 transition-colors"
          :class="
            route.path === '/control-panel' && route.query.tab === 'logs'
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-slate-500 dark:text-slate-400'
          "
        >
          <Activity class="w-5 h-5" />
          <span class="text-[10px] sm:text-xs font-medium tracking-tight whitespace-nowrap">
            Log Sistem
          </span>
        </RouterLink>

        <RouterLink
          to="/control-panel?tab=alerts"
          class="min-h-[48px] flex flex-col items-center justify-center gap-0.5 transition-colors"
          :class="
            route.path === '/control-panel' && route.query.tab === 'alerts'
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-slate-500 dark:text-slate-400'
          "
        >
          <ShieldAlert class="w-5 h-5" />
          <span class="text-[10px] sm:text-xs font-medium tracking-tight whitespace-nowrap">
            Peringatan
          </span>
        </RouterLink>

        <RouterLink
          to="/database"
          class="min-h-[48px] flex flex-col items-center justify-center gap-0.5 transition-colors"
          :class="
            route.path === '/database'
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-slate-500 dark:text-slate-400'
          "
        >
          <Database class="w-5 h-5" />
          <span class="text-[10px] sm:text-xs font-medium tracking-tight whitespace-nowrap">
            {{ t('nav.database') }}
          </span>
        </RouterLink>

        <RouterLink
          to="/settings"
          class="min-h-[48px] flex flex-col items-center justify-center gap-0.5 transition-colors"
          :class="
            route.path === '/settings'
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-slate-500 dark:text-slate-400'
          "
        >
          <Settings class="w-5 h-5" />
          <span class="text-[10px] sm:text-xs font-medium tracking-tight whitespace-nowrap">
            {{ t('nav.settings') }}
          </span>
        </RouterLink>
      </nav>

      <!-- Global Quick Transaction Modal (Only for Regular Users) -->
      <QuickTransactionModal v-if="!authStore.isSuperAdmin" />
    </div>

    <!-- Global PWA Offline Mode Indicator -->
    <OfflineIndicator />

    <!-- Global App Update Notification & Full Reload Banner -->
    <AppUpdateBanner />

    <!-- Global Official Release Notes & Changelog Modal (v1.0.0-rc.4) -->
    <ReleaseNotesModal />

    <!-- Global Delete Confirmation Modal -->
    <AppModal
      :open="!!notificationStore.confirmDialog"
      :title="notificationStore.confirmDialog?.title || 'Konfirmasi Hapus Data'"
      subtitle="Pastikan Anda yakin sebelum menghapus data ini."
      max-width="sm"
      @close="notificationStore.resolveConfirmation(false)"
    >
      <div v-if="notificationStore.confirmDialog" class="space-y-4">
        <div
          class="rounded-2xl border p-3.5 sm:p-4 flex items-start gap-3"
          :class="
            notificationStore.confirmDialog.variant === 'warning'
              ? 'border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200'
              : 'border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200'
          "
        >
          <div
            class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
            :class="
              notificationStore.confirmDialog.variant === 'warning'
                ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400'
                : 'bg-rose-100 dark:bg-rose-900/50 text-rose-600 dark:text-rose-400'
            "
          >
            <AlertTriangle class="w-5 h-5" />
          </div>
          <div class="min-w-0 flex-1 space-y-1.5">
            <p class="text-xs sm:text-sm font-semibold leading-relaxed">
              {{ notificationStore.confirmDialog.message }}
            </p>
            <p
              v-if="notificationStore.confirmDialog.detail"
              class="text-[11px] sm:text-xs opacity-90 leading-relaxed font-mono break-words"
            >
              {{ notificationStore.confirmDialog.detail }}
            </p>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2.5 pt-1">
          <button
            type="button"
            class="min-h-[46px] px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            @click="notificationStore.resolveConfirmation(false)"
          >
            {{ notificationStore.confirmDialog.cancelLabel || 'Batal' }}
          </button>
          <button
            type="button"
            class="min-h-[46px] px-4 py-2.5 rounded-xl text-white text-xs sm:text-sm font-bold shadow-xs transition-colors flex items-center justify-center gap-1.5"
            :class="
              notificationStore.confirmDialog.variant === 'warning'
                ? 'bg-amber-600 hover:bg-amber-700'
                : 'bg-rose-600 hover:bg-rose-700'
            "
            @click="notificationStore.resolveConfirmation(true)"
          >
            <span>{{ notificationStore.confirmDialog.confirmLabel || 'Ya, Hapus' }}</span>
          </button>
        </div>
      </div>
    </AppModal>
  </div>
</template>
