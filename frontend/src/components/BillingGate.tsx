"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useShopQuery } from "@/lib/useShopQuery";
import { api, ApiError, type BillingStatus } from "@/lib/api";

/**
 * Wraps a page's content and blurs it behind a subscribe modal until the
 * store has an active Shopify subscription. The Dashboard is intentionally
 * never wrapped in this — the free full scan on install has to be visible
 * unlocked, or there's nothing to convert on.
 */
export function BillingGate({ children }: { children: React.ReactNode }) {
  const shop = useSearchParams().get("shop");
  const qs = useShopQuery();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [subscribing, setSubscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!shop) return;
    api
      .billingStatus()
      .then(setStatus)
      .catch(() => {
        // Fail open on the loading state below rather than blocking the
        // whole page on a transient status-fetch error.
      });
  }, [shop]);

  async function handleSubscribe() {
    setSubscribing(true);
    setError(null);
    try {
      const { confirmation_url } = await api.subscribe();
      window.open(confirmation_url, "_top");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not start checkout.");
      setSubscribing(false);
    }
  }

  // Unknown yet (still loading, or shop missing) — render unlocked rather
  // than flashing the blur/modal on every fast reload.
  if (!shop || status === null) return <>{children}</>;

  if (status.has_active_subscription) return <>{children}</>;

  return (
    <div className="relative">
      <div aria-hidden className="pointer-events-none select-none blur-sm">
        {children}
      </div>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
        <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 text-center shadow-xl">
          <h2 className="text-lg font-semibold text-gray-900">Unlock full access</h2>
          <p className="mt-2 text-sm text-gray-600">
            Your Dashboard shows the compliance issues we found. Subscribe to view, manage, and
            resolve them here.
          </p>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <button
            onClick={handleSubscribe}
            disabled={subscribing}
            className="mt-4 w-full rounded-md bg-[#008060] px-4 py-2 text-sm font-medium text-white hover:bg-[#006e52] disabled:opacity-50"
          >
            {subscribing ? "Redirecting…" : "Subscribe — $29.99/mo"}
          </button>
          <a
            href={`/${qs}`}
            className="mt-3 block text-xs text-gray-500 hover:underline"
          >
            Back to Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
