<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import {
  X,
  CheckCircle2,
  QrCode,
  Building2,
  CreditCard,
  Smartphone,
  Copy,
  Check,
  ShieldCheck,
  ArrowRight,
  Clock,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  Sparkles,
  Lock,
  FileText,
  ChevronDown,
  ChevronUp,
} from 'lucide-vue-next';
import QRCode from 'qrcode';
import { useAuthStore } from '../stores/auth';
import {
  getPaymentGuideForChannel,
  type BankPaymentGuide,
  type PaymentGuideStep,
} from '../data/vaPaymentInstructions';

const router = useRouter();
const route = useRoute();

const props = withDefaults(
  defineProps<{
    isOpen: boolean;
    initialPlan?: 'monthly' | 'yearly';
  }>(),
  {
    isOpen: false,
    initialPlan: 'yearly',
  }
);

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'success', data: { plan: string; invoiceId: string; amount: number }): void;
}>();

const authStore = useAuthStore();

// Plan selection
const selectedPlan = ref<'monthly' | 'yearly'>('yearly');

watch(
  () => props.initialPlan,
  (newVal) => {
    if (newVal) selectedPlan.value = newVal;
  },
  { immediate: true }
);

// Form state
const fullName = ref(authStore.user?.displayName || '');
const email = ref(authStore.user?.email || 'vuedevo@gmail.com');
const phone = ref('085129634505');

// Duitku Payment Channels
// 10 Supported Virtual Accounts:
// M2: Mandiri VA
// BT: Permata Bank VA
// BR: BRI VA (BRIVA)
// I1: BNI VA
// BV: BSI VA
// NC: BNC (Bank Neo Commerce) VA
// B1: CIMB Niaga VA
// DM: Danamon VA
// VA: Maybank VA
// S1: Sampoerna VA
//
// Disabled Temporarily (Belum Aktif):
// SP: QRIS
// OV: OVO
// DA: DANA
// SL: ShopeePay
const paymentMethod = ref<string>('M2');

export interface PaymentChannelItem {
  code: string;
  name: string;
  shortName: string;
  sub: string;
  bankName: string;
  category: 'va' | 'qris' | 'ewallet';
  disabled?: boolean;
  disabledNote?: string;
}

const supportedVaChannels: PaymentChannelItem[] = [
  { code: 'M2', name: 'Bank Mandiri', shortName: 'Mandiri', sub: 'Livin by Mandiri / ATM', bankName: 'Bank Mandiri', category: 'va' },
  { code: 'BT', name: 'Permata Bank', shortName: 'Permata', sub: 'PermataME / ATM Bersama', bankName: 'Permata Bank', category: 'va' },
  { code: 'BR', name: 'Bank BRI', shortName: 'BRI (BRIVA)', sub: 'BRImo / ATM BRI', bankName: 'Bank BRI', category: 'va' },
  { code: 'I1', name: 'Bank BNI', shortName: 'BNI', sub: 'BNI Mobile / ATM BNI', bankName: 'Bank BNI', category: 'va' },
  { code: 'BV', name: 'Bank Syariah Indonesia', shortName: 'BSI', sub: 'BSI Mobile / ATM BSI', bankName: 'Bank Syariah Indonesia', category: 'va' },
  { code: 'NC', name: 'Bank Neo Commerce', shortName: 'BNC (Neo)', sub: 'Neobank App / ATM', bankName: 'Bank Neo Commerce', category: 'va' },
  { code: 'B1', name: 'CIMB Niaga', shortName: 'CIMB Niaga', sub: 'OCTO Mobile / Clicks', bankName: 'CIMB Niaga', category: 'va' },
  { code: 'DM', name: 'Bank Danamon', shortName: 'Danamon', sub: 'D-Bank PRO / ATM Danamon', bankName: 'Bank Danamon', category: 'va' },
  { code: 'VA', name: 'Maybank Indonesia', shortName: 'Maybank', sub: 'M2U ID / ATM Maybank', bankName: 'Maybank Indonesia', category: 'va' },
  { code: 'S1', name: 'Bank Sahabat Sampoerna', shortName: 'Sampoerna', sub: 'Sampoerna Mobile / ATM', bankName: 'Bank Sahabat Sampoerna', category: 'va' },
];

const disabledChannels: PaymentChannelItem[] = [
  { code: 'SP', name: 'QRIS Instan', shortName: 'QRIS', sub: 'Pindai barcode semua aplikasi', bankName: 'QRIS Nasional', category: 'qris', disabled: true, disabledNote: 'Sementara belum aktif' },
  { code: 'OV', name: 'OVO E-Wallet', shortName: 'OVO', sub: 'Pembayaran instan via OVO', bankName: 'OVO', category: 'ewallet', disabled: true, disabledNote: 'Sementara belum aktif' },
  { code: 'DA', name: 'DANA E-Wallet', shortName: 'DANA', sub: 'Pembayaran instan via DANA', bankName: 'DANA', category: 'ewallet', disabled: true, disabledNote: 'Sementara belum aktif' },
  { code: 'SL', name: 'ShopeePay', shortName: 'ShopeePay', sub: 'Pembayaran instan ShopeePay', bankName: 'ShopeePay', category: 'ewallet', disabled: true, disabledNote: 'Sementara belum aktif' },
];

// Steps: 'form' | 'payment' | 'success'
const step = ref<'form' | 'payment' | 'success'>('form');
const isSubmitting = ref(false);
const isCheckingStatus = ref(false);
const errorMessage = ref('');
const copiedField = ref('');
const checkStatusNotice = ref('');

// Dynamic QRIS Data URL rendered via qrcode
const qrisDataUrl = ref<string>('');

// Duitku Order Data
const invoiceData = ref<{
  invoiceNumber: string;
  orderId: string;
  reference: string;
  paymentUrl: string;
  planName: string;
  amount: number;
  formattedAmount: string;
  methodLabel: string;
  vaNumber?: string;
  qrString?: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  paidAt: string;
}>({
  invoiceNumber: '',
  orderId: '',
  reference: '',
  paymentUrl: '',
  planName: '',
  amount: 215000,
  formattedAmount: 'Rp 215.000',
  methodLabel: 'Mandiri Virtual Account',
  customerName: '',
  customerEmail: '',
  customerPhone: '',
  paidAt: '',
});

const channelLabels: Record<string, { label: string; sub: string; bank: string; category: 'qris' | 'va' | 'ewallet' }> = {
  M2: { label: 'Mandiri Virtual Account', sub: 'Livin by Mandiri / ATM', bank: 'Bank Mandiri', category: 'va' },
  BT: { label: 'Permata Bank VA', sub: 'PermataME / ATM Bersama', bank: 'Permata Bank', category: 'va' },
  BR: { label: 'BRI Virtual Account', sub: 'BRImo / ATM BRI (BRIVA)', bank: 'Bank BRI', category: 'va' },
  I1: { label: 'BNI Virtual Account', sub: 'BNI Mobile / ATM BNI', bank: 'Bank BNI', category: 'va' },
  BV: { label: 'BSI Virtual Account', sub: 'BSI Mobile / ATM BSI', bank: 'Bank Syariah Indonesia', category: 'va' },
  NC: { label: 'BNC Virtual Account', sub: 'Neobank App / ATM', bank: 'Bank Neo Commerce', category: 'va' },
  B1: { label: 'CIMB Niaga VA', sub: 'OCTO Mobile / OCTO Clicks', bank: 'CIMB Niaga', category: 'va' },
  DM: { label: 'Danamon Virtual Account', sub: 'D-Bank PRO / ATM Danamon', bank: 'Bank Danamon', category: 'va' },
  VA: { label: 'Maybank Virtual Account', sub: 'M2U ID / ATM Maybank', bank: 'Maybank Indonesia', category: 'va' },
  S1: { label: 'Sampoerna Virtual Account', sub: 'Sampoerna Mobile / ATM', bank: 'Bank Sahabat Sampoerna', category: 'va' },
  SP: { label: 'QRIS Instan', sub: 'Semua Bank & E-Wallet', bank: 'QRIS Nasional', category: 'qris' },
  OV: { label: 'OVO E-Wallet', sub: 'Pembayaran instan via OVO', bank: 'OVO', category: 'ewallet' },
  DA: { label: 'DANA E-Wallet', sub: 'Pembayaran instan via DANA', bank: 'DANA', category: 'ewallet' },
  SL: { label: 'ShopeePay', sub: 'Pembayaran instan ShopeePay', bank: 'ShopeePay', category: 'ewallet' },
};

const currentPrice = computed(() => {
  return selectedPlan.value === 'yearly' ? 215000 : 21500;
});

const formattedPrice = computed(() => {
  return selectedPlan.value === 'yearly' ? 'Rp 215.000' : 'Rp 21.500';
});

const planPeriodLabel = computed(() => {
  return selectedPlan.value === 'yearly' ? '1 Tahun Penuh (Hemat 2 Bulan)' : '1 Bulan';
});

// VA Payment Guides (Petunjuk Pembayaran Duitku)
const showAllGuides = ref(false);
const expandedGuideIndexes = ref<number[]>([0]);

const currentBankGuide = computed<BankPaymentGuide | null>(() => {
  return getPaymentGuideForChannel(paymentMethod.value);
});

const primaryGuides = computed<PaymentGuideStep[]>(() => {
  if (!currentBankGuide.value) return [];
  return currentBankGuide.value.guides.slice(0, 2);
});

const remainingGuides = computed<PaymentGuideStep[]>(() => {
  if (!currentBankGuide.value) return [];
  return currentBankGuide.value.guides.slice(2);
});

function isGuideExpanded(index: number): boolean {
  return expandedGuideIndexes.value.includes(index);
}

function toggleGuide(index: number) {
  const pos = expandedGuideIndexes.value.indexOf(index);
  if (pos >= 0) {
    expandedGuideIndexes.value.splice(pos, 1);
  } else {
    expandedGuideIndexes.value.push(index);
  }
}

watch(paymentMethod, () => {
  showAllGuides.value = false;
  expandedGuideIndexes.value = [0];
});

// Polling timer for status verification
let pollingInterval: ReturnType<typeof setInterval> | null = null;

function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}

onBeforeUnmount(() => {
  stopPolling();
});

watch(
  () => props.isOpen,
  (val) => {
    if (val) {
      if (!authStore.isAuthenticated || !authStore.user) {
        const saved = localStorage.getItem('sisa_uang_active_user');
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (parsed && parsed.uid) {
              authStore.user = parsed;
              localStorage.removeItem('sisa_uang_explicit_logout');
            }
          } catch {
            // Ignore parse error
          }
        }
      }

      // Must be authenticated before proceeding to payment
      if (!authStore.isAuthenticated || !authStore.user) {
        handleClose();
        router.push({
          path: '/auth',
          query: {
            redirect: route.fullPath && route.fullPath !== '/auth' ? route.fullPath : '/dashboard',
            action: 'checkout',
            plan: selectedPlan.value,
          },
        });
        return;
      }

      step.value = 'form';
      errorMessage.value = '';
      checkStatusNotice.value = '';
      showAllGuides.value = false;
      expandedGuideIndexes.value = [0];
      fullName.value = authStore.user.displayName || authStore.user.username || '';
      email.value = authStore.user.email || '';
    } else {
      stopPolling();
    }
  }
);

function formatVaNumberDisplay(va?: string): string {
  const clean = String(va || '').replace(/\D/g, '');
  if (!clean) return va || '';
  return clean.replace(/(\d{4})(?=\d)/g, '$1 ');
}

function copyToClipboard(text: string, field: string) {
  const clean = String(text || '').replace(/\s+/g, '');
  if (navigator?.clipboard?.writeText) {
    navigator.clipboard.writeText(clean).catch(() => {});
  } else {
    try {
      const el = document.createElement('textarea');
      el.value = clean;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    } catch {
      // Ignore
    }
  }
  copiedField.value = field;
  setTimeout(() => {
    if (copiedField.value === field) copiedField.value = '';
  }, 2500);
}

async function proceedToPayment() {
  if (!authStore.isAuthenticated || !authStore.user) {
    const saved = localStorage.getItem('sisa_uang_active_user');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.uid) {
          authStore.user = parsed;
          localStorage.removeItem('sisa_uang_explicit_logout');
        }
      } catch {
        // Ignore parse error
      }
    }
  }

  // Enforce logged in user verification
  if (!authStore.isAuthenticated || !authStore.user) {
    handleClose();
    router.push({
      path: '/auth',
      query: {
        redirect: route.fullPath && route.fullPath !== '/auth' ? route.fullPath : '/dashboard',
        action: 'checkout',
        plan: selectedPlan.value,
      },
    });
    return;
  }

  // Ensure email strictly matches the authenticated user account to prevent orphaned licenses
  email.value = authStore.user.email;

  if (!fullName.value.trim()) {
    errorMessage.value = 'Mohon masukkan nama lengkap pemesan.';
    return;
  }
  if (!email.value.trim() || !email.value.includes('@')) {
    errorMessage.value = 'Email akun tidak valid.';
    return;
  }
  if (!phone.value.trim()) {
    errorMessage.value = 'Mohon masukkan nomor WhatsApp / telepon yang aktif.';
    return;
  }

  const selectedVa = supportedVaChannels.find((ch) => ch.code === paymentMethod.value);
  if (!selectedVa) {
    errorMessage.value =
      'Metode pembayaran QRIS dan e-Wallet sementara belum aktif. Silakan pilih salah satu dari 10 Virtual Account yang didukung.';
    return;
  }

  isSubmitting.value = true;
  errorMessage.value = '';
  checkStatusNotice.value = '';

  try {
    const payload = {
      plan: selectedPlan.value,
      amount: currentPrice.value,
      customerName: fullName.value.trim(),
      customerEmail: authStore.user.email.trim().toLowerCase(),
      customerPhone: phone.value.trim(),
      paymentMethod: paymentMethod.value,
      userUid: authStore.user.uid,
    };

    const res = await fetch('/api/duitku/create-transaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Gagal memproses inisialisasi pembayaran Duitku.');
    }

    const currentChannel = channelLabels[paymentMethod.value];
    const channelName = currentChannel ? `${currentChannel.label} (${currentChannel.sub})` : 'Duitku Gateway';

    // If QR string is returned by Duitku (for QRIS), generate a scannable QR Code image
    qrisDataUrl.value = '';
    if (data.qrString) {
      try {
        qrisDataUrl.value = await QRCode.toDataURL(data.qrString, {
          width: 320,
          margin: 1,
          color: { dark: '#0f172a', light: '#ffffff' },
        });
      } catch (e) {
        console.warn('QR code generation failed, using fallback display', e);
      }
    }

    invoiceData.value = {
      invoiceNumber: data.invoiceNumber || `INV-DUITKU-${Date.now().toString().slice(-6)}`,
      orderId: data.orderId,
      reference: data.reference || '',
      paymentUrl: data.paymentUrl || '',
      planName: selectedPlan.value === 'yearly' ? 'SisaUang Pro Tahunan' : 'SisaUang Pro Bulanan',
      amount: currentPrice.value,
      formattedAmount: formattedPrice.value,
      methodLabel: channelName,
      vaNumber: data.vaNumber,
      qrString: data.qrString,
      customerName: fullName.value.trim(),
      customerEmail: email.value.trim(),
      customerPhone: phone.value.trim(),
      paidAt: new Date().toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    };

    showAllGuides.value = false;
    expandedGuideIndexes.value = [0];
    step.value = 'payment';

    // Start auto polling payment status every 4 seconds
    stopPolling();
    pollingInterval = setInterval(() => {
      checkPaymentStatus(false);
    }, 4000);
  } catch (err: any) {
    errorMessage.value = err.message || 'Terjadi kesalahan sistem pembayaran Duitku.';
  } finally {
    isSubmitting.value = false;
  }
}

async function checkPaymentStatus(showFeedback = true) {
  if (!invoiceData.value.orderId) return;
  if (showFeedback) isCheckingStatus.value = true;
  checkStatusNotice.value = '';

  try {
    const res = await fetch(`/api/duitku/check-status/${encodeURIComponent(invoiceData.value.orderId)}`);
    const data = await res.json();

    if (data.isPaid === true && (data.duitkuStatus?.statusCode === '00' || data.order?.status === 'SUCCESS')) {
      stopPolling();
      if (authStore.user) {
        authStore.setExternalSubscriptionStatus('pro', selectedPlan.value, null, false);
      }
      try {
        await authStore.syncSubscriptionFromFirestoreForUser(authStore.user?.uid, authStore.user?.email);
      } catch (syncErr) {
        console.warn('Post-checkout Firestore sync notice:', syncErr);
      }
      step.value = 'success';
      emit('success', {
        plan: selectedPlan.value,
        invoiceId: invoiceData.value.invoiceNumber,
        amount: invoiceData.value.amount,
      });
    } else if (showFeedback) {
      checkStatusNotice.value =
        'Pembayaran belum diterima oleh Duitku. Silakan selesaikan pembayaran dan tekan tombol ini kembali.';
    }
  } catch (err: any) {
    if (showFeedback) {
      checkStatusNotice.value = err.message || 'Gagal mengecek status pembayaran ke Duitku.';
    }
  } finally {
    if (showFeedback) isCheckingStatus.value = false;
  }
}

function handleClose() {
  stopPolling();
  emit('close');
}
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-200"
  >
    <div
      class="relative w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col"
    >
      <!-- Modal Header -->
      <div class="px-4 sm:px-6 py-4 sm:py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5 text-[11px] sm:text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
            <ShieldCheck class="w-3.5 h-3.5 shrink-0" />
            <span class="truncate">Payment Gateway Resmi Duitku</span>
          </div>
          <h2 class="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 mt-0.5 truncate">
            {{ step === 'success' ? 'Pembayaran Berhasil Dikonfirmasi' : 'Pemesanan Lisensi SisaUang Pro' }}
          </h2>
        </div>
        <button
          type="button"
          class="w-9 h-9 min-w-[36px] flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
          aria-label="Tutup modal"
          @click="handleClose"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- Step 1: Form & Package Selection -->
      <div v-if="step === 'form'" class="p-4 sm:p-6 space-y-4 sm:space-y-6 overflow-y-auto">
        <!-- Error Notice -->
        <div
          v-if="errorMessage"
          class="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2.5"
        >
          <AlertCircle class="w-4 h-4 shrink-0 mt-0.5" />
          <span>{{ errorMessage }}</span>
        </div>

        <!-- Choose Subscription Plan (IDR Guaranteed) -->
        <div class="space-y-2.5">
          <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300">
            Pilih Paket Berlangganan (Mata Uang Rupiah)
          </label>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <!-- Monthly -->
            <button
              type="button"
              class="relative text-left p-4 rounded-xl border transition-all"
              :class="
                selectedPlan === 'monthly'
                  ? 'border-emerald-600 bg-emerald-50/40 dark:bg-emerald-950/30 ring-1 ring-emerald-600'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 bg-white dark:bg-slate-800/40'
              "
              @click="selectedPlan = 'monthly'"
            >
              <div class="flex items-center justify-between">
                <span class="text-sm font-semibold text-slate-900 dark:text-slate-100">Pro Bulanan</span>
                <span
                  class="w-4 h-4 rounded-full border flex items-center justify-center"
                  :class="
                    selectedPlan === 'monthly'
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : 'border-slate-300 dark:border-slate-600'
                  "
                >
                  <Check v-if="selectedPlan === 'monthly'" class="w-3 h-3 stroke-[3]" />
                </span>
              </div>
              <div class="mt-2 text-xl font-bold font-money text-slate-900 dark:text-slate-100">
                Rp 21.500
              </div>
              <div class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Ditagih setiap bulan
              </div>
            </button>

            <!-- Yearly -->
            <button
              type="button"
              class="relative text-left p-4 rounded-xl border transition-all"
              :class="
                selectedPlan === 'yearly'
                  ? 'border-emerald-600 bg-emerald-50/40 dark:bg-emerald-950/30 ring-1 ring-emerald-600'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 bg-white dark:bg-slate-800/40'
              "
              @click="selectedPlan = 'yearly'"
            >
              <div class="flex items-center justify-between">
                <span class="text-sm font-semibold text-slate-900 dark:text-slate-100">Pro Tahunan</span>
                <span
                  class="w-4 h-4 rounded-full border flex items-center justify-center"
                  :class="
                    selectedPlan === 'yearly'
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : 'border-slate-300 dark:border-slate-600'
                  "
                >
                  <Check v-if="selectedPlan === 'yearly'" class="w-3 h-3 stroke-[3]" />
                </span>
              </div>
              <div class="mt-2 text-xl font-bold font-money text-slate-900 dark:text-slate-100">
                Rp 215.000
              </div>
              <div class="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-0.5">
                Hemat 2 bulan (Rp 17.916/bln)
              </div>
            </button>
          </div>
        </div>

        <!-- Customer Form Fields -->
        <div class="space-y-4">
          <div>
            <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Nama Lengkap Pemesan
            </label>
            <input
              v-model="fullName"
              type="text"
              placeholder="Contoh: Muhammad Adnan Zaki"
              class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div class="flex items-center justify-between mb-1.5">
                <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Email Akun Terverifikasi
                </label>
                <span class="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/70 px-1.5 py-0.5 rounded border border-emerald-200/70 dark:border-emerald-800/70">
                  <ShieldCheck class="w-3 h-3" />
                  <span>Terkunci</span>
                </span>
              </div>
              <div class="relative">
                <input
                  v-model="email"
                  type="email"
                  readonly
                  disabled
                  class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 font-mono text-xs cursor-not-allowed select-all"
                />
                <Lock class="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              </div>
              <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-tight">
                Lisensi Pro otomatis diaktifkan untuk akun login ini setelah diverifikasi.
              </p>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Nomor WhatsApp / HP
              </label>
              <input
                v-model="phone"
                type="tel"
                placeholder="085129634505"
                class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
        </div>

        <!-- Payment Method Choice: 10 Supported Virtual Accounts (Active) & Disabled Channels -->
        <div class="space-y-4">
          <!-- Active 10 Virtual Accounts -->
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <label class="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                Pilih Bank Virtual Account (10 Bank Didukung)
              </label>
              <span class="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/70 px-2 py-0.5 rounded-md border border-emerald-200/70 dark:border-emerald-800/70">
                <CheckCircle2 class="w-3 h-3" />
                <span>Aktif &amp; Otomatis</span>
              </span>
            </div>
            <p class="text-[11px] text-slate-500 dark:text-slate-400">
              Verifikasi pembayaran otomatis instan 24 jam tanpa perlu unggah bukti transfer.
            </p>

            <div class="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs pt-1">
              <button
                v-for="ch in supportedVaChannels"
                :key="ch.code"
                type="button"
                class="p-2.5 rounded-xl border flex flex-col justify-between text-left transition-all duration-150 relative cursor-pointer group"
                :class="
                  paymentMethod === ch.code
                    ? 'border-emerald-600 dark:border-emerald-500 bg-emerald-50/90 dark:bg-emerald-950/60 text-emerald-950 dark:text-emerald-100 font-semibold ring-2 ring-emerald-500/40 shadow-xs'
                    : 'border-slate-200 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600 bg-slate-50/80 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
                "
                @click="paymentMethod = ch.code"
              >
                <div class="flex items-center justify-between w-full mb-1.5">
                  <Building2
                    class="w-4 h-4 transition-colors"
                    :class="
                      paymentMethod === ch.code
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-slate-500 dark:text-slate-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400'
                    "
                  />
                  <span
                    v-if="paymentMethod === ch.code"
                    class="w-4 h-4 rounded-full bg-emerald-600 dark:bg-emerald-500 text-white dark:text-slate-950 flex items-center justify-center shrink-0"
                  >
                    <Check class="w-2.5 h-2.5 stroke-[3]" />
                  </span>
                  <span
                    v-else
                    class="text-[9px] font-mono px-1 py-0.5 rounded font-semibold text-slate-500 dark:text-slate-400 bg-slate-200/60 dark:bg-slate-700/60 uppercase"
                  >
                    VA
                  </span>
                </div>
                <div>
                  <div
                    class="font-bold text-xs leading-tight transition-colors"
                    :class="
                      paymentMethod === ch.code
                        ? 'text-emerald-950 dark:text-emerald-100'
                        : 'text-slate-900 dark:text-slate-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400'
                    "
                  >
                    {{ ch.shortName }}
                  </div>
                  <div
                    class="text-[10px] truncate mt-0.5"
                    :class="
                      paymentMethod === ch.code
                        ? 'text-emerald-700 dark:text-emerald-300'
                        : 'text-slate-500 dark:text-slate-400'
                    "
                  >
                    {{ ch.sub }}
                  </div>
                </div>
              </button>
            </div>
          </div>

          <!-- Disabled Payment Methods Notice & Placeholders -->
          <div class="p-3 rounded-xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/60 space-y-2">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
                <AlertCircle class="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>QRIS &amp; E-Wallet (Sementara Dinonaktifkan)</span>
              </div>
              <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-200/60 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200">
                Belum Aktif
              </span>
            </div>
            <p class="text-[11px] text-amber-900/80 dark:text-amber-300/80 leading-relaxed">
              Metode pembayaran <strong>QRIS</strong> dan <strong>e-Wallet (OVO, DANA, ShopeePay)</strong> dinonaktifkan sementara karena belum aktif di gateway. Silakan gunakan salah satu dari <strong>10 Virtual Account</strong> di atas.
            </p>

            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
              <div
                v-for="item in disabledChannels"
                :key="item.code"
                class="p-2 rounded-lg border border-dashed border-amber-300/60 dark:border-amber-800/60 bg-white/60 dark:bg-slate-900/40 text-slate-400 dark:text-slate-500 flex flex-col justify-between cursor-not-allowed select-none opacity-65"
              >
                <div class="flex items-center justify-between mb-1">
                  <component :is="item.type === 'qris' ? QrCode : Smartphone" class="w-3.5 h-3.5 text-slate-400" />
                  <span class="text-[9px] font-semibold text-amber-700 dark:text-amber-400">
                    Tidak Aktif
                  </span>
                </div>
                <div>
                  <div class="font-semibold text-xs text-slate-500 dark:text-slate-400">
                    {{ item.name }}
                  </div>
                  <div class="text-[9px] text-slate-400 truncate">
                    {{ item.disabledNote }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Summary & In-Site Compliance Note -->
        <div class="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 space-y-2">
          <div class="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
            <span>Paket Dipilih</span>
            <span class="font-semibold text-slate-900 dark:text-slate-100">
              {{ selectedPlan === 'yearly' ? 'SisaUang Pro Tahunan' : 'SisaUang Pro Bulanan' }}
            </span>
          </div>
          <div class="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
            <span>Masa Aktif</span>
            <span class="font-medium text-slate-900 dark:text-slate-100">{{ planPeriodLabel }}</span>
          </div>
          <div class="pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <span class="text-sm font-semibold text-slate-900 dark:text-slate-100">Total Tagihan (IDR)</span>
            <span class="text-lg font-bold font-money text-emerald-600 dark:text-emerald-400">
              {{ formattedPrice }}
            </span>
          </div>
          <div class="pt-2 text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <ShieldCheck class="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Terhubung langsung ke Duitku Payment Gateway V2 dengan verifikasi tanda tangan MD5/SHA256 resmi.</span>
          </div>
        </div>

        <!-- Submit Button -->
        <button
          type="button"
          :disabled="isSubmitting"
          class="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-sm transition-colors disabled:opacity-50 cursor-pointer"
          @click="proceedToPayment"
        >
          <span v-if="isSubmitting">Memproses Transaksi ke Duitku...</span>
          <template v-else>
            <span>Lanjut ke Pembayaran ({{ formattedPrice }})</span>
            <ArrowRight class="w-4 h-4" />
          </template>
        </button>
      </div>

      <!-- Step 2: Duitku Payment View -->
      <div v-else-if="step === 'payment'" class="p-4 sm:p-6 space-y-4 sm:space-y-5 overflow-y-auto">
        <!-- Order & Amount Header Card -->
        <div class="p-3.5 sm:p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-900/60 space-y-2.5">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <span class="inline-block text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200 mb-1">
                Tagihan Langganan Pro
              </span>
              <div class="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 truncate">
                {{ invoiceData.planName }}
              </div>
            </div>
            <div class="text-right shrink-0">
              <div class="text-[11px] font-medium text-slate-500 dark:text-slate-400">Total Tagihan</div>
              <div class="text-xl sm:text-2xl font-bold font-money text-emerald-600 dark:text-emerald-400 leading-tight">
                {{ invoiceData.formattedAmount }}
              </div>
            </div>
          </div>

          <!-- Order ID & Reference Info -->
          <div class="pt-2 border-t border-emerald-200/60 dark:border-emerald-900/40 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="text-slate-400 dark:text-slate-500 text-[11px]">Order ID:</span>
              <span class="font-mono font-semibold text-slate-800 dark:text-slate-200 text-xs truncate select-all">
                {{ invoiceData.orderId }}
              </span>
            </div>
            <div v-if="invoiceData.reference" class="flex items-center gap-1.5 text-[11px] min-w-0">
              <span class="text-slate-400 dark:text-slate-500">Ref:</span>
              <span class="font-mono font-semibold text-emerald-700 dark:text-emerald-300 truncate select-all">
                {{ invoiceData.reference }}
              </span>
            </div>
          </div>
        </div>

        <!-- Feedback Notice (if checking) -->
        <div
          v-if="checkStatusNotice"
          class="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2.5"
        >
          <Clock class="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
          <span class="leading-relaxed">{{ checkStatusNotice }}</span>
        </div>

        <!-- 1. QRIS Payment Channel -->
        <div v-if="paymentMethod === 'SP'" class="flex flex-col items-center text-center space-y-3">
          <div class="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
            <Clock class="w-4 h-4 text-emerald-600" />
            <span>Pindai QRIS di bawah ini dengan aplikasi perbankan atau e-wallet Anda:</span>
          </div>

          <!-- Dynamic QRIS Image -->
          <div class="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center">
            <img
              v-if="qrisDataUrl"
              :src="qrisDataUrl"
              alt="QRIS SisaUang Duitku"
              class="w-52 h-52 object-contain"
            />
            <div v-else class="w-52 h-52 flex items-center justify-center bg-slate-100 rounded-xl">
              <QrCode class="w-16 h-16 text-slate-400 animate-pulse" />
            </div>

            <div class="mt-2 text-[11px] font-bold tracking-wider text-slate-800 uppercase">
              QRIS NASIONAL · RESMI
            </div>
          </div>

          <p class="text-xs text-slate-500 dark:text-slate-400 max-w-sm">
            Mendukung <strong>Mandiri, BRI, BNI, Permata, GoPay, ShopeePay, OVO, Dana, LinkAja</strong>, dan seluruh aplikasi berlogo QRIS.
          </p>
        </div>

        <!-- 2. Virtual Account Channel (10 Supported Banks) -->
        <div v-else-if="invoiceData.vaNumber || supportedVaChannels.some(v => v.code === paymentMethod)" class="space-y-3.5 sm:space-y-4">
          <div class="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40 space-y-3.5 shadow-2xs">
            <!-- Header: Bank Channel & Status Badge -->
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-2 min-w-0 flex-1">
                <Building2 class="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span class="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                  {{ channelLabels[paymentMethod]?.label || 'Virtual Account' }}
                </span>
              </div>
              <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-100/90 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold border border-emerald-200/80 dark:border-emerald-800/80 shrink-0">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>Otomatis Aktif</span>
              </span>
            </div>

            <!-- Virtual Account Number Box & Copy Button -->
            <div class="p-3.5 sm:p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-700/80 space-y-2.5">
              <div class="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Nomor Virtual Account Pembayaran:
              </div>

              <!-- Responsive Layout: on mobile stacked cleanly, on sm: side-by-side -->
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3">
                <div class="font-mono text-xl sm:text-2xl font-bold tracking-wider text-slate-900 dark:text-slate-50 select-all break-all sm:break-normal py-0.5">
                  {{ formatVaNumberDisplay(invoiceData.vaNumber || '8902801495875965') }}
                </div>

                <button
                  type="button"
                  class="w-full sm:w-auto h-11 min-h-[44px] px-4 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer shrink-0 whitespace-nowrap shadow-xs active:scale-[0.98]"
                  :class="
                    copiedField === 'va'
                      ? 'bg-emerald-700 text-white ring-2 ring-emerald-500/30'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  "
                  title="Salin nomor virtual account ke clipboard"
                  @click="copyToClipboard(invoiceData.vaNumber || '8902801495875965', 'va')"
                >
                  <Check v-if="copiedField === 'va'" class="w-4 h-4 shrink-0" />
                  <Copy v-else class="w-4 h-4 shrink-0" />
                  <span>{{ copiedField === 'va' ? 'Nomor VA Tersalin!' : 'Salin Nomor VA' }}</span>
                </button>
              </div>
            </div>

            <!-- Meta: Nama Penerima & Nominal (Clean 2-Col Grid) -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-200/70 dark:border-slate-700/60 text-xs">
              <div class="flex items-center justify-between sm:justify-start sm:gap-2">
                <span class="text-slate-500 dark:text-slate-400 text-[11px]">Nama Penerima:</span>
                <span class="font-semibold text-slate-800 dark:text-slate-200">DUITKU / SISAUANG PRO</span>
              </div>
              <div class="flex items-center justify-between sm:justify-end sm:gap-2">
                <span class="text-slate-500 dark:text-slate-400 text-[11px]">Nominal Transfer:</span>
                <span class="font-bold font-money text-emerald-600 dark:text-emerald-400 text-sm">
                  {{ invoiceData.formattedAmount }}
                </span>
              </div>
            </div>
          </div>

          <!-- Panduan Pembayaran Card Sesuai Dokumen Resmi Duitku -->
          <div class="p-3.5 sm:p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/30 space-y-3">
            <div class="flex items-center gap-2 min-w-0">
              <FileText class="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span class="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 truncate">
                Panduan Pembayaran {{ currentBankGuide?.bankName || channelLabels[paymentMethod]?.bank || 'Virtual Account' }}
              </span>
            </div>

            <!-- Cara Pembayaran Teratas Sesuai Dokumen Resmi -->
            <div v-if="currentBankGuide && primaryGuides.length" class="space-y-2">
              <div
                v-for="(guide, idx) in primaryGuides"
                :key="guide.title"
                class="rounded-xl border transition-all overflow-hidden bg-white dark:bg-slate-900 shadow-2xs"
                :class="
                  isGuideExpanded(idx)
                    ? 'border-emerald-400/80 dark:border-emerald-700/80 ring-1 ring-emerald-500/20'
                    : 'border-slate-200/90 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600'
                "
              >
                <!-- Accordion Header Button -->
                <button
                  type="button"
                  class="w-full px-3.5 py-2.5 flex items-center justify-between gap-2.5 text-left transition-colors cursor-pointer"
                  :class="
                    isGuideExpanded(idx)
                      ? 'bg-emerald-50/70 dark:bg-emerald-950/30'
                      : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                  "
                  @click="toggleGuide(idx)"
                >
                  <div class="flex items-center gap-2.5 min-w-0">
                    <span
                      class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 transition-colors"
                      :class="
                        isGuideExpanded(idx)
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                      "
                    >
                      {{ idx + 1 }}
                    </span>
                    <span class="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                      {{ guide.title }}
                    </span>
                  </div>
                  <ChevronDown
                    class="w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform duration-200 shrink-0"
                    :class="{ 'rotate-180': isGuideExpanded(idx) }"
                  />
                </button>

                <!-- Step-by-Step List -->
                <div v-show="isGuideExpanded(idx)" class="px-3.5 py-3 border-t border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900">
                  <ol class="space-y-2 text-xs text-slate-600 dark:text-slate-300">
                    <li
                      v-for="(st, sIdx) in guide.steps"
                      :key="sIdx"
                      class="flex items-start gap-2.5 leading-relaxed"
                    >
                      <span class="w-4 h-4 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono text-[10px] flex items-center justify-center shrink-0 mt-0.5 font-bold">
                        {{ sIdx + 1 }}
                      </span>
                      <span class="flex-1">{{ st }}</span>
                    </li>
                  </ol>
                </div>
              </div>
            </div>

            <!-- Button Selengkapnya (Hanya tampil jika ada cara lainnya) -->
            <div v-if="currentBankGuide && remainingGuides.length" class="pt-1">
              <button
                type="button"
                class="w-full py-2.5 px-3.5 rounded-xl border border-dashed border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 hover:bg-emerald-50 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer group shadow-2xs"
                @click="showAllGuides = !showAllGuides"
              >
                <span v-if="!showAllGuides">
                  Selengkapnya ({{ remainingGuides.length }} metode lainnya: ATM, Bank Lain, dll.)
                </span>
                <span v-else>
                  Tutup Cara Lainnya
                </span>
                <ChevronDown
                  class="w-4 h-4 transition-transform duration-200 text-emerald-600 dark:text-emerald-400 group-hover:translate-y-0.5"
                  :class="{ 'rotate-180': showAllGuides }"
                />
              </button>
            </div>

            <!-- Cara Lainnya (Ditampilkan ketika Selengkapnya diklik) -->
            <div v-if="showAllGuides && remainingGuides.length" class="space-y-2 pt-1 animate-in fade-in duration-200">
              <div
                v-for="(guide, rIdx) in remainingGuides"
                :key="guide.title"
                class="rounded-xl border transition-all overflow-hidden bg-white dark:bg-slate-900 shadow-2xs"
                :class="
                  isGuideExpanded(rIdx + 2)
                    ? 'border-emerald-400/80 dark:border-emerald-700/80 ring-1 ring-emerald-500/20'
                    : 'border-slate-200/90 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600'
                "
              >
                <!-- Accordion Header Button -->
                <button
                  type="button"
                  class="w-full px-3.5 py-2.5 flex items-center justify-between gap-2.5 text-left transition-colors cursor-pointer"
                  :class="
                    isGuideExpanded(rIdx + 2)
                      ? 'bg-emerald-50/70 dark:bg-emerald-950/30'
                      : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                  "
                  @click="toggleGuide(rIdx + 2)"
                >
                  <div class="flex items-center gap-2.5 min-w-0">
                    <span
                      class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 transition-colors"
                      :class="
                        isGuideExpanded(rIdx + 2)
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                      "
                    >
                      {{ rIdx + 3 }}
                    </span>
                    <span class="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                      {{ guide.title }}
                    </span>
                    <span
                      v-if="guide.tag"
                      class="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 shrink-0"
                    >
                      {{ guide.tag }}
                    </span>
                  </div>
                  <ChevronDown
                    class="w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform duration-200 shrink-0"
                    :class="{ 'rotate-180': isGuideExpanded(rIdx + 2) }"
                  />
                </button>

                <!-- Step-by-Step List -->
                <div v-show="isGuideExpanded(rIdx + 2)" class="px-3.5 py-3 border-t border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900">
                  <ol class="space-y-2 text-xs text-slate-600 dark:text-slate-300">
                    <li
                      v-for="(st, sIdx) in guide.steps"
                      :key="sIdx"
                      class="flex items-start gap-2.5 leading-relaxed"
                    >
                      <span class="w-4 h-4 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono text-[10px] flex items-center justify-center shrink-0 mt-0.5 font-bold">
                        {{ sIdx + 1 }}
                      </span>
                      <span class="flex-1">{{ st }}</span>
                    </li>
                  </ol>
                </div>
              </div>
            </div>

            <!-- Fallback umum jika bank tidak terdaftar -->
            <div v-if="!currentBankGuide" class="space-y-2">
              <ol class="space-y-2 text-xs text-slate-600 dark:text-slate-300">
                <li class="flex items-start gap-2.5 leading-relaxed">
                  <span class="w-5 h-5 rounded-full bg-slate-200/90 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">1</span>
                  <div>Buka aplikasi m-Banking atau ATM <strong>{{ channelLabels[paymentMethod]?.bank || 'bank Anda' }}</strong>, pilih menu <strong>Transfer &gt; Virtual Account</strong>.</div>
                </li>
                <li class="flex items-start gap-2.5 leading-relaxed">
                  <span class="w-5 h-5 rounded-full bg-slate-200/90 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">2</span>
                  <div>Masukkan nomor Virtual Account di atas. Pastikan nama akun penerima adalah <strong>DUITKU / SISAUANG PRO</strong>.</div>
                </li>
                <li class="flex items-start gap-2.5 leading-relaxed">
                  <span class="w-5 h-5 rounded-full bg-slate-200/90 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">3</span>
                  <div>Konfirmasi pembayaran sejumlah <strong>{{ invoiceData.formattedAmount }}</strong>.</div>
                </li>
                <li class="flex items-start gap-2.5 leading-relaxed">
                  <span class="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">4</span>
                  <div>Setelah berhasil, sistem SisaUang akan langsung mengaktifkan status Pro dalam beberapa detik secara otomatis.</div>
                </li>
              </ol>
            </div>

            <!-- Footnote Otomatis Aktif -->
            <div class="pt-2 border-t border-slate-200/60 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <ShieldCheck class="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>Verifikasi otomatis 24 jam real-time. Status lisensi SisaUang Pro aktif seketika setelah pembayaran berhasil.</span>
            </div>
          </div>
        </div>

        <!-- 3. Direct Duitku Payment URL Channel (E-Wallet / Card / General) -->
        <div v-else class="space-y-4">
          <div class="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-center space-y-3">
            <div class="text-xs text-slate-500 dark:text-slate-400">
              Kanal pembayaran: <strong>{{ channelLabels[paymentMethod]?.label || paymentMethod }}</strong>
            </div>
            <p class="text-xs text-slate-600 dark:text-slate-300">
              Silakan klik tombol di bawah untuk membuka halaman otorisasi pembayaran Duitku secara aman:
            </p>
            <a
              v-if="invoiceData.paymentUrl"
              :href="invoiceData.paymentUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition-colors shadow-xs"
            >
              <span>Buka Halaman Pembayaran Duitku</span>
              <ExternalLink class="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        <!-- Optional Duitku Hosted Page Link if provided -->
        <div
          v-if="invoiceData.paymentUrl && paymentMethod !== 'VC' && paymentMethod !== 'OV' && paymentMethod !== 'DA'"
          class="text-center"
        >
          <a
            :href="invoiceData.paymentUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1.5 text-xs text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 hover:underline"
          >
            <span>Atau buka halaman pembayaran resmi Duitku di tab baru</span>
            <ExternalLink class="w-3 h-3" />
          </a>
        </div>

        <!-- Action Buttons & Polling Status -->
        <div class="space-y-2.5 pt-2">
          <button
            type="button"
            :disabled="isCheckingStatus"
            class="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-sm transition-colors disabled:opacity-50 cursor-pointer"
            @click="checkPaymentStatus(true)"
          >
            <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': isCheckingStatus }" />
            <span>{{ isCheckingStatus ? 'Mengecek ke Duitku...' : 'Cek Status Pembayaran (Otomatis)' }}</span>
          </button>

          <button
            type="button"
            class="w-full py-2 px-3 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
            @click="step = 'form'"
          >
            &larr; Ubah paket atau kanal pembayaran lain
          </button>
        </div>
      </div>

      <!-- Step 3: Success Screen & Official Invoice Receipt -->
      <div v-else-if="step === 'success'" class="p-4 sm:p-6 space-y-4 sm:space-y-6 overflow-y-auto">
        <div class="text-center space-y-2">
          <div class="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
            <CheckCircle2 class="w-7 h-7" />
          </div>
          <h3 class="text-lg font-bold text-slate-900 dark:text-slate-100">
            Pembayaran Berhasil Diverifikasi!
          </h3>
          <p class="text-xs text-slate-600 dark:text-slate-400 max-w-sm mx-auto">
            Terima kasih! Akun Anda kini resmi aktif sebagai <strong>SisaUang Pro</strong>. Seluruh batasan anggaran tahunan, laporan PDF resmi, dan multi sumber dana telah terbuka penuh.
          </p>
        </div>

        <!-- Official Duitku Invoice Card -->
        <div class="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 space-y-3 text-xs">
          <div class="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
            <div>
              <div class="font-bold text-slate-900 dark:text-slate-100">BUKTI TRANSAKSI DUITKU</div>
              <div class="text-[11px] text-slate-500 font-mono">Invoice: {{ invoiceData.invoiceNumber }}</div>
              <div class="text-[10px] text-slate-400 font-mono">Order: {{ invoiceData.orderId }}</div>
            </div>
            <span class="px-2.5 py-1 rounded-md bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 font-bold uppercase tracking-wider text-[10px]">
              LUNAS / SETTLED
            </span>
          </div>

          <div class="grid grid-cols-2 gap-2 text-slate-600 dark:text-slate-400">
            <div>
              <span class="block text-[11px] text-slate-400">Nama Pelanggan</span>
              <span class="font-medium text-slate-800 dark:text-slate-200">{{ invoiceData.customerName }}</span>
            </div>
            <div>
              <span class="block text-[11px] text-slate-400">Email Akun</span>
              <span class="font-medium text-slate-800 dark:text-slate-200">{{ invoiceData.customerEmail }}</span>
            </div>
            <div>
              <span class="block text-[11px] text-slate-400">Kanal Pembayaran</span>
              <span class="font-medium text-slate-800 dark:text-slate-200">{{ invoiceData.methodLabel }}</span>
            </div>
            <div>
              <span class="block text-[11px] text-slate-400">Waktu Pembayaran</span>
              <span class="font-medium text-slate-800 dark:text-slate-200">{{ invoiceData.paidAt }}</span>
            </div>
          </div>

          <div class="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <span class="font-semibold text-slate-800 dark:text-slate-200">Total Dibayar</span>
            <span class="text-base font-bold font-money text-emerald-600 dark:text-emerald-400">
              {{ invoiceData.formattedAmount }}
            </span>
          </div>
        </div>

        <!-- Buttons -->
        <div class="space-y-2 pt-2">
          <button
            type="button"
            class="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
            @click="handleClose"
          >
            <Sparkles class="w-4 h-4" />
            <span>Mulai Gunakan Fitur SisaUang Pro</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
