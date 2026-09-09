"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Nav } from "@/components/Nav";
import { EmptyState, ErrorBanner } from "@/components/Feedback";
import { api, ApiError, type BillingStatus } from "@/lib/api";

const PLANS: { tier: "basic" | "pro"; name: string; price: string; features: string[] }[] = [
  {
    tier: "basic",
    name: "Basic",
    price: "$19.99/mo",
    features: ["Up to 500 products scanned", "Evidence vault", "Audit export"],
  },
  {
    tier: "pro",
    name: "Pro",
    price: "$39.99/mo",
    features: ["Unlimited products scanned", "Evidence vault", "Audit export", "Auto re-scan on edit"],
  },
];

function Billing() {
  const shop = useSearchParams().get("shop");
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subscribing, setSubscribing] = useState<string | null>(null);

  useEffect(() => {
    if (!shop) return;
    api
      .billingStatus()
      .then(setStatus)
      .catch((e: ApiError) => setError(e.message));
  }, [shop]);

  async function handleSubscribe(tier: "basic" | "pro") {
    setSubscribing(tier);
    setError(null);
    try {
      const { confirmation_url } = await api.subscribe(tier);
      // Billing approval must happen in the top-level browser window, not
      // the embedded admin iframe — Shopify rejects an iframed
      // confirmation page.
      window.open(confirmation_url, "_top");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not start checkout.");
      setSubscribing(null);
    }
  }

  if (!shop) return <EmptyState message="No shop context — open this app from your Shopify admin." />;

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-xl font-semibold text-gray-900">Billing</h1>
      <p className="mt-1 text-sm text-gray-500">Manage your Green Claims plan.</p>

      {error && <ErrorBanner message={error} />}

      {status && (
        <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4 text-sm">
          Current plan: <span className="font-medium capitalize">{status.plan_tier}</span>
          {status.product_limit !== null && (
            <span className="text-gray-500"> · up to {status.product_limit} products scanned</span>
          )}
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4">
        {PLANS.map((plan) => (
          <div key={plan.tier} className="rounded-lg border border-gray-200 bg-white p-6">
            <h2 className="text-base font-semibold text-gray-900">{plan.name}</h2>
            <p className="mt-1 text-2xl font-semibold text-gray-900">{plan.price}</p>
            <ul className="mt-4 space-y-2 text-sm text-gray-600">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <span className="mt-0.5 text-[#008060]">✓</span>
                  {f}
                </li>
              ))}
            </ul>
            <button
              onClick={() => handleSubscribe(plan.tier)}
              disabled={subscribing !== null || status?.plan_tier === plan.tier}
              className="mt-6 w-full rounded-md bg-[#008060] px-4 py-2 text-sm font-medium text-white hover:bg-[#006e52] disabled:opacity-50"
            >
              {status?.plan_tier === plan.tier
                ? "Current plan"
                : subscribing === plan.tier
                  ? "Redirecting…"
                  : `Choose ${plan.name}`}
            </button>
          </div>
        ))}
      </div>

      <p className="mt-6 text-xs text-gray-400">
        No free tier — Basic is the entry point for all merchants. Charges are billed exclusively
        through Shopify.
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
