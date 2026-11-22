import { createRouter, createWebHistory, NavigationGuardNext, RouteLocationNormalized } from 'vue-router';
import { scrollToPageTop, scrollToPageTopMultiFrame, scrollToElement } from '../utils/scroll';
import { auth } from '../firebase';
import { useAuthStore } from '../stores/auth';
import { useNotificationStore } from '../stores/notification';
import { useAutomationStore } from '../stores/automation';
import { useSavingsStore } from '../stores/savings';
import { useDebtsStore } from '../stores/debts';
import { useFinanceStore } from '../stores/finance';
import { apiClient } from '../services/api';
import DashboardView from '../views/DashboardView.vue';
import TransactionsView from '../views/TransactionsView.vue';
import WalletsView from '../views/WalletsView.vue';
import OwnershipView from '../views/OwnershipView.vue';
import CategoriesView from '../views/CategoriesView.vue';
import BudgetsView from '../views/BudgetsView.vue';
import AnalyticsView from '../views/AnalyticsView.vue';
import ReportSettingsView from '../views/ReportSettingsView.vue';
import SettingsView from '../views/SettingsView.vue';
import DatabaseManagementView from '../views/DatabaseManagementView.vue';
import ControlPanelView from '../views/ControlPanelView.vue';
import AuthView from '../views/AuthView.vue';
import AutomationView from '../views/AutomationView.vue';
import SavingsView from '../views/SavingsView.vue';
import SavingsDetailView from '../views/SavingsDetailView.vue';
import DebtsView from '../views/DebtsView.vue';
import DebtDetailView from '../views/DebtDetailView.vue';

/**
 * Dedicated Middleware for /control-panel and /database
 * Enforces:
 * 1. Active authenticated session
 * 2. Administrator role (vuedevo@gmail.com or bootstrapped admin)
 * 3. Completed 6-digit Email OTP verification specifically for vuedevo@gmail.com
 * 4. Active server-verified admin token (not expired or revoked)
 */
async function superAdminMiddleware(
  to: RouteLocationNormalized,
  _from: RouteLocationNormalized,
  next: NavigationGuardNext
) {
  const authStore = useAuthStore();

  if (!authStore.isAuthenticated) {
    next({ path: '/auth', query: { redirect: to.fullPath } });
    return;
  }

  if (!authStore.isSuperAdmin) {
    // Log suspicious unauthorized access attempt to /control-panel or /database
    await authStore.recordAuditLog(
      'unauthorized_control_panel_access',
      `Pengguna non-admin (${authStore.user?.email}) mencoba mengakses endpoint terproteksi ${to.path}.`,
      'critical'
    );
    next({ path: '/dashboard', query: { denied: 'admin_only' } });
    return;
  }

  const hasAdminToken = Boolean(localStorage.getItem('sisa_uang_admin_token'));
  if (!authStore.otpVerified || !hasAdminToken) {
    next({ path: '/auth', query: { step: 'otp', redirect: to.fullPath } });
    return;
  }

  // Actively verify session with server to ensure token hasn't expired or been revoked
  try {
    await apiClient.get('/admin/verify-session');
  } catch {
    await authStore.handleAdminSessionExpired(
      'Sesi Super Admin telah kedaluwarsa atau token tidak valid. Silakan verifikasi ulang OTP.'
    );
    next({ path: '/auth', query: { step: 'otp', redirect: to.fullPath } });
    return;
  }

  next();
}

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/auth',
      name: 'auth',
      component: AuthView,
      meta: { guestOnly: true },
    },
    {
      path: '/',
      name: 'landing',
      component: () => import('../views/LandingView.vue'),
      meta: { isPublic: true },
    },
    {
      path: '/landing',
      redirect: '/',
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: DashboardView,
      meta: { requiresAuth: true },
    },
    {
      path: '/pricing',
      name: 'pricing',
      component: () => import('../views/LandingView.vue'),
      meta: { isPublic: true },
    },
    {
      path: '/terms',
      name: 'terms',
      component: () => import('../views/TermsView.vue'),
      meta: { isPublic: true },
    },
    {
      path: '/refund-policy',
      name: 'refund-policy',
      component: () => import('../views/RefundPolicyView.vue'),
      meta: { isPublic: true },
    },
    {
      path: '/privacy',
      name: 'privacy',
      component: () => import('../views/PrivacyView.vue'),
      meta: { isPublic: true },
    },
    {
      path: '/contact',
      name: 'contact',
      component: () => import('../views/ContactView.vue'),
      meta: { isPublic: true },
    },
    {
      path: '/transactions',
      name: 'transactions',
      component: TransactionsView,
      meta: { requiresAuth: true },
    },
    {
      path: '/wallets',
      name: 'wallets',
      component: WalletsView,
      meta: { requiresAuth: true },
    },
    {
      path: '/ownership',
      name: 'ownership',
      component: OwnershipView,
      meta: { requiresAuth: true },
    },
    {
      path: '/categories',
      name: 'categories',
      component: CategoriesView,
      meta: { requiresAuth: true },
    },
    {
      path: '/budgets',
      name: 'budgets',
      component: BudgetsView,
      meta: { requiresAuth: true },
    },
    {
      path: '/analytics',
      name: 'analytics',
      component: AnalyticsView,
      meta: { requiresAuth: true },
    },
    {
      path: '/report-settings',
      name: 'report-settings',
      component: ReportSettingsView,
      meta: { requiresAuth: true },
    },
    {
      path: '/settings',
      name: 'settings',
      component: SettingsView,
      meta: { requiresAuth: true },
    },
    {
      path: '/utilities/automation',
      name: 'automation',
      component: AutomationView,
      meta: { requiresAuth: true },
    },
    {
      path: '/automations',
      redirect: '/utilities/automation',
    },
    {
      path: '/utilities/savings',
      name: 'savings',
      component: SavingsView,
      meta: { requiresAuth: true },
    },
    {
      path: '/utilities/savings/:id',
      name: 'savings-detail',
      component: SavingsDetailView,
      meta: { requiresAuth: true },
    },
    {
      path: '/savings',
      redirect: '/utilities/savings',
    },
    {
      path: '/utilities/debts',
      name: 'debts',
      component: DebtsView,
      meta: { requiresAuth: true },
    },
    {
      path: '/utilities/debts/:id',
      name: 'debt-detail',
      component: DebtDetailView,
      meta: { requiresAuth: true },
    },
    {
      path: '/debts',
      redirect: '/utilities/debts',
    },
    {
      path: '/database',
      name: 'database',
      component: DatabaseManagementView,
      meta: { requiresAuth: true, requiresAdmin: true },
      beforeEnter: superAdminMiddleware,
    },
    {
      path: '/control-panel',
      name: 'control-panel',
      component: ControlPanelView,
      meta: { requiresAuth: true, requiresAdmin: true },
      beforeEnter: superAdminMiddleware,
    },
  ],
  scrollBehavior(to, from, savedPosition) {
    if (from.matched.length > 0 && to.fullPath === from.fullPath) {
      return;
    }
    if (to.hash) {
      return { el: to.hash, top: 70, behavior: 'smooth' };
    }
    if (to.path === '/pricing') {
      return { el: '#pricing', top: 70, behavior: 'smooth' };
    }
    if (savedPosition) {
      return savedPosition;
    }
    return { top: 0, left: 0 };
  },
});

router.afterEach((to, from) => {
  if (from.matched.length > 0 && to.fullPath === from.fullPath) {
    return;
  }
  if (to.hash) {
    requestAnimationFrame(() => scrollToElement(to.hash, 'smooth', 70));
    setTimeout(() => scrollToElement(to.hash, 'smooth', 70), 100);
    setTimeout(() => scrollToElement(to.hash, 'smooth', 70), 300);
  } else if (to.path === '/pricing') {
    requestAnimationFrame(() => scrollToElement('pricing', 'smooth', 70));
    setTimeout(() => scrollToElement('pricing', 'smooth', 70), 100);
    setTimeout(() => scrollToElement('pricing', 'smooth', 70), 300);
  } else {
    scrollToPageTopMultiFrame();
  }
});

router.beforeEach((to, _from, next) => {
  const authStore = useAuthStore();

  const isSuperAdminEmailAddress = (email?: string | null) => {
    const clean = (email || '').toLowerCase();
    return clean === 'vuedevo@gmail.com' || clean === 'adnanzaki65@admin.sd.belajar.id';
  };

  // If Super Admin is mid-OTP verification, keep them on /auth?step=otp
  if (
    authStore.user &&
    isSuperAdminEmailAddress(authStore.user.email) &&
    authStore.requiresOtp &&
    !authStore.otpVerified &&
    to.path !== '/auth'
  ) {
    next({ path: '/auth', query: { step: 'otp', redirect: '/control-panel' } });
    return;
  }

  // Allow public routes without authentication
  if (to.meta.isPublic || to.meta.isRoot) {
    next();
    return;
  }

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    next({ path: '/auth', query: { redirect: to.fullPath } });
    return;
  }

  if (
    to.meta.guestOnly &&
    authStore.isAuthenticated &&
    to.query.mode !== 'add-account' &&
    !(isSuperAdminEmailAddress(authStore.user?.email) && !authStore.otpVerified && authStore.requiresOtp)
  ) {
    const target = (to.query.redirect as string) || '/dashboard';
    const query: Record<string, string> = {};
    if (to.query.action) query.action = String(to.query.action);
    if (to.query.plan) query.plan = String(to.query.plan);
    next({ path: target, query });
    return;
  }

  next();
});

router.afterEach((to) => {
  const authStore = useAuthStore();
  if (authStore.isAuthenticated && authStore.user?.uid) {
    const financeStore = useFinanceStore();
    void financeStore.checkAndSyncIfRemoteChanged(authStore.user.uid, false);

    const automationStore = useAutomationStore();
    void automationStore.checkAndTriggerOnActivity();

    const savingsStore = useSavingsStore();
    void savingsStore.checkAndTriggerReminders();

    const debtsStore = useDebtsStore();
    void debtsStore.checkAndTriggerReminders();
  }
});

router.onError((error, to) => {
  const message = error instanceof Error ? error.message : String(error || '');
  const isDynamicImportError =
    /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk .* failed/i.test(
      message
    );
  if (!isDynamicImportError || typeof window === 'undefined') {
    return;
  }

  const reloadGuardKey = 'sisa_uang_router_chunk_reload_at';
  try {
    const lastReloadAt = Number(window.sessionStorage.getItem(reloadGuardKey) || '0');
    if (Date.now() - lastReloadAt < 10000) {
      return;
    }
    window.sessionStorage.setItem(reloadGuardKey, String(Date.now()));
  } catch {
    // Ignore sessionStorage errors
  }

  const targetPath = to?.fullPath || window.location.pathname + window.location.search + window.location.hash;
  window.location.assign(targetPath);
});


