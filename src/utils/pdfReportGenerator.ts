import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  formatHolderName,
  formatPeriodLabel,
  BUDGET_PERIOD_MARKER_CATEGORY,
  type TransactionItem,
  type WalletItem,
  type WalletOwnerItem,
  type BudgetItem,
} from '../stores/finance';

export type PdfReportType = 'kas_umum' | 'rekonsiliasi_kas' | 'realisasi_anggaran';

export interface GeneratePdfReportPayload {
  reportType: PdfReportType;
  startIso: string;
  endIso: string;
  periodRangeLabel: string;
  rangeModeLabel: string;
  selectedWalletId: string; // 'all' or specific wallet.id
  selectedOwnerName: string; // 'all' or specific formatted holderName
  wallets: WalletItem[];
  walletOwners: WalletOwnerItem[];
  allTransactions: TransactionItem[];
  budgets: BudgetItem[];
  formatMoney: (amount: number) => string;
  userDisplayName: string;
  userEmail: string;
  locale: 'id' | 'en';
}

export interface PdfReportPreviewSummary {
  reportTitle: string;
  scopeWalletLabel: string;
  scopeOwnerLabel: string;
  saldoAwal: number;
  saldoAkhir: number;
  totalIncome: number;
  totalExpense: number;
  netMutation: number;
  netCashflow: number;
  matchingTxCount: number;
  budgetPeriodCount: number;
  budgetItemCount: number;
  totalBudgetLimit: number;
  totalBudgetRealized: number;
  budgetAbsorptionRate: number;
}

function doesTxTouchScopeAsSource(
  tx: TransactionItem,
  walletId: string,
  ownerName: string
): boolean {
  const walletOk = walletId === 'all' || tx.walletId === walletId;
  const srcOwner = formatHolderName(tx.fundOwnerName);
  const ownerOk = ownerName === 'all' || srcOwner === ownerName;
  return walletOk && ownerOk;
}

function doesTxTouchScopeAsDest(
  tx: TransactionItem,
  walletId: string,
  ownerName: string
): boolean {
  if (tx.type !== 'transfer') return false;
  const destWalletId = tx.toWalletId || tx.walletId;
  const destOwner = tx.toFundOwnerName
    ? formatHolderName(tx.toFundOwnerName)
    : formatHolderName(tx.fundOwnerName);
  const walletOk = walletId === 'all' || destWalletId === walletId;
  const ownerOk = ownerName === 'all' || destOwner === ownerName;
  return walletOk && ownerOk;
}

export function doesTxMatchScope(
  tx: TransactionItem,
  walletId: string,
  ownerName: string
): boolean {
  if (tx.type === 'income' || tx.type === 'expense') {
    return doesTxTouchScopeAsSource(tx, walletId, ownerName);
  }
  if (tx.type === 'transfer') {
    return (
      doesTxTouchScopeAsSource(tx, walletId, ownerName) ||
      doesTxTouchScopeAsDest(tx, walletId, ownerName)
    );
  }
  return false;
}

/**
 * Compute exact net balance delta of a transaction for a given (walletId, ownerName) scope.
 */
export function getScopeNetDeltaForTx(
  tx: TransactionItem,
  walletId: string,
  ownerName: string
): number {
  const amt = Number(tx.amount || 0);
  const fee = Number(tx.adminFee || 0);
  const inSource = doesTxTouchScopeAsSource(tx, walletId, ownerName);
  const inDest = doesTxTouchScopeAsDest(tx, walletId, ownerName);

  if (tx.type === 'income') {
    return inSource ? amt : 0;
  }
  if (tx.type === 'expense') {
    return inSource ? -amt : 0;
  }
  if (tx.type === 'transfer') {
    let delta = 0;
    if (inSource) {
      delta -= amt + fee;
    }
    if (inDest) {
      delta += amt;
    }
    return delta;
  }
  return 0;
}

/**
 * Compute Debit (Kas Masuk) and Kredit (Kas Keluar) columns for a transaction in General Cash Ledger (Buku Kas Umum).
 */
function getScopeLedgerDebitCredit(
  tx: TransactionItem,
  walletId: string,
  ownerName: string
): {
  debitIn: number;
  creditOut: number;
  netDelta: number;
  typeLabel: string;
} {
  const amt = Number(tx.amount || 0);
  const fee = Number(tx.adminFee || 0);
  const inSource = doesTxTouchScopeAsSource(tx, walletId, ownerName);
  const inDest = doesTxTouchScopeAsDest(tx, walletId, ownerName);

  if (tx.type === 'income' && inSource) {
    return {
      debitIn: amt,
      creditOut: 0,
      netDelta: amt,
      typeLabel: 'Pemasukan',
    };
  }

  if (tx.type === 'expense' && inSource) {
    return {
      debitIn: 0,
      creditOut: amt,
      netDelta: -amt,
      typeLabel: 'Pengeluaran',
    };
  }

  if (tx.type === 'transfer') {
    if (inSource && inDest) {
      // Internal transfer within the selected scope (only adminFee leaves the scope)
      return {
        debitIn: 0,
        creditOut: fee,
        netDelta: -fee,
        typeLabel: fee > 0 ? 'Transfer Internal (+Biaya Admin)' : 'Transfer Internal',
      };
    }
    if (inSource && !inDest) {
      return {
        debitIn: 0,
        creditOut: amt + fee,
        netDelta: -(amt + fee),
        typeLabel: 'Transfer Keluar',
      };
    }
    if (!inSource && inDest) {
      return {
        debitIn: amt,
        creditOut: 0,
        netDelta: amt,
        typeLabel: 'Transfer Masuk',
      };
    }
  }

  return {
    debitIn: 0,
    creditOut: 0,
    netDelta: 0,
    typeLabel: '-',
  };
}

/**
 * Compute current live balance for the selected (walletId, ownerName) scope.
 */
export function getScopeLiveBalance(
  wallets: WalletItem[],
  walletOwners: WalletOwnerItem[],
  walletId: string,
  ownerName: string
): number {
  const activeWallets = wallets.filter((w) => !w.deleted);
  const activeWalletIds = new Set(activeWallets.map((w) => w.id));

  if (walletId === 'all' && ownerName === 'all') {
    return activeWallets.reduce((sum, w) => sum + Number(w.balance || 0), 0);
  }

  if (walletId !== 'all' && ownerName === 'all') {
    const foundWallet = activeWallets.find((w) => w.id === walletId);
    return foundWallet ? Number(foundWallet.balance || 0) : 0;
  }

  // Filter by ownerName (either across all wallets or inside a specific walletId)
  let sum = 0;
  for (const fo of walletOwners) {
    if (fo.deleted) continue;
    if (!activeWalletIds.has(fo.walletId)) continue;
    if (walletId !== 'all' && fo.walletId !== walletId) continue;
    if (formatHolderName(fo.holderName) === ownerName) {
      sum += Number(fo.balance || 0);
    }
  }
  return sum;
}

function getMonthsBetween(startIso: string, endIso: string): string[] {
  const startYm = String(startIso || '').slice(0, 7);
  const endYm = String(endIso || '').slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(startYm) || !/^\d{4}-\d{2}$/.test(endYm)) {
    return [];
  }
  const [sy, sm] = startYm.split('-').map(Number);
  const [ey, em] = endYm.split('-').map(Number);
  const months: string[] = [];
  let cy = sy;
  let cm = sm;
  let safety = 0;
  while ((cy < ey || (cy === ey && cm <= em)) && safety < 120) {
    months.push(`${cy}-${String(cm).padStart(2, '0')}`);
    cm++;
    if (cm > 12) {
      cm = 1;
      cy++;
    }
    safety++;
  }
  return months;
}

function formatDateId(iso: string): string {
  const parts = String(iso || '').slice(0, 10).split('-');
  if (parts.length !== 3) return iso;
  const [y, m, d] = parts.map(Number);
  const dateObj = new Date(y, m - 1, d);
  return dateObj.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatLongDateId(iso: string): string {
  const parts = String(iso || '').slice(0, 10).split('-');
  if (parts.length !== 3) return iso;
  const [y, m, d] = parts.map(Number);
  const dateObj = new Date(y, m - 1, d);
  return dateObj.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Format numeric amount in formal Indonesian accounting format ("222.992.400,00")
 * while keeping the currency prefix ("Rp" or "$") in its own aligned column.
 */
function formatFormalAccountingNumber(amount: number, currencySymbol = 'Rp'): {
  symbol: string;
  formattedNumber: string;
} {
  const num = Number(amount || 0);
  const abs = Math.abs(num);
  const formatted = abs.toLocaleString('id-ID', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return {
    symbol: currencySymbol,
    formattedNumber: num < 0 ? `-${formatted}` : formatted,
  };
}

export function computePdfReportPreview(
  payload: GeneratePdfReportPayload
): PdfReportPreviewSummary {
  const {
    reportType,
    startIso,
    endIso,
    selectedWalletId,
    selectedOwnerName,
    wallets,
    walletOwners,
    allTransactions,
    budgets,
  } = payload;

  const activeWallets = wallets.filter((w) => !w.deleted);
  const selectedWalletObj = activeWallets.find((w) => w.id === selectedWalletId);

  const scopeWalletLabel =
    selectedWalletId === 'all'
      ? 'Semua Sumber Dana'
      : selectedWalletObj?.name || 'Sumber Dana Tertentu';
  const scopeOwnerLabel =
    selectedOwnerName === 'all' ? 'Semua Kepemilikan' : selectedOwnerName;

  const reportTitles: Record<PdfReportType, string> = {
    kas_umum: 'Laporan Kas Umum (Buku Kas Umum)',
    rekonsiliasi_kas: 'Laporan Rekonsiliasi Kas & Kepemilikan Dana',
    realisasi_anggaran: 'Laporan Realisasi / Serapan Anggaran',
  };

  const liveBalance = getScopeLiveBalance(
    wallets,
    walletOwners,
    selectedWalletId,
    selectedOwnerName
  );

  let netAfterEnd = 0;
  let netInPeriod = 0;
  let totalIncome = 0;
  let totalExpense = 0;
  let matchingTxCount = 0;

  for (const tx of allTransactions) {
    if (tx.deleted) continue;
    const d = String(tx.date || '').slice(0, 10);
    if (d > endIso) {
      netAfterEnd += getScopeNetDeltaForTx(tx, selectedWalletId, selectedOwnerName);
    } else if (d >= startIso && d <= endIso) {
      const delta = getScopeNetDeltaForTx(tx, selectedWalletId, selectedOwnerName);
      netInPeriod += delta;
      if (doesTxMatchScope(tx, selectedWalletId, selectedOwnerName)) {
        matchingTxCount++;
        const inSource = doesTxTouchScopeAsSource(tx, selectedWalletId, selectedOwnerName);
        if (tx.type === 'income' && inSource) {
          totalIncome += Number(tx.amount || 0);
        } else if (tx.type === 'expense' && inSource) {
          totalExpense += Number(tx.amount || 0);
        } else if (tx.type === 'transfer' && inSource && Number(tx.adminFee || 0) > 0) {
          totalExpense += Number(tx.adminFee || 0);
        }
      }
    }
  }

  const saldoAkhir = liveBalance - netAfterEnd;
  const saldoAwal = saldoAkhir - netInPeriod;

  // Budget summary for active months
  const activeMonths = getMonthsBetween(startIso, endIso);
  const activeMonthsSet = new Set(activeMonths);
  const matchingBudgets = budgets.filter(
    (b) =>
      !b.deleted &&
      b.category !== BUDGET_PERIOD_MARKER_CATEGORY &&
      activeMonthsSet.has(b.period)
  );

  let totalBudgetLimit = 0;
  let totalBudgetRealized = 0;
  for (const b of matchingBudgets) {
    totalBudgetLimit += Number(b.limitAmount || 0);
    const spent = allTransactions
      .filter((tx) => {
        if (tx.deleted || tx.type !== 'expense') return false;
        const d = String(tx.date || '').slice(0, 10);
        const ym = d.slice(0, 7);
        if (ym !== b.period) return false;
        if (d < startIso || d > endIso) return false;
        if (!doesTxTouchScopeAsSource(tx, selectedWalletId, selectedOwnerName)) return false;
        return tx.category.trim().toLowerCase() === b.category.trim().toLowerCase();
      })
      .reduce((s, tx) => s + Number(tx.amount || 0), 0);
    totalBudgetRealized += spent;
  }

  const budgetAbsorptionRate =
    totalBudgetLimit > 0 ? Math.round((totalBudgetRealized / totalBudgetLimit) * 100) : 0;

  return {
    reportTitle: reportTitles[reportType],
    scopeWalletLabel,
    scopeOwnerLabel,
    saldoAwal,
    saldoAkhir,
    totalIncome,
    totalExpense,
    netMutation: netInPeriod,
    netCashflow: totalIncome - totalExpense,
    matchingTxCount,
    budgetPeriodCount: activeMonths.length,
    budgetItemCount: matchingBudgets.length,
    totalBudgetLimit,
    totalBudgetRealized,
    budgetAbsorptionRate,
  };
}

export function generateAnalyticsPdfDocument(payload: GeneratePdfReportPayload): string {
  const {
    reportType,
    startIso,
    endIso,
    periodRangeLabel,
    rangeModeLabel,
    selectedWalletId,
    selectedOwnerName,
    wallets,
    walletOwners,
    allTransactions,
    budgets,
    formatMoney,
    userDisplayName,
    userEmail,
  } = payload;

  const preview = computePdfReportPreview(payload);

  // Use Portrait for Formal Reconciliation & Budget Absorption, and Landscape for multi-column General Cash Ledger
  const orientation = reportType === 'kas_umum' ? 'landscape' : 'portrait';
  const doc = new jsPDF({
    orientation,
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;

  // =========================================================================
  // 1. Official Report Header Banner (For Kas Umum & Realisasi Anggaran)
  // =========================================================================
  let currentY = 42;
  if (reportType !== 'rekonsiliasi_kas') {
    doc.setFillColor(5, 150, 105); // Emerald 600
    doc.roundedRect(marginX, 12, pageWidth - marginX * 2, 24, 3, 3, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(preview.reportTitle.toUpperCase(), marginX + 5, 21);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(
      `Sisa Uang — Your Finance Assistant · Periode Aktif: ${periodRangeLabel} (${rangeModeLabel})`,
      marginX + 5,
      27
    );
    doc.text(
      `Cakupan Sumber Dana: ${preview.scopeWalletLabel}   |   Cakupan Kepemilikan: ${preview.scopeOwnerLabel}`,
      marginX + 5,
      32.5
    );

    const printedAtStr = new Date().toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    doc.setFontSize(8);
    doc.text(`Dicetak: ${printedAtStr}`, pageWidth - marginX - 5, 21, { align: 'right' });
    doc.text(
      `Akun: ${userDisplayName} (${userEmail})`,
      pageWidth - marginX - 5,
      27,
      { align: 'right' }
    );
  }

  // =========================================================================
  // REPORT TYPE 1: LAPORAN KAS UMUM (BUKU KAS UMUM / MUTASI KAS)
  // =========================================================================
  if (reportType === 'kas_umum') {
    // Executive Summary Table
    autoTable(doc, {
      startY: currentY,
      margin: { left: marginX, right: marginX },
      head: [
        [
          'Saldo Awal Periode',
          'Total Pemasukan',
          'Total Pengeluaran',
          'Mutasi Bersih Periode',
          'Saldo Akhir Periode',
        ],
      ],
      body: [
        [
          formatMoney(preview.saldoAwal),
          `+${formatMoney(preview.totalIncome)}`,
          `-${formatMoney(preview.totalExpense)}`,
          `${preview.netMutation >= 0 ? '+' : ''}${formatMoney(preview.netMutation)}`,
          formatMoney(preview.saldoAkhir),
        ],
      ],
      theme: 'grid',
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontSize: 8.5,
        fontStyle: 'bold',
        halign: 'center',
      },
      bodyStyles: {
        fontSize: 9.5,
        fontStyle: 'bold',
        halign: 'center',
        textColor: [15, 23, 42],
      },
    });

    currentY = (doc as any).lastAutoTable.finalY + 6;

    // Sort matching transactions in chronological order (oldest -> newest) so running balance flows naturally
    const chronologicalTx = allTransactions
      .filter((tx) => {
        if (tx.deleted) return false;
        const d = String(tx.date || '').slice(0, 10);
        if (d < startIso || d > endIso) return false;
        return doesTxMatchScope(tx, selectedWalletId, selectedOwnerName);
      })
      .slice()
      .sort((a, b) => {
        const cmp = String(a.date || '').localeCompare(String(b.date || ''));
        if (cmp !== 0) return cmp;
        return String(a.id || '').localeCompare(String(b.id || ''));
      });

    let runningBalance = preview.saldoAwal;
    let totalDebitIn = 0;
    let totalCreditOut = 0;

    const ledgerRows: any[][] = [
      [
        '-',
        formatDateId(startIso),
        'SALDO AWAL',
        '-',
        '-',
        '-',
        `Saldo awal periode (${preview.scopeWalletLabel} · ${preview.scopeOwnerLabel})`,
        '-',
        '-',
        formatMoney(runningBalance),
      ],
    ];

    chronologicalTx.forEach((tx, idx) => {
      const { debitIn, creditOut, netDelta, typeLabel } = getScopeLedgerDebitCredit(
        tx,
        selectedWalletId,
        selectedOwnerName
      );
      runningBalance += netDelta;
      totalDebitIn += debitIn;
      totalCreditOut += creditOut;

      const srcWallet = tx.walletName || '-';
      const srcOwner = formatHolderName(tx.fundOwnerName);
      const dstWallet = tx.toWalletName || tx.walletName || '-';
      const dstOwner = tx.toFundOwnerName ? formatHolderName(tx.toFundOwnerName) : srcOwner;

      const walletCol =
        tx.type === 'transfer' && srcWallet !== dstWallet
          ? `${srcWallet} -> ${dstWallet}`
          : srcWallet;
      const ownerCol =
        tx.type === 'transfer' && srcOwner !== dstOwner
          ? `${srcOwner} -> ${dstOwner}`
          : srcOwner;

      const noteStr =
        tx.type === 'transfer' && Number(tx.adminFee || 0) > 0
          ? `${tx.note || '-'} (Termasuk Biaya Admin ${formatMoney(Number(tx.adminFee))})`
          : tx.note || '-';

      ledgerRows.push([
        String(idx + 1),
        formatDateId(tx.date),
        typeLabel,
        tx.category || '-',
        walletCol,
        ownerCol,
        noteStr,
        debitIn > 0 ? `+${formatMoney(debitIn)}` : '-',
        creditOut > 0 ? `-${formatMoney(creditOut)}` : '-',
        formatMoney(runningBalance),
      ]);
    });

    // Footer Total Row
    ledgerRows.push([
      '',
      '',
      'TOTAL MUTASI & SALDO AKHIR',
      '',
      '',
      '',
      `${chronologicalTx.length} Transaksi pada periode aktif`,
      `+${formatMoney(totalDebitIn)}`,
      `-${formatMoney(totalCreditOut)}`,
      formatMoney(runningBalance),
    ]);

    autoTable(doc, {
      startY: currentY,
      margin: { left: marginX, right: marginX },
      head: [
        [
          'No',
          'Tanggal',
          'Jenis Mutasi',
          'Kategori',
          'Sumber Dana',
          'Pemilik Dana',
          'Keterangan / Catatan',
          'Kas Masuk (Debit)',
          'Kas Keluar (Kredit)',
          'Saldo Berjalan',
        ],
      ],
      body: ledgerRows,
      theme: 'striped',
      headStyles: {
        fillColor: [5, 150, 105],
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: 'bold',
      },
      bodyStyles: {
        fontSize: 7.5,
        textColor: [30, 41, 59],
      },
      columnStyles: {
        0: { cellWidth: 9, halign: 'center' },
        1: { cellWidth: 22 },
        2: { cellWidth: 25 },
        3: { cellWidth: 26 },
        4: { cellWidth: 28 },
        5: { cellWidth: 25 },
        6: { cellWidth: 'auto' },
        7: { cellWidth: 28, halign: 'right' },
        8: { cellWidth: 28, halign: 'right' },
        9: { cellWidth: 30, halign: 'right', fontStyle: 'bold' },
      },
      didParseCell(data) {
        if (data.section === 'body') {
          // Highlight First Row (Saldo Awal) and Last Row (Total & Saldo Akhir)
          if (data.row.index === 0 || data.row.index === ledgerRows.length - 1) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [236, 253, 245];
            data.cell.styles.textColor = [6, 95, 70];
          }
        }
      },
    });
  }

  // =========================================================================
  // REPORT TYPE 2: LAPORAN REKONSILIASI KAS (FORMAL VERTICAL STATEMENT FORMAT)
  // =========================================================================
  if (reportType === 'rekonsiliasi_kas') {
    const activeWallets = wallets.filter((w) => !w.deleted);
    const activeWalletMap = new Map(activeWallets.map((w) => [w.id, w]));

    const currencySample = formatMoney(0);
    const currencySymbol = currencySample.includes('$') ? '$' : 'Rp';

    // Determine formal scope title
    let scopeTitleLine = 'SELURUH SUMBER DANA & KEPEMILIKAN';
    if (selectedWalletId !== 'all' && selectedOwnerName !== 'all') {
      scopeTitleLine = `${preview.scopeWalletLabel.toUpperCase()} — KEPEMILIKAN: ${preview.scopeOwnerLabel.toUpperCase()}`;
    } else if (selectedWalletId !== 'all') {
      scopeTitleLine = `SUMBER DANA: ${preview.scopeWalletLabel.toUpperCase()} (SEMUA KEPEMILIKAN)`;
    } else if (selectedOwnerName !== 'all') {
      scopeTitleLine = `KEPEMILIKAN DANA: ${preview.scopeOwnerLabel.toUpperCase()} (SEMUA SUMBER DANA)`;
    }

    const startLongStr = formatLongDateId(startIso);
    const endLongStr = formatLongDateId(endIso);
    const startYear = String(startIso || '').slice(0, 4);
    const endYear = String(endIso || '').slice(0, 4);
    const tahunAnggaranLabel =
      startYear === endYear ? `TAHUN ANGGARAN ${startYear}` : `TAHUN ANGGARAN ${startYear} - ${endYear}`;

    // Centered Formal Document Title inside Rounded Emerald Banner (Fresh & Formal)
    const centerX = pageWidth / 2;
    doc.setFillColor(5, 150, 105); // Emerald 600
    doc.roundedRect(marginX, 12, pageWidth - marginX * 2, 26, 3.5, 3.5, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('LAPORAN REKONSILIASI KAS', centerX, 19.5, { align: 'center' });
    doc.setFontSize(9.5);
    doc.text(`SALDO DANA (${scopeTitleLine})`, centerX, 25, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.8);
    doc.text(`PERIODE ${startLongStr} s/d ${endLongStr}`, centerX, 30.2, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.8);
    doc.text(tahunAnggaranLabel, centerX, 35, { align: 'center' });

    // Formal Opening Statement (Strictly Report style, not Berita Acara)
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    const introText = `Berikut adalah hasil rekonsiliasi atas saldo awal, mutasi penambahan, mutasi pengurangan, dan saldo akhir dana (${preview.scopeWalletLabel} · ${preview.scopeOwnerLabel}) untuk Periode ${startLongStr} s/d ${endLongStr}, dengan rincian sebagai berikut :`;
    const splitIntro = doc.splitTextToSize(introText, pageWidth - marginX * 2);
    doc.text(splitIntro, marginX, 45);

    currentY = 45 + splitIntro.length * 4.5 + 2;

    // Filter wallet_owners units matching the selected scope
    const targetUnits = walletOwners
      .filter((fo) => {
        if (fo.deleted) return false;
        if (!activeWalletMap.has(fo.walletId)) return false;
        if (selectedWalletId !== 'all' && fo.walletId !== selectedWalletId) return false;
        if (
          selectedOwnerName !== 'all' &&
          formatHolderName(fo.holderName) !== selectedOwnerName
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        const wA = activeWalletMap.get(a.walletId)?.name || a.walletName || '';
        const wB = activeWalletMap.get(b.walletId)?.name || b.walletName || '';
        const cmp = wA.localeCompare(wB);
        if (cmp !== 0) return cmp;
        return formatHolderName(a.holderName).localeCompare(formatHolderName(b.holderName));
      });

    // Compute Opening & Ending Balance per Unit (Sumber Dana + Kepemilikan)
    const unitMetrics = targetUnits.map((unit) => {
      const wId = unit.walletId;
      const wName = activeWalletMap.get(wId)?.name || unit.walletName || 'Sumber Dana';
      const oName = formatHolderName(unit.holderName);
      const liveUnitBalance = Number(unit.balance || 0);

      let unitNetAfterEnd = 0;
      let unitNetInPeriod = 0;

      for (const tx of allTransactions) {
        if (tx.deleted) continue;
        const d = String(tx.date || '').slice(0, 10);
        if (d > endIso) {
          unitNetAfterEnd += getScopeNetDeltaForTx(tx, wId, oName);
        } else if (d >= startIso && d <= endIso) {
          unitNetInPeriod += getScopeNetDeltaForTx(tx, wId, oName);
        }
      }

      const unitSaldoAkhir = liveUnitBalance - unitNetAfterEnd;
      const unitSaldoAwal = unitSaldoAkhir - unitNetInPeriod;

      return {
        label:
          selectedWalletId === 'all' && selectedOwnerName === 'all'
            ? `${wName} — ${oName}`
            : selectedWalletId === 'all'
            ? `Saldo ${wName} (${oName})`
            : selectedOwnerName === 'all'
            ? `Kepemilikan ${oName} (${wName})`
            : `${wName} (${oName})`,
        saldoAwal: unitSaldoAwal,
        saldoAkhir: unitSaldoAkhir,
      };
    });

    // Compute Mutasi Penambahan (Income Categories + Cross-Scope Transfer Masuk)
    // and Mutasi Pengurangan (Expense Categories with Sub-Items by Sumber Dana/Pemilik + Cross-Scope Transfer Keluar + Biaya Admin)
    const incomeCategoryMap = new Map<string, number>();
    let crossScopeTransferIn = 0;

    const expenseCategoryMap = new Map<
      string,
      { total: number; subBreakdown: Map<string, number> }
    >();
    let crossScopeTransferOut = 0;
    let totalBiayaAdminTransfer = 0;

    for (const tx of allTransactions) {
      if (tx.deleted) continue;
      const d = String(tx.date || '').slice(0, 10);
      if (d < startIso || d > endIso) continue;

      const inSrc = doesTxTouchScopeAsSource(tx, selectedWalletId, selectedOwnerName);
      const inDst = doesTxTouchScopeAsDest(tx, selectedWalletId, selectedOwnerName);

      if (tx.type === 'income' && inSrc) {
        const cat = tx.category || 'Pemasukan Lainnya';
        incomeCategoryMap.set(cat, (incomeCategoryMap.get(cat) || 0) + Number(tx.amount || 0));
      } else if (tx.type === 'expense' && inSrc) {
        const cat = tx.category || 'Pengeluaran Lainnya';
        const entry = expenseCategoryMap.get(cat) || {
          total: 0,
          subBreakdown: new Map<string, number>(),
        };
        const amt = Number(tx.amount || 0);
        entry.total += amt;

        const wName = tx.walletName || 'Sumber Dana';
        const oName = formatHolderName(tx.fundOwnerName);
        const subKey = `${wName} (${oName})`;
        entry.subBreakdown.set(subKey, (entry.subBreakdown.get(subKey) || 0) + amt);
        expenseCategoryMap.set(cat, entry);
      } else if (tx.type === 'transfer') {
        const amt = Number(tx.amount || 0);
        const fee = Number(tx.adminFee || 0);
        if (inDst && !inSrc) {
          crossScopeTransferIn += amt;
        }
        if (inSrc && !inDst) {
          crossScopeTransferOut += amt;
        }
        if (inSrc && fee > 0) {
          totalBiayaAdminTransfer += fee;
        }
      }
    }

    const sortedIncomeCats = Array.from(incomeCategoryMap.entries()).sort((a, b) => b[1] - a[1]);
    const sortedExpenseCats = Array.from(expenseCategoryMap.entries()).sort(
      (a, b) => b[1].total - a[1].total
    );

    const totalMutasiPenambahan =
      sortedIncomeCats.reduce((s, [, v]) => s + v, 0) + crossScopeTransferIn;
    const totalMutasiPengurangan =
      sortedExpenseCats.reduce((s, [, v]) => s + v.total, 0) +
      crossScopeTransferOut +
      totalBiayaAdminTransfer;

    const saldoAwalHitung = preview.saldoAwal;
    const saldoAkhirHitung = saldoAwalHitung + totalMutasiPenambahan - totalMutasiPengurangan;
    const saldoSistemAktual = preview.saldoAkhir;
    const selisihRekonsiliasi = saldoSistemAktual - saldoAkhirHitung;

    // Build Structured Rows for the Formal Boxed Reconciliation Table
    interface FormalReconRowMeta {
      kind:
        | 'section_banner'
        | 'sub_header'
        | 'numbered_item'
        | 'numbered_bold_parent'
        | 'lettered_sub_item'
        | 'subtotal_row'
        | 'full_box_total_row'
        | 'notes_row';
      cells: any[];
    }

    const formalRows: FormalReconRowMeta[] = [];

    const fmtAmt = (val: number) => formatFormalAccountingNumber(val, currencySymbol);

    // --- SECTION 1: SALDO AWAL ---
    formalRows.push({
      kind: 'section_banner',
      cells: [
        {
          content: 'SALDO AWAL DANA',
          colSpan: 4,
          styles: { halign: 'center', fontStyle: 'bold' },
        },
      ],
    });

    if (unitMetrics.length > 0) {
      unitMetrics.forEach((u, idx) => {
        const f = fmtAmt(u.saldoAwal);
        formalRows.push({
          kind: 'numbered_item',
          cells: [`${idx + 1}.`, `Saldo Awal ${u.label}`, f.symbol, f.formattedNumber],
        });
      });
    } else {
      const f = fmtAmt(saldoAwalHitung);
      formalRows.push({
        kind: 'numbered_item',
        cells: ['1.', 'Saldo Awal Periode', f.symbol, f.formattedNumber],
      });
    }

    {
      const f = fmtAmt(0);
      formalRows.push({
        kind: 'numbered_item',
        cells: [`${Math.max(1, unitMetrics.length) + 1}.`, 'Koreksi Saldo Awal', f.symbol, f.formattedNumber],
      });
    }

    {
      const f = fmtAmt(saldoAwalHitung);
      formalRows.push({
        kind: 'subtotal_row',
        cells: [
          {
            content: 'Jumlah Saldo Awal Dana',
            colSpan: 2,
            styles: { fontStyle: 'bold' },
          },
          f.symbol,
          f.formattedNumber,
        ],
      });
    }

    // --- SECTION 2: MUTASI DANA ---
    formalRows.push({
      kind: 'section_banner',
      cells: [
        {
          content: 'MUTASI DANA',
          colSpan: 4,
          styles: { halign: 'center', fontStyle: 'bold' },
        },
      ],
    });

    // A. Mutasi Penambahan
    formalRows.push({
      kind: 'sub_header',
      cells: [
        'A.',
        { content: 'Mutasi Penambahan', colSpan: 3, styles: { fontStyle: 'bold' } },
      ],
    });

    let addIdx = 1;
    if (sortedIncomeCats.length > 0) {
      for (const [catName, amt] of sortedIncomeCats) {
        const f = fmtAmt(amt);
        formalRows.push({
          kind: 'numbered_item',
          cells: [`    ${addIdx}.`, `Penerimaan Kategori: ${catName}`, f.symbol, f.formattedNumber],
        });
        addIdx++;
      }
    } else {
      const f = fmtAmt(0);
      formalRows.push({
        kind: 'numbered_item',
        cells: [`    ${addIdx}.`, 'Penerimaan / Pemasukan Periode', f.symbol, f.formattedNumber],
      });
      addIdx++;
    }

    {
      const f = fmtAmt(crossScopeTransferIn);
      formalRows.push({
        kind: 'numbered_item',
        cells: [
          `    ${addIdx}.`,
          'Mutasi Transfer Masuk (Lintas Sumber Dana / Kepemilikan)',
          f.symbol,
          f.formattedNumber,
        ],
      });
    }

    {
      const f = fmtAmt(totalMutasiPenambahan);
      formalRows.push({
        kind: 'subtotal_row',
        cells: [
          {
            content: 'Jumlah Mutasi Penambahan',
            colSpan: 2,
            styles: { fontStyle: 'bold' },
          },
          f.symbol,
          f.formattedNumber,
        ],
      });
    }

    // B. Mutasi Pengurangan
    formalRows.push({
      kind: 'sub_header',
      cells: [
        'B.',
        { content: 'Mutasi Pengurangan', colSpan: 3, styles: { fontStyle: 'bold' } },
      ],
    });

    let subIdx = 1;
    if (sortedExpenseCats.length > 0) {
      for (const [catName, info] of sortedExpenseCats) {
        const fParent = fmtAmt(info.total);
        formalRows.push({
          kind: 'numbered_bold_parent',
          cells: [`    ${subIdx}.`, `Pengeluaran Kategori: ${catName}`, fParent.symbol, fParent.formattedNumber],
        });

        // Sub-items a., b., c. showing breakdown per Sumber Dana (Pemilik) just like "a. BOS Reguler" in reference PDF
        const subEntries = Array.from(info.subBreakdown.entries()).sort((a, b) => b[1] - a[1]);
        subEntries.forEach(([subLabel, subAmt], sIdx) => {
          const letter = String.fromCharCode(97 + (sIdx % 26));
          const fSub = fmtAmt(subAmt);
          formalRows.push({
            kind: 'lettered_sub_item',
            cells: ['', `    ${letter}. ${subLabel}`, fSub.symbol, fSub.formattedNumber],
          });
        });

        subIdx++;
      }
    } else {
      const f = fmtAmt(0);
      formalRows.push({
        kind: 'numbered_item',
        cells: [`    ${subIdx}.`, 'Belanja / Pengeluaran Operasional', f.symbol, f.formattedNumber],
      });
      subIdx++;
    }

    // Transfer Keluar & Biaya Admin Transfer
    {
      const fOut = fmtAmt(crossScopeTransferOut);
      formalRows.push({
        kind: 'numbered_item',
        cells: [
          `    ${subIdx}.`,
          'Mutasi Transfer Keluar (Lintas Sumber Dana / Kepemilikan)',
          fOut.symbol,
          fOut.formattedNumber,
        ],
      });
      subIdx++;

      const fFee = fmtAmt(totalBiayaAdminTransfer);
      formalRows.push({
        kind: 'numbered_item',
        cells: [`    ${subIdx}.`, 'Biaya Admin Transfer', fFee.symbol, fFee.formattedNumber],
      });
    }

    {
      const f = fmtAmt(totalMutasiPengurangan);
      formalRows.push({
        kind: 'subtotal_row',
        cells: [
          {
            content: 'Jumlah Mutasi Pengurangan',
            colSpan: 2,
            styles: { fontStyle: 'bold' },
          },
          f.symbol,
          f.formattedNumber,
        ],
      });
    }

    // --- SECTION 3: SALDO AKHIR ---
    formalRows.push({
      kind: 'section_banner',
      cells: [
        {
          content: 'SALDO AKHIR',
          colSpan: 4,
          styles: { halign: 'center', fontStyle: 'bold' },
        },
      ],
    });

    if (unitMetrics.length > 0) {
      unitMetrics.forEach((u, idx) => {
        const f = fmtAmt(u.saldoAkhir);
        formalRows.push({
          kind: 'numbered_item',
          cells: [`    ${idx + 1}.`, `Saldo Akhir ${u.label}`, f.symbol, f.formattedNumber],
        });
      });
    } else {
      const f = fmtAmt(saldoAkhirHitung);
      formalRows.push({
        kind: 'numbered_item',
        cells: ['    1.', 'Saldo Akhir Dana', f.symbol, f.formattedNumber],
      });
    }

    {
      const fAkhir = fmtAmt(saldoAkhirHitung);
      formalRows.push({
        kind: 'subtotal_row',
        cells: [
          {
            content: 'Jumlah Saldo Akhir',
            colSpan: 2,
            styles: { fontStyle: 'bold' },
          },
          fAkhir.symbol,
          fAkhir.formattedNumber,
        ],
      });

      const fAktual = fmtAmt(saldoSistemAktual);
      formalRows.push({
        kind: 'full_box_total_row',
        cells: [
          {
            content: 'Saldo Sistem / Rekening Aktual',
            colSpan: 2,
            styles: { fontStyle: 'bold' },
          },
          fAktual.symbol,
          fAktual.formattedNumber,
        ],
      });

      const fSelisih = fmtAmt(selisihRekonsiliasi);
      formalRows.push({
        kind: 'full_box_total_row',
        cells: [
          {
            content: 'Selisih',
            colSpan: 2,
            styles: { fontStyle: 'bold' },
          },
          fSelisih.symbol,
          fSelisih.formattedNumber,
        ],
      });

      const penjelasanText =
        selisihRekonsiliasi === 0
          ? 'Penjelasan : Saldo akhir hasil perhitungan mutasi telah sesuai dan seimbang (Selisih Rp 0,00) dengan saldo aktual pada sistem Sisa Uang.'
          : `Penjelasan : Terdapat selisih sebesar ${formatMoney(selisihRekonsiliasi)} antara perhitungan mutasi dengan saldo sistem.`;

      formalRows.push({
        kind: 'notes_row',
        cells: [
          {
            content: penjelasanText,
            colSpan: 4,
            styles: { fontStyle: 'normal' },
          },
        ],
      });
    }

    const tableWidth = pageWidth - marginX * 2;

    autoTable(doc, {
      startY: currentY,
      margin: { left: marginX, right: marginX, bottom: 18 },
      body: formalRows.map((r) => r.cells),
      theme: 'plain',
      styles: {
        font: 'helvetica',
        fontSize: 9,
        textColor: [0, 0, 0],
        cellPadding: { top: 1.8, bottom: 1.8, left: 2.5, right: 2.5 },
        lineColor: [0, 0, 0],
        lineWidth: 0,
      },
      columnStyles: {
        0: { cellWidth: 14, halign: 'left' },
        1: { cellWidth: tableWidth - 14 - 10 - 38, halign: 'left' },
        2: { cellWidth: 10, halign: 'left' },
        3: { cellWidth: 38, halign: 'right' },
      },
      didParseCell(data) {
        if (data.section !== 'body') return;
        const meta = formalRows[data.row.index];
        if (!meta) return;

        if (meta.kind === 'section_banner') {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.halign = 'center';
          data.cell.styles.cellPadding = { top: 2.2, bottom: 2.2, left: 2.5, right: 2.5 };
        } else if (meta.kind === 'sub_header') {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.cellPadding = { top: 2.2, bottom: 1.5, left: 2.5, right: 2.5 };
        } else if (meta.kind === 'numbered_bold_parent') {
          if (data.column.index >= 1) {
            data.cell.styles.fontStyle = 'bold';
          }
        } else if (meta.kind === 'subtotal_row' || meta.kind === 'full_box_total_row') {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.cellPadding = { top: 2.2, bottom: 2.2, left: 2.5, right: 2.5 };
        } else if (meta.kind === 'notes_row') {
          data.cell.styles.cellPadding = { top: 2.5, bottom: 3.5, left: 2.5, right: 2.5 };
        }
      },
      didDrawCell(data) {
        if (data.section !== 'body') return;
        const meta = formalRows[data.row.index];
        if (!meta) return;

        const { x, y, width, height } = data.cell;
        const isFirstCol = data.column.index === 0;
        const isLastCol =
          data.column.index + (data.cell.colSpan || 1) - 1 === 3;

        doc.setDrawColor(0, 0, 0);

        // Outer Left & Right borders of the formal boxed statement
        if (isFirstCol) {
          doc.setLineWidth(0.3);
          doc.line(x, y, x, y + height);
        }
        if (isLastCol) {
          doc.setLineWidth(0.3);
          doc.line(x + width, y, x + width, y + height);
        }

        // Top & Bottom Horizontal Borders for Section Banners, Full Box Totals, and Notes Row
        if (
          meta.kind === 'section_banner' ||
          meta.kind === 'full_box_total_row' ||
          meta.kind === 'notes_row'
        ) {
          doc.setLineWidth(0.35);
          doc.line(x, y, x + width, y);
          doc.line(x, y + height, x + width, y + height);
        }

        // Subtotal rows: full bottom line across the entire row, plus short accounting sum line above columns 2 & 3 (Rp + Amount)
        if (meta.kind === 'subtotal_row') {
          doc.setLineWidth(0.35);
          doc.line(x, y + height, x + width, y + height);
          if (data.column.index === 2 || data.column.index === 3) {
            doc.setLineWidth(0.3);
            doc.line(x, y, x + width, y);
          }
        }

        // Sub-header "B. Mutasi Pengurangan": draw top divider line
        if (meta.kind === 'sub_header' && data.row.index > 0) {
          doc.setLineWidth(0.25);
          doc.line(x, y, x + width, y);
        }
      },
    });

    // Formal Closing Statement (Strictly Report style, NO Berita Acara wording)
    currentY = (doc as any).lastAutoTable.finalY + 5;
    if (currentY > pageHeight - 25) {
      doc.addPage();
      currentY = 20;
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(0, 0, 0);
    const closingText =
      'Demikian Laporan Rekonsiliasi Kas ini disusun dengan sebenarnya berdasarkan data transaksi tercatat dan dapat diperbarui apabila diperlukan.';
    const splitClosing = doc.splitTextToSize(closingText, pageWidth - marginX * 2);
    doc.text(splitClosing, marginX, currentY);
  }

  // =========================================================================
  // REPORT TYPE 3: LAPORAN REALISASI / SERAPAN ANGGARAN
  // =========================================================================
  if (reportType === 'realisasi_anggaran') {
    const activeMonths = getMonthsBetween(startIso, endIso);
    const activeMonthsSet = new Set(activeMonths);

    const activeBudgetDocs = budgets
      .filter(
        (b) =>
          !b.deleted &&
          b.category !== BUDGET_PERIOD_MARKER_CATEGORY &&
          activeMonthsSet.has(b.period)
      )
      .sort((a, b) => {
        const cmp = a.period.localeCompare(b.period);
        if (cmp !== 0) return cmp;
        return a.category.localeCompare(b.category);
      });

    // Summary Table
    const netVariance = preview.totalBudgetLimit - preview.totalBudgetRealized;
    autoTable(doc, {
      startY: currentY,
      margin: { left: marginX, right: marginX },
      head: [
        [
          'Total Pagu Anggaran',
          'Total Realisasi (Terpakai)',
          'Selisih (Sisa / Lebih)',
          'Persentase Serapan Total',
        ],
      ],
      body: [
        [
          formatMoney(preview.totalBudgetLimit),
          formatMoney(preview.totalBudgetRealized),
          `${netVariance >= 0 ? 'Sisa ' : 'Lebih (Over) '}${formatMoney(Math.abs(netVariance))}`,
          `${preview.budgetAbsorptionRate}%`,
        ],
      ],
      theme: 'grid',
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontSize: 8.5,
        fontStyle: 'bold',
        halign: 'center',
      },
      bodyStyles: {
        fontSize: 9,
        fontStyle: 'bold',
        halign: 'center',
        textColor: [15, 23, 42],
      },
    });

    currentY = (doc as any).lastAutoTable.finalY + 6;

    const budgetRows: any[][] = [];
    const budgetedKeys = new Set<string>();

    activeBudgetDocs.forEach((b, idx) => {
      const key = `${b.period}__${b.category.trim().toLowerCase()}`;
      budgetedKeys.add(key);

      const realized = allTransactions
        .filter((tx) => {
          if (tx.deleted || tx.type !== 'expense') return false;
          const d = String(tx.date || '').slice(0, 10);
          const ym = d.slice(0, 7);
          if (ym !== b.period) return false;
          if (d < startIso || d > endIso) return false;
          if (!doesTxTouchScopeAsSource(tx, selectedWalletId, selectedOwnerName)) return false;
          return tx.category.trim().toLowerCase() === b.category.trim().toLowerCase();
        })
        .reduce((s, tx) => s + Number(tx.amount || 0), 0);

      const limit = Number(b.limitAmount || 0);
      const diff = limit - realized;
      const pct = limit > 0 ? Math.round((realized / limit) * 100) : 0;

      let statusLabel = 'Aman';
      if (realized > limit || pct > 100) statusLabel = 'Melebihi Pagu (Over)';
      else if (pct === 100) statusLabel = 'Tepat Pagu (100%)';
      else if (pct >= 80) statusLabel = 'Waspada (>=80%)';

      budgetRows.push([
        String(idx + 1),
        formatPeriodLabel(b.period, 'id-ID'),
        b.category,
        formatMoney(limit),
        formatMoney(realized),
        diff >= 0
          ? `Sisa ${formatMoney(diff)}`
          : `Lebih ${formatMoney(Math.abs(diff))}`,
        `${pct}%`,
        statusLabel,
      ]);
    });

    if (budgetRows.length === 0) {
      budgetRows.push([
        '-',
        '-',
        'Belum ada anggaran yang ditetapkan pada periode ini',
        formatMoney(0),
        formatMoney(0),
        formatMoney(0),
        '0%',
        '-',
      ]);
    } else {
      budgetRows.push([
        '',
        'TOTAL ANGGARAN',
        `${activeBudgetDocs.length} Kategori Anggaran`,
        formatMoney(preview.totalBudgetLimit),
        formatMoney(preview.totalBudgetRealized),
        netVariance >= 0
          ? `Sisa ${formatMoney(netVariance)}`
          : `Lebih ${formatMoney(Math.abs(netVariance))}`,
        `${preview.budgetAbsorptionRate}%`,
        preview.totalBudgetRealized > preview.totalBudgetLimit
          ? 'OVER BUDGET'
          : 'TERKENDALI',
      ]);
    }

    autoTable(doc, {
      startY: currentY,
      margin: { left: marginX, right: marginX },
      head: [
        [
          'No',
          'Periode Bulan',
          'Kategori Anggaran',
          'Pagu Anggaran',
          'Realisasi (Terpakai)',
          'Sisa / Lebih',
          'Serapan (%)',
          'Status Evaluasi',
        ],
      ],
      body: budgetRows,
      theme: 'striped',
      headStyles: {
        fillColor: [5, 150, 105],
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: 'bold',
      },
      bodyStyles: {
        fontSize: 7.8,
        textColor: [30, 41, 59],
      },
      columnStyles: {
        0: { cellWidth: 9, halign: 'center' },
        1: { cellWidth: 26 },
        2: { cellWidth: 32, fontStyle: 'bold' },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { cellWidth: 18, halign: 'center', fontStyle: 'bold' },
        7: { cellWidth: 28, halign: 'center', fontStyle: 'bold' },
      },
      didParseCell(data) {
        if (
          data.section === 'body' &&
          activeBudgetDocs.length > 0 &&
          data.row.index === budgetRows.length - 1
        ) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [236, 253, 245];
          data.cell.styles.textColor = [6, 95, 70];
        }
      },
    });

    // Also include unbudgeted expenses in the active period & scope so user has full visibility
    const unbudgetedMap = new Map<string, { period: string; category: string; amount: number }>();
    for (const tx of allTransactions) {
      if (tx.deleted || tx.type !== 'expense') continue;
      const d = String(tx.date || '').slice(0, 10);
      if (d < startIso || d > endIso) continue;
      if (!doesTxTouchScopeAsSource(tx, selectedWalletId, selectedOwnerName)) continue;

      const ym = d.slice(0, 7);
      const key = `${ym}__${tx.category.trim().toLowerCase()}`;
      if (!budgetedKeys.has(key)) {
        const existing = unbudgetedMap.get(key) || {
          period: ym,
          category: tx.category,
          amount: 0,
        };
        existing.amount += Number(tx.amount || 0);
        unbudgetedMap.set(key, existing);
      }
    }

    const unbudgetedList = Array.from(unbudgetedMap.values()).sort((a, b) => b.amount - a.amount);
    if (unbudgetedList.length > 0) {
      currentY = (doc as any).lastAutoTable.finalY + 8;
      const totalUnbudgeted = unbudgetedList.reduce((s, u) => s + u.amount, 0);
      const unbudgetedRows = unbudgetedList.map((u, idx) => [
        String(idx + 1),
        formatPeriodLabel(u.period, 'id-ID'),
        u.category,
        formatMoney(u.amount),
        'Pengeluaran di Luar Pagu Anggaran',
      ]);
      unbudgetedRows.push([
        '',
        'TOTAL NON-ANGGARAN',
        `${unbudgetedList.length} Kategori`,
        formatMoney(totalUnbudgeted),
        'Belum Dianggarkan',
      ]);

      autoTable(doc, {
        startY: currentY,
        margin: { left: marginX, right: marginX },
        head: [
          [
            'No',
            'Periode Bulan',
            'Kategori Pengeluaran Non-Anggaran',
            'Total Nominal Pengeluaran',
            'Keterangan',
          ],
        ],
        body: unbudgetedRows,
        theme: 'grid',
        headStyles: {
          fillColor: [71, 85, 105],
          textColor: [255, 255, 255],
          fontSize: 7.8,
          fontStyle: 'bold',
        },
        bodyStyles: {
          fontSize: 7.5,
        },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          3: { halign: 'right', fontStyle: 'bold' },
        },
      });
    }
  }

  // =========================================================================
  // Page Numbers & Footer Stamp on Every Page
  // =========================================================================
  const totalPages = doc.getNumberOfPages();
  const generatedTimestamp = new Date().toLocaleString('en-US', {
    month: 'long',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(120, 120, 120);
    doc.text(
      `Dokumen dibuat melalui Sisa Uang - Your Finance Assistant Pada ${generatedTimestamp}`,
      marginX,
      pageHeight - 8
    );
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Halaman ${p} dari ${totalPages}`,
      pageWidth - marginX,
      pageHeight - 8,
      { align: 'right' }
    );
  }

  const safePeriodSlug = `${startIso}_sd_${endIso}`;
  const fileName = `SisaUang_${reportType}_${safePeriodSlug}.pdf`;
  doc.save(fileName);
  return fileName;
}
