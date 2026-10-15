<script setup lang="ts">
import { ref, computed, watch } from 'vue';
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
  Download,
  AlertCircle,
  Sparkles,
} from 'lucide-vue-next';
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
const phone = ref('0851-2963-4505');
const paymentMethod = ref<'qris' | 'bca_va' | 'mandiri_va' | 'bri_va' | 'gopay' | 'credit_card'>('qris');

// Steps: 'form' | 'payment' | 'success'
const step = ref<'form' | 'payment' | 'success'>('form');
const isSubmitting = ref(false);
const errorMessage = ref('');
const copiedField = ref('');

// Invoice generated state
const invoiceData = ref<{
  invoiceNumber: string;
  orderId: string;
  planName: string;
  amount: number;
  formattedAmount: string;
  methodLabel: string;
  vaNumber?: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  paidAt: string;
}>({
  invoiceNumber: '',
  orderId: '',
  planName: '',
  amount: 215000,
  formattedAmount: 'Rp 215.000',
  methodLabel: 'QRIS',
  customerName: '',
  customerEmail: '',
  customerPhone: '',
  paidAt: '',
});

const currentPrice = computed(() => {
  return selectedPlan.value === 'yearly' ? 215000 : 21500;
});

const formattedPrice = computed(() => {
  return selectedPlan.value === 'yearly' ? 'Rp 215.000' : 'Rp 21.500';
});

const planPeriodLabel = computed(() => {
  return selectedPlan.value === 'yearly' ? '1 Tahun Penuh (Hemat 2 Bulan)' : '1 Bulan';
});

watch(
  () => props.isOpen,
  (val) => {
    if (val) {
      step.value = 'form';
      errorMessage.value = '';
      if (authStore.user) {
        fullName.value = authStore.user.displayName || '';
        email.value = authStore.user.email || '';
      }
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
    errorMessage.value = 'Mohon masukkan alamat email yang valid untuk pengiriman lisensi.';
    return;
  }
  if (!phone.value.trim()) {
    errorMessage.value = 'Mohon masukkan nomor WhatsApp / telepon yang aktif.';
    return;
  }

  isSubmitting.value = true;
  errorMessage.value = '';

  try {
    const payload = {
      plan: selectedPlan.value,
      amount: currentPrice.value,
      customerName: fullName.value.trim(),
      customerEmail: email.value.trim(),
      customerPhone: phone.value.trim(),
      paymentMethod: paymentMethod.value,
    };

    const res = await fetch('/api/payment/create-transaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Gagal memproses inisialisasi pembayaran.');
    }

    const methodLabels: Record<string, string> = {
      qris: 'QRIS (Gopay / ShopeePay / BCA / Mandiri)',
      bca_va: 'BCA Virtual Account',
      mandiri_va: 'Mandiri Virtual Account',
      bri_va: 'BRI Virtual Account',
      gopay: 'GoPay / QRIS Midtrans',
      credit_card: 'Kartu Kredit / Debit Online',
    };

    invoiceData.value = {
      invoiceNumber: data.invoiceNumber || `INV-SU-${Date.now().toString().slice(-6)}`,
      orderId: data.orderId || `ORDER-${Date.now()}`,
      planName: selectedPlan.value === 'yearly' ? 'SisaUang Pro Tahunan' : 'SisaUang Pro Bulanan',
      amount: currentPrice.value,
      formattedAmount: formattedPrice.value,
      methodLabel: methodLabels[paymentMethod.value] || 'Midtrans Snap',
      vaNumber: data.vaNumber || '8801296345051204',
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
  } catch (err: any) {
    errorMessage.value = err.message || 'Terjadi kesalahan sistem pembayaran.';
  } finally {
    isSubmitting.value = false;
  }
}

async function verifyAndCompletePayment() {
  isSubmitting.value = true;
  try {
    const res = await fetch('/api/payment/confirm-mock-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: invoiceData.value.orderId,
        invoiceNumber: invoiceData.value.invoiceNumber,
        customerEmail: invoiceData.value.customerEmail,
        plan: selectedPlan.value,
        amount: invoiceData.value.amount,
      }),
    });

    if (!res.ok) {
      throw new Error('Gagal memverifikasi status pembayaran.');
    }

    step.value = 'success';
    emit('success', {
      plan: selectedPlan.value,
      invoiceId: invoiceData.value.invoiceNumber,
      amount: invoiceData.value.amount,
    });
  } catch (err: any) {
    errorMessage.value = err.message || 'Konfirmasi pembayaran tertunda.';
  } finally {
    isSubmitting.value = false;
  }
}

function handleClose() {
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
          <div class="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
            Portal Checkout Resmi SisaUang
          </div>
          <h2 class="text-lg font-bold text-slate-900 dark:text-slate-100">
            {{ step === 'success' ? 'Pembayaran Berhasil' : 'Pemesanan Lisensi SisaUang Pro' }}
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
              Nama Lengkap
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
                Alamat Email Aktif
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
                placeholder="0851-2963-4505"
                class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
        </div>

        <!-- Payment Method Choice (In-Site Gateway) -->
        <div class="space-y-2.5">
          <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300">
            Metode Pembayaran (Diproses Langsung di Sini via Midtrans)
          </label>
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
            <!-- QRIS -->
            <button
              type="button"
              class="p-3 rounded-xl border flex flex-col items-center justify-center text-center gap-1.5 transition-colors"
              :class="
                paymentMethod === 'qris'
                  ? 'border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 font-semibold'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 text-slate-700 dark:text-slate-300'
              "
              @click="paymentMethod = 'qris'"
            >
              <QrCode class="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              <span>QRIS Instan</span>
            </button>

            <!-- BCA VA -->
            <button
              type="button"
              class="p-3 rounded-xl border flex flex-col items-center justify-center text-center gap-1.5 transition-colors"
              :class="
                paymentMethod === 'bca_va'
                  ? 'border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 font-semibold'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 text-slate-700 dark:text-slate-300'
              "
              @click="paymentMethod = 'bca_va'"
            >
              <Building2 class="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <span>BCA Virtual Acc</span>
            </button>

            <!-- Mandiri VA -->
            <button
              type="button"
              class="p-3 rounded-xl border flex flex-col items-center justify-center text-center gap-1.5 transition-colors"
              :class="
                paymentMethod === 'mandiri_va'
                  ? 'border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 font-semibold'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 text-slate-700 dark:text-slate-300'
              "
              @click="paymentMethod = 'mandiri_va'"
            >
              <Building2 class="w-5 h-5 text-amber-600 dark:text-amber-400" />
              <span>Mandiri VA</span>
            </button>

            <!-- BRI VA -->
            <button
              type="button"
              class="p-3 rounded-xl border flex flex-col items-center justify-center text-center gap-1.5 transition-colors"
              :class="
                paymentMethod === 'bri_va'
                  ? 'border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 font-semibold'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 text-slate-700 dark:text-slate-300'
              "
              @click="paymentMethod = 'bri_va'"
            >
              <Building2 class="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
              <span>BRI VA</span>
            </button>

            <!-- GoPay -->
            <button
              type="button"
              class="p-3 rounded-xl border flex flex-col items-center justify-center text-center gap-1.5 transition-colors"
              :class="
                paymentMethod === 'gopay'
                  ? 'border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 font-semibold'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 text-slate-700 dark:text-slate-300'
              "
              @click="paymentMethod = 'gopay'"
            >
              <Smartphone class="w-5 h-5 text-teal-600 dark:text-teal-400" />
              <span>GoPay E-Wallet</span>
            </button>

            <!-- Kartu Kredit -->
            <button
              type="button"
              class="p-3 rounded-xl border flex flex-col items-center justify-center text-center gap-1.5 transition-colors"
              :class="
                paymentMethod === 'credit_card'
                  ? 'border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 font-semibold'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 text-slate-700 dark:text-slate-300'
              "
              @click="paymentMethod = 'credit_card'"
            >
              <CreditCard class="w-5 h-5 text-purple-600 dark:text-purple-400" />
              <span>Kartu Kredit/Debit</span>
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
            <span>Pembayaran aman di dalam situs. Terenkripsi SSL 256-bit berstandar PCI-DSS Midtrans.</span>
          </div>
        </div>

        <!-- Submit Button -->
        <button
          type="button"
          :disabled="isSubmitting"
          class="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-sm transition-colors disabled:opacity-50"
          @click="proceedToPayment"
        >
          <span v-if="isSubmitting">Memproses Transaksi...</span>
          <template v-else>
            <span>Lanjut ke Pembayaran ({{ formattedPrice }})</span>
            <ArrowRight class="w-4 h-4" />
          </template>
        </button>
      </div>

      <!-- Step 2: In-Site Payment (Direct on website, not redirected) -->
      <div v-else-if="step === 'payment'" class="p-6 space-y-6">
        <!-- Order & Amount Header -->
        <div class="p-4 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 flex items-center justify-between">
          <div>
            <div class="text-xs text-slate-500 dark:text-slate-400">No. Tagihan: {{ invoiceData.invoiceNumber }}</div>
            <div class="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
              {{ invoiceData.planName }}
            </div>
          </div>
          <div class="text-right">
            <div class="text-xs text-slate-500 dark:text-slate-400">Total Bayar</div>
            <div class="text-lg font-bold font-money text-emerald-600 dark:text-emerald-400">
              {{ invoiceData.formattedAmount }}
            </div>
          </div>
        </div>

        <!-- QRIS Payment View -->
        <div v-if="paymentMethod === 'qris' || paymentMethod === 'gopay'" class="flex flex-col items-center text-center space-y-3">
          <div class="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
            <Clock class="w-4 h-4 text-amber-500" />
            <span>Selesaikan pembayaran dalam waktu <strong>14:59</strong></span>
          </div>

          <!-- Clean QR Code Visual Representation -->
          <div class="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center">
            <svg class="w-48 h-48" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="100" height="100" fill="white" />
              <!-- Top-left finder -->
              <rect x="10" y="10" width="22" height="22" rx="3" fill="#0f172a" />
              <rect x="14" y="14" width="14" height="14" rx="2" fill="white" />
              <rect x="17" y="17" width="8" height="8" rx="1" fill="#059669" />
              <!-- Top-right finder -->
              <rect x="68" y="10" width="22" height="22" rx="3" fill="#0f172a" />
              <rect x="72" y="14" width="14" height="14" rx="2" fill="white" />
              <rect x="75" y="17" width="8" height="8" rx="1" fill="#059669" />
              <!-- Bottom-left finder -->
              <rect x="10" y="68" width="22" height="22" rx="3" fill="#0f172a" />
              <rect x="14" y="72" width="14" height="14" rx="2" fill="white" />
              <rect x="17" y="75" width="8" height="8" rx="1" fill="#059669" />
              <!-- QR Patterns -->
              <rect x="36" y="12" width="4" height="4" fill="#0f172a" />
              <rect x="44" y="12" width="4" height="4" fill="#0f172a" />
              <rect x="52" y="12" width="4" height="4" fill="#0f172a" />
              <rect x="36" y="20" width="4" height="4" fill="#0f172a" />
              <rect x="48" y="20" width="8" height="4" fill="#0f172a" />
              <rect x="60" y="20" width="4" height="4" fill="#0f172a" />
              <rect x="36" y="28" width="8" height="4" fill="#0f172a" />
              <rect x="48" y="28" width="4" height="4" fill="#0f172a" />
              <rect x="56" y="28" width="8" height="4" fill="#0f172a" />
              <rect x="12" y="36" width="4" height="8" fill="#0f172a" />
              <rect x="20" y="36" width="8" height="4" fill="#0f172a" />
              <rect x="32" y="36" width="4" height="4" fill="#0f172a" />
              <rect x="40" y="36" width="8" height="8" fill="#059669" />
              <rect x="52" y="36" width="4" height="4" fill="#0f172a" />
              <rect x="64" y="36" width="4" height="8" fill="#0f172a" />
              <rect x="76" y="36" width="8" height="4" fill="#0f172a" />
              <rect x="12" y="48" width="8" height="4" fill="#0f172a" />
              <rect x="24" y="48" width="4" height="8" fill="#0f172a" />
              <rect x="32" y="48" width="8" height="4" fill="#0f172a" />
              <rect x="44" y="48" width="4" height="8" fill="#0f172a" />
              <rect x="56" y="48" width="8" height="4" fill="#0f172a" />
              <rect x="68" y="48" width="4" height="4" fill="#0f172a" />
              <rect x="76" y="48" width="12" height="4" fill="#0f172a" />
              <rect x="12" y="60" width="4" height="4" fill="#0f172a" />
              <rect x="20" y="56" width="8" height="4" fill="#0f172a" />
              <rect x="36" y="60" width="8" height="4" fill="#0f172a" />
              <rect x="48" y="60" width="4" height="8" fill="#0f172a" />
              <rect x="56" y="60" width="4" height="4" fill="#0f172a" />
              <rect x="68" y="60" width="8" height="4" fill="#0f172a" />
              <rect x="80" y="60" width="4" height="8" fill="#0f172a" />
              <rect x="36" y="72" width="4" height="8" fill="#0f172a" />
              <rect x="44" y="72" width="8" height="4" fill="#0f172a" />
              <rect x="56" y="72" width="4" height="8" fill="#0f172a" />
              <rect x="64" y="72" width="8" height="4" fill="#0f172a" />
              <rect x="76" y="72" width="12" height="4" fill="#0f172a" />
              <rect x="40" y="84" width="8" height="4" fill="#0f172a" />
              <rect x="52" y="84" width="8" height="4" fill="#0f172a" />
              <rect x="68" y="80" width="4" height="8" fill="#0f172a" />
              <rect x="76" y="84" width="8" height="4" fill="#0f172a" />
            </svg>
            <div class="mt-2 text-[10px] font-bold tracking-wider text-slate-800 uppercase">
              QRIS NASIONAL · MIDTRANS
            </div>
          </div>

          <p class="text-xs text-slate-500 dark:text-slate-400 max-w-sm">
            Buka aplikasi BCA Mobile, Livin by Mandiri, GoPay, ShopeePay, OVO, atau Dana, lalu pindai kode QRIS di atas.
          </p>
        </div>

        <!-- Virtual Account Payment View -->
        <div v-else-if="paymentMethod.includes('va')" class="space-y-4">
          <div class="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-3">
            <div class="text-xs text-slate-500 dark:text-slate-400">Nomor Virtual Account</div>
            <div class="flex items-center justify-between gap-3">
              <span class="text-xl font-mono font-bold tracking-wide text-slate-900 dark:text-slate-100">
                {{ invoiceData.vaNumber }}
              </span>
              <button
                type="button"
                class="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
                @click="copyToClipboard(invoiceData.vaNumber || '', 'va')"
              >
                <Check v-if="copiedField === 'va'" class="w-3.5 h-3.5" />
                <Copy v-else class="w-3.5 h-3.5" />
                <span>{{ copiedField === 'va' ? 'Tersalin' : 'Salin Nomor' }}</span>
              </button>
            </div>
            <div class="text-[11px] text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-700 pt-2">
              Nama Rekening Tujuan: <strong>MIDTRANS / SISAUANG PRO</strong>
            </div>
          </div>

          <div class="text-xs text-slate-600 dark:text-slate-400 space-y-1.5 pl-1">
            <div class="font-semibold text-slate-800 dark:text-slate-200">Cara Pembayaran ATM / Mobile Banking:</div>
            <ol class="list-decimal pl-4 space-y-1">
              <li>Pilih menu <strong>Transfer &gt; Virtual Account</strong> di aplikasi m-banking Anda.</li>
              <li>Masukkan nomor VA di atas dan pastikan nama penerima sesuai.</li>
              <li>Masukkan jumlah nominal tepat <strong>{{ invoiceData.formattedAmount }}</strong>.</li>
              <li>Selesaikan transaksi dan klik tombol konfirmasi di bawah.</li>
            </ol>
          </div>
        </div>

        <!-- Credit Card Direct View -->
        <div v-else class="space-y-4">
          <div class="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-3">
            <div>
              <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Nomor Kartu (Visa / Mastercard)
              </label>
              <input
                type="text"
                placeholder="4000 1234 5678 9010"
                class="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono text-slate-900 dark:text-slate-100"
              />
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Masa Berlaku (MM/YY)</label>
                <input
                  type="text"
                  placeholder="12/28"
                  class="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">CVV</label>
                <input
                  type="password"
                  maxlength="4"
                  placeholder="123"
                  class="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-mono text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="space-y-2 pt-2">
          <button
            type="button"
            :disabled="isSubmitting"
            class="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-sm transition-colors disabled:opacity-50"
            @click="verifyAndCompletePayment"
          >
            <span v-if="isSubmitting">Memverifikasi Pembayaran...</span>
            <template v-else>
              <CheckCircle2 class="w-4 h-4" />
              <span>Saya Sudah Membayar (Verifikasi Otomatis)</span>
            </template>
          </button>
          <button
            type="button"
            class="w-full py-2 px-3 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
            @click="step = 'form'"
          >
            &larr; Ubah paket atau metode pembayaran
          </button>
        </div>
      </div>

      <!-- Step 3: Success Screen & Invoice Receipt -->
      <div v-else-if="step === 'success'" class="p-6 space-y-6">
        <div class="text-center space-y-2">
          <div class="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
            <CheckCircle2 class="w-7 h-7" />
          </div>
          <h3 class="text-lg font-bold text-slate-900 dark:text-slate-100">
            Transaksi Berhasil Dikonfirmasi!
          </h3>
          <p class="text-xs text-slate-600 dark:text-slate-400 max-w-sm mx-auto">
            Terima kasih telah berlangganan <strong>{{ invoiceData.planName }}</strong>. Lisensi platform Anda telah aktif dan bukti transaksi telah dikirimkan ke <strong>{{ invoiceData.customerEmail }}</strong>.
          </p>
        </div>

        <!-- Official Invoice Card -->
        <div class="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 space-y-3 text-xs">
          <div class="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
            <div>
              <div class="font-bold text-slate-900 dark:text-slate-100">INVOICE PEMBAYARAN</div>
              <div class="text-[11px] text-slate-500">Nomor: {{ invoiceData.invoiceNumber }}</div>
            </div>
            <span class="px-2.5 py-1 rounded-md bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 font-bold uppercase tracking-wider text-[10px]">
              LUNAS / PAID
            </span>
          </div>

          <div class="grid grid-cols-2 gap-2 text-slate-600 dark:text-slate-400">
            <div>
              <span class="block text-[11px] text-slate-400">Nama Pelanggan</span>
              <span class="font-medium text-slate-800 dark:text-slate-200">{{ invoiceData.customerName }}</span>
            </div>
            <div>
              <span class="block text-[11px] text-slate-400">Email Lisensi</span>
              <span class="font-medium text-slate-800 dark:text-slate-200">{{ invoiceData.customerEmail }}</span>
            </div>
            <div>
              <span class="block text-[11px] text-slate-400">Metode Pembayaran</span>
              <span class="font-medium text-slate-800 dark:text-slate-200">{{ invoiceData.methodLabel }}</span>
            </div>
            <div>
              <span class="block text-[11px] text-slate-400">Waktu Transaksi</span>
              <span class="font-medium text-slate-800 dark:text-slate-200">{{ invoiceData.paidAt }}</span>
            </div>
          </div>

          <div class="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <span class="font-semibold text-slate-800 dark:text-slate-200">Total Pembayaran</span>
            <span class="text-base font-bold font-money text-emerald-600 dark:text-emerald-400">
              {{ invoiceData.formattedAmount }}
            </span>
          </div>
        </div>

        <!-- Buttons -->
        <div class="space-y-2 pt-2">
          <button
            type="button"
            class="w-full py-3 px-4 rounded-xl bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white text-white dark:text-slate-900 font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
            @click="handleClose"
          >
            <span>Tutup & Mulai Gunakan SisaUang Pro</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
