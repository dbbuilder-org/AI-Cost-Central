import { Hero } from "@/components/marketing/Hero";
import { ProviderLogos } from "@/components/marketing/ProviderLogos";
import { HowItWorks } from "@/components/marketing/HowItWorks";
import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { Testimonials } from "@/components/marketing/Testimonials";
import Link from "next/link";

const PLANS = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    features: ["1 member", "2 API keys", "28-day history", "1 AI analysis/day"],
    cta: "Get started",
    href: "/sign-up",
    highlight: false,
  },
  {
    name: "Growth",
    price: "$49",
    period: "/month",
    features: ["Up to 10 members", "Unlimited API keys", "90-day history", "Anomaly alerts & briefs", "Spend forecasting"],
    cta: "Start free trial",
    href: "/sign-up",
    highlight: true,
    badge: "Most popular",
  },
  {
    name: "Business",
    price: "$149",
    period: "/month",
    features: ["Unlimited members", "365-day history", "Unlimited divisions", "Budget limits", "API access"],
    cta: "Start free trial",
    href: "/sign-up",
    highlight: false,
  },
];

export default function LandingPage() {
  return (
    <>
      <Hero />
      <ProviderLogos />
      <HowItWorks />
      <FeatureGrid />
      <Testimonials />

      {/* Pricing preview */}
      <section className="py-24 px-6 border-t border-gray-800">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold text-white">Simple, transparent pricing</h2>
            <p className="text-gray-400 mt-3">Start free. Upgrade when you need more history, members, or alerts.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={`rounded-2xl p-6 border flex flex-col ${
                  plan.highlight
                    ? "border-indigo-600/60 bg-indigo-950/30"
                    : "border-gray-800 bg-gray-900/60"
                }`}
              >
                {plan.badge && (
                  <span className="text-xs text-indigo-400 font-semibold uppercase tracking-wider mb-3">
                    {plan.badge}
                  </span>
                )}
                <div className="mb-5">
                  <h3 className="text-white font-bold text-lg">{plan.name}</h3>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-3xl font-bold text-white">{plan.price}</span>
                    <span className="text-gray-500 text-sm">{plan.period}</span>
                  </div>
                </div>

                <ul className="space-y-2.5 mb-6 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-gray-400">
                      <svg className="w-4 h-4 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>

                <Link
                  href={plan.href}
                  className={`block text-center py-2.5 rounded-xl font-semibold text-sm transition-colors ${
                    plan.highlight
                      ? "bg-indigo-600 hover:bg-indigo-500 text-white"
                      : "bg-gray-800 hover:bg-gray-700 text-gray-300"
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>

          <p className="text-center text-gray-600 text-sm mt-8">
            Annual billing saves 20% (2 months free).{" "}
            <Link href="/pricing" className="text-indigo-400 hover:text-indigo-300 transition-colors">
              See full pricing →
            </Link>
          </p>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 px-6 border-t border-gray-800 text-center">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="inline-flex items-center gap-2 bg-indigo-950/60 border border-indigo-800/60 rounded-full px-4 py-1.5 text-indigo-300 text-xs font-medium mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
            Free plan · No credit card
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-white">
            Stop finding out about AI overspend on invoice day
          </h2>
          <p className="text-gray-400 text-lg">
            Connect your keys in 2 minutes and see exactly where every dollar goes.
          </p>
          <div className="flex items-center justify-center gap-4 pt-2">
            <Link
              href="/sign-up"
              className="px-8 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-colors shadow-lg shadow-indigo-600/20"
            >
              Get started free
            </Link>
            <Link
              href="/pricing"
              className="px-8 py-3.5 bg-gray-800/80 hover:bg-gray-700 text-gray-300 font-semibold rounded-xl transition-colors border border-gray-700/50"
            >
              See all plans
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
