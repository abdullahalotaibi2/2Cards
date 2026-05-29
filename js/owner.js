// owner.js - Cafe Owner Controller
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut as authSignOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, updateDoc, collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";

// DOM - Auth Views
const authContainer = document.getElementById("owner-auth-container");
const dashboardContainer = document.getElementById("owner-dashboard-container");
const loginForm = document.getElementById("owner-login-form");
const loginEmail = document.getElementById("login-email");
const loginPassword = document.getElementById("login-password");
const loginSubmitBtn = document.getElementById("login-submit-btn");
const loginSpinner = document.getElementById("login-spinner");
const authError = document.getElementById("auth-error");

// DOM - Navigation
const navCafeName = document.getElementById("nav-cafe-name");
const ownerEmailDisplay = document.getElementById("owner-email-display");
const ownerLogoutBtn = document.getElementById("owner-logout-btn");
const tabButtons = document.querySelectorAll(".tab-btn");
const tabPanels = document.querySelectorAll(".tab-panel");

// DOM - Overview Statistics
const statCustomers = document.getElementById("stat-customers");
const statStamps = document.getElementById("stat-stamps");
const statRewards = document.getElementById("stat-rewards");
const loyaltyUrlDisplay = document.getElementById("loyalty-url-display");
const copyUrlBtn = document.getElementById("copy-url-btn");

// DOM - Customization Form & Hex synchronizers
const brandingForm = document.getElementById("branding-form");
const themePrimary = document.getElementById("theme-primary");
const themePrimaryHex = document.getElementById("theme-primary-hex");
const themeSecondary = document.getElementById("theme-secondary");
const themeSecondaryHex = document.getElementById("theme-secondary-hex");
const themeBg = document.getElementById("theme-bg");
const themeBgHex = document.getElementById("theme-bg-hex");
const themeText = document.getElementById("theme-text");
const themeTextHex = document.getElementById("theme-text-hex");
const logoUrlInput = document.getElementById("logo-url-input");
const cardStampsTotal = document.getElementById("card-stamps-total");
const cardStampIcon = document.getElementById("card-stamp-icon");
const cardRewardDesc = document.getElementById("card-reward-desc");
const saveBrandingBtn = document.getElementById("save-branding-btn");
const saveSpinner = document.getElementById("save-spinner");

// DOM - Live Card Simulator elements
const liveFrame = document.getElementById("live-card-preview-frame");
const previewLogoPlace = document.getElementById("preview-logo-placeholder");
const previewLogoImg = document.getElementById("preview-logo-img");
const previewTitle = document.getElementById("preview-cafe-title");
const previewRewardText = document.getElementById("preview-reward-text");
const previewStampsGrid = document.getElementById("preview-stamps-grid");
const previewFooterTotal = document.getElementById("preview-footer-total");

// DOM - Customers Table
const customerSearchInput = document.getElementById("customer-search-input");
const customersTableBody = document.getElementById("customers-table-body");

// DOM - QR Code Portal
const qrTargetUrl = document.getElementById("qr-target-url");
const qrcodeDisplay = document.getElementById("qrcode-display");
const downloadQrBtn = document.getElementById("download-qr-btn");
const qrCafeLabel = document.getElementById("qr-cafe-label");

// Global State Variables
let currentCafe = null;
let currentCafeSlug = "";
let qrcodeInstance = null;
let allCustomers = [];

// ================= 1. AUTH STATE OBSERVER =================
onAuthStateChanged(auth, (user) => {
  if (user) {
    // Owner is authenticated, let's fetch their cafe details
    fetchCafeForOwner(user);
  } else {
    // Show login page
    dashboardContainer.classList.add("hidden");
    authContainer.classList.remove("hidden");
  }
});

// Login Form Submit handler
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  authError.classList.add("hidden");
  loginSubmitBtn.disabled = true;
  loginSpinner.classList.remove("hidden");

  const email = loginEmail.value.trim();
  const password = loginPassword.value;

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    console.error(err);
    authError.textContent = "Login Failed: " + err.message;
    authError.classList.remove("hidden");
  } finally {
    loginSubmitBtn.disabled = false;
    loginSpinner.classList.add("hidden");
  }
});

// Logout Button handler
ownerLogoutBtn.addEventListener("click", async () => {
  try {
    await authSignOut(auth);
    window.location.reload();
  } catch (err) {
    alert("Logout failed: " + err.message);
  }
});

// ================= 2. FETCH TENANT DATA =================
function fetchCafeForOwner(user) {
  const q = query(collection(db, "cafes"), where("ownerUid", "==", user.uid));
  
  onSnapshot(q, (snapshot) => {
    if (snapshot.empty) {
      authError.textContent = "No registered cafe found for this account. Contact Super Admin.";
      authError.classList.remove("hidden");
      authSignOut(auth);
      return;
    }

    const docSnap = snapshot.docs[0];
    currentCafe = docSnap.data();
    currentCafeSlug = docSnap.id;

    // Show Workspace Dashboard
    authContainer.classList.add("hidden");
    dashboardContainer.classList.remove("hidden");
    
    // Set Navigation Info
    navCafeName.textContent = currentCafe.name;
    ownerEmailDisplay.textContent = user.email;

    // Setup tabs, forms & live simulator
    initBrandingValues();
    updateLivePreview();
    setupLoyaltyLinks();
    setupCustomersListener();
  }, (err) => {
    console.error("Error fetching tenant document:", err);
    authError.textContent = "Database Access Error: " + err.message + ". Check your Firestore security rules.";
    authError.classList.remove("hidden");
    authSignOut(auth);
  });
}

// ================= 3. TABS SWAPPING =================
tabButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    // Remove active state
    tabButtons.forEach(b => b.classList.remove("active"));
    tabPanels.forEach(p => p.classList.remove("active-panel"));

    // Add active state to clicked tab
    btn.classList.add("active");
    const tabName = btn.dataset.tab;
    document.getElementById(`tab-${tabName}`).classList.add("active-panel");
    
    // Extra actions for specific tabs
    if (tabName === "qrcode") {
      generateQRCodePortal();
    }
  });
});

// ================= 4. BRANDING CUSTOMIZER & LIVE PREVIEW =================
function initBrandingValues() {
  const theme = currentCafe.theme || {};
  const settings = currentCafe.cardSettings || {};

  themePrimary.value = theme.primaryColor || "#f25c54";
  themePrimaryHex.value = theme.primaryColor || "#f25c54";
  themeSecondary.value = theme.secondaryColor || "#f8ad9d";
  themeSecondaryHex.value = theme.secondaryColor || "#f8ad9d";
  themeBg.value = theme.bgColor || "#0b0f19";
  themeBgHex.value = theme.bgColor || "#0b0f19";
  themeText.value = theme.textColor || "#ffffff";
  themeTextHex.value = theme.textColor || "#ffffff";

  logoUrlInput.value = theme.logoUrl || "";
  cardStampsTotal.value = settings.totalStamps || "8";
  cardStampIcon.value = settings.stampIcon || "☕";
  cardRewardDesc.value = settings.rewardDescription || "Free Reward!";
}

// Color Picker - Hex Text sync
function syncColor(picker, input) {
  picker.addEventListener("input", () => {
    input.value = picker.value;
    updateLivePreview();
  });
  input.addEventListener("input", () => {
    if(/^#[0-9A-F]{6}$/i.test(input.value)) {
      picker.value = input.value;
      updateLivePreview();
    }
  });
}

syncColor(themePrimary, themePrimaryHex);
syncColor(themeSecondary, themeSecondaryHex);
syncColor(themeBg, themeBgHex);
syncColor(themeText, themeTextHex);

logoUrlInput.addEventListener("input", updateLivePreview);
cardStampsTotal.addEventListener("change", updateLivePreview);
cardStampIcon.addEventListener("change", updateLivePreview);
cardRewardDesc.addEventListener("input", updateLivePreview);

function updateLivePreview() {
  const primaryVal = themePrimary.value;
  const secondaryVal = themeSecondary.value;
  const bgVal = themeBg.value;
  const textVal = themeText.value;
  const logoUrlVal = logoUrlInput.value.trim();
  const stampsCountVal = parseInt(cardStampsTotal.value);
  const stampIconVal = cardStampIcon.value;
  const rewardDescVal = cardRewardDesc.value;

  // Apply visual theme to preview frame wrapper
  liveFrame.style.backgroundColor = bgVal;
  liveFrame.style.color = textVal;

  previewTitle.textContent = currentCafe ? currentCafe.name : "My Cafe";
  previewRewardText.textContent = rewardDescVal || "Buy stamps and earn rewards!";
  previewFooterTotal.textContent = stampsCountVal;

  // Apply dynamic color classes to custom properties inside frame
  liveFrame.style.setProperty("--primary-color", primaryVal);
  liveFrame.style.setProperty("--secondary-color", secondaryVal);

  // Logo rendering
  if (logoUrlVal) {
    previewLogoImg.src = logoUrlVal;
    previewLogoImg.classList.remove("hidden");
    previewLogoPlace.classList.add("hidden");
  } else {
    previewLogoImg.classList.add("hidden");
    previewLogoPlace.classList.remove("hidden");
    const name = currentCafe ? currentCafe.name : "M";
    previewLogoPlace.textContent = name.charAt(0).toUpperCase();
  }

  // Draw Grid Mock
  previewStampsGrid.innerHTML = "";
  for (let i = 1; i <= stampsCountVal; i++) {
    const slot = document.createElement("div");
    slot.classList.add("preview-stamp");
    if (i <= 3) { // Mock 3 active stamps
      slot.classList.add("active");
      slot.textContent = stampIconVal;
      slot.style.backgroundColor = primaryVal;
      slot.style.borderColor = primaryVal;
    } else {
      slot.textContent = i;
    }
    previewStampsGrid.appendChild(slot);
  }
}

// Submit Brand settings to Firestore
brandingForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  saveBrandingBtn.disabled = true;
  saveSpinner.classList.remove("hidden");

  try {
    const docRef = doc(db, "cafes", currentCafeSlug);
    await updateDoc(docRef, {
      "theme.primaryColor": themePrimaryHex.value,
      "theme.secondaryColor": themeSecondaryHex.value,
      "theme.bgColor": themeBgHex.value,
      "theme.textColor": themeTextHex.value,
      "theme.logoUrl": logoUrlInput.value.trim(),
      "cardSettings.totalStamps": parseInt(cardStampsTotal.value),
      "cardSettings.stampIcon": cardStampIcon.value,
      "cardSettings.rewardDescription": cardRewardDesc.value.trim()
    });
    alert("Branding settings saved successfully!");
  } catch (err) {
    alert("Save failed: " + err.message);
  } finally {
    saveBrandingBtn.disabled = false;
    saveSpinner.classList.add("hidden");
  }
});

// ================= 5. URL COPIER & DATA INTEGRATION =================
function setupLoyaltyLinks() {
  const portalUrl = `${window.location.origin}${window.location.pathname.replace("dashboard.html", "cafe.html")}?id=${currentCafeSlug}`;
  loyaltyUrlDisplay.value = portalUrl;
  qrTargetUrl.textContent = portalUrl;
}

copyUrlBtn.addEventListener("click", () => {
  navigator.clipboard.writeText(loyaltyUrlDisplay.value)
    .then(() => alert("URL copied to clipboard!"))
    .catch(err => console.error(err));
});

// ================= 6. CUSTOMER DIRECTORY LISTENER =================
function setupCustomersListener() {
  const q = query(collection(db, "customers"), where("cafeId", "==", currentCafeSlug));
  
  onSnapshot(q, (snapshot) => {
    allCustomers = [];
    
    if (snapshot.empty) {
      renderCustomersTable([]);
      updateOverviewStats(0, 0, 0);
      return;
    }

    let totalStampsIssued = 0;
    let totalMaxedRewards = 0;

    snapshot.forEach(doc => {
      const data = doc.data();
      allCustomers.push(data);
      totalStampsIssued += (data.stampsCount || 0);
      
      const maxStampsSetting = currentCafe.cardSettings.totalStamps || 8;
      if (data.stampsCount >= maxStampsSetting) {
        totalMaxedRewards++;
      }
    });

    renderCustomersTable(allCustomers);
    updateOverviewStats(allCustomers.length, totalStampsIssued, totalMaxedRewards);
  }, (err) => {
    console.error("Customers listener error:", err);
    customersTableBody.innerHTML = `
      <tr>
        <td colspan="5" class="empty-state" style="color: var(--danger);">
          <p>Database Error: ${err.message}</p>
          <p style="font-size: 0.8rem; margin-top: 5px;">Please verify your Firestore rules allow reading customer data.</p>
        </td>
      </tr>`;
  });
}

function renderCustomersTable(customers) {
  customersTableBody.innerHTML = "";
  
  if (customers.length === 0) {
    customersTableBody.innerHTML = `
      <tr>
        <td colspan="5" class="empty-state">
          <div>👥</div>
          <p>No customers registered under your store scope yet.</p>
        </td>
      </tr>`;
    return;
  }

  const searchVal = customerSearchInput.value.toLowerCase().trim();
  const maxStampsSetting = currentCafe ? (currentCafe.cardSettings.totalStamps || 8) : 8;

  const filtered = customers.filter(c => c.email.toLowerCase().includes(searchVal));

  if (filtered.length === 0) {
    customersTableBody.innerHTML = `
      <tr>
        <td colspan="5" class="empty-state">
          <p>No customers found matching "${searchVal}"</p>
        </td>
      </tr>`;
    return;
  }

  filtered.forEach(cust => {
    const tr = document.createElement("tr");
    const isMaxed = cust.stampsCount >= maxStampsSetting;
    const joinDate = cust.createdAt ? new Date(cust.createdAt.seconds * 1000).toLocaleDateString() : "N/A";
    
    tr.innerHTML = `
      <td><strong>${cust.email}</strong></td>
      <td>
        <span class="stamp-count-badge ${isMaxed ? 'maxed' : ''}">${cust.stampsCount} / ${maxStampsSetting}</span>
      </td>
      <td>${joinDate}</td>
      <td>
        <span class="status-indicator" style="color: ${isMaxed ? 'var(--success)' : 'var(--text-muted)'};">
          ${isMaxed ? '🏆 Reward Ready' : '⏳ Collecting'}
        </span>
      </td>
      <td>
        <div class="action-btn-row">
          <button class="btn-stamp-action add" data-uid="${cust.uid}">+1 Stamp</button>
          <button class="btn-stamp-action remove" data-uid="${cust.uid}">-1</button>
          <button class="btn-stamp-action reset" data-uid="${cust.uid}">Reset</button>
        </div>
      </td>
    `;
    customersTableBody.appendChild(tr);
  });

  // Attach button triggers for stamps
  document.querySelectorAll(".btn-stamp-action").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const uid = e.target.dataset.uid;
      const customerObj = allCustomers.find(c => c.uid === uid);
      if (!customerObj) return;

      const action = e.target.classList.contains("add") ? "add" : e.target.classList.contains("remove") ? "remove" : "reset";
      await updateCustomerStamps(customerObj, action);
    });
  });
}

customerSearchInput.addEventListener("input", () => {
  renderCustomersTable(allCustomers);
});

// Update Customer stamp value in Firestore
async function updateCustomerStamps(customer, action) {
  const maxStamps = currentCafe ? (currentCafe.cardSettings.totalStamps || 8) : 8;
  let newCount = customer.stampsCount || 0;
  
  if (action === "add") {
    if (newCount >= maxStamps) {
      alert("Customer has already earned their reward! Reset their card to start a new cycle.");
      return;
    }
    newCount += 1;
  } else if (action === "remove") {
    newCount = Math.max(0, newCount - 1);
  } else if (action === "reset") {
    if (!confirm(`Are you sure you want to reset stamps for ${customer.email}?`)) return;
    newCount = 0;
  }

  try {
    const docRef = doc(db, "customers", customer.uid);
    
    // Add dynamic logs to customer transaction history array
    const transaction = {
      transactionId: "tx_" + Date.now(),
      stampsEarned: action === "add" ? 1 : action === "remove" ? -1 : -customer.stampsCount,
      issuedAt: new Date(),
      issuedBy: auth.currentUser.uid
    };

    await updateDoc(docRef, {
      stampsCount: newCount
      // Optional audit logging:
      // stampsHistory: arrayUnion(transaction)
    });
  } catch (err) {
    alert("Stamps update failed: " + err.message);
  }
}

function updateOverviewStats(totalCust, totalStamps, rewardsClaimed) {
  statCustomers.textContent = totalCust.toString();
  statStamps.textContent = totalStamps.toString();
  statRewards.textContent = rewardsClaimed.toString();
}

// ================= 7. QR CODE GENERATION & DOWNLOAD =================
function generateQRCodePortal() {
  const url = loyaltyUrlDisplay.value;
  qrcodeDisplay.innerHTML = "";
  qrCafeLabel.textContent = `${currentCafe.name} Loyalty Portal`;

  qrcodeInstance = new QRCode(qrcodeDisplay, {
    text: url,
    width: 220,
    height: 220,
    colorDark: "#0b0f19",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.H
  });
}

// Convert QR Canvas to download file
downloadQrBtn.addEventListener("click", () => {
  const qrImg = qrcodeDisplay.querySelector("img");
  const qrCanvas = qrcodeDisplay.querySelector("canvas");

  if (qrImg && qrImg.src) {
    const a = document.createElement("a");
    a.href = qrImg.src;
    a.download = `${currentCafeSlug}-loyalty-qr.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } else if (qrCanvas) {
    const a = document.createElement("a");
    a.href = qrCanvas.toDataURL("image/png");
    a.download = `${currentCafeSlug}-loyalty-qr.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } else {
    alert("QR Code image not generated yet. Switch tabs and try again.");
  }
});
