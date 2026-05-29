// customer.js - Customer Portal Controller
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut as authSignOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";

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

// Global states
let cafeSlug = "";
let cafeData = null;
let unsubCardListener = null;

// ================= 1. URL ID PROCESSING =================
function getCafeSlugFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id")?.trim(); // Matches ?id=cafe-slug
}

// Load Cafe configurations & skins
async function initializeCustomerPortal() {
  cafeSlug = getCafeSlugFromUrl();
  
  if (!cafeSlug) {
    showErrorScreen();
    return;
  }

  try {
    const docRef = doc(db, "cafes", cafeSlug);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      cafeData = docSnap.data();
      applyBranding(cafeData);
      
      // Hook up Auth Observer once Tenant configuration is confirmed
      observeCustomerSession();
    } else {
      showErrorScreen();
    }
  } catch (err) {
    console.error("Failed to load cafe details:", err);
    showErrorScreen();
  }
}

// Inject Firestore styles into DOM CSS variables
function applyBranding(data) {
  const root = document.documentElement;
  const theme = data.theme || {};

  // Custom variables updates
  if (theme.primaryColor) root.style.setProperty("--primary-color", theme.primaryColor);
  if (theme.secondaryColor) root.style.setProperty("--secondary-color", theme.secondaryColor);
  if (theme.bgColor) root.style.setProperty("--bg-color", theme.bgColor);
  if (theme.textColor) root.style.setProperty("--text-color", theme.textColor);

  // Set titles
  cafeNameEl.textContent = data.name;
  rewardDescription.textContent = data.cardSettings?.rewardDescription || "Free Loyalty Reward!";

  // Logo rendering
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
    // Unsubscribe from previous updates if any
    if (unsubCardListener) {
      unsubCardListener();
      unsubCardListener = null;
    }

    if (!user) {
      // Show Authentication card
      cardPanel.classList.add("hidden");
      authPanel.classList.remove("hidden");
      hideLoader();
    } else {
      // Validate customer scoping
      const custDocRef = doc(db, "customers", user.uid);
      const custSnap = await getDoc(custDocRef);

      if (custSnap.exists()) {
        const customerData = custSnap.data();
        
        // Multi-tenant check: email credentials matching this specific cafe scope only
        if (customerData.cafeId !== cafeSlug) {
          console.warn("Tenant Mismatch. Logging customer out.");
          showAuthError(`This account is registered for another cafe. Please create a new account for ${cafeData.name}.`);
          await authSignOut(auth);
          return;
        }

        // Correctly scoped tenant, initialize card listener
        startCardRealTimeListener(user);
      } else {
        // Handle scenario where Auth user exists but Firestore customer document is missing. Create it.
        try {
          await setDoc(custDocRef, {
            uid: user.uid,
            email: user.email,
            cafeId: cafeSlug,
            stampsCount: 0,
            createdAt: new Date()
          });
          startCardRealTimeListener(user);
        } catch (err) {
          console.error("Firestore customer account creation failed:", err);
          showAuthError("Database access error: " + err.message);
          await authSignOut(auth);
        }
      }
    }
  });
}

// Start listener for real-time stamp updates
function startCardRealTimeListener(user) {
  authPanel.classList.add("hidden");
  cardPanel.classList.remove("hidden");
  customerEmailDisplay.textContent = user.email;

  unsubCardListener = onSnapshot(doc(db, "customers", user.uid), (docSnap) => {
    if (!docSnap.exists()) return;
    const custData = docSnap.data();
    renderStampCard(custData);
    hideLoader();
  }, (err) => {
    console.error("Stamps listener error:", err);
    showAuthError("Database Access Error: " + err.message);
  });
}

// ================= 3. RENDER LOYALTY GRID =================
function renderStampCard(custData) {
  stampsGrid.innerHTML = "";
  const currentStamps = custData.stampsCount || 0;
  const cardSettings = cafeData.cardSettings || {};
  const total = cardSettings.totalStamps || 8;
  const icon = cardSettings.stampIcon || "☕";

  // Build stamp node elements
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

  // Progress Bar rendering
  const progressPercent = Math.min(100, (currentStamps / total) * 100);
  progressBarFill.style.width = `${progressPercent}%`;
  stampsStatusLabel.textContent = `${currentStamps} / ${total} Stamps Collected`;

  // Check reward availability
  if (currentStamps >= total) {
    rewardEarnedContainer.classList.remove("hidden");
  } else {
    rewardEarnedContainer.classList.add("hidden");
  }
}

// ================= 4. AUTH ACTION HANDLERS =================
// Form Toggling
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

// Login submission
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

// Register submission
signUpForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  authError.classList.add("hidden");
  showLoaderOverlay();

  const email = signupEmail.value.trim();
  const password = signupPassword.value;

  try {
    // 1. Create Auth user
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    const uid = credential.user.uid;

    // 2. Add customer scoped document to database
    await setDoc(doc(db, "customers", uid), {
      uid: uid,
      email: email,
      cafeId: cafeSlug,
      stampsCount: 0,
      createdAt: new Date()
    });
  } catch (err) {
    console.error(err);
    hideLoader();
    showAuthError("Registration Failed: " + err.message);
  }
});

// Logout Handler
customerLogoutBtn.addEventListener("click", async () => {
  showLoaderOverlay();
  try {
    await authSignOut(auth);
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

// Execute initializers
window.addEventListener("DOMContentLoaded", initializeCustomerPortal);
