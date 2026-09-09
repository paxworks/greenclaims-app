"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { RiskBadge, StatusBadge } from "@/components/Badge";
import { EmptyState, ErrorBanner } from "@/components/Feedback";
import { useShopQuery } from "@/lib/useShopQuery";
import { api, ApiError, type Claim, type EvidenceDocument } from "@/lib/api";
import { getExpiryStatus } from "@/lib/expiry";

const DOC_TYPES = [
  { value: "certificate", label: "Certificate" },
  { value: "lab_result", label: "Lab result" },
  { value: "lca", label: "LCA report" },
  { value: "other", label: "Other" },
];

function ClaimDetail() {
  const { id } = useParams<{ id: string }>();
  const shop = useSearchParams().get("shop");
  const qs = useShopQuery();

  const [claim, setClaim] = useState<Claim | null>(null);
  const [evidence, setEvidence] = useState<EvidenceDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedEvidenceId, setSelectedEvidenceId] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadDocType, setUploadDocType] = useState("certificate");
  const [uploadExpiresAt, setUploadExpiresAt] = useState("");

  const load = useCallback(async () => {
    try {
      const [c, e] = await Promise.all([api.getClaim(id), api.listEvidence()]);
      setClaim(c);
      setEvidence(e);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load claim.");
    }
  }, [id]);

  useEffect(() => {
    if (shop) load();
  }, [shop, load]);

  async function withBusy(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleUploadAndLink(e: React.FormEvent) {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file || !claim) return;
    await withBusy(async () => {
      const doc = await api.uploadEvidence(file, uploadDocType, uploadExpiresAt || null);
      setEvidence((prev) => (prev ? [...prev, doc] : [doc]));
      setClaim(await api.linkEvidence(claim.id, doc.id));
      if (fileInputRef.current) fileInputRef.current.value = "";
      setUploadExpiresAt("");
    });
  }

  const linkableEvidence = (evidence || []).filter(
    (e) => !claim?.evidence.some((linked) => linked.id === e.id)
  );

  if (!shop) return <EmptyState message="No shop context — open this app from your Shopify admin." />;
  if (error && !claim) return <ErrorBanner message={error} />;
  if (!claim) return <div className="p-8 text-center text-sm text-gray-500">Loading…</div>;

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <Link href={`/claims${qs}`} className="text-sm text-[#008060] hover:underline">
        ← Back to claims
      </Link>

      <div className="mt-4 rounded-lg border border-gray-200 bg-white p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">
              {claim.product_title || claim.content_item_title || "Untitled"}
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              Matched phrase: <span className="font-medium">&ldquo;{claim.matched_phrase}&rdquo;</span>
            </p>
          </div>
          <div className="flex gap-2">
            <RiskBadge risk={claim.risk_tier} />
            <StatusBadge status={claim.status} />
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-gray-500">Term category</dt>
            <dd className="mt-0.5 text-gray-900">{claim.term_category}</dd>
          </div>
          <div>
            <dt className="text-gray-500">First detected</dt>
            <dd className="mt-0.5 text-gray-900">
              {new Date(claim.first_detected_at).toLocaleDateString()}
            </dd>
          </div>
        </dl>

        {error && <ErrorBanner message={error} />}

        <div className="mt-6 flex gap-2 border-t border-gray-100 pt-4">
          {claim.status !== "dismissed" && (
            <button
              disabled={busy}
              onClick={() =>
                withBusy(async () => setClaim(await api.updateClaimStatus(claim.id, "dismissed")))
              }
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Mark not applicable
            </button>
          )}
          {claim.status === "dismissed" && (
            <button
              disabled={busy}
              onClick={() =>
                withBusy(async () =>
                  setClaim(await api.updateClaimStatus(claim.id, "unsubstantiated"))
                )
              }
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Reopen claim
            </button>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-gray-900">Linked evidence</h2>

        {claim.evidence.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">No evidence linked yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-gray-100">
            {claim.evidence.map((doc) => (
              <li key={doc.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <span className="font-medium text-gray-900">{doc.file_name}</span>
                  <span className="ml-2 text-gray-500">({doc.doc_type})</span>
                  {doc.expires_at && (
                    <span
                      className={`ml-2 text-xs ${
                        getExpiryStatus(doc.expires_at) === "expired"
                          ? "font-medium text-[#8e1f0b]"
                          : getExpiryStatus(doc.expires_at) === "expiring_soon"
                            ? "font-medium text-[#8a5700]"
                            : "text-gray-400"
                      }`}
                    >
                      expires {new Date(doc.expires_at).toLocaleDateString()}
                      {getExpiryStatus(doc.expires_at) === "expired" && " (expired)"}
                      {getExpiryStatus(doc.expires_at) === "expiring_soon" && " (soon)"}
                    </span>
                  )}
                </div>
                <button
                  disabled={busy}
                  onClick={() =>
                    withBusy(async () => setClaim(await api.unlinkEvidence(claim.id, doc.id)))
                  }
                  className="text-xs text-gray-500 hover:text-red-600 disabled:opacity-50"
                >
                  Unlink
                </button>
              </li>
            ))}
          </ul>
        )}

        {claim.risk_tier === "banned" ? (
          <p className="mt-4 rounded-md border border-[#f3c6b9] bg-[#fbeae5] p-3 text-sm text-[#8e1f0b]">
            This claim uses a banned phrase — an EU-prohibited offset-based neutrality claim
            (e.g. &ldquo;carbon neutral&rdquo;). It can&rsquo;t be substantiated with evidence;
            the copy itself needs to change. Existing links above can still be removed.
          </p>
        ) : (
          <>
            <div className="mt-4 flex items-center gap-2 border-t border-gray-100 pt-4">
              <select
                value={selectedEvidenceId}
                onChange={(e) => setSelectedEvidenceId(e.target.value)}
                className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
              >
                <option value="">
                  {linkableEvidence.length === 0
                    ? "No unlinked evidence available — upload some in the vault"
                    : "Select an uploaded document to link…"}
                </option>
                {linkableEvidence.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.file_name} ({doc.doc_type})
                  </option>
                ))}
              </select>
              <button
                disabled={busy || !selectedEvidenceId}
                onClick={() =>
                  withBusy(async () => {
                    setClaim(await api.linkEvidence(claim.id, selectedEvidenceId));
                    setSelectedEvidenceId("");
                  })
                }
                className="rounded-md bg-[#008060] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#006e52] disabled:opacity-50"
              >
                Link
              </button>
            </div>
            <div className="mt-4 border-t border-gray-100 pt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Or upload new evidence
              </p>
              <form onSubmit={handleUploadAndLink} className="mt-2 flex flex-wrap items-end gap-3">
                <div className="min-w-[200px] flex-1">
                  <label className="block text-xs font-medium text-gray-500">
                    File (PDF or image, max 10MB)
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf,image/png,image/jpeg,image/webp"
                    required
                    className="mt-1 block w-full text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500">Document type</label>
                  <select
                    value={uploadDocType}
                    onChange={(e) => setUploadDocType(e.target.value)}
                    className="mt-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                  >
                    {DOC_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500">
                    Expires (optional)
                  </label>
                  <input
                    type="date"
                    value={uploadExpiresAt}
                    onChange={(e) => setUploadExpiresAt(e.target.value)}
                    className="mt-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-md bg-[#008060] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#006e52] disabled:opacity-50"
                >
                  {busy ? "Uploading…" : "Upload & link"}
                </button>
              </form>
              <p className="mt-3 text-xs text-gray-400">
                Uploaded files are also added to the{" "}
                <Link href={`/evidence${qs}`} className="text-[#008060] hover:underline">
                  evidence vault
                </Link>{" "}
                for reuse on other claims.
              </p>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Nav />
      <ClaimDetail />
    </Suspense>
  );
}
