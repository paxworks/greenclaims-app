import type { ClaimStatus, RiskTier } from "@/lib/api";

const STATUS_STYLES: Record<ClaimStatus, string> = {
  substantiated: "bg-[#E3F3EF] text-[#008060] border-[#BADFD3]",
  unsubstantiated: "bg-[#FBF1D6] text-[#B98900] border-[#EFD98A]",
  dismissed: "bg-[#f1f2f4] text-[#5c5f62] border-[#d2d5d8]",
};

const STATUS_LABELS: Record<ClaimStatus, string> = {
  substantiated: "Substantiated",
  unsubstantiated: "Unsubstantiated",
  dismissed: "Dismissed",
};

const RISK_STYLES: Record<RiskTier, string> = {
  banned: "bg-[#fbeae5] text-[#D82C0D] border-[#f3c6b9]",
  needs_substantiation: "bg-[#FBF1D6] text-[#B98900] border-[#EFD98A]",
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

export function StatusBadge({ status, riskTier }: { status: ClaimStatus; riskTier?: RiskTier }) {
  // "Unsubstantiated" implies evidence could resolve it — not true for a
  // banned claim, which can never be substantiated (the copy itself has to
  // change). Distinct label so it doesn't read as "just needs a cert".
  if (riskTier === "banned" && status === "unsubstantiated") {
    return <span className={badgeClass(RISK_STYLES.banned)}>Needs copy change</span>;
  }
  return <span className={badgeClass(STATUS_STYLES[status])}>{STATUS_LABELS[status]}</span>;
}

export function RiskBadge({ risk }: { risk: RiskTier }) {
  return <span className={badgeClass(RISK_STYLES[risk])}>{RISK_LABELS[risk]}</span>;
}
