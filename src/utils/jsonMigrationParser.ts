import {
  sanitizeId,
  sanitizeString,
  MAX_DISPLAY_NAME_LENGTH,
  MAX_EMAIL_LENGTH,
  MAX_WALLET_NAME_LENGTH,
  MAX_CATEGORY_LENGTH,
  MAX_NOTE_LENGTH,
  MAX_LOG_DETAIL_LENGTH,
} from '../firebase';

export type TargetCollectionCategory =
  | 'users'
  | 'wallets'
  | 'wallet_owners'
  | 'categories'
  | 'transactions'
  | 'budgets'
  | 'activity_logs';

export interface ParsedPhpMyAdminTable {
  tableName: string;
  databaseName: string;
  columns: string[];
  rows: Record<string, any>[];
  detectedCategory: TargetCollectionCategory;
  includeData: boolean;
  detectedSoftDeleteColumns: string[];
  softDeletedRowsCount: number;
}

export interface SchemaFieldDesign {
  fieldName: string;
  dataType: string;
  required: boolean;
  description: string;
  sourceLegacyColumn?: string;
  isSoftDeleteField?: boolean;
}

export interface SchemaCollectionDesign {
  collectionName: TargetCollectionCategory;
  legacySourceTables: string[];
  detectedSoftDeleteColumns?: string[];
  detectedLegacySoftDeleteFields?: string[];
  softDeleteSupported?: boolean;
  softDeletedRowsCount?: number;
  softDeletedDocsCount?: number;
  purpose: string;
  dataIncluded: boolean;
  estimatedDocumentCount: number;
  estimatedWritesCount: number;
  fields: SchemaFieldDesign[];
  changeExplanations: string[];
}

export interface NormalizedUserDoc {
  uid: string;
  legacyId: string;
  username: string;
  email: string;
  displayName: string;
  passwordHash?: string;
  role: 'user' | 'admin';
  status: 'active' | 'blocked';
  authProvider: 'password' | 'google';
  currency: 'IDR' | 'USD';
  shieldGroup?: string;
  shieldActive?: number;
  deleted: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NormalizedWalletDoc {
  id: string;
  ownerId: string;
  name: string;
  type: 'cash' | 'bank' | 'ewallet' | 'investment' | 'credit';
  balance: number;
  color: string;
  deleted: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NormalizedWalletOwnerDoc {
  id: string;
  ownerId: string;
  walletId: string;
  walletName: string;
  holderName: string;
  balance: number;
  deleted: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NormalizedCategoryDoc {
  id: string;
  ownerId: string;
  name: string;
  type: 'income' | 'expense';
  color: string;
  deleted: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NormalizedTransactionDoc {
  id: string;
  ownerId: string;
  walletId: string;
  walletName: string;
  fundOwnerId: string;
  fundOwnerName: string;
  toWalletId?: string;
  toWalletName?: string;
  toFundOwnerId?: string;
  toFundOwnerName?: string;
  type: 'income' | 'expense' | 'transfer';
  category: string;
  amount: number;
  note: string;
  date: string;
  deleted: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NormalizedBudgetDoc {
  id: string;
  ownerId: string;
  category: string;
  limitAmount: number;
  spentAmount: number;
  period: string;
  deleted: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NormalizedActivityLogDoc {
  id: string;
  actorUid: string;
  actorEmail: string;
  action: string;
  detail: string;
  severity: 'info' | 'warning' | 'critical';
  deleted?: boolean;
  deletedAt?: string | null;
  createdAt: string;
}

export interface WriteQuotaEstimation {
  freePlanDailyLimit: number;
  totalActiveTablesCount: number;
  totalTablesWithDataIncluded: number;
  rawLegacyRowsCount: number;
  activeLegacyRowsCount: number;
  optimizedFirestoreWrites: number;
  writesSavedCount: number;
  quotaUsagePercentage: number;
  remainingFreeWrites: number;
  estimatedBatchesCount: number;
  isWithinFreeTier: boolean;
  collectionBreakdown: {
    collectionName: TargetCollectionCategory;
    matchedTableNames: string[];
    legacyRowsCount: number;
    includedLegacyRowsCount: number;
    newDocsWritesCount: number;
    softDeletedDocsCount?: number;
    note: string;
  }[];
}

export interface ConvertedFirestoreCollections {
  users: NormalizedUserDoc[];
  wallets: NormalizedWalletDoc[];
  wallet_owners: NormalizedWalletOwnerDoc[];
  categories: NormalizedCategoryDoc[];
  transactions: NormalizedTransactionDoc[];
  budgets: NormalizedBudgetDoc[];
  activity_logs: NormalizedActivityLogDoc[];
}

export interface JsonMigrationAnalysis {
  rawTables: ParsedPhpMyAdminTable[];
  writeEstimation: WriteQuotaEstimation;
  newSchemaDesigns: SchemaCollectionDesign[];
  softDeleteStats?: {
    tablesWithSoftDelete: number;
    totalSoftDeletedRowsDetected: number;
    detectedColumnNames: string[];
  };
  convertedCollections: ConvertedFirestoreCollections;
}

export const FIRESTORE_FREE_TIER_DAILY_WRITES = 20000;
const MAX_HOLD_NAME_LENGTH = 60;

/**
 * Smart classifier that inspects BOTH table name and column structure
 * to accurately classify any MySQL / CodeIgniter 4 table from PHPMyAdmin JSON export.
 */
export function classifyPhpMyAdminTable(
  rawTableName: string,
  columns: string[],
  sampleRow?: Record<string, any>
): TargetCollectionCategory {
  const name = rawTableName.toLowerCase().trim();
  const cols = columns.map((c) => c.toLowerCase().trim());
  const hasCol = (patterns: string[]) =>
    cols.some((c) => patterns.some((p) => c === p || c.includes(p)));

  // 1. CodeIgniter 4 Shield / Auth Logins -> activity_logs
  if (
    name.includes('auth_login') ||
    name.includes('auth_token_login') ||
    name.includes('login_log') ||
    name.includes('activity_log') ||
    name === 'logins' ||
    name === 'logs' ||
    (hasCol(['ip_address', 'user_agent']) && hasCol(['identifier', 'id_type', 'success']))
  ) {
    return 'activity_logs';
  }

  // 2. CodeIgniter 4 Shield Users & Auth tables -> users
  if (
    name === 'users' ||
    name === 'user' ||
    name.startsWith('auth_') ||
    name.includes('identities') ||
    name.includes('groups_users') ||
    name.includes('permissions_users') ||
    name.includes('remember_tokens') ||
    (hasCol(['username', 'last_active', 'status_message']) && !hasCol(['wallet', 'sumber', 'nominal', 'amount'])) ||
    hasCol(['secret', 'secret2', 'force_reset'])
  ) {
    return 'users';
  }

  // 3. Transactions (Transaksi / Mutasi / Arus Kas / Catatan Keuangan / Journal / Cashflow)
  if (
    name.includes('trans') ||
    name.includes('mutasi') ||
    name.includes('catatan') ||
    name.includes('kas') ||
    name.includes('journal') ||
    name.includes('jurnal') ||
    name.includes('ledger') ||
    name.includes('history') ||
    name.includes('riwayat') ||
    name.includes('income') ||
    name.includes('expense') ||
    name.includes('pemasukan') ||
    name.includes('pengeluaran') ||
    name.includes('transfer') ||
    (hasCol([
      'amount',
      'nominal',
      'jumlah',
      'nilai',
      'total',
      'debit',
      'kredit',
      'credit',
      'keluar',
      'masuk',
    ]) &&
      hasCol([
        'date',
        'tanggal',
        'tgl',
        'waktu',
        'transaction_date',
        'tgl_transaksi',
        'note',
        'catatan',
        'keterangan',
        'deskripsi',
        'description',
      ]))
  ) {
    return 'transactions';
  }

  // 4. Wallet Owners / Kepemilikan Sumber Dana (Pemilik Dana / Sub-Wallet / Holder / Ownership)
  if (
    name.includes('owner') ||
    name.includes('pemilik') ||
    name.includes('kepemilikan') ||
    name.includes('holder') ||
    name.includes('sub_wallet') ||
    name.includes('sub_sumber') ||
    name.includes('alokasi_dana') ||
    name.includes('bagian_dana') ||
    name.includes('porsi') ||
    (hasCol(['wallet_id', 'id_wallet', 'sumber_dana_id', 'id_sumber_dana', 'dompet_id', 'id_dompet', 'rekening_id', 'source_id']) &&
      !hasCol(['category_id', 'id_kategori', 'date', 'tanggal', 'tgl', 'tgl_transaksi']) &&
      hasCol(['name', 'nama', 'pemilik', 'owner', 'holder', 'balance', 'saldo', 'nominal']))
  ) {
    return 'wallet_owners';
  }

  // 5. Categories (Kategori Transaksi)
  if (
    name.includes('categ') ||
    name.includes('kateg') ||
    name.includes('jenis_transaksi') ||
    name.includes('pos_') ||
    (cols.length <= 7 &&
      hasCol(['name', 'nama', 'nama_kategori', 'category_name', 'title', 'judul']) &&
      hasCol(['type', 'jenis', 'tipe', ' arus']) &&
      !hasCol(['balance', 'saldo', 'amount', 'nominal', 'limit', 'batas']))
  ) {
    return 'categories';
  }

  // 6. Budgets (Anggaran)
  if (
    name.includes('budget') ||
    name.includes('anggaran') ||
    name.includes('pagu') ||
    name.includes('limit') ||
    hasCol(['limit_amount', 'spent_amount', 'batas_anggaran', 'pagu', 'terpakai'])
  ) {
    return 'budgets';
  }

  // 7. Wallets / Sumber Dana (Dompet / Rekening / Bank / Account / Source)
  if (
    name.includes('wallet') ||
    name.includes('dompet') ||
    name.includes('sumber') ||
    name.includes('rekening') ||
    name.includes('bank') ||
    name.includes('account') ||
    name.includes('akun_dana') ||
    name.includes('dana') ||
    hasCol(['balance', 'saldo', 'initial_balance', 'saldo_awal', 'total_saldo'])
  ) {
    return 'wallets';
  }

  // Secondary heuristic based on sampleRow values if column names are generic
  if (sampleRow) {
    const valStrings = Object.values(sampleRow).map((v) => String(v ?? '').toLowerCase());
    if (
      valStrings.some((v) => v === 'income' || v === 'expense' || v === 'transfer' || v === 'pemasukan' || v === 'pengeluaran') &&
      cols.length >= 5
    ) {
      return 'transactions';
    }
  }

  // Default fallback for unrecognized financial tables: if it has many columns or date, treat as transactions, else wallets
  if (hasCol(['date', 'tanggal', 'tgl', 'created_at']) && cols.length >= 6) {
    return 'transactions';
  }

  return 'wallets';
}

/**
 * Detect soft delete columns in a legacy MySQL / CodeIgniter 4 table
 * (e.g., `deleted`, `deleted_at`, `is_deleted`, `is_delete`, `hapus`, `tgl_hapus`, `soft_delete`, `status_hapus`).
 */
export function detectSoftDeleteColumns(columns: string[]): string[] {
  const SOFT_DELETE_PATTERNS = [
    'deleted',
    'deleted_at',
    'deletedat',
    'is_deleted',
    'isdeleted',
    'is_delete',
    'soft_delete',
    'status_hapus',
    'is_hapus',
    'tgl_hapus',
    'tanggal_hapus',
    'dihapus',
    'hapus',
    'trashed',
    'trashed_at',
  ];

  return columns.filter((col) => {
    const clean = col.toLowerCase().trim();
    return SOFT_DELETE_PATTERNS.some(
      (pat) => clean === pat || clean.startsWith('deleted_') || clean.endsWith('_deleted')
    );
  });
}

/**
 * Extract normalized soft delete state (`deleted: boolean` and `deletedAt: string | null`)
 * from any legacy MySQL / CodeIgniter 4 row.
 * Supports:
 * - `deleted`: '0' / '1', 0 / 1, false / true, 'Y' / 'N'
 * - `deleted_at`: null / '0000-00-00 00:00:00' vs valid timestamp string ('2026-09-12 10:30:00')
 */
export function extractSoftDeleteFromRow(
  row: Record<string, any>,
  fallbackUpdatedAt?: string
): {
  deleted: boolean;
  deletedAt: string | null;
  matchedColumn?: string;
} {
  if (!row || typeof row !== 'object') {
    return { deleted: false, deletedAt: null };
  }

  const keys = Object.keys(row);
  let isDeleted = false;
  let resolvedDeletedAt: string | null = null;
  let matchedColumn: string | undefined;

  // 1. Check timestamp-based soft delete columns (`deleted_at`, `deletedAt`, `tgl_hapus`, `trashed_at`)
  const tsCandidates = ['deleted_at', 'deletedat', 'tgl_hapus', 'tanggal_hapus', 'trashed_at'];
  for (const cand of tsCandidates) {
    const foundKey = keys.find((k) => k.toLowerCase().trim() === cand);
    if (foundKey !== undefined) {
      if (!matchedColumn) matchedColumn = foundKey;
      const rawVal = row[foundKey];
      if (rawVal !== null && rawVal !== undefined && rawVal !== '') {
        const strVal = String(rawVal).trim();
        if (
          strVal &&
          strVal.toLowerCase() !== 'null' &&
          strVal !== '0' &&
          strVal !== 'false' &&
          !strVal.startsWith('0000-00-00')
        ) {
          isDeleted = true;
          resolvedDeletedAt = strVal;
        }
      }
    }
  }

  // 2. Check boolean/flag-based soft delete columns (`deleted`, `is_deleted`, `is_delete`, `hapus`, `dihapus`, `status_hapus`)
  const flagCandidates = [
    'deleted',
    'is_deleted',
    'isdeleted',
    'is_delete',
    'soft_delete',
    'status_hapus',
    'is_hapus',
    'dihapus',
    'hapus',
    'trashed',
  ];
  for (const cand of flagCandidates) {
    const foundKey = keys.find((k) => k.toLowerCase().trim() === cand);
    if (foundKey !== undefined) {
      if (!matchedColumn) matchedColumn = foundKey;
      const rawVal = row[foundKey];
      if (rawVal !== null && rawVal !== undefined && rawVal !== '') {
        const strVal = String(rawVal).trim().toLowerCase();
        if (
          rawVal === true ||
          rawVal === 1 ||
          strVal === '1' ||
          strVal === 'true' ||
          strVal === 'y' ||
          strVal === 'yes' ||
          strVal === 'ya' ||
          strVal === 'deleted' ||
          strVal === 'dihapus'
        ) {
          isDeleted = true;
        } else if (
          strVal.length >= 8 &&
          /\d{4}-\d{2}-\d{2}/.test(strVal) &&
          !strVal.startsWith('0000-00-00')
        ) {
          // Sometimes `deleted` column itself stores a timestamp
          isDeleted = true;
          if (!resolvedDeletedAt) resolvedDeletedAt = String(rawVal).trim();
        }
      }
    }
  }

  if (isDeleted && !resolvedDeletedAt) {
    resolvedDeletedAt = fallbackUpdatedAt || new Date().toISOString();
  }

  return {
    deleted: isDeleted,
    deletedAt: isDeleted ? resolvedDeletedAt : null,
    matchedColumn,
  };
}

/**
 * Extract row array from any PHPMyAdmin table object variation
 */
function extractRowsFromEntry(entry: any): Record<string, any>[] {
  if (!entry || typeof entry !== 'object') return [];
  if (Array.isArray(entry.data)) return entry.data;
  if (Array.isArray(entry.rows)) return entry.rows;
  if (Array.isArray(entry.records)) return entry.records;
  if (Array.isArray(entry.items)) return entry.items;
  if (Array.isArray(entry.values)) return entry.values;
  return [];
}

/**
 * Parse PHPMyAdmin JSON export format OR generic JSON table map/array into structured tables.
 */
export function parsePhpMyAdminJson(rawJsonText: string): ParsedPhpMyAdminTable[] {
  let parsed: any;
  try {
    parsed = JSON.parse(rawJsonText.trim());
  } catch {
    throw new Error(
      'Format file JSON tidak valid. Pastikan file JSON hasil export PHPMyAdmin memiliki sintaks JSON yang utuh.'
    );
  }

  const tableMap = new Map<string, ParsedPhpMyAdminTable>();
  let defaultDbName = 'sisa_uang';

  function upsertTable(rawName: string, dbName: string, incomingRows: any[]) {
    const cleanRows = incomingRows.filter((r) => r && typeof r === 'object');
    const key = rawName.toLowerCase().trim();
    const existing = tableMap.get(key);

    const colSet = new Set<string>(existing ? existing.columns : []);
    for (const r of cleanRows) {
      Object.keys(r).forEach((k) => colSet.add(k));
    }
    const columns = Array.from(colSet);
    const mergedRows = existing ? [...existing.rows, ...cleanRows] : cleanRows;
    const detectedCategory = classifyPhpMyAdminTable(rawName, columns, mergedRows[0]);
    const detectedSoftDeleteColumns = detectSoftDeleteColumns(columns);
    const softDeletedRowsCount = mergedRows.filter(
      (r) => extractSoftDeleteFromRow(r).deleted
    ).length;

    tableMap.set(key, {
      tableName: rawName.trim(),
      databaseName: dbName || defaultDbName,
      columns,
      rows: mergedRows,
      detectedCategory,
      includeData: true,
      detectedSoftDeleteColumns,
      softDeletedRowsCount,
    });
  }

  if (Array.isArray(parsed)) {
    const isPhpMyAdminFormat = parsed.some(
      (item) =>
        item &&
        typeof item === 'object' &&
        (item.type === 'table' ||
          item.type === 'header' ||
          item.type === 'database' ||
          (item.name && (Array.isArray(item.data) || Array.isArray(item.rows))))
    );

    if (isPhpMyAdminFormat) {
      for (const entry of parsed) {
        if (!entry || typeof entry !== 'object') continue;
        if (entry.type === 'database' && entry.name) {
          defaultDbName = String(entry.name);
          continue;
        }
        if (entry.type === 'header') {
          continue;
        }
        const tblName = entry.name || entry.table || entry.tableName;
        if (tblName) {
          const rows = extractRowsFromEntry(entry);
          upsertTable(String(tblName), String(entry.database || defaultDbName), rows);
        }
      }
    } else if (parsed.length > 0 && typeof parsed[0] === 'object') {
      upsertTable('transactions', defaultDbName, parsed);
    }
  } else if (parsed && typeof parsed === 'object') {
    // Check if top-level has a `tables` array or `data` array
    if (Array.isArray(parsed.tables)) {
      for (const t of parsed.tables) {
        const tblName = t?.name || t?.table || t?.tableName;
        if (tblName) {
          upsertTable(String(tblName), String(t.database || defaultDbName), extractRowsFromEntry(t));
        }
      }
    } else {
      for (const [key, val] of Object.entries(parsed)) {
        if (key === 'type' || key === 'version' || key === 'comment' || key === 'database') continue;
        if (Array.isArray(val)) {
          // Could be an array of rows OR an array of PHPMyAdmin objects
          const looksLikePmaArray = val.some(
            (item: any) => item && typeof item === 'object' && item.type === 'table' && item.name
          );
          if (looksLikePmaArray) {
            for (const entry of val) {
              if (entry?.type === 'table' && entry?.name) {
                upsertTable(
                  String(entry.name),
                  String(entry.database || defaultDbName),
                  extractRowsFromEntry(entry)
                );
              }
            }
          } else {
            upsertTable(key, defaultDbName, val);
          }
        } else if (val && typeof val === 'object') {
          const rows = extractRowsFromEntry(val);
          if (rows.length > 0 || (val as any).name) {
            upsertTable(
              String((val as any).name || key),
              String((val as any).database || defaultDbName),
              rows
            );
          }
        }
      }
    }
  }

  return Array.from(tableMap.values());
}

/**
 * Helper to pick a value from a row by checking multiple possible column names (case-insensitive & partial)
 */
function pickCol(row: Record<string, any>, exactCandidates: string[], partialCandidates: string[] = []): any {
  const keys = Object.keys(row);
  // 1. Check exact match (case-insensitive)
  for (const cand of exactCandidates) {
    const foundKey = keys.find((k) => k.toLowerCase() === cand.toLowerCase());
    if (foundKey !== undefined && row[foundKey] !== null && row[foundKey] !== undefined && row[foundKey] !== '') {
      return row[foundKey];
    }
  }
  // 2. Check partial match
  for (const part of partialCandidates) {
    const foundKey = keys.find((k) => k.toLowerCase().includes(part.toLowerCase()));
    if (foundKey !== undefined && row[foundKey] !== null && row[foundKey] !== undefined && row[foundKey] !== '') {
      return row[foundKey];
    }
  }
  return undefined;
}

/**
 * Parse numeric strings safely (handles "15000000.00", "15.000.000", etc.)
 */
function parseSafeNumber(val: any, fallback = 0): number {
  if (typeof val === 'number') return Number.isFinite(val) ? val : fallback;
  if (val === null || val === undefined || val === '') return fallback;
  const str = String(val).trim();
  const direct = Number(str);
  if (!Number.isNaN(direct)) return direct;
  // Clean currency symbols or thousand separators if needed
  const cleaned = str.replace(/[^0-9.-]/g, '');
  const parsed = Number(cleaned);
  return Number.isNaN(parsed) ? fallback : parsed;
}

/**
 * Analyze active PHPMyAdmin JSON tables, compute Firestore Write Quota impact (vs 20,000 free limit)
 * respecting each table's `includeData` flag and `detectedCategory`,
 * generate the new Firestore database schema design, and convert all included records.
 */
export function buildJsonMigrationAnalysis(
  activeTables: ParsedPhpMyAdminTable[]
): JsonMigrationAnalysis {
  const nowIso = new Date().toISOString();

  // Group tables by their assigned TargetCollectionCategory
  const tablesByCat = (cat: TargetCollectionCategory) =>
    activeTables.filter((t) => t.detectedCategory === cat);

  // Separate sub-tables inside 'users' category (main users table vs CI4 Shield auxiliary tables)
  const allUserCatTables = tablesByCat('users');
  const mainUsersTables = allUserCatTables.filter((t) => {
    const n = t.tableName.toLowerCase();
    return (
      !n.includes('identities') &&
      !n.includes('groups') &&
      !n.includes('permissions') &&
      !n.includes('remember') &&
      !n.includes('token')
    );
  });
  const identitiesTables = allUserCatTables.filter((t) =>
    t.tableName.toLowerCase().includes('identities')
  );
  const groupsTables = allUserCatTables.filter((t) =>
    t.tableName.toLowerCase().includes('groups')
  );

  const walletsTables = tablesByCat('wallets');
  const walletOwnersTables = tablesByCat('wallet_owners');
  const categoriesTables = tablesByCat('categories');
  const transactionsTables = tablesByCat('transactions');
  const budgetsTables = tablesByCat('budgets');
  const logsTables = tablesByCat('activity_logs');

  // Helper to get ALL rows (for legacy count) vs INCLUDED rows (when table.includeData === true)
  const getTotalRowsCount = (list: ParsedPhpMyAdminTable[]) =>
    list.reduce((sum, t) => sum + t.rows.length, 0);

  const getIncludedRows = (list: ParsedPhpMyAdminTable[]) => {
    const out: Record<string, any>[] = [];
    for (const t of list) {
      if (t.includeData) {
        out.push(...t.rows);
      }
    }
    return out;
  };

  // Index CI4 Shield identities & groups by user_id (even if auth_identities table has includeData toggled off, we still use it to enrich users!)
  const identitiesByUserId = new Map<string, Record<string, any>[]>();
  const allIdentityRows = identitiesTables.flatMap((t) => t.rows);
  for (const ident of allIdentityRows) {
    const uidKey = String(pickCol(ident, ['user_id', 'id_user', 'uid', 'id']) ?? '').trim();
    if (!uidKey) continue;
    const list = identitiesByUserId.get(uidKey) || [];
    list.push(ident);
    identitiesByUserId.set(uidKey, list);
  }

  const groupsByUserId = new Map<string, string[]>();
  const allGroupRows = groupsTables.flatMap((t) => t.rows);
  for (const grp of allGroupRows) {
    const uidKey = String(pickCol(grp, ['user_id', 'id_user', 'uid']) ?? '').trim();
    const groupName = String(pickCol(grp, ['group', 'role', 'level']) ?? '').toLowerCase();
    if (!uidKey || !groupName) continue;
    const list = groupsByUserId.get(uidKey) || [];
    list.push(groupName);
    groupsByUserId.set(uidKey, list);
  }

  // 1. Convert Users
  const normalizedUsers: NormalizedUserDoc[] = [];
  const legacyUserIdToUid = new Map<string, string>();
  const legacyUserIdToEmail = new Map<string, string>();

  const userRowsToProcess = getIncludedRows(mainUsersTables);
  for (let idx = 0; idx < userRowsToProcess.length; idx++) {
    const u = userRowsToProcess[idx];
    const rawId = String(pickCol(u, ['id', 'user_id', 'id_user', 'uid']) ?? idx + 1);
    const userIdents = identitiesByUserId.get(rawId) || [];
    const userGroups = groupsByUserId.get(rawId) || [];

    let resolvedEmail = String(pickCol(u, ['email', 'user_email']) ?? '')
      .trim()
      .toLowerCase();
    let resolvedPasswordHash = String(
      pickCol(u, ['password_hash', 'password', 'secret2', 'hash']) ?? ''
    ).trim();
    let resolvedProvider: 'password' | 'google' = 'password';

    for (const idRow of userIdents) {
      const idType = String(pickCol(idRow, ['type', 'provider']) ?? '').toLowerCase();
      const secret = String(pickCol(idRow, ['secret', 'email', 'identifier']) ?? '').trim();
      const secret2 = String(pickCol(idRow, ['secret2', 'password_hash', 'password']) ?? '').trim();
      if (!resolvedEmail && secret.includes('@')) {
        resolvedEmail = secret.toLowerCase();
      }
      if (!resolvedPasswordHash && secret2) {
        resolvedPasswordHash = secret2;
      }
      if (idType.includes('google') || idType.includes('oauth')) {
        resolvedProvider = 'google';
      }
    }

    const rawUsername = String(
      pickCol(u, ['username', 'user_name', 'userid', 'login']) ?? ''
    ).trim();

    if (!resolvedEmail) {
      const safeSlug = rawUsername.toLowerCase().replace(/[^a-z0-9._-]/g, '') || `user_${rawId}`;
      resolvedEmail = `${safeSlug}@sisa-uang.id`;
    }

    const username = sanitizeString(
      (rawUsername || resolvedEmail.split('@')[0] || `user_${rawId}`).toLowerCase().replace(/\s+/g, '_'),
      60,
      `user_${rawId}`
    );

    const rawDisplayName = String(
      pickCol(u, ['display_name', 'displayName', 'full_name', 'fullname', 'nama_lengkap', 'name', 'nama']) ?? ''
    ).trim();

    const displayName = sanitizeString(
      rawDisplayName || rawUsername || resolvedEmail.split('@')[0],
      MAX_DISPLAY_NAME_LENGTH,
      username
    );

    const isShieldAdmin =
      userGroups.some((g) => g.includes('admin') || g.includes('super')) ||
      String(pickCol(u, ['role', 'level', 'group']) ?? '').toLowerCase().includes('admin') ||
      resolvedEmail === 'vuedevo@gmail.com' ||
      username === 'vuedevo';

    const rawStatus = String(pickCol(u, ['status']) ?? '').toLowerCase();
    const activeVal = pickCol(u, ['active', 'is_active']);
    const updatedAtIso = String(pickCol(u, ['updated_at', 'updatedAt', 'last_active']) ?? nowIso);
    const softDel = extractSoftDeleteFromRow(u, updatedAtIso);
    const isBannedOrInactive =
      rawStatus === 'banned' ||
      rawStatus === 'blocked' ||
      rawStatus === 'suspended' ||
      (activeVal !== undefined && Number(activeVal) === 0) ||
      softDel.deleted;

    const firestoreUid = sanitizeId(
      resolvedEmail === 'vuedevo@gmail.com' ? 'admin_vuedevo_01' : `ci4_user_${rawId}`
    );

    legacyUserIdToUid.set(rawId, firestoreUid);
    legacyUserIdToEmail.set(rawId, resolvedEmail);

    normalizedUsers.push({
      uid: firestoreUid,
      legacyId: rawId,
      username,
      email: sanitizeString(resolvedEmail, MAX_EMAIL_LENGTH, 'user@sisa-uang.id'),
      displayName,
      passwordHash: resolvedPasswordHash || undefined,
      role: isShieldAdmin ? 'admin' : 'user',
      status: isBannedOrInactive ? 'blocked' : 'active',
      authProvider: resolvedProvider,
      currency: pickCol(u, ['currency', 'mata_uang']) === 'USD' ? 'USD' : 'IDR',
      shieldGroup: userGroups.join(', ') || 'user',
      shieldActive: activeVal !== undefined ? Number(activeVal) : 1,
      deleted: softDel.deleted,
      deletedAt: softDel.deletedAt,
      createdAt: String(pickCol(u, ['created_at', 'createdAt', 'tgl_daftar']) ?? nowIso),
      updatedAt: updatedAtIso,
    });
  }

  const defaultOwnerUid =
    normalizedUsers.find((u) => u.role === 'user')?.uid ||
    normalizedUsers[0]?.uid ||
    'ci4_user_1';

  // 2. Convert Wallets (Sumber Dana)
  const normalizedWallets: NormalizedWalletDoc[] = [];
  const legacyWalletIdMap = new Map<
    string,
    {
      id: string;
      name: string;
      ownerId: string;
      balance: number;
      deleted: boolean;
      deletedAt: string | null;
    }
  >();

  // Helper to check if a value is a valid foreign key ID (not empty, '0', 0, 'null', 'undefined')
  const isValidFk = (val: unknown): boolean => {
    if (val === undefined || val === null) return false;
    const s = String(val).trim();
    return s !== '' && s !== '0' && s.toLowerCase() !== 'null' && s.toLowerCase() !== 'undefined';
  };

  // Helper to check if a row represents a pivot allocation linked to a specific wallet (e.g. `tb_kepemilikan_sumber_dana`)
  const hasWalletForeignKey = (row: Record<string, any>): boolean =>
    isValidFk(
      pickCol(row, [
        'sumber_dana_id',
        'id_sumber_dana',
        'wallet_id',
        'id_wallet',
        'dompet_id',
        'id_dompet',
        'rekening_id',
        'source_id',
        'sumber_id',
        'id_sumber',
      ])
    );

  // Index any master `tb_kepemilikan_dana` / `owners` / `pemilik` lookup table FIRST
  // so both `wallets` (`tb_sumber_dana`) and `wallet_owners` (`tb_kepemilikan_sumber_dana`) can resolve `kepemilikan_dana_id` -> `user_id` & `nama_kepemilikan`
  const ownerMasterNameById = new Map<string, string>();
  const ownerMasterRowById = new Map<string, Record<string, any>>();

  for (const t of activeTables) {
    const tName = t.tableName.toLowerCase().trim();
    const isLikelyOwnerTable =
      t.detectedCategory === 'wallet_owners' ||
      tName.includes('kepemilikan_dana') ||
      tName.includes('pemilik_dana') ||
      tName === 'owners' ||
      tName === 'owner' ||
      tName === 'pemilik' ||
      tName === 'fund_owners' ||
      tName === 'tb_pemilik' ||
      tName === 'tb_kepemilikan';

    if (!isLikelyOwnerTable) continue;

    for (const r of t.rows) {
      const isMasterTable =
        (tName.includes('kepemilikan_dana') ||
          tName.includes('pemilik_dana') ||
          tName === 'owners' ||
          tName === 'pemilik') &&
        !tName.includes('sumber');

      if (!hasWalletForeignKey(r) || isMasterTable) {
        const oid = String(
          pickCol(r, [
            'id',
            'id_kepemilikan_dana',
            'kepemilikan_dana_id',
            'id_kepemilikan',
            'kepemilikan_id',
            'owner_id',
            'id_pemilik',
            'pemilik_id',
            'id_pemilik_dana',
            'pemilik_dana_id',
          ]) ?? ''
        ).trim();

        const oName = String(
          pickCol(
            r,
            [
              'nama_kepemilikan_dana',
              'nama_kepemilikan',
              'nama_pemilik_dana',
              'nama_pemilik',
              'kepemilikan_dana',
              'pemilik_dana',
              'holder_name',
              'owner_name',
              'nama',
              'name',
              'pemilik',
              'kepemilikan',
              'owner',
              'holder',
              'title',
              'keterangan',
            ],
            ['nama', 'name', 'pemilik', 'kepemilikan', 'holder', 'owner']
          ) ?? ''
        ).trim();

        if (isValidFk(oid) && oName && !/^\d+$/.test(oName)) {
          ownerMasterNameById.set(oid, oName);
          ownerMasterRowById.set(oid, r);
        }
      }
    }
  }

  const walletRowsToProcess = getIncludedRows(walletsTables);
  for (let idx = 0; idx < walletRowsToProcess.length; idx++) {
    const w = walletRowsToProcess[idx];
    const rawId = String(
      pickCol(w, ['id', 'wallet_id', 'id_wallet', 'sumber_dana_id', 'id_sumber_dana', 'dompet_id', 'id_dompet', 'rekening_id']) ??
        idx + 1
    );
    const fkMasterOwnerId = String(
      pickCol(w, ['kepemilikan_dana_id', 'id_kepemilikan_dana', 'id_kepemilikan', 'kepemilikan_id', 'pemilik_dana_id', 'id_pemilik_dana']) ?? ''
    ).trim();
    const masterOwnerRow = isValidFk(fkMasterOwnerId) ? ownerMasterRowById.get(fkMasterOwnerId) : undefined;
    const rawUser = String(
      pickCol(w, ['user_id', 'id_user', 'owner_id', 'ownerId', 'created_by']) ??
        (masterOwnerRow ? pickCol(masterOwnerRow, ['user_id', 'id_user', 'owner_id', 'created_by']) : '') ??
        ''
    ).trim();

    const ownerUid =
      (isValidFk(rawUser) && legacyUserIdToUid.get(rawUser)) ||
      (isValidFk(rawUser) ? sanitizeId(`ci4_user_${rawUser}`) : defaultOwnerUid);

    const walletId = sanitizeId(`su_wallet_${rawId}`);
    const name = sanitizeString(
      pickCol(
        w,
        [
          'name',
          'wallet_name',
          'nama_sumber_dana',
          'nama_dompet',
          'nama_rekening',
          'nama_wallet',
          'sumber_dana',
          'dompet',
          'nama',
          'title',
        ],
        ['nama', 'name', 'sumber', 'wallet', 'dompet', 'bank']
      ) ?? `Sumber Dana #${rawId}`,
      MAX_WALLET_NAME_LENGTH,
      `Sumber Dana #${rawId}`
    );

    const rawType = String(
      pickCol(w, ['type', 'jenis', 'tipe', 'kategori', 'wallet_type']) ?? name
    ).toLowerCase();
    let mappedType: NormalizedWalletDoc['type'] = 'bank';
    if (rawType.includes('cash') || rawType.includes('tunai') || rawType.includes('kas'))
      mappedType = 'cash';
    else if (
      rawType.includes('ewallet') ||
      rawType.includes('gopay') ||
      rawType.includes('ovo') ||
      rawType.includes('dana') ||
      rawType.includes('shopeepay') ||
      rawType.includes('linkaja') ||
      rawType.includes('flip')
    )
      mappedType = 'ewallet';
    else if (
      rawType.includes('invest') ||
      rawType.includes('reksa') ||
      rawType.includes('bibit') ||
      rawType.includes('emas') ||
      rawType.includes('saham')
    )
      mappedType = 'investment';
    else if (rawType.includes('credit') || rawType.includes('kredit') || rawType.includes('paylater'))
      mappedType = 'credit';

    const balance = parseSafeNumber(
      pickCol(
        w,
        ['balance', 'saldo', 'total_saldo', 'saldo_akhir', 'saldo_awal', 'initial_balance', 'nominal', 'amount', 'jumlah'],
        ['saldo', 'balance', 'nominal', 'jumlah']
      ),
      0
    );
    const color = sanitizeString(pickCol(w, ['color', 'warna']) ?? 'emerald', 20, 'emerald');
    const updatedAtIso = String(pickCol(w, ['updated_at', 'updatedAt']) ?? nowIso);
    const softDel = extractSoftDeleteFromRow(w, updatedAtIso);

    legacyWalletIdMap.set(rawId, {
      id: walletId,
      name,
      ownerId: ownerUid,
      balance,
      deleted: softDel.deleted,
      deletedAt: softDel.deletedAt,
    });

    normalizedWallets.push({
      id: walletId,
      ownerId: ownerUid,
      name,
      type: mappedType,
      balance,
      color,
      deleted: softDel.deleted,
      deletedAt: softDel.deletedAt,
      createdAt: String(pickCol(w, ['created_at', 'createdAt', 'tanggal']) ?? nowIso),
      updatedAt: updatedAtIso,
    });
  }

  // 3. Convert Wallet Owners / Kepemilikan Sumber Dana (`tb_kepemilikan_sumber_dana` joined with `tb_sumber_dana` & `tb_kepemilikan_dana`)
  const normalizedWalletOwners: NormalizedWalletOwnerDoc[] = [];
  // Dedicated lookup maps without key collision:
  // - holderByPivotIdMap: keyed ONLY by `tb_kepemilikan_sumber_dana.id` (e.g., '6' -> su_holder_6 -> su_wallet_5 Flip)
  // - holderByWalletAndMasterMap: keyed by `${rawWalletId}_${fkOwnerId}`
  // - holderFirstByWalletIdMap: keyed by `rawWalletId` (first active holder for that wallet)
  const holderByPivotIdMap = new Map<
    string,
    { id: string; holderName: string; walletId: string; walletName: string; ownerId: string; deleted: boolean }
  >();
  const holderByWalletAndMasterMap = new Map<
    string,
    { id: string; holderName: string; walletId: string; walletName: string; ownerId: string; deleted: boolean }
  >();
  const holderFirstByWalletIdMap = new Map<
    string,
    { id: string; holderName: string; walletId: string; walletName: string; ownerId: string; deleted: boolean }
  >();

  // Separate pivot wallet_owners rows (`tb_kepemilikan_sumber_dana`) from master owner lookup rows (`tb_kepemilikan_dana`)
  const rawWalletOwnerRows = getIncludedRows(walletOwnersTables);
  const walletOwnerRowsToProcess = rawWalletOwnerRows.filter((r) => hasWalletForeignKey(r));
  const effectiveOwnerRows =
    walletOwnerRowsToProcess.length > 0 ? walletOwnerRowsToProcess : rawWalletOwnerRows;

  for (let idx = 0; idx < effectiveOwnerRows.length; idx++) {
    const fo = effectiveOwnerRows[idx];
    const rawId = String(
      pickCol(fo, [
        'id',
        'id_kepemilikan_sumber_dana',
        'kepemilikan_sumber_dana_id',
        'wallet_owner_id',
        'id_kepemilikan',
        'fund_owner_id',
        'owner_id',
        'id_pemilik',
        'pemilik_id',
      ]) ?? idx + 1
    ).trim();

    // Foreign key pointing to `tb_kepemilikan_dana.id`
    const fkOwnerId = String(
      pickCol(
        fo,
        [
          'kepemilikan_dana_id',
          'id_kepemilikan_dana',
          'kepemilikan_id',
          'id_kepemilikan',
          'pemilik_dana_id',
          'id_pemilik_dana',
          'pemilik_id',
          'id_pemilik',
          'owner_id',
          'holder_id',
          'fund_owner_id',
        ],
        ['kepemilikan_dana', 'pemilik_dana', 'id_kepemilikan', 'kepemilikan_id', 'id_pemilik', 'pemilik_id', 'owner_id']
      ) ?? ''
    ).trim();

    const rawWalletId = String(
      pickCol(
        fo,
        [
          'sumber_dana_id',
          'id_sumber_dana',
          'wallet_id',
          'id_wallet',
          'dompet_id',
          'id_dompet',
          'rekening_id',
          'source_id',
          'sumber_id',
          'id_sumber',
        ],
        ['sumber_dana', 'wallet', 'dompet', 'rekening']
      ) ?? '1'
    ).trim();

    const parentWallet = legacyWalletIdMap.get(rawWalletId) || {
      id: sanitizeId(`su_wallet_${rawWalletId}`),
      name: sanitizeString(
        pickCol(fo, ['wallet_name', 'nama_sumber_dana', 'nama_dompet', 'sumber_dana']) ??
          `Sumber Dana #${rawWalletId}`,
        MAX_WALLET_NAME_LENGTH,
        `Sumber Dana #${rawWalletId}`
      ),
      ownerId: defaultOwnerUid,
      balance: 0,
      deleted: false,
      deletedAt: null,
    };

    const masterOwnerRow = isValidFk(fkOwnerId) ? ownerMasterRowById.get(fkOwnerId) : undefined;
    const rawUser = String(
      pickCol(fo, ['user_id', 'id_user', 'created_by']) ??
        (masterOwnerRow ? pickCol(masterOwnerRow, ['user_id', 'id_user', 'created_by']) : '') ??
        ''
    ).trim();
    const ownerUid =
      (isValidFk(rawUser) && legacyUserIdToUid.get(rawUser)) ||
      (isValidFk(rawUser) ? sanitizeId(`ci4_user_${rawUser}`) : '') ||
      parentWallet.ownerId ||
      defaultOwnerUid;

    const fundOwnerId = sanitizeId(`su_holder_${rawId}`);
    const rawExplicitHolderName = pickCol(
      fo,
      [
        'holder_name',
        'owner_name',
        'nama_kepemilikan_dana',
        'nama_pemilik_dana',
        'nama_pemilik',
        'nama_kepemilikan',
        'kepemilikan_dana',
        'pemilik_dana',
        'pemilik',
        'owner',
        'holder',
        'name',
        'nama',
      ]
    );
    const explicitHolderName =
      rawExplicitHolderName !== undefined &&
      rawExplicitHolderName !== null &&
      !/^\d+$/.test(String(rawExplicitHolderName).trim())
        ? String(rawExplicitHolderName).trim()
        : undefined;

    const joinedMasterOwnerName =
      (isValidFk(fkOwnerId) ? ownerMasterNameById.get(fkOwnerId) : undefined) ||
      (rawExplicitHolderName && /^\d+$/.test(String(rawExplicitHolderName).trim())
        ? ownerMasterNameById.get(String(rawExplicitHolderName).trim())
        : undefined);

    const holderName = sanitizeString(
      joinedMasterOwnerName ??
        explicitHolderName ??
        `Pemilik #${fkOwnerId || rawId}`,
      MAX_HOLD_NAME_LENGTH,
      'Pribadi'
    );

    const balance = parseSafeNumber(
      pickCol(
        fo,
        ['balance', 'saldo', 'saldo_akhir', 'saldo_awal', 'nominal', 'amount', 'jumlah', 'sisa'],
        ['saldo', 'balance', 'nominal', 'jumlah', 'sisa']
      ),
      0
    );

    const updatedAtIso = String(pickCol(fo, ['updated_at', 'updatedAt']) ?? nowIso);
    const softDel = extractSoftDeleteFromRow(fo, updatedAtIso);
    const masterSoftDel = masterOwnerRow ? extractSoftDeleteFromRow(masterOwnerRow, updatedAtIso) : { deleted: false, deletedAt: null };
    const isEffectivelyDeleted =
      softDel.deleted || masterSoftDel.deleted || Boolean(parentWallet.deleted);
    const effectiveDeletedAt =
      softDel.deletedAt || masterSoftDel.deletedAt || parentWallet.deletedAt || null;

    const holderEntry = {
      id: fundOwnerId,
      holderName,
      walletId: parentWallet.id,
      walletName: parentWallet.name,
      ownerId: ownerUid,
      deleted: isEffectivelyDeleted,
    };

    // Index strictly by pivot ID (`tb_kepemilikan_sumber_dana.id`) so `rawId` never collides with `fkOwnerId`
    holderByPivotIdMap.set(rawId, holderEntry);
    if (isValidFk(fkOwnerId)) {
      holderByWalletAndMasterMap.set(`${rawWalletId}_${fkOwnerId}`, holderEntry);
    }
    if (isValidFk(rawWalletId)) {
      const existingFirst = holderFirstByWalletIdMap.get(rawWalletId);
      if (!existingFirst || (existingFirst.deleted && !isEffectivelyDeleted)) {
        holderFirstByWalletIdMap.set(rawWalletId, holderEntry);
      }
    }

    normalizedWalletOwners.push({
      id: fundOwnerId,
      ownerId: ownerUid,
      walletId: parentWallet.id,
      walletName: parentWallet.name,
      holderName,
      balance,
      deleted: isEffectivelyDeleted,
      deletedAt: isEffectivelyDeleted ? effectiveDeletedAt : null,
      createdAt: String(pickCol(fo, ['created_at', 'createdAt']) ?? nowIso),
      updatedAt: updatedAtIso,
    });
  }

  // Sync parent wallet ownerId (if `tb_sumber_dana` had no direct `user_id` column) and balance from active `wallet_owners`
  for (const w of normalizedWallets) {
    const rawWId = w.id.replace(/^su_wallet_/, '');
    const firstHolder = holderFirstByWalletIdMap.get(rawWId);
    if (firstHolder && firstHolder.ownerId) {
      w.ownerId = firstHolder.ownerId;
      const mapEntry = legacyWalletIdMap.get(rawWId);
      if (mapEntry) {
        mapEntry.ownerId = firstHolder.ownerId;
      }
    }
    const holders = normalizedWalletOwners.filter((fo) => fo.walletId === w.id && !fo.deleted);
    if (holders.length > 0) {
      const sumHolders = holders.reduce((acc, h) => acc + Number(h.balance || 0), 0);
      if (sumHolders > 0) {
        w.balance = sumHolders;
      }
    }
  }

  // 4. Convert Categories (Manajemen Kategori)
  const normalizedCategories: NormalizedCategoryDoc[] = [];
  const legacyCategoryIdToName = new Map<string, { name: string; type: 'income' | 'expense' }>();

  const categoryRowsToProcess = getIncludedRows(categoriesTables);
  for (let idx = 0; idx < categoryRowsToProcess.length; idx++) {
    const c = categoryRowsToProcess[idx];
    const rawId = String(
      pickCol(c, ['id', 'category_id', 'id_kategori', 'id_category', 'kode_kategori']) ?? idx + 1
    );
    const rawUser = String(pickCol(c, ['user_id', 'id_user', 'owner_id', 'created_by']) ?? '').trim();
    const ownerUid =
      (isValidFk(rawUser) && legacyUserIdToUid.get(rawUser)) ||
      (isValidFk(rawUser) ? sanitizeId(`ci4_user_${rawUser}`) : defaultOwnerUid);

    const name = sanitizeString(
      pickCol(
        c,
        ['name', 'nama_kategori', 'category_name', 'kategori', 'nama', 'title', 'judul'],
        ['nama', 'name', 'kateg', 'title']
      ) ?? `Kategori #${rawId}`,
      MAX_CATEGORY_LENGTH,
      `Kategori #${rawId}`
    );

    const rawType = String(
      pickCol(c, ['type', 'jenis', 'tipe', 'jenis_kategori', 'arus', 'kelompok'], ['type', 'jenis', 'tipe']) ??
        'expense'
    ).toLowerCase();
    const mappedType: 'income' | 'expense' =
      rawType.includes('in') ||
      rawType.includes('masuk') ||
      rawType.includes('pemasukan') ||
      rawType === '1' ||
      rawType === 'kredit'
        ? 'income'
        : 'expense';

    const color = sanitizeString(
      pickCol(c, ['color', 'warna']) ?? (mappedType === 'income' ? 'emerald' : 'rose'),
      20,
      mappedType === 'income' ? 'emerald' : 'rose'
    );
    const updatedAtIso = String(pickCol(c, ['updated_at', 'updatedAt']) ?? nowIso);
    const softDel = extractSoftDeleteFromRow(c, updatedAtIso);

    legacyCategoryIdToName.set(rawId, { name, type: mappedType });

    normalizedCategories.push({
      id: sanitizeId(`su_cat_${rawId}`),
      ownerId: ownerUid,
      name,
      type: mappedType,
      color,
      deleted: softDel.deleted,
      deletedAt: softDel.deletedAt,
      createdAt: String(pickCol(c, ['created_at', 'createdAt']) ?? nowIso),
      updatedAt: updatedAtIso,
    });
  }

  // 5. Convert Transactions (Income, Expense, Transfer across Wallet + Fund Owner)
  // In SisaUang schema:
  // `tb_transaksi` references `tb_kepemilikan_sumber_dana.id` via `kepemilikan_sumber_dana_id` (or `id_kepemilikan_sumber_dana` / `sumber_dana_id`).
  // And for transfers, `sumber_dana_tujuan` also references `tb_kepemilikan_sumber_dana.id`!
  // We must NEVER confuse `tb_kepemilikan_sumber_dana.id` (e.g. 6 -> su_holder_6 -> su_wallet_5 Flip owned by ci4_user_1)
  // with `tb_sumber_dana.id` (e.g. 6 -> su_wallet_6 Mandiri owned by ci4_user_2).
  const normalizedTransactions: NormalizedTransactionDoc[] = [];
  const txRowsToProcess = getIncludedRows(transactionsTables);

  for (let idx = 0; idx < txRowsToProcess.length; idx++) {
    const t = txRowsToProcess[idx];
    const rawId = String(
      pickCol(t, ['id', 'transaction_id', 'id_transaksi', 'transaksi_id', 'no_transaksi', 'kode']) ??
        idx + 1
    ).trim();
    const rawUser = String(pickCol(t, ['user_id', 'id_user', 'owner_id', 'created_by']) ?? '').trim();

    // 1. Check explicit holder FK column (`kepemilikan_sumber_dana_id`, `fund_owner_id`, etc.)
    // Note: DO NOT use partial match `'sumber'` for `rawDirectWalletCol` because `'sumber'` matches `'kepemilikan_sumber_dana_id'`!
    const rawExplicitHolderFk = String(
      pickCol(
        t,
        [
          'kepemilikan_sumber_dana_id',
          'id_kepemilikan_sumber_dana',
          'fund_owner_id',
          'wallet_owner_id',
          'kepemilikan_dana_id',
          'id_kepemilikan_dana',
          'pemilik_dana_id',
          'id_pemilik_dana',
          'pemilik_id',
          'id_pemilik',
          'kepemilikan_id',
          'id_kepemilikan',
          'holder_id',
          'from_owner_id',
        ],
        ['kepemilikan', 'pemilik', 'holder']
      ) ?? ''
    ).trim();

    // 2. Check explicit wallet FK column (`wallet_id`, `id_wallet`, `sumber_dana_id`, `id_sumber_dana`) using EXACT column names only
    const rawDirectWalletFk = String(
      pickCol(
        t,
        [
          'wallet_id',
          'id_wallet',
          'sumber_dana_id',
          'id_sumber_dana',
          'dompet_id',
          'id_dompet',
          'rekening_id',
          'account_id',
          'from_wallet_id',
          'asal_dana',
          'sumber_dana',
        ]
      ) ?? ''
    ).trim();

    // Resolve the `tb_kepemilikan_sumber_dana` holder entry and its parent `tb_sumber_dana` wallet entry:
    let matchedFundOwner:
      | { id: string; holderName: string; walletId: string; walletName: string; ownerId: string; deleted: boolean }
      | undefined;
    let matchedWallet:
      | { id: string; name: string; ownerId: string; balance: number; deleted: boolean; deletedAt: string | null }
      | undefined;

    if (isValidFk(rawExplicitHolderFk) && isValidFk(rawDirectWalletFk) && rawExplicitHolderFk !== rawDirectWalletFk) {
      // Both a separate wallet_id (e.g. '101') and a fund_owner_id (e.g. '201') are provided
      matchedFundOwner =
        holderByPivotIdMap.get(rawExplicitHolderFk) ||
        holderByWalletAndMasterMap.get(`${rawDirectWalletFk}_${rawExplicitHolderFk}`);
      matchedWallet =
        legacyWalletIdMap.get(rawDirectWalletFk) ||
        (matchedFundOwner ? legacyWalletIdMap.get(matchedFundOwner.walletId.replace(/^su_wallet_/, '')) : undefined);
    } else {
      // SisaUang standard schema: `tb_transaksi` stores `kepemilikan_sumber_dana_id` (or `sumber_dana_id` pointing to `tb_kepemilikan_sumber_dana.id`)
      const primarySourceFk = isValidFk(rawExplicitHolderFk) ? rawExplicitHolderFk : rawDirectWalletFk;
      if (isValidFk(primarySourceFk)) {
        matchedFundOwner = holderByPivotIdMap.get(primarySourceFk);
        if (matchedFundOwner) {
          // ALWAYS derive the wallet from `matchedFundOwner.walletId` (`tb_kepemilikan_sumber_dana.sumber_dana_id -> tb_sumber_dana.id`)!
          const parentRawWalletId = matchedFundOwner.walletId.replace(/^su_wallet_/, '');
          matchedWallet = legacyWalletIdMap.get(parentRawWalletId) || {
            id: matchedFundOwner.walletId,
            name: matchedFundOwner.walletName,
            ownerId: matchedFundOwner.ownerId,
            balance: 0,
            deleted: matchedFundOwner.deleted,
            deletedAt: null,
          };
        } else {
          // Fallback if the table has no `tb_kepemilikan_sumber_dana` match and references `tb_sumber_dana.id` directly
          matchedWallet = legacyWalletIdMap.get(primarySourceFk);
          matchedFundOwner = holderFirstByWalletIdMap.get(primarySourceFk);
        }
      }
    }

    // Priority for transaction `ownerId`:
    // 1. Direct `user_id` column on `tb_transaksi` (if present)
    // 2. `ownerId` from `matchedFundOwner` (`tb_kepemilikan_sumber_dana` -> `tb_kepemilikan_dana.user_id`)
    // 3. `ownerId` from `matchedWallet` (`tb_sumber_dana.user_id`)
    // 4. `defaultOwnerUid`
    const ownerUid =
      (isValidFk(rawUser) && legacyUserIdToUid.get(rawUser)) ||
      (isValidFk(rawUser) ? sanitizeId(`ci4_user_${rawUser}`) : '') ||
      matchedFundOwner?.ownerId ||
      matchedWallet?.ownerId ||
      defaultOwnerUid;

    const walletId =
      matchedFundOwner?.walletId ||
      matchedWallet?.id ||
      sanitizeId(`su_wallet_${rawDirectWalletFk || rawExplicitHolderFk || '1'}`);
    const walletName = sanitizeString(
      pickCol(t, ['wallet_name', 'nama_sumber_dana', 'nama_dompet']) ??
        matchedFundOwner?.walletName ??
        matchedWallet?.name ??
        'Sumber Dana Utama',
      MAX_WALLET_NAME_LENGTH,
      'Sumber Dana Utama'
    );

    const fallbackHolderForWallet = normalizedWalletOwners.find((fo) => fo.walletId === walletId);

    const fundOwnerId =
      matchedFundOwner?.id ||
      fallbackHolderForWallet?.id ||
      sanitizeId(`su_holder_${rawExplicitHolderFk || rawDirectWalletFk || 'default'}`);
    const fundOwnerName = sanitizeString(
      pickCol(t, [
        'fund_owner_name',
        'nama_kepemilikan_dana',
        'nama_pemilik_dana',
        'nama_pemilik',
        'pemilik_dana',
        'pemilik',
      ]) ??
        matchedFundOwner?.holderName ??
        fallbackHolderForWallet?.holderName ??
        'Pribadi',
      MAX_HOLD_NAME_LENGTH,
      'Pribadi'
    );

    // Determine transaction type: income | expense | transfer
    const rawCatId = String(pickCol(t, ['category_id', 'id_kategori', 'kategori_id']) ?? '').trim();
    const catInfoFromId = isValidFk(rawCatId) ? legacyCategoryIdToName.get(rawCatId) : undefined;

    const rawType = String(
      pickCol(t, ['type', 'jenis', 'tipe', 'jenis_transaksi', 'arus', 'status_arus'], ['type', 'jenis', 'tipe']) ??
        catInfoFromId?.type ??
        'expense'
    ).toLowerCase();

    const toWalletRaw = pickCol(
      t,
      [
        'sumber_dana_tujuan',
        'id_sumber_dana_tujuan',
        'sumber_dana_tujuan_id',
        'kepemilikan_sumber_dana_tujuan',
        'id_kepemilikan_sumber_dana_tujuan',
        'to_wallet_id',
        'ke_sumber_dana_id',
        'target_wallet_id',
        'destination_wallet_id',
        'tujuan_id',
      ],
      ['to_wallet', 'tujuan', 'target', 'ke_']
    );
    const toOwnerRaw = pickCol(
      t,
      [
        'to_fund_owner_id',
        'to_wallet_owner_id',
        'ke_pemilik_dana_id',
        'id_pemilik_tujuan',
        'target_owner_id',
      ],
      ['to_owner', 'to_holder', 'pemilik_tujuan']
    );

    const hasValidTransferTarget = isValidFk(toWalletRaw) || isValidFk(toOwnerRaw);

    let mappedType: NormalizedTransactionDoc['type'] = 'expense';
    if (
      rawType.includes('trans') ||
      rawType.includes('pindah') ||
      rawType.includes('mutasi') ||
      hasValidTransferTarget
    ) {
      mappedType = 'transfer';
    } else if (
      rawType.includes('in') ||
      rawType.includes('masuk') ||
      rawType.includes('pemasukan') ||
      rawType === 'kredit' ||
      catInfoFromId?.type === 'income'
    ) {
      mappedType = 'income';
    }

    const defaultCatName =
      mappedType === 'transfer'
        ? 'Transfer Dana'
        : mappedType === 'income'
        ? 'Pemasukan'
        : 'Pengeluaran';

    const category = sanitizeString(
      pickCol(t, ['category', 'kategori', 'nama_kategori', 'category_name']) ??
        catInfoFromId?.name ??
        defaultCatName,
      MAX_CATEGORY_LENGTH,
      defaultCatName
    );

    const amount = Math.max(
      1,
      Math.abs(
        parseSafeNumber(
          pickCol(
            t,
            ['amount', 'nominal', 'jumlah', 'nilai', 'total', 'harga', 'biaya', 'masuk', 'keluar'],
            ['amount', 'nominal', 'jumlah', 'nilai', 'total']
          ),
          10000
        )
      )
    );

    const note = sanitizeString(
      pickCol(
        t,
        ['note', 'catatan', 'deskripsi', 'keterangan', 'description', 'uraian', 'judul', 'title', 'nama'],
        ['note', 'catat', 'ket', 'desk', 'uraian']
      ) ?? category,
      MAX_NOTE_LENGTH,
      category
    );

    const rawDateVal = String(
      pickCol(
        t,
        ['date', 'tanggal', 'tgl', 'tgl_transaksi', 'transaction_date', 'waktu', 'created_at', 'createdAt'],
        ['date', 'tanggal', 'tgl', 'waktu']
      ) ?? nowIso.slice(0, 10)
    ).slice(0, 10);
    const date = rawDateVal.length >= 8 ? rawDateVal : nowIso.slice(0, 10);
    const updatedAtIso = String(pickCol(t, ['updated_at', 'updatedAt']) ?? nowIso);
    const softDel = extractSoftDeleteFromRow(t, updatedAtIso);

    const txDoc: NormalizedTransactionDoc = {
      id: sanitizeId(`su_tx_${rawId}`),
      ownerId: ownerUid,
      walletId,
      walletName,
      fundOwnerId,
      fundOwnerName,
      type: mappedType,
      category,
      amount,
      note,
      date,
      deleted: softDel.deleted,
      deletedAt: softDel.deletedAt,
      createdAt: String(pickCol(t, ['created_at', 'createdAt']) ?? nowIso),
      updatedAt: updatedAtIso,
    };

    if (mappedType === 'transfer') {
      const rawToTargetStr = isValidFk(toWalletRaw) ? String(toWalletRaw).trim() : '';
      const rawToOwnerStr = isValidFk(toOwnerRaw) ? String(toOwnerRaw).trim() : '';

      // In SisaUang (`tb_transaksi`), `sumber_dana_tujuan` references `tb_kepemilikan_sumber_dana.id` (e.g. '42' -> su_holder_42 -> su_wallet_35 GoPay)!
      // Or in generic schemas, `to_wallet_id` + `to_fund_owner_id` may be provided separately.
      let matchedToOwner:
        | { id: string; holderName: string; walletId: string; walletName: string; ownerId: string; deleted: boolean }
        | undefined;
      let matchedToWallet:
        | { id: string; name: string; ownerId: string; balance: number; deleted: boolean; deletedAt: string | null }
        | undefined;

      if (rawToOwnerStr && rawToTargetStr && rawToOwnerStr !== rawToTargetStr) {
        matchedToOwner =
          holderByPivotIdMap.get(rawToOwnerStr) ||
          holderByWalletAndMasterMap.get(`${rawToTargetStr}_${rawToOwnerStr}`);
        matchedToWallet =
          legacyWalletIdMap.get(rawToTargetStr) ||
          (matchedToOwner ? legacyWalletIdMap.get(matchedToOwner.walletId.replace(/^su_wallet_/, '')) : undefined);
      } else {
        const primaryToFk = rawToOwnerStr || rawToTargetStr;
        if (primaryToFk) {
          // Check `tb_kepemilikan_sumber_dana` (`holderByPivotIdMap`) FIRST!
          matchedToOwner = holderByPivotIdMap.get(primaryToFk);
          if (matchedToOwner) {
            const toParentRawWalletId = matchedToOwner.walletId.replace(/^su_wallet_/, '');
            matchedToWallet = legacyWalletIdMap.get(toParentRawWalletId) || {
              id: matchedToOwner.walletId,
              name: matchedToOwner.walletName,
              ownerId: matchedToOwner.ownerId,
              balance: 0,
              deleted: matchedToOwner.deleted,
              deletedAt: null,
            };
          } else {
            matchedToWallet = legacyWalletIdMap.get(primaryToFk);
            matchedToOwner = holderFirstByWalletIdMap.get(primaryToFk);
          }
        }
      }

      txDoc.toWalletId = matchedToOwner?.walletId || matchedToWallet?.id || walletId;
      txDoc.toWalletName = sanitizeString(
        pickCol(t, ['to_wallet_name', 'ke_nama_sumber_dana']) ??
          matchedToOwner?.walletName ??
          matchedToWallet?.name ??
          walletName,
        MAX_WALLET_NAME_LENGTH,
        walletName
      );
      txDoc.toFundOwnerId =
        matchedToOwner?.id || sanitizeId(`su_holder_${rawToOwnerStr || rawToTargetStr || 'dest'}`);
      txDoc.toFundOwnerName = sanitizeString(
        pickCol(t, ['to_fund_owner_name', 'ke_nama_pemilik_dana', 'pemilik_tujuan']) ??
          matchedToOwner?.holderName ??
          fundOwnerName,
        MAX_HOLD_NAME_LENGTH,
        fundOwnerName
      );
    }

    normalizedTransactions.push(txDoc);
  }

  // 6. Convert Budgets
  const normalizedBudgets: NormalizedBudgetDoc[] = [];
  const budgetRowsToProcess = getIncludedRows(budgetsTables);
  for (let idx = 0; idx < budgetRowsToProcess.length; idx++) {
    const b = budgetRowsToProcess[idx];
    const rawId = String(pickCol(b, ['id', 'budget_id', 'id_anggaran']) ?? idx + 1);
    const rawUser = String(pickCol(b, ['user_id', 'id_user', 'owner_id']) ?? '');
    const ownerUid =
      (rawUser && legacyUserIdToUid.get(rawUser)) ||
      (rawUser ? sanitizeId(`ci4_user_${rawUser}`) : defaultOwnerUid);

    const rawCatId = String(pickCol(b, ['category_id', 'id_kategori']) ?? '');
    const catFromId = rawCatId ? legacyCategoryIdToName.get(rawCatId)?.name : undefined;

    const category = sanitizeString(
      pickCol(b, ['category', 'kategori', 'nama_kategori']) ?? catFromId ?? 'Pengeluaran Bulanan',
      MAX_CATEGORY_LENGTH,
      'Pengeluaran Bulanan'
    );
    const limitAmount = Math.max(
      10000,
      parseSafeNumber(pickCol(b, ['limit_amount', 'batas', 'pagu', 'nominal', 'amount']), 1000000)
    );
    const spentAmount = Math.max(
      0,
      parseSafeNumber(pickCol(b, ['spent_amount', 'terpakai', 'realisasi']), 0)
    );
    const period = sanitizeString(
      String(pickCol(b, ['period', 'periode', 'bulan']) ?? '2026-10'),
      20,
      '2026-10'
    );
    const updatedAtIso = String(pickCol(b, ['updated_at', 'updatedAt']) ?? nowIso);
    const softDel = extractSoftDeleteFromRow(b, updatedAtIso);

    normalizedBudgets.push({
      id: sanitizeId(`su_bg_${rawId}`),
      ownerId: ownerUid,
      category,
      limitAmount,
      spentAmount,
      period,
      deleted: softDel.deleted,
      deletedAt: softDel.deletedAt,
      createdAt: String(pickCol(b, ['created_at', 'createdAt']) ?? nowIso),
      updatedAt: updatedAtIso,
    });
  }

  // 7. Convert Activity Logs (CI4 Shield auth_logins)
  const normalizedLogs: NormalizedActivityLogDoc[] = [];
  const logRowsToProcess = getIncludedRows(logsTables);
  for (let idx = 0; idx < logRowsToProcess.length; idx++) {
    const lg = logRowsToProcess[idx];
    const rawId = String(pickCol(lg, ['id', 'log_id']) ?? idx + 1);
    const rawUserId = String(pickCol(lg, ['user_id', 'id_user']) ?? '');
    const actorUid =
      (rawUserId && legacyUserIdToUid.get(rawUserId)) ||
      sanitizeId(`ci4_user_${rawUserId || 'guest'}`);
    const actorEmail = sanitizeString(
      String(
        pickCol(lg, ['identifier', 'email', 'actor_email']) ??
          legacyUserIdToEmail.get(rawUserId) ??
          'user@sisa-uang.id'
      ),
      MAX_EMAIL_LENGTH,
      'user@sisa-uang.id'
    );
    const success = Number(pickCol(lg, ['success', 'berhasil']) ?? 1) === 1;
    const ip = String(pickCol(lg, ['ip_address', 'ip']) ?? '127.0.0.1');

    normalizedLogs.push({
      id: sanitizeId(`su_log_${rawId}`),
      actorUid,
      actorEmail,
      action: success ? 'ci4_shield_login_success' : 'ci4_shield_login_failed',
      detail: sanitizeString(
        `[Migrasi CI4 Shield] ${success ? 'Login berhasil' : 'Gagal login'} oleh ${actorEmail} dari IP ${ip}.`,
        MAX_LOG_DETAIL_LENGTH,
        'Log autentikasi CodeIgniter 4 Shield'
      ),
      severity: success ? 'info' : 'warning',
      createdAt: String(pickCol(lg, ['date', 'created_at', 'tanggal']) ?? nowIso),
    });
  }

  // =========================================================================
  // Compute Accurate Write Quota Estimation
  // =========================================================================
  const rawLegacyRowsCount = activeTables.reduce((acc, t) => acc + t.rows.length, 0);
  const activeLegacyRowsCount = activeTables
    .filter((t) => t.includeData)
    .reduce((acc, t) => acc + t.rows.length, 0);

  const collectionBreakdown: WriteQuotaEstimation['collectionBreakdown'] = [
    {
      collectionName: 'users',
      matchedTableNames: allUserCatTables.map((t) => t.tableName),
      legacyRowsCount: getTotalRowsCount(allUserCatTables),
      includedLegacyRowsCount: getIncludedRows(allUserCatTables).length,
      newDocsWritesCount: normalizedUsers.length,
      softDeletedDocsCount: normalizedUsers.filter((d) => d.deleted).length,
      note:
        allUserCatTables.length > 0 && allUserCatTables.every((t) => !t.includeData)
          ? 'Data dinonaktifkan (Hanya struktur skema).'
          : 'Menggabungkan tabel users, auth_identities, dan auth_groups_users (CI4 Shield) menjadi 1 dokumen per user + status Soft Delete.',
    },
    {
      collectionName: 'wallets',
      matchedTableNames: walletsTables.map((t) => t.tableName),
      legacyRowsCount: getTotalRowsCount(walletsTables),
      includedLegacyRowsCount: walletRowsToProcess.length,
      newDocsWritesCount: normalizedWallets.length,
      softDeletedDocsCount: normalizedWallets.filter((d) => d.deleted).length,
      note:
        walletsTables.length > 0 && walletsTables.every((t) => !t.includeData)
          ? 'Data dinonaktifkan (Hanya struktur skema).'
          : 'Sumber dana utama (contoh: Mandiri, BCA, GoPay) dengan agregasi total saldo & dukungan Soft Delete.',
    },
    {
      collectionName: 'wallet_owners',
      matchedTableNames: walletOwnersTables.map((t) => t.tableName),
      legacyRowsCount: getTotalRowsCount(walletOwnersTables),
      includedLegacyRowsCount: walletOwnerRowsToProcess.length,
      newDocsWritesCount: normalizedWalletOwners.length,
      softDeletedDocsCount: normalizedWalletOwners.filter((d) => d.deleted).length,
      note:
        walletOwnersTables.length > 0 && walletOwnersTables.every((t) => !t.includeData)
          ? 'Data dinonaktifkan (Hanya struktur skema).'
          : 'Konsep Kepemilikan Dana SisaUang (contoh: Wallet Mandiri -> Pribadi, Istri) beserta penanda Soft Delete.',
    },
    {
      collectionName: 'categories',
      matchedTableNames: categoriesTables.map((t) => t.tableName),
      legacyRowsCount: getTotalRowsCount(categoriesTables),
      includedLegacyRowsCount: categoryRowsToProcess.length,
      newDocsWritesCount: normalizedCategories.length,
      softDeletedDocsCount: normalizedCategories.filter((d) => d.deleted).length,
      note:
        categoriesTables.length > 0 && categoriesTables.every((t) => !t.includeData)
          ? 'Data dinonaktifkan (Hanya struktur skema).'
          : 'Manajemen kategori pemasukan (income) dan pengeluaran (expense) dengan proteksi Soft Delete.',
    },
    {
      collectionName: 'transactions',
      matchedTableNames: transactionsTables.map((t) => t.tableName),
      legacyRowsCount: getTotalRowsCount(transactionsTables),
      includedLegacyRowsCount: txRowsToProcess.length,
      newDocsWritesCount: normalizedTransactions.length,
      softDeletedDocsCount: normalizedTransactions.filter((d) => d.deleted).length,
      note:
        transactionsTables.length > 0 && transactionsTables.every((t) => !t.includeData)
          ? 'Data dinonaktifkan (Hanya struktur skema).'
          : 'Transaksi (income, expense, transfer) terdenormalisasi dengan perlindungan histori Soft Delete.',
    },
    {
      collectionName: 'budgets',
      matchedTableNames: budgetsTables.map((t) => t.tableName),
      legacyRowsCount: getTotalRowsCount(budgetsTables),
      includedLegacyRowsCount: budgetRowsToProcess.length,
      newDocsWritesCount: normalizedBudgets.length,
      softDeletedDocsCount: normalizedBudgets.filter((d) => d.deleted).length,
      note:
        budgetsTables.length > 0 && budgetsTables.every((t) => !t.includeData)
          ? 'Data dinonaktifkan (Hanya struktur skema).'
          : 'Batas anggaran pengeluaran bulanan per kategori beserta status Soft Delete.',
    },
    {
      collectionName: 'activity_logs',
      matchedTableNames: logsTables.map((t) => t.tableName),
      legacyRowsCount: getTotalRowsCount(logsTables),
      includedLegacyRowsCount: logRowsToProcess.length,
      newDocsWritesCount: normalizedLogs.length,
      softDeletedDocsCount: 0,
      note:
        logsTables.length > 0 && logsTables.every((t) => !t.includeData)
          ? 'Data dinonaktifkan (Hanya struktur skema).'
          : 'Riwayat aktivitas login dari tabel auth_logins CodeIgniter 4 Shield (Append-only).',
    },
  ];

  // Only keep breakdown rows that actually have matched tables OR are core SisaUang collections when tables exist
  const filteredBreakdown = collectionBreakdown.filter(
    (item) =>
      item.matchedTableNames.length > 0 ||
      ['users', 'wallets', 'wallet_owners', 'categories', 'transactions'].includes(
        item.collectionName
      )
  );

  const optimizedFirestoreWrites = collectionBreakdown.reduce(
    (acc, item) => acc + item.newDocsWritesCount,
    0
  );
  const writesSavedCount = Math.max(0, rawLegacyRowsCount - optimizedFirestoreWrites);
  const quotaUsagePercentage = Number(
    ((optimizedFirestoreWrites / FIRESTORE_FREE_TIER_DAILY_WRITES) * 100).toFixed(2)
  );
  const remainingFreeWrites = Math.max(
    0,
    FIRESTORE_FREE_TIER_DAILY_WRITES - optimizedFirestoreWrites
  );
  const estimatedBatchesCount =
    optimizedFirestoreWrites > 0 ? Math.ceil(optimizedFirestoreWrites / 450) : 0;

  const writeEstimation: WriteQuotaEstimation = {
    freePlanDailyLimit: FIRESTORE_FREE_TIER_DAILY_WRITES,
    totalActiveTablesCount: activeTables.length,
    totalTablesWithDataIncluded: activeTables.filter((t) => t.includeData).length,
    rawLegacyRowsCount,
    activeLegacyRowsCount,
    optimizedFirestoreWrites,
    writesSavedCount,
    quotaUsagePercentage,
    remainingFreeWrites,
    estimatedBatchesCount,
    isWithinFreeTier: optimizedFirestoreWrites <= FIRESTORE_FREE_TIER_DAILY_WRITES,
    collectionBreakdown: filteredBreakdown,
  };

  // Helper to collect detected soft delete columns across a group of legacy tables
  const getSoftDeleteColsForTables = (tables: ParsedPhpMyAdminTable[], fallback: string[]): string[] => {
    const cols = new Set<string>();
    for (const t of tables) {
      for (const c of t.detectedSoftDeleteColumns || []) {
        cols.add(`${t.tableName}.${c}`);
      }
    }
    return cols.size > 0 ? Array.from(cols) : fallback;
  };

  // =========================================================================
  // Build Schema Designs Based on Remaining Active Tables
  // =========================================================================
  const allCandidateSchemas: SchemaCollectionDesign[] = [
    {
      collectionName: 'users',
      legacySourceTables:
        allUserCatTables.length > 0
          ? allUserCatTables.map((t) => t.tableName)
          : ['users', 'auth_identities', 'auth_groups_users'],
      purpose: 'Menyimpan profil utama akun pengguna dan hak akses role (user / admin).',
      dataIncluded: allUserCatTables.some((t) => t.includeData),
      estimatedDocumentCount: normalizedUsers.length,
      estimatedWritesCount: normalizedUsers.length,
      softDeleteSupported: true,
      detectedLegacySoftDeleteFields: getSoftDeleteColsForTables(allUserCatTables, ['users.deleted_at', 'users.deleted']),
      softDeletedDocsCount: normalizedUsers.filter((d) => d.deleted).length,
      fields: [
        { fieldName: 'uid', dataType: 'string (Document ID)', required: true, description: 'ID unik dokumen user di Firebase Auth / Firestore' },
        { fieldName: 'username', dataType: 'string', required: true, description: 'Username unik dari kolom username pada tabel users lama (dapat digunakan langsung untuk login layaknya email)' },
        { fieldName: 'email', dataType: 'string', required: true, description: 'Alamat email utama hasil ekstraksi dari tabel auth_identities.secret (dapat digunakan untuk login)' },
        { fieldName: 'displayName', dataType: 'string', required: true, description: 'Nama tampilan pengguna yang bebas diatur sendiri setelah login (mendukung spasi dan karakter bebas)' },
        { fieldName: 'passwordHash', dataType: 'string (opsional)', required: false, description: 'Hash kata sandi dari auth_identities.secret2 (Bcrypt CI4 Shield / SHA-256) untuk verifikasi login akun hasil migrasi' },
        { fieldName: 'role', dataType: "enum ('user' | 'admin')", required: true, description: 'Hasil konversi dari tabel auth_groups_users (superadmin/admin -> admin)' },
        { fieldName: 'status', dataType: "enum ('active' | 'blocked')", required: true, description: 'Konversi dari kolom active (1/0) dan status (banned) pada CI4 Shield' },
        { fieldName: 'authProvider', dataType: "enum ('password' | 'google')", required: true, description: 'Metode autentikasi dari auth_identities.type (email_password / google)' },
        { fieldName: 'currency', dataType: "enum ('IDR' | 'USD')", required: true, description: 'Preferensi mata uang pengguna (default IDR)' },
        { fieldName: 'deleted', dataType: 'boolean', required: true, description: 'Flag Soft Delete (true = diarsipkan/dihapus, false = aktif) hasil deteksi otomatis dari kolom deleted / deleted_at pada DB lama', isSoftDeleteField: true },
        { fieldName: 'deletedAt', dataType: 'timestamp | null', required: false, description: 'Waktu penghapusan akun (Soft Delete) untuk menjaga audit trail dan histori relasi data keuangan', isSoftDeleteField: true },
        { fieldName: 'createdAt', dataType: 'timestamp', required: true, description: 'Waktu pembuatan akun' },
        { fieldName: 'updatedAt', dataType: 'timestamp', required: true, description: 'Waktu pembaruan terakhir' },
      ],
      changeExplanations: [
        'Mendeteksi kolom Soft Delete (`deleted_at` / `deleted`) pada tabel `users` lama dan menormalisasikannya menjadi pasangan field `deleted` (boolean) serta `deletedAt` (timestamp | null) agar riwayat akun tetap aman.',
        'Mempertahankan field `username` asli dari tabel `users` lama agar setiap pengguna tetap bisa login menggunakan username maupun alamat email.',
        'Menambahkan field baru `displayName` yang terpisah dari `username`, sehingga pengguna dapat bebas mengatur nama tampilan lengkap (termasuk spasi dan karakter lainnya) di halaman Pengaturan setelah login.',
        'Menyertakan `passwordHash` dari `auth_identities.secret2` (mendukung verifikasi hash Bcrypt `$2y$` bawaan CodeIgniter 4 Shield) sehingga pengguna lama dapat langsung login menggunakan password lama mereka.',
      ],
    },
    {
      collectionName: 'wallets',
      legacySourceTables:
        walletsTables.length > 0 ? walletsTables.map((t) => t.tableName) : ['wallets / sumber_dana'],
      purpose: 'Menyimpan daftar Sumber Dana (Wallet) seperti Bank Mandiri, BCA, GoPay, atau Kas Tunai.',
      dataIncluded: walletsTables.some((t) => t.includeData),
      estimatedDocumentCount: normalizedWallets.length,
      estimatedWritesCount: normalizedWallets.length,
      softDeleteSupported: true,
      detectedLegacySoftDeleteFields: getSoftDeleteColsForTables(walletsTables, ['wallets.deleted', 'wallets.deleted_at']),
      softDeletedDocsCount: normalizedWallets.filter((d) => d.deleted).length,
      fields: [
        { fieldName: 'id', dataType: 'string (Document ID)', required: true, description: 'ID unik sumber dana (wallet)' },
        { fieldName: 'ownerId', dataType: 'string', required: true, description: 'UID pemilik akun (foreign key ke koleksi users)' },
        { fieldName: 'name', dataType: 'string', required: true, description: 'Nama sumber dana (contoh: Bank Mandiri, BCA, Dompet Tunai)' },
        { fieldName: 'type', dataType: "enum ('bank' | 'ewallet' | 'cash' | 'investment' | 'credit')", required: true, description: 'Kategori instrumen sumber dana' },
        { fieldName: 'balance', dataType: 'number (float/int)', required: true, description: 'Total akumulasi saldo dari seluruh pemilik dana aktif di dalam sumber dana ini' },
        { fieldName: 'color', dataType: 'string', required: true, description: 'Tema warna indikator visual kartu sumber dana' },
        { fieldName: 'deleted', dataType: 'boolean', required: true, description: 'Flag Soft Delete hasil konversi kolom deleted (0/1) atau deleted_at dari tabel sumber dana lama agar histori dompet tidak hilang permanen', isSoftDeleteField: true },
        { fieldName: 'deletedAt', dataType: 'timestamp | null', required: false, description: 'Timestamp kapan sumber dana dihapus (Soft Delete) untuk keperluan audit & pemulihan data (recovery)', isSoftDeleteField: true },
        { fieldName: 'createdAt', dataType: 'timestamp', required: true, description: 'Waktu pembuatan sumber dana' },
        { fieldName: 'updatedAt', dataType: 'timestamp', required: true, description: 'Waktu pembaruan saldo terakhir' },
      ],
      changeExplanations: [
        'Mendeteksi field `deleted` / `deleted_at` dari tabel dompet (`wallets` / `sumber_dana`) lama dan menerapkannya menjadi `deleted` (boolean) + `deletedAt` (timestamp | null) untuk mencegah hilangnya histori dompet yang pernah dipakai bertransaksi.',
        'Perubahan kolom `user_id` (INT) menjadi `ownerId` (STRING) untuk isolasi data per akun pengguna di Firestore.',
        'Konversi tipe data `DECIMAL(15,2)` MySQL menjadi `number` native di Firestore yang secara otomatis menyinkronkan total saldo dari seluruh sub-kepemilikan dana aktif (`wallet_owners`).',
      ],
    },
    {
      collectionName: 'wallet_owners',
      legacySourceTables:
        walletOwnersTables.length > 0
          ? walletOwnersTables.map((t) => t.tableName)
          : ['wallet_owners / pemilik_dana'],
      purpose:
        'Mengakomodasi konsep inti "Kepemilikan Dana" SisaUang di mana 1 Sumber Dana (contoh: Mandiri) dapat memiliki beberapa pemilik dana (contoh: Pribadi, Istri) dengan saldo terpisah.',
      dataIncluded: walletOwnersTables.some((t) => t.includeData),
      estimatedDocumentCount: normalizedWalletOwners.length,
      estimatedWritesCount: normalizedWalletOwners.length,
      softDeleteSupported: true,
      detectedLegacySoftDeleteFields: getSoftDeleteColsForTables(walletOwnersTables, ['wallet_owners.deleted', 'owners.deleted']),
      softDeletedDocsCount: normalizedWalletOwners.filter((d) => d.deleted).length,
      fields: [
        { fieldName: 'id', dataType: 'string (Document ID)', required: true, description: 'ID unik kepemilikan dana' },
        { fieldName: 'ownerId', dataType: 'string', required: true, description: 'UID pengguna pemilik akun' },
        { fieldName: 'walletId', dataType: 'string', required: true, description: 'Referensi ID Sumber Dana induk (contoh: Mandiri)' },
        { fieldName: 'walletName', dataType: 'string', required: true, description: 'Denormalisasi nama Sumber Dana agar tidak perlu JOIN query saat tampil di UI' },
        { fieldName: 'holderName', dataType: 'string', required: true, description: 'Nama pemilik dana di dalam wallet tersebut (contoh: Pribadi, Istri, Anak)' },
        { fieldName: 'balance', dataType: 'number (float/int)', required: true, description: 'Saldo spesifik milik pemilik dana tersebut di dalam wallet induk' },
        { fieldName: 'deleted', dataType: 'boolean', required: true, description: 'Flag Soft Delete hasil deteksi kolom deleted / deleted_at pada tabel kepemilikan dana lama agar histori alokasi dana tetap terjaga', isSoftDeleteField: true },
        { fieldName: 'deletedAt', dataType: 'timestamp | null', required: false, description: 'Timestamp penghapusan kepemilikan dana (Soft Delete) untuk pemulihan jika terjadi kesalahan hapus', isSoftDeleteField: true },
        { fieldName: 'createdAt', dataType: 'timestamp', required: true, description: 'Waktu pembuatan kepemilikan dana' },
        { fieldName: 'updatedAt', dataType: 'timestamp', required: true, description: 'Waktu pembaruan saldo kepemilikan terakhir' },
      ],
      changeExplanations: [
        'Melakukan relasi otomatis (JOIN) antara tabel alokasi sumber dana (`tb_kepemilikan_sumber_dana`) dengan tabel master pemilik dana (`tb_kepemilikan_dana`), sehingga nama asli pemilik dana terimpor secara utuh ke field `holderName` tanpa menghasilkan label generik seperti "Pemilik #3".',
        'Mempertahankan mekanisme Soft Delete (`deleted` & `deletedAt`) dari tabel `tb_kepemilikan_sumber_dana` & `tb_kepemilikan_dana` lama sehingga alokasi kepemilikan dana yang dihapus tetap tersimpan historinya dan dapat dipulihkan.',
        'Memisahkan kepemilikan dana ke koleksi khusus `wallet_owners` yang berelasi ke `wallets` (`walletId`), sehingga 1 sumber dana (mis. Mandiri) bisa dibagi ke beberapa pemilik (Pribadi, Istri, dll).',
        'Menambahkan field denormalisasi `walletName` untuk mempercepat pemuatan halaman dan menghemat kuota Read Firestore tanpa perlu melakukan query JOIN berlapis.',
      ],
    },
    {
      collectionName: 'categories',
      legacySourceTables:
        categoriesTables.length > 0
          ? categoriesTables.map((t) => t.tableName)
          : ['categories / kategori'],
      purpose: 'Manajemen kategori transaksi pemasukan (income) dan pengeluaran (expense) yang dapat ditambah atau dihapus oleh pengguna.',
      dataIncluded: categoriesTables.some((t) => t.includeData),
      estimatedDocumentCount: normalizedCategories.length,
      estimatedWritesCount: normalizedCategories.length,
      softDeleteSupported: true,
      detectedLegacySoftDeleteFields: getSoftDeleteColsForTables(categoriesTables, ['categories.deleted', 'categories.deleted_at']),
      softDeletedDocsCount: normalizedCategories.filter((d) => d.deleted).length,
      fields: [
        { fieldName: 'id', dataType: 'string (Document ID)', required: true, description: 'ID unik dokumen kategori' },
        { fieldName: 'ownerId', dataType: 'string', required: true, description: 'UID pemilik kategori' },
        { fieldName: 'name', dataType: 'string', required: true, description: 'Nama kategori (contoh: Gaji Utama, Makanan & Minuman, Belanja Istri)' },
        { fieldName: 'type', dataType: "enum ('income' | 'expense')", required: true, description: 'Jenis peruntukan kategori (pemasukan atau pengeluaran)' },
        { fieldName: 'color', dataType: 'string', required: true, description: 'Label warna kategori' },
        { fieldName: 'deleted', dataType: 'boolean', required: true, description: 'Flag Soft Delete dari kolom deleted pada tabel kategori lama agar transaksi historis tetap memiliki referensi kategori yang valid', isSoftDeleteField: true },
        { fieldName: 'deletedAt', dataType: 'timestamp | null', required: false, description: 'Timestamp kapan kategori diarsipkan/dihapus secara Soft Delete', isSoftDeleteField: true },
        { fieldName: 'createdAt', dataType: 'timestamp', required: true, description: 'Waktu pembuatan kategori' },
        { fieldName: 'updatedAt', dataType: 'timestamp', required: true, description: 'Waktu pembaruan kategori' },
      ],
      changeExplanations: [
        'Menerapkan Soft Delete (`deleted` & `deletedAt`) hasil deteksi kolom `deleted` pada tabel `categories` lama supaya kategori yang dihapus tidak merusak integritas laporan histori transaksi.',
        'Mempertahankan penuh fitur Manajemen Kategori dari versi SisaUang sebelumnya dengan struktur koleksi mandiri `categories`.',
      ],
    },
    {
      collectionName: 'transactions',
      legacySourceTables:
        transactionsTables.length > 0
          ? transactionsTables.map((t) => t.tableName)
          : ['transactions / transaksi'],
      purpose:
        'Menyimpan riwayat transaksi (income, expense, dan transfer antar sumber dana & kepemilikan dana).',
      dataIncluded: transactionsTables.some((t) => t.includeData),
      estimatedDocumentCount: normalizedTransactions.length,
      estimatedWritesCount: normalizedTransactions.length,
      softDeleteSupported: true,
      detectedLegacySoftDeleteFields: getSoftDeleteColsForTables(transactionsTables, ['transactions.deleted', 'transactions.deleted_at']),
      softDeletedDocsCount: normalizedTransactions.filter((d) => d.deleted).length,
      fields: [
        { fieldName: 'id', dataType: 'string (Document ID)', required: true, description: 'ID unik transaksi' },
        { fieldName: 'ownerId', dataType: 'string', required: true, description: 'UID pengguna pemilik transaksi' },
        { fieldName: 'walletId', dataType: 'string', required: true, description: 'ID Sumber Dana asal' },
        { fieldName: 'walletName', dataType: 'string', required: true, description: 'Nama Sumber Dana asal (denormalisasi)' },
        { fieldName: 'fundOwnerId', dataType: 'string', required: true, description: 'ID Pemilik Dana asal di dalam sumber dana tersebut' },
        { fieldName: 'fundOwnerName', dataType: 'string', required: true, description: 'Nama Pemilik Dana asal (contoh: Pribadi / Istri)' },
        { fieldName: 'toWalletId', dataType: 'string (opsional)', required: false, description: 'Khusus Transfer: ID Sumber Dana tujuan' },
        { fieldName: 'toWalletName', dataType: 'string (opsional)', required: false, description: 'Khusus Transfer: Nama Sumber Dana tujuan' },
        { fieldName: 'toFundOwnerId', dataType: 'string (opsional)', required: false, description: 'Khusus Transfer: ID Pemilik Dana tujuan' },
        { fieldName: 'toFundOwnerName', dataType: 'string (opsional)', required: false, description: 'Khusus Transfer: Nama Pemilik Dana tujuan' },
        { fieldName: 'type', dataType: "enum ('income' | 'expense' | 'transfer')", required: true, description: '3 jenis transaksi SisaUang: Pemasukan, Pengeluaran, atau Transfer' },
        { fieldName: 'category', dataType: 'string', required: true, description: 'Nama kategori transaksi (atau "Transfer Dana" untuk tipe transfer)' },
        { fieldName: 'amount', dataType: 'number (float/int)', required: true, description: 'Nominal transaksi (> 0)' },
        { fieldName: 'note', dataType: 'string', required: true, description: 'Catatan / keterangan transaksi' },
        { fieldName: 'date', dataType: 'string (YYYY-MM-DD)', required: true, description: 'Tanggal transaksi untuk pengurutan kronologis' },
        { fieldName: 'deleted', dataType: 'boolean', required: true, description: 'Flag Soft Delete wajib untuk aplikasi keuangan: transaksi yang dihapus tetap tersimpan di database (deleted: true) untuk audit & recovery jika terjadi kesalahan input/sistem', isSoftDeleteField: true },
        { fieldName: 'deletedAt', dataType: 'timestamp | null', required: false, description: 'Timestamp waktu penghapusan transaksi (Soft Delete) untuk pelacakan histori mutasi dana', isSoftDeleteField: true },
        { fieldName: 'createdAt', dataType: 'timestamp', required: true, description: 'Timestamp pembuatan dokumen' },
        { fieldName: 'updatedAt', dataType: 'timestamp', required: true, description: 'Timestamp pembaruan dokumen' },
      ],
      changeExplanations: [
        'Mendeteksi kolom `deleted` / `deleted_at` dari tabel `transactions` lama dan menerapkannya menjadi `deleted` (boolean) + `deletedAt` (timestamp | null). Transaksi yang dihapus pengguna tidak hilang permanen (hard delete), melainkan diarsipkan secara soft delete demi menjaga histori keuangan dan pemulihan saat terjadi error.',
        'Penambahan pasangan field kepemilikan dana asal (`fundOwnerId`, `fundOwnerName`) sehingga setiap transaksi tercatat jelas berasal dari Sumber Dana mana dan Pemilik Dana siapa.',
        'Penambahan field tujuan khusus transaksi `transfer` (`toWalletId`, `toWalletName`, `toFundOwnerId`, `toFundOwnerName`) untuk mendukung perpindahan dana lintas Sumber Dana maupun lintas Kepemilikan Dana dalam 1 dokumen transaksi utuh.',
      ],
    },
    {
      collectionName: 'budgets',
      legacySourceTables:
        budgetsTables.length > 0 ? budgetsTables.map((t) => t.tableName) : ['budgets / anggaran'],
      purpose: 'Menyimpan batas anggaran pengeluaran bulanan per kategori.',
      dataIncluded: budgetsTables.some((t) => t.includeData),
      estimatedDocumentCount: normalizedBudgets.length,
      estimatedWritesCount: normalizedBudgets.length,
      softDeleteSupported: true,
      detectedLegacySoftDeleteFields: getSoftDeleteColsForTables(budgetsTables, ['budgets.deleted', 'budgets.deleted_at']),
      softDeletedDocsCount: normalizedBudgets.filter((d) => d.deleted).length,
      fields: [
        { fieldName: 'id', dataType: 'string (Document ID)', required: true, description: 'ID unik dokumen anggaran' },
        { fieldName: 'ownerId', dataType: 'string', required: true, description: 'UID pengguna pemilik anggaran' },
        { fieldName: 'category', dataType: 'string', required: true, description: 'Nama kategori pengeluaran yang dibatasi' },
        { fieldName: 'limitAmount', dataType: 'number', required: true, description: 'Batas maksimal anggaran bulanan' },
        { fieldName: 'spentAmount', dataType: 'number', required: true, description: 'Nominal anggaran yang telah terpakai' },
        { fieldName: 'period', dataType: 'string (YYYY-MM)', required: true, description: 'Periode bulan anggaran aktif' },
        { fieldName: 'deleted', dataType: 'boolean', required: true, description: 'Flag Soft Delete untuk mempertahankan histori anggaran bulanan yang pernah dibuat', isSoftDeleteField: true },
        { fieldName: 'deletedAt', dataType: 'timestamp | null', required: false, description: 'Timestamp kapan anggaran dihapus secara Soft Delete', isSoftDeleteField: true },
        { fieldName: 'createdAt', dataType: 'timestamp', required: true, description: 'Waktu pembuatan' },
        { fieldName: 'updatedAt', dataType: 'timestamp', required: true, description: 'Waktu pembaruan' },
      ],
      changeExplanations: [
        'Menerapkan field Soft Delete (`deleted` & `deletedAt`) pada koleksi `budgets` untuk mempertahankan riwayat perencanaan anggaran jika terjadi ketidaksengajaan hapus.',
        'Menghubungkan `category_id` relasional dari MySQL langsung ke nama kategori (`category`) yang sinkron dengan koleksi `categories` dan `transactions`.',
      ],
    },
    {
      collectionName: 'activity_logs',
      legacySourceTables:
        logsTables.length > 0 ? logsTables.map((t) => t.tableName) : ['auth_logins'],
      purpose: 'Mencatat jejak audit keamanan dan riwayat autentikasi pengguna untuk dipantau oleh Super Admin.',
      dataIncluded: logsTables.some((t) => t.includeData),
      estimatedDocumentCount: normalizedLogs.length,
      estimatedWritesCount: normalizedLogs.length,
      softDeleteSupported: false,
      detectedLegacySoftDeleteFields: [],
      softDeletedDocsCount: 0,
      fields: [
        { fieldName: 'id', dataType: 'string (Document ID)', required: true, description: 'ID unik log aktivitas' },
        { fieldName: 'actorUid', dataType: 'string', required: true, description: 'UID pelaku aktivitas' },
        { fieldName: 'actorEmail', dataType: 'string', required: true, description: 'Email pelaku aktivitas (dari identifier CI4 Shield)' },
        { fieldName: 'action', dataType: 'string', required: true, description: 'Kode aksi (contoh: ci4_shield_login_success)' },
        { fieldName: 'detail', dataType: 'string', required: true, description: 'Deskripsi lengkap mencakup alamat IP dan status' },
        { fieldName: 'severity', dataType: "enum ('info' | 'warning' | 'critical')", required: true, description: 'Tingkat keparahan log untuk pemantauan anomali' },
        { fieldName: 'createdAt', dataType: 'timestamp', required: true, description: 'Waktu kejadian aktivitas' },
      ],
      changeExplanations: [
        'Transformasi tabel `auth_logins` milik CodeIgniter 4 Shield menjadi format `activity_logs` terpadu dengan indikator `severity` (bersifat append-only / permanen).',
      ],
    },
  ];

  // Only generate schema designs for collections that still have at least 1 active table in `activeTables`
  const activeCategorySet = new Set<TargetCollectionCategory>(
    activeTables.map((t) => t.detectedCategory)
  );
  const newSchemaDesigns = allCandidateSchemas.filter((s) =>
    activeCategorySet.has(s.collectionName)
  );

  const tablesWithSoftDeleteList = activeTables.filter(
    (t) => (t.detectedSoftDeleteColumns || []).length > 0
  );
  const totalSoftDeletedRowsDetected = activeTables.reduce(
    (acc, t) => acc + (t.softDeletedRowsCount || 0),
    0
  );

  return {
    rawTables: activeTables,
    writeEstimation,
    newSchemaDesigns,
    softDeleteStats: {
      tablesWithSoftDelete: tablesWithSoftDeleteList.length,
      totalSoftDeletedRowsDetected,
      detectedColumnNames: tablesWithSoftDeleteList.map(
        (t) => `${t.tableName} (${t.detectedSoftDeleteColumns.join(', ')})`
      ),
    },
    convertedCollections: {
      users: normalizedUsers,
      wallets: normalizedWallets,
      wallet_owners: normalizedWalletOwners,
      categories: normalizedCategories,
      transactions: normalizedTransactions,
      budgets: normalizedBudgets,
      activity_logs: normalizedLogs,
    },
  };
}

/**
 * Sample PHPMyAdmin JSON Export representing Legacy SisaUang (MySQL + CI4 Shield + Kepemilikan Dana + Kategori + Transfer + Soft Delete `deleted` / `deleted_at`)
 */
export const SAMPLE_PHPMYADMIN_JSON = JSON.stringify(
  [
    {
      type: 'header',
      version: '5.2.1',
      comment: 'Export to JSON plugin for PHPMyAdmin — SisaUang Legacy Database (MySQL)',
    },
    {
      type: 'database',
      name: 'sisa_uang_ci4',
    },
    {
      type: 'table',
      name: 'users',
      database: 'sisa_uang_ci4',
      data: [
        {
          id: '1',
          username: 'vuedevo',
          status: null,
          status_message: null,
          active: '1',
          last_active: '2026-10-05 09:00:00',
          created_at: '2025-01-10 08:00:00',
          updated_at: '2026-10-05 09:00:00',
          deleted_at: null,
          deleted: '0',
        },
        {
          id: '2',
          username: 'andika_keluarga',
          status: null,
          status_message: null,
          active: '1',
          last_active: '2026-10-05 19:20:00',
          created_at: '2025-05-12 10:15:00',
          updated_at: '2026-10-05 19:20:00',
          deleted_at: null,
          deleted: '0',
        },
        {
          id: '3',
          username: 'siti_rahmawati',
          status: null,
          status_message: null,
          active: '1',
          last_active: '2026-10-05 07:45:00',
          created_at: '2025-07-20 14:30:00',
          updated_at: '2026-10-05 07:45:00',
          deleted_at: null,
          deleted: '0',
        },
        {
          id: '4',
          username: 'doni_kusuma',
          status: 'banned',
          status_message: 'Pelanggaran ketentuan layanan',
          active: '0',
          last_active: '2026-09-15 11:10:00',
          created_at: '2025-08-01 09:00:00',
          updated_at: '2026-09-15 11:10:00',
          deleted_at: '2026-09-16 08:00:00',
          deleted: '1',
        },
      ],
    },
    {
      type: 'table',
      name: 'auth_identities',
      database: 'sisa_uang_ci4',
      data: [
        {
          id: '1',
          user_id: '1',
          type: 'email_password',
          name: null,
          secret: 'vuedevo@gmail.com',
          secret2: '$2y$10$shieldHashSuperAdmin999',
          created_at: '2025-01-10 08:00:00',
          updated_at: '2026-10-05 09:00:00',
        },
        {
          id: '2',
          user_id: '2',
          type: 'email_password',
          name: null,
          secret: 'andika.pratama@sisa-uang.id',
          secret2: '$2y$10$shieldHashAndika123',
          created_at: '2025-05-12 10:15:00',
          updated_at: '2026-10-05 19:20:00',
        },
        {
          id: '3',
          user_id: '3',
          type: 'google',
          name: 'Siti Rahmawati',
          secret: 'siti.rahmawati@gmail.com',
          secret2: null,
          created_at: '2025-07-20 14:30:00',
          updated_at: '2026-10-05 07:45:00',
        },
        {
          id: '4',
          user_id: '4',
          type: 'email_password',
          name: null,
          secret: 'doni.kusuma@outlook.com',
          secret2: '$2y$10$shieldHashDoni456',
          created_at: '2025-08-01 09:00:00',
          updated_at: '2026-09-15 11:10:00',
        },
      ],
    },
    {
      type: 'table',
      name: 'auth_groups_users',
      database: 'sisa_uang_ci4',
      data: [
        { id: '1', user_id: '1', group: 'superadmin', created_at: '2025-01-10 08:00:00' },
        { id: '2', user_id: '2', group: 'user', created_at: '2025-05-12 10:15:00' },
        { id: '3', user_id: '3', group: 'user', created_at: '2025-07-20 14:30:00' },
        { id: '4', user_id: '4', group: 'user', created_at: '2025-08-01 09:00:00' },
      ],
    },
    {
      type: 'table',
      name: 'wallets',
      database: 'sisa_uang_ci4',
      data: [
        {
          id: '101',
          user_id: '2',
          name: 'Bank Mandiri',
          type: 'bank',
          balance: '19500000.00',
          color: 'emerald',
          deleted: '0',
          deleted_at: null,
          created_at: '2026-01-01 10:00:00',
          updated_at: '2026-10-05 08:00:00',
        },
        {
          id: '102',
          user_id: '2',
          name: 'BCA Keluarga',
          type: 'bank',
          balance: '14200000.00',
          color: 'indigo',
          deleted: '0',
          deleted_at: null,
          created_at: '2026-01-01 10:00:00',
          updated_at: '2026-10-05 08:00:00',
        },
        {
          id: '103',
          user_id: '2',
          name: 'GoPay',
          type: 'ewallet',
          balance: '1350000.00',
          color: 'sky',
          deleted: '0',
          deleted_at: null,
          created_at: '2026-01-05 10:00:00',
          updated_at: '2026-10-05 08:00:00',
        },
      ],
    },
    {
      type: 'table',
      name: 'wallet_owners',
      database: 'sisa_uang_ci4',
      data: [
        {
          id: '201',
          user_id: '2',
          wallet_id: '101',
          wallet_name: 'Bank Mandiri',
          holder_name: 'Pribadi',
          balance: '12000000.00',
          deleted: '0',
          deleted_at: null,
          created_at: '2026-01-01 10:00:00',
          updated_at: '2026-10-05 08:00:00',
        },
        {
          id: '202',
          user_id: '2',
          wallet_id: '101',
          wallet_name: 'Bank Mandiri',
          holder_name: 'Istri',
          balance: '7500000.00',
          deleted: '0',
          deleted_at: null,
          created_at: '2026-01-01 10:00:00',
          updated_at: '2026-10-05 08:00:00',
        },
        {
          id: '203',
          user_id: '2',
          wallet_id: '102',
          wallet_name: 'BCA Keluarga',
          holder_name: 'Pribadi',
          balance: '9200000.00',
          deleted: '0',
          deleted_at: null,
          created_at: '2026-01-01 10:00:00',
          updated_at: '2026-10-05 08:00:00',
        },
        {
          id: '204',
          user_id: '2',
          wallet_id: '102',
          wallet_name: 'BCA Keluarga',
          holder_name: 'Tabungan Anak',
          balance: '5000000.00',
          deleted: '0',
          deleted_at: null,
          created_at: '2026-01-01 10:00:00',
          updated_at: '2026-10-05 08:00:00',
        },
        {
          id: '205',
          user_id: '2',
          wallet_id: '103',
          wallet_name: 'GoPay',
          holder_name: 'Pribadi',
          balance: '850000.00',
          deleted: '0',
          deleted_at: null,
          created_at: '2026-01-05 10:00:00',
          updated_at: '2026-10-05 08:00:00',
        },
        {
          id: '206',
          user_id: '2',
          wallet_id: '103',
          wallet_name: 'GoPay',
          holder_name: 'Istri',
          balance: '500000.00',
          deleted: '0',
          deleted_at: null,
          created_at: '2026-01-05 10:00:00',
          updated_at: '2026-10-05 08:00:00',
        },
      ],
    },
    {
      type: 'table',
      name: 'categories',
      database: 'sisa_uang_ci4',
      data: [
        { id: '1', user_id: '2', name: 'Gaji Utama', type: 'income', color: 'emerald', deleted: '0', deleted_at: null },
        { id: '2', user_id: '2', name: 'Bonus & Insentif', type: 'income', color: 'teal', deleted: '0', deleted_at: null },
        { id: '3', user_id: '2', name: 'Makanan & Minuman', type: 'expense', color: 'rose', deleted: '0', deleted_at: null },
        { id: '4', user_id: '2', name: 'Belanja Kebutuhan Istri', type: 'expense', color: 'amber', deleted: '0', deleted_at: null },
        { id: '5', user_id: '2', name: 'Tagihan & Utilitas', type: 'expense', color: 'indigo', deleted: '0', deleted_at: null },
        { id: '6', user_id: '2', name: 'Transportasi', type: 'expense', color: 'sky', deleted: '0', deleted_at: null },
      ],
    },
    {
      type: 'table',
      name: 'transactions',
      database: 'sisa_uang_ci4',
      data: [
        {
          id: '501',
          user_id: '2',
          wallet_id: '101',
          fund_owner_id: '201',
          type: 'income',
          category_id: '1',
          category: 'Gaji Utama',
          amount: '15000000.00',
          note: 'Gaji bulanan masuk ke Mandiri (Kepemilikan Pribadi)',
          date: '2026-10-01',
          deleted: '0',
          deleted_at: null,
          created_at: '2026-10-01 09:00:00',
        },
        {
          id: '502',
          user_id: '2',
          wallet_id: '101',
          fund_owner_id: '201',
          to_wallet_id: '101',
          to_fund_owner_id: '202',
          type: 'transfer',
          category: 'Transfer Dana',
          amount: '4500000.00',
          note: 'Alokasi uang belanja bulanan dari Mandiri (Pribadi) ke Mandiri (Istri)',
          date: '2026-10-02',
          deleted: '0',
          deleted_at: null,
          created_at: '2026-10-02 10:15:00',
        },
        {
          id: '503',
          user_id: '2',
          wallet_id: '101',
          fund_owner_id: '202',
          type: 'expense',
          category_id: '4',
          category: 'Belanja Kebutuhan Istri',
          amount: '650000.00',
          note: 'Belanja bulanan supermarket menggunakan dana Mandiri (Istri)',
          date: '2026-10-03',
          deleted: '0',
          deleted_at: null,
          created_at: '2026-10-03 16:40:00',
        },
        {
          id: '504',
          user_id: '2',
          wallet_id: '102',
          fund_owner_id: '203',
          to_wallet_id: '103',
          to_fund_owner_id: '206',
          type: 'transfer',
          category: 'Transfer Dana',
          amount: '500000.00',
          note: 'Top up saldo GoPay (Istri) dari BCA Keluarga (Pribadi)',
          date: '2026-10-04',
          deleted: '0',
          deleted_at: null,
          created_at: '2026-10-04 11:00:00',
        },
      ],
    },
    {
      type: 'table',
      name: 'budgets',
      database: 'sisa_uang_ci4',
      data: [
        {
          id: '301',
          user_id: '2',
          category: 'Belanja Kebutuhan Istri',
          limit_amount: '4500000.00',
          spent_amount: '650000.00',
          period: '2026-10',
          deleted: '0',
          deleted_at: null,
        },
        {
          id: '302',
          user_id: '2',
          category: 'Makanan & Minuman',
          limit_amount: '3000000.00',
          spent_amount: '250000.00',
          period: '2026-10',
          deleted: '0',
          deleted_at: null,
        },
      ],
    },
    {
      type: 'table',
      name: 'auth_logins',
      database: 'sisa_uang_ci4',
      data: [
        {
          id: '1',
          ip_address: '103.144.12.88',
          id_type: 'email_password',
          identifier: 'andika.pratama@sisa-uang.id',
          user_id: '2',
          date: '2026-10-05 19:20:00',
          success: '1',
        },
        {
          id: '2',
          ip_address: '45.112.90.4',
          id_type: 'email_password',
          identifier: 'doni.kusuma@outlook.com',
          user_id: '4',
          date: '2026-09-15 11:10:00',
          success: '0',
        },
      ],
    },
  ],
  null,
  2
);
