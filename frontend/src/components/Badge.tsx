import type { ClaimStatus, RiskTier } from "@/lib/api";

const STATUS_STYLES: Record<ClaimStatus, string> = {
  substantiated: "bg-[#e3f1df] text-[#0c5132] border-[#b7dcc4]",
  unsubstantiated: "bg-[#fff4e4] text-[#8a5700] border-[#ffdca8]",
  dismissed: "bg-[#f1f2f4] text-[#5c5f62] border-[#d2d5d8]",
};

const STATUS_LABELS: Record<ClaimStatus, string> = {
  substantiated: "Substantiated",
  unsubstantiated: "Unsubstantiated",
  dismissed: "Dismissed",
};

const RISK_STYLES: Record<RiskTier, string> = {
  banned: "bg-[#fbeae5] text-[#8e1f0b] border-[#f3c6b9]",
  needs_substantiation: "bg-[#fff4e4] text-[#8a5700] border-[#ffdca8]",
  caution: "bg-[#f1f2f4] text-[#5c5f62] border-[#d2d5d8]",
};

const RISK_LABELS: Record<RiskTier, string> = {
  banned: "Banned",
  needs_substantiation: "Needs substantiation",
  caution: "Caution",
};

function badgeClass(extra: string) {
  return `inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${extra}`;
}

export function StatusBadge({ status }: { status: ClaimStatus }) {
  return <span className={badgeClass(STATUS_STYLES[status])}>{STATUS_LABELS[status]}</span>;
}

export function RiskBadge({ risk }: { risk: RiskTier }) {
  return <span className={badgeClass(RISK_STYLES[risk])}>{RISK_LABELS[risk]}</span>;
}
