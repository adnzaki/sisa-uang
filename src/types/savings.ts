export interface SavingsGoalItem {
  id: string;
  ownerId: string;
  name: string;
  category: string;
  targetAmount: number;
  deadline?: string | null;
  note?: string;
  color?: string;
  reminderEnabled: boolean;
  reminderDays: number[];
  reminderTime: string;
  reminderAmount?: number | null;
  lastRemindedDate?: string | null;
  lastSkippedDate?: string | null;
  lastPushNotifiedDate?: string | null;
  snoozedUntil?: string | null;
  deleted?: boolean;
  deletedAt?: any;
  createdAt?: any;
  updatedAt?: any;
}

export interface SavingsEntryItem {
  id: string;
  ownerId: string;
  savingsId: string;
  savingsName?: string;
  type: 'deposit' | 'withdraw';
  walletId: string;
  walletName: string;
  fundOwnerId?: string;
  fundOwnerName?: string;
  amount: number;
  date: string; // YYYY-MM-DD
  note: string;
  relatedTransactionId?: string | null;
  deleted?: boolean;
  deletedAt?: any;
  createdAt?: any;
  updatedAt?: any;
}

export interface SavingsCacheData {
  goals: SavingsGoalItem[];
  entries: SavingsEntryItem[];
  fetchedAt: number;
  expiresAt: number;
}

export interface SavingsHolderBreakdown {
  walletId: string;
  walletName: string;
  fundOwnerId: string;
  fundOwnerName: string;
  amount: number;
}

export interface SavingsWalletBreakdown {
  walletId: string;
  walletName: string;
  amount: number;
}

export const SAVINGS_CATEGORIES: string[] = [
  'Elektronik & Gadget',
  'Dana Darurat',
  'Kendaraan',
  'Properti & Hunian',
  'Liburan & Travel',
  'Pendidikan',
  'Kesehatan',
  'Pernikahan',
  'Investasi & Modal',
  'Hadiah & Sosial',
  'Lainnya',
];

export const SAVINGS_COLOR_OPTIONS: { value: string; label: string; dotClass: string }[] = [
  { value: 'emerald', label: 'Emerald', dotClass: 'bg-emerald-500' },
  { value: 'teal', label: 'Teal', dotClass: 'bg-teal-500' },
  { value: 'indigo', label: 'Indigo', dotClass: 'bg-indigo-500' },
  { value: 'blue', label: 'Biru', dotClass: 'bg-blue-500' },
  { value: 'amber', label: 'Amber', dotClass: 'bg-amber-500' },
  { value: 'rose', label: 'Rose', dotClass: 'bg-rose-500' },
  { value: 'violet', label: 'Violet', dotClass: 'bg-violet-500' },
];
