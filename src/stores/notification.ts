import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface PopupBannerItem {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  detail?: string | null;
  errorCode?: string | null;
  actionLabel?: string;
  actionRoute?: string;
  createdAt: number;
}

export interface ConfirmDialogOptions {
  title: string;
  message: string;
  detail?: string | null;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning';
}

export interface ProModalOptions {
  featureTitle: string;
  featureDescription: string;
  limitSummary?: string;
}

export const useNotificationStore = defineStore('notification', () => {
  const banners = ref<PopupBannerItem[]>([]);
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  // Global Confirmation Modal State
  const confirmDialog = ref<ConfirmDialogOptions | null>(null);
  let confirmResolver: ((confirmed: boolean) => void) | null = null;

  // Global Official Release Notes / Changelog Modal State (v1.0.0-rc.4)
  const changelogModalOpen = ref(false);

  // Global SisaUang Pro Subscription Prompt Modal State
  const proModalOptions = ref<ProModalOptions | null>(null);

  function openChangelogModal() {
    changelogModalOpen.value = true;
  }

  function closeChangelogModal() {
    changelogModalOpen.value = false;
  }

  function openProModal(options?: Partial<ProModalOptions>) {
    proModalOptions.value = {
      featureTitle: options?.featureTitle || 'Fitur Eksklusif SisaUang Pro',
      featureDescription:
        options?.featureDescription ||
        'Fitur ini hanya tersedia untuk pelanggan SisaUang Pro. Berlangganan SisaUang Pro untuk membuka seluruh batasan akun.',
      limitSummary: options?.limitSummary,
    };
  }

  function closeProModal() {
    proModalOptions.value = null;
  }

  function requestConfirmation(options: ConfirmDialogOptions): Promise<boolean> {
    if (confirmResolver) {
      confirmResolver(false);
      confirmResolver = null;
    }
    confirmDialog.value = {
      title: options.title,
      message: options.message,
      detail: options.detail || null,
      confirmLabel: options.confirmLabel || 'Ya, Hapus',
      cancelLabel: options.cancelLabel || 'Batal',
      variant: options.variant || 'danger',
    };
    return new Promise<boolean>((resolve) => {
      confirmResolver = resolve;
    });
  }

  function resolveConfirmation(confirmed: boolean) {
    const resolver = confirmResolver;
    confirmResolver = null;
    confirmDialog.value = null;
    if (resolver) {
      resolver(confirmed);
    }
  }

  function dismissBanner(id: string) {
    const timer = timers.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.delete(id);
    }
    banners.value = banners.value.filter((b) => b.id !== id);
  }

  function clearAll() {
    for (const t of timers.values()) {
      clearTimeout(t);
    }
    timers.clear();
    banners.value = [];
  }

  function showPopup(options: {
    type: 'success' | 'error' | 'warning' | 'info';
    title: string;
    message: string;
    detail?: string | null;
    errorCode?: string | null;
    actionLabel?: string;
    actionRoute?: string;
    durationMs?: number;
  }): string {
    const id = `popup_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const item: PopupBannerItem = {
      id,
      type: options.type,
      title: options.title,
      message: options.message,
      detail: options.detail || null,
      errorCode: options.errorCode || null,
      actionLabel: options.actionLabel,
      actionRoute: options.actionRoute,
      createdAt: Date.now(),
    };

    // Keep maximum 3 stacked banners at the top of the screen
    banners.value.unshift(item);
    if (banners.value.length > 3) {
      const removed = banners.value.pop();
      if (removed) {
        const oldTimer = timers.get(removed.id);
        if (oldTimer) {
          clearTimeout(oldTimer);
          timers.delete(removed.id);
        }
      }
    }

    const duration =
      options.durationMs ?? (options.type === 'error' ? 10000 : 6500);
    if (duration > 0) {
      const timer = setTimeout(() => {
        dismissBanner(id);
      }, duration);
      timers.set(id, timer);
    }

    return id;
  }

  function isQuotaLimitError(rawError: unknown): boolean {
    const anyErr = rawError as any;
    const code = String(anyErr?.code || '').toLowerCase();
    const msg = String(anyErr?.message || rawError || '').toLowerCase();
    const respErr = String(anyErr?.response?.data?.error || '').toLowerCase();
    return (
      code === 'resource-exhausted' ||
      code.includes('resource-exhausted') ||
      msg.includes('resource-exhausted') ||
      msg.includes('quota limit exceeded') ||
      msg.includes('quota exceeded') ||
      msg.includes('free daily read units') ||
      msg.includes('kuota baca harian gratis') ||
      msg.includes('db-unhandled') ||
      respErr.includes('resource-exhausted') ||
      respErr.includes('quota') ||
      respErr.includes('db-unhandled')
    );
  }

  function notifyQuotaExceeded(): string {
    // Deduplicate if a db-unhandled banner is already visible
    const existing = banners.value.find((b) => b.errorCode === 'db-unhandled');
    if (existing) {
      return existing.id;
    }
    return showPopup({
      type: 'error',
      title: 'Pemberitahuan Sistem',
      message: 'Terjadi kesalahan sistem, mohon maaf atas ketidaknyamannya',
      detail: null,
      errorCode: 'db-unhandled',
      durationMs: 12000,
    });
  }

  function notifySuccess(
    title: string,
    message: string,
    extra?: { detail?: string | null; actionLabel?: string; actionRoute?: string; durationMs?: number }
  ) {
    return showPopup({
      type: 'success',
      title,
      message,
      detail: extra?.detail,
      actionLabel: extra?.actionLabel,
      actionRoute: extra?.actionRoute,
      durationMs: extra?.durationMs,
    });
  }

  function notifyError(
    title: string,
    rawError: unknown,
    fallbackMsg = 'Terjadi kesalahan saat memproses permintaan.'
  ) {
    if (isQuotaLimitError(rawError) || isQuotaLimitError(fallbackMsg)) {
      return notifyQuotaExceeded();
    }

    let mainMessage = fallbackMsg;
    let detailMessage: string | null = null;

    const anyErr = rawError as any;
    if (typeof rawError === 'string') {
      mainMessage = rawError;
    } else if (anyErr?.response?.data?.error) {
      mainMessage = String(anyErr.response.data.error);
      if (anyErr?.response?.status) {
        detailMessage = `HTTP Status ${anyErr.response.status}`;
      }
    } else if (rawError instanceof Error) {
      try {
        const parsed = JSON.parse(rawError.message);
        if (parsed && parsed.error) {
          if (isQuotaLimitError(parsed.error)) {
            return notifyQuotaExceeded();
          }
          mainMessage = String(parsed.error);
          detailMessage = `Operasi Firestore: ${parsed.operationType || 'write'} · Path: ${parsed.path || '-'}`;
        } else {
          mainMessage = rawError.message;
        }
      } catch {
        mainMessage = rawError.message;
      }
    }

    if (isQuotaLimitError(mainMessage)) {
      return notifyQuotaExceeded();
    }

    return showPopup({
      type: 'error',
      title,
      message: mainMessage,
      detail: detailMessage,
      durationMs: 10000,
    });
  }

  return {
    banners,
    confirmDialog,
    requestConfirmation,
    resolveConfirmation,
    changelogModalOpen,
    openChangelogModal,
    closeChangelogModal,
    proModalOptions,
    openProModal,
    closeProModal,
    showPopup,
    notifyQuotaExceeded,
    notifySuccess,
    notifyError,
    dismissBanner,
    clearAll,
  };
});
