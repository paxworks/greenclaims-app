"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { Nav } from "@/components/Nav";
import { BillingGate } from "@/components/BillingGate";
import { RiskBadge } from "@/components/Badge";
import { EmptyState, ErrorBanner } from "@/components/Feedback";
import { api, ApiError, type RiskTier, type TermList } from "@/lib/api";

const CUSTOM_TIER_OPTIONS: { value: "needs_substantiation" | "caution"; label: string }[] = [
  { value: "needs_substantiation", label: "Needs substantiation" },
  { value: "caution", label: "Caution (manual review only)" },
];

const LOCALE_NAMES: Record<string, string> = {
  en: "English",
  de: "German",
  fr: "French",
  es: "Spanish",
  it: "Italian",
};

function SettingsPage() {
  const shop = useSearchParams().get("shop");

  const [terms, setTerms] = useState<TermList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newPhrase, setNewPhrase] = useState("");
  const [newTier, setNewTier] = useState<"needs_substantiation" | "caution">("caution");
  const [changingLocale, setChangingLocale] = useState(false);

  const load = useCallback(async () => {
    try {
      setTerms(await api.getTermList());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load the term list.");
    }
  }, []);

  useEffect(() => {
    if (shop) load();
  }, [shop, load]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newPhrase.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.addCustomTerm(newPhrase.trim(), newTier);
      setNewPhrase("");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not add that term.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      await api.deleteCustomTerm(id);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not remove that term.");
    }
  }

  async function handleLocaleChange(locale: string) {
    setChangingLocale(true);
    setError(null);
    try {
      await api.updateLocale(locale);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not update the store language.");
    } finally {
      setChangingLocale(false);
    }
  }

  if (!shop) return <EmptyState message="No shop context — open this app from your Shopify admin." />;

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-xl font-semibold text-gray-900">Settings</h1>
      <p className="mt-1 text-sm text-gray-500">
        How claim detection works, and your store&rsquo;s own flagged terms.
      </p>

      {error && <ErrorBanner message={error} />}

      <section className="mt-6 rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-700">
        <h2 className="text-sm font-semibold text-gray-900">Why this matters</h2>
        <p className="mt-2">
          The EU&rsquo;s Empowering Consumers for the Green Transition Directive (Directive (EU)
          2024/825) applies from 27 September 2026 and bans misleading environmental claims
          (&ldquo;greenwashing&rdquo;) in commercial communications, including product listings
          and marketing copy. National consumer authorities can fine non-compliant traders up to
          4% of annual turnover (or €2 million where turnover isn&rsquo;t available), alongside
          other remedies such as ordering the claim removed.
        </p>
        <p className="mt-2 text-xs text-gray-500">
          This is general information, not legal advice — it doesn&rsquo;t guarantee regulatory
          compliance. See the full{" "}
          <a
            href="https://paxworks.io/greenclaims-privacy"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            privacy policy
          </a>{" "}
          and{" "}
          <a
            href="https://paxworks.io/greenclaims-terms"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            terms
          </a>
          .
        </p>
      </section>

      <section className="mt-4 rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-700">
        <h2 className="text-sm font-semibold text-gray-900">How flagging works</h2>
        <p className="mt-2">
          Every synced product, blog article, and page is scanned against a fixed list of
          environmental terms. A claim is created the first time a phrase is found — editing
          the copy later doesn&rsquo;t remove an existing claim, since a merchant may already be
          substantiating it.
        </p>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li>
            <span className="font-medium text-[#D82C0D]">Banned</span> — phrases the EU bans
            outright (e.g. &ldquo;carbon neutral&rdquo;, &ldquo;net zero&rdquo;), because they
            rely on carbon offsetting rather than an actual reduction in emissions. These can
            never be substantiated away — the copy itself needs to change.
          </li>
          <li>
            <span className="font-medium text-[#B98900]">Needs substantiation</span> — a genuine
            environmental claim (e.g. &ldquo;eco-friendly&rdquo;, &ldquo;sustainable&rdquo;) that
            is legal to make, but only if you can back it up. Link evidence (a certificate, lab
            result, or LCA report) to move it to &ldquo;substantiated&rdquo;.
          </li>
          <li>
            <span className="font-medium text-[#5c5f62]">Caution</span> — an ambiguous word
            (&ldquo;green&rdquo;, &ldquo;natural&rdquo;, &ldquo;clean&rdquo;,
            &ldquo;responsible&rdquo;) that often isn&rsquo;t an environmental claim at all (a
            colour, a material, a marketing phrase). It only escalates to &ldquo;needs
            substantiation&rdquo; when an environmental word (&ldquo;carbon&rdquo;,
            &ldquo;organic&rdquo;, &ldquo;emission&rdquo;, etc.) appears nearby in the same copy
            — otherwise it&rsquo;s left for manual review rather than treated as a real claim.
          </li>
        </ul>
        <p className="mt-3 text-xs text-gray-500">
          The core list below is fixed and can&rsquo;t be edited or removed — it reflects actual
          EU regulatory requirements, so weakening it would defeat the point of the app. You can
          add your own terms underneath it (brand language, industry-specific phrases) to extend
          detection for your store.
        </p>
      </section>

      {terms === null && !error ? (
        <div className="mt-4 rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          Loading…
        </div>
      ) : terms ? (
        <>
          <section className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
            <label htmlFor="store-locale" className="text-sm font-semibold text-gray-900">
              Store language
            </label>
            <p className="mt-1 text-xs text-gray-500">
              Which language your product and blog/page copy is written in — detection runs
              against this language&rsquo;s term list. We can&rsquo;t read this from Shopify
              directly, so set it here; it doesn&rsquo;t have to match your admin&rsquo;s locale.
            </p>
            <select
              id="store-locale"
              value={terms.locale}
              disabled={changingLocale}
              onChange={(e) => handleLocaleChange(e.target.value)}
              className="mt-2 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 disabled:opacity-50"
            >
              {Object.entries(LOCALE_NAMES).map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
            {changingLocale && (
              <span className="ml-2 text-xs text-gray-500">Updating and re-scanning…</span>
            )}
          </section>

          <section className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4 opacity-60">
            <div className="flex items-center justify-between">
              <label htmlFor="ai-suggestions" className="text-sm font-semibold text-gray-900">
                AI-suggested rewordings
              </label>
              <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600">
                Coming soon
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Generate a compliant rewording suggestion for a flagged claim, so you don&rsquo;t
              have to draft replacement copy from scratch — especially useful for banned claims,
              which can&rsquo;t be fixed with evidence and need the wording itself to change.
            </p>
            <button
              id="ai-suggestions"
              type="button"
              disabled
              className="mt-2 cursor-not-allowed rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-400"
            >
              Enable AI suggestions
            </button>
          </section>

          <section className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-100 bg-gray-50 px-4 py-2.5">
              <span className="text-sm font-semibold text-gray-900">
                Fixed term list (EU-mandated, read-only)
              </span>
              <span className="ml-2 text-xs text-gray-500">
                — matched in {LOCALE_NAMES[terms.locale] ?? terms.locale}
              </span>
            </div>
            <table className="w-full text-sm">
              <thead className="text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2">Phrase</th>
                  <th className="px-4 py-2">Risk</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {terms.core_terms.map((t) => (
                  <tr key={t.phrase}>
                    <td className="px-4 py-2 text-gray-700">{t.phrase}</td>
                    <td className="px-4 py-2">
                      <RiskBadge risk={t.risk_tier as RiskTier} />
                    </td>
                  </tr>
                ))}
                {terms.ambiguous_terms.map((t) => (
                  <tr key={t.phrase}>
                    <td className="px-4 py-2 text-gray-700">{t.phrase}</td>
                    <td className="px-4 py-2 text-xs text-gray-500">
                      Needs substantiation or caution, depending on context
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-100 bg-gray-50 px-4 py-2.5">
              <span className="text-sm font-semibold text-gray-900">Your custom terms</span>
            </div>

            {terms.custom_terms.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-500">
                No custom terms yet — add one below.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-2">Phrase</th>
                    <th className="px-4 py-2">Risk</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {terms.custom_terms.map((t) => (
                    <tr key={t.id}>
                      <td className="px-4 py-2 text-gray-700">{t.phrase}</td>
                      <td className="px-4 py-2">
                        <RiskBadge risk={t.risk_tier} />
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button
                          onClick={() => handleDelete(t.id)}
                          className="text-xs text-gray-500 hover:text-red-600"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <form
              onSubmit={handleAdd}
              className="flex flex-wrap items-end gap-3 border-t border-gray-100 p-4"
            >
              <div className="min-w-[200px] flex-1">
                <label className="block text-xs font-medium text-gray-500">Phrase</label>
                <input
                  type="text"
                  value={newPhrase}
                  onChange={(e) => setNewPhrase(e.target.value)}
                  placeholder="e.g. ecoweave"
                  required
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500">Risk tier</label>
                <select
                  value={newTier}
                  onChange={(e) =>
                    setNewTier(e.target.value as "needs_substantiation" | "caution")
                  }
                  className="mt-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                >
                  {CUSTOM_TIER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                disabled={busy}
                className="rounded-md bg-[#008060] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#006e52] disabled:opacity-50"
              >
                {busy ? "Adding…" : "Add term"}
              </button>
            </form>
            <p className="px-4 pb-4 text-xs text-gray-400">
              Adding a term re-scans your already-synced catalogue automatically — new claims
              appear on the Claims page shortly after.
            </p>
          </section>
        </>
      ) : null}

      <section className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        <h2 className="text-sm font-semibold text-amber-900">Data &amp; privacy</h2>
        <p className="mt-2">
          Uninstalling this app deletes all associated data — scanned products, claims, uploaded
          evidence, and audit exports — within 48 hours, per Shopify&rsquo;s mandatory deletion
          policy. There is no grace period and no exception for uploaded evidence: everything
          goes in the same purge.
        </p>
        <p className="mt-2 font-medium">
          Download any evidence packs or audit exports you need before uninstalling — once the
          purge runs, they cannot be recovered.
        </p>
        <p className="mt-2 text-xs text-amber-800">
          Full privacy policy:{" "}
          <a
            href="https://paxworks.io/greenclaims-privacy"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            paxworks.io/greenclaims-privacy
          </a>
        </p>
      </section>
    </main>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Nav />
      <BillingGate>
        <SettingsPage />
      </BillingGate>
    </Suspense>
  );
}
