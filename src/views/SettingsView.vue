<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { RouterLink } from 'vue-router';
import {
  Sun,
  Moon,
  Monitor,
  Globe,
  ShieldCheck,
  Database,
  Upload,
  FileJson,
  Table as TableIcon,
  Braces,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Trash2,
  ArrowRight,
  Copy,
  Layers,
  Calculator,
  GitCompareArrows,
  Info,
  RotateCcw,
  CheckSquare,
  Square,
  X,
  User as UserIcon,
  Save,
  RefreshCw,
} from 'lucide-vue-next';
import { useThemeStore } from '../stores/theme';
import { useAuthStore } from '../stores/auth';
import { useAdminStore } from '../stores/admin';
import { useNotificationStore } from '../stores/notification';
import {
  parsePhpMyAdminJson,
  buildJsonMigrationAnalysis,
  SAMPLE_PHPMYADMIN_JSON,
  FIRESTORE_FREE_TIER_DAILY_WRITES,
  type ParsedPhpMyAdminTable,
  type JsonMigrationAnalysis,
  type ConvertedFirestoreCollections,
  type TargetCollectionCategory,
} from '../utils/jsonMigrationParser';

const { t, locale } = useI18n();
const themeStore = useThemeStore();
const authStore = useAuthStore();
const adminStore = useAdminStore();
const notificationStore = useNotificationStore();

// =========================================================================
// User Profile Settings (DisplayName & Username)
// =========================================================================
const profileDisplayName = ref<string>(authStore.user?.displayName || '');
const profileUsername = ref<string>(
  authStore.user?.username || authStore.user?.email.split('@')[0] || ''
);

async function handleSaveProfile() {
  await authStore.updateUserProfile(profileDisplayName.value, profileUsername.value);
  if (authStore.user) {
    profileDisplayName.value = authStore.user.displayName;
    profileUsername.value = authStore.user.username;
  }
}

// =========================================================================
// Super Admin PHPMyAdmin JSON Migration Wizard State
// =========================================================================
const uploadedFileName = ref<string>('');
const rawJsonText = ref<string>('');
const showManualJsonEditor = ref<boolean>(false);

// Step 1 -> 2 -> 3: Parsed Raw PHPMyAdmin JSON Tables (Mutable: can remove tables or toggle includeData)
const initialParsedTablesSnapshot = ref<ParsedPhpMyAdminTable[]>([]);
const rawTables = ref<ParsedPhpMyAdminTable[]>([]);
const activeRawTableIdx = ref<number>(0);
const selectedRawTableNames = ref<string[]>([]);

// Live Firestore Collections Cleanup / Bulk Delete State (Super Admin Dev Tool)
const firestoreCollectionsStats = ref<
  { collectionName: string; label: string; description: string; docCount: number }[]
>([]);
const isLoadingFirestoreStats = ref<boolean>(false);
const selectedFirestoreCols = ref<string[]>([]);
const keepSuperAdminOnDelete = ref<boolean>(true);
const showDeleteFirestoreConfirmModal = ref<boolean>(false);
const pendingDeleteFirestoreCols = ref<string[]>([]);
const isDeletingFirestoreCols = ref<boolean>(false);
const deleteFirestoreProgressText = ref<string>('');

async function loadFirestoreCollectionStats() {
  if (!authStore.isSuperAdmin) return;
  isLoadingFirestoreStats.value = true;
  try {
    firestoreCollectionsStats.value = await adminStore.fetchFirestoreCollectionStats();
  } catch (err) {
    console.warn('Failed to load Firestore collection stats:', err);
  } finally {
    isLoadingFirestoreStats.value = false;
  }
}

onMounted(() => {
  if (authStore.isSuperAdmin) {
    loadFirestoreCollectionStats();
  }
});

function toggleSelectFirestoreCol(colName: string) {
  const idx = selectedFirestoreCols.value.indexOf(colName);
  if (idx >= 0) {
    selectedFirestoreCols.value.splice(idx, 1);
  } else {
    selectedFirestoreCols.value.push(colName);
  }
}

const isAllFirestoreColsSelected = computed(() => {
  if (firestoreCollectionsStats.value.length === 0) return false;
  return firestoreCollectionsStats.value.every((c) =>
    selectedFirestoreCols.value.includes(c.collectionName)
  );
});

function toggleSelectAllFirestoreCols() {
  if (isAllFirestoreColsSelected.value) {
    selectedFirestoreCols.value = [];
  } else {
    selectedFirestoreCols.value = firestoreCollectionsStats.value.map((c) => c.collectionName);
  }
}

function openDeleteSingleFirestoreCollectionModal(colName: string) {
  pendingDeleteFirestoreCols.value = [colName];
  showDeleteFirestoreConfirmModal.value = true;
}

function openDeleteSelectedFirestoreCollectionsModal() {
  if (selectedFirestoreCols.value.length === 0) return;
  pendingDeleteFirestoreCols.value = [...selectedFirestoreCols.value];
  showDeleteFirestoreConfirmModal.value = true;
}

const pendingDeleteFirestoreTotalDocs = computed(() =>
  firestoreCollectionsStats.value
    .filter((c) => pendingDeleteFirestoreCols.value.includes(c.collectionName))
    .reduce((sum, c) => sum + c.docCount, 0)
);

async function confirmAndExecuteFirestoreCollectionsDelete() {
  if (pendingDeleteFirestoreCols.value.length === 0) return;
  isDeletingFirestoreCols.value = true;
  deleteFirestoreProgressText.value = 'Menyiapkan penghapusan tabel/koleksi Firestore...';

  try {
    const res = await adminStore.deleteFirestoreCollections(
      pendingDeleteFirestoreCols.value,
      { keepSuperAdminUser: keepSuperAdminOnDelete.value },
      (phase) => {
        deleteFirestoreProgressText.value = phase;
      }
    );

    showDeleteFirestoreConfirmModal.value = false;
    selectedFirestoreCols.value = selectedFirestoreCols.value.filter(
      (c) => !pendingDeleteFirestoreCols.value.includes(c)
    );
    pendingDeleteFirestoreCols.value = [];

    await loadFirestoreCollectionStats();

    notificationStore.notifySuccess(
      'Tabel Database Berhasil Dihapus',
      `Berhasil mengosongkan ${res.clearedCollections.length} tabel/koleksi (${res.clearedCollections.join(', ')}) dengan total ${res.deletedCount.toLocaleString('id-ID')} dokumen dihapus.`
    );
  } catch (err: any) {
    notificationStore.notifyError(
      'Gagal Menghapus Tabel Database',
      err,
      'Terjadi kendala saat menghapus dokumen di Cloud Firestore.'
    );
  } finally {
    isDeletingFirestoreCols.value = false;
    deleteFirestoreProgressText.value = '';
  }
}

// Step 4 -> 5 -> 6: New Database Schema Design
const schemaDesignGenerated = ref<boolean>(false);
const activeSchemaIdx = ref<number>(0);

// Step 7 -> 8 -> 9: Converted Data in New Firestore Format
const dataConversionCompleted = ref<boolean>(false);
const activeConvertedTab = ref<keyof ConvertedFirestoreCollections>('wallets');
const convertedPreviewMode = ref<'table' | 'json'>('table');
const jsonCopied = ref<boolean>(false);

// Step 10: Confirmation Modal & Execution State
const showConfirmModal = ref<boolean>(false);
const isImporting = ref<boolean>(false);
const importProgressText = ref<string>('');
const importError = ref<string | null>(null);
const importErrorDetail = ref<string | null>(null);
let errorPopupTimer: ReturnType<typeof setTimeout> | null = null;

function dismissImportError() {
  importError.value = null;
  importErrorDetail.value = null;
  if (errorPopupTimer) {
    clearTimeout(errorPopupTimer);
    errorPopupTimer = null;
  }
}

function triggerImportError(rawErr: unknown, fallbackMsg = 'Terjadi kesalahan saat memproses permintaan.') {
  notificationStore.notifyError('Gagal Memproses Migrasi Database', rawErr, fallbackMsg);
}
const importSuccessInfo = ref<{
  totalDocumentsImported: number;
  batchesCommitted: number;
  usersCount: number;
  walletsCount: number;
  walletOwnersCount: number;
  categoriesCount: number;
  transactionsCount: number;
  budgetsCount: number;
  logsCount: number;
} | null>(null);

const TARGET_COLLECTION_OPTIONS: { value: TargetCollectionCategory; label: string }[] = [
  { value: 'users', label: 'users (Akun / CI4 Shield)' },
  { value: 'wallets', label: 'wallets (Sumber Dana)' },
  { value: 'wallet_owners', label: 'wallet_owners (Kepemilikan Dana)' },
  { value: 'categories', label: 'categories (Manajemen Kategori)' },
  { value: 'transactions', label: 'transactions (Riwayat Transaksi)' },
  { value: 'budgets', label: 'budgets (Anggaran Bulanan)' },
  { value: 'activity_logs', label: 'activity_logs (Log Login)' },
];

/**
 * Reactive Migration Analysis:
 * Automatically recalculates potential Firestore writes, schema designs, and converted records
 * the instant the user deletes a table, toggles `includeData`, or changes `detectedCategory`.
 */
const migrationAnalysis = computed<JsonMigrationAnalysis | null>(() => {
  if (rawTables.value.length === 0) return null;
  return buildJsonMigrationAnalysis(rawTables.value);
});

// Step 1 & 2: Process JSON Content
function processJsonContent(jsonContent: string, fileLabel: string) {
  dismissImportError();
  importSuccessInfo.value = null;
  rawJsonText.value = jsonContent;
  uploadedFileName.value = fileLabel;
  schemaDesignGenerated.value = false;
  dataConversionCompleted.value = false;

  try {
    const parsedTables = parsePhpMyAdminJson(jsonContent);
    if (parsedTables.length === 0) {
      triggerImportError(
        'Tidak ditemukan struktur tabel di dalam file JSON tersebut. Pastikan file merupakan hasil export JSON dari PHPMyAdmin.'
      );
      rawTables.value = [];
      initialParsedTablesSnapshot.value = [];
      return;
    }

    initialParsedTablesSnapshot.value = parsedTables.map((t) => ({
      ...t,
      columns: [...t.columns],
      rows: [...t.rows],
    }));
    rawTables.value = parsedTables;
    selectedRawTableNames.value = [];
    activeRawTableIdx.value = 0;

    const totalRows = parsedTables.reduce((acc, t) => acc + t.rows.length, 0);
    notificationStore.notifySuccess(
      'File JSON Berhasil Diproses',
      `Ditemukan ${parsedTables.length} tabel dengan total ${totalRows.toLocaleString('id-ID')} baris dari ${fileLabel}.`
    );
  } catch (err: any) {
    triggerImportError(err, 'Gagal memproses konten file JSON.');
    rawTables.value = [];
    selectedRawTableNames.value = [];
    initialParsedTablesSnapshot.value = [];
  }
}

function handleJsonFileUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const content = String(reader.result || '');
    processJsonContent(content, file.name);
  };
  reader.onerror = () => {
    triggerImportError('Gagal membaca file JSON yang dipilih.');
  };
  reader.readAsText(file);
  input.value = '';
}

function handleLoadSamplePhpMyAdminJson() {
  processJsonContent(SAMPLE_PHPMYADMIN_JSON, 'sisa_uang_phpmyadmin_export.json');
}

function handleProcessManualJson() {
  if (!rawJsonText.value.trim()) return;
  processJsonContent(
    rawJsonText.value,
    uploadedFileName.value || 'custom_phpmyadmin_export.json'
  );
}

/**
 * Step 2 Table Controls:
 * 1. Remove single or multiple unwanted tables from schema generation & write calculation
 * 2. Toggle whether to include data rows or only structure (0 writes)
 * 3. Restore removed tables if needed
 */
function toggleSelectRawTable(tableName: string) {
  const idx = selectedRawTableNames.value.indexOf(tableName);
  if (idx >= 0) {
    selectedRawTableNames.value.splice(idx, 1);
  } else {
    selectedRawTableNames.value.push(tableName);
  }
}

const isAllRawTablesSelected = computed(() => {
  if (rawTables.value.length === 0) return false;
  return rawTables.value.every((t) => selectedRawTableNames.value.includes(t.tableName));
});

function toggleSelectAllRawTables() {
  if (isAllRawTablesSelected.value) {
    selectedRawTableNames.value = [];
  } else {
    selectedRawTableNames.value = rawTables.value.map((t) => t.tableName);
  }
}

function removeSelectedRawTables() {
  if (selectedRawTableNames.value.length === 0) return;
  const selectedSet = new Set(selectedRawTableNames.value);
  const removedNames = [...selectedRawTableNames.value];
  rawTables.value = rawTables.value.filter((t) => !selectedSet.has(t.tableName));
  selectedRawTableNames.value = [];

  if (activeRawTableIdx.value >= rawTables.value.length) {
    activeRawTableIdx.value = Math.max(0, rawTables.value.length - 1);
  }
  if (
    migrationAnalysis.value &&
    activeSchemaIdx.value >= migrationAnalysis.value.newSchemaDesigns.length
  ) {
    activeSchemaIdx.value = Math.max(
      0,
      migrationAnalysis.value.newSchemaDesigns.length - 1
    );
  }

  notificationStore.notifySuccess(
    `${removedNames.length} Tabel Dihapus dari Proses`,
    `Tabel (${removedNames.join(', ')}) telah dihapus dari daftar migrasi.`
  );
}

function removeRawTable(index: number) {
  if (index < 0 || index >= rawTables.value.length) return;
  const removedTable = rawTables.value[index];
  rawTables.value.splice(index, 1);
  if (removedTable) {
    selectedRawTableNames.value = selectedRawTableNames.value.filter(
      (n) => n !== removedTable.tableName
    );
  }
  if (activeRawTableIdx.value >= rawTables.value.length) {
    activeRawTableIdx.value = Math.max(0, rawTables.value.length - 1);
  }
  if (
    migrationAnalysis.value &&
    activeSchemaIdx.value >= migrationAnalysis.value.newSchemaDesigns.length
  ) {
    activeSchemaIdx.value = Math.max(
      0,
      migrationAnalysis.value.newSchemaDesigns.length - 1
    );
  }
}

function toggleTableIncludeData(index: number) {
  const target = rawTables.value[index];
  if (!target) return;
  target.includeData = !target.includeData;
}

function setAllTablesIncludeData(include: boolean) {
  rawTables.value.forEach((t) => {
    t.includeData = include;
  });
}

function restoreAllInitialTables() {
  if (initialParsedTablesSnapshot.value.length === 0) return;
  rawTables.value = initialParsedTablesSnapshot.value.map((t) => ({
    ...t,
    columns: [...t.columns],
    rows: [...t.rows],
    includeData: true,
  }));
  selectedRawTableNames.value = [];
  activeRawTableIdx.value = 0;
}

const removedTablesCount = computed(() =>
  Math.max(0, initialParsedTablesSnapshot.value.length - rawTables.value.length)
);

// Step 4: Click to Generate New Database Structure
function handleGenerateNewDatabaseSchema() {
  if (!migrationAnalysis.value) return;
  schemaDesignGenerated.value = true;
  activeSchemaIdx.value = 0;
  notificationStore.notifySuccess(
    'Rancangan Struktur Database Baru Dibuat',
    `${migrationAnalysis.value.newSchemaDesigns.length} koleksi Cloud Firestore siap ditinjau pada Langkah 3.`
  );
}

// Step 7: Click "Konversi struktur dan isi database lama ke format database baru"
function handleConvertLegacyToNewFormat() {
  if (!migrationAnalysis.value) return;
  dataConversionCompleted.value = true;
  const c = migrationAnalysis.value.convertedCollections;
  if (c.transactions.length > 0) {
    activeConvertedTab.value = 'transactions';
  } else if (c.wallet_owners.length > 0) {
    activeConvertedTab.value = 'wallet_owners';
  } else if (c.wallets.length > 0) {
    activeConvertedTab.value = 'wallets';
  } else if (c.users.length > 0) {
    activeConvertedTab.value = 'users';
  }
  notificationStore.notifySuccess(
    'Konversi Data Selesai',
    `Total ${migrationAnalysis.value.writeEstimation.optimizedFirestoreWrites.toLocaleString('id-ID')} dokumen siap diimpor ke Cloud Firestore.`
  );
}

function resetJsonImporter() {
  uploadedFileName.value = '';
  rawJsonText.value = '';
  rawTables.value = [];
  selectedRawTableNames.value = [];
  initialParsedTablesSnapshot.value = [];
  schemaDesignGenerated.value = false;
  dataConversionCompleted.value = false;
  importError.value = null;
  importSuccessInfo.value = null;
  showConfirmModal.value = false;
}

const activeRawTable = computed<ParsedPhpMyAdminTable | null>(() => {
  if (rawTables.value.length === 0) return null;
  return rawTables.value[activeRawTableIdx.value] || rawTables.value[0];
});

const activeSchemaCollection = computed(() => {
  if (!migrationAnalysis.value || migrationAnalysis.value.newSchemaDesigns.length === 0) {
    return null;
  }
  return (
    migrationAnalysis.value.newSchemaDesigns[activeSchemaIdx.value] ||
    migrationAnalysis.value.newSchemaDesigns[0]
  );
});

const convertedCollectionTabs = computed(() => {
  if (!migrationAnalysis.value) return [];
  const c = migrationAnalysis.value.convertedCollections;
  return [
    { key: 'users' as const, label: 'users (CI4 Shield)', count: c.users.length },
    { key: 'wallets' as const, label: 'wallets (Sumber Dana)', count: c.wallets.length },
    {
      key: 'wallet_owners' as const,
      label: 'wallet_owners (Kepemilikan Dana)',
      count: c.wallet_owners.length,
    },
    { key: 'categories' as const, label: 'categories (Kategori)', count: c.categories.length },
    {
      key: 'transactions' as const,
      label: 'transactions (Income/Expense/Transfer)',
      count: c.transactions.length,
    },
    { key: 'budgets' as const, label: 'budgets (Anggaran)', count: c.budgets.length },
    { key: 'activity_logs' as const, label: 'activity_logs', count: c.activity_logs.length },
  ];
});

const activeConvertedRows = computed<Record<string, any>[]>(() => {
  if (!migrationAnalysis.value) return [];
  return migrationAnalysis.value.convertedCollections[activeConvertedTab.value] || [];
});

const activeConvertedColumns = computed<string[]>(() => {
  const rows = activeConvertedRows.value;
  if (rows.length === 0) return [];
  const colSet = new Set<string>();
  rows.forEach((r) => Object.keys(r).forEach((k) => colSet.add(k)));
  return Array.from(colSet);
});

const formattedConvertedJson = computed(() => {
  if (!migrationAnalysis.value) return '';
  return JSON.stringify(migrationAnalysis.value.convertedCollections, null, 2);
});

async function copyConvertedJson() {
  if (!formattedConvertedJson.value) return;
  try {
    await navigator.clipboard.writeText(formattedConvertedJson.value);
    jsonCopied.value = true;
    notificationStore.notifySuccess(
      'JSON Berhasil Disalin',
      'Struktur data hasil konversi telah disalin ke clipboard.'
    );
    setTimeout(() => {
      jsonCopied.value = false;
    }, 2000);
  } catch {
    // Ignore
  }
}

async function confirmAndExecuteImport() {
  if (!migrationAnalysis.value) return;
  isImporting.value = true;
  importProgressText.value = 'Menyiapkan batch dokumen Firestore...';
  dismissImportError();

  try {
    const result = await adminStore.importConvertedJsonToFirestore(
      migrationAnalysis.value.convertedCollections,
      (progress) => {
        importProgressText.value = progress.phase;
      }
    );
    importSuccessInfo.value = result;
    showConfirmModal.value = false;
    await loadFirestoreCollectionStats();

    notificationStore.notifySuccess(
      `Berhasil Mengimpor ${result.totalDocumentsImported.toLocaleString('id-ID')} Dokumen (${result.batchesCommitted} Batch) ke Cloud Firestore!`,
      'Seluruh koleksi hasil konversi telah berhasil ditulis secara nyata ke database Cloud Firestore (sisa-uang).',
      {
        detail: `${result.usersCount} users · ${result.walletsCount} wallets · ${result.walletOwnersCount} wallet_owners · ${result.categoriesCount} categories · ${result.transactionsCount} transactions · ${result.budgetsCount} budgets · ${result.logsCount} activity_logs`,
        actionLabel: 'Lihat User di Control Panel →',
        actionRoute: '/control-panel?tab=users',
        durationMs: 12000,
      }
    );
  } catch (err: any) {
    triggerImportError(err, 'Gagal mengimpor database ke Cloud Firestore.');
    showConfirmModal.value = false;
  } finally {
    isImporting.value = false;
    importProgressText.value = '';
  }
}
</script>

<template>
  <div class="space-y-5 sm:space-y-6 max-w-5xl w-full min-w-0 overflow-x-hidden">
    <div>
      <h1 class="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
        {{ t('nav.settings') }}
      </h1>
      <p class="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
        Sesuaikan tema tampilan, bahasa antarmuka, dan profil akun Anda.
      </p>
    </div>

    <!-- ===================================================================== -->
    <!-- SUPER ADMIN EXCLUSIVE: Live Database Table Manager & Bulk Delete      -->
    <!-- ===================================================================== -->
    <section
      v-if="authStore.isSuperAdmin"
      class="rounded-2xl sm:rounded-3xl border border-rose-200/90 dark:border-rose-900/60 bg-white dark:bg-slate-900 p-4 sm:p-6 space-y-4 w-full min-w-0 overflow-x-hidden"
    >
      <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div class="space-y-1 min-w-0">
          <div class="flex items-center gap-2 text-xs font-semibold text-rose-600 dark:text-rose-400">
            <Database class="w-4 h-4 shrink-0" />
            <span class="truncate">Manajemen Tabel Database Aktif (Super Admin · Development Tool)</span>
          </div>
          <h2 class="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
            Hapus Tabel-Tabel di Database Cloud Firestore (Satuan & Sekaligus)
          </h2>
          <p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Fitur khusus <strong>Super Admin</strong> selama tahap <em>development</em> untuk menghapus/mengosongkan satu atau beberapa tabel (koleksi) sekaligus di database Cloud Firestore (<code>sisa-uang</code>).
          </p>
        </div>

        <div class="grid grid-cols-1 sm:flex sm:flex-wrap items-stretch sm:items-center gap-2 w-full sm:w-auto shrink-0">
          <button
            type="button"
            :disabled="isLoadingFirestoreStats || isDeletingFirestoreCols"
            class="w-full sm:w-auto min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
            @click="loadFirestoreCollectionStats"
          >
            <RefreshCw class="w-3.5 h-3.5 shrink-0" :class="isLoadingFirestoreStats ? 'animate-spin' : ''" />
            <span>{{ isLoadingFirestoreStats ? 'Memuat Tabel...' : 'Refresh Jumlah Data' }}</span>
          </button>

          <button
            type="button"
            class="w-full sm:w-auto min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-rose-400 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center justify-center gap-1.5 transition-colors"
            @click="toggleSelectAllFirestoreCols"
          >
            <CheckSquare v-if="isAllFirestoreColsSelected" class="w-3.5 h-3.5 shrink-0 text-rose-600 dark:text-rose-400" />
            <Square v-else class="w-3.5 h-3.5 shrink-0" />
            <span>{{ isAllFirestoreColsSelected ? 'Batal Pilih Semua' : 'Pilih Semua Tabel' }}</span>
          </button>

          <button
            v-if="selectedFirestoreCols.length > 0"
            type="button"
            :disabled="isDeletingFirestoreCols"
            class="w-full sm:w-auto min-h-[42px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-xs"
            @click="openDeleteSelectedFirestoreCollectionsModal"
          >
            <Trash2 class="w-3.5 h-3.5 shrink-0" />
            <span>Hapus {{ selectedFirestoreCols.length }} Tabel Terpilih</span>
          </button>
        </div>
      </div>

      <!-- Option to protect Super Admin account when deleting users table -->
      <div class="rounded-xl border border-amber-200/80 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
        <div class="text-slate-700 dark:text-slate-300">
          <strong>Proteksi Sesi Super Admin:</strong> Saat menghapus tabel <code>users</code>, pertahankan akun Super Admin utama agar sesi Anda tidak ikut terputus.
        </div>
        <button
          type="button"
          class="w-full sm:w-auto min-h-[36px] px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 shrink-0 transition-colors"
          :class="
            keepSuperAdminOnDelete
              ? 'border-emerald-600/50 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
              : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400'
          "
          @click="keepSuperAdminOnDelete = !keepSuperAdminOnDelete"
        >
          <CheckSquare v-if="keepSuperAdminOnDelete" class="w-3.5 h-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <Square v-else class="w-3.5 h-3.5 shrink-0" />
          <span>{{ keepSuperAdminOnDelete ? 'Akun Super Admin Dilindungi' : 'Hapus Semua User Termasuk Admin' }}</span>
        </button>
      </div>

      <!-- Responsive Grid of Database Tables / Collections -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div
          v-for="col in firestoreCollectionsStats"
          :key="col.collectionName"
          class="rounded-2xl border p-3.5 flex flex-col justify-between gap-3 transition-colors min-w-0"
          :class="
            selectedFirestoreCols.includes(col.collectionName)
              ? 'border-rose-500 bg-rose-50/30 dark:bg-rose-950/20'
              : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50'
          "
        >
          <div class="space-y-1.5 min-w-0">
            <div class="flex items-start justify-between gap-2">
              <button
                type="button"
                class="flex items-center gap-2 text-left min-w-0 group"
                @click="toggleSelectFirestoreCol(col.collectionName)"
              >
                <CheckSquare
                  v-if="selectedFirestoreCols.includes(col.collectionName)"
                  class="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400"
                />
                <Square
                  v-else
                  class="w-4 h-4 shrink-0 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200"
                />
                <span class="font-mono text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                  {{ col.collectionName }}
                </span>
              </button>

              <span
                class="px-2 py-0.5 rounded-md font-mono text-[11px] font-semibold tabular-nums shrink-0"
                :class="
                  col.docCount > 0
                    ? 'bg-emerald-100/80 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                    : 'bg-slate-200/70 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                "
              >
                {{ col.docCount.toLocaleString('id-ID') }} dok
              </span>
            </div>

            <div class="text-[11px] font-medium text-slate-700 dark:text-slate-300 break-words">
              {{ col.label }}
            </div>
            <p class="text-[11px] text-slate-500 dark:text-slate-400 leading-snug break-words">
              {{ col.description }}
            </p>
          </div>

          <div class="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/70 dark:border-slate-800">
            <button
              type="button"
              class="min-h-[36px] px-2.5 py-1.5 rounded-xl border text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors"
              :class="
                selectedFirestoreCols.includes(col.collectionName)
                  ? 'border-rose-500/60 bg-rose-100/60 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
              "
              @click="toggleSelectFirestoreCol(col.collectionName)"
            >
              <CheckSquare v-if="selectedFirestoreCols.includes(col.collectionName)" class="w-3.5 h-3.5 shrink-0" />
              <Square v-else class="w-3.5 h-3.5 shrink-0" />
              <span>{{ selectedFirestoreCols.includes(col.collectionName) ? 'Terpilih' : 'Pilih' }}</span>
            </button>

            <button
              type="button"
              :disabled="isDeletingFirestoreCols"
              class="min-h-[36px] px-2.5 py-1.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-white dark:bg-slate-900 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors disabled:opacity-50"
              @click="openDeleteSingleFirestoreCollectionModal(col.collectionName)"
            >
              <Trash2 class="w-3.5 h-3.5 shrink-0" />
              <span>Hapus Tabel</span>
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- ===================================================================== -->
    <!-- SUPER ADMIN EXCLUSIVE: PHPMyAdmin JSON Database Migration & Designer  -->
    <!-- ===================================================================== -->
    <section
      v-if="authStore.isSuperAdmin"
      class="rounded-2xl sm:rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-7 space-y-5 sm:space-y-6 w-full min-w-0 overflow-x-hidden"
    >
      <!-- Top Header -->
      <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div class="space-y-1 min-w-0">
          <div class="flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            <FileJson class="w-4 h-4 shrink-0" />
            <span class="truncate">Migrasi Database PHPMyAdmin (JSON) → Cloud Firestore</span>
          </div>
          <h2 class="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 break-words">
            Perancang Struktur Database Baru & Kalkulator Kuota Write Firestore
          </h2>
          <p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed break-words">
            Unggah file <code>.json</code> hasil export dari <strong>PHPMyAdmin</strong>. Sistem otomatis mendeteksi struktur tabel berdasarkan nama maupun kolomnya, menghitung potensi penggunaan kuota <em>writes</em> secara <strong>real-time</strong> terhadap batas <strong>Free Plan (20.000 writes/hari)</strong>, serta memberi kendali penuh untuk menghapus tabel (satuan atau sekaligus) atau memilih apakah data di dalamnya ikut disertakan.
          </p>
        </div>

        <div class="grid grid-cols-1 sm:flex sm:flex-wrap items-stretch sm:items-center gap-2 w-full sm:w-auto shrink-0">
          <button
            type="button"
            class="w-full sm:w-auto min-h-[44px] px-3.5 py-2 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/60 dark:bg-emerald-950/40 hover:bg-emerald-100/70 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
            @click="handleLoadSamplePhpMyAdminJson"
          >
            <Sparkles class="w-3.5 h-3.5 shrink-0" />
            <span>Muat Contoh JSON PHPMyAdmin</span>
          </button>

          <button
            v-if="rawTables.length > 0 || initialParsedTablesSnapshot.length > 0"
            type="button"
            class="w-full sm:w-auto min-h-[44px] px-3.5 py-2 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50/60 dark:bg-rose-950/30 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-100 transition-colors flex items-center justify-center gap-1.5"
            title="Bersihkan proses migrasi"
            @click="resetJsonImporter"
          >
            <Trash2 class="w-4 h-4 shrink-0" />
            <span class="sm:hidden">Reset Proses Migrasi</span>
          </button>
        </div>
      </div>

      <!-- STEP 1: Pilih File JSON dari PHPMyAdmin -->
      <div class="space-y-3 min-w-0">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Langkah 1 · Pilih & Proses File JSON (Export PHPMyAdmin)
          </span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-12 gap-3 sm:gap-4 items-stretch">
          <label
            class="md:col-span-8 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3.5 sm:p-4 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950/60 hover:border-emerald-600 cursor-pointer transition-colors min-w-0"
          >
            <div class="flex items-start sm:items-center gap-3 text-left min-w-0">
              <div class="w-10 h-10 rounded-xl bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <Upload class="w-5 h-5" />
              </div>
              <div class="min-w-0 flex-1">
                <div class="text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100 break-all sm:break-words">
                  {{ uploadedFileName ? `File JSON aktif: ${uploadedFileName}` : 'Pilih File JSON Export PHPMyAdmin (.json)' }}
                </div>
                <div class="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 break-words">
                  Mendukung format array export PHPMyAdmin (header, database, table, data) dengan berbagai penamaan tabel
                </div>
              </div>
            </div>

            <span class="w-full sm:w-auto min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold flex items-center justify-center whitespace-nowrap shrink-0">
              Pilih File .JSON
            </span>
            <input
              type="file"
              accept=".json,application/json"
              class="hidden"
              @change="handleJsonFileUpload"
            />
          </label>

          <div class="md:col-span-4 flex flex-col justify-center gap-2">
            <button
              type="button"
              class="min-h-[44px] w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              @click="showManualJsonEditor = !showManualJsonEditor"
            >
              {{ showManualJsonEditor ? 'Sembunyikan Editor JSON' : 'Tempel Konten JSON Manual' }}
            </button>
          </div>
        </div>

        <!-- Optional Manual JSON Paste Area -->
        <div v-if="showManualJsonEditor" class="space-y-2.5">
          <textarea
            v-model="rawJsonText"
            rows="6"
            placeholder='Tempel isi file JSON dari PHPMyAdmin di sini (contoh: [{"type":"table","name":"transaksi","data":[...]}])...'
            class="w-full p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 font-mono text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-600"
          ></textarea>
          <div class="flex justify-end">
            <button
              type="button"
              class="w-full sm:w-auto min-h-[42px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
              @click="handleProcessManualJson"
            >
              Proses Konten JSON
            </button>
          </div>
        </div>
      </div>

      <!-- Restore Notice if all tables were deleted -->
      <div
        v-if="rawTables.length === 0 && initialParsedTablesSnapshot.length > 0"
        class="rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/60 dark:bg-amber-950/30 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
      >
        <span class="text-amber-800 dark:text-amber-200">
          Seluruh tabel telah dihapus dari daftar proses. Anda dapat memulihkan kembali tabel dari file JSON yang diunggah.
        </span>
        <button
          type="button"
          class="w-full sm:w-auto min-h-[40px] px-3.5 py-2 rounded-xl bg-amber-600 text-white font-semibold flex items-center justify-center gap-1.5 shrink-0"
          @click="restoreAllInitialTables"
        >
          <RotateCcw class="w-3.5 h-3.5 shrink-0" />
          <span>Pulihkan Semua Tabel ({{ initialParsedTablesSnapshot.length }})</span>
        </button>
      </div>

      <!-- ================================================================= -->
      <!-- STEP 2 & 3: Write Quota Estimation + Interactive Legacy Tables    -->
      <!-- ================================================================= -->
      <div v-if="rawTables.length > 0 && migrationAnalysis" class="space-y-6 pt-2 min-w-0">
        <!-- Potensi Total Writes Calculator Card (Auto-recalculates on every table/data toggle) -->
        <div class="rounded-2xl border border-emerald-200/80 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20 p-3.5 sm:p-5 space-y-4 min-w-0">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div class="flex items-start sm:items-center gap-2 min-w-0">
              <Calculator class="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5 sm:mt-0" />
              <h3 class="text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100 break-words">
                Kalkulasi Real-Time Potensi Writes ke Cloud Firestore (Limit Free Plan: 20.000 Writes/Hari)
              </h3>
            </div>
            <span
              class="text-[11px] sm:text-xs font-mono font-semibold px-2.5 py-1 rounded-lg self-start sm:self-auto shrink-0"
              :class="
                migrationAnalysis.writeEstimation.isWithinFreeTier
                  ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                  : 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
              "
            >
              {{
                migrationAnalysis.writeEstimation.isWithinFreeTier
                  ? 'AMAN · Di Bawah Limit Free Plan 20k'
                  : 'PERINGATAN · Melebihi Limit 20k Writes/Hari'
              }}
            </span>
          </div>

          <!-- 4 Key Quota Metrics -->
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
            <div class="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 sm:p-3.5 space-y-1 min-w-0">
              <div class="text-[11px] text-slate-500">Baris Tabel Lama (Disertakan)</div>
              <div class="text-lg sm:text-xl font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100 break-words">
                {{ migrationAnalysis.writeEstimation.activeLegacyRowsCount.toLocaleString('id-ID') }}
                <span class="text-xs font-normal text-slate-400">
                  / {{ migrationAnalysis.writeEstimation.rawLegacyRowsCount.toLocaleString('id-ID') }}
                </span>
              </div>
              <div class="text-[11px] text-slate-400">
                {{ migrationAnalysis.writeEstimation.totalTablesWithDataIncluded }} dari {{ migrationAnalysis.writeEstimation.totalActiveTablesCount }} tabel aktif menyertakan data
              </div>
            </div>

            <div class="rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-white dark:bg-slate-900 p-3 sm:p-3.5 space-y-1 min-w-0">
              <div class="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
                Potensi Total Writes Firestore
              </div>
              <div class="text-lg sm:text-xl font-mono font-bold tabular-nums text-emerald-600 dark:text-emerald-400 break-words">
                {{ migrationAnalysis.writeEstimation.optimizedFirestoreWrites.toLocaleString('id-ID') }} writes
              </div>
              <div class="text-[11px] text-slate-400">
                Dihemat: {{ migrationAnalysis.writeEstimation.writesSavedCount.toLocaleString('id-ID') }} writes
              </div>
            </div>

            <div class="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 sm:p-3.5 space-y-1 min-w-0">
              <div class="text-[11px] text-slate-500">Pemakaian Kuota Harian (20k)</div>
              <div class="text-lg sm:text-xl font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100">
                {{ migrationAnalysis.writeEstimation.quotaUsagePercentage }}%
              </div>
              <div class="text-[11px] text-slate-400 font-mono tabular-nums">
                Sisa: {{ migrationAnalysis.writeEstimation.remainingFreeWrites.toLocaleString('id-ID') }} writes
              </div>
            </div>

            <div class="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 sm:p-3.5 space-y-1 min-w-0">
              <div class="text-[11px] text-slate-500">Jumlah Batch Commit</div>
              <div class="text-lg sm:text-xl font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100">
                {{ migrationAnalysis.writeEstimation.estimatedBatchesCount }} batch
              </div>
              <div class="text-[11px] text-slate-400">Maks. 450 dokumen / writeBatch</div>
            </div>
          </div>

          <!-- Progress Bar vs 20,000 Writes -->
          <div class="space-y-1.5">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] sm:text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400">
              <span class="break-words">
                Estimasi Writes: {{ migrationAnalysis.writeEstimation.optimizedFirestoreWrites.toLocaleString('id-ID') }} / {{ FIRESTORE_FREE_TIER_DAILY_WRITES.toLocaleString('id-ID') }} (Limit Harian Spark/Free Plan)
              </span>
              <span class="font-bold">{{ migrationAnalysis.writeEstimation.quotaUsagePercentage }}%</span>
            </div>
            <div class="h-2.5 w-full rounded-full bg-slate-200/80 dark:bg-slate-800 overflow-hidden">
              <div
                class="h-full rounded-full transition-all duration-300"
                :class="
                  migrationAnalysis.writeEstimation.isWithinFreeTier
                    ? 'bg-emerald-600'
                    : 'bg-rose-600'
                "
                :style="{
                  width: `${Math.min(100, Math.max(migrationAnalysis.writeEstimation.optimizedFirestoreWrites > 0 ? 2 : 0, migrationAnalysis.writeEstimation.quotaUsagePercentage))}%`,
                }"
              ></div>
            </div>
          </div>

          <!-- Per-Collection Write Breakdown Responsive Table -->
          <div class="rounded-xl border border-slate-200/80 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900 w-full min-w-0">
            <div class="overflow-x-auto w-full">
              <table class="w-full text-left border-collapse text-xs">
                <thead>
                  <tr class="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 font-mono">
                    <th class="py-2 px-3 font-semibold">Koleksi Firestore Tujuan</th>
                    <th class="py-2 px-3 font-semibold">Tabel Lama Terpetakan</th>
                    <th class="py-2 px-3 font-semibold text-right">Baris Tabel Lama</th>
                    <th class="py-2 px-3 font-semibold text-right">Baris Disertakan</th>
                    <th class="py-2 px-3 font-semibold text-right">Kebutuhan Writes</th>
                    <th class="py-2 px-3 font-semibold">Keterangan Optimasi</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 dark:divide-slate-800/70">
                  <tr
                    v-for="item in migrationAnalysis.writeEstimation.collectionBreakdown"
                    :key="item.collectionName"
                  >
                    <td class="py-2 px-3 font-mono font-semibold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                      {{ item.collectionName }}
                    </td>
                    <td class="py-2 px-3 font-mono text-slate-600 dark:text-slate-300">
                      <span v-if="item.matchedTableNames.length > 0">
                        {{ item.matchedTableNames.join(', ') }}
                      </span>
                      <span v-else class="text-slate-400 italic">Tidak ada tabel</span>
                    </td>
                    <td class="py-2 px-3 font-mono tabular-nums text-right text-slate-600 dark:text-slate-400">
                      {{ item.legacyRowsCount.toLocaleString('id-ID') }}
                    </td>
                    <td class="py-2 px-3 font-mono tabular-nums text-right text-slate-700 dark:text-slate-300">
                      {{ item.includedLegacyRowsCount.toLocaleString('id-ID') }}
                    </td>
                    <td class="py-2 px-3 font-mono tabular-nums font-bold text-right text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {{ item.newDocsWritesCount.toLocaleString('id-ID') }} writes
                    </td>
                    <td class="py-2 px-3 text-slate-600 dark:text-slate-400 min-w-[240px]">
                      {{ item.note }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- =============================================================== -->
        <!-- STEP 2: Pratinjau Data JSON Lama + Kontrol Hapus & Sertakan Data -->
        <!-- =============================================================== -->
        <div class="space-y-4 min-w-0">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div class="min-w-0">
              <span class="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Langkah 2 · Pratinjau Data JSON Lama & Seleksi Tabel / Data
              </span>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5 break-words">
                Pilih satu atau beberapa tabel sekaligus untuk dihapus dari proses, atau centang/nonaktifkan opsi <strong>"Sertakan Data"</strong> pada setiap tabel. Kalkulasi potensi <em>writes</em> di atas akan langsung diperbarui secara otomatis.
              </p>
            </div>

            <!-- STEP 4 Button: Klik buat generate struktur database baru -->
            <button
              type="button"
              class="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-emerald-600 hover:opacity-90 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-opacity shrink-0"
              @click="handleGenerateNewDatabaseSchema"
            >
              <Layers class="w-4 h-4 shrink-0" />
              <span>Generate Rancangan Struktur Database Baru</span>
            </button>
          </div>

          <!-- Interactive Table Selection & Data Inclusion Control Matrix -->
          <div class="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 p-3.5 sm:p-4 space-y-3.5 min-w-0">
            <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div class="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Daftar Tabel JSON ({{ rawTables.length }} Tabel Aktif<span v-if="removedTablesCount > 0"> · {{ removedTablesCount }} Dihapus</span><span v-if="selectedRawTableNames.length > 0" class="text-rose-600 dark:text-rose-400"> · {{ selectedRawTableNames.length }} Terpilih</span>)
              </div>

              <div class="grid grid-cols-1 sm:flex sm:flex-wrap items-stretch sm:items-center gap-2 w-full lg:w-auto">
                <button
                  type="button"
                  class="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:border-rose-400 flex items-center justify-center gap-1.5 transition-colors"
                  @click="toggleSelectAllRawTables"
                >
                  <CheckSquare v-if="isAllRawTablesSelected" class="w-3.5 h-3.5 shrink-0 text-rose-600 dark:text-rose-400" />
                  <Square v-else class="w-3.5 h-3.5 shrink-0" />
                  <span>{{ isAllRawTablesSelected ? 'Batal Pilih Semua' : 'Pilih Semua Tabel' }}</span>
                </button>

                <button
                  v-if="selectedRawTableNames.length > 0"
                  type="button"
                  class="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-xs"
                  @click="removeSelectedRawTables"
                >
                  <Trash2 class="w-3.5 h-3.5 shrink-0" />
                  <span>Hapus {{ selectedRawTableNames.length }} Tabel Terpilih</span>
                </button>

                <button
                  type="button"
                  class="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-300 hover:border-emerald-500 flex items-center justify-center transition-colors"
                  @click="setAllTablesIncludeData(true)"
                >
                  Sertakan Semua Data
                </button>

                <button
                  type="button"
                  class="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-300 hover:border-amber-500 flex items-center justify-center transition-colors"
                  @click="setAllTablesIncludeData(false)"
                >
                  Hanya Struktur (0 Writes)
                </button>

                <button
                  v-if="removedTablesCount > 0"
                  type="button"
                  class="min-h-[38px] px-3 py-1.5 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 text-xs font-semibold text-amber-700 dark:text-amber-300 flex items-center justify-center gap-1.5"
                  @click="restoreAllInitialTables"
                >
                  <RotateCcw class="w-3.5 h-3.5 shrink-0" />
                  <span>Pulihkan {{ removedTablesCount }} Tabel Terhapus</span>
                </button>
              </div>
            </div>

            <!-- MOBILE VIEW (< md): Clean Card List so no buttons overlap or require horizontal scroll -->
            <div class="grid grid-cols-1 gap-3 md:hidden">
              <div
                v-for="(tbl, idx) in rawTables"
                :key="`mob-${tbl.tableName}`"
                class="rounded-xl border p-3.5 space-y-3 transition-colors min-w-0"
                :class="
                  selectedRawTableNames.includes(tbl.tableName)
                    ? 'border-rose-400 dark:border-rose-700 bg-rose-50/20 dark:bg-rose-950/15'
                    : activeRawTableIdx === idx
                    ? 'border-emerald-500/70 bg-emerald-50/30 dark:bg-emerald-950/20'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                "
              >
                <div class="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    class="flex items-center gap-2 text-left min-w-0"
                    @click="toggleSelectRawTable(tbl.tableName)"
                  >
                    <CheckSquare
                      v-if="selectedRawTableNames.includes(tbl.tableName)"
                      class="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400"
                    />
                    <Square v-else class="w-4 h-4 shrink-0 text-slate-400" />
                    <span class="font-mono text-xs font-bold text-slate-900 dark:text-slate-100 break-all">
                      {{ tbl.tableName }}
                    </span>
                  </button>

                  <span class="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 font-mono text-[11px] font-semibold text-slate-700 dark:text-slate-300 shrink-0">
                    {{ tbl.rows.length.toLocaleString('id-ID') }} baris
                  </span>
                </div>

                <!-- Soft delete info -->
                <div class="text-[11px] font-mono">
                  <span
                    v-if="tbl.detectedSoftDeleteColumns && tbl.detectedSoftDeleteColumns.length > 0"
                    class="text-amber-700 dark:text-amber-400 font-semibold"
                  >
                    Soft Delete: {{ tbl.detectedSoftDeleteColumns.join(', ') }} ({{ tbl.softDeletedRowsCount || 0 }} baris diarsipkan)
                  </span>
                  <span v-else class="text-slate-400 italic">
                    Tidak ada kolom deleted di tabel lama
                  </span>
                </div>

                <!-- Target Collection Selector -->
                <div class="space-y-1">
                  <label class="block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Target Koleksi Firestore Baru:
                  </label>
                  <select
                    v-model="tbl.detectedCategory"
                    class="w-full min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-600"
                  >
                    <option
                      v-for="opt in TARGET_COLLECTION_OPTIONS"
                      :key="opt.value"
                      :value="opt.value"
                    >
                      → {{ opt.label }}
                    </option>
                  </select>
                </div>

                <!-- Mobile Action Buttons (Non-overlapping 2-row/grid layout) -->
                <div class="grid grid-cols-1 gap-2 pt-1">
                  <button
                    type="button"
                    class="w-full min-h-[38px] px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                    :class="
                      tbl.includeData
                        ? 'border-emerald-600/40 bg-emerald-50/70 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                    "
                    @click="toggleTableIncludeData(idx)"
                  >
                    <CheckSquare v-if="tbl.includeData" class="w-3.5 h-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <Square v-else class="w-3.5 h-3.5 shrink-0" />
                    <span>{{ tbl.includeData ? `Sertakan Data (${tbl.rows.length} baris)` : 'Hanya Struktur (0 Write)' }}</span>
                  </button>

                  <div class="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      class="min-h-[38px] px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                      :class="
                        activeRawTableIdx === idx
                          ? 'border-emerald-600 bg-emerald-600 text-white'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                      "
                      @click="activeRawTableIdx = idx"
                    >
                      <TableIcon class="w-3.5 h-3.5 shrink-0" />
                      <span>{{ activeRawTableIdx === idx ? 'Dilihat' : 'Lihat Isi' }}</span>
                    </button>

                    <button
                      type="button"
                      class="min-h-[38px] px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-white dark:bg-slate-900 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                      @click="removeRawTable(idx)"
                    >
                      <Trash2 class="w-3.5 h-3.5 shrink-0" />
                      <span>Hapus Tabel</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- DESKTOP VIEW (md+): Full Control Table for Managing Each Legacy Table -->
            <div class="hidden md:block rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900">
              <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr class="border-b border-slate-200 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-950 text-slate-600 dark:text-slate-400 font-mono">
                      <th class="py-2 px-3 w-9 text-center">
                        <button
                          type="button"
                          class="inline-flex items-center justify-center"
                          title="Pilih semua tabel"
                          @click="toggleSelectAllRawTables"
                        >
                          <CheckSquare v-if="isAllRawTablesSelected" class="w-4 h-4 text-rose-600 dark:text-rose-400" />
                          <Square v-else class="w-4 h-4 text-slate-400" />
                        </button>
                      </th>
                      <th class="py-2 px-3 font-semibold">Nama Tabel JSON Lama</th>
                      <th class="py-2 px-3 font-semibold text-right">Jumlah Baris</th>
                      <th class="py-2 px-3 font-semibold">Deteksi Soft Delete</th>
                      <th class="py-2 px-3 font-semibold">Target Koleksi Baru (Dapat Diubah)</th>
                      <th class="py-2 px-3 font-semibold text-center">Opsi Sertakan Data</th>
                      <th class="py-2 px-3 font-semibold text-right">Aksi Tabel</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100 dark:divide-slate-800/70">
                    <tr
                      v-for="(tbl, idx) in rawTables"
                      :key="tbl.tableName"
                      class="transition-colors"
                      :class="
                        selectedRawTableNames.includes(tbl.tableName)
                          ? 'bg-rose-50/40 dark:bg-rose-950/20'
                          : activeRawTableIdx === idx
                          ? 'bg-emerald-50/40 dark:bg-emerald-950/20'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'
                      "
                    >
                      <td class="py-2 px-3 text-center">
                        <button
                          type="button"
                          class="inline-flex items-center justify-center"
                          @click="toggleSelectRawTable(tbl.tableName)"
                        >
                          <CheckSquare
                            v-if="selectedRawTableNames.includes(tbl.tableName)"
                            class="w-4 h-4 text-rose-600 dark:text-rose-400"
                          />
                          <Square v-else class="w-4 h-4 text-slate-400 hover:text-slate-600" />
                        </button>
                      </td>

                      <td class="py-2 px-3 font-mono">
                        <button
                          type="button"
                          class="font-semibold text-left hover:underline flex items-center gap-1.5"
                          :class="
                            activeRawTableIdx === idx
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-slate-900 dark:text-slate-100'
                          "
                          @click="activeRawTableIdx = idx"
                        >
                          <span>{{ tbl.tableName }}</span>
                          <span
                            v-if="activeRawTableIdx === idx"
                            class="text-[10px] font-sans font-normal text-emerald-600 dark:text-emerald-400"
                          >
                            (Sedang dilihat)
                          </span>
                        </button>
                      </td>

                      <td class="py-2 px-3 font-mono tabular-nums text-right text-slate-700 dark:text-slate-300">
                        {{ tbl.rows.length.toLocaleString('id-ID') }} baris
                      </td>

                      <!-- Detected Soft Delete Column Status -->
                      <td class="py-2 px-3 font-mono">
                        <div
                          v-if="tbl.detectedSoftDeleteColumns && tbl.detectedSoftDeleteColumns.length > 0"
                          class="space-y-0.5"
                        >
                          <div class="text-amber-700 dark:text-amber-400 font-semibold flex items-center gap-1">
                            <span>Kolom: {{ tbl.detectedSoftDeleteColumns.join(', ') }}</span>
                          </div>
                          <div class="text-[10px] text-slate-500 dark:text-slate-400">
                            {{ tbl.softDeletedRowsCount || 0 }} baris terhapus (dipertahankan)
                          </div>
                        </div>
                        <span v-else class="text-slate-400 italic text-[11px]">Tidak ada kolom deleted</span>
                      </td>

                      <!-- Target Collection Mapping Selector -->
                      <td class="py-2 px-3">
                        <select
                          v-model="tbl.detectedCategory"
                          class="min-h-[32px] px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-600"
                        >
                          <option
                            v-for="opt in TARGET_COLLECTION_OPTIONS"
                            :key="opt.value"
                            :value="opt.value"
                          >
                            → {{ opt.label }}
                          </option>
                        </select>
                      </td>

                      <!-- Toggle Include Data Checkbox Button -->
                      <td class="py-2 px-3 text-center">
                        <button
                          type="button"
                          class="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border text-xs font-semibold transition-colors whitespace-nowrap"
                          :class="
                            tbl.includeData
                              ? 'border-emerald-600/40 bg-emerald-50/70 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                              : 'border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                          "
                          @click="toggleTableIncludeData(idx)"
                        >
                          <CheckSquare v-if="tbl.includeData" class="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          <Square v-else class="w-3.5 h-3.5" />
                          <span>{{ tbl.includeData ? `Sertakan Data (${tbl.rows.length})` : 'Hanya Struktur (0 Write)' }}</span>
                        </button>
                      </td>

                      <!-- Delete / Exclude Table Action -->
                      <td class="py-2 px-3 text-right">
                        <button
                          type="button"
                          class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-medium transition-colors whitespace-nowrap"
                          title="Hapus tabel ini dari proses generate database baru"
                          @click="removeRawTable(idx)"
                        >
                          <Trash2 class="w-3.5 h-3.5" />
                          <span>Hapus Tabel</span>
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- Raw Tables Quick Selector Tabs for Data Preview -->
          <div class="flex items-center gap-1.5 overflow-x-auto pb-1 w-full">
            <button
              v-for="(tbl, idx) in rawTables"
              :key="tbl.tableName"
              type="button"
              class="min-h-[36px] px-3 py-1.5 rounded-xl border text-xs font-mono font-medium transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5"
              :class="
                activeRawTableIdx === idx
                  ? 'border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 font-semibold'
                  : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300'
              "
              @click="activeRawTableIdx = idx"
            >
              <span>{{ tbl.tableName }}</span>
              <span class="text-[10px] opacity-80">
                ({{ tbl.includeData ? tbl.rows.length : 'Data Nonaktif' }})
              </span>
            </button>
          </div>

          <!-- Responsive Table for Selected Raw JSON Table -->
          <div
            v-if="activeRawTable"
            class="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900 w-full min-w-0"
          >
            <!-- Active Table Quick Toolbar (Fully Responsive on Mobile) -->
            <div class="p-3.5 sm:px-4 sm:py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div class="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                <span class="font-mono font-bold text-slate-900 dark:text-slate-100 break-all">
                  Tabel: {{ activeRawTable.tableName }}
                </span>
                <span class="text-slate-400 hidden sm:inline">·</span>
                <span class="font-mono text-slate-500">
                  {{ activeRawTable.columns.length }} kolom · {{ activeRawTable.rows.length.toLocaleString('id-ID') }} baris
                </span>
                <span class="text-slate-400 hidden sm:inline">·</span>
                <span
                  class="font-semibold"
                  :class="
                    activeRawTable.includeData
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-amber-600 dark:text-amber-400'
                  "
                >
                  {{ activeRawTable.includeData ? 'Data Disertakan' : 'Data Tidak Disertakan (0 Writes)' }}
                </span>
              </div>

              <div class="grid grid-cols-1 sm:flex sm:flex-wrap items-stretch sm:items-center gap-2 w-full sm:w-auto shrink-0">
                <button
                  type="button"
                  class="w-full sm:w-auto min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center justify-center"
                  @click="toggleTableIncludeData(activeRawTableIdx)"
                >
                  {{ activeRawTable.includeData ? 'Jangan Sertakan Data Tabel Ini' : 'Sertakan Data Tabel Ini' }}
                </button>
                <button
                  type="button"
                  class="w-full sm:w-auto min-h-[38px] px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 text-xs font-medium flex items-center justify-center gap-1.5"
                  @click="removeRawTable(activeRawTableIdx)"
                >
                  <Trash2 class="w-3.5 h-3.5 shrink-0" />
                  <span class="truncate">Hapus Tabel {{ activeRawTable.tableName }}</span>
                </button>
              </div>
            </div>

            <div v-if="activeRawTable.rows.length === 0" class="p-6 text-center text-xs text-slate-500">
              Tabel <code>{{ activeRawTable.tableName }}</code> tidak memiliki baris data.
            </div>
            <div v-else class="overflow-x-auto max-h-80">
              <table class="w-full text-left border-collapse text-xs">
                <thead>
                  <tr class="border-b border-slate-200 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-950 text-slate-600 dark:text-slate-400 font-mono">
                    <th class="py-2.5 px-3 font-semibold">#</th>
                    <th
                      v-for="col in activeRawTable.columns"
                      :key="col"
                      class="py-2.5 px-3 font-semibold whitespace-nowrap"
                    >
                      {{ col }}
                    </th>
                  </tr>
                </thead>
                <tbody
                  class="divide-y divide-slate-200/60 dark:divide-slate-800/70"
                  :class="!activeRawTable.includeData ? 'opacity-50' : ''"
                >
                  <tr
                    v-for="(row, rIdx) in activeRawTable.rows.slice(0, 100)"
                    :key="rIdx"
                    class="hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  >
                    <td class="py-2.5 px-3 font-mono tabular-nums text-slate-400">
                      {{ rIdx + 1 }}
                    </td>
                    <td
                      v-for="col in activeRawTable.columns"
                      :key="col"
                      class="py-2.5 px-3 font-mono tabular-nums text-slate-800 dark:text-slate-200 whitespace-nowrap max-w-xs truncate"
                    >
                      {{ row[col] === null || row[col] === undefined ? 'NULL' : row[col] }}
                    </td>
                  </tr>
                </tbody>
              </table>
              <div
                v-if="activeRawTable.rows.length > 100"
                class="px-4 py-2 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 text-[11px] font-mono text-slate-500 text-center"
              >
                Menampilkan 100 baris pertama dari total {{ activeRawTable.rows.length.toLocaleString('id-ID') }} baris untuk menjaga performa tabel tetap ringan.
              </div>
            </div>
          </div>
        </div>

        <!-- =============================================================== -->
        <!-- STEP 5 & 6: New Database Schema Design Table & Explanations     -->
        <!-- =============================================================== -->
        <div
          v-if="schemaDesignGenerated"
          class="space-y-5 pt-4 border-t border-slate-200 dark:border-slate-800 min-w-0"
        >
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div class="space-y-1 min-w-0">
              <span class="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                Langkah 3 · Rancangan Struktur Database Baru (Cloud Firestore)
              </span>
              <h3 class="text-base font-semibold text-slate-900 dark:text-slate-100 break-words">
                Spesifikasi Koleksi, Field, Tipe Data, dan Proteksi Histori Soft Delete
              </h3>
              <p class="text-xs text-slate-500 dark:text-slate-400 break-words">
                Dirancang khusus berdasarkan tabel yang Anda pilih pada Langkah 2: mendeteksi kolom <code>deleted</code> / <code>deleted_at</code> dari database lama SisaUang untuk mempertahankan histori keuangan, mendukung multi-pemilik dalam 1 sumber dana (<em>Wallet → Pemilik Dana</em>), 3 jenis transaksi (<em>income, expense, transfer</em>), serta manajemen kategori.
              </p>
            </div>

            <!-- STEP 7 Button: Klik "Konversi struktur dan isi database lama ke format database baru" -->
            <button
              type="button"
              class="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors shadow-xs text-center shrink-0"
              @click="handleConvertLegacyToNewFormat"
            >
              <GitCompareArrows class="w-4 h-4 shrink-0" />
              <span>Konversi struktur & isi database lama ke format baru</span>
            </button>
          </div>

          <!-- Soft Delete Detection Banner for Financial History Preservation -->
          <div class="rounded-2xl border border-amber-200/80 dark:border-amber-900/50 bg-amber-50/60 dark:bg-amber-950/25 p-3.5 sm:p-4 space-y-2 min-w-0">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
              <div class="flex items-start sm:items-center gap-2 text-xs font-bold text-amber-800 dark:text-amber-300">
                <ShieldCheck class="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5 sm:mt-0" />
                <span>Proteksi Histori Keuangan (Soft Delete Architecture) Aktif</span>
              </div>
              <div class="text-[11px] sm:text-xs font-mono text-amber-700 dark:text-amber-300 break-words">
                Terdeteksi pada <strong>{{ migrationAnalysis.softDeleteStats.tablesWithSoftDelete }}</strong> tabel lama ·
                <strong>{{ migrationAnalysis.softDeleteStats.totalSoftDeletedRowsDetected }}</strong> baris berstatus soft-deleted dipertahankan
              </div>
            </div>
            <p class="text-xs text-slate-700 dark:text-slate-300 leading-relaxed break-words">
              Generator mendeteksi kolom soft delete pada database lama
              <span v-if="migrationAnalysis.softDeleteStats.detectedColumnNames.length > 0">
                (<code>{{ migrationAnalysis.softDeleteStats.detectedColumnNames.join(' · ') }}</code>)
              </span>
              dan secara otomatis menyertakan field standar <code>deleted</code> (<em>boolean</em>) serta <code>deletedAt</code> (<em>timestamp | null</em>) di setiap koleksi utama (<code>users</code>, <code>wallets</code>, <code>wallet_owners</code>, <code>categories</code>, <code>transactions</code>, <code>budgets</code>). Seluruh penghapusan data di aplikasi menggunakan mekanisme <strong>Soft Delete</strong> agar histori mutasi dana tetap utuh jika terjadi kesalahan hapus atau error sistem.
            </p>
          </div>

          <!-- New Schema Collection Selector Tabs -->
          <div class="flex items-center gap-1.5 overflow-x-auto pb-1 w-full">
            <button
              v-for="(schema, sIdx) in migrationAnalysis.newSchemaDesigns"
              :key="schema.collectionName"
              type="button"
              class="min-h-[36px] px-3 py-1.5 rounded-xl border text-xs font-mono font-medium transition-colors whitespace-nowrap shrink-0"
              :class="
                activeSchemaIdx === sIdx
                  ? 'border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 font-semibold'
                  : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
              "
              @click="activeSchemaIdx = sIdx"
            >
              {{ schema.collectionName }} ({{ schema.fields.length }} field · {{ schema.estimatedWritesCount }} writes)
            </button>
          </div>

          <!-- Selected Collection Schema Details + Responsive Field Table + Change Explanation -->
          <div
            v-if="activeSchemaCollection"
            class="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-950/40 p-3.5 sm:p-5 space-y-4 min-w-0"
          >
            <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5 border-b border-slate-200/70 dark:border-slate-800 pb-3">
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                  <span class="text-sm font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    /{{ activeSchemaCollection.collectionName }}
                  </span>
                  <span class="text-xs text-slate-400 hidden sm:inline">·</span>
                  <span class="text-xs text-slate-600 dark:text-slate-300 break-words">
                    Sumber Tabel Lama: <code>{{ activeSchemaCollection.legacySourceTables.join(', ') }}</code>
                  </span>
                  <span
                    v-if="activeSchemaCollection.softDeleteSupported"
                    class="text-[11px] font-mono font-semibold text-amber-700 dark:text-amber-400 bg-amber-100/70 dark:bg-amber-950/60 px-2 py-0.5 rounded-md break-words"
                  >
                    Soft Delete: {{ activeSchemaCollection.detectedLegacySoftDeleteFields.join(', ') }} → deleted & deletedAt
                  </span>
                </div>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-1 break-words">
                  {{ activeSchemaCollection.purpose }}
                </p>
              </div>
              <div class="text-xs font-mono tabular-nums text-slate-700 dark:text-slate-300 shrink-0 text-left sm:text-right">
                <div>
                  Status Data:
                  <strong>{{ activeSchemaCollection.dataIncluded ? `${activeSchemaCollection.estimatedDocumentCount} dokumen (${activeSchemaCollection.estimatedWritesCount} writes)` : 'Hanya Struktur (0 writes)' }}</strong>
                </div>
                <div v-if="activeSchemaCollection.softDeletedDocsCount > 0" class="text-[11px] text-amber-600 dark:text-amber-400">
                  Termasuk {{ activeSchemaCollection.softDeletedDocsCount }} dokumen berstatus Soft-Deleted (Arsip)
                </div>
              </div>
            </div>

            <!-- Responsive Table of Fields & Data Types -->
            <div class="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900 w-full min-w-0">
              <div class="overflow-x-auto w-full">
                <table class="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr class="border-b border-slate-200 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-950 text-slate-600 dark:text-slate-400 font-mono">
                      <th class="py-2.5 px-3 font-semibold">Nama Tabel / Koleksi</th>
                      <th class="py-2.5 px-3 font-semibold">Nama Field</th>
                      <th class="py-2.5 px-3 font-semibold">Tipe Data</th>
                      <th class="py-2.5 px-3 font-semibold">Wajib</th>
                      <th class="py-2.5 px-3 font-semibold">Fungsi & Keterangan</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100 dark:divide-slate-800/70">
                    <tr
                      v-for="f in activeSchemaCollection.fields"
                      :key="f.fieldName"
                      :class="
                        f.isSoftDeleteField
                          ? 'bg-amber-50/50 dark:bg-amber-950/20 hover:bg-amber-50/80 dark:hover:bg-amber-950/35'
                          : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/30'
                      "
                    >
                      <td class="py-2 px-3 font-mono text-slate-500 whitespace-nowrap">
                        {{ activeSchemaCollection.collectionName }}
                      </td>
                      <td class="py-2 px-3 font-mono font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        <span>{{ f.fieldName }}</span>
                        <span
                          v-if="f.isSoftDeleteField"
                          class="ml-1.5 text-[10px] font-mono font-semibold text-amber-700 dark:text-amber-400 underline decoration-amber-400/60"
                        >
                          [Soft Delete]
                        </span>
                      </td>
                      <td class="py-2 px-3 font-mono text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                        {{ f.dataType }}
                      </td>
                      <td class="py-2 px-3 font-mono whitespace-nowrap">
                        {{ f.required ? 'Ya (Required)' : 'Opsional' }}
                      </td>
                      <td class="py-2 px-3 text-slate-600 dark:text-slate-300 min-w-[240px]">
                        {{ f.description }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Detailed Explanation of What Changed for This New Table -->
            <div class="rounded-xl border border-emerald-200/80 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/30 p-3.5 space-y-2">
              <div class="flex items-start sm:items-center gap-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                <Info class="w-4 h-4 shrink-0 mt-0.5 sm:mt-0" />
                <span>Penjelasan Perubahan pada Koleksi <code>{{ activeSchemaCollection.collectionName }}</code>:</span>
              </div>
              <ul class="list-disc list-inside space-y-1 text-xs text-slate-700 dark:text-slate-300 leading-relaxed break-words">
                <li
                  v-for="(exp, eIdx) in activeSchemaCollection.changeExplanations"
                  :key="eIdx"
                >
                  {{ exp }}
                </li>
              </ul>
            </div>
          </div>
        </div>

        <!-- =============================================================== -->
        <!-- STEP 8 & 9: Converted Data Display + "Import ke Firestore" CTA  -->
        <!-- =============================================================== -->
        <div
          v-if="dataConversionCompleted"
          class="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-800 min-w-0"
        >
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div class="min-w-0">
              <span class="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                Langkah 4 · Hasil Konversi Struktur & Isi Database Baru
              </span>
              <h3 class="text-base font-semibold text-slate-900 dark:text-slate-100 break-words">
                Data Siap Diimpor ke Cloud Firestore ({{ migrationAnalysis.writeEstimation.optimizedFirestoreWrites.toLocaleString('id-ID') }} Dokumen)
              </h3>
            </div>

            <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full sm:w-auto shrink-0">
              <!-- Toggle Table vs JSON -->
              <div class="grid grid-cols-2 sm:flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl w-full sm:w-auto">
                <button
                  type="button"
                  class="min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                  :class="
                    convertedPreviewMode === 'table'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  "
                  @click="convertedPreviewMode = 'table'"
                >
                  <TableIcon class="w-3.5 h-3.5 shrink-0" />
                  <span>Tabel Responsif</span>
                </button>
                <button
                  type="button"
                  class="min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                  :class="
                    convertedPreviewMode === 'json'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  "
                  @click="convertedPreviewMode = 'json'"
                >
                  <Braces class="w-3.5 h-3.5 shrink-0" />
                  <span>Format JSON Baru</span>
                </button>
              </div>

              <!-- STEP 9 Button: Munculkan button untuk import database ke firestore -->
              <button
                type="button"
                :disabled="migrationAnalysis.writeEstimation.optimizedFirestoreWrites === 0 || isImporting"
                class="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 shadow-sm"
                @click="showConfirmModal = true"
              >
                <Database class="w-4 h-4 shrink-0" />
                <span>Import Database ke Firestore</span>
              </button>
            </div>
          </div>

          <!-- Converted Data View A: Responsive Table per New Collection -->
          <div v-if="convertedPreviewMode === 'table'" class="space-y-3 min-w-0">
            <div class="flex items-center gap-1.5 overflow-x-auto pb-1 w-full">
              <button
                v-for="tab in convertedCollectionTabs"
                :key="tab.key"
                type="button"
                class="min-h-[36px] px-3 py-1.5 rounded-xl border text-xs font-mono font-medium transition-colors whitespace-nowrap shrink-0"
                :class="
                  activeConvertedTab === tab.key
                    ? 'border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 font-semibold'
                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                "
                @click="activeConvertedTab = tab.key"
              >
                {{ tab.label }} ({{ tab.count }})
              </button>
            </div>

            <div class="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900 w-full min-w-0">
              <div v-if="activeConvertedRows.length === 0" class="p-8 text-center text-xs text-slate-500">
                Tidak ada dokumen yang disertakan pada koleksi <code>{{ activeConvertedTab }}</code> (tabel dihapus atau opsi "Sertakan Data" dinonaktifkan).
              </div>
              <div v-else class="overflow-x-auto max-h-96 w-full">
                <table class="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr class="border-b border-slate-200 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-950 text-slate-600 dark:text-slate-400 font-mono">
                      <th class="py-2.5 px-3 font-semibold">#</th>
                      <th
                        v-for="col in activeConvertedColumns"
                        :key="col"
                        class="py-2.5 px-3 font-semibold whitespace-nowrap"
                      >
                        {{ col }}
                      </th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-200/60 dark:divide-slate-800/70">
                    <tr
                      v-for="(row, rIdx) in activeConvertedRows.slice(0, 100)"
                      :key="rIdx"
                      class="hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    >
                      <td class="py-2.5 px-3 font-mono tabular-nums text-slate-400">
                        {{ rIdx + 1 }}
                      </td>
                      <td
                        v-for="col in activeConvertedColumns"
                        :key="col"
                        class="py-2.5 px-3 font-mono tabular-nums text-slate-800 dark:text-slate-200 whitespace-nowrap max-w-xs truncate"
                      >
                        {{ row[col] === null || row[col] === undefined ? '-' : row[col] }}
                      </td>
                    </tr>
                  </tbody>
                </table>
                <div
                  v-if="activeConvertedRows.length > 100"
                  class="px-4 py-2 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 text-[11px] font-mono text-slate-500 text-center"
                >
                  Menampilkan 100 dokumen pertama dari total {{ activeConvertedRows.length.toLocaleString('id-ID') }} dokumen hasil konversi.
                </div>
              </div>
            </div>
          </div>

          <!-- Converted Data View B: Raw JSON Output -->
          <div v-else class="space-y-2 min-w-0">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span class="text-xs text-slate-500 font-mono break-words">
                Struktur JSON Baru SisaUang (Siap Tulis ke Cloud Firestore)
              </span>
              <button
                type="button"
                class="w-full sm:w-auto min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center justify-center gap-1.5"
                @click="copyConvertedJson"
              >
                <Copy class="w-3.5 h-3.5 shrink-0" />
                <span>{{ jsonCopied ? 'Tersalin!' : 'Salin JSON Baru' }}</span>
              </button>
            </div>
            <pre
              class="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-950 text-emerald-400 font-mono text-xs overflow-x-auto max-h-96 w-full"
            >{{ formattedConvertedJson }}</pre>
          </div>
        </div>
      </div>
    </section>

    <!-- ===================================================================== -->
    <!-- MODAL: Confirm Delete Firestore Database Tables (Single or Bulk)      -->
    <!-- ===================================================================== -->
    <div
      v-if="showDeleteFirestoreConfirmModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
      @click.self="if (!isDeletingFirestoreCols) showDeleteFirestoreConfirmModal = false;"
    >
      <div
        class="w-full max-w-lg max-h-[92dvh] overflow-y-auto rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xl space-y-5"
      >
        <div class="space-y-2">
          <div class="w-11 h-11 rounded-2xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center">
            <Trash2 class="w-5 h-5" />
          </div>
          <h3 class="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100">
            Konfirmasi Hapus {{ pendingDeleteFirestoreCols.length }} Tabel Database
          </h3>
          <p class="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            Apakah Anda yakin ingin mengosongkan/menghapus seluruh isi dari
            <strong>{{ pendingDeleteFirestoreCols.length }} tabel/koleksi</strong> berikut di Cloud Firestore (<code>sisa-uang</code>)?
          </p>
        </div>

        <div class="rounded-2xl border border-rose-200/80 dark:border-rose-900/50 bg-rose-50/40 dark:bg-rose-950/25 p-4 space-y-2.5 text-xs">
          <div class="font-semibold text-rose-900 dark:text-rose-200">
            Daftar Tabel yang Akan Dihapus ({{ pendingDeleteFirestoreTotalDocs.toLocaleString('id-ID') }} Dokumen):
          </div>
          <div class="flex flex-wrap gap-1.5">
            <span
              v-for="colName in pendingDeleteFirestoreCols"
              :key="colName"
              class="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-800 font-mono text-xs font-semibold text-rose-700 dark:text-rose-300"
            >
              /{{ colName }}
            </span>
          </div>
          <p v-if="pendingDeleteFirestoreCols.includes('users') && keepSuperAdminOnDelete" class="text-[11px] text-emerald-700 dark:text-emerald-300 pt-1">
            Catatan: Akun <strong>Super Admin</strong> utama tetap dipertahankan agar sesi login Anda tetap aktif.
          </p>
          <p v-if="isDeletingFirestoreCols && deleteFirestoreProgressText" class="font-mono text-rose-700 dark:text-rose-300 pt-1">
            {{ deleteFirestoreProgressText }}
          </p>
        </div>

        <div class="flex flex-col-reverse sm:grid sm:grid-cols-2 gap-2.5 pt-1">
          <button
            type="button"
            :disabled="isDeletingFirestoreCols"
            class="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
            @click="showDeleteFirestoreConfirmModal = false"
          >
            Batal
          </button>
          <button
            type="button"
            :disabled="isDeletingFirestoreCols"
            class="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
            @click="confirmAndExecuteFirestoreCollectionsDelete"
          >
            <Trash2 class="w-4 h-4 shrink-0" />
            <span>{{ isDeletingFirestoreCols ? 'Menghapus Tabel...' : `Ya, Hapus ${pendingDeleteFirestoreCols.length} Tabel` }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- ===================================================================== -->
    <!-- STEP 10: Confirmation Modal with Detailed Execution Process Breakdown -->
    <!-- ===================================================================== -->
    <div
      v-if="showConfirmModal && migrationAnalysis"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
      @click.self="showConfirmModal = false"
    >
      <div
        class="w-full max-w-lg max-h-[92dvh] overflow-y-auto rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xl space-y-5"
      >
        <div class="space-y-2">
          <div class="w-11 h-11 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <Database class="w-5 h-5" />
          </div>
          <h3 class="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100">
            Konfirmasi Import Database Baru ke Cloud Firestore
          </h3>
          <p class="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            Apakah Anda yakin ingin menjalankan proses migrasi dan penulisan data hasil konversi ke database Cloud Firestore (<strong>sisa-uang</strong>)?
          </p>
        </div>

        <!-- Detailed Explanation of Processes That Will Run When Clicking "Ya" -->
        <div class="rounded-2xl border border-emerald-200/80 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/30 p-4 space-y-2.5 text-xs">
          <div class="font-semibold text-emerald-900 dark:text-emerald-200">
            Penjelasan Proses yang Akan Berjalan Ketika Anda Mengklik "Ya":
          </div>
          <ol class="list-decimal list-inside space-y-1.5 text-slate-700 dark:text-slate-300 leading-relaxed break-words">
            <li>
              <strong>Pengelompokan Atomic WriteBatch:</strong> Sistem membagi total
              <strong class="font-mono">{{ migrationAnalysis.writeEstimation.optimizedFirestoreWrites.toLocaleString('id-ID') }} dokumen</strong>
              ke dalam <strong class="font-mono">{{ migrationAnalysis.writeEstimation.estimatedBatchesCount }} batch</strong>
              (maksimal 450 operasi tulis per batch) agar eksekusi ke Cloud Firestore berjalan cepat dan aman.
            </li>
            <li>
              <strong>Penulisan Koleksi Baru SisaUang (Sesuai Seleksi Data Anda):</strong> Menuliskan dokumen ke koleksi
              <code>users</code> ({{ migrationAnalysis.convertedCollections.users.length }}),
              <code>wallets</code> ({{ migrationAnalysis.convertedCollections.wallets.length }}),
              <code>wallet_owners</code> ({{ migrationAnalysis.convertedCollections.wallet_owners.length }} kepemilikan dana),
              <code>categories</code> ({{ migrationAnalysis.convertedCollections.categories.length }} kategori),
              <code>transactions</code> ({{ migrationAnalysis.convertedCollections.transactions.length }} transaksi),
              <code>budgets</code> ({{ migrationAnalysis.convertedCollections.budgets.length }}), dan
              <code>activity_logs</code> ({{ migrationAnalysis.convertedCollections.activity_logs.length }}).
            </li>
            <li>
              <strong>Pemotongan Kuota Harian Free Plan:</strong> Proses ini akan memakai
              <strong class="font-mono">{{ migrationAnalysis.writeEstimation.optimizedFirestoreWrites.toLocaleString('id-ID') }} writes</strong>
              ({{ migrationAnalysis.writeEstimation.quotaUsagePercentage }}% dari batas gratis 20.000 writes/hari), sehingga Anda masih memiliki sisa kuota
              <strong class="font-mono">{{ migrationAnalysis.writeEstimation.remainingFreeWrites.toLocaleString('id-ID') }} writes</strong> hari ini.
            </li>
            <li>
              <strong>Sinkronisasi Real-Time Control Panel & Snapshot Lokal:</strong> Memperbarui daftar akun pengguna di Control Panel Super Admin serta menyinkronkan saldo kepemilikan dana secara real-time.
            </li>
          </ol>
        </div>

        <!-- Yes / No Confirmation Buttons -->
        <div class="flex flex-col-reverse sm:grid sm:grid-cols-2 gap-2.5 pt-1">
          <button
            type="button"
            :disabled="isImporting"
            class="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            @click="showConfirmModal = false"
          >
            Tidak, Batalkan
          </button>
          <button
            type="button"
            :disabled="isImporting"
            class="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
            @click="confirmAndExecuteImport"
          >
            <CheckCircle2 class="w-4 h-4 shrink-0" />
            <span>{{ isImporting ? (importProgressText || 'Menjalankan WriteBatch...') : 'Ya, Jalankan Import' }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Appearance & Theme -->
    <section class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4 w-full min-w-0">
      <div>
        <h2 class="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {{ t('theme.label') }}
        </h2>
        <p class="text-xs text-slate-500 dark:text-slate-400">
          Mendukung tema terang, gelap, maupun otomatis mengikuti pengaturan sistem perangkat Anda.
        </p>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <button
          type="button"
          class="min-h-[44px] px-4 py-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
          :class="
            themeStore.themeMode === 'light'
              ? 'border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
              : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
          "
          @click="themeStore.setTheme('light')"
        >
          <Sun class="w-4 h-4 shrink-0" />
          <span>{{ t('theme.light') }}</span>
        </button>

        <button
          type="button"
          class="min-h-[44px] px-4 py-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
          :class="
            themeStore.themeMode === 'dark'
              ? 'border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
              : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
          "
          @click="themeStore.setTheme('dark')"
        >
          <Moon class="w-4 h-4 shrink-0" />
          <span>{{ t('theme.dark') }}</span>
        </button>

        <button
          type="button"
          class="min-h-[44px] px-4 py-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
          :class="
            themeStore.themeMode === 'system'
              ? 'border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
              : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
          "
          @click="themeStore.setTheme('system')"
        >
          <Monitor class="w-4 h-4 shrink-0" />
          <span>{{ t('theme.system') }}</span>
        </button>
      </div>
    </section>

    <!-- Language & Currency (Intlify vue-i18n) -->
    <section class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4 w-full min-w-0">
      <div class="flex items-center gap-2">
        <Globe class="w-4 h-4 text-emerald-600 shrink-0" />
        <h2 class="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Bahasa & Format Lokal
        </h2>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div :class="authStore.isSuperAdmin ? 'sm:col-span-2' : ''">
          <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
            Bahasa Antarmuka (Intlify Vue I18n)
          </label>
          <div class="grid grid-cols-2 gap-2">
            <button
              type="button"
              class="min-h-[44px] px-2 rounded-xl border text-xs font-semibold transition-colors"
              :class="
                locale === 'id'
                  ? 'border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                  : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
              "
              @click="themeStore.setLocale('id')"
            >
              Bahasa Indonesia
            </button>
            <button
              type="button"
              class="min-h-[44px] px-2 rounded-xl border text-xs font-semibold transition-colors"
              :class="
                locale === 'en'
                  ? 'border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                  : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
              "
              @click="themeStore.setLocale('en')"
            >
              English
            </button>
          </div>
        </div>

        <div v-if="!authStore.isSuperAdmin">
          <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
            Tampilan Mata Uang
          </label>
          <div class="grid grid-cols-2 gap-2">
            <button
              type="button"
              class="min-h-[44px] px-2 rounded-xl border text-xs font-mono font-semibold transition-colors"
              :class="
                themeStore.currency === 'IDR'
                  ? 'border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                  : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
              "
              @click="themeStore.setCurrency('IDR')"
            >
              IDR (Rp)
            </button>
            <button
              type="button"
              class="min-h-[44px] px-2 rounded-xl border text-xs font-mono font-semibold transition-colors"
              :class="
                themeStore.currency === 'USD'
                  ? 'border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                  : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
              "
              @click="themeStore.setCurrency('USD')"
            >
              USD ($)
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- Firestore & Account Profile Summary + DisplayName & Username Editor -->
    <section class="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-5 w-full min-w-0">
      <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
        <div class="flex items-start sm:items-center gap-2 min-w-0">
          <UserIcon class="w-4 h-4 text-emerald-600 shrink-0 mt-0.5 sm:mt-0" />
          <div class="min-w-0">
            <h2 class="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Profil Akun (Display Name & Username Login)
            </h2>
            <p class="text-xs text-slate-500 dark:text-slate-400 break-words">
              Atur <strong>Display Name</strong> (mendukung spasi & karakter bebas) dan <strong>Username</strong> yang dapat digunakan untuk login layaknya alamat email.
            </p>
          </div>
        </div>
      </div>

      <form class="grid grid-cols-1 sm:grid-cols-2 gap-4" @submit.prevent="handleSaveProfile">
        <div>
          <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
            Nama Tampilan (Display Name · Bebas Spasi & Karakter)
          </label>
          <input
            v-model="profileDisplayName"
            type="text"
            required
            maxlength="80"
            placeholder="Contoh: Andika Keluarga Bahagia"
            class="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
          />
        </div>

        <div>
          <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
            Username (Dapat Digunakan untuk Login)
          </label>
          <input
            v-model="profileUsername"
            type="text"
            required
            maxlength="60"
            placeholder="Contoh: andika_keluarga"
            class="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs sm:text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
          />
        </div>

        <div class="sm:col-span-2 flex justify-end">
          <button
            type="submit"
            :disabled="authStore.isLoading"
            class="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
          >
            <Save class="w-4 h-4 shrink-0" />
            <span>Simpan Perubahan Profil</span>
          </button>
        </div>
      </form>

      <div class="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2 text-xs text-slate-600 dark:text-slate-400">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-0.5 py-1.5 border-b border-slate-100 dark:border-slate-800">
          <span>Display Name Saat Ini</span>
          <span class="font-medium text-slate-900 dark:text-slate-100 break-words">{{ authStore.user?.displayName }}</span>
        </div>
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-0.5 py-1.5 border-b border-slate-100 dark:border-slate-800">
          <span>Username Login</span>
          <span class="font-mono text-emerald-600 dark:text-emerald-400 font-semibold break-all">@{{ authStore.user?.username || authStore.user?.email.split('@')[0] }}</span>
        </div>
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-0.5 py-1.5 border-b border-slate-100 dark:border-slate-800">
          <span>Email Terdaftar</span>
          <span class="font-mono text-slate-900 dark:text-slate-100 break-all">{{ authStore.user?.email }}</span>
        </div>
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-0.5 py-1.5 border-b border-slate-100 dark:border-slate-800">
          <span>Hak Akses (Role)</span>
          <span class="font-semibold text-emerald-600 dark:text-emerald-400">
            {{ authStore.isSuperAdmin ? 'Administrator (Super Admin)' : 'Pengguna Standar' }}
          </span>
        </div>
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-0.5 py-1.5">
          <span>Skema Database</span>
          <span class="font-mono text-slate-900 dark:text-slate-100">sisa-uang (Cloud Firestore)</span>
        </div>
      </div>

      <div v-if="authStore.isSuperAdmin" class="pt-2">
        <RouterLink
          to="/control-panel"
          class="min-h-[44px] w-full px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-emerald-600 text-white text-xs font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
        >
          <ShieldCheck class="w-4 h-4 shrink-0" />
          <span>Kembali ke Control Panel (/control-panel)</span>
        </RouterLink>
      </div>
    </section>
  </div>
</template>
