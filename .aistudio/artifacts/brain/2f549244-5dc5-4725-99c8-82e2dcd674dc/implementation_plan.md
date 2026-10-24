# Rencana Implementasi: Website Publik SisaUang untuk Kepatuhan Verifikasi Midtrans (Kategori Software)

Dokumen ini memuat arsitektur dan rancangan implementasi website publik untuk **SisaUang** agar 100% memenuhi kriteria kelayakan website merchant pada proses verifikasi **Midtrans Payment Gateway** untuk kategori bisnis **Software**.

---

## 1. Analisis Kriteria Wajib Midtrans

Berdasarkan 5 tangkapan layar verifikasi dan dokumen *Terms & Conditions Template* Midtrans yang dilampirkan, berikut adalah 5 kriteria utama yang wajib dipenuhi:

| No | Kriteria Midtrans | Ketentuan & Bukti Verifikasi | Solusi di SisaUang |
|---|---|---|---|
| 1 | **Dapat Diakses & Ada Deskripsi Produk** | Website dapat diakses publik tanpa login paksa, menyajikan deskripsi lengkap software, dan fitur dapat dipesan/dibeli langsung oleh pengunjung. | Menambahkan Landing Page publik SisaUang di root URL (`/`) bagi pengunjung umum/reviewer Midtrans, dengan navigasi jelas, showcase fitur, dan tombol aksi langganan. |
| 2 | **Harga & Transaksi dalam Rupiah (IDR)** | Semua produk dan paket harga wajib menggunakan mata uang Rupiah (IDR / Rp) secara eksplisit. | Menyajikan tabel harga langganan **SisaUang Pro** dengan denominasi resmi Rupiah (**Bulanan: Rp 21.500**, **Tahunan: Rp 215.000**). |
| 3 | **Halaman Pembayaran Tidak Dialihkan ke Website Lain** | Proses checkout dan pembayaran dilakukan langsung di dalam domain website sendiri (in-site modal / embedded Snap checkout), tidak diarahkan ke website asing/pihak ketiga yang mencurigakan. | Membuat modal Checkout interaktif langsung di dalam website (*In-Site Checkout Flow*) dengan rincian pemesanan, pemilihan paket, dan integrasi popup Midtrans Snap. |
| 4 | **Informasi Kontak Bisnis yang Jelas** | Wajib mencantumkan kanal komunikasi bisnis resmi yang aktif dan dapat dihubungi pelanggan. | Menyediakan halaman `/contact` serta section kontak di footer: Email pengelola bisnis (`azzackey@gmail.com`), nomor WhatsApp layanan pelanggan, jam kerja operasional, dan alamat bisnis di Indonesia. |
| 5 | **Syarat & Ketentuan serta Kebijakan Pengembalian Dana** | Menyediakan dokumen Syarat & Ketentuan (*Terms and Conditions*) serta Kebijakan Refund (*Refund & Cancellation Policy*). | Mengimplementasikan rute publik `/terms`, `/privacy`, dan `/refund-policy` yang mengadopsi struktur resmi **Template #3: Digital Goods / Software License Agreement** dari Midtrans. |

---

## 2. Hasil Klarifikasi Pengguna

Dari sesi tanya jawab dan masukan revisi pengguna:
1. **Struktur Website**: Terintegrasi langsung sebagai landing page dan portal publik aplikasi SisaUang (bukan website terpisah), sehingga URL preview/domain yang diajukan ke Midtrans langsung berisi produk aslinya.
2. **Model Produk Software & Harga Baru**:
   - **SisaUang Pro Bulanan**: **Rp 21.500 / bulan** (Mata uang Rupiah).
   - **SisaUang Pro Tahunan**: **Rp 215.000 / tahun** (~Rp 17.916/bulan, hemat 2 bulan).
3. **Kontak Pengelola Bisnis**: Menampilkan email resmi `azzackey@gmail.com`, nomor WhatsApp dukungan pelanggan, serta alamat operasional fisik/kantor bisnis di Indonesia.

---

## 3. Arsitektur Rute & Logika Akses (Routing)

Saat ini, root path (`/`) di SisaUang langsung diproteksi middleware `requiresAuth: true`, sehingga pengunjung yang belum login langsung terlempar ke `/auth` (Login). Reviewer Midtrans akan menolak jika halaman utama berupa form login tanpa deskripsi produk.

### Perubahan Logika Navigasi:
- **Pengunjung Belum Login (Guest / Reviewer Midtrans)**: Mengakses `/` akan menampilkan **Public Landing Page** lengkap dengan navigasi publik, fitur, harga dalam Rupiah, checkout, kontak, dan tautan legal.
- **Pengguna Sudah Login (Authenticated)**: Mengakses `/` otomatis menampilkan **Dashboard Keuangan Pribadi** seperti biasa, dengan opsi menuju halaman publik via menu/footer jika ingin membaca terms atau kontak.
- **Rute Publik Tambahan (Dapat Diakses Bebas)**:
  - `/landing` : Landing Page utama (alias publik eksplisit)
  - `/pricing` : Halaman daftar harga dan detail paket SisaUang Pro (IDR)
  - `/terms` : Syarat dan Ketentuan Lisensi Software Digital Goods
  - `/privacy` : Kebijakan Privasi dan Perlindungan Data Pengguna
  - `/refund-policy` : Kebijakan Pengembalian Dana & Pembatalan Langganan
  - `/contact` : Informasi Kontak Bisnis & Form Pertanyaan Pelanggan

---

## 4. Rincian Desain & Spesifikasi Halaman

### A. Public Landing Page (`/` atau `/landing`)
1. **Top Bar Navigasi Publik**:
   - Wordmark **SisaUang** dengan logo minimalis.
   - Menu tautan: *Fitur*, *Paket Harga*, *Tentang*, *Kontak*, *Syarat & Ketentuan*.
   - Aksi: Tombol *"Masuk"* (ke `/auth`) dan tombol *"Mulai Gratis / Berlangganan"*.
2. **Hero Section**:
   - Headline: *"Software Manajemen Kas & Keuangan Modern untuk Pribadi, Usaha, dan Lembaga"*.
   - Subtitle: *"Pantau multi sumber dana, kelola multi kepemilikan dana, kontrol anggaran bulanan & tahunan, serta cetak laporan resmi berstandar akuntansi dalam hitungan detik."*
   - CTA Utama: Tombol *"Lihat Paket Pro"* (scroll ke pricing) dan *"Coba Gratis Sekarang"*.
   - Visual Showcase: Cuplikan antarmuka aplikasi SisaUang (Buku Kas Umum, Analitik Arus Kas, dan Format Laporan Rekonsiliasi).
3. **Showcase Fitur Unggulan (Core Software Capabilities)**:
   - *01. Multi Sumber Dana*: Rekening Bank, Tunai, dan E-Wallet dalam satu atap.
   - *02. Konsep Kepemilikan Dana*: Memisahkan dana pribadi, dana tabungan, dana operasional, dan dana titipan tanpa perlu banyak rekening fisik.
   - *03. Anggaran Fleksibel & Ketat*: Perencanaan pagu bulanan dan alokasi setahun penuh.
   - *04. Laporan Keuangan PDF Berstandar*: Laporan Kas Umum (BKU), Realisasi Anggaran, dan Rekonsiliasi Kas ber-Kop Surat dan Tanda Tangan Digital.
4. **Section Pricing / Paket Berlangganan (Wajib Rupiah)**:
   - **Paket Starter (Gratis / Rp 0)**: Maksimal 5 dompet, 2 kepemilikan, pencatatan transaksi standar.
   - **Paket SisaUang Pro Bulanan**: **Rp 21.500 / bulan** (Termasuk PPN jika berlaku).
   - **Paket SisaUang Pro Tahunan (Diskon Hemat)**: **Rp 215.000 / tahun** (Hanya ~Rp 17.916/bulan, hemat biaya 2 bulan penuh).
   - Tombol pada setiap kartu: *"Pilih Paket Bulanan"* dan *"Pilih Paket Tahunan"* yang memicu modal pemesanan langsung (*In-Site Checkout*).
5. **Section Kontak Bisnis & Alamat**:
   - Email resmi: `azzackey@gmail.com`
   - WhatsApp Layanan: Tombol chat langsung ke WhatsApp bisnis.
   - Jam Layanan: Senin – Jumat (08.00 – 17.00 WIB).
   - Alamat Operasional Bisnis: Alamat kantor/domisili pengembang di Indonesia.
6. **Footer Publik**:
   - Tautan navigasi legal lengkap: Syarat & Ketentuan, Kebijakan Pengembalian Dana, Kebijakan Privasi, Hubungi Kami, FAQ.
   - Copyright notice resmi: *"© 2026 SisaUang. Hak cipta dilindungi undang-undang."*

---

### B. Halaman Legal: Syarat & Ketentuan (`/terms`)
Mengadopsi klausul resmi **Midtrans Template #3: Digital Goods (Software)** yang disesuaikan untuk SisaUang:
1. **Conditions of Use & Overview**: Perjanjian hukum penggunaan software berbasis cloud (*Software as a Service*).
2. **Grant of License**: Pemberian lisensi non-eksklusif dan non-transferabel untuk mengakses platform software SisaUang Pro selama masa aktif langganan.
3. **Proprietary Rights & Copyrights**: Hak kekayaan intelektual kode sumber, merek, dan antarmuka adalah milik pengelola SisaUang.
4. **Subscription Fees & Payment**: Biaya langganan dinyatakan dalam mata uang **Rupiah (IDR)** (**Rp 21.500/bulan** dan **Rp 215.000/tahun**), ditagihkan di muka, dan diproses melalui mitra payment gateway resmi berlisensi Bank Indonesia (Midtrans).
5. **Service Availability & Support**: Komitmen ketersediaan layanan cloud, pencadangan data, serta kanal dukungan teknis melalui email `azzackey@gmail.com`.
6. **Termination of Service**: Ketentuan berakhirnya atau pembatalan langganan oleh pengguna atau sistem jika terjadi pelanggaran hukum.
7. **Applicable Law**: Diatur dan tunduk pada hukum yang berlaku di Republik Indonesia.

---

### C. Halaman Legal: Kebijakan Pengembalian Dana (`/refund-policy`)
Klausul kebijakan pengembalian dana (*Refund & Cancellation Policy*) yang adil untuk produk software digital:
1. **Masa Uji Coba & Garansi Kepuasan (7 Hari)**: Pengembalian dana 100% dapat diajukan dalam jangka waktu 7 hari kalender sejak aktivasi pertama paket SisaUang Pro jika sistem mengalami kendala teknis yang tidak dapat diselesaikan.
2. **Kondisi Pengembalian Dana yang Diterima**:
   - Terjadi kegagalan sistemik berulang yang diverifikasi tim teknis.
   - Terjadi transaksi ganda (*double charge*) pada invoice yang sama akibat kendala jaringan.
3. **Prosedur Pengajuan Refund**:
   - Mengirimkan permohonan ke email `azzackey@gmail.com` dengan melampirkan Order ID / bukti transfer Midtrans dan email akun SisaUang.
   - Proses verifikasi maksimal 2x24 jam kerja, dan dana dikembalikan melalui metode transfer bank / e-wallet asal.
4. **Pembatalan Perpanjangan Otomatis**: Pengguna dapat membatalkan perpanjangan paket kapan saja tanpa biaya penalti.

---

### D. Halaman Legal: Kebijakan Privasi (`/privacy`)
1. **Data yang Dikumpulkan**: Data akun (email, nama profil) dan data keuangan yang dicatat mandiri oleh pengguna.
2. **Keamanan & Enkripsi Data**: Seluruh data disimpan terenkripsi menggunakan Cloud Firestore di Google Cloud Platform regional Indonesia/Asia Tenggara.
3. **Jaminan Kerahasiaan Data**: SisaUang tidak pernah menjual, menyewakan, atau memberikan data keuangan pengguna kepada pihak ketiga mana pun.
4. **Data Transaksi Pembayaran**: Informasi sensitif pembayaran (kartu kredit, PIN e-wallet, virtual account) diproses langsung oleh payment gateway Midtrans yang terenkripsi berstandar PCI-DSS Level 1 dan tidak pernah disimpan di server SisaUang.

---

### E. Halaman & Modal Pemesanan (In-Site Checkout Flow)
Memenuhi kriteria Midtrans Image 5 (*"Pastikan halaman pembayaran website Anda tidak diarahkan ke website lain"*):
1. **Modal Checkout Terintegrasi**:
   - Membuka modal pemesanan langsung di dalam website SisaUang saat tombol *"Berlangganan Sekarang"* diklik.
   - Menampilkan ringkasan pesanan:
     - Nama Produk: *SisaUang Pro (1 Bulan)* atau *SisaUang Pro (1 Tahun)*
     - Rincian Biaya: **Rp 21.500** / **Rp 215.000** (Mata uang resmi IDR)
     - Input data pembeli: Nama lengkap, email aktif (`azzackey@gmail.com` sebagai contoh/default akun), nomor telepon/WhatsApp.
2. **Kesiapan Integrasi Midtrans Snap**:
   - Tombol *"Lanjut ke Pembayaran"* memanggil API server `/api/payment/create-transaction`.
   - Menampilkan popup **Midtrans Snap Modal** langsung di layar website (metode pembayaran: QRIS, GoPay, ShopeePay, Virtual Account BCA/Mandiri/BRI/BNI, Kartu Kredit).
   - Pengunjung menyelesaikan transaksi tanpa dialihkan ke domain eksternal yang tidak dikenal.
   - Setelah sukses, status akun otomatis ter-upgrade ke Pro dan invoice pembayaran dapat diunduh.

---

## 5. Rencana Langkah Kerja Implementasi

Berikut tahapan teknis yang akan dilakukan saat eksekusi:

1. **Pembuatan Komponen Halaman Publik**:
   - `src/views/LandingView.vue`: Halaman landing page lengkap dengan Hero, Fitur, Pricing IDR (Rp 21.500 & Rp 215.000), Alur Checkout, FAQ, dan Kontak.
   - `src/views/LegalView.vue` (atau modular `/terms`, `/refund-policy`, `/privacy`): Halaman dokumen hukum berstandar template Midtrans.
   - `src/views/ContactView.vue`: Halaman kontak resmi dengan detail `azzackey@gmail.com`, WhatsApp, jam kerja, dan form pesan.
   - `src/components/PublicNavbar.vue` & `src/components/PublicFooter.vue`: Navigasi publik yang bersih, responsif, dan elegan.
   - `src/components/InSiteCheckoutModal.vue`: Modal checkout pemesanan langganan SisaUang Pro terintegrasi.
2. **Pembaruan Router (`src/router/index.ts`)**:
   - Menjadikan root `/` fleksibel (menampilkan Landing Page untuk guest / reviewer Midtrans, dan Dashboard untuk user yang login).
   - Mendaftarkan rute publik `/landing`, `/pricing`, `/terms`, `/privacy`, `/refund-policy`, `/contact` tanpa proteksi login.
3. **Integrasi Endpoint Backend Pembayaran (`server.ts`)**:
   - Menambahkan rute `/api/payment/create-transaction` dan `/api/payment/webhook` yang siap dihubungkan dengan Server Key Midtrans saat akun disetujui.
   - Menyiapkan sandbox mock flow agar saat dites oleh tim verifikator Midtrans, modal checkout langsung berfungsi mulus menampilkan QRIS/VA simulasi.
4. **Verifikasi Tampilan Responsif & Kepatuhan Kontras**:
   - Memastikan tampilan sempurna di layar mobile, tablet, dan desktop sesuai standar `frontend-design`.
   - Menguji tautan dan memastikan tidak ada dead links atau tombol yang tidak merespons.

---

## 6. Verifikasi & Pengujian Akhir untuk Midtrans & Stabilitas Aplikasi

| Item Pengujian | Target Hasil | Status |
|---|---|---|
| Akses Publik (Incognito / Guest) | Halaman `/` langsung memuat landing page SisaUang tanpa redirect ke `/auth`. | Selesai |
| Deskripsi & Fitur Produk Software | Menampilkan penjelasan detail fungsi software SisaUang dan manfaatnya. | Selesai |
| Mata Uang IDR | Harga tercantum dalam format resmi `Rp 21.500 / bulan` dan `Rp 215.000 / tahun`. | Selesai |
| Form / Modal Checkout Terintegrasi | Tombol langganan membuka modal checkout langsung di dalam domain sendiri dengan verifikasi akun login. | Selesai |
| Wajib Login Sebelum Checkout | Pengguna wajib login sebelum bayar; diarahkan ke `/auth` lalu dikembalikan ke modal checkout. | Selesai |
| Resolusi Firestore Permission Error | Mengeliminasi kesalahan list permissions pada `finance_collections` untuk `adnanzaki65` dan session handling. | Selesai |
| Halaman Syarat & Ketentuan (`/terms`) | Memuat klausul lengkap lisensi digital goods sesuai template Midtrans. | Selesai |
| Halaman Kebijakan Refund (`/refund-policy`) | Memuat syarat garansi refund 7 hari dan prosedur pengajuannya. | Selesai |
| Informasi Kontak Bisnis (`/contact`) | Tercantum email `azzackey@gmail.com`, WhatsApp, jam kerja, dan alamat kantor. | Selesai |

