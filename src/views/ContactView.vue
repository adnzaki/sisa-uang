<script setup lang="ts">
import { ref, onMounted } from 'vue';
import PublicNavbar from '../components/PublicNavbar.vue';
import PublicFooter from '../components/PublicFooter.vue';
import { scrollToPageTopMultiFrame } from '../utils/scroll';

onMounted(() => {
  scrollToPageTopMultiFrame();
});
import {
  Mail,
  Phone,
  Clock,
  MapPin,
  Send,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  ExternalLink,
} from 'lucide-vue-next';

const name = ref('');
const email = ref('');
const subject = ref('');
const message = ref('');
const isSubmitting = ref(false);
const submitted = ref(false);
const errorMessage = ref('');

async function submitContact() {
  if (!name.value.trim() || !email.value.trim() || !message.value.trim()) {
    errorMessage.value = 'Mohon lengkapi nama, email, dan pesan Anda.';
    return;
  }

  isSubmitting.value = true;
  errorMessage.value = '';

  try {
    const res = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.value.trim(),
        email: email.value.trim(),
        subject: subject.value.trim() || 'Pertanyaan Layanan SisaUang',
        message: message.value.trim(),
      }),
    });

    if (!res.ok) {
      throw new Error('Gagal mengirimkan pesan ke server.');
    }

    submitted.value = true;
    name.value = '';
    email.value = '';
    subject.value = '';
    message.value = '';
  } catch (err: any) {
    errorMessage.value = err.message || 'Terjadi gangguan saat mengirimkan pesan.';
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
    <PublicNavbar />

    <main class="flex-1 py-12 md:py-16">
      <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <!-- Header -->
        <div class="max-w-2xl mx-auto text-center space-y-3 mb-12">
          <div class="flex items-center justify-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            <MessageSquare class="w-4 h-4" />
            <span>Kanal Komunikasi & Layanan Resmi</span>
          </div>
          <h1 class="text-3xl font-extrabold text-slate-900 dark:text-slate-100">
            Hubungi Tim Dukungan SisaUang
          </h1>
          <p class="text-sm text-slate-600 dark:text-slate-400">
            Kami siap membantu Anda mengenai pertanyaan fitur, aktivasi langganan Pro, bantuan teknis, maupun kemitraan instansi.
          </p>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">
          <!-- Left: Business Info Card (Midtrans criteria compliance) -->
          <div class="lg:col-span-2 space-y-6">
            <div class="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-6 shadow-xs">
              <h3 class="text-base font-bold text-slate-900 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-3">
                Informasi Kontak Pengelola
              </h3>

              <div class="space-y-4 text-xs sm:text-sm">
                <!-- Email -->
                <div class="flex items-start gap-3">
                  <div class="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <Mail class="w-4 h-4" />
                  </div>
                  <div>
                    <div class="text-xs text-slate-500">Email Resmi Bisnis</div>
                    <a href="mailto:vuedevo@gmail.com" class="font-semibold text-slate-800 dark:text-slate-200 hover:text-emerald-600 transition-colors">
                      vuedevo@gmail.com
                    </a>
                  </div>
                </div>

                <!-- WhatsApp -->
                <div class="flex items-start gap-3">
                  <div class="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <Phone class="w-4 h-4" />
                  </div>
                  <div>
                    <div class="text-xs text-slate-500">WhatsApp Pelanggan</div>
                    <a
                      href="https://wa.me/6285129634505"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="font-semibold text-emerald-600 hover:underline inline-flex items-center gap-1"
                    >
                      <span>0851-2963-4505</span>
                      <ExternalLink class="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>

                <!-- Alamat Kantor / Operasional -->
                <div class="flex items-start gap-3">
                  <div class="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <MapPin class="w-4 h-4" />
                  </div>
                  <div>
                    <div class="text-xs text-slate-500">Alamat Kantor / Operasional</div>
                    <div class="font-medium text-slate-800 dark:text-slate-200 leading-snug">
                      Jl. Pengasinan Tengah No. 68 Rawalumbu Kota Bekasi 17115
                    </div>
                  </div>
                </div>

                <!-- Operating Hours -->
                <div class="flex items-start gap-3">
                  <div class="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0">
                    <Clock class="w-4 h-4" />
                  </div>
                  <div>
                    <div class="text-xs text-slate-500">Jam Layanan Operasional</div>
                    <div class="font-medium text-slate-800 dark:text-slate-200">
                      Senin – Jumat: 08.00 – 17.00 WIB
                    </div>
                    <div class="text-xs text-slate-500 mt-0.5">Sabtu & Minggu: Libur / Respon Terbatas</div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Direct WhatsApp Quick CTA -->
            <a
              href="https://wa.me/6285129634505"
              target="_blank"
              rel="noopener noreferrer"
              class="p-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-between font-semibold text-xs shadow-xs transition-colors"
            >
              <div class="flex items-center gap-2">
                <Phone class="w-4 h-4" />
                <span>Chat Langsung via WhatsApp</span>
              </div>
              <span>0851-2963-4505 &rarr;</span>
            </a>
          </div>

          <!-- Right: Interactive Contact Form -->
          <div class="lg:col-span-3">
            <div class="p-6 sm:p-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-6">
              <h3 class="text-base font-bold text-slate-900 dark:text-slate-100">
                Kirim Pesan / Permintaan Bantuan
              </h3>

              <div
                v-if="submitted"
                class="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200 flex items-start gap-3"
              >
                <CheckCircle2 class="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <div class="font-bold">Pesan Anda Berhasil Terkirim!</div>
                  <p class="mt-0.5 text-emerald-700 dark:text-emerald-300">
                    Tim kami akan merespons melalui email <strong>{{ email || 'Anda' }}</strong> dalam waktu maksimal 1x24 jam kerja.
                  </p>
                </div>
              </div>

              <div
                v-if="errorMessage"
                class="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2.5"
              >
                <AlertCircle class="w-4 h-4 shrink-0 mt-0.5" />
                <span>{{ errorMessage }}</span>
              </div>

              <form class="space-y-4" @submit.prevent="submitContact">
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Nama Anda
                    </label>
                    <input
                      v-model="name"
                      type="text"
                      placeholder="Nama lengkap"
                      required
                      class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Alamat Email
                    </label>
                    <input
                      v-model="email"
                      type="email"
                      placeholder="emailanda@gmail.com"
                      required
                      class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Subjek / Topik
                  </label>
                  <input
                    v-model="subject"
                    type="text"
                    placeholder="Contoh: Pertanyaan Paket SisaUang Pro Tahunan"
                    class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Pesan Pertanyaan
                  </label>
                  <textarea
                    v-model="message"
                    rows="4"
                    placeholder="Tuliskan pertanyaan atau kebutuhan Anda secara rinci..."
                    required
                    class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  ></textarea>
                </div>

                <button
                  type="submit"
                  :disabled="isSubmitting"
                  class="w-full py-3 px-4 rounded-xl bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white text-white dark:text-slate-900 font-semibold text-xs flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                  <Send class="w-3.5 h-3.5" />
                  <span>{{ isSubmitting ? 'Mengirimkan Pesan...' : 'Kirim Pesan Sekarang' }}</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </main>

    <PublicFooter />
  </div>
</template>
