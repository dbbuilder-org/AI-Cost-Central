import Link from "next/link";

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-20 pb-28 px-6">
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-indigo-600/10 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-4xl mx-auto text-center space-y-6">
        <div className="inline-flex items-center gap-2 bg-indigo-900/40 border border-indigo-800 rounded-full px-4 py-1.5 text-indigo-300 text-xs font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
          Now with multi-org, divisions &amp; encrypted key vault
        </div>

        <h1 className="text-5xl md:text-6xl font-bold text-white leading-tight">
          Stop overpaying for{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-violet-400">
            AI APIs
          </span>
        </h1>

        <p className="text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
          AICostCentral tracks every dollar you spend across OpenAI, Anthropic, and Google.
          Spot anomalies, enforce budgets, and get AI-powered recommendations to cut costs
          — all in one dashboard your whole team can use.
        </p>

        <div className="flex items-center justify-center gap-4 pt-2">
          <Link
            href="/sign-up"
            className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-colors text-base"
          >
            Start for free
          </Link>
          <Link
            href="/pricing"
            className="px-8 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 font-semibold rounded-xl transition-colors text-base"
          >
            See pricing →
          </Link>
        </div>

        <p className="text-gray-600 text-sm">No credit card required · Free plan available</p>

        {/* Dashboard preview placeholder */}
        <div className="mt-12 rounded-2xl border border-gray-800 bg-gray-900/50 p-8 backdrop-blur text-left shadow-2xl">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "28-Day Spend", value: "$2,847", change: "-12%" },
              { label: "Total Requests", value: "1.2M", change: "+8%" },
              { label: "Top Model", value: "GPT-4o", change: "43% of cost" },
              { label: "Anomalies", value: "3", change: "2 critical" },
            ].map((stat) => (
              <div key={stat.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <p className="text-xs text-gray-500">{stat.label}</p>
                <p className="text-2xl font-bold text-white mt-1">{stat.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{stat.change}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
