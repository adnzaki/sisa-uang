<script setup lang="ts">
import { useAuthStore } from '../stores/auth';
import LandingView from './LandingView.vue';
import DashboardView from './DashboardView.vue';
import ControlPanelView from './ControlPanelView.vue';

const authStore = useAuthStore();
</script>

<template>
  <div class="w-full">
    <ControlPanelView v-if="authStore.isAuthenticated && authStore.isSuperAdmin" />
    <DashboardView v-else-if="authStore.isAuthenticated" />
    <LandingView v-else />
  </div>
</template>
