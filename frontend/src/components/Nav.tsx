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
    <nav className="sticky top-0 z-30 border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center gap-6 px-6">
        <a href="https://paxworks.io" target="_blank" rel="noreferrer" className="flex shrink-0 items-center gap-2 py-3">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="14 14 90 90" width="24" height="24" aria-hidden="true">
            <path d="M30 90 C28 52 52 28 94 26 C96 68 72 92 30 90 Z" fill="#4CAF7D" />
            <path d="M30 90 L20 100" stroke="#4CAF7D" strokeWidth="8" strokeLinecap="round" />
            <path d="M46 60 L57 71 L77 48" fill="none" stroke="#0B1520" strokeOpacity="0.75" strokeWidth="12.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M46 60 L57 71 L77 48" fill="none" stroke="#F5A623" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
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
