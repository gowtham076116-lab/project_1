import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Exact Firebase configuration from Hive City user-facing site
export const HIVE_FIREBASE_CONFIG = {
  apiKey: "AIzaSyDm1OW7KxPv_y9ZziQL-HK-_4YIJjxfqpY",
  authDomain: "hivecity-32eb6.firebaseapp.com",
  projectId: "hivecity-32eb6",
  storageBucket: "hivecity-32eb6.firebasestorage.app",
  messagingSenderId: "496535782790",
  appId: "1:496535782790:web:1d886dbecaa87f41cc9807",
  measurementId: "G-V4BN1N4XZJ",
};

export const app = !getApps().length ? initializeApp(HIVE_FIREBASE_CONFIG) : getApp();
export const auth = getAuth(app);
export const db = getFirestore(app);
