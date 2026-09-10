"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Nav } from "@/components/Nav";
import { EmptyState, ErrorBanner } from "@/components/Feedback";
import { api, ApiError, type BillingStatus } from "@/lib/api";

const PLAN = {
  name: "Pro",
  price: "$29.99/mo",
  features: [
    "Unlimited products & content scanned",
    "Evidence vault",
    "Audit export",
    "Auto re-scan on edit",
  ],
};

function Billing() {
  const shop = useSearchParams().get("shop");
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subscribing, setSubscribing] = useState(false);

  useEffect(() => {
    if (!shop) return;
    api
      .billingStatus()
      .then(setStatus)
      .catch((e: ApiError) => setError(e.message));
  }, [shop]);

  async function handleSubscribe() {
    setSubscribing(true);
    setError(null);
    try {
      const { confirmation_url } = await api.subscribe();
      // Billing approval must happen in the top-level browser window, not
      // the embedded admin iframe — Shopify rejects an iframed
      // confirmation page.
      window.open(confirmation_url, "_top");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not start checkout.");
      setSubscribing(false);
    }
  }

  if (!shop) return <EmptyState message="No shop context — open this app from your Shopify admin." />;

  const subscribed = status?.has_active_subscription ?? false;

  return (
    <main className="mx-auto max-w-xl px-6 py-8">
      <h1 className="text-xl font-semibold text-gray-900">Billing</h1>
      <p className="mt-1 text-sm text-gray-500">Manage your Green Claims plan.</p>

      {error && <ErrorBanner message={error} />}

      {status && (
        <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4 text-sm">
          {subscribed ? (
            <span className="font-medium text-[#008060]">Subscribed — full access</span>
          ) : (
            <span className="text-gray-600">Not subscribed yet — Claims, Evidence, and Settings are locked.</span>
          )}
        </div>
      )}

      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-base font-semibold text-gray-900">{PLAN.name}</h2>
        <p className="mt-1 text-2xl font-semibold text-gray-900">{PLAN.price}</p>
        <ul className="mt-4 space-y-2 text-sm text-gray-600">
          {PLAN.features.map((f) => (
            <li key={f} className="flex items-start gap-2">
              <span className="mt-0.5 text-[#008060]">✓</span>
              {f}
            </li>
          ))}
        </ul>
        <button
          onClick={handleSubscribe}
          disabled={subscribing || subscribed}
          className="mt-6 w-full rounded-md bg-[#008060] px-4 py-2 text-sm font-medium text-white hover:bg-[#006e52] disabled:opacity-50"
        >
          {subscribed ? "Current plan" : subscribing ? "Redirecting…" : "Subscribe"}
        </button>
      </div>

      <p className="mt-6 text-xs text-gray-400">
        Full scan results are always visible on your Dashboard. Subscribing unlocks Claims,
        Evidence vault, and Settings so you can act on what was found. Charges are billed
        exclusively through Shopify.
      </p>
    </main>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Nav />
      <Billing />
    </Suspense>
  );
}
