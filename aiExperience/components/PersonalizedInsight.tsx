// Small, presentation-only component. Deliberately contains NO
// deterministic business logic — it only renders whatever candidate
// useInventoryPersonalizedInsight already resolved. All eligibility/
// priority/tie-break/batch-quantity decisions live in ../providers,
// ../utils, and ../resolver, never here. Styling follows this repo's
// existing plain-Tailwind convention (see component/PromoBanner.tsx) rather
// than introducing a new design-token system.

import React from 'react';
import { AlertTriangle, PackageX, TrendingDown, CalendarClock, CheckCircle2 } from 'lucide-react';
import type { InsightCandidate, InsightPriority } from '../contracts/insightCandidate';

interface PersonalizedInsightProps {
  candidate: InsightCandidate<unknown>;
}

const PRIORITY_STYLES: Partial<Record<InsightPriority, { icon: React.ReactNode; wrapperClass: string }>> = {
  CRITICAL: {
    icon: <AlertTriangle size={18} />,
    wrapperClass: 'border-rose-200 bg-rose-50 text-rose-700',
  },
  HIGH: {
    icon: <PackageX size={18} />,
    wrapperClass: 'border-orange-200 bg-orange-50 text-orange-700',
  },
  // Low Stock — warning, one step down from the two urgent tiers above.
  MEDIUM: {
    icon: <TrendingDown size={18} />,
    wrapperClass: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  // Expiring Soon — warning/informational, matches this app's own existing
  // amber "expiring soon" convention (see MasterInventory.tsx's
  // isExpiringSoon badge styling).
  LOW: {
    icon: <CalendarClock size={18} />,
    wrapperClass: 'border-amber-100 bg-amber-50/60 text-amber-600',
  },
  // Inventory Summary — neutral/positive, not an alert.
  INFO: {
    icon: <CheckCircle2 size={18} />,
    wrapperClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
};

export default function PersonalizedInsight({ candidate }: PersonalizedInsightProps) {
  const style = PRIORITY_STYLES[candidate.priority];
  // Defensive only — every InsightPriority value now has a style entry, so
  // this is never actually undefined; kept in case a future priority value
  // is added to the contract without a matching style.
  if (!style) return null;

  return (
    <div className={`rounded-2xl border p-4 shadow-sm flex items-center gap-3 ${style.wrapperClass}`}>
      <div className="flex-shrink-0">{style.icon}</div>
      <p className="flex-1 text-sm font-semibold">{candidate.message}</p>
    </div>
  );
}
