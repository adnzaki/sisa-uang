import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
const auth = getAuth(app);

const DEFAULT_CATEGORY_OWNER_ID = 'ci4_user_46';

interface CategoryDoc {
  id: string;
  name: string;
  type: string;
  ownerId: string;
  deleted?: boolean;
}

interface BudgetDoc {
  id: string;
  ownerId?: string;
  category?: string;
  categoryId?: string;
  period?: string;
  limitAmount?: number;
  spentAmount?: number;
}

async function runBudgetMigration() {
  console.log('--- Memulai Migrasi categoryId pada Koleksi Budgets ---');

  // 1. Sign In
  try {
    await signInWithEmailAndPassword(auth, 'vuedevo@gmail.com', '@Dienzaki2019##');
    console.log('Berhasil login sebagai Super Admin.');
  } catch (err: any) {
    console.error('Gagal login ke Firebase Auth:', err.message);
    process.exit(1);
  }

  // 2. Load Categories
  console.log('Mengambil seluruh data kategori dari Firestore...');
  const catSnap = await getDocs(collection(db, 'categories'));
  console.log(`Ditemukan ${catSnap.size} kategori.`);

  const userCatsByOwner: Record<string, CategoryDoc[]> = {};
  const defaultCats: CategoryDoc[] = [];

  catSnap.forEach((d) => {
    const c = { id: d.id, ...d.data() } as CategoryDoc;
    if (c.ownerId === DEFAULT_CATEGORY_OWNER_ID) {
      defaultCats.push(c);
    } else {
      if (!userCatsByOwner[c.ownerId]) {
        userCatsByOwner[c.ownerId] = [];
      }
      userCatsByOwner[c.ownerId].push(c);
    }
  });

  // Urutkan: kategori aktif (deleted !== true) diprioritaskan di depan kategori yang di-soft-delete
  for (const owner in userCatsByOwner) {
    userCatsByOwner[owner].sort((a, b) => (a.deleted === b.deleted ? 0 : a.deleted ? 1 : -1));
  }
  defaultCats.sort((a, b) => (a.deleted === b.deleted ? 0 : a.deleted ? 1 : -1));

  function findMatchingCategory(budgetOwner: string, catName: string): CategoryDoc | null {
    const cleanLower = (catName || '').trim().toLowerCase();
    if (!cleanLower) return null;

    const userList = userCatsByOwner[budgetOwner] || [];

    // Prioritas 1: Kategori pengeluaran milik user
    let match = userList.find(
      (c) => c.name.trim().toLowerCase() === cleanLower && c.type === 'expense'
    );
    if (match) return match;

    // Prioritas 2: Kategori milik user (apapun tipenya)
    match = userList.find((c) => c.name.trim().toLowerCase() === cleanLower);
    if (match) return match;

    // Prioritas 3: Kategori bawaan (default) tipe pengeluaran
    match = defaultCats.find(
      (c) => c.name.trim().toLowerCase() === cleanLower && c.type === 'expense'
    );
    if (match) return match;

    // Prioritas 4: Kategori bawaan (default) tipe apapun
    match = defaultCats.find((c) => c.name.trim().toLowerCase() === cleanLower);
    if (match) return match;

    return null;
  }

  // 3. Load Budgets
  console.log('Mengambil seluruh dokumen anggaran (budgets) dari Firestore...');
  const budgetSnap = await getDocs(collection(db, 'budgets'));
  console.log(`Ditemukan ${budgetSnap.size} dokumen pada koleksi budgets.`);

  const updateList: { budgetId: string; categoryId: string; currentCategoryId?: string; category: string }[] = [];
  let systemMarkerCount = 0;
  let alreadyUpToDate = 0;
  let unmatchedCount = 0;
  const unmatchedList: any[] = [];

  budgetSnap.forEach((d) => {
    const b = { id: d.id, ...d.data() } as BudgetDoc;
    const catName = (b.category || '').trim();
    const ownerId = b.ownerId || '';

    // Abaikan penanda sistem (period marker, annual budget metadata, pro subscription marker)
    if (catName.startsWith('__')) {
      systemMarkerCount++;
      return;
    }

    const matched = findMatchingCategory(ownerId, catName);
    if (!matched) {
      unmatchedCount++;
      unmatchedList.push({ id: b.id, ownerId, category: catName, period: b.period });
      return;
    }

    if (b.categoryId === matched.id) {
      alreadyUpToDate++;
    } else {
      updateList.push({
        budgetId: b.id,
        categoryId: matched.id,
        currentCategoryId: b.categoryId,
        category: catName,
      });
    }
  });

  console.log(`Statistik Awal:`);
  console.log(`- Dokumen penanda sistem (diabaikan secara aman): ${systemMarkerCount}`);
  console.log(`- Anggaran sudah memiliki categoryId yang tepat: ${alreadyUpToDate}`);
  console.log(`- Anggaran perlu diperbarui dengan categoryId: ${updateList.length}`);
  console.log(`- Anggaran tidak cocok: ${unmatchedCount}`);

  if (unmatchedCount > 0) {
    console.error('PERINGATAN: Ditemukan anggaran yang tidak dapat dicocokkan:', unmatchedList);
    process.exit(1);
  }

  if (updateList.length === 0) {
    console.log('Semua dokumen anggaran sudah memiliki categoryId yang tepat. Tidak ada yang perlu diperbarui.');
    process.exit(0);
  }

  // 4. Pre-flight Check (Tes 1 Dokumen Sebelum Batch Penuh)
  console.log('\nMelakukan uji coba (pre-flight check) 1 dokumen ke Firestore...');
  const testItem = updateList[0];
  const testRef = doc(db, 'budgets', testItem.budgetId);
  try {
    const testBatch = writeBatch(db);
    testBatch.update(testRef, {
      categoryId: testItem.categoryId,
      updatedAt: serverTimestamp(),
    });
    await testBatch.commit();
    console.log('✓ Pre-flight check BERHASIL: Firestore Rules mengizinkan field categoryId pada koleksi budgets.');
  } catch (testErr: any) {
    if (testErr.code === 'permission-denied' || testErr.message?.includes('PERMISSION_DENIED')) {
      console.error('\n================================================================================');
      console.error('❌ GAGAL: ATURAN SECURITY RULES DI FIREBASE CLOUD BELUM DI-UPDATE / DIPUBLIKASI');
      console.error('================================================================================');
      console.error('Penyebab:');
      console.error('Firestore Security Rules di server Firebase (Google Cloud) saat ini masih versi lama.');
      console.error('Pada versi lama, skema fungsi "isValidBudget" memiliki daftar whitelist:');
      console.error('data.keys().hasOnly([...]) yang BELUM mendaftarkan field "categoryId".');
      console.error('Oleh karena itu, server Firestore menolak penulisan field "categoryId" pada koleksi budgets.\n');
      console.error('Solusi Cepat (Pilih salah satu):');
      console.error('1. Melalui Terminal:');
      console.error('   Jalankan: firebase deploy --only firestore:rules');
      console.error('2. Melalui Firebase Console:');
      console.error('   - Buka https://console.firebase.google.com/');
      console.error('   - Pilih project "sisa-uang-dfb7b" -> Firestore Database -> Tab "Rules"');
      console.error('   - Hapus aturan lama, lalu tempel (paste) seluruh isi file "firestore.rules"');
      console.error('   - Klik tombol "Publish" (Publikasikan).');
      console.error('================================================================================\n');
      console.error('Setelah aturan di-publish di Firebase, jalankan kembali script ini.');
      process.exit(1);
    }
    throw testErr;
  }

  // 5. Batch Commit Updates
  const remainingUpdates = updateList.filter((item) => item.budgetId !== testItem.budgetId);
  console.log(`\nMemulai pembaruan ${remainingUpdates.length} dokumen anggaran dalam batch...`);

  const BATCH_SIZE = 400;
  const totalBatches = Math.ceil(remainingUpdates.length / BATCH_SIZE);
  let processedCount = 1; // Termasuk dokumen pre-flight test

  for (let i = 0; i < remainingUpdates.length; i += BATCH_SIZE) {
    const chunk = remainingUpdates.slice(i, i + BATCH_SIZE);
    const batchIndex = Math.floor(i / BATCH_SIZE) + 1;
    const batch = writeBatch(db);

    for (const item of chunk) {
      const budgetRef = doc(db, 'budgets', item.budgetId);
      batch.update(budgetRef, {
        categoryId: item.categoryId,
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
    processedCount += chunk.length;
    console.log(`Batch ${batchIndex}/${totalBatches} berhasil disimpan (${chunk.length} anggaran). Total selesai: ${processedCount}/${updateList.length}`);
  }

  // 6. Verifikasi Akhir
  console.log('\nMelakukan verifikasi akhir pada Firestore...');
  const verifySnap = await getDocs(collection(db, 'budgets'));
  let verifiedCount = 0;
  let missingCategoryIdCount = 0;

  verifySnap.forEach((d) => {
    const data = d.data();
    if (String(data.category || '').startsWith('__')) return;
    if (data.categoryId) {
      verifiedCount++;
    } else {
      missingCategoryIdCount++;
    }
  });

  console.log('\n================ HASIL MIGRASI BUDGETS ================');
  console.log(`Total Anggaran Aktif Berhasil Memiliki categoryId: ${verifiedCount}`);
  console.log(`Anggaran yang Masih Kurang categoryId: ${missingCategoryIdCount}`);
  console.log('=======================================================');

  if (missingCategoryIdCount === 0) {
    console.log('Migrasi categoryId pada koleksi budgets SELESAI DENGAN SEMPURNA! ✓');
  } else {
    console.error('Masih ada anggaran yang belum terisi categoryId.');
  }

  process.exit(0);
}

runBudgetMigration().catch((err) => {
  console.error('Terjadi kesalahan selama migrasi budgets:', err);
  process.exit(1);
});
