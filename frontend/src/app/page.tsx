"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { EmptyState, ErrorBanner } from "@/components/Feedback";
import { useShopQuery } from "@/lib/useShopQuery";
import { getExpiryStatus } from "@/lib/expiry";
import {
  api,
  ApiError,
  type BillingStatus,
  type Claim,
  type EvidenceDocument,
  type RiskTier,
  type Scan,
} from "@/lib/api";

// Same hex values as Badge.tsx, reused here so a colour means the same
// thing on the dashboard's charts as it does on the Claims table badges.
const RISK_COLORS: Record<RiskTier, string> = {
  banned: "#8e1f0b",
  needs_substantiation: "#8a5700",
  caution: "#5c5f62",
};
const RISK_LABELS: Record<RiskTier, string> = {
  banned: "Banned",
  needs_substantiation: "Needs substantiation",
  caution: "Caution",
};
const STATUS_COLORS: Record<Claim["status"], string> = {
  substantiated: "#0c5132",
  unsubstantiated: "#8a5700",
  dismissed: "#5c5f62",
};
const STATUS_LABELS: Record<Claim["status"], string> = {
  substantiated: "Substantiated",
  unsubstantiated: "Unsubstantiated",
  dismissed: "Dismissed",
};

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function withFilter(qs: string, extra: Record<string, string>): string {
  const params = new URLSearchParams(qs.startsWith("?") ? qs.slice(1) : qs);
  for (const [k, v] of Object.entries(extra)) params.set(k, v);
  const s = params.toString();
  return s ? `?${s}` : "";
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function donutArcPath(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  startAngle: number,
  endAngle: number
) {
  const startOuter = polarToCartesian(cx, cy, outerR, endAngle);
  const endOuter = polarToCartesian(cx, cy, outerR, startAngle);
  const startInner = polarToCartesian(cx, cy, innerR, endAngle);
  const endInner = polarToCartesian(cx, cy, innerR, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return [
    "M", startOuter.x, startOuter.y,
    "A", outerR, outerR, 0, largeArc, 0, endOuter.x, endOuter.y,
    "L", endInner.x, endInner.y,
    "A", innerR, innerR, 0, largeArc, 1, startInner.x, startInner.y,
    "Z",
  ].join(" ");
}

// SVG rather than a CSS conic-gradient so each wedge is its own element —
// needed to make segments individually clickable, not just their legend row.
function Donut({
  segments,
  size = 128,
}: {
  segments: { label: string; value: number; color: string; href: string }[];
  size?: number;
}) {
  const router = useRouter();
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const cx = 50;
  const cy = 50;
  const outerR = 45;
  const innerR = 27;

  let cumulative = 0;
  const nonZero = segments.filter((s) => s.value > 0);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        role="img"
        aria-label={segments.map((s) => `${s.label}: ${s.value}`).join(", ")}
      >
        {total === 0 ? (
          <circle cx={cx} cy={cy} r={(outerR + innerR) / 2} fill="none" stroke="#f1f2f4" strokeWidth={outerR - innerR} />
        ) : nonZero.length === 1 ? (
          <circle
            cx={cx}
            cy={cy}
            r={(outerR + innerR) / 2}
            fill="none"
            stroke={nonZero[0].color}
            strokeWidth={outerR - innerR}
            className="cursor-pointer transition-opacity hover:opacity-80"
            onClick={() => router.push(nonZero[0].href)}
          >
            <title>{`${nonZero[0].label}: ${nonZero[0].value}`}</title>
          </circle>
        ) : (
          nonZero.map((s) => {
            const start = (cumulative / total) * 360;
            cumulative += s.value;
            const end = (cumulative / total) * 360;
            return (
              <path
                key={s.label}
                d={donutArcPath(cx, cy, outerR, innerR, start, end)}
                fill={s.color}
                className="cursor-pointer transition-opacity hover:opacity-80"
                onClick={() => router.push(s.href)}
              >
                <title>{`${s.label}: ${s.value}`}</title>
              </path>
            );
          })
        )}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-lg font-semibold text-gray-900">
        {total}
      </div>
    </div>
  );
}

function DonutLegend({
  segments,
}: {
  segments: { label: string; value: number; color: string; href: string }[];
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  return (
    <ul className="space-y-1.5 text-sm">
      {segments.map((s) => (
        <li key={s.label}>
          <Link
            href={s.href}
            className="flex items-center gap-2 rounded px-1 -mx-1 hover:bg-gray-50"
          >
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: s.color }}
            />
            <span className="flex-1 text-gray-700 hover:underline">{s.label}</span>
            <span className="font-medium text-gray-900">{s.value}</span>
            <span className="w-10 text-right text-xs text-gray-400">
              {total > 0 ? Math.round((s.value / total) * 100) : 0}%
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function BarList({
  items,
}: {
  items: { label: string; value: number; href: string }[];
}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="space-y-2.5">
      {items.map((item, i) => (
        <Link
          key={`${item.label}-${i}`}
          href={item.href}
          className="flex items-center gap-3 rounded px-1 -mx-1 text-sm hover:bg-gray-50"
        >
          <div className="w-36 shrink-0 truncate text-gray-700 hover:underline" title={item.label}>
            {item.label}
          </div>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-[#008060]"
              style={{ width: `${(item.value / max) * 100}%` }}
            />
          </div>
          <div className="w-6 shrink-0 text-right text-gray-500">{item.value}</div>
        </Link>
      ))}
    </div>
  );
}

function StatCard({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link
      href={href}
      className="block rounded-lg border border-gray-200 bg-white p-4 hover:border-[#008060] hover:shadow-sm"
    >
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p>
    </Link>
  );
}

function DashboardPage() {
  const shop = useSearchParams().get("shop");
  const qs = useShopQuery();

  const [claims, setClaims] = useState<Claim[] | null>(null);
  const [evidenceDocs, setEvidenceDocs] = useState<EvidenceDocument[] | null>(null);
  const [scan, setScan] = useState<Scan | null | undefined>(undefined);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  // Captured at the moment a manual scan is triggered, from whether the
  // store had never been scanned at all — the "manual" triggered_by tag
  // Scan rows carry is identical for a genuine first scan (clicked from the
  // welcome screen) and an ordinary re-scan, so it can't disambiguate the
  // two on its own once a poll overwrites `scan` mid-run.
  const [manualScanWasFirst, setManualScanWasFirst] = useState(false);

  useEffect(() => {
    if (!shop) return;
    api.listClaims().then(setClaims).catch((e: ApiError) => setError(e.message));
    api.listEvidence().then(setEvidenceDocs).catch(() => {});
    api.billingStatus().then(setBillingStatus).catch(() => {});
    api
      .getLatestScan()
      .then((s) => {
        setScan(s);
        setScanning(!!s && s.completed_at === null);
      })
      .catch(() => setScan(null));
  }, [shop]);

  useEffect(() => {
    if (!scanning) return;
    const interval = setInterval(async () => {
      try {
        const latest = await api.getLatestScan();
        setScan(latest);
        if (latest?.completed_at) {
          setScanning(false);
          api.listClaims().then(setClaims).catch(() => {});
        }
      } catch {
        // Transient poll failure — try again on the next tick.
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [scanning]);

  const [subscribing, setSubscribing] = useState(false);

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

  async function handleScanNow() {
    setError(null);
    try {
      await api.triggerScan();
      // `scan` is still whatever was loaded before this click — null only
      // when no scan has ever run for this store, regardless of what the
      // upcoming poll later overwrites it with.
      setManualScanWasFirst(scan === null);
      setScanning(true);
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 409
          ? "A scan is already in progress."
          : e instanceof ApiError
            ? e.message
            : "Could not start a scan."
      );
    }
  }

  const riskSegments = useMemo(() => {
    const counts: Record<RiskTier, number> = { banned: 0, needs_substantiation: 0, caution: 0 };
    for (const c of claims ?? []) counts[c.risk_tier]++;
    return (Object.keys(counts) as RiskTier[]).map((tier) => ({
      label: RISK_LABELS[tier],
      value: counts[tier],
      color: RISK_COLORS[tier],
      href: `/claims${withFilter(qs, { risk: tier })}`,
    }));
  }, [claims, qs]);

  const statusSegments = useMemo(() => {
    const counts: Record<Claim["status"], number> = {
      unsubstantiated: 0,
      substantiated: 0,
      dismissed: 0,
    };
    for (const c of claims ?? []) counts[c.status]++;
    return (Object.keys(counts) as Claim["status"][]).map((status) => ({
      label: STATUS_LABELS[status],
      value: counts[status],
      color: STATUS_COLORS[status],
      href: `/claims${withFilter(qs, { status })}`,
    }));
  }, [claims, qs]);

  const topCategories = useMemo(() => {
    if (!claims || !shop) return [];
    const UNCATEGORIZED = "__uncategorized__";
    const counts = new Map<string, number>();
    for (const c of claims) {
      // Only products carry a category — blog/page claims have none and
      // fall into "Uncategorized" alongside products without one set.
      const key = c.category_full_name || UNCATEGORIZED;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([category, count]) => ({
        label: category === UNCATEGORIZED ? "Uncategorized" : category,
        value: count,
        href: `/claims${withFilter(qs, { category })}`,
      }));
  }, [claims, shop, qs]);

  const evidenceStats = useMemo(() => {
    const docs = evidenceDocs ?? [];
    return {
      total: docs.length,
      expired: docs.filter((d) => getExpiryStatus(d.expires_at) === "expired").length,
      expiringSoon: docs.filter((d) => getExpiryStatus(d.expires_at) === "expiring_soon").length,
    };
  }, [evidenceDocs]);

  if (!shop) {
    return <EmptyState message="No shop context — open this app from your Shopify admin." />;
  }

  const loading = claims === null || scan === undefined;
  const neverScanned = !loading && scan === null && !scanning;
  const scannedButEmpty = !loading && !scanning && scan !== null && claims && claims.length === 0;
  // A re-scan on a store that already has data shouldn't blank the
  // dashboard or claim to be the "first" scan — only the automatic
  // install-triggered scan, or a manual scan clicked from the empty
  // "never scanned" welcome screen, actually is.
  const isFirstScanInProgress = scanning && (scan?.triggered_by === "install" || manualScanWasFirst);

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">
            An overview of flagged environmental claims across your store.
          </p>
        </div>
        <button
          onClick={handleScanNow}
          disabled={scanning}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {scanning ? "Scanning…" : "Re-scan now"}
        </button>
      </div>

      <p className="mt-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
        From 27 Sept 2026, EU law (Directive (EU) 2024/825) bans misleading environmental claims
        — fines can reach 4% of annual turnover.{" "}
        <Link href={`/settings${qs}`} className="font-medium text-[#008060] hover:underline">
          Learn more
        </Link>
      </p>

      {billingStatus && !billingStatus.has_active_subscription && (
        <div className="mt-3 flex items-center justify-between gap-4 rounded-md border border-[#008060] bg-[#f1f8f6] px-4 py-3">
          <p className="text-sm text-gray-700">
            This is what we found. Subscribe to open Claims, the Evidence vault, and Settings so
            you can fix it.
          </p>
          <button
            onClick={handleSubscribe}
            disabled={subscribing}
            className="shrink-0 rounded-md bg-[#008060] px-4 py-2 text-sm font-medium text-white hover:bg-[#006e52] disabled:opacity-50"
          >
            {subscribing ? "Redirecting…" : "Subscribe — $29.99/mo"}
          </button>
        </div>
      )}

      {error && <ErrorBanner message={error} />}

      {loading ? (
        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          Loading…
        </div>
      ) : isFirstScanInProgress || neverScanned ? (
        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-8">
          <h2 className="text-base font-semibold text-gray-900">
            {isFirstScanInProgress ? "Your first scan is running…" : "Welcome to Green Claims"}
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-gray-600">
            This app scans your product catalogue and blog/page copy for environmental claims —
            phrases like &ldquo;eco-friendly&rdquo; or &ldquo;carbon neutral&rdquo; that EU
            regulation either requires evidence for or bans outright. Flagged claims show up on
            the Claims tab, grouped by product, where you can link supporting evidence or dismiss
            false positives.
          </p>
          <p className="mt-2 text-sm text-gray-600">
            {isFirstScanInProgress
              ? "Your catalogue is being scanned now — this page will update automatically once it's done."
              : "No scan has run yet."}
          </p>
          {!isFirstScanInProgress && (
            <button
              onClick={handleScanNow}
              className="mt-4 rounded-md bg-[#008060] px-4 py-2 text-sm font-medium text-white hover:bg-[#006e52]"
            >
              Run first scan
            </button>
          )}
          <p className="mt-4 text-xs text-gray-400">
            Want to understand exactly what gets flagged and why?{" "}
            <Link href={`/settings${qs}`} className="text-[#008060] hover:underline">
              See how detection works
            </Link>
            .
          </p>
        </div>
      ) : scannedButEmpty ? (
        <div className="mt-6 rounded-lg border border-[#b7dcc4] bg-[#e3f1df] p-8">
          <h2 className="text-base font-semibold text-[#0c5132]">No claims flagged — nice.</h2>
          <p className="mt-2 max-w-2xl text-sm text-[#0c5132]">
            Your last scan{" "}
            {scan?.completed_at ? `(${formatRelativeTime(scan.completed_at)})` : ""} didn&rsquo;t
            find any environmental claims in your product or blog/page copy. If you add copy that
            mentions sustainability, eco-friendliness, or similar later, it&rsquo;ll be picked up
            on the next scan.
          </p>
          <p className="mt-3 text-xs text-[#0c5132]">
            <Link href={`/settings${qs}`} className="underline">
              See the full list of terms this app looks for
            </Link>
            .
          </p>
        </div>
      ) : (
        <>
          <p className="mt-4 text-xs text-gray-400">
            {scan?.completed_at &&
              `Last scanned ${formatRelativeTime(scan.completed_at)} — ${scan.claims_found ?? 0} claims found`}
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Total claims" value={claims?.length ?? 0} href={`/claims${qs}`} />
            <StatCard
              label="Banned"
              value={riskSegments.find((s) => s.label === "Banned")?.value ?? 0}
              href={`/claims${withFilter(qs, { risk: "banned" })}`}
            />
            <StatCard
              label="Substantiated"
              value={statusSegments.find((s) => s.label === "Substantiated")?.value ?? 0}
              href={`/claims${withFilter(qs, { status: "substantiated" })}`}
            />
            <StatCard
              label="Evidence documents"
              value={evidenceStats.total}
              href={`/evidence${qs}`}
            />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-gray-900">Claims by risk</h2>
              <div className="mt-3 flex items-center gap-4">
                <Donut segments={riskSegments} />
                <DonutLegend segments={riskSegments} />
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-gray-900">Claims by status</h2>
              <div className="mt-3 flex items-center gap-4">
                <Donut segments={statusSegments} />
                <DonutLegend segments={statusSegments} />
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-gray-900">Most-flagged categories</h2>
              {topCategories.length === 0 ? (
                <p className="mt-3 text-sm text-gray-500">No claims yet.</p>
              ) : (
                <div className="mt-3">
                  <BarList items={topCategories} />
                </div>
              )}
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-gray-900">Evidence vault</h2>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Documents uploaded</span>
                  <span className="font-medium text-gray-900">{evidenceStats.total}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Expiring within 30 days</span>
                  <span className="font-medium text-[#8a5700]">{evidenceStats.expiringSoon}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Expired</span>
                  <span className="font-medium text-[#8e1f0b]">{evidenceStats.expired}</span>
                </div>
              </div>
              <Link
                href={`/evidence${qs}`}
                className="mt-4 inline-block text-xs font-medium text-[#008060] hover:underline"
              >
                Go to evidence vault →
              </Link>
            </div>
          </div>

          <div className="mt-6 flex items-center gap-4 text-sm">
            <Link href={`/claims${qs}`} className="font-medium text-[#008060] hover:underline">
              View all claims →
            </Link>
            <Link href={`/settings${qs}`} className="font-medium text-[#008060] hover:underline">
              Settings →
            </Link>
          </div>
        </>
      )}
    </main>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Nav />
      <DashboardPage />
    </Suspense>
  );
}
