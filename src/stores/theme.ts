import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { i18n } from '../i18n';

export type ThemeMode = 'light' | 'dark' | 'system';
export type CurrencyCode = 'IDR' | 'USD';

export const useThemeStore = defineStore('theme', () => {
  const themeMode = ref<ThemeMode>(
    (localStorage.getItem('sisa_uang_theme') as ThemeMode) || 'system'
  );
  const currency = ref<CurrencyCode>(
    (localStorage.getItem('sisa_uang_currency') as CurrencyCode) || 'IDR'
  );
  const systemPrefersDark = ref<boolean>(
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false
  );

  const resolvedTheme = computed<'light' | 'dark'>(() => {
    if (themeMode.value === 'system') {
      return systemPrefersDark.value ? 'dark' : 'light';
    }
    return themeMode.value;
  });

  function applyThemeToDom() {
    if (typeof document === 'undefined') return;
    const isDark = resolvedTheme.value === 'dark';
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
  }

  function setTheme(mode: ThemeMode) {
    themeMode.value = mode;
    localStorage.setItem('sisa_uang_theme', mode);
    applyThemeToDom();
  }

  function setCurrency(code: CurrencyCode) {
    currency.value = code;
    localStorage.setItem('sisa_uang_currency', code);
  }

  function setLocale(loc: 'id' | 'en') {
    i18n.global.locale.value = loc;
    localStorage.setItem('sisa_uang_locale', loc);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = loc;
    }
  }

  function formatMoney(amountInIdr: number): string {
    if (currency.value === 'USD') {
      const usdVal = amountInIdr / 15850;
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(usdVal);
    }
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amountInIdr);
  }

  function initThemeListener() {
    applyThemeToDom();
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      mediaQuery.addEventListener('change', (e) => {
        systemPrefersDark.value = e.matches;
        if (themeMode.value === 'system') {
          applyThemeToDom();
        }
      });
    }
  }

  return {
    themeMode,
    resolvedTheme,
    currency,
    setTheme,
    setCurrency,
    setLocale,
    formatMoney,
    initThemeListener,
  };
});
