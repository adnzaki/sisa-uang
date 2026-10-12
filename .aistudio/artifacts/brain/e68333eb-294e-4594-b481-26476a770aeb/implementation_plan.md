# Sistem Langganan Sisa Uang Pro & Integrasi Payment Gateway Otomatis

Rancangan ini menghadirkan skema keanggotaan berjenjang (**Free** dan **Sisa Uang Pro**) dengan langganan berkala **Bulanan** serta **Tahunan** yang terhubung ke **Payment Gateway Otomatis (Midtrans & Xendit)**, sekaligus menerapkan pembatasan kuota cerdas pada anggaran periode mendatang, pembuatan laporan analitik, penambahan sumber dana, dan penambahan kepemilikan dana tanpa mengunci data lama pengguna.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> Seluruh preferensi utama Anda dari tahap klarifikasi telah dikunci ke dalam rancangan ini. Silakan tinjau detail mekanisme kuota dan alur pembayaran di bawah sebelum kita mulai membangun kode.

- **Confirmed Decision 1 — Payment Gateway Otomatis (Midtrans & Xendit)**: Mendukung pembuatan transaksi pembayaran otomatis melalui REST API Midtrans Snap dan Xendit Invoice (QRIS, Virtual Account Bank, dan E-Wallet), dilengkapi endpoint *Webhook Notification* untuk aktivasi masa aktif instan serta *In-App Checkout Simulator* otomatis apabila kunci API produksi belum diatur di environment.
- **Confirmed Decision 2 — Skema Langganan Bulanan & Tahunan**: Tersedia dua paket berlangganan berkala dengan pelacakan tanggal kedaluwarsa (`planExpiresAt`) secara otomatis:
  - **Paket Pro Bulanan**: Masa aktif +30 hari (Rp 29.000 / bulan).
  - **Paket Pro Tahunan**: Masa aktif +365 hari (Rp 249.000 / tahun — hemat 28%).
- **Confirmed Decision 3 — Perlindungan Data Lama (*Grandfathering*)**: Pengguna Free yang sebelumnya sudah memiliki lebih dari 5 Sumber Dana, lebih dari 2 Kepemilikan Dana, atau anggaran bulan mendatang tetap dapat melihat, mengubah, dan mencatat transaksi pada data tersebut. Pembatasan hanya diterapkan ketika pengguna mencoba **menambahkan item baru** yang melampaui kuota Free.

---

## 1. Overview & Core Concept

- **What It Does**: Membagi kapabilitas aplikasi menjadi paket **Free** untuk pencatatan esensial sehari-hari dan paket **Sisa Uang Pro** untuk perencanaan keuangan tingkat lanjut, disertai alur pembayaran mandiri (*self-service checkout*) serta pemantauan masa aktif langganan secara real-time.
- **Target Audience / Persona**:
  - **Pengguna Individu (Free)**: Mengelola keuangan pribadi bulanan sederhana dengan maksimal 5 sumber dana, maksimal 2 alokasi kepemilikan dana, dan anggaran pada bulan berjalan.
  - **Pengguna Keluarga & Perencana Aktif (Pro)**: Membutuhkan perencanaan anggaran lintas bulan ke depan, pengelolaan banyak rekening/dompet (>5 sumber dana), pemisahan dana keluarga/bisnis (>2 kepemilikan), serta ekspor laporan analitik komprehensif.
- **Key Value**: Memberikan jalur monetisasi berulang (*recurring revenue*) yang transparan dan otomatis tanpa merusak pengalaman pengguna lama yang sudah memiliki data historis.

### Matriks Perbandingan Kuota Fitur (Free vs Sisa Uang Pro)

| Fitur & Kapabilitas | Akun Free | Sisa Uang Pro (Bulanan / Tahunan) |
| :--- | :--- | :--- |
| **Periode Anggaran Bulanan** | Hanya bulan berjalan saat ini | Bebas buat anggaran bulan mendatang (s/d Des tahun depan) |
| **Generate Laporan Analitik** | Terkunci (hanya lihat grafik di layar) | Ekspor Laporan Keuangan Lengkap (Cetak Laporan / PDF & CSV) |
| **Kuota Sumber Dana (Wallet)** | Maksimal **5** sumber dana aktif | **Tanpa Batas** (*Unlimited*) |
| **Kuota Kepemilikan Dana** | Maksimal **2** nama kepemilikan unik | **Tanpa Batas** (*Unlimited*) |
| **Data Historis Sebelumnya** | Tetap aktif & dapat digunakan penuh | Tetap aktif & dapat digunakan penuh |

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Alur Pembatasan Anggaran Periode Mendatang (Halaman Anggaran)**:
   - Saat pengguna **Free** membuka modal **Tambah Periode Anggaran Baru**, pilihan bulan berjalan tetap dapat dipilih dan disimpan secara normal.
   - Pilihan bulan-bulan yang akan datang menampilkan keterangan `Khusus Pro`. Jika pengguna Free memilih bulan mendatang dan menekan simpan, sistem mengarahkan ke **Modal Upgrade Sisa Uang Pro** dengan penjelasan kontekstual.
2. **Alur Generate Laporan Keuangan (Halaman Analitik)**:
   - Di bagian atas halaman **Analitik**, hadir tombol aksi **Generate Laporan** yang memungkinkan pengguna memilih format laporan (**Laporan Ringkasan Eksekutif Siap Cetak / PDF** atau **Laporan Transaksi & Distribusi CSV**) sesuai filter periode dan kepemilikan yang sedang aktif.
   - Bagi pengguna **Pro**, laporan langsung di-generate dan ditampilkan dalam pratinjau laporan terstruktur yang siap dicetak/diunduh. Bagi pengguna **Free**, menekan tombol tersebut membuka **Modal Upgrade Sisa Uang Pro**.
3. **Alur Kuota Maksimal 5 Sumber Dana (Halaman Sumber Dana)**:
   - Menampilkan indikator kapasitas kuota secara bersih (`X / 5 Sumber Dana Free` dengan angka `tabular-nums`).
   - Ketika pengguna **Free** yang sudah memiliki $\ge 5$ sumber dana menekan tombol **Tambah Sumber Dana**, sistem menahan pembukaan form dan menampilkan **Modal Upgrade Sisa Uang Pro**. Seluruh sumber dana lama (meskipun berjumlah 6 atau lebih dari data sebelumnya) tetap dapat diedit saldonya dan dipakai mencatat transaksi.
4. **Alur Kuota Maksimal 2 Kepemilikan Dana (Halaman Kepemilikan Dana & Sumber Dana)**:
   - Menghitung jumlah nama kepemilikan unik (misal: `Pribadi` dan `Istri` = 2 kepemilikan).
   - Pengguna **Free** tetap dapat mengalokasikan 2 nama kepemilikan yang sudah ada tersebut ke dompet mana pun. Namun, jika pengguna Free mencoba menambahkan **nama kepemilikan ke-3** yang baru, sistem menampilkan **Modal Upgrade Sisa Uang Pro**.
5. **Alur Checkout & Pembayaran Otomatis (Midtrans / Xendit)**:
   - Di dalam **Modal Upgrade Sisa Uang Pro** (atau melalui kartu **Status Langganan** di halaman Pengaturan), pengguna memilih paket (**Bulanan Rp 29.000** atau **Tahunan Rp 249.000**) dan memilih kanal gateway (**Midtrans Snap** atau **Xendit Invoice — QRIS / Virtual Account / E-Wallet**).
   - Sistem membuat tagihan melalui server, menampilkan antarmuka pembayaran interaktif (lengkap dengan kode QRIS / nomor Virtual Account / tautan checkout serta tombol pengecekan status otomatis), dan begitu webhook/pembayaran terkonfirmasi, status pengguna langsung berubah menjadi **Pro** secara real-time beserta tanggal berakhir masa aktifnya.

### Visual Identity & Theme

- **Aesthetic Direction**: *Modern Financial Ledger & Utilitarian SaaS* — bersih, presisi, tanpa ornamen berlebihan, berfokus pada keterbacaan angka dan kejelasan hierarki status.
- **Color Palette & Mood**:
  - **60% Dominant Neutral Canvas**: `bg-slate-50` pada mode terang dan `dark:bg-slate-950` pada mode gelap.
  - **30% Structural Surfaces**: Kartu permukaan `bg-white dark:bg-slate-900` dengan garis batas tipis `border-slate-200/80 dark:border-slate-800`.
  - **10% Accent Budget**: Aksen utama hijau zamrud (`bg-emerald-600`, `text-emerald-600 dark:text-emerald-400`) untuk aksi utama dan status aktif, dipadukan dengan aksen amber hangat (`text-amber-600 dark:text-amber-400`) khusus penanda fitur **Sisa Uang Pro**.
- **Typography & Hierarchy**:
  - Menggunakan pasangan tipografi sans-serif bersih untuk judul dan navigasi, serta wajib menerapkan `font-mono tabular-nums` (`font-money`) pada seluruh nominal harga paket, penghitung kuota (`3 / 5`), tanggal masa aktif, dan angka di dalam laporan analitik.
  - Mengikuti disiplin *Zero-Pill Metadata*: informasi kuota, tanggal berakhir langganan, dan rincian paket disajikan sebagai teks bersih dengan pemisah tipografis (`·`), bukan kumpulan lencana kapsul bertumpuk.
- **Interactive Feedback & Motion**:
  - Transisi halus ($\le 200\text{ms}$) saat berpindah antara pilihan paket Bulanan dan Tahunan.
  - Notifikasi *toast* instan ketika pembayaran berhasil diverifikasi dan seluruh pembatasan fitur langsung terbuka tanpa perlu memuat ulang halaman.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Arsitektur Dual-Gateway (Midtrans & Xendit) dengan Mode Simulasi Mandiri**
  - *Chosen Approach*: Menyediakan adaptor pembayaran sisi server yang otomatis menggunakan kredensial asli `MIDTRANS_SERVER_KEY` atau `XENDIT_SECRET_KEY` jika tersedia di environment server, serta menyediakan *Interactive Sandbox Checkout* di dalam modal aplikasi apabila kredensial belum dikonfigurasi.
  - *Why*: Aplikasi berjalan di dalam lingkungan pratinjau *iframe* yang memblokir `window.open` ke domain luar. Dengan merender detail pembayaran (QRIS / Virtual Account / konfirmasi instan) di dalam modal aplikasi dan memproses verifikasi di backend, alur berlangganan dapat diuji 100% dari ujung ke ujung kapan saja.
  - *Alternatives Considered*: Mengandalkan redirect halaman penuh ke URL eksternal semata, yang akan gagal di dalam *iframe* atau berhenti bekerja ketika kunci API merchant belum dimasukkan.

- **Decision 2: Perhitungan Kepemilikan Berdasarkan Nama Pemilik Unik (Lintas Dompet)**
  - *Chosen Approach*: Kuota maksimal 2 kepemilikan pada akun Free dihitung berdasarkan **nama pemilik unik** (`ownershipSummary`, misalnya `Pribadi` dan `Pasangan`), bukan jumlah baris relasi dompet.
  - *Why*: Dalam arsitektur Sisa Uang, satu pemilik dana (seperti `Pribadi`) dapat tersebar di 5 dompet berbeda. Menghitung berdasarkan nama pemilik unik memastikan pengguna Free tetap bisa menggunakan ke-5 dompetnya untuk dirinya sendiri dan 1 anggota keluarga, dan baru diminta upgrade ke Pro saat ingin menambahkan pemilik dana ke-3.

- **Decision 3: Sinkronisasi Masa Aktif (`planExpiresAt`) di Firestore & Server**
  - *Chosen Approach*: Menyimpan atribut `subscriptionPlan` (`'free' | 'pro'`), `billingCycle` (`'monthly' | 'yearly'`), dan `planExpiresAt` (ISO timestamp) di dokumen pengguna Firestore serta registri server, disertai evaluasi otomatis apakah masa aktif masih berlaku (`new Date(planExpiresAt) > new Date()`).
  - *Why*: Menjamin masa aktif langganan konsisten saat pengguna berganti perangkat dan otomatis kembali ke status Free apabila masa berlangganan telah habis.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Component Diagram

```
┌────────────────────────────────────────────────────────────────────────────┐
│                        LAPISAN ANTARMUKA PENGGUNA (VUE)                    │
├──────────────────────┬──────────────────────────┬──────────────────────────┤
│  Titik Proteksi Kuota│   Modal & Alur Checkout  │  Panel & Pengaturan      │
│  ─────────────────── │   ────────────────────── │  ──────────────────────  │
│  • Anggaran Mendatang│   • Modal Upgrade Pro    │  • Kartu Status Pro di   │
│  • Laporan Analitik  │     (Bulanan vs Tahunan) │    Halaman Pengaturan    │
│  • Tambah Wallet > 5 │   • Pemilih Metode Bayar │  • Manajemen Langganan   │
│  • Kepemilikan > 2   │     (Midtrans / Xendit)  │    di Control Panel Admin│
└──────────┬───────────┴─────────────┬────────────┴─────────────┬────────────┘
           │                         │                          │
           ▼                         ▼                          ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                   STATE MANAGEMENT (AUTH & FINANCE STORES)                 │
│  • Computed: isProUser, activeSubscription, remainingProDays               │
│  • Guards  : canCreateFutureBudget, canExportAnalyticsReport,              │
│              canAddMoreWallets (< 5), canAddMoreOwnerships (< 2)           │
│  • Report  : Generator Laporan Analitik (Pratinjau Cetak PDF & Ekspor CSV) │
└────────────────────────────────────┬───────────────────────────────────────┘
                                     │ REST API (/api/billing/*)
                                     ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                     SERVER BACKEND & PAYMENT GATEWAY                       │
│  • POST /api/billing/checkout  ──► Buat Invoice Midtrans Snap / Xendit     │
│  • POST /api/billing/webhook   ──► Terima Callback & Perpanjang Masa Aktif │
│  • GET  /api/billing/status    ──► Verifikasi Status Invoice & Sinkronisasi│
│  • PATCH /api/admin/users/:uid ──► Override Status Pro oleh Super Admin    │
└────────────────────────────────────┬───────────────────────────────────────┘
                                     │
                                     ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                     CLOUD FIRESTORE (DATABASE: sisa-uang)                  │
│  • Koleksi /users/{uid}: subscriptionPlan, billingCycle, planExpiresAt     │
│  • Koleksi /subscriptions/{invoiceId}: Riwayat pembayaran & masa aktif     │
└────────────────────────────────────────────────────────────────────────────┘
```

### Data Model & State

1. **Perluasan Entitas Pengguna (`User`)**:
   - `subscriptionPlan`: `'free' | 'pro'` (default `'free'`).
   - `billingCycle`: `'monthly' | 'yearly' | 'none'`.
   - `planExpiresAt`: String ISO tanggal kedaluwarsa langganan (contoh: `2026-11-09T11:00:00.000Z`).
   - Computed `isProUser`: Bernilai `true` apabila pengguna memiliki `subscriptionPlan === 'pro'` dan `planExpiresAt` masih berada di masa depan (atau jika akun adalah Super Admin).
2. **Entitas Transaksi Langganan (`SubscriptionInvoice`)**:
   - Menyimpan `invoiceId`, `uid`, `email`, `planType` (`'monthly' | 'yearly'`), `amount` (`29000` atau `249000`), `provider` (`'midtrans' | 'xendit'`), `paymentMethod` (`'qris' | 'va' | 'ewallet'`), `status` (`'pending' | 'paid' | 'expired'`), `checkoutUrl`, `qrString` / `vaNumber`, `createdAt`, dan `paidAt`.

### Interactive Component & State Mapping

- **Guard 1 — Pembuatan Periode Anggaran Mendatang**:
  - Saat `addBudgetPeriod(periodInput)` dipanggil, sistem membandingkan `periodInput` dengan `getCurrentMonthPeriod()`.
  - Jika `periodInput > getCurrentMonthPeriod()` dan `!authStore.isProUser`, proses pembuatan dihentikan dan `subscriptionStore.openUpgradeModal('future_budget')` dipanggil untuk menampilkan modal upgrade dengan alasan spesifik.
- **Guard 2 — Generate Laporan di Halaman Analitik**:
  - Menambahkan tombol **Generate Laporan** pada header halaman Analitik.
  - Saat diklik oleh pengguna Free (`!authStore.isProUser`), membuka `subscriptionStore.openUpgradeModal('analytics_report')`.
  - Saat diklik oleh pengguna Pro (`authStore.isProUser`), membuka **Modal Laporan Keuangan Analitik** yang merangkum Saldo Awal, Saldo Akhir, Total Pemasukan, Total Pengeluaran, Rasio Tabungan, tabel Distribusi Kategori, tabel Alokasi Sumber Dana, dan daftar transaksi periode aktif, lengkap dengan tombol **Unduh Laporan CSV** dan **Cetak / Simpan PDF**.
- **Guard 3 — Penambahan Sumber Dana Lebih dari 5 Wallet**:
  - Saat pengguna menekan tombol **Tambah Sumber Dana** atau memanggil `addWallet()`, sistem memeriksa `wallets.value.length >= 5 && !authStore.isProUser`.
  - Jika batas tercapai, modal tambah dompet tidak dibuka dan digantikan oleh `subscriptionStore.openUpgradeModal('wallet_limit')`.
- **Guard 4 — Penambahan Kepemilikan Lebih dari 2 Kepemilikan Unik**:
  - Saat pengguna menambahkan kepemilikan dana baru di `addWalletOwner()`, sistem memeriksa apakah nama kepemilikan (`holderName`) tersebut sudah ada di `ownershipSummary`.
  - Jika nama kepemilikan tersebut belum ada dan `ownershipSummary.value.length >= 2 && !authStore.isProUser`, sistem menghentikan penambahan dan membuka `subscriptionStore.openUpgradeModal('ownership_limit')`.
- **Manajemen Langganan di Control Panel Super Admin**:
  - Pada daftar pengguna di `/control-panel`, Super Admin dapat melihat status paket setiap pengguna (`Free` atau `Pro · Aktif s/d [Tanggal]`) dan memiliki tombol aksi cepat untuk memberikan/mencabut akses Pro (Bulanan/Tahunan) secara real-time.
