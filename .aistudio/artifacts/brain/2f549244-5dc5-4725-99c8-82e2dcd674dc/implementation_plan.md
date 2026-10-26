# Rencana Implementasi: Analisis & Optimasi Penggunaan Firestore Read API (Mencegah Limit 50.000 Reads/Hari)

Dokumen ini memuat hasil analisis teknis komprehensif mengenai penyebab habisnya kuota gratis Cloud Firestore (50.000 document reads/hari) pada aplikasi **SisaUang**, identifikasi fitur-fitur yang paling boros operasi read database, serta rencana arsitektur dan perbaikan kode terperinci untuk memangkas penggunaan read hingga **>95%**.

---

## 1. Hasil Analisis: Fitur yang Paling Banyak Membutuhkan Proses Read Database

Berdasarkan audit mendalam terhadap seluruh alur data di *client-side store*, *components*, dan *event listeners*, berikut adalah urutan fitur dengan konsumsi read terbesar yang memicu *quota exhaustion*:

| Peringkat | Fitur / Komponen | Frekuensi & Pola Query | Estimasi Reads / Hari (Sebelum Perbaikan) | Tingkat Bahaya |
|---|---|---|---|---|
| **#1** | **Admin Polling & Control Panel (`admin.ts:792`)** | Setiap 15 detik me-refresh seluruh koleksi `users`, `budgets` (`__SISAUANG_PRO__`), dan `activity_logs` tanpa limit jika jumlah user server < 5. | **~25.000 – 40.000+ reads/hari** (Bahkan jika admin hanya membuka 1 tab selama beberapa jam) | 🔴 **Kritis (Biang Utama)** |
| **#2** | **Activity Event Sync Loop (`App.vue` & `finance.ts`)** | `window.addEventListener` pada `pointerdown`, `keydown`, `focus`, dan `visibilitychange` mengecek `checkAndSyncIfRemoteChanged` dengan cooldown hanya 1.5 detik. Setiap perubahan token memicu `fetchAllCollectionsFromFirestore` (50–200 dokumen per burst). | **~10.000 – 25.000+ reads/hari** (Tiap klik tombol, ketik form, dan ganti tab) | 🔴 **Kritis** |
| **#3** | **Data Explorer Admin (`DatabaseManagementView.vue` & `admin.ts:1955`)** | Fungsi `fetchFirestoreRawCollectionDocs` memanggil `getDocs(collection(targetDb, colName))` tanpa klausa `limit()`. Membuka koleksi `transactions` atau mengekspor backup membaca seluruh riwayat transaksi. | **~5.000 – 15.000+ reads per sesi eksplorasi** | 🔴 **Tinggi** |
| **#4** | **Filter Riwayat Transaksi Lintas Periode (`finance.ts:1428`)** | Memilih periode "Semua" (`all`) saat memfilter kategori, dompet, atau tipe memanggil `getDocs` tanpa batas `limit()`, membaca seluruh transaksi user di Firestore. | **~2.000 – 8.000+ reads/hari** | 🟡 **Sedang-Tinggi** |
| **#5** | **Pencarian Login / Username Scan (`auth.ts:1547`)** | Jika username tidak langsung cocok pada pencarian indeks pertama, `lookupUserFromFirestore` mengeksekusi `getDocs(usersCol)` (melakukan full scan terhadap semua akun pengguna di database). | **~500 – 2.000+ reads/hari** | 🟡 **Sedang** |
| **#6** | **Pengecekan Otomatisasi Jadwal (`automation.ts` & `App.vue`)** | Event `pointerdown`/`keydown` memicu `checkAndTriggerOnActivity()` setiap 1.2 detik. Begitu cache 5 menit habis, kueri `automations` dijalankan kembali dari Firestore. | **~500 – 1.500+ reads/hari** | 🟡 **Sedang** |

---

## 2. Rincian 6 Akar Masalah (Root Causes)

### Akar Masalah 1: *Super Admin Background Polling Loop* di `admin.ts`
- **Lokasi**: `/src/stores/admin.ts` baris 792 & 820 (`startRealtimeMonitoring`).
- **Analisis**: Interval `setInterval` berjalan setiap 15 detik. Di dalamnya terdapat kondisi `if (!silent || usersSummary.value.totalUsers < 5)`. Karena database lokal Express baru berjalan, total pengguna server sering kali di bawah 5, menyebabkan setiap 15 detik sistem memanggil `syncFirestoreUsersToServerRegistry()` yang membaca:
  1. Seluruh dokumen `users` (`getDocs(collection(targetDb, 'users'))`).
  2. Seluruh marker budget Pro (`getDocs(query(collection(targetDb, 'budgets'), where('category', '==', '__SISAUANG_PRO__')))`).
  3. Seluruh audit log (`getDocs(collection(targetDb, 'activity_logs'))`).
- **Dampak**: 1 jam buka tab admin = 240 siklus × 150 dokumen = **36.000 reads**! Kuota harian habis seketika.

### Akar Masalah 2: *Activity-Driven Remote Token Sync Cooldown Terlalu Singkat*
- **Lokasi**: `/src/App.vue` baris 472–513 & `/src/stores/finance.ts` baris 1566 & 1875.
- **Analisis**: `TOKEN_CHECK_COOLDOWN_MS = 1500` (hanya 1.5 detik!). Setiap pengguna menyentuh layar HP (`pointerdown`), mengetik angka di form transaksi (`keydown`), atau beralih aplikasi (`visibilitychange`), sistem mengecek dokumen `/users/{uid}`. Jika selisih `remoteSyncToken` dan `localSyncToken` lebih dari 2 detik (misal ada sinkronisasi kecil di latar belakang), sistem langsung memicu `fetchAllCollectionsFromFirestore`, menarik kembali 5 query koleksi sekaligus (`wallets`, `wallet_owners`, `categories`, `transactions` bulan berjalan + 25 item, `budgets`).

### Akar Masalah 3: Kueri Koleksi Mentah Tanpa `limit()` pada Admin Data Explorer
- **Lokasi**: `/src/stores/admin.ts` baris 1955 (`fetchFirestoreRawCollectionDocs`).
- **Analisis**: `getDocs(collection(targetDb, collectionName))` dieksekusi tanpa batasan `limit()`. Ketika admin mengklik nama koleksi `transactions` di Data Explorer, seluruh dokumen dari masa lalu ditarik semua ke memori browser.

### Akar Masalah 4: Filter Transaksi Periode 'Semua' Tanpa Server Boundary
- **Lokasi**: `/src/stores/finance.ts` baris 1428.
- **Analisis**: Ketika pengguna berada di halaman Riwayat Transaksi dengan periode "Semua" dan menerapkan filter tipe/kategori/dompet, sistem menjalankan kueri Firestore tanpa `limit()`, mengambil seluruh transaksi milik pengguna tersebut untuk kemudian dipotong di memori klien.

### Akar Masalah 5: Full-Collection Scan Saat Login / Validasi Username
- **Lokasi**: `/src/stores/auth.ts` baris 1547.
- **Analisis**: Di `lookupUserFromFirestore()`, setelah pencarian spesifik gagal, kode memanggil `const allUsersSnap = await getDocs(usersCol);` dan me-looping seluruh dokumen koleksi `users`.

### Akar Masalah 6: *Global Default Categories* Diambil Berulang Kali
- **Lokasi**: `/src/stores/finance.ts` baris 1641–1649.
- **Analisis**: Meskipun 45 kategori bawaan sistem bersifat statis, pengecekan `defaultCategories.value.length === 0` dapat memicu pembacaan 45 dokumen dari Firestore setiap kali refresh atau inisialisasi awal dilakukan jika cache memori terhapus.

---

## 3. Strategi Optimasi (Solusi Komprehensif)

Untuk menurunkan pembacaan Firestore dari >50.000 reads menjadi **di bawah 1.500 – 2.500 reads per hari** (penghematan >95%), berikut langkah-langkah optimasi yang akan diterapkan:

1. **Matikan Polling Firestore di Admin Monitor**:
   - Jadwalkan `fetchAdminOverview` hanya membaca data dari *in-memory Express server registry* (`apiClient.get('/admin/overview')` yang berbiaya 0 Firestore read).
   - `syncFirestoreUsersToServerRegistry` **HANYA** dipanggil secara eksplisit saat Super Admin mengklik tombol "Segarkan Data" secara manual atau pada inisialisasi pertama sesi (disimpan dalam `sessionStorage`), bukan pada polling otomatis 15 detik.

2. **Perbesar Cooldown & Lepas Event Listener Berlebih di `App.vue`**:
   - Hapus listener `pointerdown` dan `keydown` untuk pengecekan sinkronisasi database.
   - Pengecekan otomatis hanya terjadi saat `window` mendapatkan fokus kembali (`focus` / `visibilitychange`) dengan *cooldown* minimal **10 menit** (bukan 1.5 detik!).
   - Transaksi atau perubahan data yang dibuat oleh user sendiri sudah langsung disimpan di lokal dan sinkron ke Firestore melalui *write operation*, sehingga tidak perlu di-read ulang secara terus-menerus.

3. **Gunakan Limit Ketat pada Data Explorer Admin**:
   - Pasang klausa `limit(50)` atau `limit(100)` secara default pada `fetchFirestoreRawCollectionDocs`.
   - Tambahkan *pagination cursor* (`startAfter`) jika admin ingin melihat halaman data berikutnya, sehingga tidak pernah terjadi penarikan ribuan dokumen sekaligus.

4. **Batasi Kueri Transaksi Lintas Periode**:
   - Kueri `transactions` pada periode "Semua" wajib memiliki batas maksimal `limit(50)` atau `limit(100)` dengan paginasi berbasis kursor server.

5. **Hapus Full Collection Scan pada `auth.ts`**:
   - Hapus baris `const allUsersSnap = await getDocs(usersCol);`.
   - Gunakan kueri tunggal terindeks `where('username', '==', ...)` atau `where('email', '==', ...)`.

6. **Cache Permanen Kategori Bawaan di LocalStorage**:
   - Simpan 45 kategori default di `localStorage` (`sisauang_default_categories_cache`).
   - Jangan pernah membaca koleksi `categories` milik `__default__` lagi jika datanya sudah ada di `localStorage`.

---

## 4. Perubahan File yang Direncanakan (Proposed Changes)

### 1. `/src/App.vue`
- Menghapus event listener `pointerdown` dan `keydown` yang memicu pemanggilan `checkAndTriggerOnActivity()` berulang-ulang.
- Mengatur `handleAppVisibilityOrFocus` agar memiliki jeda minimal 10 menit sebelum mengecek token sinkronisasi Firestore.

### 2. `/src/stores/finance.ts`
- Mengubah `TOKEN_CHECK_COOLDOWN_MS` dari **1.500 ms (1.5 detik)** menjadi **300.000 ms (5 menit)**.
- Mengubah ambang batas toleransi timestamp token dari 2 detik menjadi 30 detik untuk menghindari refetch palsu akibat *network latency*.
- Menambahkan `limit(100)` pada kueri transaksi filter lintas periode (`fetchTransactionsServerPage`).
- Membaca kategori bawaan (`defaultCategories`) dari `localStorage` permanen sebelum menyentuh Firestore.

### 3. `/src/stores/admin.ts`
- Menghentikan pemanggilan `syncFirestoreUsersToServerRegistry` di dalam siklus interval polling 15 detik.
- Mengubah polling admin agar 100% menggunakan API lokal Express backend (`/admin/overview`), 0 Firestore reads.
- Menambahkan pembatasan `limit(50)` pada `fetchFirestoreRawCollectionDocs`.

### 4. `/src/stores/auth.ts`
- Menghapus pemanggilan `getDocs(usersCol)` (full scan) di `lookupUserFromFirestore`.
- Mengoptimalkan pengecekan Pro status agar menggunakan `getDoc(doc(db, 'users', uid))` langsung ketimbang melakukan `getDocs(query(...))`.

### 5. `/src/stores/automation.ts`
- Memastikan pengecekan jadwal otomatisasi mengandalkan cache lokal (IndexedDB / localStorage) dan hanya melakukan sinkronisasi write saat jadwal benar-benar jatuh tempo.

---

## 5. User Review Required

- **Konfirmasi**: Apakah toleransi sinkronisasi otomatis latar belakang selama 5–10 menit (dengan tombol manual "Segarkan Data" tetap tersedia jika pengguna ingin instan) dapat diterima untuk menghemat lebih dari 45.000 reads per hari?
- **Admin Data Explorer**: Penjelajah database admin akan menampilkan 50 data per halaman dengan tombol navigasi (Next/Prev) alih-alih me-load seluruh tabel sekaligus.

---

## 6. Verification Plan

1. **Verifikasi Kompilasi**:
   - Jalankan `compile_applet` untuk memastikan TypeScript dan build Vite berjalan 100% tanpa error.
2. **Uji Operasi Database di Console / Network**:
   - Pantau log network pada saat navigasi halaman, beralih tab, dan mengklik tombol: pastikan tidak ada rentetan permintaan Firestore berulang.
3. **Uji Fitur Multi-Device & Offline Sync**:
   - Pastikan transaksi baru tetap tersimpan rapi ke Firestore dan muncul di ringkasan keuangan.
4. **Uji Panel Super Admin**:
   - Pastikan Control Panel tetap memperbarui status pengguna tanpa membebani kuota Firestore.
