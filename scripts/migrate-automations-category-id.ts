import fs from 'fs';
import path from 'path';
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

interface AutomationDoc {
  id: string;
  ownerId?: string;
  name?: string;
  category?: string;
  categoryId?: string;
  type?: string;
  amount?: number;
}

async function runAutomationMigration() {
  console.log('--- Memulai Migrasi categoryId pada Koleksi Automations (Transaksi Otomatis) ---');

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

  function findMatchingCategory(ruleOwner: string, catName: string, ruleType?: string): CategoryDoc | null {
    const cleanLower = (catName || '').trim().toLowerCase();
    if (!cleanLower) return null;

    const userList = userCatsByOwner[ruleOwner] || [];

    // Prioritas 1: Kategori milik user yang cocok nama dan tipenya (expense/income)
    let match = userList.find(
      (c) => c.name.trim().toLowerCase() === cleanLower && (!ruleType || ruleType === 'transfer' || c.type === ruleType)
    );
    if (match) return match;

    // Prioritas 2: Kategori milik user yang cocok nama (apapun tipenya)
    match = userList.find((c) => c.name.trim().toLowerCase() === cleanLower);
    if (match) return match;

    // Prioritas 3: Kategori bawaan (default) yang cocok nama dan tipenya
    match = defaultCats.find(
      (c) => c.name.trim().toLowerCase() === cleanLower && (!ruleType || ruleType === 'transfer' || c.type === ruleType)
    );
    if (match) return match;

    // Prioritas 4: Kategori bawaan (default) yang cocok nama (apapun tipenya)
    match = defaultCats.find((c) => c.name.trim().toLowerCase() === cleanLower);
    if (match) return match;

    return null;
  }

  // 3. Load Automations from Firestore
  console.log('Mengambil seluruh dokumen transaksi otomatis (automations) dari Firestore...');
  const autoSnap = await getDocs(collection(db, 'automations'));
  console.log(`Ditemukan ${autoSnap.size} dokumen pada koleksi automations.`);

  const updateList: {
    autoId: string;
    categoryId: string;
    category: string;
    ruleName: string;
    ownerId: string;
    currentCategoryId?: string;
  }[] = [];
  let alreadyUpToDate = 0;
  let unmatchedCount = 0;
  const unmatchedList: any[] = [];

  autoSnap.forEach((d) => {
    const item = { id: d.id, ...d.data() } as AutomationDoc;
    const catName = (item.category || '').trim();
    const ownerId = item.ownerId || '';
    const ruleType = item.type;

    const matched = findMatchingCategory(ownerId, catName, ruleType);
    if (!matched) {
      unmatchedCount++;
      unmatchedList.push({ id: item.id, ownerId, name: item.name, category: catName, type: ruleType });
      return;
    }

    if (item.categoryId === matched.id) {
      alreadyUpToDate++;
    } else {
      updateList.push({
        autoId: item.id,
        categoryId: matched.id,
        category: catName,
        ruleName: item.name || '',
        ownerId,
        currentCategoryId: item.categoryId,
      });
    }
  });

  console.log(`Statistik Awal Automations:`);
  console.log(`- Automations sudah memiliki categoryId yang tepat: ${alreadyUpToDate}`);
  console.log(`- Automations perlu diperbarui dengan categoryId: ${updateList.length}`);
  console.log(`- Automations tidak cocok: ${unmatchedCount}`);

  if (unmatchedCount > 0) {
    console.error('PERINGATAN: Ditemukan otomatisasi yang tidak dapat dicocokkan dengan kategori:', unmatchedList);
    process.exit(1);
  }

  if (updateList.length === 0) {
    console.log('Semua dokumen transaksi otomatis sudah memiliki categoryId yang tepat. Tidak ada yang perlu diperbarui.');
    process.exit(0);
  }

  // 4. Pre-flight Check (Uji Coba 1 Dokumen)
  console.log('\nMelakukan uji coba (pre-flight check) 1 dokumen ke Firestore...');
  const testItem = updateList[0];
  const testRef = doc(db, 'automations', testItem.autoId);
  try {
    const testBatch = writeBatch(db);
    testBatch.update(testRef, {
      categoryId: testItem.categoryId,
      updatedAt: serverTimestamp(),
    });
    await testBatch.commit();
    console.log(`✓ Pre-flight check BERHASIL: Firestore Rules mengizinkan penulisan field categoryId pada koleksi automations.`);
  } catch (testErr: any) {
    if (testErr.code === 'permission-denied' || testErr.message?.includes('PERMISSION_DENIED')) {
      console.error('\n================================================================================');
      console.error('❌ GAGAL: ATURAN SECURITY RULES DI FIREBASE CLOUD BELUM DI-UPDATE / DIPUBLIKASI');
      console.error('================================================================================');
      console.error('Penyebab:');
      console.error('Firestore Security Rules di server Firebase (Google Cloud) saat ini masih versi lama.');
      console.error('Pada versi lama, skema fungsi "isValidAutomation" memiliki daftar whitelist:');
      console.error('data.keys().hasOnly([...]) yang BELUM mendaftarkan field "categoryId".');
      console.error('Oleh karena itu, server Firestore menolak penulisan field "categoryId" pada automations.\n');
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
  const remainingUpdates = updateList.filter((item) => item.autoId !== testItem.autoId);
  if (remainingUpdates.length > 0) {
    console.log(`\nMemulai pembaruan ${remainingUpdates.length} transaksi otomatis berikutnya dalam batch...`);
    const BATCH_SIZE = 400;
    const totalBatches = Math.ceil(remainingUpdates.length / BATCH_SIZE);
    let processedCount = 1;

    for (let i = 0; i < remainingUpdates.length; i += BATCH_SIZE) {
      const chunk = remainingUpdates.slice(i, i + BATCH_SIZE);
      const batchIndex = Math.floor(i / BATCH_SIZE) + 1;
      const batch = writeBatch(db);

      for (const item of chunk) {
        const autoRef = doc(db, 'automations', item.autoId);
        batch.update(autoRef, {
          categoryId: item.categoryId,
          updatedAt: serverTimestamp(),
        });
      }

      await batch.commit();
      processedCount += chunk.length;
      console.log(`Batch ${batchIndex}/${totalBatches} berhasil disimpan (${chunk.length} otomatisasi). Total selesai: ${processedCount}/${updateList.length}`);
    }
  }

  // 6. Sinkronkan juga file cache server lokal (.sisa_uang_automations_cache.json) jika ada
  const cacheFilePath = path.join(process.cwd(), '.sisa_uang_automations_cache.json');
  if (fs.existsSync(cacheFilePath)) {
    try {
      const raw = fs.readFileSync(cacheFilePath, 'utf8');
      const cacheList = JSON.parse(raw);
      if (Array.isArray(cacheList)) {
        let cacheUpdated = 0;
        for (const item of cacheList) {
          const match = updateList.find((u) => u.autoId === item.id);
          if (match) {
            item.categoryId = match.categoryId;
            cacheUpdated++;
          }
        }
        if (cacheUpdated > 0) {
          fs.writeFileSync(cacheFilePath, JSON.stringify(cacheList, null, 2), 'utf8');
          console.log(`✓ File cache server (.sisa_uang_automations_cache.json) juga berhasil diselaraskan (${cacheUpdated} item diperbarui).`);
        }
      }
    } catch {
      // Ignore cache file update error
    }
  }

  // 7. Verifikasi Akhir
  console.log('\nMelakukan verifikasi akhir pada koleksi automations di Firestore...');
  const verifySnap = await getDocs(collection(db, 'automations'));
  let verifiedCount = 0;
  let missingCategoryIdCount = 0;

  verifySnap.forEach((d) => {
    const data = d.data();
    if (data.categoryId) {
      verifiedCount++;
      console.log(`✓ [${d.id}] "${data.name}" (${data.category}) -> categoryId: ${data.categoryId}`);
    } else {
      missingCategoryIdCount++;
      console.warn(`✗ [${d.id}] "${data.name}" (${data.category}) -> belum memiliki categoryId`);
    }
  });

  console.log('\n================ HASIL MIGRASI AUTOMATIONS ================');
  console.log(`Total Automations Berhasil Memiliki categoryId: ${verifiedCount}`);
  console.log(`Automations yang Masih Kurang categoryId: ${missingCategoryIdCount}`);
  console.log('===========================================================');

  if (missingCategoryIdCount === 0) {
    console.log('Migrasi categoryId pada koleksi automations SELESAI DENGAN SEMPURNA! ✓');
  } else {
    console.error('Masih ada otomatisasi yang belum terisi categoryId.');
  }

  process.exit(0);
}

runAutomationMigration().catch((err) => {
  console.error('Terjadi kesalahan selama migrasi automations:', err);
  process.exit(1);
});
