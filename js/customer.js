// customer.js - Customer Portal Controller
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as authSignOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";
import {
  saveCustomerCache,
  loadCustomerCache,
  clearCustomerCache,
  saveLastCafeId
} from "./persistence.js";
import { buildCustomerScanPayload } from "./scan-code.js";

// DOM - Navigation/Structure Panels
const loader = document.getElementById("loader");
const appContainer = document.getElementById("app");
const errorScreen = document.getElementById("error-screen");
const cafeLogoPlaceholder = document.getElementById("cafe-logo-placeholder");
const cafeLogoImg = document.getElementById("cafe-logo-img");
const cafeNameEl = document.getElementById("cafe-name");

// DOM - Authentication Panels
const authPanel = document.getElementById("customer-auth-panel");
const toggleSignInBtn = document.getElementById("toggle-signin-btn");
const toggleSignUpBtn = document.getElementById("toggle-signup-btn");
const signInForm = document.getElementById("customer-signin-form");
const signUpForm = document.getElementById("customer-signup-form");
const authError = document.getElementById("customer-auth-error");

const signinEmail = document.getElementById("signin-email");
const signinPassword = document.getElementById("signin-password");
const signupEmail = document.getElementById("signup-email");
const signupPassword = document.getElementById("signup-password");

// DOM - Card Panels
const cardPanel = document.getElementById("customer-card-panel");
const rewardDescription = document.getElementById("reward-description");
const stampsGrid = document.getElementById("stamps-grid");
const progressBarFill = document.getElementById("progress-bar-fill");
const stampsStatusLabel = document.getElementById("stamps-status-label");
const rewardEarnedContainer = document.getElementById("reward-earned-container");
const customerEmailDisplay = document.getElementById("customer-email-display");
const customerLogoutBtn = document.getElementById("customer-logout-btn");
const customerQrWrap = document.getElementById("customer-qr-wrap");
const scanSuccessToast = document.getElementById("scan-success-toast");
const scanToastMessage = document.getElementById("scan-toast-message");

// Global states
let cafeSlug = "";
let cafeData = null;
let unsubCardListener = null;
let customerQrInstance = null;
let lastSeenScanId = null;
let scanNotificationsReady = false;
let scanToastTimer = null;

// ================= 1. URL ID PROCESSING =================
function getCafeSlugFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id")?.trim();
}

function getCachedOrNull(uid) {
  const cached = loadCustomerCache(cafeSlug, uid);
  if (!cached || cached.cafeId !== cafeSlug) return null;
  return cached;
}

// Load Cafe configurations & skins
async function initializeCustomerPortal() {
  cafeSlug = getCafeSlugFromUrl();

  if (!cafeSlug) {
    showErrorScreen();
    return;
  }

  saveLastCafeId(cafeSlug);

  try {
    const docRef = doc(db, "cafes", cafeSlug);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      cafeData = docSnap.data();
      applyBranding(cafeData);
      observeCustomerSession();
    } else {
      showErrorScreen();
    }
  } catch (err) {
    console.error("Failed to load cafe details:", err);
    showErrorScreen();
  }
}

function applyBranding(data) {
  const root = document.documentElement;
  const theme = data.theme || {};

  if (theme.primaryColor) root.style.setProperty("--primary-color", theme.primaryColor);
  if (theme.secondaryColor) root.style.setProperty("--secondary-color", theme.secondaryColor);
  if (theme.bgColor) root.style.setProperty("--bg-color", theme.bgColor);
  if (theme.textColor) root.style.setProperty("--text-color", theme.textColor);

  cafeNameEl.textContent = data.name;
  rewardDescription.textContent = data.cardSettings?.rewardDescription || "Free Loyalty Reward!";

  if (theme.logoUrl) {
    cafeLogoImg.src = theme.logoUrl;
    cafeLogoImg.classList.remove("hidden");
    cafeLogoPlaceholder.classList.add("hidden");
  } else {
    cafeLogoPlaceholder.textContent = data.name.charAt(0).toUpperCase();
    cafeLogoPlaceholder.classList.remove("hidden");
    cafeLogoImg.classList.add("hidden");
  }
}

// ================= 2. AUTH STATE TRACKER =================
function observeCustomerSession() {
  onAuthStateChanged(auth, async (user) => {
    if (unsubCardListener) {
      unsubCardListener();
      unsubCardListener = null;
    }

    if (!user) {
      cardPanel.classList.add("hidden");
      authPanel.classList.remove("hidden");
      hideLoader();
      return;
    }

    // Show saved card immediately on refresh while Firestore loads
    const cached = loadCustomerCache(cafeSlug, user.uid);
    if (cached && cached.cafeId === cafeSlug) {
      showCardShell(user);
      renderStampCard(cached);
      hideLoader();
    }

    const custDocRef = doc(db, "customers", user.uid);

    try {
      const custSnap = await getDoc(custDocRef);

      if (custSnap.exists()) {
        const customerData = custSnap.data();

        if (customerData.cafeId !== cafeSlug) {
          console.warn("Tenant Mismatch. Logging customer out.");
          showAuthError(
            `This account is registered for another cafe. Please create a new account for ${cafeData.name}.`
          );
          await authSignOut(auth);
          return;
        }

        saveCustomerCache(cafeSlug, user.uid, customerData);
        startCardRealTimeListener(user);
        return;
      }

      // Auth exists but Firestore doc missing — restore stamps from local backup
      const restoredStamps = cached?.stampsCount ?? 0;
      const newCustomer = {
        uid: user.uid,
        email: user.email,
        cafeId: cafeSlug,
        stampsCount: restoredStamps,
        createdAt: serverTimestamp()
      };

      await setDoc(custDocRef, newCustomer);
      const verified = await getDoc(custDocRef);
      if (!verified.exists()) {
        throw new Error("Could not save your account. Please try again.");
      }

      saveCustomerCache(cafeSlug, user.uid, verified.data());
      startCardRealTimeListener(user);
    } catch (err) {
      console.error("Session restore failed:", err);

      if (cached && cached.cafeId === cafeSlug) {
        showCardShell(user);
        renderStampCard(cached);
        hideLoader();
        showAuthError("Saved offline — reconnecting to sync your stamps...");
        startCardRealTimeListener(user);
        return;
      }

      showAuthError("Database access error: " + err.message);
      hideLoader();
    }
  });
}

function showCardShell(user) {
  authPanel.classList.add("hidden");
  cardPanel.classList.remove("hidden");
  customerEmailDisplay.textContent = user.email || cachedEmailFallback(user.uid);
}

function cachedEmailFallback(uid) {
  const c = loadCustomerCache(cafeSlug, uid);
  return c?.email || "...";
}

function renderCustomerQR(user) {
  if (!customerQrWrap || typeof QRCode === "undefined") return;

  const payload = buildCustomerScanPayload(cafeSlug, user.uid);
  customerQrWrap.innerHTML = "";

  customerQrInstance = new QRCode(customerQrWrap, {
    text: payload,
    width: 168,
    height: 168,
    colorDark: "#0b0f19",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.H
  });
}

function showScanSuccessToast(stampsCount) {
  if (!scanSuccessToast) return;

  const total = cafeData?.cardSettings?.totalStamps || 8;
  scanToastMessage.textContent = `أُضيف طابع واحد — لديك الآن ${stampsCount} / ${total}`;
  scanSuccessToast.classList.remove("hidden");

  if (scanToastTimer) clearTimeout(scanToastTimer);
  scanToastTimer = setTimeout(() => {
    scanSuccessToast.classList.add("hidden");
  }, 6000);
}

function handleScanNotification(custData) {
  const scanId = custData.lastScanId;
  if (!scanId) return;

  if (scanNotificationsReady && scanId !== lastSeenScanId) {
    showScanSuccessToast(custData.stampsCount || 0);
    cardPanel.classList.add("stamp-pulse");
    setTimeout(() => cardPanel.classList.remove("stamp-pulse"), 800);
  }

  lastSeenScanId = scanId;
  scanNotificationsReady = true;
}

function startCardRealTimeListener(user) {
  showCardShell(user);
  renderCustomerQR(user);

  unsubCardListener = onSnapshot(
    doc(db, "customers", user.uid),
    (docSnap) => {
      if (!docSnap.exists()) return;
      const custData = docSnap.data();

      if (custData.cafeId !== cafeSlug) return;

      saveCustomerCache(cafeSlug, user.uid, custData);
      renderStampCard(custData);
      handleScanNotification(custData);
      hideLoader();
      authError.classList.add("hidden");
    },
    (err) => {
      console.error("Stamps listener error:", err);
      const cached = loadCustomerCache(cafeSlug, user.uid);
      if (cached) {
        renderStampCard(cached);
        hideLoader();
        showAuthError("Showing saved stamps — sync will resume when online.");
      } else {
        showAuthError("Database access error: " + err.message);
      }
    }
  );
}

// ================= 3. RENDER LOYALTY GRID =================
function renderStampCard(custData) {
  stampsGrid.innerHTML = "";
  const currentStamps = custData.stampsCount || 0;
  const cardSettings = cafeData?.cardSettings || {};
  const total = cardSettings.totalStamps || 8;
  const icon = cardSettings.stampIcon || "☕";

  for (let i = 1; i <= total; i++) {
    const slot = document.createElement("div");
    slot.classList.add("stamp-slot");

    if (i <= currentStamps) {
      slot.classList.add("stamped");
      slot.textContent = icon;
    } else {
      slot.textContent = i;
    }
    stampsGrid.appendChild(slot);
  }

  const progressPercent = Math.min(100, (currentStamps / total) * 100);
  progressBarFill.style.width = `${progressPercent}%`;
  stampsStatusLabel.textContent = `${currentStamps} / ${total} Stamps Collected`;

  if (currentStamps >= total) {
    rewardEarnedContainer.classList.remove("hidden");
  } else {
    rewardEarnedContainer.classList.add("hidden");
  }
}

// ================= 4. AUTH ACTION HANDLERS =================
toggleSignInBtn.addEventListener("click", () => {
  toggleSignInBtn.classList.add("active");
  toggleSignUpBtn.classList.remove("active");
  signInForm.classList.remove("hidden");
  signUpForm.classList.add("hidden");
  authError.classList.add("hidden");
});

toggleSignUpBtn.addEventListener("click", () => {
  toggleSignUpBtn.classList.add("active");
  toggleSignInBtn.classList.remove("active");
  signUpForm.classList.remove("hidden");
  signInForm.classList.add("hidden");
  authError.classList.add("hidden");
});

signInForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  authError.classList.add("hidden");
  showLoaderOverlay();

  const email = signinEmail.value.trim();
  const password = signinPassword.value;

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    console.error(err);
    hideLoader();
    showAuthError("Login Failed: " + err.message);
  }
});

signUpForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  authError.classList.add("hidden");
  showLoaderOverlay();

  const email = signupEmail.value.trim();
  const password = signupPassword.value;

  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    const uid = credential.user.uid;

    const customerRecord = {
      uid,
      email,
      cafeId: cafeSlug,
      stampsCount: 0,
      createdAt: serverTimestamp()
    };

    // Save locally first so refresh right after signup still shows the account
    saveCustomerCache(cafeSlug, uid, customerRecord);

    await setDoc(doc(db, "customers", uid), customerRecord);

    const verified = await getDoc(doc(db, "customers", uid));
    if (!verified.exists()) {
      throw new Error("Registration saved locally but cloud sync failed. Refresh to retry.");
    }

    saveCustomerCache(cafeSlug, uid, verified.data());
  } catch (err) {
    console.error(err);
    hideLoader();
    showAuthError("Registration Failed: " + err.message);
  }
});

customerLogoutBtn.addEventListener("click", async () => {
  showLoaderOverlay();
  const uid = auth.currentUser?.uid;
  try {
    await authSignOut(auth);
    if (uid) clearCustomerCache(cafeSlug, uid);
  } catch (err) {
    console.error("Sign out failed:", err);
  } finally {
    hideLoader();
  }
});

// ================= UI HELPERS =================
function showLoaderOverlay() {
  loader.classList.remove("hidden");
}

function hideLoader() {
  loader.classList.add("hidden");
  appContainer.classList.remove("hidden");
}

function showErrorScreen() {
  loader.classList.add("hidden");
  appContainer.classList.add("hidden");
  errorScreen.classList.remove("hidden");
}

function showAuthError(msg) {
  authError.textContent = msg;
  authError.classList.remove("hidden");
}

window.addEventListener("DOMContentLoaded", initializeCustomerPortal);
