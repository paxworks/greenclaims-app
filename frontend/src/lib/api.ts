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

const APP_BRIDGE_READY_TIMEOUT_MS = 4000;
const APP_BRIDGE_POLL_INTERVAL_MS = 50;

/**
 * window.shopify is set up asynchronously by the App Bridge script — even
 * inside a genuinely embedded iframe, it isn't guaranteed to exist the
 * instant the script tag finishes executing (a documented, known timing
 * issue, not specific to this app). Poll briefly instead of failing on the
 * first check, which was wrongly reporting "not embedded" during that
 * startup window.
 */
async function waitForAppBridge(): Promise<void> {
  const start = Date.now();
  while (!(typeof window !== "undefined" && window.shopify?.idToken)) {
    if (Date.now() - start > APP_BRIDGE_READY_TIMEOUT_MS) return;
    await new Promise((resolve) => setTimeout(resolve, APP_BRIDGE_POLL_INTERVAL_MS));
  }
}

async function getSessionToken(): Promise<string> {
  await waitForAppBridge();
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
  product_id: string | null;
  product_title: string | null;
  shopify_product_id: string | null;
  category_full_name: string | null;
  content_item_id: string | null;
  content_item_title: string | null;
  shopify_content_id: string | null;
  content_type: "page" | "article" | null;
  shopify_blog_id: string | null;
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

export interface TermOut {
  phrase: string;
  term_category: string;
  risk_tier: string;
}

export interface CustomTerm {
  id: string;
  phrase: string;
  risk_tier: "needs_substantiation" | "caution";
  created_at: string;
}

export interface TermList {
  core_terms: TermOut[];
  ambiguous_terms: TermOut[];
  custom_terms: CustomTerm[];
}

export interface Scan {
  id: string;
  triggered_by: "manual" | "install" | "scheduled";
  started_at: string;
  completed_at: string | null;
  products_scanned: number | null;
  claims_found: number | null;
}

// ── API ──────────────────────────────────────────────────────────────────

export const api = {
  listClaims: () => request<Claim[]>("/claims"),
  getClaim: (id: string) => request<Claim>(`/claims/${id}`),
  updateClaimStatus: (id: string, status: ClaimStatus) =>
    jsonRequest<Claim>(`/claims/${id}`, "PATCH", { status }),
  bulkUpdateClaimStatus: (claimIds: string[], status: "dismissed" | "unsubstantiated") =>
    jsonRequest<{ updated: string[]; not_found: string[] }>("/claims/bulk", "PATCH", {
      claim_ids: claimIds,
      status,
    }),
  bulkLinkEvidence: (claimIds: string[], evidenceDocumentId: string) =>
    jsonRequest<{ updated: string[]; not_found: string[]; banned: string[] }>(
      "/claims/bulk/evidence-links",
      "POST",
      { claim_ids: claimIds, evidence_document_id: evidenceDocumentId }
    ),
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

  getTermList: () => request<TermList>("/settings/term-list"),
  addCustomTerm: (phrase: string, riskTier: "needs_substantiation" | "caution") =>
    jsonRequest<CustomTerm>("/settings/custom-terms", "POST", {
      phrase,
      risk_tier: riskTier,
    }),
  deleteCustomTerm: (id: string) =>
    request<void>(`/settings/custom-terms/${id}`, { method: "DELETE" }),

  getLatestScan: () => request<Scan | null>("/scans/latest"),
  triggerScan: () => request<{ status: string }>("/scans", { method: "POST" }),
};
