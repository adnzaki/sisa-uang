import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { registerSW } from 'virtual:pwa-register';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const RELOAD_ATTEMPT_KEY = 'sisa_uang_update_reload_attempt';
const RELOAD_COUNT_KEY = 'sisa_uang_update_reload_count';
const KNOWN_BUILD_HASH_KEY = 'sisa_uang_known_build_hash';

// Shared reactive singleton state across all mounted PWA components
const deferredPrompt = ref<BeforeInstallPromptEvent | null>(null);
const isInstalled = ref(false);
const isIOS = ref(false);
const isInIframe = ref(false);
const isOnline = ref(typeof navigator !== 'undefined' ? navigator.onLine : true);

// App Update & Reload State
const needRefresh = ref(false);
const isReloadingForUpdate = ref(false);
const reloadDidNotUpdate = ref(false);
const reloadAttemptCount = ref(0);
const currentAppVersion = ref('1.0.0-rc.4');
const currentBuildHash = ref<string | null>(null);
const latestServerBuildHash = ref<string | null>(null);

let listenersInitialized = false;
let swRegistered = false;
let versionPollTimer: ReturnType<typeof setInterval> | null = null;
let updateSWFn: ((reloadPage?: boolean) => Promise<void>) | null = null;

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
  checkForAppUpdates();
}

function handleOffline() {
  isOnline.value = false;
}

function markUpdateDetected(newServerHash?: string | null) {
  if (newServerHash) {
    latestServerBuildHash.value = newServerHash;
  }
  needRefresh.value = true;

  // Check if the user just clicked reload recently (< 90s ago) and the app is still showing an un-updated state
  try {
    const rawAttempt = sessionStorage.getItem(RELOAD_ATTEMPT_KEY);
    const count = Number(sessionStorage.getItem(RELOAD_COUNT_KEY) || '0');
    reloadAttemptCount.value = count;
    if (rawAttempt) {
      const parsed = JSON.parse(rawAttempt) as { ts: number; targetHash?: string | null };
      if (Date.now() - parsed.ts < 90000) {
        reloadDidNotUpdate.value = true;
      }
    }
  } catch {
    // Ignore storage error
  }
}

export async function checkForAppUpdates(): Promise<boolean> {
  if (typeof window === 'undefined' || !navigator.onLine) return false;

  // 1. Trigger Service Worker update check if supported
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.update();
        if (reg.waiting) {
          markUpdateDetected();
          return true;
        }
      }
    }
  } catch {
    // Ignore SW check error
  }

  // 2. Check live server build hash (/api/app-version) with cache-busting query
  try {
    const res = await fetch(`/api/app-version?_t=${Date.now()}`, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    });
    if (res.ok) {
      const data = (await res.json()) as { version?: string; buildHash?: string };
      if (data.version) {
        currentAppVersion.value = data.version;
      }
      if (data.buildHash) {
        if (!currentBuildHash.value) {
          // First load in this tab lifecycle
          const previousAttemptRaw = sessionStorage.getItem(RELOAD_ATTEMPT_KEY);
          const savedKnownHash = localStorage.getItem(KNOWN_BUILD_HASH_KEY);
          currentBuildHash.value = data.buildHash;
          localStorage.setItem(KNOWN_BUILD_HASH_KEY, data.buildHash);

          if (previousAttemptRaw) {
            try {
              const parsed = JSON.parse(previousAttemptRaw) as {
                ts: number;
                fromHash?: string | null;
                targetHash?: string | null;
              };
              // If the user reloaded because of a waiting SW or hash mismatch, and SW is still waiting or hash didn't advance
              if (
                Date.now() - parsed.ts < 90000 &&
                parsed.fromHash &&
                parsed.targetHash &&
                parsed.fromHash === data.buildHash &&
                parsed.targetHash !== data.buildHash
              ) {
                reloadDidNotUpdate.value = true;
                needRefresh.value = true;
              } else {
                sessionStorage.removeItem(RELOAD_ATTEMPT_KEY);
                sessionStorage.removeItem(RELOAD_COUNT_KEY);
                reloadAttemptCount.value = 0;
              }
            } catch {
              sessionStorage.removeItem(RELOAD_ATTEMPT_KEY);
            }
          } else if (savedKnownHash && savedKnownHash !== data.buildHash) {
            localStorage.setItem(KNOWN_BUILD_HASH_KEY, data.buildHash);
          }
        } else if (data.buildHash !== currentBuildHash.value) {
          markUpdateDetected(data.buildHash);
          return true;
        }
      }
    }
  } catch {
    // Ignore network error
  }

  return needRefresh.value;
}

export async function performFullAppReload(forcePurgeCaches = false): Promise<void> {
  if (typeof window === 'undefined') return;
  isReloadingForUpdate.value = true;

  try {
    const prevCount = Number(sessionStorage.getItem(RELOAD_COUNT_KEY) || '0');
    const nextCount = prevCount + 1;
    sessionStorage.setItem(RELOAD_COUNT_KEY, String(nextCount));
    reloadAttemptCount.value = nextCount;
    sessionStorage.setItem(
      RELOAD_ATTEMPT_KEY,
      JSON.stringify({
        ts: Date.now(),
        fromHash: currentBuildHash.value,
        targetHash: latestServerBuildHash.value,
      })
    );
    if (latestServerBuildHash.value) {
      localStorage.setItem(KNOWN_BUILD_HASH_KEY, latestServerBuildHash.value);
    }
  } catch {
    // Ignore storage errors
  }

  try {
    // If user already reloaded once and it still didn't update (or requested force purge),
    // unregister all Service Workers and delete all CacheStorage entries before hard navigation.
    if (forcePurgeCaches || reloadDidNotUpdate.value || reloadAttemptCount.value > 1) {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(
          registrations.map(async (reg) => {
            try {
              reg.waiting?.postMessage({ type: 'SKIP_WAITING' });
              await reg.unregister();
            } catch {
              // Ignore
            }
          })
        );
      }
      if ('caches' in window) {
        const cacheNames = await window.caches.keys();
        await Promise.all(cacheNames.map((name) => window.caches.delete(name)));
      }
    } else {
      // Standard full update reload: tell waiting SW to skipWaiting & clear outdated caches
      if (updateSWFn) {
        try {
          await updateSWFn(true);
        } catch {
          // Fallback to manual reload below
        }
      }
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg?.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      }
    }
  } catch {
    // Ignore cleanup errors and proceed with full reload
  }

  // Perform a full cache-busting reload of the page
  const url = new URL(window.location.href);
  url.searchParams.set('_app_v', String(Date.now()));
  window.location.replace(url.toString());
}

export function dismissUpdateNotice() {
  needRefresh.value = false;
  reloadDidNotUpdate.value = false;
}

export function initPWAListeners() {
  if (typeof window === 'undefined') return;

  if (!swRegistered) {
    swRegistered = true;
    try {
      updateSWFn = registerSW({
        immediate: true,
        onNeedRefresh() {
          markUpdateDetected();
        },
        onRegisteredSW(_swUrl, registration) {
          if (registration?.waiting) {
            markUpdateDetected();
          }
          if (registration) {
            registration.addEventListener('updatefound', () => {
              const installingWorker = registration.installing;
              if (!installingWorker) return;
              installingWorker.addEventListener('statechange', () => {
                if (
                  installingWorker.state === 'installed' &&
                  navigator.serviceWorker.controller
                ) {
                  markUpdateDetected();
                }
              });
            });
          }
        },
      });
    } catch {
      // Ignore if virtual:pwa-register is unavailable
    }
  }

  if (listenersInitialized) return;
  listenersInitialized = true;
  checkEnvironment();

  // Clean up any temporary cache-busting query param from URL bar without triggering reload
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has('_app_v')) {
      url.searchParams.delete('_app_v');
      window.history.replaceState(window.history.state, '', url.toString());
    }
  } catch {
    // Ignore
  }

  window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  window.addEventListener('appinstalled', handleAppInstalled);
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkForAppUpdates();
    }
  });

  const mediaQuery = window.matchMedia('(display-mode: standalone)');
  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener('change', (e) => {
      if (e.matches) {
        isInstalled.value = true;
      }
    });
  }

  // Initial check and periodic 45-second check for new app versions
  checkForAppUpdates();
  if (!versionPollTimer) {
    versionPollTimer = setInterval(() => {
      checkForAppUpdates();
    }, 45000);
  }
}

export function usePWA() {
  onMounted(() => {
    initPWAListeners();
    checkEnvironment();
  });

  onBeforeUnmount(() => {
    // Global listeners stay active for the app lifecycle so we never miss beforeinstallprompt or SW updates
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
    needRefresh,
    isReloadingForUpdate,
    reloadDidNotUpdate,
    reloadAttemptCount,
    currentAppVersion,
    currentBuildHash,
    install,
    checkForAppUpdates,
    performFullAppReload,
    dismissUpdateNotice,
  };
}
