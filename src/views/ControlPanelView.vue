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
} from 'lucide-vue-next';
import { useAdminStore } from '../stores/admin';
import { useAuthStore } from '../stores/auth';

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
const logSeverityFilter = ref<'all' | 'info' | 'warning' | 'critical'>('all');
const logSearch = ref('');

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
  <div class="space-y-6">
    <!-- Control Panel Header -->
    <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
      <div>
        <div class="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium mb-1">
          <Lock class="w-3.5 h-3.5" />
          <span>Endpoint Terproteksi Middleware · /control-panel · {{ authStore.user?.email }}</span>
        </div>
        <h1 class="text-2xl sm:text-3xl font-display italic text-slate-900 dark:text-slate-100">
          {{ t('admin.title') }}
        </h1>
        <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          {{ t('admin.subtitle') }}
        </p>
      </div>

      <!-- Instant Suspicious Activity Simulation Controls -->
      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          class="min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5 transition-colors whitespace-nowrap"
          @click="adminStore.fetchAdminOverview(false)"
        >
          <RefreshCw class="w-3.5 h-3.5" :class="adminStore.isLoading ? 'animate-spin' : ''" />
          <span>Segarkan Data</span>
        </button>

        <button
          type="button"
          class="min-h-[42px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
          @click="adminStore.simulateSuspiciousActivity('brute_force')"
        >
          <Zap class="w-3.5 h-3.5" />
          <span>{{ t('admin.simulateAlert') }}</span>
        </button>
      </div>
    </div>

    <!-- Top Summary Metrics Grid -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
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

      <div class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-1">
        <div class="text-xs text-slate-500 dark:text-slate-400">
          {{ t('admin.blockedUsers') }}
        </div>
        <div class="text-2xl font-mono font-bold tabular-nums text-amber-600 dark:text-amber-400">
          {{ adminStore.blockedUsersCount }}
        </div>
      </div>

      <div class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-1">
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
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
            Semua
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

        <!-- Search Input -->
        <div class="relative w-full sm:w-72">
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
          class="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors"
        >
          <div class="space-y-1 min-w-0">
            <div class="flex items-center gap-2">
              <span class="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                {{ u.displayName }}
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
              <span>Provider: {{ u.authProvider === 'google' ? 'Google OAuth' : 'Email/Username & Sandi' }}</span>
              <span aria-hidden="true">·</span>
              <span class="font-mono tabular-nums">Update: {{ formatTimestamp(u.updatedAt) }}</span>
            </div>
          </div>

          <!-- Real-Time Action Buttons (Block / Unblock & Delete) -->
          <div
            v-if="u.email.toLowerCase() !== 'vuedevo@gmail.com'"
            class="flex items-center gap-2 self-end sm:self-center shrink-0"
          >
            <button
              type="button"
              class="min-h-[40px] px-3.5 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
              :class="
                u.status === 'active'
                  ? 'border-amber-200 dark:border-amber-900/60 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40'
                  : 'border-emerald-200 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
              "
              @click="adminStore.toggleUserBlockStatus(u)"
            >
              <Ban v-if="u.status === 'active'" class="w-3.5 h-3.5" />
              <CheckCircle2 v-else class="w-3.5 h-3.5" />
              <span>{{ u.status === 'active' ? t('admin.blockUser') : t('admin.unblockUser') }}</span>
            </button>

            <button
              type="button"
              class="min-h-[40px] px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap"
              @click="adminStore.removeUserAccount(u)"
            >
              <Trash2 class="w-3.5 h-3.5" />
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
  </div>
</template>
