import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const USERS_CACHE_FILE = path.join(__dirname, '..', '.sisa_uang_users_cache.json');

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
const auth = getAuth(app);

function toIso(val: any): string {
  if (!val) return new Date().toISOString();
  if (typeof val === 'string') return val;
  if (typeof val.toDate === 'function') return val.toDate().toISOString();
  if (typeof val.seconds === 'number') return new Date(val.seconds * 1000).toISOString();
  return new Date().toISOString();
}

async function sync() {
  try {
    await signInWithEmailAndPassword(auth, 'vuedevo@gmail.com', '@Dienzaki2019##');
    console.log('Firebase auth authenticated as super admin');
  } catch (err: any) {
    console.log('Auth login:', err?.message || err);
  }

  try {
    const snap = await getDocs(collection(db, 'users'));
    console.log(`Read ${snap.size} users from Firestore.`);

    const userList: any[] = [];
    snap.forEach((d) => {
      const data = d.data();
      const isPro = Boolean(data.isPro === true || data.subscriptionStatus === 'pro');
      userList.push({
        uid: d.id,
        username: data.username || String(data.email || d.id).split('@')[0],
        email: data.email || `${d.id}@sisa-uang.id`,
        displayName: data.displayName || data.username || d.id,
        role: data.role === 'admin' || data.email === 'vuedevo@gmail.com' ? 'admin' : 'user',
        status: data.status === 'blocked' ? 'blocked' : 'active',
        authProvider: data.authProvider || 'password',
        currency: data.currency || 'IDR',
        subscriptionStatus: isPro ? 'pro' : data.subscriptionStatus === 'pending' ? 'pending' : 'free',
        isPro,
        isExplicitlyDeactivated: Boolean(data.isExplicitlyDeactivated),
        subscriptionPlan: isPro ? data.subscriptionPlan || 'yearly' : null,
        subscriptionExpiresAt: isPro ? data.subscriptionExpiresAt || null : null,
        passwordHash: data.passwordHash || undefined,
        createdAt: toIso(data.createdAt),
        updatedAt: toIso(data.updatedAt),
      });
    });

    // Ensure super admin vuedevo is present
    const hasSuperAdmin = userList.some((u) => u.email === 'vuedevo@gmail.com');
    if (!hasSuperAdmin) {
      userList.unshift({
        uid: 'admin_vuedevo_01',
        username: 'dark.notes',
        email: 'vuedevo@gmail.com',
        displayName: 'dark.notes',
        role: 'admin',
        status: 'active',
        authProvider: 'password',
        currency: 'IDR',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    fs.writeFileSync(USERS_CACHE_FILE, JSON.stringify(userList, null, 2), 'utf8');
    console.log(`Successfully wrote ${userList.length} users to ${USERS_CACHE_FILE}`);
  } catch (err: any) {
    console.error('Error syncing Firestore users to cache file:', err);
  }
  process.exit(0);
}

sync();
