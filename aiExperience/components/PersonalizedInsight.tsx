// Small, presentation-only component. Deliberately contains NO
// deterministic business logic — it only renders whatever candidate
// useInventoryPersonalizedInsight already resolved. All eligibility/
// priority/tie-break/batch-quantity decisions live in ../providers,
// ../utils, and ../resolver, never here. Styling follows this repo's
// existing plain-Tailwind convention (see component/PromoBanner.tsx) rather
// than introducing a new design-token system.

import React from 'react';
import { AlertTriangle, PackageX } from 'lucide-react';
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
};

export default function PersonalizedInsight({ candidate }: PersonalizedInsightProps) {
  const style = PRIORITY_STYLES[candidate.priority];
  // Defensive only — this first slice's resolver only ever produces
  // CRITICAL/HIGH candidates, so `style` is never actually undefined today.
  if (!style) return null;

  return (
    <div className={`rounded-2xl border p-4 shadow-sm flex items-center gap-3 ${style.wrapperClass}`}>
      <div className="flex-shrink-0">{style.icon}</div>
      <p className="flex-1 text-sm font-semibold">{candidate.message}</p>
    </div>
  );
}
