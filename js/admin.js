// admin.js - Super Admin Controller
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signOut as authSignOut, onAuthStateChanged, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, setDoc, deleteDoc, collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { auth, db, firebaseConfig } from "./firebase-config.js";

// DOM Bindings
const adminEmailDisplay = document.getElementById("admin-email-display");
const logoutBtn = document.getElementById("logout-btn");
const statTotalCafes = document.getElementById("stat-total-cafes");
const statTotalOwners = document.getElementById("stat-total-owners");

const createCafeForm = document.getElementById("create-cafe-form");
const cafeNameInput = document.getElementById("cafe-name");
const cafeSlugInput = document.getElementById("cafe-slug");
const ownerEmailInput = document.getElementById("owner-email");
const ownerPasswordInput = document.getElementById("owner-password");
const createBtn = document.getElementById("create-btn");
const createSpinner = document.getElementById("create-spinner");
const formError = document.getElementById("form-error");

const tableBody = document.getElementById("cafe-table-body");

// Modal Bindings
const deleteModal = document.getElementById("delete-modal");
const closeDeleteBtn = document.getElementById("close-delete-btn");
const deleteConfirmSlug = document.getElementById("delete-confirm-slug");
const deleteConfirmInput = document.getElementById("delete-confirm-input");
const confirmDeleteBtn = document.getElementById("confirm-delete-btn");
const cancelDeleteBtn = document.getElementById("cancel-delete-btn");

let targetDeleteSlug = "";

// 1. Session Protection
onAuthStateChanged(auth, (user) => {
  if (!user) {
    // If not authenticated, kick back to login portal
    window.location.href = "index.html";
  } else {
    adminEmailDisplay.textContent = user.email;
  }
});

// Logout handler
logoutBtn.addEventListener("click", async () => {
  try {
    await authSignOut(auth);
    window.location.href = "index.html";
  } catch (err) {
    alert("Logout failed: " + err.message);
  }
});

// 2. Automated Slug Generation
cafeNameInput.addEventListener("input", () => {
  const name = cafeNameInput.value;
  // Convert to lower case, replace spaces/special characters with dashes, remove duplicates
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Remove non-word characters
    .replace(/[\s_]+/g, "-")  // Replace space/underscores with dashes
    .replace(/^-+|-+$/g, ""); // Trim dashes from ends
  cafeSlugInput.value = slug;
});

// 3. Setup Firestore Real-time listener for Cafe list
let cachedCafes = [];
onSnapshot(collection(db, "cafes"), (snapshot) => {
  cachedCafes = [];
  tableBody.innerHTML = "";
  
  if (snapshot.empty) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="5" class="empty-state">
          <div>🏪</div>
          <p>No cafes registered yet. Use the registration form to create one.</p>
        </td>
      </tr>`;
    statTotalCafes.textContent = "0";
    statTotalOwners.textContent = "0";
    return;
  }

  snapshot.forEach((doc) => {
    cachedCafes.push(doc.data());
  });

  // Sort cafes by creation timestamp or name
  cachedCafes.sort((a, b) => b.createdAt?.seconds - a.createdAt?.seconds);

  // Render Table rows
  cachedCafes.forEach((cafe) => {
    const tr = document.createElement("tr");
    
    // First letter badge for logo fallback
    const firstLetter = cafe.name ? cafe.name.charAt(0).toUpperCase() : "C";
    
    tr.innerHTML = `
      <td>
        <div class="cafe-logo-circle">${firstLetter}</div>
      </td>
      <td><strong>${cafe.name}</strong></td>
      <td><span class="cafe-slug-badge">${cafe.slug}</span></td>
      <td>${cafe.ownerEmail}</td>
      <td>
        <button class="btn-icon copy-link-btn" data-slug="${cafe.slug}" title="Copy Customer Link">🔗</button>
        <button class="btn-icon delete-cafe-btn" data-slug="${cafe.slug}" title="Delete Cafe">🗑️</button>
      </td>
    `;
    tableBody.appendChild(tr);
  });

  // Update Stats
  statTotalCafes.textContent = cachedCafes.length.toString();
  statTotalOwners.textContent = cachedCafes.length.toString();

  // Attach copy & delete listeners
  document.querySelectorAll(".copy-link-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const slug = e.target.dataset.slug;
      const portalUrl = `${window.location.origin}${window.location.pathname.replace("admin.html", "cafe.html")}?id=${slug}`;
      navigator.clipboard.writeText(portalUrl)
        .then(() => alert(`Link copied to clipboard:\n${portalUrl}`))
        .catch(err => alert("Failed to copy link: " + err));
    });
  });

  document.querySelectorAll(".delete-cafe-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      targetDeleteSlug = e.target.dataset.slug;
      openDeleteModal(targetDeleteSlug);
    });
  });
}, (err) => {
  console.error("Firestore database error:", err);
  tableBody.innerHTML = `
    <tr>
      <td colspan="5" class="empty-state" style="color: var(--danger);">
        <div>⚠️</div>
        <p>Database Error: ${err.message}</p>
        <p style="font-size: 0.8rem; margin-top: 5px;">Verify that you have configured Firestore rules and authenticated as Admin.</p>
      </td>
    </tr>`;
});

// 4. Create Cafe Owner & Firestore documents
createCafeForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  
  // Disable button & animate spinner
  createBtn.disabled = true;
  createSpinner.classList.remove("hidden");
  formError.classList.add("hidden");

  const name = cafeNameInput.value.trim();
  const slug = cafeSlugInput.value.trim();
  const email = ownerEmailInput.value.trim();
  const password = ownerPasswordInput.value;

  // Form check
  if (!slug || !name || !email || !password) {
    showFormError("All fields are required.");
    return;
  }

  // Check for duplicate slug locally first
  if (cachedCafes.some(c => c.slug === slug)) {
    showFormError(`A cafe with the custom slug '${slug}' already exists.`);
    return;
  }

  // Workaround: Init Secondary Firebase app instance to register Owner without logging Admin out
  // Make sure we generate a unique instance name
  const secondaryAppName = "OwnerRegistration_" + Date.now();
  const secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
  const secondaryAuth = getAuth(secondaryApp);

  try {
    // A. Register Auth credentials on secondary instance
    const credential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    const ownerUid = credential.user.uid;

    // B. Write configuration schema to database
    await setDoc(doc(db, "cafes", slug), {
      name: name,
      slug: slug,
      ownerEmail: email,
      ownerUid: ownerUid,
      createdAt: new Date(),
      theme: {
        primaryColor: "#f25c54", // default Coral
        secondaryColor: "#f8ad9d", // default Soft Peach
        bgColor: "#0b0f19",       // default Dark Blue
        textColor: "#ffffff",     // default White text
        logoUrl: ""
      },
      cardSettings: {
        totalStamps: 8,
        stampIcon: "☕",
        rewardDescription: "Free cup of house blend coffee!"
      }
    });

    // C. Clean up secondary auth session in memory
    await secondaryAuth.signOut();

    // Reset Form
    createCafeForm.reset();
    alert(`Successfully registered cafe: ${name}!\nOwner account set up with ${email}.`);
  } catch (err) {
    console.error("Creation failed:", err);
    showFormError("Provisioning failed: " + err.message);
  } finally {
    createBtn.disabled = false;
    createSpinner.classList.add("hidden");
  }
});

function showFormError(msg) {
  formError.textContent = msg;
  formError.classList.remove("hidden");
  createBtn.disabled = false;
  createSpinner.classList.add("hidden");
}

// 5. Delete Cafe logic
function openDeleteModal(slug) {
  deleteConfirmSlug.textContent = slug;
  deleteConfirmInput.value = "";
  confirmDeleteBtn.disabled = true;
  deleteModal.classList.remove("hidden");
}

function closeDeleteModal() {
  deleteModal.classList.add("hidden");
  targetDeleteSlug = "";
}

deleteConfirmInput.addEventListener("input", () => {
  confirmDeleteBtn.disabled = (deleteConfirmInput.value !== targetDeleteSlug);
});

confirmDeleteBtn.addEventListener("click", async () => {
  if (!targetDeleteSlug) return;
  
  try {
    await deleteDoc(doc(db, "cafes", targetDeleteSlug));
    closeDeleteModal();
    alert("Cafe configuration deleted from Firestore.");
  } catch (err) {
    alert("Deletion failed: " + err.message);
  }
});

closeDeleteBtn.addEventListener("click", closeDeleteModal);
cancelDeleteBtn.addEventListener("click", closeDeleteModal);
