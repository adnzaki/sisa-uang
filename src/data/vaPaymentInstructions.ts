export interface PaymentGuideStep {
  title: string;
  type?: 'mobile' | 'internet' | 'atm' | 'teller' | 'other';
  tag?: string;
  steps: string[];
}

export interface BankPaymentGuide {
  channelCode: string;
  bankName: string;
  guides: PaymentGuideStep[];
}

export const vaPaymentInstructions: Record<string, BankPaymentGuide> = {
  // 1. Bank Neo Commerce (BNC)
  NC: {
    channelCode: 'NC',
    bankName: 'Bank Neo Commerce (BNC)',
    guides: [
      {
        title: 'Mobile Banking Neobank',
        type: 'mobile',
        steps: [
          'Masuk ke aplikasi Neobank di smartphone Anda.',
          'Pilih ikon/menu "Hematpay".',
          'Masukkan Nomor Virtual Account (VA) pembayaran Anda.',
          'Masukkan nominal pembayaran sesuai dengan total tagihan.',
          'Konfirmasi informasi pembayaran pada layar.',
          'Masukkan PIN Neobank Anda.',
          'Transaksi selesai dan simpan bukti pembayaran.',
        ],
      },
      {
        title: 'Mobile Banking BCA',
        type: 'mobile',
        steps: [
          'Buka aplikasi BCA mobile dan pilih menu "m-Transfer".',
          'Pilih menu "Daftar Transfer" > "Antar Bank".',
          'Masukkan nomor Virtual Account pada kolom No. Rekening Tujuan.',
          'Pilih rekening tujuan "Bank Neo Commerce/BNC".',
          'Kembali ke menu transfer, pilih menu "Transfer" > "Antar Bank".',
          'Pilih rekening tujuan "Bank Neo Commerce/BNC-490".',
          'Pilih nomor Virtual Account yang sebelumnya sudah didaftarkan.',
          'Masukkan jumlah pembayaran sesuai tagihan.',
          'Masukkan PIN m-BCA Anda, transaksi selesai.',
        ],
      },
      {
        title: 'ATM Bersama / ATM Prima',
        type: 'atm',
        tag: 'ATM',
        steps: [
          'Masukkan kartu ke mesin ATM Bersama atau ATM Prima.',
          'Pilih "TRANSAKSI lainnya".',
          'Pilih menu "Transfer".',
          'Pilih "Transfer ke Bank Lain".',
          'Masukkan kode Bank Neo Commerce/BNC "490" diikuti 18 digit nomor Virtual Account.',
          'Masukkan Nominal Transfer sesuai tagihan atau kewajiban Anda, pastikan nominal sesuai.',
          'Konfirmasi rincian Anda akan tampil di layar, cek dan tekan "Ya" untuk melanjutkan.',
          'Transaksi berhasil dan simpan struk ATM sebagai bukti.',
        ],
      },
    ],
  },

  // 2. Bank BNI
  I1: {
    channelCode: 'I1',
    bankName: 'Bank BNI',
    guides: [
      {
        title: 'Ibank Personal (Internet Banking)',
        type: 'internet',
        steps: [
          'Akses situs ibank.bni.co.id di browser Anda.',
          'Masukkan User ID dan Password.',
          'Klik menu "Transfer", lalu pilih "Virtual Account Billing".',
          'Kemudian masukkan nomor Virtual Account Anda yang hendak dibayarkan. Lalu pilih rekening debet yang akan digunakan. Kemudian tekan "Lanjut".',
          'Kemudian tagihan yang harus dibayarkan akan muncul pada layar konfirmasi.',
          'Masukkan Kode Otentikasi Token BNI Anda.',
          'Pembayaran Anda telah berhasil.',
          'Simpan bukti transaksi.',
        ],
      },
      {
        title: 'Mobile Banking BNI',
        type: 'mobile',
        steps: [
          'Akses dan login ke BNI Mobile Banking dengan user ID dan password / biometrik.',
          'Pilih menu "Transfer".',
          'Pilih menu "Virtual Account Billing" kemudian pilih rekening debet Anda.',
          'Masukkan nomor Virtual Account Anda pada menu "input baru".',
          'Tagihan yang harus dibayarkan akan muncul pada layar konfirmasi.',
          'Konfirmasi transaksi dan masukkan Password Transaksi Anda.',
          'Pembayaran Anda telah berhasil, simpan bukti transaksi.',
        ],
      },
      {
        title: 'ATM BNI',
        type: 'atm',
        tag: 'ATM',
        steps: [
          'Masukkan Kartu ATM BNI Anda dan pilih Bahasa.',
          'Masukkan PIN ATM Anda.',
          'Pilih "Menu Lainnya" > pilih "Transfer".',
          'Pilih jenis rekening yang akan Anda gunakan (Contoh: "Dari Rekening Tabungan").',
          'Pilih "Virtual Account Billing".',
          'Masukkan nomor Virtual Account BNI Anda.',
          'Tagihan yang harus dibayarkan akan muncul pada layar konfirmasi.',
          'Konfirmasi, apabila telah sesuai, lanjutkan transaksi.',
          'Transaksi Anda telah selesai, silakan simpan bukti transaksi.',
        ],
      },
      {
        title: 'ATM Bersama',
        type: 'atm',
        tag: 'ATM Lain',
        steps: [
          'Masukkan kartu ke mesin ATM Bersama.',
          'Pilih "Transaksi Lainnya" > pilih menu "Transfer".',
          'Pilih "Transfer ke Bank Lain".',
          'Masukkan kode bank BNI (009) dan 16 Digit Nomor Virtual Account.',
          'Masukkan nominal transfer sesuai tagihan atau kewajiban Anda, pastikan nominal tepat.',
          'Konfirmasi rincian Anda akan tampil di layar, cek dan tekan "Ya" untuk melanjutkan.',
          'Transaksi berhasil.',
        ],
      },
      {
        title: 'ATM Prima',
        type: 'atm',
        tag: 'ATM Lain',
        steps: [
          'Masukkan kartu ke mesin ATM jaringan Prima.',
          'Pilih "Transaksi Lainnya" > pilih menu "Transfer".',
          'Pilih "Transfer ke Bank Lain".',
          'Masukkan kode bank BNI (009) dan 16 Digit Nomor Virtual Account.',
          'Masukkan nominal transfer sesuai tagihan atau kewajiban Anda, pastikan nominal sesuai.',
          'Konfirmasi rincian Anda akan tampil di layar, cek dan tekan "Ya" untuk melanjutkan.',
          'Transaksi berhasil.',
        ],
      },
    ],
  },

  // 3. Bank BRI (BRIVA)
  BR: {
    channelCode: 'BR',
    bankName: 'Bank BRI (BRIVA)',
    guides: [
      {
        title: 'BRImo (Mobile Banking)',
        type: 'mobile',
        steps: [
          'Lakukan log in pada aplikasi BRImo (Android/iPhone).',
          'Pilih menu "Tagihan" / "BRIVA".',
          'Pilih "Pembayaran Baru".',
          'Masukkan Nomor Virtual Account (BRIVA) yang tertera pada halaman konfirmasi.',
          'Masukkan PIN BRImo Anda.',
          'Validasi pembayaran Anda.',
          'Pembayaran selesai.',
        ],
      },
      {
        title: 'BRI Internet Banking',
        type: 'internet',
        steps: [
          'Lakukan log in pada website Internet Banking BRI (ib.bri.co.id).',
          'Pilih menu Pembayaran (scroll ke bawah).',
          'Pilih "BRIVA".',
          'Pilih Rekening debet.',
          'Masukkan Nomor VA yang tertera pada halaman konfirmasi dan pilih Kirim.',
          'Masukkan password Internet Banking BRI / BRImo.',
          'Klik permintaan mToken dan masukkan mToken yang diterima via SMS.',
          'Klik kirim, pembayaran selesai.',
        ],
      },
      {
        title: 'ATM BRI',
        type: 'atm',
        tag: 'ATM',
        steps: [
          'Masukkan Kartu ATM BRI dan PIN Anda.',
          'Pilih menu "LAINNYA" > pilih menu "PEMBAYARAN/PEMBELIAN".',
          'Pilih menu "PEMBAYARAN/PEMBELIAN LAIN".',
          'Pilih menu "BRIVA".',
          'Masukkan nomor VA yang tertera pada halaman konfirmasi, dan tekan BENAR.',
          'Konfirmasi pembayaran dengan menekan Ya.',
          'Pembayaran selesai, simpan struk transaksi.',
        ],
      },
      {
        title: 'ATM Bersama',
        type: 'atm',
        tag: 'ATM Lain',
        steps: [
          'Masukkan kartu ke mesin ATM jaringan ATM Bersama.',
          'Pilih "Transaksi Lainnya" > pilih menu "Transfer" > pilih "Transfer ke Bank Lain".',
          'Masukkan kode Bank Rakyat Indonesia/BRI "002" dan 16 Digit nomor Virtual Account.',
          'Masukkan Nominal Transfer sesuai tagihan atau kewajiban Anda, pastikan nominal sesuai.',
          'Konfirmasi rincian Anda akan tampil di layar, cek dan tekan "Ya" untuk melanjutkan.',
          'Transaksi berhasil.',
        ],
      },
      {
        title: 'ATM Prima',
        type: 'atm',
        tag: 'ATM Lain',
        steps: [
          'Pilih "Transaksi Lainnya" > pilih menu "Transfer" > pilih "Transfer ke Bank Lain".',
          'Masukkan kode Bank Rakyat Indonesia/BRI "002" dan 16 Digit nomor Virtual Account.',
          'Masukkan Nominal Transfer sesuai tagihan atau kewajiban Anda, pastikan nominal sesuai.',
          'Konfirmasi rincian Anda akan tampil di layar, cek dan tekan "Ya" untuk melanjutkan.',
          'Transaksi berhasil.',
        ],
      },
    ],
  },

  // 4. Bank Syariah Indonesia (BSI)
  BV: {
    channelCode: 'BV',
    bankName: 'Bank Syariah Indonesia (BSI)',
    guides: [
      {
        title: 'BSI Mobile & BSI Net',
        type: 'mobile',
        steps: [
          'Buka aplikasi BSI Mobile atau portal BSI Net.',
          'Pilih Menu "Pembayaran / Payment".',
          'Pilih "Institusi".',
          'Masukkan Kode Institusi: 1623 - Duitku Close.',
          'Masukkan Nomor Pembayaran / Virtual Account Anda.',
          'Layar validasi tagihan akan muncul pada layar, masukkan PIN Anda dan pilih "Selanjutnya" untuk submit.',
          'Selesai.',
        ],
      },
      {
        title: 'Byond by BSI',
        type: 'mobile',
        steps: [
          'Buka aplikasi Byond by BSI dan login.',
          'Pilih menu "Bayar & Beli".',
          'Pilih menu "Lembaga".',
          'Masukkan kode: 1623 - Duitku Close.',
          'Masukkan ID Pelanggan / Kode Bayar (Nomor VA).',
          'Masukkan nominal yang akan dibayarkan sesuai tagihan.',
          'Layar validasi tagihan akan muncul pada layar, masukkan PIN Anda dan pilih "Selanjutnya" untuk submit.',
          'Selesai.',
        ],
      },
      {
        title: 'ATM BSI',
        type: 'atm',
        tag: 'ATM',
        steps: [
          'Masukkan kartu ATM BSI dan PIN Anda.',
          'Pilih menu "Bayar" > pilih "Institusi".',
          'Masukkan Kode Institusi: 1623 + Nomor Pembayaran (VA).',
          'Pilih Benar / Selanjutnya.',
          'Kemudian tampil informasi data transaksi Anda, pastikan data sudah benar.',
          'Pilih Benar / Ya untuk menyelesaikan.',
        ],
      },
      {
        title: 'Teller Seluruh Cabang BSI',
        type: 'teller',
        tag: 'Teller',
        steps: [
          'Datang ke kantor cabang BSI terdekat.',
          'Tulis pada Slip Bayar Tagihan: Nama Pelanggan, Kode Institusi (1623) + Nomor Pembayaran, dan Dibayarkan secara Tunai atau Beban rekening nomor.',
          'Pembayar tanda tangan pada Slip bayar tagihan tersebut.',
          'Sampaikan slip kepada petugas Teller BSI.',
          'Teller akan mengkonfirmasi nominal tagihan yang akan dibayar.',
          'Selesai dan terima bukti pembayaran.',
        ],
      },
      {
        title: 'ATM / M-Banking Bank Lain',
        type: 'other',
        tag: 'Bank Lain',
        steps: [
          'Pilih menu "Transfer" > pilih "Antar Bank Online / Transfer Online Antar Bank".',
          'Masukkan kode Bank BSI: 451 (atau pilih Bank BSI).',
          'Masukkan kode: 900 + Kode Institusi (1623) + Nomor Pembayaran.',
          'Masukkan nominal tagihan + Fee ADM.',
          'Layar akan menampilkan data transaksi Anda. Jika data sudah benar pilih Ya (OK).',
          'Proses Pembayaran.',
          'Catatan: Untuk transfer melalui E-Wallet, BI-Fast, SKN dan Kliring belum bisa dilayani.',
        ],
      },
    ],
  },

  // 5. CIMB Niaga
  B1: {
    channelCode: 'B1',
    bankName: 'CIMB Niaga',
    guides: [
      {
        title: 'Go Mobile / OCTO Mobile',
        type: 'mobile',
        steps: [
          'Login ke aplikasi OCTO Mobile (Go Mobile).',
          'Pilih menu Transfer > "Rekening Ponsel / CIMB Niaga".',
          'Pilih rekening sumber dana Anda: CASA atau Rekening Ponsel.',
          'Pilih rekening tujuan: CASA.',
          'Masukkan kode Virtual Account pada kolom nomor rekening penerima.',
          'Masukkan jumlah pembayaran sesuai dengan tagihan.',
          'Ikuti instruksi dan masukkan PIN untuk menyelesaikan transaksi.',
        ],
      },
      {
        title: 'CIMB Clicks',
        type: 'internet',
        steps: [
          'Login ke portal CIMB clicks (www.cimbclicks.co.id).',
          'Pilih menu "Bayar Tagihan / Pay Bills".',
          'Pilih Rekening Sumber / Source Account dan Jenis Pembayaran / Payment Type > "Virtual Account".',
          'Masukkan nomor virtual account Anda.',
          'Nomor, nama virtual account, dan jumlah billing akan ditampilkan pada layar.',
          'Masukkan 6 digit mPIN dan tekan tombol Submit.',
          'Konfirmasi pembayaran ditampilkan pada layar dan simpan bukti transaksi.',
        ],
      },
      {
        title: 'Internet Banking Bank Lain',
        type: 'internet',
        tag: 'Online Transfer',
        steps: [
          'Login ke akun internet banking bank Anda.',
          'Pilih menu transfer ke Bank Lain Online.',
          'Pilih bank tujuan: Bank CIMB Niaga (kode bank: 022).',
          'Masukkan nomor Virtual Account CIMB Niaga.',
          'Masukkan jumlah pembayaran sesuai tagihan.',
          'Nomor, nama virtual account, dan jumlah billing akan ditampilkan pada layar.',
          'Ikuti instruksi untuk menyelesaikan transaksi.',
          'Konfirmasi pembayaran ditampilkan pada layar.',
        ],
      },
      {
        title: 'ATM CIMB Niaga',
        type: 'atm',
        tag: 'ATM',
        steps: [
          'Masukkan kartu ATM dan PIN kartu CIMB Anda.',
          'Pilih Menu Pembayaran > Lanjut > "Virtual Account".',
          'Masukkan jumlah pembayaran sesuai dengan tagihan.',
          'Masukkan kode Virtual Account pada kolom rekening penerima.',
          'Ikuti instruksi untuk menyelesaikan transaksi.',
        ],
      },
      {
        title: 'ATM Bersama / Prima',
        type: 'atm',
        tag: 'ATM Lain',
        steps: [
          'Pada Menu utama ATM, pilih "Transaksi Lainnya".',
          'Pilih "Transfer" > pilih "Antar Bank Online".',
          'Masukkan nomor Virtual Account (diawali kode bank 022 dan kode Virtual Account).',
          'Masukkan jumlah tagihan yang akan Anda bayar secara lengkap (pembayaran tidak sesuai akan otomatis ditolak).',
          'Pada halaman konfirmasi transfer akan muncul rincian pembayaran & rekening tujuan, jika telah sesuai tekan tombol Benar.',
        ],
      },
    ],
  },

  // 6. Bank Danamon
  DM: {
    channelCode: 'DM',
    bankName: 'Bank Danamon',
    guides: [
      {
        title: 'D-Bank PRO (Mobile Banking)',
        type: 'mobile',
        steps: [
          'Masuk dan login ke Aplikasi D-Bank PRO.',
          'Klik Menu "Virtual Account".',
          'Pilih Tujuan Pembayaran.',
          'Jika nomor VA belum pernah disimpan, pilih "+Tagihan Baru" untuk memasukkan nomor VA.',
          'Masukkan Nomor VA Danamon Anda, lalu pilih Lanjut.',
          'Pastikan Rekening Sumber Dana & Tujuan Pembayaran sudah benar, pilih Lanjut.',
          'Isi dan pastikan informasi pembayaran VA sudah sesuai, lalu masukkan mPIN dan pilih Kirim.',
        ],
      },
      {
        title: 'D-Bank PRO Website',
        type: 'internet',
        steps: [
          'Kunjungi situs D-Bank PRO Website (www.dbank.co.id).',
          'Login ke akun D-Bank PRO Website Anda.',
          'Klik Menu "Virtual Account".',
          'Pilih Tujuan Pembayaran.',
          'Jika nomor VA belum pernah disimpan, pilih "+Tagihan Baru" untuk memasukkan nomor VA.',
          'Masukkan Nomor VA Danamon, pilih Lanjut.',
          'Pastikan Rekening Sumber Dana & Tujuan Pembayaran sudah benar, pilih Lanjut.',
          'Isi dan pastikan informasi pembayaran VA sudah sesuai, lalu masukkan mPIN dan pilih Kirim.',
        ],
      },
      {
        title: 'Danamon Cash Connect - Bill Payment',
        type: 'internet',
        tag: 'Cash Connect',
        steps: [
          'Pilih menu "Bill Payment/Purchase", lalu klik "Single Payment/Purchase".',
          'Pilih Transfer Dari, lalu Pilih Penerima.',
          'Jika nama Penerima belum pernah disimpan, pilih "Penerima Baru".',
          'Pilih VA pada kategori Institusi, pilih "Virtual Account" pada Institusi.',
          'Masukkan No VA, pilih Mode Instruksi, Klik Lanjutkan.',
          'Periksa Transaksi, Pilih Execution Option, Klik Confirm.',
          'Periksa kembali Transaksi, klik Submit, lalu klik Submit.',
          'Akan muncul notifikasi pembayaran VA Anda berhasil disubmit dan menunggu Approval.',
        ],
      },
      {
        title: 'Danamon Cash Connect - Transfer Management',
        type: 'internet',
        tag: 'Cash Connect',
        steps: [
          'Pilih menu "Transfer Management", lalu klik "Single Payment/Purchase".',
          'Pilih "Antar Rekening Bank/In-house".',
          'Jika Penerima belum terdaftar, klik "Penerima Baru".',
          'Pilih Kirim Dari dan Daftar Penerima.',
          'Masukkan nomor VA pada kolom Nomor Rekening.',
          'Masukkan Nominal tagihan dan pilih Mata Uang IDR.',
          'Pilih Kategori Penerima, Hubungan Transaktor, Status Identik, Tujuan Transaksi, Kode Tujuan LHBU, dan Tipe Dokumen LHBU.',
          'Periksa kembali Transaksi, klik Submit, lalu klik Submit.',
          'Akan muncul notifikasi pembayaran VA Anda berhasil disubmit dan menunggu Approval.',
        ],
      },
      {
        title: 'ATM Danamon - Menu Pembayaran',
        type: 'atm',
        tag: 'ATM',
        steps: [
          'Masukkan kartu ATM Danamon & PIN Anda.',
          'Pilih menu "Pembayaran", lalu pilih "Lainnya", dan pilih "Virtual Account".',
          'Masukkan nomor VA (16 digit) yang dituju, lalu pilih Benar.',
          'Pilih rekening sumber dana Anda.',
          'Masukkan jumlah pembayaran atau konfirmasi tagihan yang ditampilkan.',
        ],
      },
      {
        title: 'ATM Danamon - Menu Transfer Dana',
        type: 'atm',
        tag: 'ATM',
        steps: [
          'Masukkan kartu ATM Danamon & PIN Anda.',
          'Pilih menu "Transfer Dana", lalu pilih rekening "Bank Danamon".',
          'Masukkan nomor VA (16 digit) yang dituju, lalu pilih Benar.',
          'Masukkan jumlah pembayaran lalu pilih Benar.',
          'Pilih rekening sumber dana.',
          'Periksa layar konfirmasi pembayaran, jika sudah benar pilih Ya.',
        ],
      },
      {
        title: 'ATM Bersama / Prima / Alto',
        type: 'atm',
        tag: 'ATM Jaringan',
        steps: [
          'Pilih menu "Transfer ke Bank Lain".',
          'Masukkan Kode Danamon "011" + Nomor Virtual Account Danamon [16 angka]. Pilih Proses/OK.',
          'Masukkan Nominal pembayaran sesuai tagihan.',
          'Pada layar konfirmasi pembayaran, pastikan nama tujuan dan nominal transaksi sudah tepat.',
          'Klik Ya untuk melanjutkan transaksi.',
          'Simpan struk transaksi sebagai bukti pembayaran resmi.',
        ],
      },
      {
        title: 'Teller Danamon (Setoran Tunai & Non-Tunai)',
        type: 'teller',
        tag: 'Teller',
        steps: [
          'Kunjungi kantor cabang Bank Danamon terdekat.',
          'Isi formulir setoran/pemindah bukuan dengan 16 digit nomor Virtual Account Danamon dan nama penerima.',
          'Isi nominal pembayaran/setoran sesuai tagihan.',
          'Isi kolom berita (jika diperlukan) dan serahkan ke petugas Teller Danamon untuk diproses.',
        ],
      },
    ],
  },

  // 7. Bank Mandiri
  M2: {
    channelCode: 'M2',
    bankName: 'Bank Mandiri',
    guides: [
      {
        title: "Livin' by Mandiri (Mobile Banking)",
        type: 'mobile',
        steps: [
          "Buka aplikasi Livin' by Mandiri di ponsel Anda.",
          'Masukkan password atau lakukan autentikasi biometrik pada halaman login.',
          'Pilih fitur "Bayar / VA".',
          'Masukkan kode penyedia jasa pada kolom pencarian.',
          'Pilih penyedia jasa yang sesuai, lalu masukkan nomor Virtual Account Anda.',
          'Pastikan nominal pembayaran sudah sesuai dengan tagihan, pilih sumber dana, lalu klik Lanjutkan.',
          'Konfirmasi detail pembayaran, lalu klik Lanjutkan Pembayaran.',
          "Masukkan PIN Livin' by Mandiri Anda, dan pembayaran berhasil!",
        ],
      },
      {
        title: 'Kopra by Mandiri',
        type: 'internet',
        steps: [
          'Buka aplikasi atau portal Kopra by Mandiri.',
          'Masukkan Company ID, User ID, dan Password Anda.',
          'Pilih menu "Pembayaran" lalu "Pembayaran Tagihan".',
          'Pilih "Manual Input".',
          'Pilih sumber dana rekening pembayaran Anda.',
          'Pilih "Institusi".',
          'Masukkan Nomor Virtual Account (VA) dan input Nominal sesuai tagihan.',
          'Klik inquiry hingga menampilkan data rincian pembayaran.',
          'Pastikan nominal pembayaran sesuai, lalu klik Ajukan.',
          'Approved transaksi melalui menu Pending Task dengan memasukkan PIN dinamis pada token.',
          'Transaksi berhasil dilakukan.',
        ],
      },
      {
        title: 'ATM Mandiri',
        type: 'atm',
        tag: 'ATM',
        steps: [
          'Masukkan kartu ATM Mandiri, lalu masukkan PIN.',
          'Pilih menu "Bayar / Beli".',
          'Pilih menu "Lainnya" > pilih "Lainnya" > pilih "Multi Payment" / Institusi.',
          'Masukkan Kode Perusahaan / Institusi yang sesuai.',
          'Masukkan Nomor Virtual Account Anda.',
          'Pada layar Item Pembayaran, tekan angka 1, lalu tekan OK/Ya.',
          'Periksa kembali informasi pada layar Konfirmasi Pembayaran.',
          'Jika data sudah sesuai, lanjutkan transaksi hingga selesai.',
          'Simpan struk pembayaran sebagai bukti transaksi resmi.',
        ],
      },
      {
        title: 'Cabang Bank Mandiri (Konvensional & Smart Branch)',
        type: 'teller',
        tag: 'Teller / Branch',
        steps: [
          'Datang ke Kantor Cabang Bank Mandiri terdekat.',
          'Konvensional: Isi slip setoran / formulir pindah buku dengan nomor Virtual Account pada kolom nomor rekening, nama penyetor, dan nominal pembayaran.',
          'Smart Branch: Masukkan NIK/nomor rekening pada Kiosk Smart Branch, lakukan verifikasi, pilih menu Pembayaran > Institusi > masukkan nomor Virtual Account.',
          'Petugas / teller akan memproses transaksi dan mencetak bukti pembayaran resmi.',
        ],
      },
      {
        title: 'Mobile Banking BCA (myBCA / KlikBCA)',
        type: 'mobile',
        tag: 'Bank Lain',
        steps: [
          'Buka aplikasi myBCA dan login biometrik / password.',
          'Pilih menu Transfer, lalu pilih "Bank Lain".',
          'Pilih "Transfer ke Tujuan Baru".',
          'Pada bagian Bank Tujuan, pilih "Mandiri".',
          'Pada bagian Rekening Tujuan, masukkan Nomor Virtual Account (VA).',
          'Pada bagian Nominal, masukkan jumlah pembayaran sesuai tagihan, lalu klik Lanjut.',
          'Masukkan password transaksi / PIN, lalu klik Lanjut. Transaksi selesai!',
        ],
      },
      {
        title: 'ATM BCA',
        type: 'atm',
        tag: 'ATM Lain',
        steps: [
          'Masukkan kartu ATM BCA, lalu masukkan PIN.',
          'Pilih menu "Transaksi Lainnya" > pilih menu "Transfer".',
          'Pilih "Ke Rek. Bank Lain".',
          'Masukkan kode Bank Mandiri (008) dan Nomor Virtual Account (VA) pada kolom rekening tujuan.',
          'Masukkan Jumlah Transfer sesuai tagihan.',
          'Masukkan nomor referensi (opsional, dapat dikosongkan).',
          'Periksa kembali detail transaksi, lalu pilih Ya untuk konfirmasi transfer.',
          'Transaksi selesai!',
        ],
      },
      {
        title: 'Mobile Banking BNI (Wondr)',
        type: 'mobile',
        tag: 'Bank Lain',
        steps: [
          'Buka aplikasi Wondr by BNI dan login.',
          'Pilih menu "Transfer", lalu pilih "Penerima Baru".',
          'Pada bagian Bank Tujuan, pilih "Mandiri".',
          'Pada bagian Rekening Tujuan, masukkan Nomor Virtual Account (VA).',
          'Pada bagian Nominal, masukkan jumlah pembayaran sesuai tagihan, lalu klik Lanjut.',
          'Masukkan password transaksi / PIN, lalu klik Lanjut. Transaksi selesai!',
        ],
      },
      {
        title: 'ATM BNI',
        type: 'atm',
        tag: 'ATM Lain',
        steps: [
          'Masukkan kartu ATM BNI, lalu masukkan PIN.',
          'Pilih menu "Lain" > pilih menu "Transfer".',
          'Pilih "Dari Rekening Tabungan" > pilih "Ke Rek. Bank Lain".',
          'Masukkan kode Bank Mandiri (008) diikuti nomor Virtual Account (VA).',
          'Masukkan Jumlah Transfer sesuai tagihan.',
          'Periksa kembali detail transaksi, lalu pilih "Tekan Jika Ya" untuk konfirmasi transfer.',
          'Transaksi selesai!',
        ],
      },
      {
        title: 'Mobile Banking BRI (BRImo)',
        type: 'mobile',
        tag: 'Bank Lain',
        steps: [
          'Buka aplikasi BRImo dan lakukan login.',
          'Pilih menu "Transfer", lalu pilih "Tambah Daftar Baru".',
          'Pada bagian Bank Tujuan, pilih "Mandiri".',
          'Pada bagian Rekening Tujuan, masukkan Nomor Virtual Account (VA).',
          'Pada bagian Nominal, masukkan jumlah pembayaran sesuai tagihan, lalu klik Lanjut.',
          'Masukkan PIN BRImo Anda, lalu klik Lanjut. Transaksi selesai!',
        ],
      },
      {
        title: 'ATM BRI',
        type: 'atm',
        tag: 'ATM Lain',
        steps: [
          'Masukkan kartu ATM BRI, lalu masukkan PIN.',
          'Pilih menu "Lain" > pilih menu "Transfer" > pilih menu "Bank Lain".',
          'Masukkan kode Bank Mandiri (008) dan Nomor Virtual Account (VA).',
          'Masukkan Jumlah Transfer sesuai tagihan.',
          'Periksa kembali detail transaksi, lalu pilih "Tekan Jika Ya" untuk konfirmasi transfer.',
          'Transaksi selesai!',
        ],
      },
    ],
  },

  // 8. Maybank Indonesia
  VA: {
    channelCode: 'VA',
    bankName: 'Maybank Indonesia',
    guides: [
      {
        title: 'M2U App (Maybank Mobile Banking)',
        type: 'mobile',
        steps: [
          'Login ke Aplikasi M2U ID menggunakan sidik jari/biometrik atau password.',
          'Pilih menu "Transfer".',
          'Pilih "Virtual Account".',
          'Pilih Sumber Tabungan / Rekening sumber dana.',
          'Masukkan 16 digit nomor Virtual Account yang tertera pada halaman konfirmasi, lalu Klik Lanjut.',
          'Masukkan jumlah transfer sesuai nominal tagihan, Klik Proses.',
          'Klik Konfirmasi & Minta TAC (SMS Token).',
          'Masukkan SMS Token/TAC yang Anda terima, lalu Klik OK.',
          'Transaksi selesai, simpan bukti pembayaran.',
        ],
      },
      {
        title: 'Maybank2u Internet Banking',
        type: 'internet',
        steps: [
          'Login ke website Maybank Personal Internet Banking (m2u.maybank.co.id).',
          'Di halaman utama, pilih menu "Transfer".',
          'Pilih "Maybank Virtual Account".',
          'Pilih rekening sumber dana, masukkan 16 digit nomor Virtual Account yang tertera pada halaman konfirmasi dan jumlah tagihan yang harus dibayar.',
          'Akan muncul layar konfirmasi, masukkan SMS Token (TAC) Anda.',
          'Transaksi selesai.',
        ],
      },
      {
        title: 'ATM Maybank',
        type: 'atm',
        tag: 'ATM',
        steps: [
          'Masukkan kartu ATM Maybank & PIN Anda.',
          'Pilih Menu "Pembayaran / Top Up Pulsa".',
          'Pilih Menu "Virtual Account".',
          'Masukkan 16 digit nomor Virtual Account yang tertera pada halaman konfirmasi dan Jumlah Nominal Pembayaran.',
          'Konfirmasi Validasi Pembayaran (pastikan nama dan nominal telah sesuai).',
          'Simpan struk transaksi sebagai bukti pembayaran.',
        ],
      },
      {
        title: 'ATM Bersama',
        type: 'atm',
        tag: 'ATM Jaringan',
        steps: [
          'Pada menu utama ATM Bersama, pilih "Transaksi Lainnya".',
          'Pilih "Transfer" > pilih "Antar Bank Online".',
          'Masukkan kode bank Maybank (016) diikuti 16 digit nomor Virtual Account.',
          'Masukkan jumlah pembayaran sesuai tagihan.',
          'Akan muncul rincian pembayaran Anda. Jika sudah benar, klik Ya untuk melanjutkan.',
          'Transaksi selesai.',
        ],
      },
      {
        title: 'ATM BCA / ATM Prima Network',
        type: 'atm',
        tag: 'ATM Prima',
        steps: [
          'Pada menu utama ATM Prima / BCA, pilih "Transaksi Lainnya".',
          'Pilih "Transfer" > pilih "Antar Bank Online".',
          'Masukkan kode bank Maybank (016) diikuti dengan 16 digit nomor Virtual Account.',
          'Masukkan jumlah pembayaran sesuai tagihan.',
          'Akan muncul rincian pembayaran Anda. Jika sudah benar, klik Ya untuk melanjutkan.',
          'Transaksi selesai.',
        ],
      },
    ],
  },

  // 9. Permata Bank
  BT: {
    channelCode: 'BT',
    bankName: 'Permata Bank',
    guides: [
      {
        title: 'Permata Mobile (Permata ME)',
        type: 'mobile',
        steps: [
          'Buka aplikasi PermataME / PermataMobile Internet di smartphone Anda.',
          'Masukkan User ID & Password atau gunakan biometrik login.',
          'Pilih menu "Pembayaran Tagihan".',
          'Pilih "Virtual Account".',
          'Masukkan 16 digit nomor Virtual Account yang tertera pada halaman konfirmasi.',
          'Masukkan nominal pembayaran sesuai dengan yang ditagihkan.',
          'Muncul konfirmasi pembayaran, periksa detail transaksi.',
          'Masukkan otentikasi transaksi / token / PIN.',
          'Transaksi selesai.',
        ],
      },
      {
        title: 'Permata Net (Internet Banking)',
        type: 'internet',
        steps: [
          'Buka website PermataNet di permatanet.com/pnet/.',
          'Masukkan User ID & Password Anda.',
          'Pilih menu "Pembayaran Tagihan".',
          'Pilih "Virtual Account".',
          'Masukkan 16 digit nomor Virtual Account yang tertera pada halaman konfirmasi.',
          'Masukkan nominal pembayaran sesuai dengan yang ditagihkan.',
          'Muncul konfirmasi pembayaran pada layar.',
          'Masukkan otentikasi transaksi / token SMS.',
          'Transaksi selesai.',
        ],
      },
      {
        title: 'ATM Permata',
        type: 'atm',
        tag: 'ATM',
        steps: [
          'Masukkan kartu ATM Permata dan masukkan PIN.',
          'Pilih menu "Transaksi Lainnya" > pilih "Pembayaran".',
          'Pilih menu "Pembayaran Lainnya" > pilih "Virtual Account".',
          'Masukkan 16 digit nomor Virtual Account yang tertera pada halaman konfirmasi, dan tekan Benar.',
          'Pilih rekening yang menjadi sumber dana yang akan didebet, lalu tekan Ya untuk konfirmasi transaksi.',
          'Transaksi selesai.',
        ],
      },
      {
        title: 'ATM BCA / ATM Prima',
        type: 'atm',
        tag: 'ATM Jaringan',
        steps: [
          'Pada menu utama ATM BCA / Prima, pilih "Transaksi Lainnya".',
          'Pilih menu "Transfer" > pilih "Ke Rek Bank Lain".',
          'Masukkan kode bank Permata (013) lalu tekan Benar.',
          'Masukkan jumlah tagihan yang akan Anda bayar secara lengkap.',
          'Masukkan 16 digit nomor Virtual Account yang tertera pada halaman konfirmasi lalu tekan Benar.',
          'Akan muncul rincian pembayaran Anda. Jika sudah benar, klik Ya untuk melanjutkan.',
          'Transaksi berhasil.',
        ],
      },
      {
        title: 'ATM Mandiri / ATM Bersama',
        type: 'atm',
        tag: 'ATM Bersama',
        steps: [
          'Pada menu utama ATM Mandiri / ATM Bersama, pilih "Transaksi Lainnya".',
          'Pilih menu "Transfer" > pilih "Antar Bank Online".',
          'Masukkan kode bank Permata (013) diikuti dengan 16 digit nomor Virtual Account yang tertera pada halaman konfirmasi.',
          'Masukkan jumlah pembayaran sesuai tagihan.',
          'Akan muncul rincian pembayaran Anda. Jika sudah benar, klik Ya untuk melanjutkan.',
          'Transaksi selesai.',
        ],
      },
    ],
  },

  // 10. Bank Sahabat Sampoerna
  S1: {
    channelCode: 'S1',
    bankName: 'Bank Sahabat Sampoerna',
    guides: [
      {
        title: 'ATM Bank Sahabat Sampoerna',
        type: 'atm',
        steps: [
          'Masukkan kartu ATM Bank Sahabat Sampoerna dan PIN Anda.',
          'Pilih menu "TRANSAKSI LAINNYA" kemudian pilih "TRANSFER" kemudian pilih "TRANSFER KE BANK SAHABAT SAMPOERNA".',
          'Masukkan 16 digit nomor rekening Virtual Account.',
          'Masukkan nominal pembayaran sesuai tagihan.',
          'Cek kembali rincian transaksi Anda, lalu pilih YA untuk melanjutkan.',
          'Pembayaran melalui ATM sukses dilakukan.',
        ],
      },
      {
        title: 'ATM Mandiri / ATM Bersama Network',
        type: 'atm',
        steps: [
          'Pada Menu utama ATM Bersama / Mandiri, pilih "Transaksi Lainnya".',
          'Pilih menu "Transfer" > pilih "Ke Rekening Bank Lain".',
          'Masukkan kode bank Sahabat Sampoerna (523) lalu tekan Benar.',
          'Masukkan jumlah tagihan yang akan Anda bayar secara lengkap.',
          'Masukkan 16 digit nomor Virtual Account yang tertera pada halaman konfirmasi lalu tekan Benar.',
          'Masukkan Nominal Pembayaran lalu tekan Benar.',
          'Akan muncul rincian pembayaran Anda. Jika sudah benar, klik Ya untuk melanjutkan.',
        ],
      },
      {
        title: 'ATM BCA / ATM Prima Network',
        type: 'atm',
        tag: 'ATM Prima',
        steps: [
          'Pada Menu utama ATM BCA / Prima, pilih "Transaksi Lainnya".',
          'Pilih menu "Transfer" > pilih "Ke Rek Bank Lain".',
          'Masukkan kode (523) untuk Bank Sahabat Sampoerna lalu tekan Benar.',
          'Masukkan jumlah tagihan yang akan Anda bayar secara lengkap.',
          'Masukkan 16 digit kode Virtual Account pembayaran lalu tekan Benar.',
          'Akan muncul rincian pembayaran Anda. Jika sudah benar, klik Ya untuk melanjutkan.',
        ],
      },
    ],
  },
};

export function getPaymentGuideForChannel(code: string): BankPaymentGuide | null {
  return vaPaymentInstructions[code] || null;
}
