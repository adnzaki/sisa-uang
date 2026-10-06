import { createRouter, createWebHistory, NavigationGuardNext, RouteLocationNormalized } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import DashboardView from '../views/DashboardView.vue';
import TransactionsView from '../views/TransactionsView.vue';
import WalletsView from '../views/WalletsView.vue';
import BudgetsView from '../views/BudgetsView.vue';
import AnalyticsView from '../views/AnalyticsView.vue';
import SettingsView from '../views/SettingsView.vue';
import ControlPanelView from '../views/ControlPanelView.vue';
import AuthView from '../views/AuthView.vue';

/**
 * Dedicated Middleware for /control-panel
 * Enforces:
 * 1. Active authenticated session
 * 2. Administrator role (vuedevo@gmail.com or bootstrapped admin)
 * 3. Completed 6-digit Email OTP verification specifically for vuedevo@gmail.com
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
    // Log suspicious unauthorized access attempt to /control-panel
    await authStore.recordAuditLog(
      'unauthorized_control_panel_access',
      `Pengguna non-admin (${authStore.user?.email}) mencoba mengakses endpoint terproteksi /control-panel.`,
      'critical'
    );
    next({ path: '/', query: { denied: 'admin_only' } });
    return;
  }

  // Enforce email verification code (OTP) exclusively for vuedevo@gmail.com
  if (
    authStore.user?.email.toLowerCase() === 'vuedevo@gmail.com' &&
    !authStore.otpVerified
  ) {
    if (!authStore.otpDispatchInfo) {
      try {
        await authStore.requestSuperAdminOtp();
      } catch {
        // Ignore
      }
    }
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
      name: 'dashboard',
      component: DashboardView,
      meta: { requiresAuth: true },
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
      path: '/settings',
      name: 'settings',
      component: SettingsView,
      meta: { requiresAuth: true },
    },
    {
      path: '/control-panel',
      name: 'control-panel',
      component: ControlPanelView,
      meta: { requiresAuth: true, requiresAdmin: true },
      beforeEnter: superAdminMiddleware,
    },
  ],
});

router.beforeEach((to, _from, next) => {
  const authStore = useAuthStore();

  // If Super Admin is mid-OTP verification, keep them on /auth?step=otp
  if (
    authStore.user &&
    authStore.user.email.toLowerCase() === 'vuedevo@gmail.com' &&
    authStore.requiresOtp &&
    !authStore.otpVerified &&
    to.path !== '/auth'
  ) {
    next({ path: '/auth', query: { step: 'otp', redirect: '/control-panel' } });
    return;
  }

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    next({ path: '/auth', query: { redirect: to.fullPath } });
    return;
  }

  if (
    to.meta.guestOnly &&
    authStore.isAuthenticated &&
    !(authStore.user?.email.toLowerCase() === 'vuedevo@gmail.com' && !authStore.otpVerified && authStore.requiresOtp)
  ) {
    next({ path: authStore.isSuperAdmin ? '/control-panel' : '/' });
    return;
  }

  // Super Admin only manages users, logs/alerts, and settings — block finance routes for Super Admin
  const financePaths = ['/', '/transactions', '/wallets', '/budgets', '/analytics'];
  if (authStore.isAuthenticated && authStore.isSuperAdmin && financePaths.includes(to.path)) {
    next({ path: '/control-panel' });
    return;
  }

  next();
});
