/**
 * Firestore Security Rules Test Suite (Dirty Dozen Verification)
 * Verifies that all 12 adversarial payloads in security_spec.md return PERMISSION_DENIED.
 */

export interface DirtyDozenTestCase {
  id: number;
  name: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  auth: {
    uid: string;
    email?: string;
    email_verified?: boolean;
  } | null;
  payload?: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED';
}

export const dirtyDozenTestSuite: DirtyDozenTestCase[] = [
  {
    id: 1,
    name: 'Shadow Field Injection on User Profile',
    operation: 'create',
    path: '/users/user_123',
    auth: { uid: 'user_123', email: 'user@example.com', email_verified: true },
    payload: {
      uid: 'user_123',
      email: 'user@example.com',
      displayName: 'User',
      role: 'user',
      status: 'active',
      authProvider: 'password',
      currency: 'IDR',
      isSuperVerified: true,
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Self-Assigned Admin Role by Non-Admin',
    operation: 'create',
    path: '/users/user_123',
    auth: { uid: 'user_123', email: 'attacker@example.com', email_verified: true },
    payload: {
      uid: 'user_123',
      email: 'attacker@example.com',
      displayName: 'Attacker',
      role: 'admin',
      status: 'active',
      authProvider: 'password',
      currency: 'IDR',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Self-Unblock Attempt by Blocked User',
    operation: 'update',
    path: '/users/user_123',
    auth: { uid: 'user_123', email: 'blocked@example.com', email_verified: true },
    payload: {
      status: 'active',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Unverified Admin Email Spoof',
    operation: 'list',
    path: '/users',
    auth: { uid: 'spoof_1', email: 'vuedevo@gmail.com', email_verified: false },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Cross-User PII Harvest on /users/{otherUid}',
    operation: 'get',
    path: '/users/user_999',
    auth: { uid: 'user_123', email: 'user@example.com', email_verified: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Orphaned Transaction Creation with Foreign Wallet ID',
    operation: 'create',
    path: '/transactions/tx_1',
    auth: { uid: 'user_123', email: 'user@example.com', email_verified: true },
    payload: {
      ownerId: 'user_123',
      walletId: 'foreign_wallet_999',
      walletName: 'BCA',
      type: 'expense',
      category: 'Makanan',
      amount: 50000,
      note: 'Lunch',
      date: '2026-10-05',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Identity Spoofing on Wallet Creation',
    operation: 'create',
    path: '/wallets/wallet_1',
    auth: { uid: 'user_123', email: 'user@example.com', email_verified: true },
    payload: {
      ownerId: 'victim_uid',
      name: 'Dompet Palsu',
      type: 'cash',
      balance: 1000000,
      color: 'emerald',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Immutable Field Mutation on Wallet Update',
    operation: 'update',
    path: '/wallets/wallet_1',
    auth: { uid: 'user_123', email: 'user@example.com', email_verified: true },
    payload: {
      ownerId: 'another_user',
      balance: 999999,
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Denial-of-Wallet Oversized Note String',
    operation: 'create',
    path: '/transactions/tx_2',
    auth: { uid: 'user_123', email: 'user@example.com', email_verified: true },
    payload: {
      ownerId: 'user_123',
      walletId: 'wallet_1',
      walletName: 'Cash',
      type: 'expense',
      category: 'Lainnya',
      amount: 10000,
      note: 'X'.repeat(250),
      date: '2026-10-05',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'ID Poisoning Attack with Invalid Characters',
    operation: 'create',
    path: '/wallets/invalid$id!99',
    auth: { uid: 'user_123', email: 'user@example.com', email_verified: true },
    payload: {
      ownerId: 'user_123',
      name: 'Cash',
      type: 'cash',
      balance: 0,
      color: 'slate',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Audit Log Tampering via Update',
    operation: 'update',
    path: '/activity_logs/log_1',
    auth: { uid: 'user_123', email: 'user@example.com', email_verified: true },
    payload: {
      action: 'modified',
      severity: 'info',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Unauthorized Security Alert Mutation by Non-Admin',
    operation: 'update',
    path: '/security_alerts/alert_1',
    auth: { uid: 'user_123', email: 'user@example.com', email_verified: true },
    payload: {
      status: 'resolved',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
];
