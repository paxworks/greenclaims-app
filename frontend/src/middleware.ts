import { NextRequest, NextResponse } from "next/server";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "https://greenclaims-api.paxworks.io";

/**
 * Shopify's automated store-review check loads the app root with a `shop`
 * param for a shop that has never installed it, and expects an immediate
 * top-level redirect into OAuth — not the embedded dashboard shell. Without
 * this, page.tsx renders straight away (it only knows how to call the API
 * with an App Bridge session token, which says nothing about whether this
 * shop has ever completed OAuth), so the grant screen never appears.
 *
 * Runs only on "/" (see matcher below) — every other route is either
 * post-install navigation within the embedded app, or /auth/* itself
 * (rewritten to the backend by next.config.js), neither of which should be
 * intercepted here.
 */
export async function middleware(req: NextRequest) {
  const shop = req.nextUrl.searchParams.get("shop");
  if (!shop) return NextResponse.next();

  // req.url/req.nextUrl reflect Railway's internal forwarding address
  // (http://localhost:8080), not the public host — confirmed via production
  // logs showing "https://localhost:8080/..." here, which broke both the
  // status fetch (TLS against a plain-HTTP internal port) and would have
  // broken the redirect Location header too. Standard forwarded headers
  // carry the real external origin.
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  const publicOrigin = `${proto}://${host}`;

  try {
    // Hit the backend directly rather than through the same-origin /auth/*
    // rewrite — avoids the internal-forwarding-address problem entirely for
    // this call, since it never needs to resolve req.url at all.
    const statusUrl = `${API_BASE_URL}/auth/status?shop=${encodeURIComponent(shop)}`;
    const res = await fetch(statusUrl, { headers: { accept: "application/json" } });
    if (res.ok) {
      const { installed } = (await res.json()) as { installed: boolean };
      if (!installed) {
        const installUrl = new URL(`/auth/install?shop=${encodeURIComponent(shop)}`, publicOrigin);
        return NextResponse.redirect(installUrl);
      }
    }
  } catch {
    // Backend unreachable — fall through and let the page render; its own
    // API calls will surface the failure rather than blocking the app on
    // this check alone.
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/",
};
