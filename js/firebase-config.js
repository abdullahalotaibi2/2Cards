// Firebase configuration for 22Card
// REPLACE this with your actual Firebase project configuration from the Firebase Console!

export const firebaseConfig = {
  apiKey: "AIzaSyBg7RrY2lUnSVw6QAJrT2DsJrOYZ-Q79nc",
  authDomain: "cards-bcd5a.firebaseapp.com",
  projectId: "cards-bcd5a",
  storageBucket: "cards-bcd5a.firebasestorage.app",
  messagingSenderId: "396020048296",
  appId: "1:396020048296:web:5411c04b15e48583583d9d",
  measurementId: "G-6TQHSR4D9D"
};

// Check if developer has overridden config via localStorage (useful for debugging/local testing before deployment)
const localConfig = localStorage.getItem("firebase_config_override");
const activeConfig = localConfig ? JSON.parse(localConfig) : firebaseConfig;

// Initialize Firebase services and export
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  getFirestore,
  enableIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

let app;
if (getApps().length === 0) {
  app = initializeApp(activeConfig);
} else {
  app = getApps()[0];
}

export const auth = getAuth(app);

// Keep login session after refresh (localStorage)
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn("Auth persistence setup failed:", err);
});

export const db = getFirestore(app);

// Cache Firestore reads/writes offline — data survives refresh
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code === "failed-precondition") {
    console.warn("Firestore persistence: only one tab can use offline cache.");
  } else if (err.code === "unimplemented") {
    console.warn("Firestore persistence not supported in this browser.");
  } else {
    console.warn("Firestore persistence failed:", err);
  }
});

export const storage = getStorage(app);
export default app;
