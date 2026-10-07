import { ref, computed, onMounted, onBeforeUnmount } from 'vue';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

// Shared reactive singleton state across all mounted PWA components
const deferredPrompt = ref<BeforeInstallPromptEvent | null>(null);
const isInstalled = ref(false);
const isIOS = ref(false);
const isInIframe = ref(false);
const isOnline = ref(typeof navigator !== 'undefined' ? navigator.onLine : true);
let listenersInitialized = false;

function checkEnvironment() {
  if (typeof window === 'undefined') return;

  const standaloneMatch =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;

  isInstalled.value = standaloneMatch;

  const ua = window.navigator.userAgent.toLowerCase();
  isIOS.value = /iphone|ipad|ipod/.test(ua);

  try {
    isInIframe.value = window.self !== window.top;
  } catch {
    isInIframe.value = true;
  }

  isOnline.value = window.navigator.onLine;
}

function handleBeforeInstallPrompt(e: Event) {
  e.preventDefault();
  deferredPrompt.value = e as BeforeInstallPromptEvent;
}

function handleAppInstalled() {
  isInstalled.value = true;
  deferredPrompt.value = null;
}

function handleOnline() {
  isOnline.value = true;
}

function handleOffline() {
  isOnline.value = false;
}

export function initPWAListeners() {
  if (typeof window === 'undefined' || listenersInitialized) return;
  listenersInitialized = true;
  checkEnvironment();

  window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  window.addEventListener('appinstalled', handleAppInstalled);
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  const mediaQuery = window.matchMedia('(display-mode: standalone)');
  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener('change', (e) => {
      if (e.matches) {
        isInstalled.value = true;
      }
    });
  }
}

export function usePWA() {
  onMounted(() => {
    initPWAListeners();
    checkEnvironment();
  });

  onBeforeUnmount(() => {
    // Global listeners stay active for the app lifecycle so we never miss beforeinstallprompt
  });

  const isInstallable = computed(() => Boolean(deferredPrompt.value));

  async function install(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
    if (!deferredPrompt.value) {
      return 'unavailable';
    }
    try {
      await deferredPrompt.value.prompt();
      const { outcome } = await deferredPrompt.value.userChoice;
      if (outcome === 'accepted') {
        isInstalled.value = true;
        deferredPrompt.value = null;
        return 'accepted';
      }
      return 'dismissed';
    } catch {
      return 'unavailable';
    }
  }

  return {
    deferredPrompt,
    isInstallable,
    isInstalled,
    isIOS,
    isInIframe,
    isOnline,
    install,
  };
}
