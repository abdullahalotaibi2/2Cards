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
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

let app;
if (getApps().length === 0) {
  app = initializeApp(activeConfig);
} else {
  app = getApps()[0];
}

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;
