import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface PopupBannerItem {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  detail?: string | null;
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

export const useNotificationStore = defineStore('notification', () => {
  const banners = ref<PopupBannerItem[]>([]);
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  // Global Confirmation Modal State
  const confirmDialog = ref<ConfirmDialogOptions | null>(null);
  let confirmResolver: ((confirmed: boolean) => void) | null = null;

  // Global Official Release Notes / Changelog Modal State (v1.0.0-rc.3)
  const changelogModalOpen = ref(false);

  function openChangelogModal() {
    changelogModalOpen.value = true;
  }

  function closeChangelogModal() {
    changelogModalOpen.value = false;
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
          mainMessage = String(parsed.error);
          detailMessage = `Operasi Firestore: ${parsed.operationType || 'write'} · Path: ${parsed.path || '-'}`;
        } else {
          mainMessage = rawError.message;
        }
      } catch {
        mainMessage = rawError.message;
      }
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
    showPopup,
    notifySuccess,
    notifyError,
    dismissBanner,
    clearAll,
  };
});
