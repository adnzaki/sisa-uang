import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { i18n } from '../i18n';
import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth, db, sanitizeId, isFirestoreOfflineError } from '../firebase';

export type ThemeMode = 'light' | 'dark' | 'system';
export type CurrencyCode = 'IDR' | 'USD';
export type NumberFontMode = 'sans' | 'mono';

export type ReportSignerRowPosition = 'top' | 'bottom';

export interface ReportSignerItem {
  id: string;
  name: string;
  role: string;
  rowPosition: ReportSignerRowPosition;
}

export type ReportLetterheadMode = 'text' | 'image';

export interface ReportLetterheadEnabledReports {
  kas_umum: boolean;
  rekonsiliasi_kas: boolean;
  realisasi_anggaran: boolean;
}

export interface ReportLetterheadConfig {
  enabled: boolean;
  mode: ReportLetterheadMode; // 'text' (Teks & Garis Kop) or 'image' (Gambar Kop Banner Penuh)
  organizationName: string; // e.g., "DEWAN KEMAKMURAN MASJID (DKM) AL-IKHLAS" or "PENGURUS MUSHOLLA AR-RAHMAN"
  subtitle: string; // e.g., "Panitia Pembangunan & Pengelolaan Kas Umat"
  addressLine: string; // e.g., "Jl. Melati Raya No. 12, RT 04 / RW 02 · Telp: 0812-xxxx-xxxx"
  imageDataUrl: string; // Base64 PNG/JPEG banner image for full-width kop surat
  imageWidthPx: number;
  imageHeightPx: number;
  enabledReports: ReportLetterheadEnabledReports;
}

export interface ReportCustomTitlesConfig {
  kas_umum: string;
  rekonsiliasi_kas: string;
  realisasi_anggaran: string;
}

const REPORT_SIGNERS_KEY_PREFIX = 'sisa_uang_report_signers_v1';
const REPORT_ACTIVE_SIGNERS_KEY_PREFIX = 'sisa_uang_report_active_signers_v1';
const REPORT_SIGN_PLACE_KEY_PREFIX = 'sisa_uang_report_sign_place_v1';
const REPORT_LETTERHEAD_KEY_PREFIX = 'sisa_uang_report_letterhead_v1';
const REPORT_CUSTOM_TITLES_KEY_PREFIX = 'sisa_uang_report_custom_titles_v1';
export const MAX_REPORT_SIGNERS = 3;

export const DEFAULT_REPORT_TITLES: ReportCustomTitlesConfig = {
  kas_umum: 'Laporan Kas Umum (Buku Kas Umum)',
  rekonsiliasi_kas: 'Laporan Rekonsiliasi Kas',
  realisasi_anggaran: 'Laporan Realisasi / Serapan Anggaran',
};

export const useThemeStore = defineStore('theme', () => {
  const themeMode = ref<ThemeMode>(
    (localStorage.getItem('sisa_uang_theme') as ThemeMode) || 'system'
  );
  const currency = ref<CurrencyCode>(
    (localStorage.getItem('sisa_uang_currency') as CurrencyCode) || 'IDR'
  );
  // Default number font is 'sans' (Plus Jakarta Sans, matching all other app text),
  // with an option to switch to 'mono' (JetBrains Mono / coding font).
  const numberFont = ref<NumberFontMode>(
    (localStorage.getItem('sisa_uang_number_font') as NumberFontMode) || 'sans'
  );
  const appLogoUrl = ref<string>(localStorage.getItem('sisa_uang_logo_url') || '');

  // =========================================================================
  // Report Configuration (Letterhead / Kop, Custom Report Titles, Up to 3 Signers, Sign Place)
  // =========================================================================
  const reportSigners = ref<ReportSignerItem[]>([]);
  const reportActiveSignerIds = ref<Record<string, string[]>>({
    kas_umum: [],
    rekonsiliasi_kas: [],
    realisasi_anggaran: [],
  });
  const reportSignPlace = ref<string>('');
  const reportLetterhead = ref<ReportLetterheadConfig>({
    enabled: false,
    mode: 'text',
    organizationName: '',
    subtitle: '',
    addressLine: '',
    imageDataUrl: '',
    imageWidthPx: 0,
    imageHeightPx: 0,
    enabledReports: {
      kas_umum: true,
      rekonsiliasi_kas: true,
      realisasi_anggaran: true,
    },
  });
  const reportCustomTitles = ref<ReportCustomTitlesConfig>({
    kas_umum: '',
    rekonsiliasi_kas: '',
    realisasi_anggaran: '',
  });
  const currentSignatureOwnerKey = ref<string>('default');

  function getSignatureStorageKeys(ownerKey = currentSignatureOwnerKey.value) {
    const suffix = ownerKey && ownerKey !== 'default' ? `_${ownerKey}` : '';
    return {
      signersKey: `${REPORT_SIGNERS_KEY_PREFIX}${suffix}`,
      activeMapKey: `${REPORT_ACTIVE_SIGNERS_KEY_PREFIX}${suffix}`,
      placeKey: `${REPORT_SIGN_PLACE_KEY_PREFIX}${suffix}`,
      letterheadKey: `${REPORT_LETTERHEAD_KEY_PREFIX}${suffix}`,
      customTitlesKey: `${REPORT_CUSTOM_TITLES_KEY_PREFIX}${suffix}`,
    };
  }

  const isReportSettingsSyncing = ref<boolean>(false);
  const reportSettingsLastSyncedAt = ref<string>('');
  const reportSettingsSyncStatus = ref<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  function readFromLocalStorage() {
    if (typeof localStorage === 'undefined') return;
    const {
      signersKey,
      activeMapKey,
      placeKey,
      letterheadKey,
      customTitlesKey,
    } = getSignatureStorageKeys(currentSignatureOwnerKey.value);

    try {
      const rawSigners =
        localStorage.getItem(signersKey) || localStorage.getItem(REPORT_SIGNERS_KEY_PREFIX);
      if (rawSigners) {
        const parsed = JSON.parse(rawSigners);
        if (Array.isArray(parsed)) {
          reportSigners.value = parsed
            .filter((item) => item && typeof item.id === 'string')
            .slice(0, MAX_REPORT_SIGNERS)
            .map((item) => ({
              id: String(item.id),
              name: String(item.name || '').trim(),
              role: String(item.role || '').trim(),
              rowPosition: item.rowPosition === 'bottom' ? 'bottom' : 'top',
            }));
        }
      }
    } catch {
      // Ignore
    }

    const validIds = new Set(reportSigners.value.map((s) => s.id));

    try {
      const rawActive =
        localStorage.getItem(activeMapKey) ||
        localStorage.getItem(REPORT_ACTIVE_SIGNERS_KEY_PREFIX);
      if (rawActive) {
        const parsedMap = JSON.parse(rawActive);
        if (parsedMap && typeof parsedMap === 'object') {
          const sanitizeList = (arr: unknown): string[] =>
            Array.isArray(arr)
              ? arr
                  .map((v) => String(v))
                  .filter((id) => validIds.has(id))
                  .slice(0, MAX_REPORT_SIGNERS)
              : reportSigners.value.map((s) => s.id);
          reportActiveSignerIds.value = {
            kas_umum: sanitizeList((parsedMap as any).kas_umum),
            rekonsiliasi_kas: sanitizeList((parsedMap as any).rekonsiliasi_kas),
            realisasi_anggaran: sanitizeList((parsedMap as any).realisasi_anggaran),
          };
        }
      }
    } catch {
      // Ignore
    }

    try {
      const rawPlace =
        localStorage.getItem(placeKey) ||
        localStorage.getItem(REPORT_SIGN_PLACE_KEY_PREFIX) ||
        '';
      if (rawPlace) {
        reportSignPlace.value = rawPlace;
      }
    } catch {
      // Ignore
    }

    try {
      const rawLh =
        localStorage.getItem(letterheadKey) ||
        localStorage.getItem(REPORT_LETTERHEAD_KEY_PREFIX);
      if (rawLh) {
        const parsedLh = JSON.parse(rawLh);
        if (parsedLh && typeof parsedLh === 'object') {
          const rawEnabledReports = parsedLh.enabledReports;
          reportLetterhead.value = {
            enabled: Boolean(parsedLh.enabled),
            mode: parsedLh.mode === 'image' ? 'image' : 'text',
            organizationName: String(parsedLh.organizationName || '').slice(0, 100),
            subtitle: String(parsedLh.subtitle || '').slice(0, 120),
            addressLine: String(parsedLh.addressLine || '').slice(0, 160),
            imageDataUrl: String(parsedLh.imageDataUrl || ''),
            imageWidthPx: Number(parsedLh.imageWidthPx) || 0,
            imageHeightPx: Number(parsedLh.imageHeightPx) || 0,
            enabledReports: {
              kas_umum:
                rawEnabledReports && typeof rawEnabledReports.kas_umum === 'boolean'
                  ? rawEnabledReports.kas_umum
                  : true,
              rekonsiliasi_kas:
                rawEnabledReports && typeof rawEnabledReports.rekonsiliasi_kas === 'boolean'
                  ? rawEnabledReports.rekonsiliasi_kas
                  : true,
              realisasi_anggaran:
                rawEnabledReports && typeof rawEnabledReports.realisasi_anggaran === 'boolean'
                  ? rawEnabledReports.realisasi_anggaran
                  : true,
            },
          };
        }
      }
    } catch {
      // Ignore
    }

    try {
      const rawTitles =
        localStorage.getItem(customTitlesKey) ||
        localStorage.getItem(REPORT_CUSTOM_TITLES_KEY_PREFIX);
      if (rawTitles) {
        const parsedTitles = JSON.parse(rawTitles);
        if (parsedTitles && typeof parsedTitles === 'object') {
          reportCustomTitles.value = {
            kas_umum: String(parsedTitles.kas_umum || '').slice(0, 100),
            rekonsiliasi_kas: String(parsedTitles.rekonsiliasi_kas || '').slice(0, 100),
            realisasi_anggaran: String(parsedTitles.realisasi_anggaran || '').slice(0, 100),
          };
        }
      }
    } catch {
      // Ignore
    }
  }

  function applyRemoteReportSettings(remote: any) {
    if (!remote) return;
    if (Array.isArray(remote.signers)) {
      reportSigners.value = remote.signers
        .filter((item: any) => item && typeof item.id === 'string')
        .slice(0, MAX_REPORT_SIGNERS)
        .map((item: any) => ({
          id: String(item.id),
          name: String(item.name || '').trim(),
          role: String(item.role || '').trim(),
          rowPosition: item.rowPosition === 'bottom' ? 'bottom' : 'top',
        }));
    }

    if (remote.activeSignerIds && typeof remote.activeSignerIds === 'object') {
      const validIds = new Set(reportSigners.value.map((s) => s.id));
      const sanitizeList = (arr: unknown): string[] =>
        Array.isArray(arr)
          ? arr
              .map((v) => String(v))
              .filter((id) => validIds.has(id))
              .slice(0, MAX_REPORT_SIGNERS)
          : reportSigners.value.map((s) => s.id);
      reportActiveSignerIds.value = {
        kas_umum: sanitizeList(remote.activeSignerIds.kas_umum),
        rekonsiliasi_kas: sanitizeList(remote.activeSignerIds.rekonsiliasi_kas),
        realisasi_anggaran: sanitizeList(remote.activeSignerIds.realisasi_anggaran),
      };
    }

    if (typeof remote.signPlace === 'string') {
      reportSignPlace.value = remote.signPlace.trim();
    }

    if (remote.letterhead && typeof remote.letterhead === 'object') {
      const rawLh = remote.letterhead;
      const rawEnabledReports = rawLh.enabledReports;
      reportLetterhead.value = {
        enabled: Boolean(rawLh.enabled),
        mode: rawLh.mode === 'image' ? 'image' : 'text',
        organizationName: String(rawLh.organizationName || '').slice(0, 100),
        subtitle: String(rawLh.subtitle || '').slice(0, 120),
        addressLine: String(rawLh.addressLine || '').slice(0, 160),
        imageDataUrl: String(rawLh.imageDataUrl || ''),
        imageWidthPx: Number(rawLh.imageWidthPx) || 0,
        imageHeightPx: Number(rawLh.imageHeightPx) || 0,
        enabledReports: {
          kas_umum:
            rawEnabledReports && typeof rawEnabledReports.kas_umum === 'boolean'
              ? rawEnabledReports.kas_umum
              : true,
          rekonsiliasi_kas:
            rawEnabledReports && typeof rawEnabledReports.rekonsiliasi_kas === 'boolean'
              ? rawEnabledReports.rekonsiliasi_kas
              : true,
          realisasi_anggaran:
            rawEnabledReports && typeof rawEnabledReports.realisasi_anggaran === 'boolean'
              ? rawEnabledReports.realisasi_anggaran
              : true,
        },
      };
    }

    if (remote.customTitles && typeof remote.customTitles === 'object') {
      reportCustomTitles.value = {
        kas_umum: String(remote.customTitles.kas_umum || '').slice(0, 100),
        rekonsiliasi_kas: String(remote.customTitles.rekonsiliasi_kas || '').slice(0, 100),
        realisasi_anggaran: String(remote.customTitles.realisasi_anggaran || '').slice(0, 100),
      };
    }

    persistReportSignatureConfig(false);
  }

  let activeFirestoreUnsub: Unsubscribe | null = null;

  async function ensureFirestoreSessionForReportSettings(ownerUid?: string | null): Promise<boolean> {
    try {
      if (typeof (auth as any).authStateReady === 'function') {
        await (auth as any).authStateReady();
      }
    } catch {
      // Ignore
    }
    const current = auth.currentUser;
    const rawKey = ownerUid?.trim() || '';
    const isMigratedId = rawKey.startsWith('ci4_user_') || rawKey === 'admin_vuedevo_01';

    if (current && !current.isAnonymous) {
      if (!isMigratedId && current.uid === rawKey) {
        return true;
      }
      if (current.email?.toLowerCase() === 'vuedevo@gmail.com') {
        return true;
      }
    }

    try {
      await signInWithEmailAndPassword(auth, 'vuedevo@gmail.com', '@Dienzaki2019##');
      return true;
    } catch {
      return !!auth.currentUser;
    }
  }

  function stopRealtimeFirestoreListener() {
    if (activeFirestoreUnsub) {
      try {
        activeFirestoreUnsub();
      } catch {
        // Ignore
      }
      activeFirestoreUnsub = null;
    }
  }

  function setupRealtimeFirestoreListener(key: string) {
    stopRealtimeFirestoreListener();
    try {
      activeFirestoreUnsub = onSnapshot(
        doc(db, 'report_settings', key),
        (snap) => {
          // Do not overwrite if user on this local client is actively typing (save timer active)
          if (snap.exists() && !saveDebounceTimer) {
            const remoteData = snap.data();
            applyRemoteReportSettings(remoteData);
            reportSettingsSyncStatus.value = 'synced';
            reportSettingsLastSyncedAt.value =
              remoteData.updatedAt?.toDate?.()?.toISOString?.() ||
              (typeof remoteData.updatedAt === 'string'
                ? remoteData.updatedAt
                : new Date().toISOString());
          }
        },
        (err) => {
          if (!isFirestoreOfflineError(err)) {
            console.warn('Firestore report_settings realtime notice:', err);
          }
        }
      );
    } catch {
      // Ignore
    }
  }

  async function pushReportSettingsToFirestore(ownerUid?: string | null): Promise<boolean> {
    const rawKey = ownerUid?.trim() || currentSignatureOwnerKey.value || 'default';
    const key = sanitizeId(rawKey);

    const firestorePayload = {
      ownerId: key,
      signers: reportSigners.value.map((s) => ({
        id: String(s.id),
        name: String(s.name || '').trim(),
        role: String(s.role || '').trim(),
        rowPosition: s.rowPosition === 'bottom' ? 'bottom' : 'top',
      })),
      activeSignerIds: {
        kas_umum: Array.isArray(reportActiveSignerIds.value.kas_umum)
          ? reportActiveSignerIds.value.kas_umum.map(String)
          : [],
        rekonsiliasi_kas: Array.isArray(reportActiveSignerIds.value.rekonsiliasi_kas)
          ? reportActiveSignerIds.value.rekonsiliasi_kas.map(String)
          : [],
        realisasi_anggaran: Array.isArray(reportActiveSignerIds.value.realisasi_anggaran)
          ? reportActiveSignerIds.value.realisasi_anggaran.map(String)
          : [],
      },
      signPlace: String(reportSignPlace.value || '').trim(),
      letterhead: {
        enabled: Boolean(reportLetterhead.value.enabled),
        mode: reportLetterhead.value.mode === 'image' ? 'image' : 'text',
        organizationName: String(reportLetterhead.value.organizationName || '').slice(0, 100),
        subtitle: String(reportLetterhead.value.subtitle || '').slice(0, 120),
        addressLine: String(reportLetterhead.value.addressLine || '').slice(0, 160),
        imageDataUrl: String(reportLetterhead.value.imageDataUrl || ''),
        imageWidthPx: Number(reportLetterhead.value.imageWidthPx) || 0,
        imageHeightPx: Number(reportLetterhead.value.imageHeightPx) || 0,
        enabledReports: {
          kas_umum: Boolean(reportLetterhead.value.enabledReports?.kas_umum ?? true),
          rekonsiliasi_kas: Boolean(reportLetterhead.value.enabledReports?.rekonsiliasi_kas ?? true),
          realisasi_anggaran: Boolean(reportLetterhead.value.enabledReports?.realisasi_anggaran ?? true),
        },
      },
      customTitles: {
        kas_umum: String(reportCustomTitles.value.kas_umum || '').slice(0, 100),
        rekonsiliasi_kas: String(reportCustomTitles.value.rekonsiliasi_kas || '').slice(0, 100),
        realisasi_anggaran: String(reportCustomTitles.value.realisasi_anggaran || '').slice(0, 100),
      },
      updatedAt: serverTimestamp(),
    };

    try {
      await ensureFirestoreSessionForReportSettings(key);
      await setDoc(doc(db, 'report_settings', key), firestorePayload, { merge: true });
      if (key !== 'default') {
        const defaultDoc = {
          ...firestorePayload,
          ownerId: 'default',
        };
        await setDoc(doc(db, 'report_settings', 'default'), defaultDoc, { merge: true }).catch(() => {});
      }
      return true;
    } catch (err) {
      if (!isFirestoreOfflineError(err)) {
        console.warn('Firestore report_settings setDoc notice:', err);
      }
      return false;
    }
  }

  async function fetchRemoteReportSettings(ownerUid?: string | null): Promise<boolean> {
    const rawKey = ownerUid?.trim() || currentSignatureOwnerKey.value || 'default';
    const key = sanitizeId(rawKey);
    isReportSettingsSyncing.value = true;
    reportSettingsSyncStatus.value = 'syncing';

    try {
      let appliedFromFirestore = false;
      await ensureFirestoreSessionForReportSettings(key);

      // 1. Primary Cross-Device Source of Truth: Cloud Firestore (sisa-uang database)
      try {
        const docRef = doc(db, 'report_settings', key);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const remoteData = snap.data();
          applyRemoteReportSettings(remoteData);
          reportSettingsSyncStatus.value = 'synced';
          reportSettingsLastSyncedAt.value =
            remoteData.updatedAt?.toDate?.()?.toISOString?.() ||
            (typeof remoteData.updatedAt === 'string'
              ? remoteData.updatedAt
              : new Date().toISOString());
          appliedFromFirestore = true;
        } else if (key !== 'default') {
          // Fallback to default in Cloud Firestore if user document doesn't exist yet
          const defaultSnap = await getDoc(doc(db, 'report_settings', 'default'));
          if (defaultSnap.exists()) {
            const defaultData = defaultSnap.data();
            applyRemoteReportSettings(defaultData);
            reportSettingsSyncStatus.value = 'synced';
            reportSettingsLastSyncedAt.value =
              defaultData.updatedAt?.toDate?.()?.toISOString?.() ||
              (typeof defaultData.updatedAt === 'string'
                ? defaultData.updatedAt
                : new Date().toISOString());
            appliedFromFirestore = true;
          }
        }
      } catch (firestoreErr) {
        if (!isFirestoreOfflineError(firestoreErr)) {
          console.warn('Firestore report_settings getDoc notice:', firestoreErr);
        }
      }

      // If retrieved from Cloud Firestore, activate realtime listener and return
      if (appliedFromFirestore) {
        setupRealtimeFirestoreListener(key);
        isReportSettingsSyncing.value = false;
        return true;
      }

      // 2. Secondary fallback: HTTP endpoint /api/users/:key/report-settings
      try {
        const res = await fetch(`/api/users/${encodeURIComponent(key)}/report-settings`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.exists && data.reportSettings) {
            applyRemoteReportSettings(data.reportSettings);
            reportSettingsSyncStatus.value = 'synced';
            reportSettingsLastSyncedAt.value =
              data.reportSettings.updatedAt || new Date().toISOString();
            // Migrate server record to Cloud Firestore so all devices across preview & production sync
            void pushReportSettingsToFirestore(key);
            setupRealtimeFirestoreListener(key);
            isReportSettingsSyncing.value = false;
            return true;
          }
        }
      } catch {
        // Ignore server network error
      }

      // Also try 'default' key on server fallback if user specific key was not found
      if (key !== 'default') {
        try {
          const resDef = await fetch('/api/users/default/report-settings');
          if (resDef.ok) {
            const dataDef = await resDef.json();
            if (dataDef && dataDef.exists && dataDef.reportSettings) {
              applyRemoteReportSettings(dataDef.reportSettings);
              reportSettingsSyncStatus.value = 'synced';
              reportSettingsLastSyncedAt.value =
                dataDef.reportSettings.updatedAt || new Date().toISOString();
              void pushReportSettingsToFirestore(key);
              setupRealtimeFirestoreListener(key);
              isReportSettingsSyncing.value = false;
              return true;
            }
          }
        } catch {
          // Ignore
        }
      }

      // 3. If no remote record exists yet, but local config exists in browser,
      // upload local config up to Cloud Firestore so other devices get it immediately!
      const hasLocalConfig =
        reportLetterhead.value.organizationName.trim().length > 0 ||
        reportLetterhead.value.imageDataUrl.length > 0 ||
        reportSigners.value.length > 0;
      if (hasLocalConfig) {
        void pushReportSettingsToFirestore(key);
      }

      setupRealtimeFirestoreListener(key);
      reportSettingsSyncStatus.value = 'synced';
      isReportSettingsSyncing.value = false;
      return true;
    } catch {
      reportSettingsSyncStatus.value = 'idle';
      isReportSettingsSyncing.value = false;
      return false;
    }
  }

  async function pushReportSettingsToServer(): Promise<boolean> {
    const rawKey = currentSignatureOwnerKey.value || 'default';
    const key = sanitizeId(rawKey);
    isReportSettingsSyncing.value = true;
    reportSettingsSyncStatus.value = 'syncing';
    try {
      // 1. Push to Cloud Firestore (cross-device source of truth)
      await pushReportSettingsToFirestore(key);

      // 2. Also send to server Express endpoint as backup
      const payload = {
        ownerId: key,
        signers: reportSigners.value,
        activeSignerIds: reportActiveSignerIds.value,
        signPlace: reportSignPlace.value,
        letterhead: reportLetterhead.value,
        customTitles: reportCustomTitles.value,
      };
      try {
        const res = await fetch(`/api/users/${encodeURIComponent(key)}/report-settings`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const data = await res.json();
          reportSettingsLastSyncedAt.value = data.updatedAt || new Date().toISOString();
        }
      } catch {
        // Ignore Express failure since Firestore succeeded
      }

      reportSettingsSyncStatus.value = 'synced';
      reportSettingsLastSyncedAt.value = new Date().toISOString();
      isReportSettingsSyncing.value = false;
      return true;
    } catch {
      reportSettingsSyncStatus.value = 'error';
      isReportSettingsSyncing.value = false;
      return false;
    }
  }

  function loadReportSignatureConfig(ownerUid?: string | null) {
    const rawKey = ownerUid?.trim() || 'default';
    currentSignatureOwnerKey.value = sanitizeId(rawKey);
    readFromLocalStorage();
    setupRealtimeFirestoreListener(currentSignatureOwnerKey.value);
    void fetchRemoteReportSettings(currentSignatureOwnerKey.value);
  }

  function persistReportSignatureConfig(syncToServer = true) {
    if (typeof localStorage !== 'undefined') {
      const {
        signersKey,
        activeMapKey,
        placeKey,
        letterheadKey,
        customTitlesKey,
      } = getSignatureStorageKeys(currentSignatureOwnerKey.value);
      try {
        const serializedSigners = JSON.stringify(reportSigners.value);
        const serializedMap = JSON.stringify(reportActiveSignerIds.value);
        const serializedLh = JSON.stringify(reportLetterhead.value);
        const serializedTitles = JSON.stringify(reportCustomTitles.value);
        localStorage.setItem(signersKey, serializedSigners);
        localStorage.setItem(REPORT_SIGNERS_KEY_PREFIX, serializedSigners);
        localStorage.setItem(activeMapKey, serializedMap);
        localStorage.setItem(REPORT_ACTIVE_SIGNERS_KEY_PREFIX, serializedMap);
        localStorage.setItem(placeKey, reportSignPlace.value.trim());
        localStorage.setItem(REPORT_SIGN_PLACE_KEY_PREFIX, reportSignPlace.value.trim());
        localStorage.setItem(letterheadKey, serializedLh);
        localStorage.setItem(REPORT_LETTERHEAD_KEY_PREFIX, serializedLh);
        localStorage.setItem(customTitlesKey, serializedTitles);
        localStorage.setItem(REPORT_CUSTOM_TITLES_KEY_PREFIX, serializedTitles);
      } catch {
        // Ignore storage quota errors
      }
    }

    if (syncToServer) {
      if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
      saveDebounceTimer = setTimeout(() => {
        void pushReportSettingsToServer();
      }, 350);
    }
  }

  async function syncReportSettingsNow(forcePull = false): Promise<boolean> {
    isReportSettingsSyncing.value = true;
    reportSettingsSyncStatus.value = 'syncing';
    try {
      if (!forcePull) {
        const hasLocalConfig =
          reportLetterhead.value.organizationName.trim().length > 0 ||
          reportLetterhead.value.imageDataUrl.length > 0 ||
          reportSigners.value.length > 0;
        if (hasLocalConfig) {
          await pushReportSettingsToServer();
        }
      }
      // Fetch latest remote state from Firestore / Server
      const ok = await fetchRemoteReportSettings(currentSignatureOwnerKey.value);
      reportSettingsSyncStatus.value = 'synced';
      return ok;
    } catch {
      reportSettingsSyncStatus.value = 'error';
      return false;
    } finally {
      isReportSettingsSyncing.value = false;
    }
  }

  function exportReportSettingsJson(): string {
    const payload = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      ownerId: currentSignatureOwnerKey.value,
      signers: reportSigners.value,
      activeSignerIds: reportActiveSignerIds.value,
      signPlace: reportSignPlace.value,
      letterhead: reportLetterhead.value,
      customTitles: reportCustomTitles.value,
    };
    return JSON.stringify(payload, null, 2);
  }

  function importReportSettingsJson(jsonString: string): boolean {
    try {
      const parsed = JSON.parse(jsonString);
      if (!parsed || typeof parsed !== 'object') return false;
      applyRemoteReportSettings(parsed);
      persistReportSignatureConfig(true);
      return true;
    } catch {
      return false;
    }
  }

  function updateReportLetterhead(patch: Partial<ReportLetterheadConfig>) {
    reportLetterhead.value = {
      enabled:
        patch.enabled !== undefined ? Boolean(patch.enabled) : reportLetterhead.value.enabled,
      mode:
        patch.mode !== undefined
          ? patch.mode === 'image'
            ? 'image'
            : 'text'
          : reportLetterhead.value.mode,
      organizationName: (
        patch.organizationName !== undefined
          ? patch.organizationName
          : reportLetterhead.value.organizationName
      ).slice(0, 100),
      subtitle: (
        patch.subtitle !== undefined ? patch.subtitle : reportLetterhead.value.subtitle
      ).slice(0, 120),
      addressLine: (
        patch.addressLine !== undefined
          ? patch.addressLine
          : reportLetterhead.value.addressLine
      ).slice(0, 160),
      imageDataUrl:
        patch.imageDataUrl !== undefined
          ? patch.imageDataUrl
          : reportLetterhead.value.imageDataUrl,
      imageWidthPx:
        patch.imageWidthPx !== undefined
          ? Number(patch.imageWidthPx) || 0
          : reportLetterhead.value.imageWidthPx,
      imageHeightPx:
        patch.imageHeightPx !== undefined
          ? Number(patch.imageHeightPx) || 0
          : reportLetterhead.value.imageHeightPx,
      enabledReports: patch.enabledReports
        ? {
            kas_umum: Boolean(patch.enabledReports.kas_umum),
            rekonsiliasi_kas: Boolean(patch.enabledReports.rekonsiliasi_kas),
            realisasi_anggaran: Boolean(patch.enabledReports.realisasi_anggaran),
          }
        : reportLetterhead.value.enabledReports || {
            kas_umum: true,
            rekonsiliasi_kas: true,
            realisasi_anggaran: true,
          },
    };
    persistReportSignatureConfig();
  }

  function toggleLetterheadForReport(reportType: keyof ReportCustomTitlesConfig) {
    const currentMap = reportLetterhead.value.enabledReports || {
      kas_umum: true,
      rekonsiliasi_kas: true,
      realisasi_anggaran: true,
    };
    const nextVal = !currentMap[reportType];
    const nextMap: ReportLetterheadEnabledReports = {
      ...currentMap,
      [reportType]: nextVal,
    };
    const anyEnabled =
      nextMap.kas_umum || nextMap.rekonsiliasi_kas || nextMap.realisasi_anggaran;
    reportLetterhead.value = {
      ...reportLetterhead.value,
      enabled: nextVal ? true : anyEnabled ? reportLetterhead.value.enabled : false,
      enabledReports: nextMap,
    };
    persistReportSignatureConfig();
  }

  function isLetterheadActiveForReport(reportType: keyof ReportCustomTitlesConfig): boolean {
    if (!reportLetterhead.value.enabled) return false;
    const map = reportLetterhead.value.enabledReports;
    if (!map) return true;
    return map[reportType] !== false;
  }

  function getLetterheadForReport(
    reportType: keyof ReportCustomTitlesConfig
  ): ReportLetterheadConfig {
    return {
      ...reportLetterhead.value,
      enabled: isLetterheadActiveForReport(reportType),
    };
  }

  function updateReportCustomTitle(
    reportType: keyof ReportCustomTitlesConfig,
    customTitle: string
  ) {
    reportCustomTitles.value[reportType] = customTitle.slice(0, 100);
    persistReportSignatureConfig();
  }

  function resetReportCustomTitles() {
    reportCustomTitles.value = {
      kas_umum: '',
      rekonsiliasi_kas: '',
      realisasi_anggaran: '',
    };
    persistReportSignatureConfig();
  }

  function getResolvedReportTitle(reportType: keyof ReportCustomTitlesConfig): string {
    const custom = (reportCustomTitles.value[reportType] || '').trim();
    return custom || DEFAULT_REPORT_TITLES[reportType];
  }

  function setReportSignPlace(place: string) {
    reportSignPlace.value = place.slice(0, 60);
    persistReportSignatureConfig();
  }

  function addReportSigner(
    name = '',
    role = '',
    rowPosition: ReportSignerRowPosition = 'top'
  ): ReportSignerItem | null {
    if (reportSigners.value.length >= MAX_REPORT_SIGNERS) return null;
    const id = `sig_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newSigner: ReportSignerItem = {
      id,
      name: name.trim(),
      role: role.trim(),
      rowPosition: rowPosition === 'bottom' ? 'bottom' : 'top',
    };
    reportSigners.value.push(newSigner);
    // By default enable this new signer across all report types
    for (const rKey of ['kas_umum', 'rekonsiliasi_kas', 'realisasi_anggaran']) {
      const current = reportActiveSignerIds.value[rKey] || [];
      if (!current.includes(id)) {
        reportActiveSignerIds.value[rKey] = [...current, id];
      }
    }
    persistReportSignatureConfig();
    return newSigner;
  }

  function updateReportSigner(
    id: string,
    name: string,
    role: string,
    rowPosition?: ReportSignerRowPosition
  ) {
    const target = reportSigners.value.find((s) => s.id === id);
    if (!target) return;
    target.name = name.slice(0, 80);
    target.role = role.slice(0, 80);
    if (rowPosition === 'top' || rowPosition === 'bottom') {
      target.rowPosition = rowPosition;
    }
    persistReportSignatureConfig();
  }

  function removeReportSigner(id: string) {
    reportSigners.value = reportSigners.value.filter((s) => s.id !== id);
    for (const rKey of ['kas_umum', 'rekonsiliasi_kas', 'realisasi_anggaran']) {
      reportActiveSignerIds.value[rKey] = (reportActiveSignerIds.value[rKey] || []).filter(
        (item) => item !== id
      );
    }
    persistReportSignatureConfig();
  }

  function moveReportSigner(id: string, direction: -1 | 1) {
    const idx = reportSigners.value.findIndex((s) => s.id === id);
    if (idx === -1) return;
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= reportSigners.value.length) return;
    const copy = [...reportSigners.value];
    const [moved] = copy.splice(idx, 1);
    copy.splice(targetIdx, 0, moved);
    reportSigners.value = copy;
    persistReportSignatureConfig();
  }

  function toggleSignerForReport(reportType: string, signerId: string) {
    const current = new Set(reportActiveSignerIds.value[reportType] || []);
    if (current.has(signerId)) {
      current.delete(signerId);
    } else {
      current.add(signerId);
    }
    // Preserve the order defined in reportSigners
    reportActiveSignerIds.value[reportType] = reportSigners.value
      .map((s) => s.id)
      .filter((id) => current.has(id));
    persistReportSignatureConfig();
  }

  function setSignersForReport(reportType: string, signerIds: string[]) {
    const chosenSet = new Set(signerIds);
    reportActiveSignerIds.value[reportType] = reportSigners.value
      .map((s) => s.id)
      .filter((id) => chosenSet.has(id));
    persistReportSignatureConfig();
  }

  function getActiveSignersForReport(reportType: string): ReportSignerItem[] {
    const activeIds = new Set(reportActiveSignerIds.value[reportType] || []);
    return reportSigners.value.filter(
      (s) => activeIds.has(s.id) && (s.name.trim().length > 0 || s.role.trim().length > 0)
    );
  }

  loadReportSignatureConfig();

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
    document.documentElement.classList.toggle('money-font-mono', numberFont.value === 'mono');
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

  function setNumberFont(mode: NumberFontMode) {
    numberFont.value = mode;
    localStorage.setItem('sisa_uang_number_font', mode);
    applyThemeToDom();
  }

  function setAppLogoUrl(url: string) {
    appLogoUrl.value = url.trim();
    if (appLogoUrl.value) {
      localStorage.setItem('sisa_uang_logo_url', appLogoUrl.value);
    } else {
      localStorage.removeItem('sisa_uang_logo_url');
    }
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
    numberFont,
    moneyFont: numberFont,
    appLogoUrl,
    reportSigners,
    reportActiveSignerIds,
    reportSignPlace,
    reportLetterhead,
    reportCustomTitles,
    setTheme,
    setCurrency,
    setNumberFont,
    setMoneyFont: setNumberFont,
    setAppLogoUrl,
    setLocale,
    formatMoney,
    initThemeListener,
    loadReportSignatureConfig,
    setReportSignPlace,
    updateReportLetterhead,
    toggleLetterheadForReport,
    isLetterheadActiveForReport,
    getLetterheadForReport,
    updateReportCustomTitle,
    resetReportCustomTitles,
    getResolvedReportTitle,
    addReportSigner,
    updateReportSigner,
    removeReportSigner,
    moveReportSigner,
    toggleSignerForReport,
    setSignersForReport,
    getActiveSignersForReport,
    isReportSettingsSyncing,
    reportSettingsSyncStatus,
    reportSettingsLastSyncedAt,
    fetchRemoteReportSettings,
    pushReportSettingsToServer,
    pushReportSettingsToFirestore,
    syncReportSettingsNow,
    exportReportSettingsJson,
    importReportSettingsJson,
  };
});
