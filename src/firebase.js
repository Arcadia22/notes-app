import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyCgpE3UevIc6ctB4Q0fal-SppOKca2pkWE",
  authDomain: "chaosmanager-toolbox.firebaseapp.com",
  projectId: "chaosmanager-toolbox",
  storageBucket: "chaosmanager-toolbox.firebasestorage.app",
  messagingSenderId: "434149566011",
  appId: "1:434149566011:web:e7597545daa970d0355e1e"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
export const storage = getStorage(app);