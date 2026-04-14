import { Hero } from "@/components/marketing/Hero";
import { ProviderLogos } from "@/components/marketing/ProviderLogos";
import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { Testimonials } from "@/components/marketing/Testimonials";
import Link from "next/link";

export default function LandingPage() {
  return (
    <>
      <Hero />
      <ProviderLogos />
      <FeatureGrid />
      <Testimonials />

      {/* CTA section */}
      <section className="py-20 px-6 border-t border-gray-800 text-center">
        <div className="max-w-2xl mx-auto space-y-6">
          <h2 className="text-3xl font-bold text-white">Start tracking your AI spend today</h2>
          <p className="text-gray-400">Free plan includes 1 member, 2 API keys, and 28-day history. No credit card required.</p>
          <div className="flex items-center justify-center gap-4">
            <Link
              href="/sign-up"
              className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-colors"
            >
              Get started free
            </Link>
            <Link
              href="/pricing"
              className="px-8 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold rounded-xl transition-colors"
            >
              See all plans
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
