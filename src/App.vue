<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter, RouterLink, RouterView } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
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
} from 'lucide-vue-next';
import { useAuthStore } from './stores/auth';
import { useThemeStore, ThemeMode } from './stores/theme';
import { useFinanceStore } from './stores/finance';
import { useAdminStore } from './stores/admin';
import { useNotificationStore } from './stores/notification';
import QuickTransactionModal from './components/QuickTransactionModal.vue';

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const themeStore = useThemeStore();
const financeStore = useFinanceStore();
const adminStore = useAdminStore();
const notificationStore = useNotificationStore();

const mobileDrawerOpen = ref(false);
const deniedBannerVisible = ref(false);
const mainScrollContainer = ref<HTMLElement | null>(null);

onMounted(() => {
  themeStore.initThemeListener();
  authStore.initAuth();
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
    if (mainScrollContainer.value) {
      mainScrollContainer.value.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    }
    if (route.query.denied === 'admin_only') {
      deniedBannerVisible.value = true;
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
    <div v-else class="flex-1 flex min-h-0 w-full overflow-hidden">
      <!-- Desktop & Tablet Left Sidebar (md:flex) - Locked in place, never scrolls with main page -->
      <aside
        class="hidden md:flex md:w-64 lg:w-68 shrink-0 flex-col border-r border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900/95 h-full max-h-full overflow-y-auto p-4 justify-between gap-4 z-30"
      >
        <!-- Top & Scrollable Menu Area -->
        <div class="space-y-4">
          <!-- Brand Header -->
          <div class="flex items-center justify-between px-2 pt-1">
            <RouterLink
              :to="authStore.isSuperAdmin ? '/control-panel' : '/'"
              class="text-2xl font-display italic tracking-tight text-slate-900 dark:text-slate-100"
            >
              Sisa Uang
            </RouterLink>
            <button
              type="button"
              class="min-h-[38px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-mono font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
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
            <div class="text-base font-mono font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
              {{ themeStore.formatMoney(financeStore.sisaUangBulanIni) }}
            </div>
            <div class="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <span>{{ t('app.safeDailySpend') }}</span>
              <span aria-hidden="true">·</span>
              <span class="font-mono tabular-nums font-medium text-slate-700 dark:text-slate-300">
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

        <!-- Sidebar Bottom Controls: Always visible Theme Options, User Info & Explicit Logout Button -->
        <div class="space-y-3 pt-3 border-t border-slate-200/80 dark:border-slate-800 shrink-0">
          <!-- Theme Options Label + 3-Way Segmented Control -->
          <div class="space-y-1.5">
            <div class="text-[11px] font-medium text-slate-500 dark:text-slate-400 px-1 flex items-center justify-between">
              <span>{{ t('theme.label') }}</span>
            </div>
            <div class="grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
              <button
                type="button"
                class="min-h-[34px] rounded-lg text-xs font-medium flex items-center justify-center gap-1 transition-colors whitespace-nowrap"
                :class="
                  themeStore.themeMode === 'light'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
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
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
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
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                "
                @click="themeStore.setTheme('system')"
              >
                <Monitor class="w-3.5 h-3.5" />
                <span>{{ t('theme.system') }}</span>
              </button>
            </div>
          </div>

          <!-- User Profile Summary -->
          <div class="px-1">
            <div class="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
              {{ authStore.user?.displayName }}
            </div>
            <div class="text-[11px] text-slate-500 dark:text-slate-400 truncate font-mono">
              {{ authStore.user?.email }}
            </div>
          </div>

          <!-- Full-Width Explicit Logout Button -->
          <button
            type="button"
            class="w-full min-h-[40px] px-3.5 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-950/80 text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
            @click="handleLogout"
          >
            <LogOut class="w-4 h-4 shrink-0" />
            <span>{{ t('nav.logout') }}</span>
          </button>
        </div>
      </aside>

      <!-- Main Column (Fixed Top Header + Independent Scrollable Content Area) -->
      <div class="flex-1 flex flex-col min-w-0 max-w-full h-full max-h-full overflow-hidden">
        <!-- Desktop Top Bar: Permanently pinned at top of Main Column -->
        <header
          class="hidden md:flex shrink-0 items-center justify-between px-8 py-3.5 border-b border-slate-200/80 dark:border-slate-800/80 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md z-30"
        >
          <RouterLink
            :to="authStore.isSuperAdmin ? '/control-panel' : '/'"
            class="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap"
          >
            Sisa Uang
          </RouterLink>

          <div class="flex items-center gap-3">
            <!-- "+ Catat Transaksi" ONLY for Regular Users -->
            <button
              v-if="!authStore.isSuperAdmin"
              type="button"
              class="min-h-[40px] px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors whitespace-nowrap flex items-center gap-1.5"
              @click="financeStore.openAddTransactionModal()"
            >
              <Plus class="w-4 h-4" />
              <span>{{ t('dashboard.addTransaction') }}</span>
            </button>
          </div>
        </header>

        <!-- Mobile Top App Bar (< md) - Permanently pinned at top -->
        <header
          class="md:hidden shrink-0 z-30 h-14 px-3.5 flex items-center justify-between gap-2 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80"
        >
          <button
            type="button"
            class="min-h-[44px] min-w-[44px] -ml-1.5 flex items-center justify-center rounded-xl text-slate-700 dark:text-slate-200 shrink-0"
            aria-label="Menu"
            @click="mobileDrawerOpen = true"
          >
            <Menu class="w-5 h-5" />
          </button>

          <RouterLink
            :to="authStore.isSuperAdmin ? '/control-panel' : '/'"
            class="text-xl font-display italic tracking-tight text-slate-900 dark:text-slate-100 truncate"
          >
            Sisa Uang
          </RouterLink>

          <div class="flex items-center shrink-0">
            <!-- Mobile Navbar Quick Add Transaction button for regular users, or theme button for admin -->
            <button
              v-if="!authStore.isSuperAdmin"
              type="button"
              class="min-h-[38px] px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1 whitespace-nowrap shadow-2xs"
              @click="financeStore.openAddTransactionModal()"
            >
              <Plus class="w-3.5 h-3.5 shrink-0" />
              <span>{{ t('nav.quickAdd') }}</span>
            </button>
            <button
              v-else
              type="button"
              class="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300"
              :title="t('theme.label')"
              @click="cycleTheme"
            >
              <Sun v-if="themeStore.themeMode === 'light'" class="w-4 h-4" />
              <Moon v-else-if="themeStore.themeMode === 'dark'" class="w-4 h-4" />
              <Monitor v-else class="w-4 h-4" />
            </button>
          </div>
        </header>

        <!-- Scrollable Main View Content -->
        <main
          ref="mainScrollContainer"
          class="flex-1 min-h-0 w-full overflow-y-auto overflow-x-hidden pb-24 md:pb-8"
        >
          <div class="w-full max-w-6xl mx-auto px-3.5 sm:px-6 md:px-8 py-4 sm:py-7">
            <RouterView />
          </div>
        </main>
      </div>

      <!-- Mobile Slide-Out Sidebar Drawer -->
      <div
        v-if="mobileDrawerOpen"
        class="md:hidden fixed inset-0 z-50 flex bg-black/50 backdrop-blur-xs"
        @click.self="mobileDrawerOpen = false"
      >
        <div
          class="w-72 max-w-[84vw] bg-white dark:bg-slate-900 h-dvh max-h-dvh overflow-y-auto p-5 flex flex-col justify-between gap-4 border-r border-slate-200 dark:border-slate-800 shadow-2xl"
        >
          <div class="space-y-5">
            <div class="flex items-center justify-between">
              <span class="text-2xl font-display italic text-slate-900 dark:text-slate-100">
                Sisa Uang
              </span>
              <button
                type="button"
                class="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-500"
                @click="mobileDrawerOpen = false"
              >
                <X class="w-5 h-5" />
              </button>
            </div>

            <!-- Mobile Drawer User Info -->
            <div class="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800">
              <div class="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                {{ authStore.user?.displayName }}
              </div>
              <div class="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5 font-mono">
                {{ authStore.user?.email }}
              </div>
              <div class="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1.5 font-medium">
                {{ authStore.isSuperAdmin ? 'Role: Super Administrator' : 'Role: Pengguna Personal' }}
              </div>
            </div>

            <!-- Mobile Drawer Navigation: Regular User -->
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

            <!-- Mobile Drawer Navigation: Super Admin (No Finance Menus) -->
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

          <!-- Mobile Sidebar Footer Controls: Theme, Language & Logout -->
          <div class="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800 shrink-0">
            <div class="text-[11px] font-medium text-slate-500 dark:text-slate-400 px-1">
              {{ t('theme.label') }}
            </div>
            <div class="grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
              <button
                type="button"
                class="min-h-[36px] rounded-lg text-xs font-medium flex items-center justify-center gap-1"
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
                class="min-h-[36px] rounded-lg text-xs font-medium flex items-center justify-center gap-1"
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
                class="min-h-[36px] rounded-lg text-xs font-medium flex items-center justify-center gap-1"
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

            <div class="grid grid-cols-2 gap-2">
              <button
                type="button"
                class="min-h-[42px] flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300"
                @click="toggleLocale"
              >
                <Globe class="w-4 h-4" />
                <span>Bahasa: {{ locale.toUpperCase() }}</span>
              </button>
              <button
                type="button"
                class="min-h-[42px] px-3 flex items-center justify-center gap-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 text-xs font-semibold"
                @click="handleLogout"
              >
                <LogOut class="w-4 h-4" />
                <span>{{ t('nav.logout') }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Mobile Fixed Bottom Navigation Bar (< md) - Natural Thumb Zone -->
      <!-- 1. Regular User Bottom Navigation (Personal Finance) -->
      <nav
        v-if="!authStore.isSuperAdmin"
        class="md:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-800/80 grid grid-cols-5 items-center px-1"
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
          <span class="text-[10px] font-medium tracking-tight whitespace-nowrap">
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
          <span class="text-[10px] font-medium tracking-tight whitespace-nowrap">
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
          <span class="text-[10px] font-medium tracking-tight whitespace-nowrap">
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
          <span class="text-[10px] font-medium tracking-tight whitespace-nowrap">
            {{ t('nav.settings') }}
          </span>
        </RouterLink>
      </nav>

      <!-- 2. Super Admin Mobile Bottom Navigation (Strictly Users, Logs, Alerts, Database, Settings) -->
      <nav
        v-else
        class="md:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-800/80 grid grid-cols-5 items-center px-1"
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
          <span class="text-[10px] font-medium tracking-tight whitespace-nowrap">
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
          <span class="text-[10px] font-medium tracking-tight whitespace-nowrap">
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
          <span class="text-[10px] font-medium tracking-tight whitespace-nowrap">
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
          <span class="text-[10px] font-medium tracking-tight whitespace-nowrap">
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
          <span class="text-[10px] font-medium tracking-tight whitespace-nowrap">
            {{ t('nav.settings') }}
          </span>
        </RouterLink>
      </nav>

      <!-- Global Quick Transaction Modal (Only for Regular Users) -->
      <QuickTransactionModal v-if="!authStore.isSuperAdmin" />
    </div>
  </div>
</template>
