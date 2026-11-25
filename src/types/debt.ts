export type DebtType = 'debt' | 'receivable';

export interface DebtItem {
  id: string;
  ownerId: string;
  type: DebtType;
  description: string;
  amount: number;
  walletId: string;
  walletName: string;
  fundOwnerId?: string;
  fundOwnerName?: string;
  date: string; // YYYY-MM-DD initial transaction date
  deadline?: string | null; // YYYY-MM-DD optional due date
  note?: string;
  color: string;
  relatedTransactionId?: string | null;
  syncInitialTransaction?: boolean;
  reminderEnabled: boolean;
  reminderDays: number[]; // Day(s) of month: 1-31
  reminderTime: string; // HH:mm
  reminderAmount?: number | null;
  lastRemindedDate?: string | null; // YYYY-MM-DD
  lastSkippedDate?: string | null; // YYYY-MM-DD
  lastPushNotifiedDate?: string | null; // YYYY-MM-DD
  snoozedUntil?: string | null; // ISO timestamp
  deleted?: boolean;
  deletedAt?: string | null;
  createdAt?: string;
  updatedAt: string;
}

export interface DebtEntryItem {
  id: string;
  ownerId: string;
  debtId: string;
  debtDescription?: string;
  debtType?: DebtType;
  walletId: string;
  walletName: string;
  fundOwnerId?: string;
  fundOwnerName?: string;
  amount: number;
  date: string; // YYYY-MM-DD
  note: string;
  relatedTransactionId?: string | null;
  deleted?: boolean;
  deletedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface DebtCacheData {
  debts: DebtItem[];
  entries: DebtEntryItem[];
  updatedAt: number;
}

export const DEBT_TX_CATEGORIES = {
  debtCreate: 'Penerimaan Hutang',
  debtPay: 'Pembayaran Hutang',
  receivableCreate: 'Pemberian Utang',
  receivableReceive: 'Penerimaan Piutang',
} as const;

export const DEBT_COLOR_OPTIONS = [
  { value: 'rose', label: 'Merah Muda / Rose', hex: '#F43F5E' },
  { value: 'emerald', label: 'Hijau Emerald', hex: '#10B981' },
  { value: 'teal', label: 'Tosca / Teal', hex: '#14B8A6' },
  { value: 'indigo', label: 'Indigo', hex: '#6366F1' },
  { value: 'blue', label: 'Biru', hex: '#3B82F6' },
  { value: 'amber', label: 'Kuning / Amber', hex: '#F59E0B' },
  { value: 'violet', label: 'Ungu / Violet', hex: '#8B5CF6' },
];
