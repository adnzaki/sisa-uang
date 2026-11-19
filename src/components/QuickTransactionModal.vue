<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  Check,
  Trash2,
  ShieldAlert,
  AlertTriangle,
  Target,
  ArrowLeft,
} from 'lucide-vue-next';
import {
  useFinanceStore,
  formatHolderName,
  formatPeriodLabel,
  MAX_STRICT_ANNUAL_REVISIONS,
} from '../stores/finance';
import { useSavingsStore } from '../stores/savings';
import { useThemeStore } from '../stores/theme';
import { useNotificationStore } from '../stores/notification';
import AppModal from './AppModal.vue';
import CustomSelect, { type SelectOptionItem } from './CustomSelect.vue';
import MaterialDatePicker from './MaterialDatePicker.vue';

const { t } = useI18n();
const financeStore = useFinanceStore();
const savingsStore = useSavingsStore();
const themeStore = useThemeStore();
const notificationStore = useNotificationStore();

const txType = ref<'expense' | 'income' | 'transfer'>('expense');
// Step 1: Pilih Sumber Dana (Wallet)
const walletId = ref<string>('');
// Step 2: Pilih Pemilik Dana (Fund Owner)
const fundOwnerId = ref<string>('');

// Transfer Destination
const toWalletId = ref<string>('');
const toFundOwnerId = ref<string>('');

// Step 3: Input Transaksi (Category, Amount, AdminFee, Date, Note)
const amount = ref<number | ''>('');
const adminFee = ref<number | ''>('');
const category = ref<string>('');
const note = ref<string>('');
const date = ref<string>(new Date().toISOString().slice(0, 10));
const errorMsg = ref<string | null>(null);
const isSubmitting = ref(false);
const isInitializing = ref(false);

const isEditMode = computed(() => Boolean(financeStore.editingTransaction));

// =========================================================================
// Savings ("Saldo Bergerak") Shortfall Interception Workflow State
// =========================================================================
type ShortfallStep = 'form' | 'ask' | 'pick' | 'confirm';

interface EligibleGoalAllocation {
  goalId: string;
  goalName: string;
  goalCategory: string;
  targetAmount: number;
  collectedAmount: number;
  availableFromWallet: number;
  targetFundOwnerId: string;
  targetFundOwnerName: string;
  selected: boolean;
  drawAmount: number;
}

const shortfallStep = ref<ShortfallStep>('form');
const shortfallContext = ref<{
  walletId: string;
  walletName: string;
  fundOwnerId: string;
  fundOwnerName: string;
  totalBalance: number;
  savedInSavings: number;
  operationalBalance: number;
  outgoingAmount: number;
  shortfallAmount: number;
  pendingPayload: any;
} | null>(null);
const eligibleGoals = ref<EligibleGoalAllocation[]>([]);
const selectedGoalIds = ref<string[]>([]);

const selectedGoalTotalAvailable = computed(() => {
  return eligibleGoals.value
    .filter((g) => selectedGoalIds.value.includes(g.goalId))
    .reduce((sum, g) => sum + g.availableFromWallet, 0);
});

const shortfallAllocations = computed(() => {
  const needed = shortfallContext.value?.shortfallAmount || 0;
  let remaining = needed;
  const result: {
    goalId: string;
    goalName: string;
    targetFundOwnerId: string;
    targetFundOwnerName: string;
    availableBefore: number;
    drawAmount: number;
    remainingAfter: number;
  }[] = [];

  for (const gId of selectedGoalIds.value) {
    if (remaining <= 0) break;
    const item = eligibleGoals.value.find((e) => e.goalId === gId);
    if (!item || item.availableFromWallet <= 0) continue;
    const draw = Math.min(remaining, item.availableFromWallet);
    result.push({
      goalId: item.goalId,
      goalName: item.goalName,
      targetFundOwnerId: item.targetFundOwnerId,
      targetFundOwnerName: item.targetFundOwnerName,
      availableBefore: item.availableFromWallet,
      drawAmount: draw,
      remainingAfter: Math.max(0, item.availableFromWallet - draw),
    });
    remaining -= draw;
  }
  return result;
});

const selectedTotalDrawAmount = computed(() =>
  shortfallAllocations.value.reduce((s, a) => s + a.drawAmount, 0)
);

function resetShortfallFlow() {
  shortfallStep.value = 'form';
  shortfallContext.value = null;
  eligibleGoals.value = [];
  selectedGoalIds.value = [];
}

// Display operational vs savings info below Source Holder when selected wallet has savings
const selectedSourceBalanceSummary = computed(() => {
  if (!walletId.value || txType.value === 'income') return null;
  const selectedWallet = financeStore.wallets.find((w) => w.id === walletId.value);
  if (!selectedWallet) return null;

  const holder = availableSourceHolders.value.find((h) => h.id === fundOwnerId.value);
  const holderSaved = holder
    ? savingsStore.getHolderSavingsBalance(walletId.value, holder.id)
    : savingsStore.getWalletSavingsBalance(walletId.value);
  const walletSaved = savingsStore.getWalletSavingsBalance(walletId.value);

  const saved = holderSaved > 0 ? holderSaved : walletSaved;
  if (saved <= 0) return null;

  const total = holderSaved > 0 && holder ? Number(holder.balance || 0) : Number(selectedWallet.balance || 0);
  const operational = total - saved;

  return {
    walletName: selectedWallet.name,
    holderName: holder ? formatHolderName(holder.holderName) : '',
    total,
    saved,
    operational,
  };
});

const earlyAnnualAllocationNotice = computed(() => {
  if (txType.value !== 'expense') return null;
  const cat = category.value.trim();
  const txDate = String(date.value || '').slice(0, 10);
  if (!cat || txDate.length < 7) return null;

  const txYear = txDate.slice(0, 4);
  const txPeriod = txDate.slice(0, 7);
  const meta = financeStore.getAnnualBudgetMeta(txYear);
  if (!meta) return null;

  const annualCat = financeStore
    .getAnnualCategoryBudgetsByYear(txYear)
    .find((item) => item.category.trim().toLowerCase() === cat.toLowerCase());
  if (!annualCat) return null;

  if (meta.status !== 'final') {
    return {
      isDraftBlocked: true,
      isRevisionSession: meta.isRevisionSession,
      mode: meta.mode,
      year: txYear,
      category: annualCat.category,
      txPeriodLabel: formatPeriodLabel(txPeriod),
      firstPeriodLabel: annualCat.firstAllocatedPeriod
        ? formatPeriodLabel(annualCat.firstAllocatedPeriod)
        : '-',
      allocMonthsLabels: annualCat.allocatedMonthsList
        .map((mm) => formatPeriodLabel(`${txYear}-${mm}`))
        .join(', '),
      remainingRevs: Math.max(0, MAX_STRICT_ANNUAL_REVISIONS - meta.revisionCount),
    };
  }

  if (annualCat.firstAllocatedPeriod && txPeriod < annualCat.firstAllocatedPeriod) {
    const firstPeriodLabel = formatPeriodLabel(annualCat.firstAllocatedPeriod);
    const txPeriodLabel = formatPeriodLabel(txPeriod);
    const allocMonthsLabels = annualCat.allocatedMonthsList
      .map((mm) => formatPeriodLabel(`${txYear}-${mm}`))
      .join(', ');
    const remainingRevs = Math.max(0, MAX_STRICT_ANNUAL_REVISIONS - meta.revisionCount);

    return {
      isDraftBlocked: false,
      isRevisionSession: false,
      mode: meta.mode,
      year: txYear,
      category: annualCat.category,
      txPeriodLabel,
      firstPeriodLabel,
      allocMonthsLabels,
      remainingRevs,
    };
  }
  return null;
});

function formatNominalDisplay(val: number | string | ''): string {
  const digits = String(val ?? '')
    .replace(/\D/g, '')
    .replace(/^0+/, '');
  if (!digits) return '';
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

const amountDisplay = computed(() => formatNominalDisplay(amount.value));
const adminFeeDisplay = computed(() => formatNominalDisplay(adminFee.value));

function applyFormattedNominalInput(
  event: Event,
  targetRef: { value: number | '' }
) {
  const input = event.target as HTMLInputElement;
  const rawValue = input.value;
  const selectionStart = input.selectionStart ?? rawValue.length;
  const digitsBeforeCursor = rawValue
    .slice(0, selectionStart)
    .replace(/\D/g, '')
    .replace(/^0+/, '').length;

  const cleanDigits = rawValue.replace(/\D/g, '').replace(/^0+/, '');
  targetRef.value = cleanDigits ? Number(cleanDigits) : '';

  const formatted = formatNominalDisplay(cleanDigits);
  input.value = formatted;

  if (document.activeElement === input) {
    let newCursorPos = 0;
    if (digitsBeforeCursor > 0) {
      let seenDigits = 0;
      for (let i = 0; i < formatted.length; i++) {
        if (/\d/.test(formatted[i])) {
          seenDigits++;
          if (seenDigits === digitsBeforeCursor) {
            newCursorPos = i + 1;
            break;
          }
        }
      }
    }
    input.setSelectionRange(newCursorPos, newCursorPos);
  }
}

function handleAmountInput(event: Event) {
  applyFormattedNominalInput(event, amount);
}

function handleAdminFeeInput(event: Event) {
  applyFormattedNominalInput(event, adminFee);
}

const categories = computed(() => {
  const base =
    txType.value === 'expense'
      ? financeStore.expenseCategoryNames
      : financeStore.incomeCategoryNames;
  if (category.value && !base.includes(category.value) && txType.value !== 'transfer') {
    return [category.value, ...base];
  }
  return base;
});

const categoryOptions = computed<SelectOptionItem[]>(() =>
  categories.value.map((cat) => ({
    value: cat,
    label: cat,
  }))
);

const walletOptions = computed<SelectOptionItem[]>(() =>
  financeStore.wallets.map((w) => {
    const saved = savingsStore.getWalletSavingsBalance(w.id);
    const operational = Number(w.balance || 0) - saved;
    return {
      value: w.id,
      label: w.name,
      sublabel:
        saved > 0
          ? `(Bergerak: ${themeStore.formatMoney(operational)} · Total: ${themeStore.formatMoney(w.balance)})`
          : `(${themeStore.formatMoney(w.balance)})`,
    };
  })
);

const availableSourceHolders = computed(() =>
  walletId.value ? financeStore.getHoldersByWalletId(walletId.value) : []
);

const sourceHolderOptions = computed<SelectOptionItem[]>(() =>
  availableSourceHolders.value.map((holder) => {
    const saved = savingsStore.getHolderSavingsBalance(walletId.value, holder.id);
    const operational = Number(holder.balance || 0) - saved;
    return {
      value: holder.id,
      label: formatHolderName(holder.holderName),
      sublabel:
        saved > 0
          ? `(Bergerak: ${themeStore.formatMoney(operational)} · Total: ${themeStore.formatMoney(holder.balance)})`
          : `(${themeStore.formatMoney(holder.balance)})`,
    };
  })
);

const availableDestHolders = computed(() =>
  toWalletId.value ? financeStore.getHoldersByWalletId(toWalletId.value) : []
);

const destHolderOptions = computed<SelectOptionItem[]>(() =>
  availableDestHolders.value.map((holder) => ({
    value: holder.id,
    label: formatHolderName(holder.holderName),
    sublabel: `(${themeStore.formatMoney(holder.balance)})`,
  }))
);

watch(
  () => [financeStore.quickModalOpen, financeStore.editingTransaction] as const,
  async ([isOpen, editingTx]) => {
    if (!isOpen) {
      resetShortfallFlow();
      return;
    }
    isInitializing.value = true;
    errorMsg.value = null;
    resetShortfallFlow();

    if (editingTx) {
      txType.value = editingTx.type;
      walletId.value = editingTx.walletId || financeStore.wallets[0]?.id || '';
      const srcHolders = financeStore.getHoldersByWalletId(walletId.value);
      fundOwnerId.value =
        editingTx.fundOwnerId && srcHolders.some((h) => h.id === editingTx.fundOwnerId)
          ? editingTx.fundOwnerId
          : srcHolders[0]?.id || '';

      toWalletId.value =
        editingTx.toWalletId || editingTx.walletId || financeStore.wallets[0]?.id || '';
      const dstHolders = financeStore.getHoldersByWalletId(toWalletId.value);
      toFundOwnerId.value =
        editingTx.toFundOwnerId && dstHolders.some((h) => h.id === editingTx.toFundOwnerId)
          ? editingTx.toFundOwnerId
          : dstHolders[0]?.id || '';

      amount.value = editingTx.amount;
      adminFee.value = editingTx.adminFee && editingTx.adminFee > 0 ? editingTx.adminFee : '';
      category.value =
        editingTx.type === 'transfer'
          ? 'Transfer Dana'
          : editingTx.category || categories.value[0] || 'Lainnya';
      note.value = editingTx.note || '';
      date.value = editingTx.date || new Date().toISOString().slice(0, 10);
    } else {
      txType.value = 'expense';
      walletId.value = '';
      fundOwnerId.value = '';
      toWalletId.value = '';
      toFundOwnerId.value = '';
      amount.value = '';
      adminFee.value = '';
      note.value = '';
      date.value = new Date().toISOString().slice(0, 10);
      category.value = '';
    }

    await nextTick();
    isInitializing.value = false;
  },
  { immediate: true }
);

watch(walletId, (newWalletId) => {
  if (isInitializing.value) return;
  if (!newWalletId) {
    fundOwnerId.value = '';
    return;
  }
  const holders = financeStore.getHoldersByWalletId(newWalletId);
  fundOwnerId.value = holders[0]?.id || '';
});

watch(toWalletId, (newToWalletId) => {
  if (isInitializing.value) return;
  if (!newToWalletId) {
    toFundOwnerId.value = '';
    return;
  }
  const holders = financeStore.getHoldersByWalletId(newToWalletId);
  toFundOwnerId.value = holders[0]?.id || '';
});

watch(txType, () => {
  if (isInitializing.value) return;
  if (
    category.value &&
    !categories.value.includes(category.value) &&
    txType.value !== 'transfer'
  ) {
    category.value = '';
  }
});

function closeModal() {
  resetShortfallFlow();
  financeStore.quickModalOpen = false;
  financeStore.editingTransaction = null;
}

async function handleDeleteCurrent() {
  if (!financeStore.editingTransaction) return;
  isSubmitting.value = true;
  try {
    const deleted = await financeStore.removeTransaction(financeStore.editingTransaction.id);
    if (deleted) {
      closeModal();
    }
  } catch (err: any) {
    errorMsg.value = err instanceof Error ? err.message : 'Gagal menghapus transaksi.';
  } finally {
    isSubmitting.value = false;
  }
}

async function commitTransactionSave(payload: any) {
  if (financeStore.editingTransaction) {
    await financeStore.updateTransaction(financeStore.editingTransaction.id, payload);
  } else {
    await financeStore.addTransaction(payload);
  }
}

function checkOperationalBalanceShortfall(payload: any): boolean {
  if (payload.type !== 'expense' && payload.type !== 'transfer') {
    return false;
  }

  const targetWallet = financeStore.wallets.find((w) => w.id === payload.walletId);
  if (!targetWallet) return false;

  const targetHolders = financeStore.getHoldersByWalletId(targetWallet.id);
  const targetHolder =
    targetHolders.find((h) => h.id === payload.fundOwnerId) || targetHolders[0];
  const resolvedHolderId = targetHolder?.id || payload.fundOwnerId || 'default';
  const resolvedHolderName = targetHolder ? formatHolderName(targetHolder.holderName) : 'Pribadi';

  const outgoingAmount =
    Number(payload.amount || 0) + (payload.type === 'transfer' ? Number(payload.adminFee || 0) : 0);

  // Reverse old transaction's impact if editing an existing transaction
  let holderReversal = 0;
  let walletReversal = 0;
  const oldTx = financeStore.editingTransaction;
  if (oldTx) {
    const oldAmt = Number(oldTx.amount || 0);
    const oldFee = oldTx.type === 'transfer' ? Number(oldTx.adminFee || 0) : 0;
    if (oldTx.walletId === targetWallet.id) {
      if (oldTx.type === 'income') {
        walletReversal -= oldAmt;
        if (!targetHolder || oldTx.fundOwnerId === targetHolder.id) {
          holderReversal -= oldAmt;
        }
      } else if (oldTx.type === 'expense') {
        walletReversal += oldAmt;
        if (!targetHolder || oldTx.fundOwnerId === targetHolder.id) {
          holderReversal += oldAmt;
        }
      } else if (oldTx.type === 'transfer') {
        if (oldTx.toWalletId && oldTx.toWalletId !== oldTx.walletId) {
          walletReversal += oldAmt + oldFee;
        } else if (oldFee > 0) {
          walletReversal += oldFee;
        }
        if (!targetHolder || oldTx.fundOwnerId === targetHolder.id) {
          holderReversal += oldAmt + oldFee;
        }
      }
    }
    if (oldTx.type === 'transfer' && oldTx.toWalletId === targetWallet.id) {
      if (oldTx.toWalletId !== oldTx.walletId) {
        walletReversal -= oldAmt;
      }
      if (targetHolder && oldTx.toFundOwnerId === targetHolder.id) {
        holderReversal -= oldAmt;
      }
    }
  }

  const holderSaved = savingsStore.getHolderSavingsBalance(targetWallet.id, resolvedHolderId);
  const walletSaved = savingsStore.getWalletSavingsBalance(targetWallet.id);

  // Use holder-level savings check if this holder has savings, else fall back to wallet-level if wallet has savings
  const checkAtHolderLevel = holderSaved > 0 && Boolean(targetHolder);
  const savedInSavings = checkAtHolderLevel ? holderSaved : walletSaved;
  if (savedInSavings <= 0) {
    return false;
  }

  const preTotalBalance = checkAtHolderLevel && targetHolder
    ? Number(targetHolder.balance || 0) + holderReversal
    : Number(targetWallet.balance || 0) + walletReversal;

  const operationalBalance = preTotalBalance - savedInSavings;
  if (operationalBalance >= outgoingAmount) {
    return false;
  }

  // Operational balance is insufficient and savings exist in Tabungan!
  const rawShortfall = outgoingAmount - Math.max(0, operationalBalance);
  const shortfallAmount = Math.min(rawShortfall, savedInSavings);
  if (shortfallAmount <= 0) return false;

  const goalsHolding = savingsStore.getGoalsHoldingWallet(
    targetWallet.id,
    checkAtHolderLevel ? resolvedHolderId : undefined
  );

  const mappedGoals: EligibleGoalAllocation[] = goalsHolding
    .map((item) => {
      const avail = checkAtHolderLevel && item.holderSaved > 0 ? item.holderSaved : item.walletSaved;
      const primaryHolder =
        item.holdersBreakdown.find((b) => b.fundOwnerId === resolvedHolderId) ||
        item.holdersBreakdown[0];
      return {
        goalId: item.goal.id,
        goalName: item.goal.name,
        goalCategory: item.goal.category,
        targetAmount: item.goal.targetAmount,
        collectedAmount: savingsStore.getGoalCollectedAmount(item.goal.id),
        availableFromWallet: avail,
        targetFundOwnerId: primaryHolder?.fundOwnerId || resolvedHolderId,
        targetFundOwnerName: primaryHolder?.fundOwnerName || resolvedHolderName,
        selected: false,
        drawAmount: 0,
      };
    })
    .filter((g) => g.availableFromWallet > 0);

  if (mappedGoals.length === 0) {
    return false;
  }

  shortfallContext.value = {
    walletId: targetWallet.id,
    walletName: targetWallet.name,
    fundOwnerId: resolvedHolderId,
    fundOwnerName: resolvedHolderName,
    totalBalance: preTotalBalance,
    savedInSavings,
    operationalBalance,
    outgoingAmount,
    shortfallAmount,
    pendingPayload: payload,
  };
  eligibleGoals.value = mappedGoals;
  selectedGoalIds.value = mappedGoals.length === 1 ? [mappedGoals[0].goalId] : [];
  shortfallStep.value = 'ask';

  notificationStore.notifyWarning(
    'Saldo Bergerak Tidak Mencukupi',
    `Saldo bergerak (di luar tabungan) pada dompet ${targetWallet.name} tidak cukup untuk transaksi ini.`
  );

  return true;
}

function handleShortfallDecline() {
  const wName = shortfallContext.value?.walletName || 'dompet';
  resetShortfallFlow();
  errorMsg.value = `Transaksi tidak dapat disimpan karena saldo bergerak ${wName} tidak mencukupi dan Anda memilih tidak menggunakan saldo di Tabungan.`;
  notificationStore.notifyError(
    'Penyimpanan Transaksi Dibatalkan',
    `Saldo bergerak pada ${wName} tidak cukup untuk melanjutkan pencatatan transaksi.`
  );
}

function handleShortfallAccept() {
  if (!eligibleGoals.value.length) return;
  shortfallStep.value = 'pick';
}

function toggleSelectGoal(goalId: string) {
  const idx = selectedGoalIds.value.indexOf(goalId);
  const clicked = eligibleGoals.value.find((g) => g.goalId === goalId);
  const needed = shortfallContext.value?.shortfallAmount || 0;

  // If clicked goal alone covers the entire shortfall, select it exclusively for clean 1-tap picking
  if (clicked && clicked.availableFromWallet >= needed && selectedGoalIds.value.length <= 1) {
    selectedGoalIds.value = [goalId];
    return;
  }

  if (idx >= 0) {
    selectedGoalIds.value.splice(idx, 1);
  } else {
    selectedGoalIds.value.push(goalId);
  }
}

function proceedToShortfallConfirm() {
  if (selectedGoalIds.value.length === 0) {
    errorMsg.value = 'Pilih minimal satu Tabungan sumber dana terlebih dahulu.';
    return;
  }
  errorMsg.value = null;
  shortfallStep.value = 'confirm';
}

async function handleConfirmShortfallAndSave() {
  if (!shortfallContext.value || shortfallAllocations.value.length === 0) return;
  isSubmitting.value = true;
  errorMsg.value = null;
  try {
    const ctx = shortfallContext.value;
    const txPayload = ctx.pendingPayload;

    // 1. Withdraw allocated funds from selected Tabungan goals and record in Progress History
    for (const alloc of shortfallAllocations.value) {
      await savingsStore.recordProgress({
        savingsId: alloc.goalId,
        type: 'withdraw',
        walletId: ctx.walletId,
        fundOwnerId: alloc.targetFundOwnerId,
        amount: alloc.drawAmount,
        date: txPayload.date,
        note: `Digunakan untuk transaksi: ${txPayload.note}`,
        silentNotification: true,
      });
    }

    // 2. Save the transaction into Finance Store
    await commitTransactionSave(txPayload);

    notificationStore.notifySuccess(
      'Saldo Tabungan Digunakan & Transaksi Disimpan',
      `Sebesar ${themeStore.formatMoney(selectedTotalDrawAmount.value)} ditarik dari Tabungan (${ctx.walletName}) dan dicatat pada riwayat progress tabungan.`
    );

    amount.value = '';
    adminFee.value = '';
    note.value = '';
    closeModal();
  } catch (err: any) {
    errorMsg.value = err instanceof Error ? err.message : 'Gagal menggunakan saldo tabungan.';
  } finally {
    isSubmitting.value = false;
  }
}

async function handleSubmit() {
  errorMsg.value = null;
  if (!walletId.value) {
    errorMsg.value = 'Pilih Sumber Dana terlebih dahulu.';
    return;
  }
  if (availableSourceHolders.value.length > 0 && !fundOwnerId.value) {
    errorMsg.value = 'Pilih Pemilik terlebih dahulu.';
    return;
  }

  const numericAmount = Number(amount.value || 0);
  if (numericAmount <= 0) {
    errorMsg.value = 'Masukkan Nominal transaksi yang valid (lebih dari 0).';
    return;
  }
  const numericAdminFee =
    txType.value === 'transfer' ? Math.max(0, Number(adminFee.value || 0)) : 0;

  if (txType.value !== 'transfer' && !category.value.trim()) {
    errorMsg.value = 'Pilih Kategori terlebih dahulu.';
    return;
  }

  if (txType.value === 'transfer') {
    if (!toWalletId.value) {
      errorMsg.value = 'Pilih Sumber Dana Tujuan terlebih dahulu.';
      return;
    }
    if (availableDestHolders.value.length > 0 && !toFundOwnerId.value) {
      errorMsg.value = 'Pilih Pemilik Tujuan terlebih dahulu.';
      return;
    }
  }

  const resolvedCategory =
    txType.value === 'transfer' ? 'Transfer Dana' : category.value.trim() || 'Lainnya';
  const payload = {
    walletId: walletId.value,
    fundOwnerId: fundOwnerId.value,
    toWalletId: txType.value === 'transfer' ? toWalletId.value : undefined,
    toFundOwnerId: txType.value === 'transfer' ? toFundOwnerId.value : undefined,
    type: txType.value,
    category: resolvedCategory,
    amount: numericAmount,
    adminFee: numericAdminFee,
    note:
      note.value.trim() ||
      (txType.value === 'transfer' ? 'Transfer antar kepemilikan dana' : resolvedCategory),
    date: date.value,
  };

  // Intercept if operational balance (outside Tabungan) is insufficient for this expense/transfer
  if (checkOperationalBalanceShortfall(payload)) {
    return;
  }

  isSubmitting.value = true;
  try {
    await commitTransactionSave(payload);

    amount.value = '';
    adminFee.value = '';
    note.value = '';
    closeModal();
  } catch (err: any) {
    errorMsg.value = err instanceof Error ? err.message : 'Gagal menyimpan transaksi.';
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <AppModal
    :open="financeStore.quickModalOpen"
    :title="
      shortfallStep === 'ask'
        ? 'Saldo Bergerak Tidak Mencukupi'
        : shortfallStep === 'pick'
          ? 'Pilih Tabungan Sumber Dana'
          : shortfallStep === 'confirm'
            ? 'Konfirmasi Tarik Dana Tabungan'
            : isEditMode
              ? 'Detail & Ubah Transaksi'
              : t('dashboard.addTransaction')
    "
    max-width="lg"
    @close="closeModal"
  >
    <!-- STEP A: NORMAL TRANSACTION FORM -->
    <div v-if="shortfallStep === 'form'" class="space-y-3.5">
      <!-- 1. Sumber Dana -->
      <CustomSelect
        v-model="walletId"
        :options="walletOptions"
        placeholder="Sumber Dana"
      />

      <!-- 2. Pemilik Sumber Dana -->
      <CustomSelect
        v-model="fundOwnerId"
        :options="sourceHolderOptions"
        :disabled="!walletId || availableSourceHolders.length === 0"
        placeholder="Pemilik"
      />

      <!-- Operational Balance Helper Banner when selected wallet has funds in Tabungan -->
      <div
        v-if="selectedSourceBalanceSummary"
        class="rounded-2xl border border-teal-200/80 dark:border-teal-900/50 bg-teal-50/70 dark:bg-teal-950/30 px-3.5 py-2.5 text-[11px] flex flex-wrap items-center justify-between gap-2"
      >
        <div class="flex items-center gap-1.5 text-teal-800 dark:text-teal-200 font-medium">
          <Target class="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
          <span>
            Saldo Bergerak:
            <strong class="font-money font-bold">{{ themeStore.formatMoney(selectedSourceBalanceSummary.operational) }}</strong>
          </span>
        </div>
        <span class="text-slate-600 dark:text-slate-400 font-money">
          Tersimpan di Tabungan: {{ themeStore.formatMoney(selectedSourceBalanceSummary.saved) }}
        </span>
      </div>

      <!-- 3. Segmented 3-Way Type Control: Income | Expense | Transfer -->
      <div class="grid grid-cols-3 rounded-full overflow-hidden border border-emerald-600/20 dark:border-emerald-500/20 bg-emerald-600/10 dark:bg-slate-800 p-1 gap-1">
        <button
          type="button"
          class="min-h-[44px] flex items-center justify-center gap-1 rounded-full text-xs sm:text-sm font-bold uppercase tracking-wide transition-all duration-150 px-2"
          :class="
            txType === 'income'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
          "
          @click="txType = 'income'"
        >
          <ArrowDownLeft class="w-3.5 h-3.5 shrink-0 hidden sm:inline" />
          <span class="truncate">Income</span>
        </button>
        <button
          type="button"
          class="min-h-[44px] flex items-center justify-center gap-1 rounded-full text-xs sm:text-sm font-bold uppercase tracking-wide transition-all duration-150 px-2"
          :class="
            txType === 'expense'
              ? 'bg-rose-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
          "
          @click="txType = 'expense'"
        >
          <ArrowUpRight class="w-3.5 h-3.5 shrink-0 hidden sm:inline" />
          <span class="truncate">Expense</span>
        </button>
        <button
          type="button"
          class="min-h-[44px] flex items-center justify-center gap-1 rounded-full text-xs sm:text-sm font-bold uppercase tracking-wide transition-all duration-150 px-2"
          :class="
            txType === 'transfer'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
          "
          @click="txType = 'transfer'"
        >
          <ArrowLeftRight class="w-3.5 h-3.5 shrink-0 hidden sm:inline" />
          <span class="truncate">Transfer</span>
        </button>
      </div>

      <!-- 4. Tanggal Transaksi (Google Material Date Picker) -->
      <MaterialDatePicker
        v-model="date"
        :label="t('transactions.date')"
      />

      <!-- 5. Deskripsi / Catatan -->
      <input
        v-model="note"
        type="text"
        maxlength="200"
        placeholder="Deskripsi"
        class="w-full min-h-[54px] sm:min-h-[50px] px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 text-sm sm:text-base text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:outline-none focus:border-emerald-600"
      />

      <!-- 6. Nominal Transaksi (Real-time Thousand Separator) -->
      <input
        :value="amountDisplay"
        type="text"
        inputmode="numeric"
        autocomplete="off"
        placeholder="Nominal (Rp)"
        required
        class="w-full min-h-[54px] sm:min-h-[50px] px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 text-base sm:text-lg font-money font-semibold text-slate-900 dark:text-slate-100 placeholder:font-sans placeholder:font-normal placeholder:text-sm sm:placeholder:text-base placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:outline-none focus:border-emerald-600"
        @input="handleAmountInput"
      />

      <!-- 7A. Kategori (Untuk Income / Expense) -->
      <div v-if="txType !== 'transfer'" class="space-y-2.5">
        <CustomSelect
          v-model="category"
          :options="categoryOptions"
          searchable
          allow-custom-value
          search-placeholder="Ketik untuk mencari kategori..."
          placeholder="Kategori"
        />

        <!-- Peringatan Status Draft / Perubahan atau Alokasi Periode Anggaran Tahunan -->
        <div
          v-if="earlyAnnualAllocationNotice"
          class="rounded-2xl border p-3 text-xs space-y-1"
          :class="
            earlyAnnualAllocationNotice.isDraftBlocked || earlyAnnualAllocationNotice.mode === 'strict'
              ? 'border-rose-300 dark:border-rose-900/70 bg-rose-50/90 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200'
              : 'border-amber-300 dark:border-amber-900/70 bg-amber-50/90 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200'
          "
        >
          <div class="flex items-center gap-1.5 font-bold">
            <ShieldAlert
              v-if="earlyAnnualAllocationNotice.isDraftBlocked || earlyAnnualAllocationNotice.mode === 'strict'"
              class="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0"
            />
            <AlertTriangle
              v-else
              class="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0"
            />
            <span>
              <template v-if="earlyAnnualAllocationNotice.isDraftBlocked">
                {{
                  earlyAnnualAllocationNotice.isRevisionSession
                    ? `Anggaran ${earlyAnnualAllocationNotice.year} Sedang Proses Perubahan (Draft)`
                    : `Anggaran ${earlyAnnualAllocationNotice.year} Masih Berstatus Draft`
                }}
              </template>
              <template v-else>
                {{
                  earlyAnnualAllocationNotice.mode === 'strict'
                    ? `Mode Ketat Anggaran ${earlyAnnualAllocationNotice.year}: Belum Masuk Periode Alokasi`
                    : `Mode Fleksibel Anggaran ${earlyAnnualAllocationNotice.year}: Sebelum Periode Alokasi`
                }}
              </template>
            </span>
          </div>
          <p class="text-[11px] leading-relaxed">
            <template v-if="earlyAnnualAllocationNotice.isDraftBlocked">
              Kategori <strong>{{ earlyAnnualAllocationNotice.category }}</strong> termasuk di dalam Anggaran Setahun Penuh Tahun <strong>{{ earlyAnnualAllocationNotice.year }}</strong> yang saat ini masih berstatus <strong>DRAFT</strong>. Transaksi untuk kategori ini tidak dapat disimpan sebelum Anda menyelesaikan proses penganggaran dan mengklik tombol <strong>Finalisasi Anggaran</strong> di halaman Anggaran.
            </template>
            <template v-else>
              Kategori <strong>{{ earlyAnnualAllocationNotice.category }}</strong> baru dialokasikan mulai
              <strong>{{ earlyAnnualAllocationNotice.firstPeriodLabel }}</strong> ({{ earlyAnnualAllocationNotice.allocMonthsLabels }}), sedangkan tanggal transaksi ini berada di
              <strong>{{ earlyAnnualAllocationNotice.txPeriodLabel }}</strong>.
              <template v-if="earlyAnnualAllocationNotice.mode === 'strict'">
                Dalam <strong>Mode Ketat</strong>, transaksi sebelum periode alokasi tidak dapat disimpan sebelum Anda melakukan perubahan anggaran hingga Final terlebih dahulu (sisa kuota perubahan: <strong>{{ earlyAnnualAllocationNotice.remainingRevs }}x</strong> dari {{ MAX_STRICT_ANNUAL_REVISIONS }}x).
              </template>
              <template v-else>
                Dalam <strong>Mode Fleksibel</strong>, Anda akan diminta konfirmasi saat menyimpan transaksi ini.
              </template>
            </template>
          </p>
        </div>
      </div>

      <!-- 7B. Biaya Admin + Sumber Dana Tujuan + Pemilik Tujuan (Untuk Transfer) -->
      <Transition name="fade-slide">
        <div v-if="txType === 'transfer'" class="space-y-3.5">
          <input
            :value="adminFeeDisplay"
            type="text"
            inputmode="numeric"
            autocomplete="off"
            placeholder="Biaya Admin (Rp · Opsional)"
            class="w-full min-h-[54px] sm:min-h-[50px] px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 text-base sm:text-lg font-money font-semibold text-slate-900 dark:text-slate-100 placeholder:font-sans placeholder:font-normal placeholder:text-sm sm:placeholder:text-base placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:outline-none focus:border-indigo-600"
            @input="handleAdminFeeInput"
          />

          <CustomSelect
            v-model="toWalletId"
            :options="walletOptions"
            accent-color="indigo"
            placeholder="Sumber Dana Tujuan"
          />

          <CustomSelect
            v-model="toFundOwnerId"
            :options="destHolderOptions"
            :disabled="!toWalletId || availableDestHolders.length === 0"
            accent-color="indigo"
            placeholder="Pemilik Tujuan"
          />
        </div>
      </Transition>

      <p v-if="errorMsg" class="text-xs text-rose-600 dark:text-rose-400 font-medium px-1">
        {{ errorMsg }}
      </p>
    </div>

    <!-- STEP B1: ASK IF USER WANTS TO USE SAVINGS BALANCE -->
    <div v-else-if="shortfallStep === 'ask' && shortfallContext" class="space-y-4">
      <div class="rounded-2xl border border-amber-300 dark:border-amber-800/70 bg-amber-50/90 dark:bg-amber-950/40 p-4 space-y-2.5">
        <div class="flex items-start gap-3">
          <div class="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
            <AlertTriangle class="w-5 h-5" />
          </div>
          <div class="space-y-1 text-xs sm:text-sm">
            <div class="font-bold text-amber-900 dark:text-amber-200">
              Saldo Bergerak {{ shortfallContext.walletName }} Tidak Cukup
            </div>
            <p class="text-amber-800 dark:text-amber-300 leading-relaxed">
              Saldo bergerak (di luar tabungan) pada dompet <strong>{{ shortfallContext.walletName }}</strong>
              ({{ shortfallContext.fundOwnerName }}) tidak mencukupi untuk mencatat transaksi sebesar
              <strong class="font-money">{{ themeStore.formatMoney(shortfallContext.outgoingAmount) }}</strong>.
            </p>
          </div>
        </div>
      </div>

      <div class="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 p-4 space-y-2 text-xs">
        <div class="flex items-center justify-between gap-2 text-slate-600 dark:text-slate-400">
          <span>Total Saldo {{ shortfallContext.walletName }}</span>
          <span class="font-money font-semibold text-slate-900 dark:text-slate-100">
            {{ themeStore.formatMoney(shortfallContext.totalBalance) }}
          </span>
        </div>
        <div class="flex items-center justify-between gap-2 text-slate-600 dark:text-slate-400">
          <span>Tersimpan di Tabungan</span>
          <span class="font-money font-semibold text-teal-600 dark:text-teal-400">
            {{ themeStore.formatMoney(shortfallContext.savedInSavings) }}
          </span>
        </div>
        <div class="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
          <span class="font-semibold text-slate-700 dark:text-slate-300">Saldo Bergerak Tersedia</span>
          <span class="font-money font-bold text-rose-600 dark:text-rose-400">
            {{ themeStore.formatMoney(shortfallContext.operationalBalance) }}
          </span>
        </div>
        <div class="flex items-center justify-between gap-2">
          <span class="font-semibold text-slate-700 dark:text-slate-300">Kekurangan yang Diperlukan</span>
          <span class="font-money font-bold text-amber-600 dark:text-amber-400">
            {{ themeStore.formatMoney(shortfallContext.shortfallAmount) }}
          </span>
        </div>
      </div>

      <p class="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 text-center px-2">
        Apakah Anda ingin mengambil dari saldo <span class="text-emerald-600 dark:text-emerald-400">{{ shortfallContext.walletName }}</span> yang tersimpan di tabungan?
      </p>
    </div>

    <!-- STEP B2: PICK WHICH TABUNGAN TO DRAW FROM -->
    <div v-else-if="shortfallStep === 'pick' && shortfallContext" class="space-y-3.5">
      <div class="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
        Pilih daftar tabungan yang menyimpan saldo <strong>{{ shortfallContext.walletName }}</strong> untuk menutup kekurangan sebesar
        <strong class="font-money text-slate-900 dark:text-slate-100">{{ themeStore.formatMoney(shortfallContext.shortfallAmount) }}</strong>:
      </div>

      <div class="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
        <button
          v-for="item in eligibleGoals"
          :key="item.goalId"
          type="button"
          class="w-full text-left rounded-2xl border p-3.5 transition-all cursor-pointer flex items-center justify-between gap-3"
          :class="
            selectedGoalIds.includes(item.goalId)
              ? 'border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/40 ring-2 ring-emerald-500/20'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-emerald-500/50'
          "
          @click="toggleSelectGoal(item.goalId)"
        >
          <div class="min-w-0 flex-1 space-y-1">
            <div class="flex items-center gap-2">
              <Target class="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span class="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                {{ item.goalName }}
              </span>
            </div>
            <div class="text-[11px] text-slate-500 dark:text-slate-400">
              {{ item.goalCategory }} · Terkumpul total:
              <span class="font-money font-semibold">{{ themeStore.formatMoney(item.collectedAmount) }}</span>
            </div>
            <div class="text-xs font-semibold text-teal-700 dark:text-teal-300 font-money">
              Saldo {{ shortfallContext.walletName }} di tabungan ini: {{ themeStore.formatMoney(item.availableFromWallet) }}
            </div>
          </div>

          <div
            class="w-6 h-6 rounded-full border flex items-center justify-center shrink-0 transition-colors"
            :class="
              selectedGoalIds.includes(item.goalId)
                ? 'border-emerald-600 bg-emerald-600 text-white'
                : 'border-slate-300 dark:border-slate-700'
            "
          >
            <Check v-if="selectedGoalIds.includes(item.goalId)" class="w-3.5 h-3.5" />
          </div>
        </button>
      </div>

      <div
        v-if="selectedGoalIds.length > 0 && selectedGoalTotalAvailable < shortfallContext.shortfallAmount"
        class="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/80 dark:bg-amber-950/30 p-3 text-[11px] text-amber-800 dark:text-amber-300"
      >
        Total saldo dari tabungan terpilih ({{ themeStore.formatMoney(selectedGoalTotalAvailable) }}) masih kurang dari kebutuhan ({{ themeStore.formatMoney(shortfallContext.shortfallAmount) }}). Anda dapat memilih lebih dari satu tabungan jika tersedia.
      </div>

      <p v-if="errorMsg" class="text-xs text-rose-600 dark:text-rose-400 font-medium px-1">
        {{ errorMsg }}
      </p>
    </div>

    <!-- STEP B3: FINAL CONFIRMATION BEFORE WITHDRAWING SAVINGS & SAVING TX -->
    <div v-else-if="shortfallStep === 'confirm' && shortfallContext" class="space-y-4">
      <div class="rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/60 dark:bg-emerald-950/30 p-4 space-y-2.5 text-xs">
        <div class="text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
          Rincian Penarikan Saldo Tabungan
        </div>

        <div
          v-for="alloc in shortfallAllocations"
          :key="alloc.goalId"
          class="rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-3 space-y-1"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="font-bold text-slate-900 dark:text-slate-100">{{ alloc.goalName }}</span>
            <span class="font-money font-bold text-rose-600 dark:text-rose-400">
              -{{ themeStore.formatMoney(alloc.drawAmount) }}
            </span>
          </div>
          <div class="flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            <span>{{ shortfallContext.walletName }} ({{ alloc.targetFundOwnerName }})</span>
            <span class="font-money">Sisa di tabungan: {{ themeStore.formatMoney(alloc.remainingAfter) }}</span>
          </div>
        </div>

        <div class="pt-1 flex items-center justify-between gap-2 font-bold text-slate-900 dark:text-slate-100">
          <span>Total Diambil dari Tabungan</span>
          <span class="font-money text-emerald-700 dark:text-emerald-400">
            {{ themeStore.formatMoney(selectedTotalDrawAmount) }}
          </span>
        </div>
      </div>

      <p class="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
        Dengan mengonfirmasi, saldo pada tabungan di atas akan berkurang dan tercatat otomatis di dalam <strong>Riwayat Progress Tabungan</strong> sebelum transaksi disimpan.
      </p>

      <p v-if="errorMsg" class="text-xs text-rose-600 dark:text-rose-400 font-medium px-1">
        {{ errorMsg }}
      </p>
    </div>

    <!-- Fixed Footer inside AppModal -->
    <template #footer>
      <!-- Footer for Normal Form -->
      <div v-if="shortfallStep === 'form'" class="flex items-center justify-between gap-2.5">
        <button
          v-if="isEditMode"
          type="button"
          :disabled="isSubmitting"
          class="min-h-[44px] px-4 py-2 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0 disabled:opacity-50"
          @click="handleDeleteCurrent"
        >
          <Trash2 class="w-4 h-4 shrink-0" />
          <span>Hapus</span>
        </button>

        <button
          type="button"
          :disabled="isSubmitting"
          class="flex-1 min-h-[46px] px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 shadow-xs cursor-pointer"
          @click="handleSubmit"
        >
          <Check class="w-4 h-4 shrink-0" />
          <span>{{ isEditMode ? 'Simpan Perubahan' : t('transactions.save') }}</span>
        </button>
      </div>

      <!-- Footer for Shortfall Step 1 (Tidak / Ya) -->
      <div v-else-if="shortfallStep === 'ask'" class="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          class="min-h-[46px] px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-bold transition-colors cursor-pointer"
          @click="handleShortfallDecline"
        >
          Tidak
        </button>
        <button
          type="button"
          class="min-h-[46px] px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold transition-colors cursor-pointer shadow-xs"
          @click="handleShortfallAccept"
        >
          Ya, Ambil dari Tabungan
        </button>
      </div>

      <!-- Footer for Shortfall Step 2 (Pick Tabungan) -->
      <div v-else-if="shortfallStep === 'pick'" class="flex items-center justify-between gap-2.5">
        <button
          type="button"
          class="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          @click="shortfallStep = 'ask'"
        >
          <ArrowLeft class="w-4 h-4" />
          <span>Kembali</span>
        </button>
        <button
          type="button"
          :disabled="selectedGoalIds.length === 0"
          class="flex-1 min-h-[46px] px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
          @click="proceedToShortfallConfirm"
        >
          <Check class="w-4 h-4 shrink-0" />
          <span>Konfirmasi Tabungan</span>
        </button>
      </div>

      <!-- Footer for Shortfall Step 3 (Confirm) -->
      <div v-else-if="shortfallStep === 'confirm'" class="flex items-center justify-between gap-2.5">
        <button
          type="button"
          :disabled="isSubmitting"
          class="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          @click="shortfallStep = 'pick'"
        >
          <ArrowLeft class="w-4 h-4" />
          <span>Pilih Ulang</span>
        </button>
        <button
          type="button"
          :disabled="isSubmitting"
          class="flex-1 min-h-[46px] px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
          @click="handleConfirmShortfallAndSave"
        >
          <Check class="w-4 h-4 shrink-0" />
          <span>{{ isSubmitting ? 'Menyimpan...' : 'Gunakan Saldo & Simpan Transaksi' }}</span>
        </button>
      </div>
    </template>
  </AppModal>
</template>
