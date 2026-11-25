import { auth } from '../firebase';
import type { TransactionAttachment } from '../stores/finance';
import { useAuthStore } from '../stores/auth';
import { getUserAuthHeaders } from './api';

const ALLOWED_CLIENT_MIME_PREFIXES = ['image/'];
const ALLOWED_CLIENT_EXACT_MIMES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'image/bmp',
]);
const ALLOWED_EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'bmp']);
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export function isSupportedAttachmentFile(file: File): boolean {
  if (!file) return false;
  const mime = String(file.type || '').toLowerCase().trim();
  const ext = String(file.name || '').split('.').pop()?.toLowerCase() || '';
  if (mime === 'image/svg+xml' || ext === 'svg') return false;
  if (ALLOWED_CLIENT_EXACT_MIMES.has(mime)) return true;
  if (ALLOWED_CLIENT_MIME_PREFIXES.some((p) => mime.startsWith(p)) && mime !== 'image/svg+xml') {
    return true;
  }
  return ALLOWED_EXTENSIONS.has(ext);
}

export function formatAttachmentSize(bytes: number): string {
  const n = Number(bytes || 0);
  if (!Number.isFinite(n) || n <= 0) return '0 KB';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function isPdfAttachment(att: Pick<TransactionAttachment, 'mimeType' | 'name'>): boolean {
  return (
    String(att.mimeType || '').toLowerCase() === 'application/pdf' ||
    String(att.name || '').toLowerCase().endsWith('.pdf')
  );
}

async function getAttachmentAuthHeaders(explicitOwnerUid?: string): Promise<{
  headers: Record<string, string>;
  ownerUid: string;
}> {
  const authStore = useAuthStore();
  const ownerUid = (
    explicitOwnerUid ||
    authStore.user?.uid ||
    auth.currentUser?.uid ||
    'guest'
  )
    .trim()
    .replace(/[^a-zA-Z0-9_\-]/g, '_');

  const headers: Record<string, string> = {
    ...getUserAuthHeaders(),
    'x-owner-uid': ownerUid,
  };

  if (auth.currentUser && !auth.currentUser.isAnonymous) {
    try {
      const idToken = await auth.currentUser.getIdToken();
      if (idToken) {
        headers.Authorization = `Bearer ${idToken}`;
      }
    } catch {
      // Ignore idToken error when user session token is active
    }
  }

  if (!headers['x-user-token'] && !headers['x-admin-token'] && !headers.Authorization) {
    throw new Error('Sesi autentikasi belum siap. Silakan muat ulang atau masuk kembali.');
  }

  return { headers, ownerUid };
}

export async function uploadTransactionAttachments(
  files: File[],
  explicitOwnerUid?: string
): Promise<TransactionAttachment[]> {
  if (!Array.isArray(files) || files.length === 0) return [];

  for (const file of files) {
    if (!isSupportedAttachmentFile(file)) {
      throw new Error(
        `Format berkas "${file.name}" tidak didukung. Gunakan file PDF atau gambar (JPG, PNG, WEBP, GIF, HEIC).`
      );
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new Error(
        `Ukuran berkas "${file.name}" melebihi batas maksimal 10 MB.`
      );
    }
  }

  const { headers } = await getAttachmentAuthHeaders(explicitOwnerUid);
  const formData = new FormData();
  for (const file of files) {
    formData.append('files', file, file.name);
  }

  const res = await fetch('/api/transactions/attachments/upload', {
    method: 'POST',
    headers,
    body: formData,
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success || !Array.isArray(data?.attachments)) {
    throw new Error(data?.error || 'Gagal mengunggah bukti pembelanjaan ke penyimpanan cloud.');
  }
  return data.attachments as TransactionAttachment[];
}

export async function fetchTransactionAttachmentBlob(
  att: TransactionAttachment,
  disposition: 'inline' | 'attachment' = 'inline',
  explicitOwnerUid?: string
): Promise<Blob> {
  const { headers } = await getAttachmentAuthHeaders(explicitOwnerUid);
  const params = new URLSearchParams({
    key: att.key,
    disposition,
    name: att.name,
  });
  const res = await fetch(`/api/transactions/attachments/file?${params.toString()}`, {
    method: 'GET',
    headers,
  });
  if (!res.ok) {
    const errJson = await res.json().catch(() => null);
    throw new Error(errJson?.error || 'Gagal mengambil berkas dari penyimpanan cloud.');
  }
  return await res.blob();
}

export async function downloadTransactionAttachment(
  att: TransactionAttachment,
  explicitOwnerUid?: string
): Promise<void> {
  const blob = await fetchTransactionAttachmentBlob(att, 'attachment', explicitOwnerUid);
  const objectUrl = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = att.name || 'bukti-transaksi';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
    }, 4000);
  }
}

export async function deleteTransactionAttachmentFile(
  key: string,
  explicitOwnerUid?: string
): Promise<void> {
  if (!key) return;
  const { headers } = await getAttachmentAuthHeaders(explicitOwnerUid);
  const res = await fetch('/api/transactions/attachments/file', {
    method: 'DELETE',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ key }),
  });
  if (!res.ok) {
    const errJson = await res.json().catch(() => null);
    throw new Error(errJson?.error || 'Gagal menghapus berkas dari penyimpanan cloud.');
  }
}

export async function saveTransactionAttachmentIndex(
  txId: string,
  attachments: TransactionAttachment[],
  explicitOwnerUid?: string
): Promise<void> {
  try {
    const { headers } = await getAttachmentAuthHeaders(explicitOwnerUid);
    await fetch('/api/transactions/attachments/index', {
      method: 'PUT',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ txId, attachments }),
    });
  } catch {
    // Best-effort secondary index sync
  }
}

export async function fetchTransactionAttachmentIndex(
  explicitOwnerUid?: string
): Promise<Record<string, TransactionAttachment[]>> {
  try {
    const { headers } = await getAttachmentAuthHeaders(explicitOwnerUid);
    const res = await fetch('/api/transactions/attachments/index', {
      method: 'GET',
      headers,
    });
    if (!res.ok) return {};
    const data = await res.json().catch(() => null);
    return data?.index && typeof data.index === 'object' ? data.index : {};
  } catch {
    return {};
  }
}
