"use client";

import { useSearchParams } from "next/navigation";

/**
 * Shopify passes `shop` (and `host`, for embedded apps) as query params on
 * every load. Preserve them across our own internal navigation so a reload
 * or a fresh App Bridge session token request always has them available.
 */
export function useShopQuery(): string {
  const params = useSearchParams();
  const shop = params.get("shop");
  const host = params.get("host");
  const out = new URLSearchParams();
  if (shop) out.set("shop", shop);
  if (host) out.set("host", host);
  const qs = out.toString();
  return qs ? `?${qs}` : "";
}
