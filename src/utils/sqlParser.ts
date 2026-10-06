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

export interface ParsedSqlTable {
  tableName: string;
  columns: string[];
  rows: Record<string, any>[];
}

export interface NormalizedUserDoc {
  uid: string;
  legacyId: string;
  email: string;
  displayName: string;
  role: 'user' | 'admin';
  status: 'active' | 'blocked';
  authProvider: 'password' | 'google';
  currency: 'IDR' | 'USD';
  shieldGroup?: string;
  shieldActive?: number;
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
  createdAt: string;
  updatedAt: string;
}

export interface NormalizedTransactionDoc {
  id: string;
  ownerId: string;
  walletId: string;
  walletName: string;
  type: 'income' | 'expense' | 'transfer';
  category: string;
  amount: number;
  note: string;
  date: string;
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
  createdAt: string;
}

export interface SqlConversionResult {
  rawTables: ParsedSqlTable[];
  firestoreCollections: {
    users: NormalizedUserDoc[];
    wallets: NormalizedWalletDoc[];
    transactions: NormalizedTransactionDoc[];
    budgets: NormalizedBudgetDoc[];
    activity_logs: NormalizedActivityLogDoc[];
  };
  shieldSummary: {
    detectedShieldTables: string[];
    mergedUsersCount: number;
    identitiesLinkedCount: number;
    groupsLinkedCount: number;
  };
}

/**
 * Strip SQL comments (--, #, and /* ... *\/) while preserving string literals
 */
function stripSqlComments(sql: string): string {
  let out = '';
  let i = 0;
  const len = sql.length;
  let inSingle = false;
  let inDouble = false;

  while (i < len) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (inSingle) {
      out += ch;
      if (ch === '\\' && i + 1 < len) {
        out += sql[i + 1];
        i += 2;
        continue;
      }
      if (ch === "'" && next === "'") {
        out += next;
        i += 2;
        continue;
      }
      if (ch === "'") {
        inSingle = false;
      }
      i++;
      continue;
    }

    if (inDouble) {
      out += ch;
      if (ch === '\\' && i + 1 < len) {
        out += sql[i + 1];
        i += 2;
        continue;
      }
      if (ch === '"') {
        inDouble = false;
      }
      i++;
      continue;
    }

    // Check for -- comment
    if (ch === '-' && next === '-') {
      while (i < len && sql[i] !== '\n') i++;
      continue;
    }

    // Check for # comment
    if (ch === '#') {
      while (i < len && sql[i] !== '\n') i++;
      continue;
    }

    // Check for /* ... */ comment
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < len && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
      i += 2;
      continue;
    }

    if (ch === "'") inSingle = true;
    if (ch === '"') inDouble = true;

    out += ch;
    i++;
  }

  return out;
}

/**
 * Extract column names from CREATE TABLE statements so INSERT INTO without explicit column list still maps cleanly
 */
function extractCreateTableSchemas(cleanSql: string): Map<string, string[]> {
  const schemas = new Map<string, string[]>();
  const createRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"']?([a-zA-Z0-9_]+)[`"']?\s*\(([\s\S]*?)\)\s*(?:ENGINE|DEFAULT|CHARACTER|COLLATE|COMMENT|;)/gi;

  let match: RegExpExecArray | null;
  while ((match = createRegex.exec(cleanSql)) !== null) {
    const tableName = match[1];
    const body = match[2];
    const lines = body.split(/\r?\n/);
    const cols: string[] = [];

    for (const rawLine of lines) {
      const line = rawLine.trim().replace(/,$/, '');
      if (!line) continue;
      const upper = line.toUpperCase();
      if (
        upper.startsWith('PRIMARY KEY') ||
        upper.startsWith('KEY ') ||
        upper.startsWith('UNIQUE KEY') ||
        upper.startsWith('UNIQUE INDEX') ||
        upper.startsWith('INDEX ') ||
        upper.startsWith('CONSTRAINT ') ||
        upper.startsWith('FOREIGN KEY') ||
        upper.startsWith('FULLTEXT ') ||
        upper.startsWith('CHECK ')
      ) {
        continue;
      }
      const colMatch = line.match(/^[`"']?([a-zA-Z0-9_]+)[`"']?\s+[a-zA-Z]+/);
      if (colMatch) {
        cols.push(colMatch[1]);
      }
    }

    if (cols.length > 0) {
      schemas.set(tableName.toLowerCase(), cols);
    }
  }

  return schemas;
}

/**
 * Parse VALUES (...), (...) tuples from an INSERT statement body
 */
function parseSqlValuesTuples(valuesBlock: string): any[][] {
  const rows: any[][] = [];
  let i = 0;
  const len = valuesBlock.length;

  while (i < len) {
    // Advance to opening '('
    while (i < len && valuesBlock[i] !== '(' && valuesBlock[i] !== ';') {
      i++;
    }
    if (i >= len || valuesBlock[i] === ';') break;

    // Now at '('
    i++; // skip '('
    const currentRow: any[] = [];
    let currentToken = '';
    let inString = false;
    let quoteChar = '';
    let wasQuoted = false;

    while (i < len) {
      const ch = valuesBlock[i];
      const next = valuesBlock[i + 1];

      if (inString) {
        if (ch === '\\' && i + 1 < len) {
          const esc = valuesBlock[i + 1];
          if (esc === 'n') currentToken += '\n';
          else if (esc === 'r') currentToken += '\r';
          else if (esc === 't') currentToken += '\t';
          else currentToken += esc;
          i += 2;
          continue;
        }
        if (ch === quoteChar && next === quoteChar) {
          currentToken += quoteChar;
          i += 2;
          continue;
        }
        if (ch === quoteChar) {
          inString = false;
          i++;
          continue;
        }
        currentToken += ch;
        i++;
        continue;
      }

      if (ch === "'" || ch === '"') {
        inString = true;
        quoteChar = ch;
        wasQuoted = true;
        i++;
        continue;
      }

      if (ch === ',' || ch === ')') {
        const trimmed = currentToken.trim();
        if (wasQuoted) {
          currentRow.push(currentToken);
        } else if (trimmed.toUpperCase() === 'NULL' || trimmed === '') {
          currentRow.push(null);
        } else if (!Number.isNaN(Number(trimmed))) {
          currentRow.push(Number(trimmed));
        } else {
          currentRow.push(trimmed);
        }

        currentToken = '';
        wasQuoted = false;

        if (ch === ')') {
          i++;
          break;
        }
        i++;
        continue;
      }

      currentToken += ch;
      i++;
    }

    if (currentRow.length > 0) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Parse SQL dump string into raw tables & normalized Sisa Uang Firestore collections
 */
export function parseMySqlToFirestoreJson(rawSql: string): SqlConversionResult {
  const cleanSql = stripSqlComments(rawSql);
  const createSchemas = extractCreateTableSchemas(cleanSql);
  const tableMap = new Map<string, ParsedSqlTable>();

  // Initialize from CREATE TABLE schemas
  for (const [tblName, cols] of createSchemas.entries()) {
    tableMap.set(tblName, {
      tableName: tblName,
      columns: cols,
      rows: [],
    });
  }

  // Match all INSERT INTO statements
  const insertRegex = /INSERT\s+(?:IGNORE\s+)?INTO\s+[`"']?([a-zA-Z0-9_]+)[`"']?\s*(\([^)]+\))?\s*VALUES\s*([\s\S]*?);/gi;
  let match: RegExpExecArray | null;

  while ((match = insertRegex.exec(cleanSql)) !== null) {
    const tableName = match[1].toLowerCase();
    const rawColsBlock = match[2];
    const valuesBlock = match[3];

    let columns: string[] = [];
    if (rawColsBlock) {
      columns = rawColsBlock
        .slice(1, -1)
        .split(',')
        .map((c) => c.trim().replace(/^[`"']|[`"']$/g, ''));
    } else if (createSchemas.has(tableName)) {
      columns = createSchemas.get(tableName)!;
    }

    const tupleRows = parseSqlValuesTuples(valuesBlock);
    if (tupleRows.length === 0) continue;

    if (columns.length === 0 && tupleRows[0]) {
      columns = tupleRows[0].map((_, idx) => `col_${idx + 1}`);
    }

    let tbl = tableMap.get(tableName);
    if (!tbl) {
      tbl = {
        tableName,
        columns,
        rows: [],
      };
      tableMap.set(tableName, tbl);
    } else if (tbl.columns.length === 0) {
      tbl.columns = columns;
    }

    for (const tuple of tupleRows) {
      const obj: Record<string, any> = {};
      columns.forEach((col, idx) => {
        obj[col] = tuple[idx] !== undefined ? tuple[idx] : null;
      });
      tbl.rows.push(obj);
    }
  }

  const rawTables = Array.from(tableMap.values()).filter((t) => t.rows.length > 0 || t.columns.length > 0);

  // =========================================================================
  // Transform CodeIgniter 4 Shield Tables & Sisa Uang Legacy Tables
  // =========================================================================
  const usersTable = tableMap.get('users')?.rows || [];
  const identitiesTable = tableMap.get('auth_identities')?.rows || [];
  const groupsTable = tableMap.get('auth_groups_users')?.rows || [];
  const loginsTable = tableMap.get('auth_logins')?.rows || [];

  const detectedShieldTables: string[] = [];
  for (const name of [
    'users',
    'auth_identities',
    'auth_groups_users',
    'auth_logins',
    'auth_token_logins',
    'auth_remember_tokens',
    'auth_permissions_users',
  ]) {
    if (tableMap.has(name)) {
      detectedShieldTables.push(name);
    }
  }

  // Index CI4 Shield auth_identities by user_id
  const identitiesByUserId = new Map<string, Record<string, any>[]>();
  let identitiesLinkedCount = 0;
  for (const ident of identitiesTable) {
    const uidKey = String(ident.user_id ?? '');
    if (!uidKey) continue;
    identitiesLinkedCount++;
    const list = identitiesByUserId.get(uidKey) || [];
    list.push(ident);
    identitiesByUserId.set(uidKey, list);
  }

  // Index CI4 Shield auth_groups_users by user_id
  const groupsByUserId = new Map<string, string[]>();
  let groupsLinkedCount = 0;
  for (const grp of groupsTable) {
    const uidKey = String(grp.user_id ?? '');
    const groupName = String(grp.group ?? '').toLowerCase();
    if (!uidKey || !groupName) continue;
    groupsLinkedCount++;
    const list = groupsByUserId.get(uidKey) || [];
    list.push(groupName);
    groupsByUserId.set(uidKey, list);
  }

  const normalizedUsers: NormalizedUserDoc[] = [];
  const legacyUserIdToUid = new Map<string, string>();
  const legacyUserIdToEmail = new Map<string, string>();
  const nowIso = new Date().toISOString();

  for (const u of usersTable) {
    const rawId = String(u.id ?? u.uid ?? Date.now());
    const userIdents = identitiesByUserId.get(rawId) || [];
    const userGroups = groupsByUserId.get(rawId) || [];

    // In CI4 Shield, email is stored in `auth_identities.secret` when `type = 'email_password'`
    let resolvedEmail = String(u.email ?? '').trim().toLowerCase();
    let resolvedProvider: 'password' | 'google' = 'password';

    for (const idRow of userIdents) {
      const idType = String(idRow.type ?? '').toLowerCase();
      const secret = String(idRow.secret ?? '').trim();
      if (!resolvedEmail && secret.includes('@')) {
        resolvedEmail = secret.toLowerCase();
      }
      if (idType.includes('google') || idType.includes('oauth')) {
        resolvedProvider = 'google';
      }
    }

    const rawUsername = String(u.username ?? u.display_name ?? u.name ?? '').trim();
    if (!resolvedEmail) {
      const safeSlug = rawUsername.toLowerCase().replace(/[^a-z0-9._-]/g, '') || `user_${rawId}`;
      resolvedEmail = `${safeSlug}@sisa-uang.id`;
    }

    const displayName = sanitizeString(
      rawUsername || resolvedEmail.split('@')[0],
      MAX_DISPLAY_NAME_LENGTH,
      `Pengguna #${rawId}`
    );

    // Role mapping from CI4 Shield groups ('superadmin', 'admin', 'user')
    const isShieldAdmin =
      userGroups.some((g) => g.includes('admin') || g.includes('super')) ||
      String(u.role ?? '').toLowerCase() === 'admin' ||
      resolvedEmail === 'vuedevo@gmail.com';

    // Status mapping from CI4 Shield (`active = 1/0`, `status = 'banned' | null`, `deleted_at`)
    const rawStatus = String(u.status ?? '').toLowerCase();
    const isBannedOrInactive =
      rawStatus === 'banned' ||
      rawStatus === 'blocked' ||
      rawStatus === 'suspended' ||
      (u.active !== undefined && u.active !== null && Number(u.active) === 0) ||
      Boolean(u.deleted_at);

    const firestoreUid = sanitizeId(
      resolvedEmail === 'vuedevo@gmail.com' ? 'admin_vuedevo_01' : `ci4_user_${rawId}`
    );

    legacyUserIdToUid.set(rawId, firestoreUid);
    legacyUserIdToEmail.set(rawId, resolvedEmail);

    normalizedUsers.push({
      uid: firestoreUid,
      legacyId: rawId,
      email: sanitizeString(resolvedEmail, MAX_EMAIL_LENGTH, 'user@sisa-uang.id'),
      displayName,
      role: isShieldAdmin ? 'admin' : 'user',
      status: isBannedOrInactive ? 'blocked' : 'active',
      authProvider: resolvedProvider,
      currency: u.currency === 'USD' ? 'USD' : 'IDR',
      shieldGroup: userGroups.join(', ') || 'user',
      shieldActive: u.active !== undefined && u.active !== null ? Number(u.active) : 1,
      createdAt: String(u.created_at ?? u.createdAt ?? nowIso),
      updatedAt: String(u.updated_at ?? u.updatedAt ?? nowIso),
    });
  }

  // Transform Wallets (`wallets`, `dompet`, `rekening`, `accounts`)
  const walletSourceRows =
    tableMap.get('wallets')?.rows ||
    tableMap.get('dompet')?.rows ||
    tableMap.get('rekening')?.rows ||
    tableMap.get('accounts')?.rows ||
    [];

  const normalizedWallets: NormalizedWalletDoc[] = [];
  const legacyWalletIdMap = new Map<string, { id: string; name: string }>();

  for (const w of walletSourceRows) {
    const rawId = String(w.id ?? w.wallet_id ?? Date.now());
    const rawOwner = String(w.user_id ?? w.owner_id ?? w.ownerId ?? '1');
    const ownerUid =
      legacyUserIdToUid.get(rawOwner) || sanitizeId(`ci4_user_${rawOwner}`);
    const walletId = sanitizeId(`ci4_wallet_${rawId}`);
    const name = sanitizeString(
      w.name ?? w.nama_dompet ?? w.nama ?? `Dompet #${rawId}`,
      MAX_WALLET_NAME_LENGTH,
      'Dompet Utama'
    );

    const rawType = String(w.type ?? w.jenis ?? 'bank').toLowerCase();
    let mappedType: NormalizedWalletDoc['type'] = 'bank';
    if (rawType.includes('cash') || rawType.includes('tunai')) mappedType = 'cash';
    else if (rawType.includes('ewallet') || rawType.includes('gopay') || rawType.includes('ovo') || rawType.includes('dana'))
      mappedType = 'ewallet';
    else if (rawType.includes('invest') || rawType.includes('reksa') || rawType.includes('saham'))
      mappedType = 'investment';
    else if (rawType.includes('credit') || rawType.includes('kredit'))
      mappedType = 'credit';

    const balance = Number(w.balance ?? w.saldo ?? w.initial_balance ?? 0) || 0;
    const color = sanitizeString(w.color ?? w.warna ?? 'emerald', 20, 'emerald');

    legacyWalletIdMap.set(rawId, { id: walletId, name });

    normalizedWallets.push({
      id: walletId,
      ownerId: ownerUid,
      name,
      type: mappedType,
      balance,
      color,
      createdAt: String(w.created_at ?? w.createdAt ?? nowIso),
      updatedAt: String(w.updated_at ?? w.updatedAt ?? nowIso),
    });
  }

  // Transform Transactions (`transactions`, `transaksi`, `catatan`, `arus_kas`)
  const txSourceRows =
    tableMap.get('transactions')?.rows ||
    tableMap.get('transaksi')?.rows ||
    tableMap.get('catatan')?.rows ||
    tableMap.get('arus_kas')?.rows ||
    [];

  const normalizedTransactions: NormalizedTransactionDoc[] = [];

  for (const t of txSourceRows) {
    const rawId = String(t.id ?? t.transaction_id ?? Date.now());
    const rawOwner = String(t.user_id ?? t.owner_id ?? t.ownerId ?? '1');
    const ownerUid =
      legacyUserIdToUid.get(rawOwner) || sanitizeId(`ci4_user_${rawOwner}`);
    const rawWalletId = String(t.wallet_id ?? t.dompet_id ?? t.account_id ?? '1');
    const walletInfo = legacyWalletIdMap.get(rawWalletId) || {
      id: sanitizeId(`ci4_wallet_${rawWalletId}`),
      name: sanitizeString(t.wallet_name ?? t.nama_dompet ?? 'Rekening Utama', MAX_WALLET_NAME_LENGTH, 'Rekening Utama'),
    };

    const rawType = String(t.type ?? t.jenis ?? 'expense').toLowerCase();
    let mappedType: NormalizedTransactionDoc['type'] = 'expense';
    if (rawType.includes('in') || rawType.includes('masuk') || rawType.includes('pemasukan')) {
      mappedType = 'income';
    } else if (rawType.includes('trans')) {
      mappedType = 'transfer';
    }

    const amount = Math.max(1, Math.abs(Number(t.amount ?? t.nominal ?? t.jumlah ?? 10000) || 10000));
    const category = sanitizeString(
      t.category ?? t.kategori ?? (mappedType === 'income' ? 'Gaji Utama' : 'Kebutuhan Harian'),
      MAX_CATEGORY_LENGTH,
      'Lainnya'
    );
    const note = sanitizeString(
      t.note ?? t.catatan ?? t.deskripsi ?? t.keterangan ?? category,
      MAX_NOTE_LENGTH,
      category
    );
    const rawDate = String(t.date ?? t.tanggal ?? t.created_at ?? nowIso.slice(0, 10)).slice(0, 10);
    const date = rawDate.length >= 8 ? rawDate : nowIso.slice(0, 10);

    normalizedTransactions.push({
      id: sanitizeId(`ci4_tx_${rawId}`),
      ownerId: ownerUid,
      walletId: walletInfo.id,
      walletName: walletInfo.name,
      type: mappedType,
      category,
      amount,
      note,
      date,
      createdAt: String(t.created_at ?? t.createdAt ?? nowIso),
      updatedAt: String(t.updated_at ?? t.updatedAt ?? nowIso),
    });
  }

  // Transform Budgets (`budgets`, `anggaran`)
  const budgetSourceRows =
    tableMap.get('budgets')?.rows ||
    tableMap.get('anggaran')?.rows ||
    [];

  const normalizedBudgets: NormalizedBudgetDoc[] = [];

  for (const b of budgetSourceRows) {
    const rawId = String(b.id ?? b.budget_id ?? Date.now());
    const rawOwner = String(b.user_id ?? b.owner_id ?? b.ownerId ?? '1');
    const ownerUid =
      legacyUserIdToUid.get(rawOwner) || sanitizeId(`ci4_user_${rawOwner}`);
    const category = sanitizeString(
      b.category ?? b.kategori ?? 'Kebutuhan Bulanan',
      MAX_CATEGORY_LENGTH,
      'Kebutuhan Bulanan'
    );
    const limitAmount = Math.max(10000, Number(b.limit_amount ?? b.batas ?? b.nominal ?? 1000000) || 1000000);
    const spentAmount = Math.max(0, Number(b.spent_amount ?? b.terpakai ?? 0) || 0);
    const period = sanitizeString(String(b.period ?? b.periode ?? '2026-10'), 20, '2026-10');

    normalizedBudgets.push({
      id: sanitizeId(`ci4_bg_${rawId}`),
      ownerId: ownerUid,
      category,
      limitAmount,
      spentAmount,
      period,
      createdAt: String(b.created_at ?? b.createdAt ?? nowIso),
      updatedAt: String(b.updated_at ?? b.updatedAt ?? nowIso),
    });
  }

  // Transform CI4 Shield `auth_logins` into Sisa Uang `activity_logs`
  const normalizedLogs: NormalizedActivityLogDoc[] = [];
  for (const lg of loginsTable) {
    const rawId = String(lg.id ?? Date.now());
    const rawUserId = String(lg.user_id ?? '');
    const actorUid =
      (rawUserId && legacyUserIdToUid.get(rawUserId)) ||
      sanitizeId(`ci4_user_${rawUserId || 'guest'}`);
    const actorEmail = sanitizeString(
      String(lg.identifier ?? legacyUserIdToEmail.get(rawUserId) ?? 'user@sisa-uang.id'),
      MAX_EMAIL_LENGTH,
      'user@sisa-uang.id'
    );
    const success = Number(lg.success ?? 1) === 1;
    const ip = String(lg.ip_address ?? '127.0.0.1');

    normalizedLogs.push({
      id: sanitizeId(`ci4_log_${rawId}`),
      actorUid,
      actorEmail,
      action: success ? 'ci4_shield_login_success' : 'ci4_shield_login_failed',
      detail: sanitizeString(
        `[Migrasi CI4 Shield] ${success ? 'Login berhasil' : 'Gagal login'} oleh ${actorEmail} dari IP ${ip}.`,
        MAX_LOG_DETAIL_LENGTH,
        'Log autentikasi CodeIgniter 4 Shield'
      ),
      severity: success ? 'info' : 'warning',
      createdAt: String(lg.date ?? nowIso),
    });
  }

  return {
    rawTables,
    firestoreCollections: {
      users: normalizedUsers,
      wallets: normalizedWallets,
      transactions: normalizedTransactions,
      budgets: normalizedBudgets,
      activity_logs: normalizedLogs,
    },
    shieldSummary: {
      detectedShieldTables,
      mergedUsersCount: normalizedUsers.length,
      identitiesLinkedCount,
      groupsLinkedCount,
    },
  };
}

/**
 * Sample CodeIgniter 4 Shield + Sisa Uang MySQL Dump for instant 1-click testing
 */
export const SAMPLE_CI4_SHIELD_SQL = `-- Sisa Uang Legacy MySQL Dump (CodeIgniter 4 Shield Auth + Financial Tables)
-- Server version: 8.0.36-MySQL

CREATE TABLE \`users\` (
  \`id\` int(11) unsigned NOT NULL AUTO_INCREMENT,
  \`username\` varchar(30) DEFAULT NULL,
  \`status\` varchar(255) DEFAULT NULL,
  \`status_message\` varchar(255) DEFAULT NULL,
  \`active\` tinyint(1) NOT NULL DEFAULT 0,
  \`last_active\` datetime DEFAULT NULL,
  \`created_at\` datetime DEFAULT NULL,
  \`updated_at\` datetime DEFAULT NULL,
  \`deleted_at\` datetime DEFAULT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO \`users\` (\`id\`, \`username\`, \`status\`, \`status_message\`, \`active\`, \`last_active\`, \`created_at\`, \`updated_at\`, \`deleted_at\`) VALUES
(1, 'vuedevo', NULL, NULL, 1, '2026-10-05 09:00:00', '2025-01-10 08:00:00', '2026-10-05 09:00:00', NULL),
(2, 'andika_pratama', NULL, NULL, 1, '2026-10-04 19:20:00', '2025-05-12 10:15:00', '2026-10-04 19:20:00', NULL),
(3, 'siti_rahmawati', NULL, NULL, 1, '2026-10-05 07:45:00', '2025-07-20 14:30:00', '2026-10-05 07:45:00', NULL),
(4, 'doni_kusuma', 'banned', 'Pelanggaran ketentuan layanan', 0, '2026-09-15 11:10:00', '2025-08-01 09:00:00', '2026-09-15 11:10:00', NULL);

CREATE TABLE \`auth_identities\` (
  \`id\` int(11) unsigned NOT NULL AUTO_INCREMENT,
  \`user_id\` int(11) unsigned NOT NULL,
  \`type\` varchar(255) NOT NULL,
  \`name\` varchar(255) DEFAULT NULL,
  \`secret\` varchar(255) NOT NULL,
  \`secret2\` varchar(255) DEFAULT NULL,
  \`expires\` datetime DEFAULT NULL,
  \`extra\` text DEFAULT NULL,
  \`force_reset\` tinyint(1) NOT NULL DEFAULT 0,
  \`last_used_at\` datetime DEFAULT NULL,
  \`created_at\` datetime DEFAULT NULL,
  \`updated_at\` datetime DEFAULT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO \`auth_identities\` (\`id\`, \`user_id\`, \`type\`, \`name\`, \`secret\`, \`secret2\`, \`expires\`, \`extra\`, \`force_reset\`, \`last_used_at\`, \`created_at\`, \`updated_at\`) VALUES
(1, 1, 'email_password', NULL, 'vuedevo@gmail.com', '$2y$10$shieldHashSuperAdmin999', NULL, NULL, 0, '2026-10-05 09:00:00', '2025-01-10 08:00:00', '2026-10-05 09:00:00'),
(2, 2, 'email_password', NULL, 'andika.pratama@sisa-uang.id', '$2y$10$shieldHashAndika123', NULL, NULL, 0, '2026-10-04 19:20:00', '2025-05-12 10:15:00', '2026-10-04 19:20:00'),
(3, 3, 'google', 'Siti Rahmawati', 'siti.rahmawati@gmail.com', NULL, NULL, NULL, 0, '2026-10-05 07:45:00', '2025-07-20 14:30:00', '2026-10-05 07:45:00'),
(4, 4, 'email_password', NULL, 'doni.kusuma@outlook.com', '$2y$10$shieldHashDoni456', NULL, NULL, 0, '2026-09-15 11:10:00', '2025-08-01 09:00:00', '2026-09-15 11:10:00');

CREATE TABLE \`auth_groups_users\` (
  \`id\` int(11) unsigned NOT NULL AUTO_INCREMENT,
  \`user_id\` int(11) unsigned NOT NULL,
  \`group\` varchar(255) NOT NULL,
  \`created_at\` datetime NOT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO \`auth_groups_users\` (\`id\`, \`user_id\`, \`group\`, \`created_at\`) VALUES
(1, 1, 'superadmin', '2025-01-10 08:00:00'),
(2, 2, 'user', '2025-05-12 10:15:00'),
(3, 3, 'user', '2025-07-20 14:30:00'),
(4, 4, 'user', '2025-08-01 09:00:00');

CREATE TABLE \`auth_logins\` (
  \`id\` int(11) unsigned NOT NULL AUTO_INCREMENT,
  \`ip_address\` varchar(255) NOT NULL,
  \`user_agent\` varchar(255) DEFAULT NULL,
  \`id_type\` varchar(255) NOT NULL,
  \`identifier\` varchar(255) NOT NULL,
  \`user_id\` int(11) unsigned DEFAULT NULL,
  \`date\` datetime NOT NULL,
  \`success\` tinyint(1) NOT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO \`auth_logins\` (\`id\`, \`ip_address\`, \`user_agent\`, \`id_type\`, \`identifier\`, \`user_id\`, \`date\`, \`success\`) VALUES
(1, '103.144.12.88', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)', 'email_password', 'andika.pratama@sisa-uang.id', 2, '2026-10-04 19:20:00', 1),
(2, '182.253.40.19', 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', 'google', 'siti.rahmawati@gmail.com', 3, '2026-10-05 07:45:00', 1),
(3, '45.112.90.4', 'Mozilla/5.0 (Windows NT 10.0)', 'email_password', 'doni.kusuma@outlook.com', 4, '2026-09-15 11:10:00', 0);

CREATE TABLE \`wallets\` (
  \`id\` int(11) unsigned NOT NULL AUTO_INCREMENT,
  \`user_id\` int(11) unsigned NOT NULL,
  \`name\` varchar(60) NOT NULL,
  \`type\` varchar(30) NOT NULL,
  \`balance\` decimal(15,2) NOT NULL DEFAULT 0.00,
  \`color\` varchar(20) DEFAULT 'emerald',
  \`created_at\` datetime DEFAULT NULL,
  \`updated_at\` datetime DEFAULT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO \`wallets\` (\`id\`, \`user_id\`, \`name\`, \`type\`, \`balance\`, \`color\`, \`created_at\`, \`updated_at\`) VALUES
(101, 2, 'Bank Mandiri Utama', 'bank', 18450000, 'emerald', '2026-01-01 10:00:00', '2026-10-05 08:00:00'),
(102, 2, 'GoPay Harian', 'ewallet', 750000, 'sky', '2026-01-01 10:00:00', '2026-10-05 08:00:00'),
(103, 3, 'BCA Prioritas', 'bank', 34200000, 'indigo', '2026-02-15 09:00:00', '2026-10-05 08:00:00');

CREATE TABLE \`transactions\` (
  \`id\` int(11) unsigned NOT NULL AUTO_INCREMENT,
  \`user_id\` int(11) unsigned NOT NULL,
  \`wallet_id\` int(11) unsigned NOT NULL,
  \`type\` varchar(20) NOT NULL,
  \`category\` varchar(50) NOT NULL,
  \`amount\` decimal(15,2) NOT NULL,
  \`note\` varchar(200) DEFAULT NULL,
  \`date\` date NOT NULL,
  \`created_at\` datetime DEFAULT NULL,
  \`updated_at\` datetime DEFAULT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO \`transactions\` (\`id\`, \`user_id\`, \`wallet_id\`, \`type\`, \`category\`, \`amount\`, \`note\`, \`date\`, \`created_at\`, \`updated_at\`) VALUES
(501, 2, 101, 'income', 'Gaji Utama', 15000000, 'Gaji bulanan Oktober dari perusahaan', '2026-10-01', '2026-10-01 09:00:00', '2026-10-01 09:00:00'),
(502, 2, 102, 'expense', 'Makanan & Minuman', 145000, 'Makan malam keluarga akhir pekan', '2026-10-03', '2026-10-03 20:00:00', '2026-10-03 20:00:00'),
(503, 3, 103, 'income', 'Proyek & Freelance', 22000000, 'Pembayaran proyek aplikasi klien', '2026-10-02', '2026-10-02 15:00:00', '2026-10-02 15:00:00'),
(504, 3, 103, 'expense', 'Tagihan & Utilitas', 980000, 'Tagihan internet & listrik bulanan', '2026-10-04', '2026-10-04 11:00:00', '2026-10-04 11:00:00');

CREATE TABLE \`budgets\` (
  \`id\` int(11) unsigned NOT NULL AUTO_INCREMENT,
  \`user_id\` int(11) unsigned NOT NULL,
  \`category\` varchar(50) NOT NULL,
  \`limit_amount\` decimal(15,2) NOT NULL,
  \`spent_amount\` decimal(15,2) NOT NULL DEFAULT 0.00,
  \`period\` varchar(20) NOT NULL,
  \`created_at\` datetime DEFAULT NULL,
  \`updated_at\` datetime DEFAULT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO \`budgets\` (\`id\`, \`user_id\`, \`category\`, \`limit_amount\`, \`spent_amount\`, \`period\`, \`created_at\`, \`updated_at\`) VALUES
(301, 2, 'Makanan & Minuman', 3500000, 145000, '2026-10', '2026-10-01 08:00:00', '2026-10-03 20:00:00'),
(302, 3, 'Tagihan & Utilitas', 2500000, 980000, '2026-10', '2026-10-01 08:00:00', '2026-10-04 11:00:00');
`;
