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
  Crown,
  Lock,
  Check,
  QrCode,
  Landmark,
  Upload,
  Copy,
  Clock,
  ArrowLeft,
  UserPlus,
  Trash2,
  FileSpreadsheet,
  SlidersHorizontal,
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
const pageTransitionName = ref<'page' | 'page-slide-left' | 'page-slide-right'>('page');

// =========================================================================
// 1. Native Mobile Swipe Gestures for Popup Notification Banners
// =========================================================================
interface BannerSwipeState {
  startX: number;
  startY: number;
  deltaX: number;
  isDragging: boolean;
  isLockedHorizontal: boolean;
  isDismissing: boolean;
  dismissDir: 1 | -1;
}

const bannerSwipeMap = ref<Record<string, BannerSwipeState>>({});

function onBannerTouchStart(bannerId: string, e: TouchEvent) {
  if (e.touches.length !== 1) return;
  const touch = e.touches[0];
  bannerSwipeMap.value[bannerId] = {
    startX: touch.clientX,
    startY: touch.clientY,
    deltaX: 0,
    isDragging: true,
    isLockedHorizontal: false,
    isDismissing: false,
    dismissDir: 1,
  };
}

function onBannerTouchMove(bannerId: string, e: TouchEvent) {
  const st = bannerSwipeMap.value[bannerId];
  if (!st || !st.isDragging || st.isDismissing || e.touches.length !== 1) return;
  const touch = e.touches[0];
  const dx = touch.clientX - st.startX;
  const dy = touch.clientY - st.startY;

  if (!st.isLockedHorizontal) {
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
      // User is scrolling vertically, cancel horizontal drag
      st.isDragging = false;
      st.deltaX = 0;
      return;
    }
    if (Math.abs(dx) > 8) {
      st.isLockedHorizontal = true;
    }
  }

  if (st.isLockedHorizontal) {
    st.deltaX = dx;
  }
}

function onBannerTouchEnd(bannerId: string) {
  const st = bannerSwipeMap.value[bannerId];
  if (!st || st.isDismissing) return;
  st.isDragging = false;

  if (Math.abs(st.deltaX) >= 65) {
    st.isDismissing = true;
    st.dismissDir = st.deltaX >= 0 ? 1 : -1;
    st.deltaX = st.dismissDir * 420;
    setTimeout(() => {
      notificationStore.dismissBanner(bannerId);
      delete bannerSwipeMap.value[bannerId];
    }, 180);
  } else {
    st.deltaX = 0;
    st.isLockedHorizontal = false;
  }
}

function getBannerSwipeStyle(bannerId: string) {
  const st = bannerSwipeMap.value[bannerId];
  if (!st || (st.deltaX === 0 && !st.isDismissing)) return {};
  const opacity = st.isDismissing
    ? 0
    : Math.max(0.2, 1 - Math.abs(st.deltaX) / 220);
  return {
    transform: `translate3d(${st.deltaX}px, 0, 0)`,
    opacity: String(opacity),
    transition: st.isDragging
      ? 'none'
      : 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease',
  };
}

// =========================================================================
// 2. Native Mobile Horizontal Swipe Navigation for Bottom Navbar Tabs
// =========================================================================
const regularBottomNavRoutes = ['/', '/transactions', '/wallets', '/settings'];
const adminBottomNavRoutes = [
  '/control-panel?tab=users',
  '/control-panel?tab=logs',
  '/control-panel?tab=alerts',
  '/database',
  '/settings',
];

function getCurrentBottomNavIndex(): { list: string[]; index: number } {
  if (authStore.isSuperAdmin) {
    if (route.path === '/control-panel') {
      const tab = (route.query.tab as string) || 'users';
      const idx = adminBottomNavRoutes.indexOf(`/control-panel?tab=${tab}`);
      return { list: adminBottomNavRoutes, index: idx };
    }
    return {
      list: adminBottomNavRoutes,
      index: adminBottomNavRoutes.indexOf(route.path),
    };
  }
  return {
    list: regularBottomNavRoutes,
    index: regularBottomNavRoutes.indexOf(route.path),
  };
}

function isInsideHorizontalScrollableOrInteractive(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const interactiveSelector =
    'input, textarea, select, [contenteditable="true"], [data-no-page-swipe]';
  if (target.closest(interactiveSelector)) return true;

  let el: HTMLElement | null = target;
  while (el && el !== mainScrollContainer.value && el !== document.body) {
    if (el.scrollWidth > el.clientWidth + 6) {
      const style = window.getComputedStyle(el);
      if (
        style.overflowX === 'auto' ||
        style.overflowX === 'scroll' ||
        el.classList.contains('overflow-x-auto')
      ) {
        return true;
      }
    }
    el = el.parentElement;
  }
  return false;
}

let mainSwipeStartX = 0;
let mainSwipeStartY = 0;
let mainSwipeStartTime = 0;
let mainSwipeTracking = false;
let mainSwipeDirectionLocked: 'horizontal' | 'vertical' | null = null;

function onMainContentTouchStart(e: TouchEvent) {
  if (typeof window !== 'undefined' && window.innerWidth >= 768) {
    mainSwipeTracking = false;
    return;
  }
  if (
    e.touches.length !== 1 ||
    mobileDrawerOpen.value ||
    accountMenuOpen.value ||
    financeStore.quickModalOpen ||
    notificationStore.changelogModalOpen ||
    Boolean(notificationStore.proModalOptions) ||
    Boolean(notificationStore.confirmDialog)
  ) {
    mainSwipeTracking = false;
    return;
  }

  const touch = e.touches[0];
  const screenW = window.innerWidth || 360;
  // Ignore touches starting within 28px of left or right screen edges
  // so we never conflict with OS/Browser native Back/Forward edge gestures
  if (touch.clientX < 28 || touch.clientX > screenW - 28) {
    mainSwipeTracking = false;
    return;
  }

  if (isInsideHorizontalScrollableOrInteractive(e.target)) {
    mainSwipeTracking = false;
    return;
  }

  const { index } = getCurrentBottomNavIndex();
  if (index === -1) {
    mainSwipeTracking = false;
    return;
  }

  mainSwipeStartX = touch.clientX;
  mainSwipeStartY = touch.clientY;
  mainSwipeStartTime = Date.now();
  mainSwipeTracking = true;
  mainSwipeDirectionLocked = null;
}

function onMainContentTouchMove(e: TouchEvent) {
  if (!mainSwipeTracking || e.touches.length !== 1) return;
  const touch = e.touches[0];
  const dx = touch.clientX - mainSwipeStartX;
  const dy = touch.clientY - mainSwipeStartY;

  if (!mainSwipeDirectionLocked) {
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 12) {
      mainSwipeDirectionLocked = 'vertical';
      mainSwipeTracking = false;
      return;
    }
    if (Math.abs(dx) > Math.abs(dy) * 1.35 && Math.abs(dx) > 16) {
      mainSwipeDirectionLocked = 'horizontal';
    }
  }
}

function onMainContentTouchEnd(e: TouchEvent) {
  if (!mainSwipeTracking) return;
  mainSwipeTracking = false;
  if (mainSwipeDirectionLocked !== 'horizontal' || e.changedTouches.length !== 1) return;

  const touch = e.changedTouches[0];
  const dx = touch.clientX - mainSwipeStartX;
  const dy = touch.clientY - mainSwipeStartY;
  const elapsed = Date.now() - mainSwipeStartTime;

  if (elapsed > 650) return;
  if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 1.5) return;

  const { list, index } = getCurrentBottomNavIndex();
  if (index === -1) return;

  if (dx < 0 && index < list.length - 1) {
    // Swiped Left -> Move to Next Tab on the right
    pageTransitionName.value = 'page-slide-left';
    router.push(list[index + 1]);
  } else if (dx > 0 && index > 0) {
    // Swiped Right -> Move to Previous Tab on the left
    pageTransitionName.value = 'page-slide-right';
    router.push(list[index - 1]);
  }
}

// =========================================================================
// 3. Swipe Left on Open Mobile Sidebar Drawer to Close It Smoothly
// =========================================================================
let drawerTouchStartX = 0;
let drawerTouchStartY = 0;
const drawerDragOffsetX = ref(0);
const isDrawerDragging = ref(false);

function onDrawerTouchStart(e: TouchEvent) {
  if (e.touches.length !== 1) return;
  drawerTouchStartX = e.touches[0].clientX;
  drawerTouchStartY = e.touches[0].clientY;
  drawerDragOffsetX.value = 0;
  isDrawerDragging.value = true;
}

function onDrawerTouchMove(e: TouchEvent) {
  if (!isDrawerDragging.value || e.touches.length !== 1) return;
  const dx = e.touches[0].clientX - drawerTouchStartX;
  const dy = e.touches[0].clientY - drawerTouchStartY;

  if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 14 && drawerDragOffsetX.value === 0) {
    isDrawerDragging.value = false;
    return;
  }
  if (dx < 0) {
    drawerDragOffsetX.value = dx;
  }
}

function onDrawerTouchEnd() {
  if (!isDrawerDragging.value) return;
  isDrawerDragging.value = false;
  if (drawerDragOffsetX.value <= -65) {
    drawerDragOffsetX.value = 0;
    mobileDrawerOpen.value = false;
  } else {
    drawerDragOffsetX.value = 0;
  }
}

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
let openedDrawerAtFullPath = '';

function handleDrawerPopState() {
  if (!mobileDrawerOpen.value) return;
  if (hasPushedDrawerHistory) {
    isClosedByBack = true;
    hasPushedDrawerHistory = false;
    mobileDrawerOpen.value = false;
  }
}

function navigateFromMobileDrawer(targetPath: string) {
  if (route.fullPath === targetPath || route.path === targetPath) {
    mobileDrawerOpen.value = false;
    return;
  }

  if (hasPushedDrawerHistory) {
    hasPushedDrawerHistory = false;
    isClosedByBack = true;
    mobileDrawerOpen.value = false;
    void router.replace(targetPath);
  } else {
    isClosedByBack = true;
    mobileDrawerOpen.value = false;
    void router.push(targetPath);
  }
}

watch(mobileDrawerOpen, (isOpen) => {
  if (typeof window === 'undefined') return;
  if (isOpen) {
    isClosedByBack = false;
    openedDrawerAtFullPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
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
      const snapshotPath = openedDrawerAtFullPath;
      // Defer history.back() to next microtask so if the drawer was closed as part of a router.push(),
      // we detect that route changed and do NOT pop the new route back to the previous page!
      setTimeout(() => {
        try {
          const currentFullPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
          if (
            currentFullPath === snapshotPath &&
            window.history.state?.__sisaUangDrawerKey === drawerHistoryKey
          ) {
            window.history.back();
          }
        } catch {
          // Ignore
        }
      }, 0);
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
  (newFullPath, oldFullPath) => {
    if (oldFullPath && newFullPath !== oldFullPath) {
      const list = authStore.isSuperAdmin ? adminBottomNavRoutes : regularBottomNavRoutes;
      const normalizeNavPath = (fp: string) => {
        if (authStore.isSuperAdmin && fp.startsWith('/control-panel')) {
          const match = fp.match(/[?&]tab=([^&]+)/);
          return `/control-panel?tab=${match ? match[1] : 'users'}`;
        }
        return fp.split('?')[0];
      };
      const oldIdx = list.indexOf(normalizeNavPath(oldFullPath));
      const newIdx = list.indexOf(normalizeNavPath(newFullPath));
      if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
        pageTransitionName.value = newIdx > oldIdx ? 'page-slide-left' : 'page-slide-right';
      } else {
        pageTransitionName.value = 'page';
      }
    }
    mobileDrawerOpen.value = false;
    accountMenuOpen.value = false;
    if (mainScrollContainer.value && !route.query.section && !route.hash) {
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
]);

const isSettingsRouteActive = computed(
  () => route.path === '/settings' || route.path === '/report-settings'
);

const settingsAccordionOpen = ref<boolean>(
  route.path === '/settings' || route.path === '/report-settings'
);

watch(
  () => route.path,
  (newPath) => {
    if (newPath === '/settings' || newPath === '/report-settings') {
      settingsAccordionOpen.value = true;
    }
  },
  { immediate: true }
);

function toggleSettingsAccordion() {
  settingsAccordionOpen.value = !settingsAccordionOpen.value;
}

// Super Admin navigation items (User Management, Activity Logs, Alerts, Database)
const adminNavItems = computed(() => [
  {
    name: t('admin.userManagement'),
    path: '/control-panel?tab=users',
    tab: 'users',
    icon: Users,
    badge: null,
  },
  {
    name: t('admin.activityLogs'),
    path: '/control-panel?tab=logs',
    tab: 'logs',
    icon: Activity,
    badge: null,
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
    badge: null,
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

function getInitialsForAccount(nameOrEmail?: string): string {
  const name = (nameOrEmail || 'U').trim();
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

async function handleSwitchAccount(targetUid: string) {
  if (targetUid === authStore.user?.uid) {
    accountMenuOpen.value = false;
    return;
  }
  accountMenuOpen.value = false;
  mobileDrawerOpen.value = false;
  const ok = await authStore.switchAccount(targetUid);
  if (ok) {
    router.push(authStore.isSuperAdmin ? '/control-panel' : '/');
  }
}

function handleAddAnotherAccount() {
  accountMenuOpen.value = false;
  mobileDrawerOpen.value = false;
  router.push({ path: '/auth', query: { mode: 'add-account' } });
}

async function handleLogout() {
  mobileDrawerOpen.value = false;
  accountMenuOpen.value = false;
  await authStore.logout();
  router.push('/auth');
}

// =========================================================================
// SisaUang Pro Subscription Checkout & Payment Proof Upload State
// =========================================================================
const proCheckoutStep = ref<'overview' | 'checkout' | 'submitted'>('overview');
const proSelectedPlan = ref<'monthly' | 'yearly'>('monthly');
const proPaymentMethod = ref<'qris' | 'bank_transfer'>('qris');
const proSenderName = ref('');
const proTransferNote = ref('');
const proProofDataUrl = ref('');
const proProofFileName = ref('');
const isSubmittingProPayment = ref(false);
const copiedAccountText = ref(false);

watch(
  () => notificationStore.proModalOptions,
  (opts) => {
    if (opts) {
      if (authStore.isPendingProUser) {
        proCheckoutStep.value = 'submitted';
      } else {
        proCheckoutStep.value = 'overview';
      }
      proSelectedPlan.value = 'monthly';
      proPaymentMethod.value = 'qris';
      proSenderName.value = authStore.user?.displayName || '';
      proTransferNote.value = '';
      proProofDataUrl.value = '';
      proProofFileName.value = '';
    }
  }
);

function startProPaymentCheckout() {
  proSenderName.value = authStore.user?.displayName || '';
  proCheckoutStep.value = 'checkout';
}

function copyBankAccountNumber(accNo: string) {
  try {
    navigator.clipboard.writeText(accNo);
    copiedAccountText.value = true;
    setTimeout(() => {
      copiedAccountText.value = false;
    }, 2000);
  } catch {
    // Ignore clipboard error
  }
}

function handleProofFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    notificationStore.notifyError(
      'Format Berkas Tidak Didukung',
      'Harap unggah bukti transfer dalam format gambar (JPG, PNG, atau WEBP).'
    );
    return;
  }

  proProofFileName.value = file.name;

  // Compress/resize image onto canvas so email attachment & payload stay fast and lightweight
  const reader = new FileReader();
  reader.onload = () => {
    const rawResult = String(reader.result || '');
    const img = new Image();
    img.onload = () => {
      const maxDim = 1100;
      let width = img.width;
      let height = img.height;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        proProofDataUrl.value = canvas.toDataURL('image/jpeg', 0.84);
      } else {
        proProofDataUrl.value = rawResult;
      }
    };
    img.onerror = () => {
      proProofDataUrl.value = rawResult;
    };
    img.src = rawResult;
  };
  reader.readAsDataURL(file);
}

async function handleSubmitProPayment() {
  if (!proProofDataUrl.value) {
    notificationStore.notifyError(
      'Bukti Transfer Belum Diunggah',
      'Silakan unggah foto atau tangkapan layar bukti pembayaran Anda terlebih dahulu.'
    );
    return;
  }
  isSubmittingProPayment.value = true;
  try {
    const ok = await authStore.submitProSubscriptionPayment({
      subscriptionPlan: proSelectedPlan.value,
      paymentMethod: proPaymentMethod.value,
      proofDataUrl: proProofDataUrl.value,
      proofFileName: proProofFileName.value || 'bukti-transfer.jpg',
      senderName: proSenderName.value.trim() || authStore.user?.displayName || '',
      transferNote: proTransferNote.value.trim(),
    });
    if (ok) {
      proCheckoutStep.value = 'submitted';
    }
  } finally {
    isSubmittingProPayment.value = false;
  }
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
        class="pointer-events-auto rounded-2xl border p-4 shadow-2xl backdrop-blur-md flex items-start justify-between gap-3 transition-all touch-pan-y select-none"
        :class="
          banner.type === 'success'
            ? 'border-emerald-500/80 bg-emerald-950/95 text-white'
            : banner.type === 'warning'
            ? 'border-amber-500/80 bg-amber-950/95 text-white'
            : 'border-rose-500/80 bg-rose-950/95 text-white'
        "
        :style="getBannerSwipeStyle(banner.id)"
        role="alert"
        @touchstart.passive="onBannerTouchStart(banner.id, $event)"
        @touchmove.passive="onBannerTouchMove(banner.id, $event)"
        @touchend="onBannerTouchEnd(banner.id)"
        @touchcancel="onBannerTouchEnd(banner.id)"
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
              class="min-h-[42px] flex items-center justify-between px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium transition-colors"
              :class="
                route.path === item.path
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/70'
              "
            >
              <div class="flex items-center gap-3 truncate min-w-0">
                <component :is="item.icon" class="w-4 h-4 shrink-0" />
                <span class="truncate">{{ item.name }}</span>
              </div>
              <span
                v-if="item.badge"
                class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider shrink-0"
                :class="
                  route.path === item.path
                    ? 'bg-white/20 text-white'
                    : 'bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300'
                "
              >
                <Crown class="w-2.5 h-2.5 shrink-0" />
                <span>{{ item.badge }}</span>
              </span>
            </RouterLink>

            <!-- Pengaturan Accordion: Menu Utama dengan Sub-menu Umum & Laporan -->
            <div class="pt-1">
              <button
                type="button"
                class="w-full min-h-[42px] flex items-center justify-between px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium transition-colors select-none text-left cursor-pointer"
                :class="
                  isSettingsRouteActive
                    ? 'bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/70'
                "
                :aria-expanded="settingsAccordionOpen"
                @click="toggleSettingsAccordion"
              >
                <div class="flex items-center gap-3 truncate min-w-0">
                  <Settings class="w-4 h-4 shrink-0" />
                  <span class="truncate">{{ t('nav.settings') }}</span>
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                  <span
                    v-if="isSettingsRouteActive"
                    class="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"
                  />
                  <ChevronDown
                    class="w-4 h-4 transition-transform duration-200"
                    :class="{ 'rotate-180': settingsAccordionOpen }"
                  />
                </div>
              </button>

              <!-- Accordion Submenu: Umum & Laporan -->
              <div
                v-show="settingsAccordionOpen"
                class="mt-1 pl-3 py-1 space-y-1 border-l-2 border-emerald-200/80 dark:border-emerald-900/60 ml-4 transition-all"
              >
                <RouterLink
                  to="/settings"
                  class="min-h-[38px] flex items-center justify-between px-3 py-1.5 rounded-xl text-xs sm:text-sm font-medium transition-colors"
                  :class="
                    route.path === '/settings'
                      ? 'bg-emerald-600 text-white shadow-2xs font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/70'
                  "
                >
                  <div class="flex items-center gap-2.5 truncate min-w-0">
                    <SlidersHorizontal class="w-3.5 h-3.5 shrink-0" />
                    <span class="truncate">{{ t('nav.settingsGeneral') }}</span>
                  </div>
                </RouterLink>

                <RouterLink
                  to="/report-settings"
                  class="min-h-[38px] flex items-center justify-between px-3 py-1.5 rounded-xl text-xs sm:text-sm font-medium transition-colors"
                  :class="
                    route.path === '/report-settings'
                      ? 'bg-emerald-600 text-white shadow-2xs font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/70'
                  "
                >
                  <div class="flex items-center gap-2.5 truncate min-w-0">
                    <FileSpreadsheet class="w-3.5 h-3.5 shrink-0" />
                    <span class="truncate">{{ t('nav.settingsReport') }}</span>
                  </div>
                </RouterLink>
              </div>
            </div>
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

            <!-- Pengaturan Accordion for Admin: Menu Utama dengan Sub-menu Umum & Laporan -->
            <div class="pt-1">
              <button
                type="button"
                class="w-full min-h-[42px] flex items-center justify-between px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium transition-colors select-none text-left cursor-pointer"
                :class="
                  isSettingsRouteActive
                    ? 'bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/70'
                "
                :aria-expanded="settingsAccordionOpen"
                @click="toggleSettingsAccordion"
              >
                <div class="flex items-center gap-3 truncate min-w-0">
                  <Settings class="w-4 h-4 shrink-0" />
                  <span class="truncate">{{ t('nav.settings') }}</span>
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                  <span
                    v-if="isSettingsRouteActive"
                    class="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"
                  />
                  <ChevronDown
                    class="w-4 h-4 transition-transform duration-200"
                    :class="{ 'rotate-180': settingsAccordionOpen }"
                  />
                </div>
              </button>

              <div
                v-show="settingsAccordionOpen"
                class="mt-1 pl-3 py-1 space-y-1 border-l-2 border-emerald-200/80 dark:border-emerald-900/60 ml-4 transition-all"
              >
                <RouterLink
                  to="/settings"
                  class="min-h-[38px] flex items-center justify-between px-3 py-1.5 rounded-xl text-xs sm:text-sm font-medium transition-colors"
                  :class="
                    route.path === '/settings'
                      ? 'bg-emerald-600 text-white shadow-2xs font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/70'
                  "
                >
                  <div class="flex items-center gap-2.5 truncate min-w-0">
                    <SlidersHorizontal class="w-3.5 h-3.5 shrink-0" />
                    <span class="truncate">{{ t('nav.settingsGeneral') }}</span>
                  </div>
                </RouterLink>

                <RouterLink
                  to="/report-settings"
                  class="min-h-[38px] flex items-center justify-between px-3 py-1.5 rounded-xl text-xs sm:text-sm font-medium transition-colors"
                  :class="
                    route.path === '/report-settings'
                      ? 'bg-emerald-600 text-white shadow-2xs font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/70'
                  "
                >
                  <div class="flex items-center gap-2.5 truncate min-w-0">
                    <FileSpreadsheet class="w-3.5 h-3.5 shrink-0" />
                    <span class="truncate">{{ t('nav.settingsReport') }}</span>
                  </div>
                </RouterLink>
              </div>
            </div>
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
            title="Lihat Informasi Rilis &amp; Changelog v1.0.0-rc.6"
            @click="notificationStore.openChangelogModal()"
          >
            <Sparkles class="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>Versi 1.0.0-rc.6 · Info Rilis</span>
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
                      <div class="flex items-center gap-1.5 mt-1">
                        <span
                          v-if="authStore.isSuperAdmin"
                          class="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400"
                        >
                          Super Administrator
                        </span>
                        <span
                          v-else-if="authStore.isProUser"
                          class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 text-[10px] font-bold uppercase tracking-wider"
                        >
                          <Crown class="w-3 h-3 shrink-0" />
                          <span>SisaUang Pro</span>
                        </span>
                        <span
                          v-else-if="authStore.isPendingProUser"
                          class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 text-[10px] font-bold uppercase tracking-wider"
                        >
                          <Clock class="w-3 h-3 shrink-0" />
                          <span>Pro · Pending</span>
                        </span>
                        <span
                          v-else
                          class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] font-semibold"
                        >
                          Paket Free
                        </span>
                      </div>
                    </div>
                  </div>

                  <!-- Upgrade to SisaUang Pro / Pending Verification Button for Non-Admin Users -->
                  <button
                    v-if="!authStore.isSuperAdmin && !authStore.isProUser"
                    type="button"
                    class="w-full min-h-[40px] px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 transition-colors cursor-pointer"
                    :class="
                      authStore.isPendingProUser
                        ? 'border-amber-300 dark:border-amber-800/70 bg-amber-50/80 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300'
                        : 'border-amber-300/90 dark:border-amber-800/70 bg-amber-50/90 dark:bg-amber-950/40 hover:bg-amber-100/80 text-amber-900 dark:text-amber-200'
                    "
                    @click="accountMenuOpen = false; notificationStore.openProModal()"
                  >
                    <span class="flex items-center gap-2 truncate">
                      <Crown class="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                      <span>
                        {{
                          authStore.isPendingProUser
                            ? 'Menunggu Verifikasi Pro'
                            : 'Langganan SisaUang Pro'
                        }}
                      </span>
                    </span>
                    <span
                      class="px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold shrink-0"
                      :class="
                        authStore.isPendingProUser
                          ? 'bg-amber-500 text-white'
                          : 'bg-emerald-600 text-white'
                      "
                    >
                      {{ authStore.isPendingProUser ? 'PENDING' : 'UPGRADE' }}
                    </span>
                  </button>

                  <!-- Multi-Account Switcher Section (Desktop Dropdown) -->
                  <div class="space-y-1.5 pt-1 border-t border-slate-100 dark:border-slate-800">
                    <div class="flex items-center justify-between px-0.5">
                      <span class="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                        Multi-Akun ({{ authStore.savedAccounts.length }})
                      </span>
                      <button
                        type="button"
                        class="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
                        @click="handleAddAnotherAccount"
                      >
                        <UserPlus class="w-3 h-3 shrink-0" />
                        <span>Tambah Akun</span>
                      </button>
                    </div>

                    <div class="space-y-1 max-h-36 overflow-y-auto pr-0.5">
                      <div
                        v-for="acc in authStore.savedAccounts"
                        :key="acc.user.uid"
                        class="flex items-center justify-between gap-1.5 p-1.5 rounded-xl border transition-colors"
                        :class="
                          acc.user.uid === authStore.user?.uid
                            ? 'border-emerald-500/60 bg-emerald-50/50 dark:bg-emerald-950/30'
                            : 'border-slate-200/70 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                        "
                      >
                        <button
                          type="button"
                          class="flex-1 min-w-0 flex items-center gap-2 text-left cursor-pointer"
                          @click="handleSwitchAccount(acc.user.uid)"
                        >
                          <div
                            class="w-7 h-7 rounded-lg text-[10px] font-bold flex items-center justify-center shrink-0"
                            :class="
                              acc.user.uid === authStore.user?.uid
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                            "
                          >
                            {{ getInitialsForAccount(acc.user.displayName || acc.user.email) }}
                          </div>
                          <div class="min-w-0 flex-1">
                            <div class="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                              {{ acc.user.displayName }}
                            </div>
                            <div class="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate">
                              @{{ acc.user.username }}
                            </div>
                          </div>
                        </button>
                        <span
                          v-if="acc.user.uid === authStore.user?.uid"
                          class="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[9px] font-bold shrink-0"
                        >
                          AKTIF
                        </span>
                        <button
                          v-else
                          type="button"
                          class="p-1 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors shrink-0 cursor-pointer"
                          title="Hapus akun dari daftar multi-akun"
                          @click.stop="authStore.removeSavedAccount(acc.user.uid)"
                        >
                          <Trash2 class="w-3.5 h-3.5" />
                        </button>
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
                      <span>Apa yang Baru (v1.0.0-rc.6)</span>
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
                      <div class="flex items-center gap-1.5 mt-1">
                        <span
                          v-if="authStore.isSuperAdmin"
                          class="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400"
                        >
                          Super Administrator
                        </span>
                        <span
                          v-else-if="authStore.isProUser"
                          class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 text-[10px] font-bold uppercase tracking-wider"
                        >
                          <Crown class="w-3 h-3 shrink-0" />
                          <span>SisaUang Pro</span>
                        </span>
                        <span
                          v-else-if="authStore.isPendingProUser"
                          class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 text-[10px] font-bold uppercase tracking-wider"
                        >
                          <Clock class="w-3 h-3 shrink-0" />
                          <span>Pro · Pending</span>
                        </span>
                        <span
                          v-else
                          class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] font-semibold"
                        >
                          Paket Free
                        </span>
                      </div>
                    </div>
                  </div>

                  <!-- Upgrade to SisaUang Pro / Pending Verification Button for Non-Admin Users (Mobile) -->
                  <button
                    v-if="!authStore.isSuperAdmin && !authStore.isProUser"
                    type="button"
                    class="w-full min-h-[40px] px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 transition-colors cursor-pointer"
                    :class="
                      authStore.isPendingProUser
                        ? 'border-amber-300 dark:border-amber-800/70 bg-amber-50/80 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300'
                        : 'border-amber-300/90 dark:border-amber-800/70 bg-amber-50/90 dark:bg-amber-950/40 hover:bg-amber-100/80 text-amber-900 dark:text-amber-200'
                    "
                    @click="accountMenuOpen = false; notificationStore.openProModal()"
                  >
                    <span class="flex items-center gap-2 truncate">
                      <Crown class="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                      <span>
                        {{
                          authStore.isPendingProUser
                            ? 'Menunggu Verifikasi Pro'
                            : 'Langganan SisaUang Pro'
                        }}
                      </span>
                    </span>
                    <span
                      class="px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold shrink-0"
                      :class="
                        authStore.isPendingProUser
                          ? 'bg-amber-500 text-white'
                          : 'bg-emerald-600 text-white'
                      "
                    >
                      {{ authStore.isPendingProUser ? 'PENDING' : 'UPGRADE' }}
                    </span>
                  </button>

                  <!-- Multi-Account Switcher Section (Mobile & Tablet Dropdown) -->
                  <div class="space-y-1.5 pt-1 border-t border-slate-100 dark:border-slate-800">
                    <div class="flex items-center justify-between px-0.5">
                      <span class="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                        Multi-Akun ({{ authStore.savedAccounts.length }})
                      </span>
                      <button
                        type="button"
                        class="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
                        @click="handleAddAnotherAccount"
                      >
                        <UserPlus class="w-3 h-3 shrink-0" />
                        <span>Tambah Akun</span>
                      </button>
                    </div>

                    <div class="space-y-1 max-h-36 overflow-y-auto pr-0.5">
                      <div
                        v-for="acc in authStore.savedAccounts"
                        :key="acc.user.uid"
                        class="flex items-center justify-between gap-1.5 p-1.5 rounded-xl border transition-colors"
                        :class="
                          acc.user.uid === authStore.user?.uid
                            ? 'border-emerald-500/60 bg-emerald-50/50 dark:bg-emerald-950/30'
                            : 'border-slate-200/70 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                        "
                      >
                        <button
                          type="button"
                          class="flex-1 min-w-0 flex items-center gap-2 text-left cursor-pointer"
                          @click="handleSwitchAccount(acc.user.uid)"
                        >
                          <div
                            class="w-7 h-7 rounded-lg text-[10px] font-bold flex items-center justify-center shrink-0"
                            :class="
                              acc.user.uid === authStore.user?.uid
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                            "
                          >
                            {{ getInitialsForAccount(acc.user.displayName || acc.user.email) }}
                          </div>
                          <div class="min-w-0 flex-1">
                            <div class="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                              {{ acc.user.displayName }}
                            </div>
                            <div class="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate">
                              @{{ acc.user.username }}
                            </div>
                          </div>
                        </button>
                        <span
                          v-if="acc.user.uid === authStore.user?.uid"
                          class="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[9px] font-bold shrink-0"
                        >
                          AKTIF
                        </span>
                        <button
                          v-else
                          type="button"
                          class="p-1 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors shrink-0 cursor-pointer"
                          title="Hapus akun dari daftar multi-akun"
                          @click.stop="authStore.removeSavedAccount(acc.user.uid)"
                        >
                          <Trash2 class="w-3.5 h-3.5" />
                        </button>
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
                      <span>Apa yang Baru (v1.0.0-rc.6)</span>
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
          class="flex-1 min-h-0 w-full max-w-full overflow-y-auto overflow-x-hidden pb-24 md:pb-8 touch-pan-y"
          @touchstart.passive="onMainContentTouchStart"
          @touchmove.passive="onMainContentTouchMove"
          @touchend.passive="onMainContentTouchEnd"
        >
          <div class="w-full max-w-full min-w-0 px-3.5 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-7">
            <RouterView v-slot="{ Component }">
              <Transition :name="pageTransitionName" mode="out-in">
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
            class="drawer-panel w-72 sm:w-80 max-w-[85vw] bg-white dark:bg-slate-900 h-dvh max-h-dvh overflow-y-auto p-5 flex flex-col justify-between gap-4 border-r border-slate-200 dark:border-slate-800 shadow-2xl touch-pan-y"
            :style="
              drawerDragOffsetX < 0
                ? {
                    transform: `translate3d(${drawerDragOffsetX}px, 0, 0)`,
                    transition: isDrawerDragging ? 'none' : 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                  }
                : undefined
            "
            @touchstart.passive="onDrawerTouchStart"
            @touchmove.passive="onDrawerTouchMove"
            @touchend="onDrawerTouchEnd"
            @touchcancel="onDrawerTouchEnd"
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
              <a
                v-for="item in userNavItems"
                :key="item.path"
                :href="item.path"
                class="min-h-[44px] flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer"
                :class="
                  route.path === item.path
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                "
                @click.prevent="navigateFromMobileDrawer(item.path)"
              >
                <div class="flex items-center gap-3 truncate min-w-0">
                  <component :is="item.icon" class="w-4 h-4 shrink-0" />
                  <span class="truncate">{{ item.name }}</span>
                </div>
                <span
                  v-if="item.badge"
                  class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider shrink-0"
                  :class="
                    route.path === item.path
                      ? 'bg-white/20 text-white'
                      : 'bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300'
                  "
                >
                  <Crown class="w-2.5 h-2.5 shrink-0" />
                  <span>{{ item.badge }}</span>
                </span>
              </a>

              <!-- Mobile Drawer Pengaturan Accordion: Menu Utama dengan Sub-menu Umum & Laporan -->
              <div class="pt-1">
                <button
                  type="button"
                  class="w-full min-h-[44px] flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors select-none text-left cursor-pointer"
                  :class="
                    isSettingsRouteActive
                      ? 'bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-semibold'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  "
                  :aria-expanded="settingsAccordionOpen"
                  @click="toggleSettingsAccordion"
                >
                  <div class="flex items-center gap-3 truncate min-w-0">
                    <Settings class="w-4 h-4 shrink-0" />
                    <span class="truncate">{{ t('nav.settings') }}</span>
                  </div>
                  <div class="flex items-center gap-1.5 shrink-0">
                    <span
                      v-if="isSettingsRouteActive"
                      class="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"
                    />
                    <ChevronDown
                      class="w-4 h-4 transition-transform duration-200"
                      :class="{ 'rotate-180': settingsAccordionOpen }"
                    />
                  </div>
                </button>

                <!-- Accordion Submenu: Umum & Laporan -->
                <div
                  v-show="settingsAccordionOpen"
                  class="mt-1 pl-3 py-1 space-y-1 border-l-2 border-emerald-200/80 dark:border-emerald-900/60 ml-4 transition-all"
                >
                  <!-- Sub-menu 1: Pengaturan Umum -->
                  <a
                    href="/settings"
                    class="min-h-[40px] flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer"
                    :class="
                      route.path === '/settings'
                        ? 'bg-emerald-600 text-white shadow-2xs font-semibold'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    "
                    @click.prevent="navigateFromMobileDrawer('/settings')"
                  >
                    <div class="flex items-center gap-2.5 truncate min-w-0">
                      <SlidersHorizontal class="w-4 h-4 shrink-0" />
                      <span class="truncate">{{ t('nav.settingsGeneral') }}</span>
                    </div>
                  </a>

                  <!-- Sub-menu 2: Pengaturan Laporan -->
                  <a
                    href="/report-settings"
                    class="min-h-[40px] flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer"
                    :class="
                      route.path === '/report-settings'
                        ? 'bg-emerald-600 text-white shadow-2xs font-semibold'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    "
                    @click.prevent="navigateFromMobileDrawer('/report-settings')"
                  >
                    <div class="flex items-center gap-2.5 truncate min-w-0">
                      <FileSpreadsheet class="w-4 h-4 shrink-0" />
                      <span class="truncate">{{ t('nav.settingsReport') }}</span>
                    </div>
                  </a>
                </div>
              </div>
            </nav>

            <!-- Mobile & Tablet Drawer Navigation: Super Admin (No Finance Menus) -->
            <nav v-else class="space-y-1">
              <a
                v-for="item in adminNavItems"
                :key="item.path"
                :href="item.path"
                class="min-h-[44px] flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer"
                :class="
                  isAdminNavActive(item)
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                "
                @click.prevent="navigateFromMobileDrawer(item.path)"
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
              </a>

              <!-- Mobile Drawer Pengaturan Accordion for Admin: Menu Utama dengan Sub-menu Umum & Laporan -->
              <div class="pt-1">
                <button
                  type="button"
                  class="w-full min-h-[44px] flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors select-none text-left cursor-pointer"
                  :class="
                    isSettingsRouteActive
                      ? 'bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-semibold'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  "
                  :aria-expanded="settingsAccordionOpen"
                  @click="toggleSettingsAccordion"
                >
                  <div class="flex items-center gap-3 truncate min-w-0">
                    <Settings class="w-4 h-4 shrink-0" />
                    <span class="truncate">{{ t('nav.settings') }}</span>
                  </div>
                  <div class="flex items-center gap-1.5 shrink-0">
                    <span
                      v-if="isSettingsRouteActive"
                      class="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"
                    />
                    <ChevronDown
                      class="w-4 h-4 transition-transform duration-200"
                      :class="{ 'rotate-180': settingsAccordionOpen }"
                    />
                  </div>
                </button>

                <!-- Accordion Submenu: Umum & Laporan -->
                <div
                  v-show="settingsAccordionOpen"
                  class="mt-1 pl-3 py-1 space-y-1 border-l-2 border-emerald-200/80 dark:border-emerald-900/60 ml-4 transition-all"
                >
                  <a
                    href="/settings"
                    class="min-h-[40px] flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer"
                    :class="
                      route.path === '/settings'
                        ? 'bg-emerald-600 text-white shadow-2xs font-semibold'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    "
                    @click.prevent="navigateFromMobileDrawer('/settings')"
                  >
                    <div class="flex items-center gap-2.5 truncate min-w-0">
                      <SlidersHorizontal class="w-4 h-4 shrink-0" />
                      <span class="truncate">{{ t('nav.settingsGeneral') }}</span>
                    </div>
                  </a>

                  <a
                    href="/report-settings"
                    class="min-h-[40px] flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer"
                    :class="
                      route.path === '/report-settings'
                        ? 'bg-emerald-600 text-white shadow-2xs font-semibold'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    "
                    @click.prevent="navigateFromMobileDrawer('/report-settings')"
                  >
                    <div class="flex items-center gap-2.5 truncate min-w-0">
                      <FileSpreadsheet class="w-4 h-4 shrink-0" />
                      <span class="truncate">{{ t('nav.settingsReport') }}</span>
                    </div>
                  </a>
                </div>
              </div>
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
              <span>Versi 1.0.0-rc.6 · Info Rilis</span>
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
            isSettingsRouteActive
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

    <!-- Global SisaUang Pro Upgrade Notification Modal -->
    <AppModal
      :open="!!notificationStore.proModalOptions"
      title="Fitur Eksklusif SisaUang Pro"
      subtitle="Berlangganan SisaUang Pro untuk membuka seluruh fitur lanjutan tanpa batas."
      max-width="md"
      @close="notificationStore.closeProModal()"
    >
      <div v-if="notificationStore.proModalOptions" class="space-y-4">
        <!-- Feature Locked Banner -->
        <div class="rounded-2xl border border-amber-200/90 dark:border-amber-900/60 bg-amber-50/80 dark:bg-amber-950/30 p-4 flex items-start gap-3.5">
          <div class="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
            <Crown class="w-5 h-5" />
          </div>
          <div class="min-w-0 flex-1 space-y-1">
            <div class="flex flex-wrap items-center gap-2">
              <h4 class="text-xs sm:text-sm font-bold text-amber-950 dark:text-amber-200">
                {{ notificationStore.proModalOptions.featureTitle }}
              </h4>
              <span
                v-if="notificationStore.proModalOptions.limitSummary"
                class="px-2 py-0.5 rounded-md bg-amber-200/80 dark:bg-amber-900/70 text-amber-900 dark:text-amber-200 text-[10px] font-mono font-bold"
              >
                {{ notificationStore.proModalOptions.limitSummary }}
              </span>
            </div>
            <p class="text-xs text-amber-900/90 dark:text-amber-200/90 leading-relaxed">
              {{ notificationStore.proModalOptions.featureDescription }}
            </p>
          </div>
        </div>

        <!-- SisaUang Pro Benefits List -->
        <div class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-4 space-y-3">
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Keuntungan Pelanggan SisaUang Pro
            </span>
            <span class="px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
              PRO UNLIMITED
            </span>
          </div>

          <ul class="space-y-2 text-xs text-slate-600 dark:text-slate-300">
            <li class="flex items-start gap-2.5">
              <div class="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                <Check class="w-2.5 h-2.5 stroke-[3]" />
              </div>
              <span>
                <strong>Anggaran Setahun Penuh &amp; Mapping Bulanan:</strong> Rencanakan anggaran satu tahun penuh sekaligus dengan pemetaan bulanan per kategori, alur Draft &amp; Finalisasi Anggaran, serta pilihan Mode Ketat atau Fleksibel.
              </span>
            </li>
            <li class="flex items-start gap-2.5">
              <div class="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                <Check class="w-2.5 h-2.5 stroke-[3]" />
              </div>
              <span>
                <strong>Laporan PDF Resmi &amp; Pengaturan Laporan:</strong> Unduh Laporan Kas Umum, Rekonsiliasi Kas, dan Realisasi Anggaran, serta kustomisasi Kop Institusi, Judul Laporan, dan Penandatangan PDF.
              </span>
            </li>
            <li class="flex items-start gap-2.5">
              <div class="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                <Check class="w-2.5 h-2.5 stroke-[3]" />
              </div>
              <span>
                <strong>Lebih dari 5 Sumber Dana (Wallet):</strong> Tambahkan rekening bank, e-wallet, kas tunai, dan investasi tanpa batas.
              </span>
            </li>
            <li class="flex items-start gap-2.5">
              <div class="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                <Check class="w-2.5 h-2.5 stroke-[3]" />
              </div>
              <span>
                <strong>Lebih dari 2 Kepemilikan Dana:</strong> Pisahkan alokasi kepemilikan dana keluarga atau bisnis di setiap dompet tanpa batas.
              </span>
            </li>
          </ul>
        </div>

        <div class="pt-1">
          <button
            type="button"
            class="w-full min-h-[46px] px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-colors shadow-xs cursor-pointer"
            @click="notificationStore.closeProModal()"
          >
            <Check class="w-4 h-4 shrink-0" />
            <span>Mengerti</span>
          </button>
        </div>
      </div>
    </AppModal>

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
