import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: "AIzaSyAcDCdC5eMraPo7hwGKhojXb8EnONZWiH0",
  authDomain: "print3d-manager-73846.firebaseapp.com",
  projectId: "print3d-manager-73846",
  storageBucket: "print3d-manager-73846.firebasestorage.app",
  messagingSenderId: "534221073184",
  appId: "1:534221073184:web:4f2e0cfda14ff4fd514545",
  measurementId: "G-C0SREN7R2Y"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);
export const googleProvider = new GoogleAuthProvider();

// Enable offline persistence
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code === 'failed-precondition') {
    console.warn('Firestore: Multiple tabs open. Persistence disabled.');
  } else if (err.code === 'unimplemented') {
    console.warn('Firestore: Browser does not support persistence.');
  }
});
