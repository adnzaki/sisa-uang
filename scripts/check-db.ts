import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
const auth = getAuth(app);

async function check() {
  try {
    await signInWithEmailAndPassword(auth, 'vuedevo@gmail.com', '@Dienzaki2019##');
    console.log('Signed in as super admin');
  } catch (err: any) {
    console.log('Sign in failed:', err.message);
  }

  try {
    const usersSnap = await getDocs(collection(db, 'users'));
    console.log('--- USERS IN FIRESTORE (' + usersSnap.size + ') ---');
    usersSnap.forEach(d => {
      const data = d.data();
      console.log('ID:', d.id, 'username:', data.username, 'email:', data.email, 'role:', data.role, 'hasPasswordHash:', Boolean(data.passwordHash), 'hashPreview:', data.passwordHash ? data.passwordHash.slice(0, 15) : 'none');
    });

    const walletsSnap = await getDocs(collection(db, 'wallets'));
    console.log('--- WALLETS (' + walletsSnap.size + ') ---');
    walletsSnap.forEach(d => {
      const data = d.data();
      console.log('ID:', d.id, 'ownerId:', data.ownerId, 'name:', data.name, 'balance:', data.balance, 'deleted:', data.deleted);
    });

    const txSnap = await getDocs(collection(db, 'transactions'));
    console.log('--- TRANSACTIONS (' + txSnap.size + ') ---');
    txSnap.forEach(d => {
      const data = d.data();
      console.log('ID:', d.id, 'ownerId:', data.ownerId, 'type:', data.type, 'amount:', data.amount, 'category:', data.category, 'walletId:', data.walletId, 'deleted:', data.deleted);
    });
  } catch (err: any) {
    console.error('Error reading Firestore:', err);
  }
  process.exit(0);
}

check();
