"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useShopQuery } from "@/lib/useShopQuery";

const TABS = [
  { href: "/", label: "Claims" },
  { href: "/evidence", label: "Evidence vault" },
  { href: "/billing", label: "Billing" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  const pathname = usePathname();
  const qs = useShopQuery();

  return (
    <nav className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center gap-1 px-6">
        {TABS.map((tab) => {
          const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={`${tab.href}${qs}`}
              className={`border-b-2 px-3 py-3 text-sm font-medium transition-colors ${
                active
                  ? "border-[#008060] text-[#008060]"
                  : "border-transparent text-gray-600 hover:text-gray-900"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
