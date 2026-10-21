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

// Mount Vue app once router has completed initial navigation resolution
router.isReady().then(() => {
  // Defensive DOM cleanup: remove any stray sibling elements in body (e.g. from legacy prerender leaks or caches)
  if (typeof document !== 'undefined') {
    const appEl = document.getElementById('app');
    if (appEl) {
      appEl.innerHTML = '';
    }
    const straySiblings = Array.from(document.body.children).filter(
      (el) => el.id !== 'app' && el.tagName !== 'SCRIPT' && el.tagName !== 'NOSCRIPT' && el.tagName !== 'LINK'
    );
    straySiblings.forEach((el) => el.remove());
  }

  app.mount('#app');
});
