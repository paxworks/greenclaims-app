"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { RiskBadge, StatusBadge } from "@/components/Badge";
import { EmptyState, ErrorBanner } from "@/components/Feedback";
import { useShopQuery } from "@/lib/useShopQuery";
import { api, ApiError, type Claim, type ClaimStatus, type RiskTier } from "@/lib/api";

const STATUS_FILTERS: { value: ClaimStatus | "all"; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "unsubstantiated", label: "Unsubstantiated" },
  { value: "substantiated", label: "Substantiated" },
  { value: "dismissed", label: "Dismissed" },
];

const RISK_FILTERS: { value: RiskTier | "all"; label: string }[] = [
  { value: "all", label: "All risk levels" },
  { value: "banned", label: "Banned" },
  { value: "needs_substantiation", label: "Needs substantiation" },
  { value: "caution", label: "Caution" },
];

function Dashboard() {
  const params = useSearchParams();
  const shop = params.get("shop");
  const qs = useShopQuery();

  const [claims, setClaims] = useState<Claim[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ClaimStatus | "all">("all");
  const [riskFilter, setRiskFilter] = useState<RiskTier | "all">("all");
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<{ url: string; shaSidecarUrl: string } | null>(
    null
  );

  useEffect(() => {
    if (!shop) return;
    api
      .listClaims()
      .then(setClaims)
      .catch((e: ApiError) => setError(e.message));
  }, [shop]);

  const filtered = useMemo(() => {
    if (!claims) return [];
    return claims.filter(
      (c) =>
        (statusFilter === "all" || c.status === statusFilter) &&
        (riskFilter === "all" || c.risk_tier === riskFilter)
    );
  }, [claims, statusFilter, riskFilter]);

  async function handleExport() {
    setExporting(true);
    setExportResult(null);
    try {
      const exportRow = await api.createAuditExport();
      const download = await api.downloadAuditExport(exportRow.id);
      setExportResult({ url: download.url, shaSidecarUrl: download.sha256_sidecar_url });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  }

  if (!shop) {
    return (
      <EmptyState message="No shop context — open this app from your Shopify admin." />
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Claims</h1>
          <p className="mt-1 text-sm text-gray-500">
            Flagged environmental claims across your product catalogue and blog/page copy.
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="rounded-md bg-[#008060] px-4 py-2 text-sm font-medium text-white hover:bg-[#006e52] disabled:opacity-50"
        >
          {exporting ? "Generating…" : "Export audit report"}
        </button>
      </div>

      {exportResult && (
        <div className="mt-4 rounded-md border border-[#b7dcc4] bg-[#e3f1df] p-4 text-sm">
          <p className="font-medium text-[#0c5132]">Audit export ready.</p>
          <p className="mt-1 text-[#0c5132]">
            <a href={exportResult.url} className="underline" target="_blank" rel="noreferrer">
              Download CSV
            </a>
            {" · "}
            <a
              href={exportResult.shaSidecarUrl}
              className="underline"
              target="_blank"
              rel="noreferrer"
            >
              Download SHA-256 checksum
            </a>
          </p>
        </div>
      )}

      {error && <ErrorBanner message={error} />}

      <div className="mt-6 flex gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as ClaimStatus | "all")}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
        >
          {STATUS_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <select
          value={riskFilter}
          onChange={(e) => setRiskFilter(e.target.value as RiskTier | "all")}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
        >
          {RISK_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
        {claims === null && !error ? (
          <div className="p-8 text-center text-sm text-gray-500">Loading claims…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">
            {claims && claims.length === 0
              ? "No claims flagged yet. Claims appear here once your catalogue has been scanned."
              : "No claims match these filters."}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2.5">Source</th>
                <th className="px-4 py-2.5">Matched phrase</th>
                <th className="px-4 py-2.5">Risk</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Evidence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((claim) => (
                <tr key={claim.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/claims/${claim.id}${qs}`}
                      className="font-medium text-[#008060] hover:underline"
                    >
                      {claim.product_title || claim.content_item_title || "Untitled"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{claim.matched_phrase}</td>
                  <td className="px-4 py-3">
                    <RiskBadge risk={claim.risk_tier} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={claim.status} />
                  </td>
                  <td className="px-4 py-3 text-gray-500">{claim.evidence.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Nav />
      <Dashboard />
    </Suspense>
  );
}
