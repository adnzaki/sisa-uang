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
    console.log('TOTAL USERS IN FIRESTORE:', usersSnap.size);
    usersSnap.forEach(d => {
      const data = d.data();
      if (data.isPro || data.subscriptionStatus === 'pro' || data.subscriptionStatus === 'pending') {
        console.log('PRO/PENDING USER:', d.id, data.email, data.username, data.isPro, data.subscriptionStatus, data.subscriptionExpiresAt);
      }
    });
  } catch (err: any) {
    console.error('Error reading Firestore:', err);
  }
  process.exit(0);
}

check();
