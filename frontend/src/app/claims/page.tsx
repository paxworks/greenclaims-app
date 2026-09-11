"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { BillingGate } from "@/components/BillingGate";
import { RiskBadge, StatusBadge } from "@/components/Badge";
import { EmptyState, ErrorBanner } from "@/components/Feedback";
import { useShopQuery } from "@/lib/useShopQuery";
import {
  api,
  ApiError,
  type AuditExport,
  type Claim,
  type ClaimStatus,
  type EvidenceDocument,
  type RiskTier,
  type Scan,
} from "@/lib/api";

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

const PAGE_SIZE_OPTIONS = [25, 50, 75, 100, "all"] as const;
type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

interface ClaimGroup {
  key: string;
  title: string;
  viewUrl: string | null;
  claims: Claim[];
}

function shopifyViewUrl(claim: Claim, shop: string): string | null {
  if (claim.shopify_product_id) {
    return `https://${shop}/admin/products/${claim.shopify_product_id}`;
  }
  if (claim.content_type === "page" && claim.shopify_content_id) {
    return `https://${shop}/admin/pages/${claim.shopify_content_id}`;
  }
  if (claim.content_type === "article" && claim.shopify_content_id && claim.shopify_blog_id) {
    return `https://${shop}/admin/blogs/${claim.shopify_blog_id}/articles/${claim.shopify_content_id}`;
  }
  return null;
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function groupClaimsBySource(claims: Claim[], shop: string): ClaimGroup[] {
  const groups = new Map<string, ClaimGroup>();
  for (const claim of claims) {
    const key = claim.product_id || claim.content_item_id || claim.id;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        title: claim.product_title || claim.content_item_title || "Untitled",
        viewUrl: shopifyViewUrl(claim, shop),
        claims: [],
      };
      groups.set(key, group);
    }
    group.claims.push(claim);
  }
  return Array.from(groups.values());
}

function ClaimsPage() {
  const params = useSearchParams();
  const shop = params.get("shop");
  const qs = useShopQuery();

  const [claims, setClaims] = useState<Claim[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Pre-filtered on load via ?status=/?risk=/?q= — the Dashboard's stat
  // cards, chart segments, and top-products list link here that way,
  // rather than only being able to describe a filtered view in words.
  const [statusFilter, setStatusFilter] = useState<ClaimStatus | "all">(
    (params.get("status") as ClaimStatus | null) || "all"
  );
  const [riskFilter, setRiskFilter] = useState<RiskTier | "all">(
    (params.get("risk") as RiskTier | null) || "all"
  );
  const [search, setSearch] = useState(params.get("q") || "");
  // Exact-match, not folded into the free-text search — a category name
  // could otherwise coincidentally substring-match an unrelated matched
  // phrase or product title.
  const [categoryFilter, setCategoryFilter] = useState(params.get("category") || "");
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<{
    url: string;
    shaSidecarUrl: string;
    pdfUrl?: string;
    pdfShaSidecarUrl?: string;
  } | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(100);
  const [scan, setScan] = useState<Scan | null | undefined>(undefined);
  const [scanning, setScanning] = useState(false);
  const [pastExports, setPastExports] = useState<AuditExport[] | null>(null);
  const [showPastExports, setShowPastExports] = useState(false);
  const [downloadingExportId, setDownloadingExportId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [evidenceDocs, setEvidenceDocs] = useState<EvidenceDocument[] | null>(null);
  const [selectedEvidenceId, setSelectedEvidenceId] = useState("");

  useEffect(() => {
    if (!shop) return;
    api
      .listClaims()
      .then(setClaims)
      .catch((e: ApiError) => setError(e.message));
    api
      .getLatestScan()
      .then((s) => {
        setScan(s);
        setScanning(!!s && s.completed_at === null);
      })
      .catch(() => setScan(null));
  }, [shop]);

  // While a scan is running (just triggered, or already in progress on
  // load), poll for it to finish, then refresh claims so new/updated ones
  // show up without a manual page reload.
  useEffect(() => {
    if (!scanning) return;
    const interval = setInterval(async () => {
      try {
        const latest = await api.getLatestScan();
        setScan(latest);
        if (latest?.completed_at) {
          setScanning(false);
          api.listClaims().then(setClaims).catch(() => {});
        }
      } catch {
        // Transient poll failure — try again on the next tick.
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [scanning]);

  async function handleScanNow() {
    setError(null);
    try {
      await api.triggerScan();
      setScanning(true);
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 409
          ? "A scan is already in progress."
          : e instanceof ApiError
            ? e.message
            : "Could not start a scan."
      );
    }
  }

  const filtered = useMemo(() => {
    if (!claims) return [];
    const query = search.trim().toLowerCase();
    return claims.filter(
      (c) =>
        (statusFilter === "all" || c.status === statusFilter) &&
        (riskFilter === "all" || c.risk_tier === riskFilter) &&
        (!categoryFilter ||
          (categoryFilter === "__uncategorized__"
            ? !c.category_full_name
            : c.category_full_name === categoryFilter)) &&
        (!query ||
          (c.product_title || c.content_item_title || "").toLowerCase().includes(query) ||
          c.matched_phrase.toLowerCase().includes(query))
    );
  }, [claims, statusFilter, riskFilter, categoryFilter, search]);

  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
  }, [statusFilter, riskFilter, categoryFilter, search, pageSize]);

  function toggleClaimSelected(claimId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(claimId)) next.delete(claimId);
      else next.add(claimId);
      return next;
    });
  }

  function toggleGroupSelected(group: ClaimGroup) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = group.claims.every((c) => next.has(c.id));
      for (const c of group.claims) {
        if (allSelected) next.delete(c.id);
        else next.add(c.id);
      }
      return next;
    });
  }

  async function handleBulkUpdate(status: "dismissed" | "unsubstantiated") {
    setBulkUpdating(true);
    setError(null);
    try {
      await api.bulkUpdateClaimStatus(Array.from(selectedIds), status);
      setSelectedIds(new Set());
      setClaims(await api.listClaims());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Bulk update failed.");
    } finally {
      setBulkUpdating(false);
    }
  }

  const groups = useMemo(
    () => groupClaimsBySource(filtered, shop || ""),
    [filtered, shop]
  );

  const effectivePageSize = pageSize === "all" ? Math.max(groups.length, 1) : pageSize;
  const totalPages = Math.max(1, Math.ceil(groups.length / effectivePageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedGroups = groups.slice(
    (currentPage - 1) * effectivePageSize,
    currentPage * effectivePageSize
  );

  const visibleClaimIds = pagedGroups.flatMap((g) => g.claims.map((c) => c.id));
  const allVisibleSelected =
    visibleClaimIds.length > 0 && visibleClaimIds.every((id) => selectedIds.has(id));

  function toggleSelectAllVisible() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const id of visibleClaimIds) next.delete(id);
      } else {
        for (const id of visibleClaimIds) next.add(id);
      }
      return next;
    });
  }

  // Lazy-loaded the first time a selection is made, same pattern as past
  // exports — most sessions won't use bulk evidence-linking, so no need to
  // fetch the vault on every page load.
  useEffect(() => {
    if (selectedIds.size > 0 && evidenceDocs === null) {
      api.listEvidence().then(setEvidenceDocs).catch(() => {});
    }
  }, [selectedIds, evidenceDocs]);

  async function handleBulkLinkEvidence() {
    if (!selectedEvidenceId) return;
    setBulkUpdating(true);
    setError(null);
    try {
      const result = await api.bulkLinkEvidence(Array.from(selectedIds), selectedEvidenceId);
      setSelectedIds(new Set());
      setSelectedEvidenceId("");
      setClaims(await api.listClaims());
      if (result.banned.length > 0) {
        setError(
          `Linked to ${result.updated.length} claim${result.updated.length === 1 ? "" : "s"}. ` +
            `Skipped ${result.banned.length} banned claim${result.banned.length === 1 ? "" : "s"} — ` +
            `those can't be substantiated with evidence, the copy itself needs to change.`
        );
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Bulk evidence link failed.");
    } finally {
      setBulkUpdating(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    setExportResult(null);
    try {
      const exportRow = await api.createAuditExport();
      const download = await api.downloadAuditExport(exportRow.id);
      setExportResult({
        url: download.url,
        shaSidecarUrl: download.sha256_sidecar_url,
        pdfUrl: download.pdf_url,
        pdfShaSidecarUrl: download.pdf_sha256_sidecar_url,
      });
      if (pastExports) setPastExports([exportRow, ...pastExports]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  }

  async function handleTogglePastExports() {
    const next = !showPastExports;
    setShowPastExports(next);
    if (next && pastExports === null) {
      try {
        setPastExports(await api.listAuditExports());
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Could not load past exports.");
      }
    }
  }

  // Presigned URLs expire quickly (5 minutes), so a past export's download
  // link can't just be stored from the list response — fetch a fresh one
  // at click time, same as the evidence vault does.
  async function handleDownloadPastExport(id: string, which: "csv" | "sha256" | "pdf" | "pdf-sha256") {
    setDownloadingExportId(id);
    setError(null);
    try {
      const download = await api.downloadAuditExport(id);
      const urls = {
        csv: download.url,
        sha256: download.sha256_sidecar_url,
        pdf: download.pdf_url,
        "pdf-sha256": download.pdf_sha256_sidecar_url,
      };
      const url = urls[which];
      if (!url) {
        setError("This export was generated before PDF support was added — only CSV is available.");
        return;
      }
      window.open(url, "_blank");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not generate a download link.");
    } finally {
      setDownloadingExportId(null);
    }
  }

  if (!shop) {
    return (
      <EmptyState message="No shop context — open this app from your Shopify admin." />
    );
  }

  const paginationBar = groups.length > 0 && (
    <div className="flex items-center justify-between text-sm text-gray-600">
      <div className="flex items-center gap-2">
        <label htmlFor="page-size" className="text-gray-500">
          Products per page
        </label>
        <select
          id="page-size"
          value={pageSize}
          onChange={(e) =>
            setPageSize(
              e.target.value === "all" ? "all" : (Number(e.target.value) as PageSize)
            )
          }
          className="rounded-md border border-gray-300 px-2 py-1 text-sm"
        >
          {PAGE_SIZE_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt === "all" ? "All" : opt}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={currentPage === 1}
          aria-label="Previous page"
          className="rounded-md border border-gray-300 px-3 py-1.5 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ←
        </button>
        <span>
          Page {currentPage} of {totalPages}
        </span>
        <button
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={currentPage === totalPages}
          aria-label="Next page"
          className="rounded-md border border-gray-300 px-3 py-1.5 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          →
        </button>
      </div>
    </div>
  );

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      {/* Sticky so the search/filter toolbar (and everything above it) stays
          visible while only the claims list below scrolls — claim lists can
          run to hundreds of rows, and re-finding filters after every scroll
          was the actual complaint. bg matches body (globals.css) so list
          rows don't visibly slide "through" this panel while scrolling.
          top-[47px] docks it directly beneath Nav (now also sticky, see
          Nav.tsx) — that height comes from Nav's py-3 + text-sm line-height
          + its border-b, so the two stick together with no gap or overlap. */}
      <div className="sticky top-[47px] z-20 bg-[#f6f6f7] pb-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Claims</h1>
          <p className="mt-1 text-sm text-gray-500">
            Flagged environmental claims across your product catalogue and blog/page copy.
          </p>
          <p className="mt-1 text-xs text-gray-400">
            {scanning
              ? "Scanning…"
              : scan?.completed_at
                ? `Last scanned ${formatRelativeTime(scan.completed_at)} — ${scan.claims_found ?? 0} claims found`
                : scan === null
                  ? "Not scanned yet."
                  : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleScanNow}
            disabled={scanning}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {scanning ? "Scanning…" : "Re-scan now"}
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="rounded-md bg-[#008060] px-4 py-2 text-sm font-medium text-white hover:bg-[#006e52] disabled:opacity-50"
          >
            {exporting ? "Generating…" : "Export audit report"}
          </button>
        </div>
      </div>

      {exportResult && (
        <div className="mt-4 rounded-md border border-[#BADFD3] bg-[#E3F3EF] p-4 text-sm">
          <p className="font-medium text-[#008060]">Audit export ready.</p>
          <p className="mt-1 text-[#008060]">
            {exportResult.pdfUrl && (
              <>
                <a href={exportResult.pdfUrl} className="underline" target="_blank" rel="noreferrer">
                  Download PDF
                </a>
                {" · "}
              </>
            )}
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
            {exportResult.pdfShaSidecarUrl && (
              <>
                {" · "}
                <a
                  href={exportResult.pdfShaSidecarUrl}
                  className="underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  Download PDF SHA-256 checksum
                </a>
              </>
            )}
          </p>
        </div>
      )}

      <div className="mt-2">
        <button
          onClick={handleTogglePastExports}
          className="text-xs font-medium text-[#008060] hover:underline"
        >
          {showPastExports ? "Hide past exports" : "Show past exports"}
        </button>
      </div>

      {showPastExports && (
        <div className="mt-2 overflow-hidden rounded-lg border border-gray-200 bg-white">
          {pastExports === null ? (
            <div className="p-4 text-center text-sm text-gray-500">Loading…</div>
          ) : pastExports.length === 0 ? (
            <div className="p-4 text-center text-sm text-gray-500">No exports generated yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2">Generated</th>
                  <th className="px-4 py-2">SKUs</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pastExports.map((exp) => (
                  <tr key={exp.id}>
                    <td className="px-4 py-2 text-gray-700">
                      {new Date(exp.generated_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-gray-500">{exp.sku_count}</td>
                    <td className="px-4 py-2 text-right">
                      {exp.pdf_file_hash && (
                        <button
                          disabled={downloadingExportId === exp.id}
                          onClick={() => handleDownloadPastExport(exp.id, "pdf")}
                          className="mr-3 text-xs font-medium text-[#008060] hover:underline disabled:opacity-50"
                        >
                          Download PDF
                        </button>
                      )}
                      <button
                        disabled={downloadingExportId === exp.id}
                        onClick={() => handleDownloadPastExport(exp.id, "csv")}
                        className="mr-3 text-xs font-medium text-[#008060] hover:underline disabled:opacity-50"
                      >
                        Download CSV
                      </button>
                      <button
                        disabled={downloadingExportId === exp.id}
                        onClick={() => handleDownloadPastExport(exp.id, "sha256")}
                        className="text-xs font-medium text-[#008060] hover:underline disabled:opacity-50"
                      >
                        SHA-256
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {error && <ErrorBanner message={error} />}

      {categoryFilter && (
        <div className="mt-4 flex items-center gap-2 text-sm text-gray-600">
          <span>
            Filtering by category:{" "}
            <span className="font-medium text-gray-900">
              {categoryFilter === "__uncategorized__" ? "Uncategorized" : categoryFilter}
            </span>
          </span>
          <button
            onClick={() => setCategoryFilter("")}
            className="text-xs font-medium text-[#008060] hover:underline"
          >
            Clear
          </button>
        </div>
      )}

      <div className="mt-6 flex gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search product, page, or matched phrase…"
          className="min-w-[220px] flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
        />
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

      <div className="mt-4">{paginationBar}</div>

      {groups.length > 0 && (
        <label className="mt-4 flex items-center gap-2 text-xs text-gray-500">
          <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAllVisible} />
          Select all visible
        </label>
      )}

      {selectedIds.size > 0 && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-md border border-gray-300 bg-white p-3 text-sm shadow-sm">
          <div className="flex items-center gap-3">
            <span className="font-medium text-gray-700">{selectedIds.size} selected</span>
            <button
              disabled={bulkUpdating}
              onClick={() => handleBulkUpdate("dismissed")}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {bulkUpdating ? "Updating…" : "Mark not applicable"}
            </button>
            <button
              disabled={bulkUpdating}
              onClick={() => handleBulkUpdate("unsubstantiated")}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {bulkUpdating ? "Updating…" : "Reopen"}
            </button>
            <button
              disabled={bulkUpdating}
              onClick={() => setSelectedIds(new Set())}
              className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50"
            >
              Clear
            </button>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={selectedEvidenceId}
              onChange={(e) => setSelectedEvidenceId(e.target.value)}
              className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            >
              <option value="">
                {evidenceDocs === null
                  ? "Loading evidence…"
                  : evidenceDocs.length === 0
                    ? "No uploaded evidence — upload some in the vault"
                    : "Link evidence to all selected…"}
              </option>
              {(evidenceDocs ?? []).map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.file_name} ({doc.doc_type})
                </option>
              ))}
            </select>
            <button
              disabled={bulkUpdating || !selectedEvidenceId}
              onClick={handleBulkLinkEvidence}
              className="rounded-md bg-[#008060] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#006e52] disabled:opacity-50"
            >
              Link
            </button>
          </div>
        </div>
      )}
      </div>

      <div className="mt-4 space-y-4">
        {claims === null && !error ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
            Loading claims…
          </div>
        ) : groups.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
            {claims && claims.length === 0
              ? "No claims flagged yet. Claims appear here once your catalogue has been scanned."
              : "No claims match these filters."}
          </div>
        ) : (
          pagedGroups.map((group) => (
            <div key={group.key} className="overflow-hidden rounded-lg border border-gray-200 bg-white">
              <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-2.5">
                <label className="flex items-center gap-2 font-medium text-gray-900">
                  <input
                    type="checkbox"
                    checked={group.claims.every((c) => selectedIds.has(c.id))}
                    onChange={() => toggleGroupSelected(group)}
                    aria-label={`Select all claims for ${group.title}`}
                  />
                  {group.title}
                </label>
                {group.viewUrl && (
                  <a
                    href={group.viewUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-medium text-[#008060] hover:underline"
                  >
                    View in Shopify ↗
                  </a>
                )}
              </div>
              <table className="w-full text-sm">
                <thead className="text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="w-8 px-4 py-2" />
                    <th className="px-4 py-2">Matched phrase</th>
                    <th className="px-4 py-2">Risk</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2">Evidence</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {group.claims.map((claim) => (
                    <tr key={claim.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(claim.id)}
                          onChange={() => toggleClaimSelected(claim.id)}
                          aria-label={`Select claim: ${claim.matched_phrase}`}
                        />
                      </td>
                      <td className="px-4 py-2.5 text-gray-700">{claim.matched_phrase}</td>
                      <td className="px-4 py-2.5">
                        <span className="-ml-2.5 inline-block">
                          <RiskBadge risk={claim.risk_tier} />
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="-ml-2.5 inline-block">
                          <StatusBadge status={claim.status} riskTier={claim.risk_tier} />
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-500">{claim.evidence.length}</td>
                      <td className="px-4 py-2.5 text-right">
                        {claim.risk_tier === "banned" ? (
                          <Link
                            href={`/claims/${claim.id}${qs}`}
                            className="text-xs text-gray-400 hover:underline"
                            title="Banned claims can't be substantiated with evidence — the copy itself needs to change."
                          >
                            View
                          </Link>
                        ) : (
                          <Link
                            href={`/claims/${claim.id}${qs}`}
                            className="text-xs font-medium text-[#008060] hover:underline"
                          >
                            Add evidence
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
        )}
      </div>

      <div className="mt-4">{paginationBar}</div>
    </main>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Nav />
      <BillingGate>
        <ClaimsPage />
      </BillingGate>
    </Suspense>
  );
}
