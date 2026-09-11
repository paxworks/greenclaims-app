import DashboardClient from "./DashboardClient";

// This route must never be served as static/prerendered content: under
// Shopify's managed installation (migrated 2026-09-11), Shopify itself
// gates access before this page ever loads for an uninstalled shop — but
// this page still needs to run on every real request rather than serve a
// stale cached response, since DashboardClient's App Bridge session-token
// calls are inherently per-visit. A statically-prerendered "/" gets
// classified as a cacheable asset by Railway's edge and served without the
// origin server ever running — force-dynamic keeps every request live.
export const dynamic = "force-dynamic";

export default function Page() {
  return <DashboardClient />;
}
