export interface AutomationItem {
  id: string;
  ownerId: string;
  name: string;
  type: 'income' | 'expense' | 'transfer';
  walletId: string;
  walletName: string;
  fundOwnerId?: string;
  fundOwnerName?: string;
  toWalletId?: string;
  toWalletName?: string;
  toFundOwnerId?: string;
  toFundOwnerName?: string;
  category: string;
  amount: number;
  adminFee?: number;
  note: string;
  scheduleDays: number[]; // 1 to 31
  executionTime: string; // HH:mm format, e.g. "09:00"
  mode: 'with_confirmation' | 'without_confirmation';
  isActive: boolean;
  lastExecutedDate?: string; // YYYY-MM-DD
  lastCancelledDate?: string; // YYYY-MM-DD
  snoozedUntil?: string; // ISO timestamp
  deleted?: boolean;
  deletedAt?: any;
  createdAt?: any;
  updatedAt?: any;
}

export interface AutomationsCacheData {
  rules: AutomationItem[];
  fetchedAt: number;
  expiresAt: number;
  hasRules: boolean;
}

export type SnoozeDurationKey =
  | '1h'
  | '2h'
  | '3h'
  | '4h'
  | '5h'
  | '1d'
  | '2d'
  | '3d'
  | '4d'
  | '5d';

export interface SnoozeOption {
  key: SnoozeDurationKey;
  label: string;
  durationMs: number;
}

export const SNOOZE_OPTIONS: SnoozeOption[] = [
  { key: '1h', label: '1 Jam', durationMs: 1 * 60 * 60 * 1000 },
  { key: '2h', label: '2 Jam', durationMs: 2 * 60 * 60 * 1000 },
  { key: '3h', label: '3 Jam', durationMs: 3 * 60 * 60 * 1000 },
  { key: '4h', label: '4 Jam', durationMs: 4 * 60 * 60 * 1000 },
  { key: '5h', label: '5 Jam', durationMs: 5 * 60 * 60 * 1000 },
  { key: '1d', label: 'Besok (1 Hari)', durationMs: 24 * 60 * 60 * 1000 },
  { key: '2d', label: '2 Hari', durationMs: 2 * 24 * 60 * 60 * 1000 },
  { key: '3d', label: '3 Hari', durationMs: 3 * 24 * 60 * 60 * 1000 },
  { key: '4d', label: '4 Hari', durationMs: 4 * 24 * 60 * 60 * 1000 },
  { key: '5d', label: '5 Hari', durationMs: 5 * 24 * 60 * 60 * 1000 },
];
