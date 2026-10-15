/**
 * Pre-rendered Semantic HTML Templates for Public & Legal Pages
 * Provides instant first-paint HTML and full SEO / compliance visibility
 * for search engines, Midtrans verification crawlers, and visitors before JS execution.
 */

export interface PreRenderPageData {
  title: string;
  description: string;
  canonicalUrl: string;
  htmlContent: string;
}

const COMMON_NAVBAR_HTML = `
  <header class="sticky top-0 z-40 w-full border-b border-slate-200/80 dark:border-slate-800/80 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md transition-colors">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex items-center justify-between h-16">
        <a href="/landing" class="flex items-center gap-2.5 group">
          <div class="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"></path></svg>
          </div>
          <div>
            <span class="text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight">SisaUang</span>
            <span class="hidden sm:inline-block text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold ml-2">Platform Kas &amp; Anggaran</span>
          </div>
        </a>

        <nav class="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
          <a href="/landing#features" class="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">Fitur</a>
          <a href="/landing#pricing" class="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">Paket Harga (IDR)</a>
          <a href="/terms" class="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">Syarat &amp; Ketentuan</a>
          <a href="/refund-policy" class="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">Kebijakan Refund</a>
          <a href="/contact" class="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">Hubungi Kami</a>
        </nav>

        <div class="flex items-center gap-3">
          <a href="/auth" class="px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white text-white dark:text-slate-900 text-xs font-semibold shadow-xs transition-colors">
            Masuk ke Aplikasi
          </a>
        </div>
      </div>
    </div>
  </header>
`;

const COMMON_FOOTER_HTML = `
  <footer class="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 transition-colors">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8 lg:gap-12">
        <div class="lg:col-span-2 space-y-4">
          <a href="/landing" class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"></path></svg>
            </div>
            <span class="text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight">SisaUang</span>
          </a>
          <p class="text-xs text-slate-600 dark:text-slate-400 leading-relaxed max-w-sm">
            Platform manajemen kas, arus dana, dan perencanaan anggaran modern untuk individu, wirausaha, serta lembaga. Dilengkapi laporan pembukuan berstandar akuntansi siap cetak PDF.
          </p>

          <div class="p-3.5 rounded-xl border border-emerald-200/80 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/30 text-xs text-slate-700 dark:text-slate-300 space-y-1.5">
            <div class="font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
              <svg class="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
              <span>Publikasi &amp; Dukungan Resmi</span>
            </div>
            <p class="text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
              Aplikasi ini didukung oleh <a href="https://bitdanbait.web.id" target="_blank" rel="noopener noreferrer" class="font-semibold text-emerald-700 dark:text-emerald-400 underline">Bit &amp; Bait</a> karena SisaUang dipublikasikan di sub-domain Bit &amp; Bait (<a href="https://sisauang.bitdanbait.web.id" target="_blank" rel="noopener noreferrer" class="font-semibold text-emerald-700 dark:text-emerald-400 underline">sisauang.bitdanbait.web.id</a>) dan bermitra bersama <a href="https://actudent.com" target="_blank" rel="noopener noreferrer" class="font-semibold text-emerald-700 dark:text-emerald-400 underline">Actudent</a>.
            </p>
          </div>
        </div>

        <div class="space-y-3">
          <h4 class="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">Fitur Utama</h4>
          <ul class="space-y-2 text-xs text-slate-600 dark:text-slate-400">
            <li><a href="/landing#features" class="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">Multi Sumber Dana &amp; Bank</a></li>
            <li><a href="/landing#features" class="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">Manajemen Kepemilikan Dana</a></li>
            <li><a href="/landing#features" class="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">Pagu Anggaran Bulanan &amp; Tahunan</a></li>
            <li><a href="/landing#features" class="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">Laporan Kas Berstandar (PDF)</a></li>
          </ul>
        </div>

        <div class="space-y-3">
          <h4 class="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">Legal &amp; Kepatuhan</h4>
          <ul class="space-y-2 text-xs text-slate-600 dark:text-slate-400">
            <li><a href="/terms" class="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">Syarat &amp; Ketentuan Lisensi</a></li>
            <li><a href="/refund-policy" class="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">Kebijakan Pengembalian Dana (Refund)</a></li>
            <li><a href="/privacy" class="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">Kebijakan Privasi Data</a></li>
            <li><a href="/contact" class="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">Kanal Bantuan &amp; Layanan</a></li>
          </ul>
        </div>

        <div class="space-y-3">
          <h4 class="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">Kontak Bisnis</h4>
          <ul class="space-y-2.5 text-xs text-slate-600 dark:text-slate-400">
            <li class="flex items-start gap-2">
              <svg class="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
              <a href="mailto:vuedevo@gmail.com" class="hover:text-emerald-600 transition-colors">vuedevo@gmail.com</a>
            </li>
            <li class="flex items-start gap-2">
              <svg class="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path></svg>
              <a href="https://wa.me/6285129634505" target="_blank" rel="noopener noreferrer" class="hover:text-emerald-600 transition-colors">0851-2963-4505 (WhatsApp)</a>
            </li>
            <li class="flex items-start gap-2">
              <svg class="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              <span>Senin – Jumat (08.00 – 17.00 WIB)</span>
            </li>
          </ul>
        </div>
      </div>

      <div class="mt-12 pt-6 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
        <p>&copy; 2026 SisaUang. Hak cipta dilindungi undang-undang.</p>
        <div class="flex items-center gap-4 text-[11px]">
          <span>Mata Uang Transaksi: Rupiah (IDR)</span>
          <span aria-hidden="true">&middot;</span>
          <span>Diproses via Midtrans Payment Gateway</span>
        </div>
      </div>
    </div>
  </footer>
`;

export const PRERENDERED_PAGES: Record<string, PreRenderPageData> = {
  '/landing': {
    title: 'SisaUang – Platform Manajemen Kas, Anggaran & Pelaporan Keuangan',
    description: 'Aplikasi manajemen keuangan personal dan organisasi modern. Multi dompet, pemisahan pos dana, pagu anggaran tahunan, dan laporan PDF siap cetak berstandar akuntansi.',
    canonicalUrl: 'https://sisauang.bitdanbait.web.id/landing',
    htmlContent: `
      <div class="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
        ${COMMON_NAVBAR_HTML}

        <main class="flex-1">
          <!-- Hero Section -->
          <section class="relative overflow-hidden py-16 sm:py-24 border-b border-slate-200/80 dark:border-slate-800/80 bg-gradient-to-b from-white to-slate-50 dark:from-slate-900 dark:to-slate-950">
            <div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-6">
              <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
                <span>Platform Kas &amp; Anggaran SisaUang Pro</span>
              </div>
              <h1 class="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 leading-tight">
                Kelola Kas &amp; Anggaran Lebih Tertata Tanpa Rumit
              </h1>
              <p class="text-sm sm:text-base text-slate-600 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed">
                Pisahkan dana pribadi, usaha, dan keluarga dalam satu wadah. Rencanakan anggaran setahun penuh dan unduh pembukuan kas resmi berstandar akuntansi siap cetak PDF.
              </p>
              <div class="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
                <a href="/auth" class="w-full sm:w-auto px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm shadow-sm transition-colors text-center">
                  Mulai Gratis Sekarang
                </a>
                <a href="#pricing" class="w-full sm:w-auto px-6 py-3 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold text-sm transition-colors text-center">
                  Lihat Paket Harga (IDR)
                </a>
              </div>
            </div>
          </section>

          <!-- Features Section -->
          <section id="features" class="py-16 sm:py-20 border-b border-slate-200/80 dark:border-slate-800/80">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
              <div class="text-center max-w-2xl mx-auto space-y-2">
                <h2 class="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                  Fitur Unggulan untuk Kebutuhan Keuangan Nyata
                </h2>
                <p class="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                  Dirancang spesifik untuk mengatasi kerumitan pencatatan dana bercampur dan pelaporan kas formal.
                </p>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div class="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
                  <div class="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 flex items-center justify-center font-bold">1</div>
                  <h3 class="text-base font-bold text-slate-900 dark:text-slate-100">Multi Sumber Dana</h3>
                  <p class="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    Kelola banyak rekening bank, e-wallet, brankas tunai, dan rekening operasional dalam satu dashboard terpadu.
                  </p>
                </div>

                <div class="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
                  <div class="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 flex items-center justify-center font-bold">2</div>
                  <h3 class="text-base font-bold text-slate-900 dark:text-slate-100">Manajemen Pos Dana</h3>
                  <p class="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    Pecah saldo satu rekening menjadi kepemilikan dana berbeda (dana tabungan, titipan, operasional, atau jatah keluarga).
                  </p>
                </div>

                <div class="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
                  <div class="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 flex items-center justify-center font-bold">3</div>
                  <h3 class="text-base font-bold text-slate-900 dark:text-slate-100">Anggaran Setahun Penuh</h3>
                  <p class="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    Petakan target serapan per kategori sepanjang 12 bulan kalender lengkap dengan pemantau deviasi real-time.
                  </p>
                </div>

                <div class="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
                  <div class="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 flex items-center justify-center font-bold">4</div>
                  <h3 class="text-base font-bold text-slate-900 dark:text-slate-100">Laporan PDF Berstandar</h3>
                  <p class="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    Unduh Buku Kas Umum, Rekonsiliasi Kas, dan Realisasi Anggaran ber-Kop resmi dan tanda tangan pengurus.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <!-- Pricing Section -->
          <section id="pricing" class="py-16 sm:py-20 bg-slate-50 dark:bg-slate-950">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
              <div class="text-center max-w-2xl mx-auto space-y-2">
                <h2 class="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                  Paket Langganan Transparan dalam Rupiah (IDR)
                </h2>
                <p class="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                  Seluruh tagihan diproses resmi melalui Midtrans Payment Gateway. Tanpa biaya tersembunyi.
                </p>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto items-stretch">
                <!-- Plan 1: Starter Gratis -->
                <div class="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between space-y-6">
                  <div class="space-y-4">
                    <div>
                      <h3 class="text-base font-bold text-slate-900 dark:text-slate-100">Starter Gratis</h3>
                      <p class="text-xs text-slate-500 mt-1">Penggunaan pencatatan harian dasar</p>
                    </div>
                    <div class="pt-2">
                      <div class="text-3xl font-bold font-money text-slate-900 dark:text-slate-100">Rp 0</div>
                      <div class="text-xs text-slate-500">Gratis selamanya</div>
                    </div>
                    <ul class="space-y-2.5 text-xs text-slate-600 dark:text-slate-400 pt-4 border-t border-slate-100 dark:border-slate-800">
                      <li>&check; Maksimal 5 Sumber Dana (Wallet)</li>
                      <li>&check; Maksimal 2 Kepemilikan Dana</li>
                      <li>&check; Anggaran Bulan Berjalan</li>
                      <li>&check; Analitik &amp; Grafik Saldo</li>
                    </ul>
                  </div>
                  <a href="/auth" class="w-full py-2.5 px-4 text-center rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-semibold transition-colors">
                    Mulai Gratis
                  </a>
                </div>

                <!-- Plan 2: Pro Bulanan -->
                <div class="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between space-y-6">
                  <div class="space-y-4">
                    <div>
                      <h3 class="text-base font-bold text-slate-900 dark:text-slate-100">SisaUang Pro Bulanan</h3>
                      <p class="text-xs text-slate-500 mt-1">Fleksibel langganan per bulan</p>
                    </div>
                    <div class="pt-2">
                      <div class="text-3xl font-bold font-money text-slate-900 dark:text-slate-100">Rp 21.500</div>
                      <div class="text-xs text-slate-500">per bulan (Termasuk PPN)</div>
                    </div>
                    <ul class="space-y-2.5 text-xs text-slate-600 dark:text-slate-400 pt-4 border-t border-slate-100 dark:border-slate-800">
                      <li>&check; <strong>Anggaran Setahun Penuh:</strong> Mapping bulanan per kategori &amp; mode ketat/fleksibel.</li>
                      <li>&check; <strong>Laporan PDF Resmi:</strong> Buku Kas Umum, Rekonsiliasi, Kop Surat &amp; Penandatangan.</li>
                      <li>&check; <strong>Unlimited Sumber Dana:</strong> Tambah dompet, bank, kas tunai tanpa batas.</li>
                      <li>&check; <strong>Unlimited Kepemilikan Dana:</strong> Alokasi pos dana bebas tanpa batas.</li>
                    </ul>
                  </div>
                  <a href="/auth" class="w-full py-2.5 px-4 text-center rounded-xl bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white text-white dark:text-slate-900 text-xs font-semibold shadow-xs transition-colors">
                    Pilih Paket Bulanan (Rp 21.500)
                  </a>
                </div>

                <!-- Plan 3: Pro Tahunan (BEST VALUE) -->
                <div class="relative p-6 rounded-2xl border-2 border-emerald-600 dark:border-emerald-500 bg-emerald-50/30 dark:bg-emerald-950/20 flex flex-col justify-between space-y-6 shadow-md">
                  <div class="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-wider shadow-xs">
                    Paling Hemat · Diskon 2 Bulan
                  </div>

                  <div class="space-y-4 pt-1">
                    <div>
                      <h3 class="text-base font-bold text-slate-900 dark:text-slate-100">SisaUang Pro Tahunan</h3>
                      <p class="text-xs text-slate-500 mt-1">Akses penuh selama 12 bulan</p>
                    </div>
                    <div class="pt-2">
                      <div class="text-3xl font-bold font-money text-emerald-600 dark:text-emerald-400">Rp 215.000</div>
                      <div class="text-xs text-slate-600 dark:text-slate-400">per tahun (~Rp 17.916 / bulan)</div>
                    </div>

                    <div class="space-y-3.5 pt-4 border-t border-emerald-200/60 dark:border-emerald-900/60 text-xs">
                      <div class="p-3 rounded-xl bg-emerald-100/80 dark:bg-emerald-950/60 border border-emerald-300/60 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200 space-y-1">
                        <div class="font-bold text-emerald-800 dark:text-emerald-300">&starf; Jauh Lebih Murah · Hemat 2 Bulan</div>
                        <p class="text-[11px] leading-relaxed text-emerald-700 dark:text-emerald-300">
                          Cukup bayar setara 10 bulan untuk menikmati akses 12 bulan penuh. Anda hemat Rp 43.000 dibanding bayar bulanan.
                        </p>
                      </div>

                      <ul class="space-y-2.5 text-slate-700 dark:text-slate-300">
                        <li>&check; <strong>Mencakup Seluruh Fitur SisaUang Pro:</strong> Termasuk semua fitur paket bulanan (Anggaran Setahun Penuh, Laporan PDF Resmi, Kop Surat, dan Unlimited Sumber Dana).</li>
                        <li>&check; <strong>Bebas Repot Perpanjangan:</strong> Satu kali pembayaran aktif selama 1 tahun penuh dengan tarif paling ekonomis.</li>
                      </ul>
                    </div>
                  </div>

                  <a href="/auth" class="w-full py-3 px-4 text-center rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition-colors">
                    Pilih Paket Tahunan (Rp 215.000)
                  </a>
                </div>
              </div>

              <div class="mt-10 max-w-xl mx-auto p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-2">
                <div class="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center justify-center gap-2">
                  <span>Halaman Pembayaran Terintegrasi Midtrans (Tanpa Redirect Luar)</span>
                </div>
                <p class="text-[11px] text-slate-500 leading-relaxed">
                  Transaksi diproses aman melalui Midtrans Payment Gateway (QRIS, BCA, Mandiri, BRI, BNI, GoPay, dan Kartu Kredit).
                </p>
              </div>
            </div>
          </section>
        </main>

        ${COMMON_FOOTER_HTML}
      </div>
    `,
  },

  '/terms': {
    title: 'Syarat dan Ketentuan Layanan (Terms & Conditions) – SisaUang',
    description: 'Syarat dan Ketentuan resmi lisensi perangkat lunak SisaUang Pro. Mengadopsi standar Digital Goods Midtrans, ketentuan lisensi, dan mata uang transaksi Rupiah (IDR).',
    canonicalUrl: 'https://sisauang.bitdanbait.web.id/terms',
    htmlContent: `
      <div class="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
        ${COMMON_NAVBAR_HTML}

        <main class="flex-1 py-12 md:py-16">
          <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="mb-10 pb-6 border-b border-slate-200 dark:border-slate-800 space-y-2">
              <div class="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Dokumen Perjanjian Lisensi Resmi (Digital Goods)</div>
              <h1 class="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100">
                Syarat dan Ketentuan Layanan (Terms &amp; Conditions)
              </h1>
              <p class="text-xs text-slate-500">
                Terakhir diperbarui: 15 Oktober 2026 · Mengadopsi Standar Lisensi Perangkat Lunak Digital Goods Midtrans
              </p>
            </div>

            <div class="prose prose-sm dark:prose-invert max-w-none text-slate-700 dark:text-slate-300 space-y-8 text-xs sm:text-sm leading-relaxed">
              <section class="space-y-3">
                <h2 class="text-base font-bold text-slate-900 dark:text-slate-100">1. Ketentuan Umum &amp; Definisi (Conditions of Use)</h2>
                <p>
                  Selamat datang di <strong>SisaUang</strong> (<a href="https://sisauang.bitdanbait.web.id" class="text-emerald-600 underline">https://sisauang.bitdanbait.web.id</a>), platform berbasis cloud untuk manajemen kas, pemisahan pos kepemilikan dana, pagu anggaran, dan pelaporan keuangan. Dengan mendaftar, mengakses, atau membeli paket berlangganan SisaUang, Anda menyatakan telah membaca, memahami, dan menyetujui seluruh isi Syarat dan Ketentuan ini.
                </p>
                <p>
                  Apabila Anda tidak menyetujui salah satu butir ketentuan ini, Anda dipersilakan untuk tidak melanjutkan penggunaan layanan platform kami.
                </p>
              </section>

              <section class="space-y-3">
                <h2 class="text-base font-bold text-slate-900 dark:text-slate-100">2. Pemberian Lisensi Perangkat Lunak (Grant of License)</h2>
                <p>
                  Pengelola memberikan kepada Anda lisensi non-eksklusif, tidak dapat dipindahtangankan, dan dapat dibatalkan untuk mengakses serta menggunakan fitur platform SisaUang sesuai dengan paket lisensi yang aktif:
                </p>
                <ul class="list-disc pl-5 space-y-1.5">
                  <li><strong>Paket Starter (Gratis / Rp 0)</strong>: Lisensi penggunaan dasar untuk maksimal 5 sumber dana (wallet), 2 kepemilikan dana, anggaran bulan berjalan, dan analitik keuangan.</li>
                  <li><strong>Paket SisaUang Pro Bulanan (Rp 21.500 / bulan)</strong>: Akses penuh Anggaran Setahun Penuh &amp; Mapping Bulanan, Laporan PDF Resmi &amp; Pengaturan Laporan (Kop Institusi, Judul, Penandatangan), serta lebih dari 5 sumber dana dan lebih dari 2 kepemilikan dana tanpa batas.</li>
                  <li><strong>Paket SisaUang Pro Tahunan (Rp 215.000 / tahun)</strong>: Akses penuh seluruh fitur Pro selama 12 bulan kalender dengan diskon 2 bulan (hemat Rp 43.000 dibanding bulanan).</li>
                </ul>
                <p>
                  Pengguna dilarang keras merekayasa balik (*reverse engineer*), mendekompilasi, menyalin kode sumber, atau menjual kembali lisensi platform kepada pihak ketiga tanpa izin tertulis dari pengelola SisaUang.
                </p>
              </section>

              <section class="space-y-3">
                <h2 class="text-base font-bold text-slate-900 dark:text-slate-100">3. Tarif Berlangganan &amp; Mata Uang Transaksi (Fees &amp; Currency)</h2>
                <p>
                  Seluruh harga produk dan paket berlangganan di website SisaUang tercantum dan ditagihkan dalam mata uang resmi <strong>Rupiah Indonesia (IDR / Rp)</strong>:
                </p>
                <div class="p-4 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5">
                  <div>&bull; <strong>SisaUang Pro Bulanan:</strong> Rp 21.500 / bulan</div>
                  <div>&bull; <strong>SisaUang Pro Tahunan:</strong> Rp 215.000 / tahun</div>
                </div>
                <p>
                  Pembayaran diproses langsung di dalam website melalui mitra payment gateway resmi berlisensi Bank Indonesia (<strong>Midtrans</strong>). Kami menerima kanal pembayaran QRIS, Virtual Account bank nasional (BCA, Mandiri, BRI, BNI), GoPay, dan Kartu Kredit/Debit berstandar PCI-DSS Level 1.
                </p>
              </section>

              <section class="space-y-3">
                <h2 class="text-base font-bold text-slate-900 dark:text-slate-100">4. Hak Kekayaan Intelektual (Proprietary Rights)</h2>
                <p>
                  Seluruh hak cipta, merek dagang, desain antarmuka, basis data, dan kode sumber aplikasi SisaUang adalah hak milik eksklusif pengelola dan dilindungi oleh Undang-Undang Hak Cipta Republik Indonesia. Data catatan keuangan yang dimasukkan oleh pengguna tetap merupakan hak milik pribadi pengguna seutuhnya.
                </p>
              </section>

              <section class="space-y-3">
                <h2 class="text-base font-bold text-slate-900 dark:text-slate-100">5. Ketersediaan Layanan &amp; Bantuan Teknis (Support)</h2>
                <p>
                  Kami berkomitmen menjaga tingkat ketersediaan layanan (*uptime*) cloud server mencapai 99,5%. Bantuan teknis dan pertanyaan seputar langganan dapat diajukan melalui:
                </p>
                <ul class="list-disc pl-5 space-y-1">
                  <li>Email Resmi: <a href="mailto:vuedevo@gmail.com" class="text-emerald-600 underline">vuedevo@gmail.com</a></li>
                  <li>WhatsApp Layanan: <a href="https://wa.me/6285129634505" class="text-emerald-600 underline">0851-2963-4505</a></li>
                  <li>Jam Layanan: Senin – Jumat pukul 08.00 – 17.00 WIB.</li>
                </ul>
              </section>

              <section class="space-y-3">
                <h2 class="text-base font-bold text-slate-900 dark:text-slate-100">6. Hukum yang Mengatur (Governing Law)</h2>
                <p>
                  Syarat dan Ketentuan ini tunduk pada dan ditafsirkan sesuai dengan hukum yang berlaku di Negara Kesatuan Republik Indonesia. Setiap perselisihan yang timbul akan diupayakan untuk diselesaikan terlebih dahulu secara musyawarah untuk mufakat.
                </p>
              </section>
            </div>
          </div>
        </main>

        ${COMMON_FOOTER_HTML}
      </div>
    `,
  },

  '/refund-policy': {
    title: 'Kebijakan Pengembalian Dana (Refund Policy) – SisaUang',
    description: 'Kebijakan pengembalian dana resmi untuk pembelian paket SisaUang Pro. Garansi kepuasan pelanggan 7 hari kalender, prosedur klaim, dan pemrosesan Midtrans.',
    canonicalUrl: 'https://sisauang.bitdanbait.web.id/refund-policy',
    htmlContent: `
      <div class="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
        ${COMMON_NAVBAR_HTML}

        <main class="flex-1 py-12 md:py-16">
          <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="mb-10 pb-6 border-b border-slate-200 dark:border-slate-800 space-y-2">
              <div class="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Kebijakan Transaksi Konsumen SisaUang</div>
              <h1 class="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100">
                Kebijakan Pengembalian Dana (Refund &amp; Cancellation Policy)
              </h1>
              <p class="text-xs text-slate-500">
                Berlaku untuk seluruh pembelian lisensi perangkat lunak SisaUang Pro · Terakhir diperbarui: 15 Oktober 2026
              </p>
            </div>

            <div class="prose prose-sm dark:prose-invert max-w-none text-slate-700 dark:text-slate-300 space-y-8 text-xs sm:text-sm leading-relaxed">
              <div class="p-4 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/30 flex items-start gap-3">
                <div class="space-y-1">
                  <div class="font-bold text-slate-900 dark:text-slate-100 text-sm">
                    Garansi Kepuasan Pelanggan 7 Hari Kalender (100% Refund)
                  </div>
                  <p class="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    Kami memberikan garansi pengembalian dana 100% tanpa potongan biaya administrasi jika Anda mengalami kendala teknis atau software SisaUang Pro tidak berfungsi sesuai spesifikasi dalam jangka waktu 7 hari sejak pembelian pertama.
                  </p>
                </div>
              </div>

              <section class="space-y-3">
                <h2 class="text-base font-bold text-slate-900 dark:text-slate-100">1. Kondisi dan Syarat Klaim Pengembalian Dana</h2>
                <p>
                  Pengembalian dana (*refund*) dapat diajukan oleh pemegang akun lisensi SisaUang Pro apabila memenuhi salah satu dari kondisi berikut:
                </p>
                <ul class="list-disc pl-5 space-y-1.5">
                  <li><strong>Kegagalan Sistemik Terverifikasi</strong>: Terjadi galat (*error*) kritis berulang pada basis data atau fitur ekspor laporan yang diverifikasi oleh tim pengembang dan tidak dapat diperbaiki dalam kurun waktu 3x24 jam kerja.</li>
                  <li><strong>Transaksi Ganda (*Double Charge*)</strong>: Terjadi pemotongan saldo atau penerbitan tagihan ganda untuk satu periode langganan yang sama akibat kendala jaringan pada payment gateway Midtrans.</li>
                  <li><strong>Aktivasi Gagal</strong>: Pembayaran telah berstatus Lunas (*Settlement / Success*) di Midtrans, namun status akun tidak ter-upgrade dan kendala tidak dapat diselesaikan oleh tim teknis.</li>
                </ul>
              </section>

              <section class="space-y-3">
                <h2 class="text-base font-bold text-slate-900 dark:text-slate-100">2. Batasan yang Tidak Memenuhi Kriteria Refund</h2>
                <p>Pengembalian dana tidak dapat diberikan dalam situasi berikut:</p>
                <ul class="list-disc pl-5 space-y-1">
                  <li>Permohonan diajukan melebihi batas waktu 7 (tujuh) hari kalender setelah transaksi dinyatakan berhasil.</li>
                  <li>Kelalaian pengguna dalam menjaga kerahasiaan kata sandi atau akun diblokir karena melanggar ketentuan hukum.</li>
                  <li>Kesalahan input data keuangan mandiri yang dilakukan oleh pengguna sendiri.</li>
                </ul>
              </section>

              <section class="space-y-3">
                <h2 class="text-base font-bold text-slate-900 dark:text-slate-100">3. Alur &amp; Tata Cara Pengajuan Refund</h2>
                <p>Untuk memproses pengembalian dana, pemegang lisensi dapat mengikuti langkah-langkah resmi berikut:</p>
                <ol class="list-decimal pl-5 space-y-2">
                  <li>Kirimkan email ke alamat resmi: <a href="mailto:vuedevo@gmail.com" class="text-emerald-600 underline font-semibold">vuedevo@gmail.com</a> atau WhatsApp layanan ke <a href="https://wa.me/6285129634505" class="text-emerald-600 underline font-semibold">0851-2963-4505</a>.</li>
                  <li>Gunakan subjek: <strong>[PERMOHONAN REFUND] - Nomor Invoice / Email Akun</strong>.</li>
                  <li>Sertakan dokumen pendukung: Nomor Order ID / Invoice Midtrans (contoh: <code>INV-SU-XXXXXX</code>), Email terdaftar, Bukti kendala teknis, dan Nomor rekening/e-wallet tujuan refund.</li>
                  <li>Tim verifikasi kami akan meninjau kelayakan dalam jangka waktu maksimal <strong>2x24 jam kerja</strong>.</li>
                  <li>Setelah disetujui, dana akan dikembalikan ke rekening/e-wallet asal dalam waktu 3–5 hari kerja perbankan.</li>
                </ol>
              </section>

              <section class="space-y-3">
                <h2 class="text-base font-bold text-slate-900 dark:text-slate-100">4. Pembatalan Perpanjangan Berlangganan</h2>
                <p>
                  Pengguna paket SisaUang Pro Bulanan (Rp 21.500) maupun Tahunan (Rp 215.000) bebas membatalkan perpanjangan langganan kapan saja melalui menu Pengaturan Akun tanpa dikenakan denda atau biaya penalti apa pun. Akses fitur Pro akan tetap aktif hingga akhir masa sewa yang telah dibayar.
                </p>
              </section>
            </div>
          </div>
        </main>

        ${COMMON_FOOTER_HTML}
      </div>
    `,
  },

  '/privacy': {
    title: 'Kebijakan Privasi (Privacy Policy) – SisaUang',
    description: 'Kebijakan Privasi data pengguna platform SisaUang. Menjamin keamanan data keuangan, enkripsi TLS 256-bit, standar UU PDP No. 27 Tahun 2022, dan kepatuhan PCI-DSS Midtrans.',
    canonicalUrl: 'https://sisauang.bitdanbait.web.id/privacy',
    htmlContent: `
      <div class="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
        ${COMMON_NAVBAR_HTML}

        <main class="flex-1 py-12 md:py-16">
          <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="mb-10 pb-6 border-b border-slate-200 dark:border-slate-800 space-y-2">
              <div class="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Perlindungan Data &amp; Kerahasiaan Pengguna</div>
              <h1 class="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100">
                Kebijakan Privasi (Privacy Policy)
              </h1>
              <p class="text-xs text-slate-500">
                Terakhir diperbarui: 15 Oktober 2026 · Standar Perlindungan Data Pribadi (UU PDP No. 27 Tahun 2022)
              </p>
            </div>

            <div class="prose prose-sm dark:prose-invert max-w-none text-slate-700 dark:text-slate-300 space-y-8 text-xs sm:text-sm leading-relaxed">
              <section class="space-y-3">
                <h2 class="text-base font-bold text-slate-900 dark:text-slate-100">1. Komitmen Privasi SisaUang</h2>
                <p>
                  Privasi dan kerahasiaan data keuangan Anda adalah prioritas tertinggi bagi kami. Kebijakan Privasi ini menjelaskan bagaimana <strong>SisaUang</strong> (<a href="https://sisauang.bitdanbait.web.id" class="text-emerald-600 underline">sisauang.bitdanbait.web.id</a>) mengumpulkan, menyimpan, menggunakan, dan melindungi data pribadi serta catatan transaksi pengguna kami.
                </p>
              </section>

              <section class="space-y-3">
                <h2 class="text-base font-bold text-slate-900 dark:text-slate-100">2. Data yang Kami Kumpulkan</h2>
                <p>Kami hanya mengumpulkan data yang secara sadar dan sukarela Anda berikan saat menggunakan sistem:</p>
                <ul class="list-disc pl-5 space-y-1.5">
                  <li><strong>Informasi Akun</strong>: Nama tampilan, alamat email, dan nomor WhatsApp untuk keperluan otentikasi login serta notifikasi tagihan langganan.</li>
                  <li><strong>Data Pembukuan Mandiri</strong>: Nama dompet/sumber dana, pos kepemilikan dana, kategori anggaran, dan nominal transaksi yang Anda input sendiri ke dalam aplikasi.</li>
                  <li><strong>Log Audit Keamanan</strong>: Catatan waktu masuk (*login timestamp*), alamat IP, dan agen peramban untuk mencegah akses tidak sah ke akun Anda.</li>
                </ul>
              </section>

              <section class="space-y-3">
                <h2 class="text-base font-bold text-slate-900 dark:text-slate-100">3. Keamanan Data Transaksi Pembayaran (Payment Gateway)</h2>
                <p>
                  Ketika Anda berlangganan paket <strong>SisaUang Pro (Bulanan: Rp 21.500 atau Tahunan: Rp 215.000)</strong>, pemrosesan transaksi pembayaran dilakukan secara terenkripsi oleh mitra resmi berlisensi Bank Indonesia, yaitu <strong>Midtrans (PT Midtrans)</strong>:
                </p>
                <div class="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 space-y-2">
                  <div class="font-semibold text-slate-900 dark:text-slate-100">Sertifikasi PCI-DSS Level 1</div>
                  <p class="text-xs text-slate-600 dark:text-slate-400">
                    SisaUang <strong>tidak pernah menyimpan atau memiliki akses</strong> terhadap nomor lengkap kartu kredit, CVV, PIN mobile banking, atau kredensial e-wallet Anda. Seluruh data pembayaran sensitif diproses langsung melalui protokol keamanan Midtrans berstandar internasional.
                  </p>
                </div>
              </section>

              <section class="space-y-3">
                <h2 class="text-base font-bold text-slate-900 dark:text-slate-100">4. Infrastruktur Penyimpanan &amp; Enkripsi</h2>
                <p>
                  Basis data SisaUang dihosting pada pusat data Google Cloud Platform (GCP) regional Asia Tenggara (Jakarta, Indonesia). Seluruh komunikasi data antar-klien dan server dilindungi protokol enkripsi <strong>TLS/SSL 256-bit</strong> yang aman dari penyadapan.
                </p>
              </section>

              <section class="space-y-3">
                <h2 class="text-base font-bold text-slate-900 dark:text-slate-100">5. Jaminan Tanpa Penjualan Data</h2>
                <p>
                  SisaUang menjamin bahwa kami tidak akan pernah menjual, menyewakan, meminjamkan, atau memperdagangkan data pribadi dan catatan keuangan Anda kepada biro iklan, lembaga kredit, atau pihak ketiga mana pun tanpa persetujuan eksplisit dari Anda.
                </p>
              </section>

              <section class="space-y-3">
                <h2 class="text-base font-bold text-slate-900 dark:text-slate-100">6. Hak Pengguna &amp; Penghapusan Akun</h2>
                <p>
                  Sesuai dengan ketentuan Undang-Undang Perlindungan Data Pribadi (UU PDP), Anda berhak untuk melihat, mengedit, mengekspor salinan data, atau meminta penghapusan akun beserta seluruh data riwayat transaksi secara permanen melalui menu Pengaturan atau dengan menghubungi kami di <a href="mailto:vuedevo@gmail.com" class="text-emerald-600 underline">vuedevo@gmail.com</a>.
                </p>
              </section>
            </div>
          </div>
        </main>

        ${COMMON_FOOTER_HTML}
      </div>
    `,
  },

  '/contact': {
    title: 'Kanal Bantuan & Layanan Kontak Resmi – SisaUang',
    description: 'Hubungi tim pengembang dan bantuan teknis SisaUang via WhatsApp 0851-2963-4505 atau email vuedevo@gmail.com. Jam operasional Senin-Jumat 08.00-17.00 WIB.',
    canonicalUrl: 'https://sisauang.bitdanbait.web.id/contact',
    htmlContent: `
      <div class="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
        ${COMMON_NAVBAR_HTML}

        <main class="flex-1 py-12 md:py-16">
          <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="max-w-2xl mx-auto text-center space-y-3 mb-12">
              <div class="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Kanal Komunikasi &amp; Layanan Resmi</div>
              <h1 class="text-3xl font-extrabold text-slate-900 dark:text-slate-100">
                Hubungi Tim Dukungan SisaUang
              </h1>
              <p class="text-sm text-slate-600 dark:text-slate-400">
                Kami siap membantu Anda mengenai pertanyaan fitur, aktivasi langganan Pro, bantuan teknis, maupun kemitraan instansi.
              </p>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">
              <div class="lg:col-span-2 space-y-6">
                <div class="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-6 shadow-xs">
                  <h3 class="text-base font-bold text-slate-900 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-3">
                    Informasi Kontak Pengelola
                  </h3>

                  <div class="space-y-4 text-xs sm:text-sm">
                    <div class="flex items-start gap-3">
                      <div>
                        <div class="text-xs text-slate-500">Email Resmi Bisnis</div>
                        <a href="mailto:vuedevo@gmail.com" class="font-semibold text-slate-800 dark:text-slate-200 hover:text-emerald-600 transition-colors">
                          vuedevo@gmail.com
                        </a>
                      </div>
                    </div>

                    <div class="flex items-start gap-3">
                      <div>
                        <div class="text-xs text-slate-500">WhatsApp Pelanggan</div>
                        <a href="https://wa.me/6285129634505" target="_blank" rel="noopener noreferrer" class="font-semibold text-emerald-600 hover:underline">
                          0851-2963-4505
                        </a>
                      </div>
                    </div>

                    <div class="flex items-start gap-3">
                      <div>
                        <div class="text-xs text-slate-500">Jam Layanan Operasional</div>
                        <div class="font-medium text-slate-800 dark:text-slate-200">Senin – Jumat: 08.00 – 17.00 WIB</div>
                        <div class="text-xs text-slate-500 mt-0.5">Sabtu &amp; Minggu: Libur / Respon Terbatas</div>
                      </div>
                    </div>
                  </div>
                </div>

                <a href="https://wa.me/6285129634505" target="_blank" rel="noopener noreferrer" class="p-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-between font-semibold text-xs shadow-xs transition-colors">
                  <span>Chat Langsung via WhatsApp</span>
                  <span>0851-2963-4505 &rarr;</span>
                </a>
              </div>

              <div class="lg:col-span-3">
                <div class="p-6 sm:p-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-6">
                  <h3 class="text-base font-bold text-slate-900 dark:text-slate-100">
                    Kirim Pesan / Permintaan Bantuan
                  </h3>
                  <form class="space-y-4">
                    <div>
                      <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Nama Lengkap</label>
                      <input type="text" placeholder="Nama Anda" class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />
                    </div>
                    <div>
                      <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Alamat Email</label>
                      <input type="email" placeholder="nama@email.com" class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />
                    </div>
                    <div>
                      <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Subjek</label>
                      <input type="text" placeholder="Perihal kendala atau pertanyaan Anda" class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />
                    </div>
                    <div>
                      <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Isi Pesan</label>
                      <textarea rows="4" placeholder="Tuliskan pesan atau kendala Anda secara rinci di sini..." class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"></textarea>
                    </div>
                    <button type="button" class="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-xs transition-colors">
                      Kirim Pesan Sekarang
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </main>

        ${COMMON_FOOTER_HTML}
      </div>
    `,
  },
};
