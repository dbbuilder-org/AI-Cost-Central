/**
 * Pricing page — placeholder, full content in Sprint 3.
 */
import Link from "next/link";
import { PLAN_LIMITS } from "@/lib/plans";

const PLANS = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Get started with AI cost tracking",
    cta: "Get Started",
    ctaHref: "/sign-up",
    highlight: false,
    features: [
      "1 team member",
      "2 API keys",
      "28-day history",
      "1 AI analysis per day",
      "Basic dashboard",
    ],
  },
  {
    name: "Growth",
    price: "$49",
    period: "/month",
    description: "For growing teams who need more",
    cta: "Start Free Trial",
    ctaHref: "/sign-up",
    highlight: true,
    features: [
      "Up to 10 members",
      "Unlimited API keys",
      "90-day history",
      "Anomaly alerts + email briefs",
      "Spend forecasting",
      "3 divisions / teams",
    ],
  },
  {
    name: "Business",
    price: "$149",
    period: "/month",
    description: "For organizations that need full control",
    cta: "Start Free Trial",
    ctaHref: "/sign-up",
    highlight: false,
    features: [
      "Unlimited members",
      "Unlimited API keys",
      "365-day history",
      "Unlimited divisions",
      "Budget limits per project",
      "API access",
    ],
  },
];

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 py-20 px-6">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <h1 className="text-4xl font-bold text-white">Simple, Transparent Pricing</h1>
          <p className="text-gray-400 mt-4 text-lg">Start free. Upgrade when you need more.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-2xl p-8 border ${
                plan.highlight
                  ? "border-indigo-500 bg-indigo-900/20"
                  : "border-gray-800 bg-gray-900"
              }`}
            >
              {plan.highlight && (
                <div className="text-xs text-indigo-400 font-semibold uppercase tracking-wide mb-3">
                  Most Popular
                </div>
              )}
              <div className="mb-6">
                <h2 className="text-xl font-bold text-white">{plan.name}</h2>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className="text-4xl font-bold text-white">{plan.price}</span>
                  <span className="text-gray-400 text-sm">{plan.period}</span>
                </div>
                <p className="text-gray-400 text-sm mt-2">{plan.description}</p>
              </div>

              <Link
                href={plan.ctaHref}
                className={`block text-center py-2.5 rounded-lg font-semibold text-sm mb-8 transition-colors ${
                  plan.highlight
                    ? "bg-indigo-600 hover:bg-indigo-500 text-white"
                    : "bg-gray-800 hover:bg-gray-700 text-gray-300"
                }`}
              >
                {plan.cta}
              </Link>

              <ul className="space-y-3">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-gray-300">
                    <span className="text-green-400">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="text-center mt-12">
          <p className="text-gray-500 text-sm">
            Annual billing saves 20% (2 months free).{" "}
            <Link href="/sign-up" className="text-indigo-400 hover:underline">
              Enterprise?
            </Link>{" "}
            Contact us.
          </p>
        </div>
      </div>
    </main>
  );
}
