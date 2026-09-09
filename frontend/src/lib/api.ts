/**
 * Client for greenclaims-api. Every request carries the App Bridge session
 * token (§4's dependencies.py verifies it as `get_current_store`) — this
 * app has no auth of its own, only the Shopify embedded session.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

declare global {
  interface Window {
    shopify?: { idToken: () => Promise<string> };
  }
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function getSessionToken(): Promise<string> {
  if (typeof window !== "undefined" && window.shopify?.idToken) {
    return window.shopify.idToken();
  }
  throw new ApiError(0, "Not running inside Shopify admin — no session token available.");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getSessionToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ApiError(res.status, body || `Request failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

function jsonRequest<T>(path: string, method: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// ── Types (mirroring the FastAPI response models) ──────────────────────────

export type RiskTier = "banned" | "needs_substantiation" | "caution";
export type ClaimStatus = "unsubstantiated" | "substantiated" | "dismissed";

export interface EvidenceRef {
  id: string;
  file_name: string;
  doc_type: string;
  expires_at: string | null;
}

export interface Claim {
  id: string;
  matched_phrase: string;
  term_category: string;
  risk_tier: RiskTier;
  status: ClaimStatus;
  first_detected_at: string;
  last_checked_at: string;
  product_title: string | null;
  content_item_title: string | null;
  evidence: EvidenceRef[];
}

export interface EvidenceDocument {
  id: string;
  file_name: string;
  doc_type: string;
  uploaded_at: string;
  expires_at: string | null;
}

export interface BillingStatus {
  plan_tier: "basic" | "pro";
  product_limit: number | null;
  has_active_subscription: boolean;
}

export interface AuditExport {
  id: string;
  generated_at: string;
  sku_count: number;
  file_hash: string;
  requested_by: string | null;
}

// ── API ──────────────────────────────────────────────────────────────────

export const api = {
  listClaims: () => request<Claim[]>("/claims"),
  getClaim: (id: string) => request<Claim>(`/claims/${id}`),
  updateClaimStatus: (id: string, status: ClaimStatus) =>
    jsonRequest<Claim>(`/claims/${id}`, "PATCH", { status }),
  linkEvidence: (claimId: string, evidenceDocumentId: string) =>
    jsonRequest<Claim>(`/claims/${claimId}/evidence-links`, "POST", {
      evidence_document_id: evidenceDocumentId,
    }),
  unlinkEvidence: (claimId: string, evidenceId: string) =>
    request<Claim>(`/claims/${claimId}/evidence-links/${evidenceId}`, { method: "DELETE" }),

  listEvidence: () => request<EvidenceDocument[]>("/evidence"),
  uploadEvidence: async (file: File, docType: string, expiresAt: string | null) => {
    const token = await getSessionToken();
    const form = new FormData();
    form.append("file", file);
    form.append("doc_type", docType);
    if (expiresAt) form.append("expires_at", expiresAt);
    const res = await fetch(`${API_BASE_URL}/evidence`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (!res.ok) throw new ApiError(res.status, await res.text());
    return res.json() as Promise<EvidenceDocument>;
  },
  deleteEvidence: (id: string) => request<void>(`/evidence/${id}`, { method: "DELETE" }),
  downloadEvidence: (id: string) => request<{ url: string }>(`/evidence/${id}/download`),

  billingStatus: () => request<BillingStatus>("/billing/status"),
  subscribe: (tier: "basic" | "pro") =>
    jsonRequest<{ confirmation_url: string }>("/billing/subscribe", "POST", { tier }),

  listAuditExports: () => request<AuditExport[]>("/audit-exports"),
  createAuditExport: (productId?: string) =>
    request<AuditExport>(`/audit-exports${productId ? `?product_id=${productId}` : ""}`, {
      method: "POST",
    }),
  downloadAuditExport: (id: string) =>
    request<{ url: string; sha256_sidecar_url: string; file_hash: string }>(
      `/audit-exports/${id}/download`
    ),
};
