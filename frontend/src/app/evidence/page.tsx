"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Nav } from "@/components/Nav";
import { EmptyState, ErrorBanner } from "@/components/Feedback";
import { api, ApiError, type EvidenceDocument } from "@/lib/api";

const DOC_TYPES = [
  { value: "certificate", label: "Certificate" },
  { value: "lab_result", label: "Lab result" },
  { value: "lca", label: "LCA report" },
  { value: "other", label: "Other" },
];

function EvidenceVault() {
  const shop = useSearchParams().get("shop");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [docs, setDocs] = useState<EvidenceDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [docType, setDocType] = useState("certificate");
  const [expiresAt, setExpiresAt] = useState("");

  const load = useCallback(async () => {
    try {
      setDocs(await api.listEvidence());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load evidence.");
    }
  }, []);

  useEffect(() => {
    if (shop) load();
  }, [shop, load]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await api.uploadEvidence(file, docType, expiresAt || null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setExpiresAt("");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      await api.deleteEvidence(id);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Delete failed.");
    }
  }

  async function handleDownload(id: string) {
    try {
      const { url } = await api.downloadEvidence(id);
      window.open(url, "_blank");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not generate a download link.");
    }
  }

  if (!shop) return <EmptyState message="No shop context — open this app from your Shopify admin." />;

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-xl font-semibold text-gray-900">Evidence vault</h1>
      <p className="mt-1 text-sm text-gray-500">
        Upload certificates, lab results, and LCA reports, then link them to flagged claims.
      </p>

      {error && <ErrorBanner message={error} />}

      <form
        onSubmit={handleUpload}
        className="mt-6 flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-4"
      >
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-gray-500">File (PDF or image, max 10MB)</label>
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
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
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
          <label className="block text-xs font-medium text-gray-500">Expires (optional)</label>
          <input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="mt-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={uploading}
          className="rounded-md bg-[#008060] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#006e52] disabled:opacity-50"
        >
          {uploading ? "Uploading…" : "Upload"}
        </button>
      </form>

      <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
        {docs === null ? (
          <div className="p-8 text-center text-sm text-gray-500">Loading…</div>
        ) : docs.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">No documents uploaded yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2.5">File</th>
                <th className="px-4 py-2.5">Type</th>
                <th className="px-4 py-2.5">Uploaded</th>
                <th className="px-4 py-2.5">Expires</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {docs.map((doc) => (
                <tr key={doc.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{doc.file_name}</td>
                  <td className="px-4 py-3 text-gray-600">{doc.doc_type}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(doc.uploaded_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {doc.expires_at ? new Date(doc.expires_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDownload(doc.id)}
                      className="mr-3 text-xs text-[#008060] hover:underline"
                    >
                      Download
                    </button>
                    <button
                      onClick={() => handleDelete(doc.id)}
                      className="text-xs text-gray-500 hover:text-red-600"
                    >
                      Delete
                    </button>
                  </td>
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
      <EvidenceVault />
    </Suspense>
  );
}
