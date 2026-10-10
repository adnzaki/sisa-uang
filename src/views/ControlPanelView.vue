<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
  ShieldAlert,
  Users,
  Activity,
  Ban,
  CheckCircle2,
  Trash2,
  Search,
  RefreshCw,
  Zap,
  Lock,
  Crown,
  Sparkles,
  Calendar,
  Check,
} from 'lucide-vue-next';
import {
  useAdminStore,
  isAdminUserProActive,
  type AdminUserItem,
} from '../stores/admin';
import { useAuthStore } from '../stores/auth';
import AppModal from '../components/AppModal.vue';
import MaterialDatePicker from '../components/MaterialDatePicker.vue';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const adminStore = useAdminStore();
const authStore = useAuthStore();

const activeSection = ref<'users' | 'logs' | 'alerts'>(
  route.query.tab === 'logs'
    ? 'logs'
    : route.query.tab === 'alerts'
    ? 'alerts'
    : 'users'
);
const userSearch = ref('');
const userStatusFilter = ref<'all' | 'active' | 'blocked'>('all');
const userPlanFilter = ref<'all' | 'pro' | 'free'>('all');
const logSeverityFilter = ref<'all' | 'info' | 'warning' | 'critical'>('all');
const logSearch = ref('');

// =========================================================================
// Modal Pengaturan Langganan SisaUang Pro (Bulanan / Tahunan + Masa Aktif)
// =========================================================================
const subscriptionModalOpen = ref(false);
const selectedSubUser = ref<AdminUserItem | null>(null);
const selectedSubPlan = ref<'monthly' | 'yearly'>('monthly');
const selectedSubExpiresAt = ref<string>('');
const isSavingSubscription = ref(false);

function toLocalIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function computeDefaultExpiryForPlan(plan: 'monthly' | 'yearly'): string {
  const d = new Date();
  if (plan === 'yearly') {
    d.setFullYear(d.getFullYear() + 1);
  } else {
    d.setMonth(d.getMonth() + 1);
  }
  return toLocalIsoDate(d);
}

function selectSubscriptionPlan(plan: 'monthly' | 'yearly') {
  selectedSubPlan.value = plan;
  selectedSubExpiresAt.value = computeDefaultExpiryForPlan(plan);
}

function applyDurationMonthsPreset(months: number) {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  selectedSubPlan.value = months >= 12 ? 'yearly' : 'monthly';
  selectedSubExpiresAt.value = toLocalIsoDate(d);
}

function openSubscriptionModal(targetUser: AdminUserItem) {
  selectedSubUser.value = targetUser;
  if (isUserPro(targetUser)) {
    selectedSubPlan.value =
      targetUser.subscriptionPlan === 'yearly' ? 'yearly' : 'monthly';
    selectedSubExpiresAt.value =
      targetUser.subscriptionExpiresAt && /^\d{4}-\d{2}-\d{2}$/.test(targetUser.subscriptionExpiresAt.slice(0, 10))
        ? targetUser.subscriptionExpiresAt.slice(0, 10)
        : computeDefaultExpiryForPlan(selectedSubPlan.value);
  } else {
    selectedSubPlan.value = 'monthly';
    selectedSubExpiresAt.value = computeDefaultExpiryForPlan('monthly');
  }
  subscriptionModalOpen.value = true;
}

async function handleSaveProSubscription() {
  if (!selectedSubUser.value || !selectedSubExpiresAt.value) return;
  isSavingSubscription.value = true;
  try {
    await adminStore.updateUserSubscriptionStatus(selectedSubUser.value, {
      isPro: true,
      subscriptionPlan: selectedSubPlan.value,
      subscriptionExpiresAt: selectedSubExpiresAt.value,
    });
    subscriptionModalOpen.value = false;
    selectedSubUser.value = null;
  } finally {
    isSavingSubscription.value = false;
  }
}

async function handleDeactivateProSubscription(targetUser?: AdminUserItem) {
  const userToDeactivate = targetUser || selectedSubUser.value;
  if (!userToDeactivate) return;
  isSavingSubscription.value = true;
  try {
    await adminStore.updateUserSubscriptionStatus(userToDeactivate, {
      isPro: false,
      subscriptionPlan: null,
      subscriptionExpiresAt: null,
    });
    subscriptionModalOpen.value = false;
    selectedSubUser.value = null;
  } finally {
    isSavingSubscription.value = false;
  }
}

function isUserPro(u: AdminUserItem): boolean {
  return isAdminUserProActive(u);
}

function formatExpiryDateLabel(isoDate?: string | null): string {
  if (!isoDate) return 'Tanpa Batas';
  const clean = String(isoDate).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  const [y, m, d] = clean.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

watch(
  () => route.query.tab,
  (tab) => {
    if (tab === 'logs' || tab === 'alerts' || tab === 'users') {
      activeSection.value = tab;
    }
  }
);

function selectSection(sec: 'users' | 'logs' | 'alerts') {
  activeSection.value = sec;
  router.replace({ path: '/control-panel', query: { tab: sec } });
}

onMounted(() => {
  adminStore.startRealtimeMonitoring();
});

const filteredUsers = computed(() => {
  return adminStore.users.filter((u) => {
    if (userStatusFilter.value !== 'all' && u.status !== userStatusFilter.value) {
      return false;
    }
    if (userPlanFilter.value === 'pro' && !isUserPro(u)) {
      return false;
    }
    if (userPlanFilter.value === 'free' && isUserPro(u)) {
      return false;
    }
    if (userSearch.value.trim()) {
      const q = userSearch.value.toLowerCase();
      return (
        u.displayName.toLowerCase().includes(q) ||
        (u.username && u.username.toLowerCase().includes(q)) ||
        u.email.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q)
      );
    }
    return true;
  });
});

const filteredLogs = computed(() => {
  return adminStore.logs.filter((l) => {
    if (logSeverityFilter.value !== 'all' && l.severity !== logSeverityFilter.value) {
      return false;
    }
    if (logSearch.value.trim()) {
      const q = logSearch.value.toLowerCase();
      return (
        l.actorEmail.toLowerCase().includes(q) ||
        l.action.toLowerCase().includes(q) ||
        l.detail.toLowerCase().includes(q)
      );
    }
    return true;
  });
});

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}
</script>

<template>
  <div class="space-y-5 sm:space-y-6 max-w-full overflow-x-hidden">
    <!-- Control Panel Header -->
    <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
      <div class="min-w-0">
        <div class="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium mb-1">
          <Lock class="w-3.5 h-3.5 shrink-0" />
          <span class="truncate">Endpoint Terproteksi · /control-panel · {{ authStore.user?.email }}</span>
        </div>
        <h1 class="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          {{ t('admin.title') }}
        </h1>
        <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          {{ t('admin.subtitle') }}
        </p>
      </div>

      <!-- Instant Suspicious Activity Simulation Controls -->
      <div class="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2 w-full sm:w-auto">
        <button
          type="button"
          class="w-full sm:w-auto min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-center gap-1.5 transition-colors"
          @click="adminStore.fetchAdminOverview(false)"
        >
          <RefreshCw class="w-4 h-4 shrink-0" :class="adminStore.isLoading ? 'animate-spin' : ''" />
          <span>Segarkan Data</span>
        </button>

        <button
          type="button"
          class="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
          @click="adminStore.simulateSuspiciousActivity('brute_force')"
        >
          <Zap class="w-4 h-4 shrink-0" />
          <span>{{ t('admin.simulateAlert') }}</span>
        </button>
      </div>
    </div>

    <!-- Top Summary Metrics Grid -->
    <div class="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
      <div class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-1">
        <div class="text-xs text-slate-500 dark:text-slate-400">
          {{ t('admin.totalUsers') }}
        </div>
        <div class="text-2xl font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100">
          {{ adminStore.users.length }}
        </div>
      </div>

      <div class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-1">
        <div class="text-xs text-slate-500 dark:text-slate-400">
          {{ t('admin.activeUsers') }}
        </div>
        <div class="text-2xl font-mono font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
          {{ adminStore.activeUsersCount }}
        </div>
      </div>

      <div class="rounded-2xl border border-emerald-200/80 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/25 p-4 sm:p-5 space-y-1">
        <div class="text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
          <Crown class="w-3.5 h-3.5 shrink-0" />
          <span>Pelanggan SisaUang Pro</span>
        </div>
        <div class="text-2xl font-mono font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
          {{ adminStore.proUsersCount }}
        </div>
      </div>

      <div class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-1">
        <div class="text-xs text-slate-500 dark:text-slate-400">
          {{ t('admin.blockedUsers') }}
        </div>
        <div class="text-2xl font-mono font-bold tabular-nums text-amber-600 dark:text-amber-400">
          {{ adminStore.blockedUsersCount }}
        </div>
      </div>

      <div class="col-span-2 lg:col-span-1 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-1">
        <div class="text-xs text-slate-500 dark:text-slate-400">
          {{ t('admin.openAlerts') }}
        </div>
        <div class="text-2xl font-mono font-bold tabular-nums text-rose-600 dark:text-rose-400">
          {{ adminStore.openAlertsCount }}
        </div>
      </div>
    </div>

    <!-- Segmented Navigation for Control Panel Modules -->
    <div class="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/90 rounded-xl overflow-x-auto">
      <button
        type="button"
        class="flex-1 min-h-[42px] px-4 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
        :class="
          activeSection === 'users'
            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
        "
        @click="selectSection('users')"
      >
        <Users class="w-4 h-4" />
        <span>{{ t('admin.userManagement') }} ({{ adminStore.users.length }})</span>
      </button>

      <button
        type="button"
        class="flex-1 min-h-[42px] px-4 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
        :class="
          activeSection === 'logs'
            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
        "
        @click="selectSection('logs')"
      >
        <Activity class="w-4 h-4" />
        <span>{{ t('admin.activityLogs') }} ({{ adminStore.logs.length }})</span>
      </button>

      <button
        type="button"
        class="flex-1 min-h-[42px] px-4 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
        :class="
          activeSection === 'alerts'
            ? 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-xs'
            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
        "
        @click="selectSection('alerts')"
      >
        <ShieldAlert class="w-4 h-4" />
        <span>{{ t('admin.securityAlerts') }} ({{ adminStore.openAlertsCount }})</span>
      </button>
    </div>

    <!-- MODULE 1: Real-Time User Management -->
    <section v-if="activeSection === 'users'" class="space-y-4">
      <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-2">
          <!-- Status Filter -->
          <div class="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/90 rounded-xl self-start">
            <button
              type="button"
              class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              :class="
                userStatusFilter === 'all'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              "
              @click="userStatusFilter = 'all'"
            >
              Semua Status
            </button>
            <button
              type="button"
              class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              :class="
                userStatusFilter === 'active'
                  ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              "
              @click="userStatusFilter = 'active'"
            >
              Aktif
            </button>
            <button
              type="button"
              class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              :class="
                userStatusFilter === 'blocked'
                  ? 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              "
              @click="userStatusFilter = 'blocked'"
            >
              Diblokir
            </button>
          </div>

          <!-- Subscription Tier Filter (Free vs SisaUang Pro) -->
          <div class="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/90 rounded-xl self-start">
            <button
              type="button"
              class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              :class="
                userPlanFilter === 'all'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              "
              @click="userPlanFilter = 'all'"
            >
              Semua Paket
            </button>
            <button
              type="button"
              class="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
              :class="
                userPlanFilter === 'pro'
                  ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              "
              @click="userPlanFilter = 'pro'"
            >
              <Crown class="w-3.5 h-3.5" />
              <span>SisaUang Pro ({{ adminStore.proUsersCount }})</span>
            </button>
            <button
              type="button"
              class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              :class="
                userPlanFilter === 'free'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              "
              @click="userPlanFilter = 'free'"
            >
              Free ({{ adminStore.users.length - adminStore.proUsersCount }})
            </button>
          </div>
        </div>

        <!-- Search Input -->
        <div class="relative w-full lg:w-72">
          <Search class="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            v-model="userSearch"
            type="text"
            placeholder="Cari nama atau email pengguna..."
            class="w-full min-h-[42px] pl-10 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
          />
        </div>
      </div>

      <div
        class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800/80"
      >
        <div
          v-for="u in filteredUsers"
          :key="u.uid"
          class="p-4 sm:px-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors"
        >
          <div class="space-y-1.5 min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                {{ u.displayName }}
              </span>

              <!-- Subscription Status Badge -->
              <span
                v-if="isUserPro(u)"
                class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/60"
              >
                <Crown class="w-3 h-3 shrink-0" />
                <span>
                  SisaUang Pro · {{ u.subscriptionPlan === 'yearly' ? 'Tahunan' : 'Bulanan' }}
                </span>
              </span>
              <span
                v-else
                class="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
              >
                Free
              </span>

              <span class="text-xs text-slate-400" aria-hidden="true">·</span>
              <span
                class="text-xs font-medium"
                :class="
                  u.status === 'active'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                "
              >
                {{ u.status === 'active' ? t('admin.statusActive') : t('admin.statusBlocked') }}
              </span>
            </div>

            <!-- Unboxed metadata with separators -->
            <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              <span class="font-mono font-semibold text-emerald-700 dark:text-emerald-400">@{{ u.username || u.email.split('@')[0] }}</span>
              <span aria-hidden="true">·</span>
              <span class="font-mono">{{ u.email }}</span>
              <span aria-hidden="true">·</span>
              <span>Role: {{ u.role === 'admin' ? 'Super Admin' : 'Pengguna' }}</span>
              <span aria-hidden="true">·</span>
              <span>
                Langganan:
                <strong
                  :class="
                    isUserPro(u)
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-slate-700 dark:text-slate-300'
                  "
                >
                  {{
                    isUserPro(u)
                      ? `SisaUang Pro (${u.subscriptionPlan === 'yearly' ? 'Tahunan' : 'Bulanan'} · Aktif s/d ${formatExpiryDateLabel(u.subscriptionExpiresAt)})`
                      : 'Free (Reguler)'
                  }}
                </strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>Provider: {{ u.authProvider === 'google' ? 'Google OAuth' : 'Email/Username & Sandi' }}</span>
              <span aria-hidden="true">·</span>
              <span class="font-mono tabular-nums">Update: {{ formatTimestamp(u.updatedAt) }}</span>
            </div>
          </div>

          <!-- Real-Time Action Buttons (Pro Subscription Modal, Block / Unblock & Delete) -->
          <div
            v-if="u.email.toLowerCase() !== 'vuedevo@gmail.com'"
            class="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-end shrink-0"
          >
            <!-- Open SisaUang Pro Subscription Period Modal -->
            <button
              type="button"
              class="flex-1 sm:flex-initial min-h-[44px] px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
              :class="
                isUserPro(u)
                  ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100/80 dark:hover:bg-emerald-900/60'
                  : 'border-emerald-500/60 bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
              "
              @click="openSubscriptionModal(u)"
            >
              <Crown class="w-4 h-4 shrink-0" />
              <span>{{ isUserPro(u) ? 'Atur Masa Aktif Pro' : 'Aktifkan SisaUang Pro' }}</span>
            </button>

            <!-- Direct Deactivate Pro Button when already Pro -->
            <button
              v-if="isUserPro(u)"
              type="button"
              class="flex-1 sm:flex-initial min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
              @click="handleDeactivateProSubscription(u)"
            >
              <span>Nonaktifkan Pro</span>
            </button>

            <button
              type="button"
              class="flex-1 sm:flex-initial min-h-[44px] px-3.5 py-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
              :class="
                u.status === 'active'
                  ? 'border-amber-200 dark:border-amber-900/60 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40'
                  : 'border-emerald-200 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
              "
              @click="adminStore.toggleUserBlockStatus(u)"
            >
              <Ban v-if="u.status === 'active'" class="w-4 h-4 shrink-0" />
              <CheckCircle2 v-else class="w-4 h-4 shrink-0" />
              <span>{{ u.status === 'active' ? t('admin.blockUser') : t('admin.unblockUser') }}</span>
            </button>

            <button
              type="button"
              class="min-h-[44px] px-4 py-2 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
              @click="adminStore.removeUserAccount(u)"
            >
              <Trash2 class="w-4 h-4 shrink-0" />
              <span>{{ t('admin.deleteUser') }}</span>
            </button>
          </div>
          <div v-else class="text-xs font-mono text-emerald-600 dark:text-emerald-400 shrink-0">
            Akun Utama Terlindungi
          </div>
        </div>
      </div>
    </section>

    <!-- MODULE 2: Real-Time Activity Logs -->
    <section v-else-if="activeSection === 'logs'" class="space-y-4">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div class="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/90 rounded-xl self-start">
          <button
            v-for="sev in (['all', 'info', 'warning', 'critical'] as const)"
            :key="sev"
            type="button"
            class="px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors"
            :class="
              logSeverityFilter === sev
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            "
            @click="logSeverityFilter = sev"
          >
            {{ sev === 'all' ? 'Semua' : sev }}
          </button>
        </div>

        <div class="relative w-full sm:w-72">
          <Search class="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            v-model="logSearch"
            type="text"
            placeholder="Cari aktivitas atau email..."
            class="w-full min-h-[42px] pl-10 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
          />
        </div>
      </div>

      <div
        class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800/80"
      >
        <div
          v-for="log in filteredLogs"
          :key="log.id"
          class="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
        >
          <div class="space-y-1 min-w-0">
            <div class="text-sm font-medium text-slate-900 dark:text-slate-100">
              {{ log.detail }}
            </div>
            <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400 font-mono">
              <span
                class="font-semibold uppercase"
                :class="
                  log.severity === 'critical'
                    ? 'text-rose-600 dark:text-rose-400'
                    : log.severity === 'warning'
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-emerald-600 dark:text-emerald-400'
                "
              >
                {{ log.severity }}
              </span>
              <span aria-hidden="true">·</span>
              <span>{{ log.action }}</span>
              <span aria-hidden="true">·</span>
              <span>{{ log.actorEmail }}</span>
            </div>
          </div>

          <div class="text-xs font-mono tabular-nums text-slate-400 shrink-0">
            {{ formatTimestamp(log.createdAt) }}
          </div>
        </div>
      </div>
    </section>

    <!-- MODULE 3: Security & Suspicious Activity Alerts -->
    <section v-else class="space-y-4">
      <div class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div class="text-xs text-slate-600 dark:text-slate-400">
          Uji sistem deteksi dini & notifikasi instan dengan memicu salah satu skenario ancaman:
        </div>
        <div class="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            class="min-h-[38px] px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-900/60 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
            @click="adminStore.simulateSuspiciousActivity('brute_force')"
          >
            Simulasi Brute-Force
          </button>
          <button
            type="button"
            class="min-h-[38px] px-3 py-1.5 rounded-xl border border-amber-200 dark:border-amber-900/60 text-xs font-semibold text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors"
            @click="adminStore.simulateSuspiciousActivity('impossible_travel')"
          >
            Simulasi Lokasi Ganda
          </button>
          <button
            type="button"
            class="min-h-[38px] px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-900/60 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
            @click="adminStore.simulateSuspiciousActivity('privilege_escalation')"
          >
            Simulasi Injeksi Role
          </button>
        </div>
      </div>

      <div
        class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800/80"
      >
        <div
          v-for="al in adminStore.alerts"
          :key="al.id"
          class="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div class="space-y-1 min-w-0">
            <div class="flex items-center gap-2">
              <span
                class="text-sm font-semibold"
                :class="
                  al.status === 'open'
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-slate-600 dark:text-slate-400 line-through'
                "
              >
                {{ al.title }}
              </span>
              <span aria-hidden="true" class="text-slate-400">·</span>
              <span class="text-xs font-mono uppercase text-slate-500">
                {{ al.status === 'open' ? 'Aktif' : 'Selesai' }}
              </span>
            </div>

            <p class="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {{ al.description }}
            </p>

            <div class="flex items-center gap-2 text-xs text-slate-400 font-mono tabular-nums">
              <span>Target/Aktor: {{ al.actorEmail }}</span>
              <span aria-hidden="true">·</span>
              <span>{{ formatTimestamp(al.createdAt) }}</span>
            </div>
          </div>

          <button
            v-if="al.status === 'open'"
            type="button"
            class="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 shrink-0 self-end sm:self-center transition-colors whitespace-nowrap"
            @click="adminStore.resolveSecurityAlert(al.id)"
          >
            <CheckCircle2 class="w-3.5 h-3.5" />
            <span>{{ t('admin.resolveAlert') }}</span>
          </button>
        </div>
      </div>
    </section>

    <!-- =================================================================== -->
    <!-- MODAL: Atur Paket & Masa Aktif Langganan SisaUang Pro               -->
    <!-- =================================================================== -->
    <AppModal
      v-model="subscriptionModalOpen"
      title="Atur Langganan SisaUang Pro"
      subtitle="Pilih paket langganan (Bulanan atau Tahunan) dan tentukan batas tanggal masa aktif pengguna."
      max-width="md"
    >
      <form
        v-if="selectedSubUser"
        id="pro-subscription-form"
        class="space-y-4"
        @submit.prevent="handleSaveProSubscription"
      >
        <!-- Target User Card -->
        <div class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3.5 flex items-center justify-between gap-3">
          <div class="min-w-0">
            <div class="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
              {{ selectedSubUser.displayName }}
            </div>
            <div class="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate mt-0.5">
              {{ selectedSubUser.email }}
            </div>
          </div>
          <span
            class="px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0"
            :class="
              isUserPro(selectedSubUser)
                ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300'
                : 'bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
            "
          >
            {{ isUserPro(selectedSubUser) ? 'PRO AKTIF' : 'PAKET FREE' }}
          </span>
        </div>

        <!-- Pilihan Paket Langganan: Bulanan vs Tahunan -->
        <div class="space-y-2">
          <label class="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
            1. Pilih Paket Langganan SisaUang Pro
          </label>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <!-- Paket Bulanan -->
            <button
              type="button"
              class="rounded-2xl border p-3.5 text-left transition-all cursor-pointer flex flex-col justify-between gap-2"
              :class="
                selectedSubPlan === 'monthly'
                  ? 'border-emerald-600 dark:border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/40 ring-2 ring-emerald-500/20'
                  : 'border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-emerald-500/40'
              "
              @click="selectSubscriptionPlan('monthly')"
            >
              <div class="flex items-center justify-between gap-2">
                <span class="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                  Langganan Bulanan
                </span>
                <div
                  class="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                  :class="
                    selectedSubPlan === 'monthly'
                      ? 'bg-emerald-600 text-white'
                      : 'border border-slate-300 dark:border-slate-700'
                  "
                >
                  <Check v-if="selectedSubPlan === 'monthly'" class="w-3 h-3 stroke-[3]" />
                </div>
              </div>
              <p class="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Masa aktif standar 1 bulan ke depan (dapat disesuaikan).
              </p>
            </button>

            <!-- Paket Tahunan -->
            <button
              type="button"
              class="rounded-2xl border p-3.5 text-left transition-all cursor-pointer flex flex-col justify-between gap-2"
              :class="
                selectedSubPlan === 'yearly'
                  ? 'border-emerald-600 dark:border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/40 ring-2 ring-emerald-500/20'
                  : 'border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-emerald-500/40'
              "
              @click="selectSubscriptionPlan('yearly')"
            >
              <div class="flex items-center justify-between gap-2">
                <span class="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                  Langganan Tahunan
                </span>
                <div
                  class="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                  :class="
                    selectedSubPlan === 'yearly'
                      ? 'bg-emerald-600 text-white'
                      : 'border border-slate-300 dark:border-slate-700'
                  "
                >
                  <Check v-if="selectedSubPlan === 'yearly'" class="w-3 h-3 stroke-[3]" />
                </div>
              </div>
              <p class="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Masa aktif penuh selama 1 tahun (12 bulan) ke depan.
              </p>
            </button>
          </div>
        </div>

        <!-- Tanggal Berakhir Masa Aktif -->
        <div class="space-y-2.5">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <label class="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
              2. Batas Masa Aktif Langganan
            </label>
            <div class="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                class="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-[11px] font-semibold text-slate-700 dark:text-slate-300 hover:border-emerald-500 transition-colors cursor-pointer"
                @click="applyDurationMonthsPreset(1)"
              >
                +1 Bulan
              </button>
              <button
                type="button"
                class="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-[11px] font-semibold text-slate-700 dark:text-slate-300 hover:border-emerald-500 transition-colors cursor-pointer"
                @click="applyDurationMonthsPreset(3)"
              >
                +3 Bulan
              </button>
              <button
                type="button"
                class="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-[11px] font-semibold text-slate-700 dark:text-slate-300 hover:border-emerald-500 transition-colors cursor-pointer"
                @click="applyDurationMonthsPreset(6)"
              >
                +6 Bulan
              </button>
              <button
                type="button"
                class="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-[11px] font-semibold text-slate-700 dark:text-slate-300 hover:border-emerald-500 transition-colors cursor-pointer"
                @click="applyDurationMonthsPreset(12)"
              >
                +1 Tahun
              </button>
            </div>
          </div>

          <MaterialDatePicker
            v-model="selectedSubExpiresAt"
            label="Berlaku Sampai Tanggal"
          />

          <div class="rounded-xl border border-emerald-200/80 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/30 p-3 flex items-center justify-between gap-2 text-xs">
            <span class="text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
              <Calendar class="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>Ringkasan Masa Aktif:</span>
            </span>
            <strong class="font-mono text-emerald-700 dark:text-emerald-300">
              {{ selectedSubPlan === 'yearly' ? 'Tahunan' : 'Bulanan' }} · s/d {{ formatExpiryDateLabel(selectedSubExpiresAt) }}
            </strong>
          </div>
        </div>
      </form>

      <template #footer>
        <div v-if="selectedSubUser" class="flex flex-wrap items-center justify-between gap-2 w-full">
          <button
            v-if="isUserPro(selectedSubUser)"
            type="button"
            :disabled="isSavingSubscription"
            class="min-h-[46px] px-4 py-2.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors shrink-0 cursor-pointer disabled:opacity-50"
            @click="handleDeactivateProSubscription()"
          >
            <span>Nonaktifkan Pro</span>
          </button>
          <div v-else></div>

          <button
            type="submit"
            form="pro-subscription-form"
            :disabled="isSavingSubscription || !selectedSubExpiresAt"
            class="flex-1 sm:flex-initial min-h-[46px] px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
          >
            <Crown class="w-4 h-4 shrink-0" />
            <span>
              {{ isUserPro(selectedSubUser) ? 'Simpan Masa Aktif Pro' : 'Aktifkan SisaUang Pro' }}
            </span>
          </button>
        </div>
      </template>
    </AppModal>
  </div>
</template>
