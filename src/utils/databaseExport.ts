/**
 * Database Export & Backup Utilities for SisaUang Super Admin
 * Supports Full Firestore Database JSON Backups, Single Collection JSON, and CSV for Spreadsheets.
 */

export interface DatabaseBackupMetadata {
  appName: string;
  appVersion: string;
  exportType: 'full_database_backup' | 'single_collection' | 'filtered_query';
  databaseId: string;
  projectId: string;
  exportedAt: string;
  exportedBy: string;
  totalCollections: number;
  totalDocuments: number;
  collectionsSummary: Record<string, number>;
  filtersApplied?: {
    collection?: string;
    searchQuery?: string;
    softDeleteFilter?: string;
    whereClauseSql?: string;
    totalFiltered?: number;
    totalUnfiltered?: number;
  };
}

export interface FullDatabaseBackupPayload {
  _metadata: DatabaseBackupMetadata;
  data: Record<string, Record<string, any>[]>;
}

export interface SingleCollectionBackupPayload {
  _metadata: DatabaseBackupMetadata;
  collection: string;
  totalCount: number;
  documents: Record<string, any>[];
}

/**
 * Triggers a native browser file download from a Blob
 */
export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.setAttribute('download', filename);
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  setTimeout(() => {
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, 300);
}

/**
 * Download arbitrary data as formatted JSON
 */
export function downloadJsonFile(data: unknown, filename: string): void {
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
  triggerBlobDownload(blob, filename);
}

/**
 * Convert an array of record objects to CSV string format with UTF-8 BOM
 * Supports automatic field discovery, priority ordering, and quote escaping.
 */
export function convertRecordsToCsv(
  records: Record<string, any>[],
  preferredFieldOrder?: string[]
): string {
  if (!records || records.length === 0) {
    return '';
  }

  // 1. Gather all unique field names
  const fieldSet = new Set<string>();
  if (preferredFieldOrder && preferredFieldOrder.length > 0) {
    preferredFieldOrder.forEach((f) => fieldSet.add(f));
  }

  for (const item of records) {
    if (item && typeof item === 'object') {
      Object.keys(item).forEach((k) => fieldSet.add(k));
    }
  }

  const headers = Array.from(fieldSet);

  // 2. Format CSV cell value
  const formatCell = (val: any): string => {
    if (val === null || val === undefined) {
      return '""';
    }
    if (typeof val === 'boolean' || typeof val === 'number') {
      return String(val);
    }
    if (typeof val === 'object') {
      try {
        const strVal = JSON.stringify(val);
        return `"${strVal.replace(/"/g, '""')}"`;
      } catch {
        return `"${String(val).replace(/"/g, '""')}"`;
      }
    }
    const str = String(val);
    return `"${str.replace(/"/g, '""')}"`;
  };

  // 3. Build CSV rows
  const headerRow = headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(',');
  const dataRows = records.map((row) => {
    return headers.map((headerKey) => formatCell(row[headerKey])).join(',');
  });

  // Prepend UTF-8 Byte Order Mark (BOM) so Excel opens UTF-8 Indonesian accents cleanly
  return `\uFEFF${headerRow}\r\n${dataRows.join('\r\n')}`;
}

/**
 * Download an array of records as a CSV file
 */
export function downloadCsvFile(
  records: Record<string, any>[],
  filename: string,
  preferredFieldOrder?: string[]
): void {
  const csvContent = convertRecordsToCsv(records, preferredFieldOrder);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  triggerBlobDownload(blob, filename);
}

/**
 * Generate formatted timestamp string for filenames: YYYY-MM-DD_HH-mm
 */
export function getBackupTimestampSlug(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = now.getFullYear();
  const month = pad(now.getMonth() + 1);
  const day = pad(now.getDate());
  const hour = pad(now.getHours());
  const min = pad(now.getMinutes());
  return `${year}-${month}-${day}_${hour}-${min}`;
}
