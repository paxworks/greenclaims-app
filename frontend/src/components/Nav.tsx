"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useShopQuery } from "@/lib/useShopQuery";
import { api } from "@/lib/api";
import { getExpiryStatus } from "@/lib/expiry";

const TABS = [
  { href: "/", label: "Dashboard" },
  { href: "/claims", label: "Claims" },
  { href: "/evidence", label: "Evidence vault" },
  { href: "/billing", label: "Billing" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  const pathname = usePathname();
  const qs = useShopQuery();
  const shop = useSearchParams().get("shop");
  const [expiryAlertCount, setExpiryAlertCount] = useState(0);

  useEffect(() => {
    if (!shop) return;
    api
      .listEvidence()
      .then((docs) => {
        const count = docs.filter((d) => {
          const status = getExpiryStatus(d.expires_at);
          return status === "expired" || status === "expiring_soon";
        }).length;
        setExpiryAlertCount(count);
      })
      .catch(() => {
        // Non-critical badge — a failed fetch just means no badge shows.
      });
  }, [shop]);

  return (
    <nav className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center gap-6 px-6">
        <a href="https://paxworks.io" target="_blank" rel="noreferrer" className="flex shrink-0 items-center gap-2 py-3">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="22" height="22" aria-hidden="true">
            <circle cx="32" cy="32" r="32" fill="#F5A623" />
            <rect x="19.0" y="9.6" width="6.4" height="44.8" rx="3.2" fill="#1A1A1A" />
            <rect x="19.0" y="9.6" width="25.9" height="6.4" rx="3.2" fill="#1A1A1A" />
            <rect x="19.0" y="32.0" width="25.9" height="6.4" rx="3.2" fill="#1A1A1A" />
            <rect x="38.6" y="9.6" width="6.4" height="28.8" rx="3.2" fill="#1A1A1A" />
          </svg>
          <span className="text-sm font-semibold text-gray-900">
            Green Claims <span className="font-normal text-gray-400">by Paxworks</span>
          </span>
        </a>
        <div className="h-5 w-px bg-gray-200" />
        {TABS.map((tab) => {
          const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={`${tab.href}${qs}`}
              className={`flex items-center border-b-2 px-3 py-3 text-sm font-medium transition-colors ${
                active
                  ? "border-[#008060] text-[#008060]"
                  : "border-transparent text-gray-600 hover:text-gray-900"
              }`}
            >
              {tab.label}
              {tab.href === "/evidence" && expiryAlertCount > 0 && (
                <span className="ml-1.5 inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold leading-4 text-white">
                  {expiryAlertCount}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
