"use client";

import { useState } from "react";
import { PlanLimits } from "@/lib/plans";

interface BillingClientProps {
  plan: string;
  subscriptionStatus: string;
  hasStripeCustomer: boolean;
  limits: PlanLimits;
  usage: { members: number; apiKeys: number };
  planPrices: {
    growthMonthly: string;
    growthAnnual: string;
    businessMonthly: string;
    businessAnnual: string;
  };
}

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  growth: "Growth",
  business: "Business",
  enterprise: "Enterprise",
};

const STATUS_COLORS: Record<string, string> = {
  active: "text-green-400",
  trialing: "text-blue-400",
  past_due: "text-red-400",
  canceled: "text-gray-500",
  inactive: "text-gray-500",
};

function UsageBar({ used, limit, label }: { used: number; limit: number; label: string }) {
  const pct = limit === Infinity ? 0 : Math.min((used / limit) * 100, 100);
  const atLimit = limit !== Infinity && used >= limit;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-400">{label}</span>
        <span className={`text-xs ${atLimit ? "text-red-400" : "text-gray-500"}`}>
          {used} / {limit === Infinity ? "∞" : limit}
        </span>
      </div>
      {limit !== Infinity && (
        <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${atLimit ? "bg-red-500" : "bg-indigo-500"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

export function BillingClient({
  plan,
  subscriptionStatus,
  hasStripeCustomer,
  limits,
  usage,
  planPrices,
}: BillingClientProps) {
  const [loading, setLoading] = useState(false);
  const [annual, setAnnual] = useState(false);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);

  const handleUpgrade = async (priceId: string) => {
    if (!priceId) {
      setUpgradeError("Pricing not configured. Contact support.");
      return;
    }
    setLoading(true);
    setUpgradeError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
      } else {
        setUpgradeError(data.error ?? "Failed to create checkout session");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleManage = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json() as { url?: string; error?: string };
      if (data.url) window.location.href = data.url;
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Current plan */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-white font-semibold">{PLAN_LABELS[plan] ?? plan} Plan</h2>
            <p className={`text-xs mt-0.5 ${STATUS_COLORS[subscriptionStatus] ?? "text-gray-500"}`}>
              {subscriptionStatus === "active" ? "Active subscription"
                : subscriptionStatus === "trialing" ? "Trial active"
                : subscriptionStatus === "past_due" ? "Payment past due — update payment method"
                : subscriptionStatus === "canceled" ? "Subscription canceled"
                : "No active subscription"}
            </p>
          </div>
          {hasStripeCustomer && (
            <button
              onClick={handleManage}
              disabled={loading}
              className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              Manage subscription →
            </button>
          )}
        </div>

        <div className="space-y-3 pt-2 border-t border-gray-800">
          <UsageBar used={usage.members} limit={limits.members} label="Team members" />
          <UsageBar used={usage.apiKeys} limit={limits.apiKeys} label="API keys" />
          <div className="text-xs text-gray-500">
            History: {limits.historyDays === 730 ? "2 years" : `${limits.historyDays} days`}
            {" · "}
            Alerts: {limits.alertsEnabled ? "✓" : "—"}
            {" · "}
            Forecasting: {limits.forecastEnabled ? "✓" : "—"}
          </div>
        </div>
      </div>

      {/* Upgrade plans */}
      {plan === "free" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-semibold text-sm">Upgrade your plan</h3>
            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={() => setAnnual(false)}
                className={`px-3 py-1 rounded-md transition-colors ${!annual ? "bg-gray-800 text-white" : "text-gray-400"}`}
              >
                Monthly
              </button>
              <button
                onClick={() => setAnnual(true)}
                className={`px-3 py-1 rounded-md transition-colors ${annual ? "bg-gray-800 text-white" : "text-gray-400"}`}
              >
                Annual
                <span className="ml-1 text-green-400">−20%</span>
              </button>
            </div>
          </div>

          {upgradeError && (
            <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
              {upgradeError}
            </p>
          )}

          <div className="grid md:grid-cols-2 gap-4">
            {[
              {
                name: "Growth",
                price: annual ? "$470" : "$49",
                period: annual ? "/year" : "/month",
                features: ["10 members", "Unlimited keys", "90-day history", "Alerts + briefs", "Forecasting", "3 divisions"],
                priceId: annual ? planPrices.growthAnnual : planPrices.growthMonthly,
              },
              {
                name: "Business",
                price: annual ? "$1,430" : "$149",
                period: annual ? "/year" : "/month",
                features: ["Unlimited members", "365-day history", "Unlimited divisions", "Budget limits", "API access"],
                priceId: annual ? planPrices.businessAnnual : planPrices.businessMonthly,
              },
            ].map((p) => (
              <div key={p.name} className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                <div className="flex items-baseline justify-between mb-4">
                  <span className="text-white font-semibold">{p.name}</span>
                  <span className="text-white">
                    <span className="text-xl font-bold">{p.price}</span>
                    <span className="text-gray-500 text-xs">{p.period}</span>
                  </span>
                </div>
                <ul className="space-y-1.5 mb-5">
                  {p.features.map((f) => (
                    <li key={f} className="text-xs text-gray-400 flex items-center gap-1.5">
                      <span className="text-green-400">✓</span> {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => handleUpgrade(p.priceId)}
                  disabled={loading}
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-40"
                >
                  {loading ? "Redirecting…" : `Upgrade to ${p.name}`}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
