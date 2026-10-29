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

interface TransactionDoc {
  id: string;
  ownerId?: string;
  category?: string;
  categoryId?: string;
  type?: string;
}

async function runMigration() {
  console.log('--- Memulai Migrasi categoryId pada Koleksi Transactions ---');
  
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

  // Helper matching function
  function findMatchingCategory(txOwner: string, catName: string, txType?: string): CategoryDoc | null {
    const cleanLower = (catName || '').trim().toLowerCase();
    if (!cleanLower) return null;

    const userList = userCatsByOwner[txOwner] || [];

    // Prioritas 1: Kategori milik user yang cocok nama dan tipenya (expense/income)
    let match = userList.find(
      (c) => c.name.trim().toLowerCase() === cleanLower && (!txType || txType === 'transfer' || c.type === txType)
    );
    if (match) return match;

    // Prioritas 2: Kategori milik user yang cocok nama (apapun tipenya)
    match = userList.find((c) => c.name.trim().toLowerCase() === cleanLower);
    if (match) return match;

    // Prioritas 3: Kategori bawaan (default) yang cocok nama dan tipenya
    match = defaultCats.find(
      (c) => c.name.trim().toLowerCase() === cleanLower && (!txType || txType === 'transfer' || c.type === txType)
    );
    if (match) return match;

    // Prioritas 4: Kategori bawaan (default) yang cocok nama (apapun tipenya)
    match = defaultCats.find((c) => c.name.trim().toLowerCase() === cleanLower);
    if (match) return match;

    return null;
  }

  // 3. Load Transactions
  console.log('Mengambil seluruh transaksi dari Firestore...');
  const txSnap = await getDocs(collection(db, 'transactions'));
  console.log(`Ditemukan ${txSnap.size} transaksi.`);

  const updateList: { txId: string; categoryId: string; currentCategoryId?: string }[] = [];
  let alreadyUpToDate = 0;
  let unmatchedCount = 0;
  const unmatchedTxList: any[] = [];

  txSnap.forEach((d) => {
    const tx = { id: d.id, ...d.data() } as TransactionDoc;
    const ownerId = tx.ownerId || '';
    const catName = tx.category || '';
    const txType = tx.type;

    const matched = findMatchingCategory(ownerId, catName, txType);

    if (!matched) {
      unmatchedCount++;
      unmatchedTxList.push({ id: tx.id, ownerId, category: catName, type: txType });
      return;
    }

    if (tx.categoryId === matched.id) {
      alreadyUpToDate++;
    } else {
      updateList.push({
        txId: tx.id,
        categoryId: matched.id,
        currentCategoryId: tx.categoryId,
      });
    }
  });

  console.log(`Statistik Awal:`);
  console.log(`- Transaksi sudah memiliki categoryId yang tepat: ${alreadyUpToDate}`);
  console.log(`- Transaksi perlu diperbarui dengan categoryId: ${updateList.length}`);
  console.log(`- Transaksi tidak cocok: ${unmatchedCount}`);

  if (unmatchedCount > 0) {
    console.error('PERINGATAN: Ditemukan transaksi yang tidak dapat dicocokkan:', unmatchedTxList);
    process.exit(1);
  }

  // 4. Batch Commit Updates
  const BATCH_SIZE = 400; // Firestore limit adalah 500 operasi per batch
  const totalBatches = Math.ceil(updateList.length / BATCH_SIZE);
  console.log(`\nMemulai pembaruan ${updateList.length} transaksi dalam ${totalBatches} batch (maks ${BATCH_SIZE} per batch)...`);

  for (let bIndex = 0; bIndex < totalBatches; bIndex++) {
    const batch = writeBatch(db);
    const chunk = updateList.slice(bIndex * BATCH_SIZE, (bIndex + 1) * BATCH_SIZE);

    for (const item of chunk) {
      const txRef = doc(db, 'transactions', item.txId);
      batch.update(txRef, {
        categoryId: item.categoryId,
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
    console.log(`[Batch ${bIndex + 1}/${totalBatches}] Berhasil memperbarui ${chunk.length} transaksi.`);
  }

  // 5. Verifikasi Ulang
  console.log('\nMelakukan verifikasi akhir ke Firestore...');
  const verifySnap = await getDocs(collection(db, 'transactions'));
  let missingCatId = 0;
  let verifiedCount = 0;

  verifySnap.forEach((d) => {
    const data = d.data();
    if (!data.categoryId) {
      missingCatId++;
    } else {
      verifiedCount++;
    }
  });

  console.log(`Hasil Verifikasi Akhir:`);
  console.log(`- Total transaksi di Firestore: ${verifySnap.size}`);
  console.log(`- Transaksi yang sudah valid memiliki categoryId: ${verifiedCount}`);
  console.log(`- Transaksi yang belum memiliki categoryId: ${missingCatId}`);

  if (missingCatId === 0 && verifiedCount === verifySnap.size) {
    console.log('\nSEMUA TRANSAKSI DI FIRESTORE BERHASIL DIPERBARUI DENGAN CATEGORYID SECARA SEMPURNA (100%)!');
  } else {
    console.warn('\nAda dokumen transaksi yang belum memiliki categoryId!');
  }

  process.exit(0);
}

runMigration().catch((err) => {
  console.error('Terjadi kesalahan selama migrasi:', err);
  process.exit(1);
});
