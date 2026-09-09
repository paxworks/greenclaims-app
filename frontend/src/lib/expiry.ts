export type ExpiryStatus = "expired" | "expiring_soon" | "ok" | "none";

const EXPIRING_SOON_DAYS = 30;

export function getExpiryStatus(expiresAt: string | null): ExpiryStatus {
  if (!expiresAt) return "none";
  const diffMs = new Date(expiresAt).getTime() - Date.now();
  if (diffMs < 0) return "expired";
  if (diffMs < EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000) return "expiring_soon";
  return "ok";
}
