import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import { i18n } from './i18n';
import { initPWAListeners } from './composables/usePWA';
import './index.css';

// Initialize PWA Service Worker registration, update detection & install listeners
initPWAListeners();

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);
app.use(i18n);

app.mount('#app');
