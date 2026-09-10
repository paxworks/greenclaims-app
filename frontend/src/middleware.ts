import { NextRequest, NextResponse } from "next/server";

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

  try {
    const statusUrl = new URL(`/auth/status?shop=${encodeURIComponent(shop)}`, req.url);
    const res = await fetch(statusUrl, { headers: { accept: "application/json" } });
    if (res.ok) {
      const { installed } = (await res.json()) as { installed: boolean };
      if (!installed) {
        const installUrl = new URL(`/auth/install?shop=${encodeURIComponent(shop)}`, req.url);
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
