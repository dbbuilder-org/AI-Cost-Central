"use client";

import Link from "next/link";

interface PlanGateProps {
  /** Whether the user's plan includes this feature */
  allowed: boolean;
  /** Feature name for the upgrade prompt */
  featureName: string;
  /** Minimum plan required */
  requiredPlan?: "growth" | "business" | "enterprise";
  children: React.ReactNode;
}

export function PlanGate({ allowed, featureName, requiredPlan = "growth", children }: PlanGateProps) {
  if (allowed) return <>{children}</>;

  const PLAN_LABELS: Record<string, string> = {
    growth: "Growth ($49/mo)",
    business: "Business ($149/mo)",
    enterprise: "Enterprise",
  };

  return (
    <div className="relative rounded-xl border border-dashed border-gray-800 overflow-hidden">
      {/* Blurred preview */}
      <div className="pointer-events-none select-none blur-sm opacity-40">
        {children}
      </div>
      {/* Overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-950/80 backdrop-blur-sm p-6 text-center">
        <div className="text-2xl mb-3">🔒</div>
        <h3 className="text-white font-semibold mb-1">{featureName}</h3>
        <p className="text-gray-400 text-sm mb-4">
          Available on {PLAN_LABELS[requiredPlan]} and above
        </p>
        <Link
          href="/billing"
          className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Upgrade Plan
        </Link>
      </div>
    </div>
  );
}
