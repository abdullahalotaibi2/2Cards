// Unique customer barcode payload — one code per customer per cafe
export const SCAN_PREFIX = "22CARD:v1:";

export function buildCustomerScanPayload(cafeId, customerUid) {
  return `${SCAN_PREFIX}${cafeId}:${customerUid}`;
}

export function parseCustomerScanPayload(text) {
  if (!text || typeof text !== "string") return null;
  const trimmed = text.trim();
  const match = trimmed.match(/^22CARD:v1:([^:]+):([a-zA-Z0-9_-]+)$/);
  if (!match) return null;
  return { cafeId: match[1], customerUid: match[2] };
}
