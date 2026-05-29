// Local backup for customer data — survives page refresh if Firestore is slow or offline
const PREFIX = "22card_v1_";

export function customerCacheKey(cafeId, uid) {
  return `${PREFIX}customer_${cafeId}_${uid}`;
}

export function lastCafeKey() {
  return `${PREFIX}last_cafe_id`;
}

export function saveCustomerCache(cafeId, uid, data) {
  if (!cafeId || !uid || !data) return;
  try {
    const payload = {
      uid,
      email: data.email || "",
      cafeId,
      stampsCount: typeof data.stampsCount === "number" ? data.stampsCount : 0,
      savedAt: Date.now()
    };
    localStorage.setItem(customerCacheKey(cafeId, uid), JSON.stringify(payload));
    localStorage.setItem(lastCafeKey(), cafeId);
  } catch (err) {
    console.warn("Could not save customer cache:", err);
  }
}

export function loadCustomerCache(cafeId, uid) {
  if (!cafeId || !uid) return null;
  try {
    const raw = localStorage.getItem(customerCacheKey(cafeId, uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.cafeId !== cafeId || parsed.uid !== uid) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearCustomerCache(cafeId, uid) {
  if (!cafeId || !uid) return;
  try {
    localStorage.removeItem(customerCacheKey(cafeId, uid));
  } catch (err) {
    console.warn("Could not clear customer cache:", err);
  }
}

export function saveLastCafeId(cafeId) {
  if (!cafeId) return;
  try {
    localStorage.setItem(lastCafeKey(), cafeId);
  } catch (err) {
    console.warn("Could not save last cafe id:", err);
  }
}
