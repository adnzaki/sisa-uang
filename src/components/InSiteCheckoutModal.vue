<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue';
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
} from 'lucide-vue-next';
import QRCode from 'qrcode';
import { useAuthStore } from '../stores/auth';

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

// Duitku Payment Channels:
// SP: QRIS
// BC: BCA Virtual Account
// M2: Mandiri Virtual Account
// B1: BNI Virtual Account
// BR: BRI Virtual Account
// BT: Permata Virtual Account
// OV: OVO
// DA: DANA
// VC: Credit/Debit Card
const paymentMethod = ref<string>('SP');

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
  methodLabel: 'QRIS (Gopay / ShopeePay / BCA / Mandiri / OVO / Dana)',
  customerName: '',
  customerEmail: '',
  customerPhone: '',
  paidAt: '',
});

const channelLabels: Record<string, { label: string; sub: string; category: 'qris' | 'va' | 'ewallet' | 'card' }> = {
  SP: { label: 'QRIS Instan', sub: 'BCA, Mandiri, Gopay, ShopeePay, OVO, Dana', category: 'qris' },
  BC: { label: 'BCA Virtual Account', sub: 'BCA Mobile / myBCA / ATM', category: 'va' },
  M2: { label: 'Mandiri VA', sub: 'Livin by Mandiri / ATM Mandiri', category: 'va' },
  B1: { label: 'BNI Virtual Account', sub: 'BNI Mobile / ATM BNI', category: 'va' },
  BR: { label: 'BRI Virtual Account', sub: 'BRImo / ATM BRI', category: 'va' },
  BT: { label: 'Permata Bank VA', sub: 'PermataME / ATM Bersama', category: 'va' },
  OV: { label: 'OVO E-Wallet', sub: 'Pembayaran instan via OVO', category: 'ewallet' },
  DA: { label: 'DANA E-Wallet', sub: 'Pembayaran instan via DANA', category: 'ewallet' },
  VC: { label: 'Kartu Kredit / Debit', sub: 'Visa / Mastercard Online', category: 'card' },
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
      step.value = 'form';
      errorMessage.value = '';
      checkStatusNotice.value = '';
      if (authStore.user) {
        fullName.value = authStore.user.displayName || '';
        email.value = authStore.user.email || '';
      }
    } else {
      stopPolling();
    }
  }
);

function copyToClipboard(text: string, field: string) {
  navigator.clipboard.writeText(text);
  copiedField.value = field;
  setTimeout(() => {
    if (copiedField.value === field) copiedField.value = '';
  }, 2000);
}

async function proceedToPayment() {
  if (!fullName.value.trim()) {
    errorMessage.value = 'Mohon masukkan nama lengkap pemesan.';
    return;
  }
  if (!email.value.trim() || !email.value.includes('@')) {
    errorMessage.value = 'Mohon masukkan alamat email yang valid untuk aktivasi lisensi.';
    return;
  }
  if (!phone.value.trim()) {
    errorMessage.value = 'Mohon masukkan nomor WhatsApp / telepon yang aktif.';
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
      customerEmail: email.value.trim(),
      customerPhone: phone.value.trim(),
      paymentMethod: paymentMethod.value,
      userUid: authStore.user?.uid,
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

    if (data.isPaid || data.status === 'SUCCESS' || data.statusCode === '00') {
      stopPolling();
      if (authStore.user) {
        authStore.user.isPro = true;
        authStore.user.subscriptionStatus = 'pro';
        authStore.user.subscriptionPlan = selectedPlan.value;
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
    class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-200"
  >
    <div
      class="relative w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden my-auto"
    >
      <!-- Modal Header -->
      <div class="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <div>
          <div class="flex items-center gap-2">
            <span class="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
              Payment Gateway Duitku V2
            </span>
            <span class="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
              Sandbox DS36399
            </span>
          </div>
          <h2 class="text-lg font-bold text-slate-900 dark:text-slate-100 mt-0.5">
            {{ step === 'success' ? 'Pembayaran Berhasil Dikonfirmasi' : 'Pemesanan Lisensi SisaUang Pro' }}
          </h2>
        </div>
        <button
          type="button"
          class="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          @click="handleClose"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- Step 1: Form & Package Selection -->
      <div v-if="step === 'form'" class="p-6 space-y-6">
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
              <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Alamat Email Akun
              </label>
              <input
                v-model="email"
                type="email"
                placeholder="vuedevo@gmail.com"
                class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
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

        <!-- Payment Method Choice via Duitku Channels -->
        <div class="space-y-2.5">
          <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300">
            Kanal Pembayaran Duitku V2
          </label>
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
            <!-- QRIS (SP) -->
            <button
              type="button"
              class="p-3 rounded-xl border flex flex-col items-center justify-center text-center gap-1.5 transition-colors"
              :class="
                paymentMethod === 'SP'
                  ? 'border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 font-semibold ring-1 ring-emerald-500'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 text-slate-700 dark:text-slate-300'
              "
              @click="paymentMethod = 'SP'"
            >
              <QrCode class="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              <span class="font-bold">QRIS Instan</span>
              <span class="text-[10px] text-slate-500">Semua E-Wallet/Bank</span>
            </button>

            <!-- BCA VA (BC) -->
            <button
              type="button"
              class="p-3 rounded-xl border flex flex-col items-center justify-center text-center gap-1.5 transition-colors"
              :class="
                paymentMethod === 'BC'
                  ? 'border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 font-semibold ring-1 ring-emerald-500'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 text-slate-700 dark:text-slate-300'
              "
              @click="paymentMethod = 'BC'"
            >
              <Building2 class="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <span class="font-bold">BCA VA</span>
              <span class="text-[10px] text-slate-500">Virtual Account</span>
            </button>

            <!-- Mandiri VA (M2) -->
            <button
              type="button"
              class="p-3 rounded-xl border flex flex-col items-center justify-center text-center gap-1.5 transition-colors"
              :class="
                paymentMethod === 'M2'
                  ? 'border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 font-semibold ring-1 ring-emerald-500'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 text-slate-700 dark:text-slate-300'
              "
              @click="paymentMethod = 'M2'"
            >
              <Building2 class="w-5 h-5 text-amber-600 dark:text-amber-400" />
              <span class="font-bold">Mandiri VA</span>
              <span class="text-[10px] text-slate-500">Virtual Account</span>
            </button>

            <!-- BNI VA (B1) -->
            <button
              type="button"
              class="p-3 rounded-xl border flex flex-col items-center justify-center text-center gap-1.5 transition-colors"
              :class="
                paymentMethod === 'B1'
                  ? 'border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 font-semibold ring-1 ring-emerald-500'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 text-slate-700 dark:text-slate-300'
              "
              @click="paymentMethod = 'B1'"
            >
              <Building2 class="w-5 h-5 text-orange-600 dark:text-orange-400" />
              <span class="font-bold">BNI VA</span>
              <span class="text-[10px] text-slate-500">Virtual Account</span>
            </button>

            <!-- BRI VA (BR) -->
            <button
              type="button"
              class="p-3 rounded-xl border flex flex-col items-center justify-center text-center gap-1.5 transition-colors"
              :class="
                paymentMethod === 'BR'
                  ? 'border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 font-semibold ring-1 ring-emerald-500'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 text-slate-700 dark:text-slate-300'
              "
              @click="paymentMethod = 'BR'"
            >
              <Building2 class="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
              <span class="font-bold">BRI VA</span>
              <span class="text-[10px] text-slate-500">Virtual Account</span>
            </button>

            <!-- Permata VA (BT) -->
            <button
              type="button"
              class="p-3 rounded-xl border flex flex-col items-center justify-center text-center gap-1.5 transition-colors"
              :class="
                paymentMethod === 'BT'
                  ? 'border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 font-semibold ring-1 ring-emerald-500'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 text-slate-700 dark:text-slate-300'
              "
              @click="paymentMethod = 'BT'"
            >
              <Building2 class="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <span class="font-bold">Permata VA</span>
              <span class="text-[10px] text-slate-500">Virtual Account</span>
            </button>

            <!-- OVO (OV) -->
            <button
              type="button"
              class="p-3 rounded-xl border flex flex-col items-center justify-center text-center gap-1.5 transition-colors"
              :class="
                paymentMethod === 'OV'
                  ? 'border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 font-semibold ring-1 ring-emerald-500'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 text-slate-700 dark:text-slate-300'
              "
              @click="paymentMethod = 'OV'"
            >
              <Smartphone class="w-5 h-5 text-purple-600 dark:text-purple-400" />
              <span class="font-bold">OVO</span>
              <span class="text-[10px] text-slate-500">E-Wallet</span>
            </button>

            <!-- DANA (DA) -->
            <button
              type="button"
              class="p-3 rounded-xl border flex flex-col items-center justify-center text-center gap-1.5 transition-colors"
              :class="
                paymentMethod === 'DA'
                  ? 'border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 font-semibold ring-1 ring-emerald-500'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 text-slate-700 dark:text-slate-300'
              "
              @click="paymentMethod = 'DA'"
            >
              <Smartphone class="w-5 h-5 text-sky-600 dark:text-sky-400" />
              <span class="font-bold">DANA</span>
              <span class="text-[10px] text-slate-500">E-Wallet</span>
            </button>

            <!-- Kartu Kredit (VC) -->
            <button
              type="button"
              class="p-3 rounded-xl border flex flex-col items-center justify-center text-center gap-1.5 transition-colors"
              :class="
                paymentMethod === 'VC'
                  ? 'border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 font-semibold ring-1 ring-emerald-500'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 text-slate-700 dark:text-slate-300'
              "
              @click="paymentMethod = 'VC'"
            >
              <CreditCard class="w-5 h-5 text-rose-600 dark:text-rose-400" />
              <span class="font-bold">Kartu Kredit</span>
              <span class="text-[10px] text-slate-500">Visa / Mastercard</span>
            </button>
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
      <div v-else-if="step === 'payment'" class="p-6 space-y-6">
        <!-- Order & Amount Header -->
        <div class="p-4 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 flex items-center justify-between">
          <div>
            <div class="text-xs text-slate-500 dark:text-slate-400 font-mono">
              Order ID: {{ invoiceData.orderId }}
            </div>
            <div class="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
              {{ invoiceData.planName }}
            </div>
            <div v-if="invoiceData.reference" class="text-[11px] text-emerald-700 dark:text-emerald-400 font-mono">
              Ref Duitku: {{ invoiceData.reference }}
            </div>
          </div>
          <div class="text-right">
            <div class="text-xs text-slate-500 dark:text-slate-400">Total Tagihan</div>
            <div class="text-lg font-bold font-money text-emerald-600 dark:text-emerald-400">
              {{ invoiceData.formattedAmount }}
            </div>
          </div>
        </div>

        <!-- Feedback Notice (if checking) -->
        <div
          v-if="checkStatusNotice"
          class="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2"
        >
          <Clock class="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
          <span>{{ checkStatusNotice }}</span>
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
              QRIS NASIONAL · DUITKU SANDBOX
            </div>
          </div>

          <p class="text-xs text-slate-500 dark:text-slate-400 max-w-sm">
            Mendukung <strong>BCA, Mandiri, BRI, BNI, GoPay, ShopeePay, OVO, Dana, LinkAja</strong>, dan seluruh aplikasi berlogo QRIS.
          </p>
        </div>

        <!-- 2. Virtual Account Channel (BC, M2, B1, BR, BT) -->
        <div v-else-if="invoiceData.vaNumber || ['BC', 'M2', 'B1', 'BR', 'BT'].includes(paymentMethod)" class="space-y-4">
          <div class="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-3">
            <div class="text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between">
              <span>Nomor Virtual Account ({{ channelLabels[paymentMethod]?.label || 'Duitku VA' }})</span>
              <span class="text-[10px] uppercase font-bold text-emerald-600">Otomatis Aktif</span>
            </div>
            <div class="flex items-center justify-between gap-3">
              <span class="text-xl sm:text-2xl font-mono font-bold tracking-wider text-slate-900 dark:text-slate-100">
                {{ invoiceData.vaNumber || '8801296345051204' }}
              </span>
              <button
                type="button"
                class="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                @click="copyToClipboard(invoiceData.vaNumber || '8801296345051204', 'va')"
              >
                <Check v-if="copiedField === 'va'" class="w-3.5 h-3.5" />
                <Copy v-else class="w-3.5 h-3.5" />
                <span>{{ copiedField === 'va' ? 'Tersalin' : 'Salin Nomor' }}</span>
              </button>
            </div>
            <div class="text-[11px] text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-700 pt-2 flex items-center justify-between">
              <span>Nama Penerima: <strong>DUITKU / SISAUANG PRO</strong></span>
              <span>Nominal: <strong>{{ invoiceData.formattedAmount }}</strong></span>
            </div>
          </div>

          <div class="text-xs text-slate-600 dark:text-slate-400 space-y-1.5 pl-1">
            <div class="font-semibold text-slate-800 dark:text-slate-200">Panduan Pembayaran:</div>
            <ol class="list-decimal pl-4 space-y-1">
              <li>Buka aplikasi m-Banking Anda, pilih menu <strong>Transfer &gt; Virtual Account</strong>.</li>
              <li>Masukkan nomor VA di atas. Pastikan nama akun penerima adalah <strong>DUITKU / SISAUANG PRO</strong>.</li>
              <li>Konfirmasi pembayaran sejumlah <strong>{{ invoiceData.formattedAmount }}</strong>.</li>
              <li>Setelah berhasil, sistem SisaUang akan langsung mengaktifkan status Pro dalam beberapa detik.</li>
            </ol>
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
      <div v-else-if="step === 'success'" class="p-6 space-y-6">
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
        <div class="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 space-y-3 text-xs">
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
