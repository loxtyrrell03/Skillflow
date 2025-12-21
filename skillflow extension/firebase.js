import { initializeApp } from "./vendor/firebase-app.js";
import { getAuth, setPersistence, browserLocalPersistence } from "./vendor/firebase-auth.js";
import { getFirestore } from "./vendor/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAMyUlfqqOlnt-kHO-C-vB_rzJ-9eudxck",
  authDomain: "chessstudyplanner.firebaseapp.com",
  projectId: "chessstudyplanner",
  storageBucket: "chessstudyplanner.firebasestorage.app",
  messagingSenderId: "73363049381",
  appId: "1:73363049381:web:48da4a1e06b9744fccf64c",
  measurementId: "G-8PE090JLZH"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch(() => {});
const db = getFirestore(app);

export { app, auth, db };
