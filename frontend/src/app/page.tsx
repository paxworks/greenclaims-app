import DashboardClient from "./DashboardClient";

// This route must never be served as static/prerendered content: it's
// gated by middleware.ts, which checks /auth/status for the `shop` query
// param and redirects unauthenticated top-level loads into OAuth before
// anything renders. A statically-prerendered "/" gets classified as a
// cacheable asset by Railway's edge and served without the origin server
// (and therefore middleware) ever running — force-dynamic keeps every
// request on the real request path.
export const dynamic = "force-dynamic";

export default function Page() {
  return <DashboardClient />;
}
