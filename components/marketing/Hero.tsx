import Link from "next/link";

const CHART_BARS = [
  { day: "Apr 1",  openai: 68, anthropic: 22, google: 8  },
  { day: "Apr 2",  openai: 72, anthropic: 18, google: 10 },
  { day: "Apr 3",  openai: 55, anthropic: 30, google: 12 },
  { day: "Apr 4",  openai: 48, anthropic: 25, google: 9  },
  { day: "Apr 5",  openai: 80, anthropic: 28, google: 15 },
  { day: "Apr 6",  openai: 62, anthropic: 20, google: 11 },
  { day: "Apr 7",  openai: 74, anthropic: 32, google: 18 },
  { day: "Apr 8",  openai: 58, anthropic: 24, google: 13 },
  { day: "Apr 9",  openai: 90, anthropic: 38, google: 20 },
  { day: "Apr 10", openai: 76, anthropic: 29, google: 16 },
  { day: "Apr 11", openai: 65, anthropic: 35, google: 22 },
  { day: "Apr 12", openai: 54, anthropic: 19, google: 10 },
  { day: "Apr 13", openai: 85, anthropic: 40, google: 25 },
  { day: "Apr 14", openai: 70, anthropic: 27, google: 14 },
];

const MODELS = [
  { name: "gpt-4o",            provider: "OpenAI",    requests: "48.2K",  cost: "$1,847", trend: -12, color: "bg-green-500" },
  { name: "claude-sonnet-4-6", provider: "Anthropic", requests: "12.1K",  cost: "$1,204", trend:  +8, color: "bg-orange-500" },
  { name: "gpt-4o-mini",       provider: "OpenAI",    requests: "201K",   cost: "$892",   trend: -31, color: "bg-green-500" },
  { name: "gemini-2.5-flash",  provider: "Google",    requests: "31.4K",  cost: "$487",   trend: +15, color: "bg-blue-500" },
];

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-16 pb-24 px-6">
      {/* Background glows */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-indigo-600/8 rounded-full blur-3xl" />
        <div className="absolute top-40 right-0 w-[400px] h-[400px] bg-violet-600/6 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-5xl mx-auto">
        {/* Badge */}
        <div className="flex justify-center mb-8">
          <div className="inline-flex items-center gap-2 bg-indigo-950/60 border border-indigo-800/60 rounded-full px-4 py-1.5 text-indigo-300 text-xs font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
            Multi-org · Encrypted vault · AI recommendations
          </div>
        </div>

        {/* Headline */}
        <div className="text-center space-y-5 mb-10">
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-white leading-[1.08] tracking-tight">
            Know exactly what{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-violet-400 to-indigo-400">
              you&apos;re paying
            </span>
            {" "}for AI
          </h1>

          <p className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
            AICostCentral tracks every dollar across OpenAI, Anthropic, and Google.
            Catch runaway spend before the invoice. Get AI-powered recommendations to cut costs by 20–40%.
          </p>

          <div className="flex items-center justify-center gap-4 pt-2">
            <Link
              href="/sign-up"
              className="px-7 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-colors text-sm shadow-lg shadow-indigo-600/20"
            >
              Start for free
            </Link>
            <Link
              href="/pricing"
              className="px-7 py-3 bg-gray-800/80 hover:bg-gray-700 text-gray-300 font-semibold rounded-xl transition-colors text-sm border border-gray-700/50"
            >
              See pricing
            </Link>
          </div>

          <p className="text-gray-600 text-sm">No credit card required · Free plan always available</p>
        </div>

        {/* Dashboard mockup */}
        <div className="rounded-2xl border border-gray-800 bg-gray-900 shadow-2xl shadow-black/50 overflow-hidden">
          {/* Titlebar */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-800 bg-gray-900/80">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-gray-700" />
              <div className="w-3 h-3 rounded-full bg-gray-700" />
              <div className="w-3 h-3 rounded-full bg-gray-700" />
            </div>
            <div className="flex-1 flex justify-center">
              <div className="px-4 py-1 bg-gray-800 rounded-md text-xs text-gray-500 font-mono">
                ai-cost-central.vercel.app/dashboard
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              Live
            </div>
          </div>

          <div className="p-5 space-y-4">
            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "28-Day Spend",    value: "$4,430", sub: "↓ $812 vs last month", subColor: "text-green-400" },
                { label: "Avg Daily Cost",  value: "$158",   sub: "↓ 18% trend",          subColor: "text-green-400" },
                { label: "Active Alerts",   value: "2",      sub: "1 spike · 1 anomaly",   subColor: "text-yellow-400" },
                { label: "Providers",       value: "3",      sub: "OpenAI · Claude · Google", subColor: "text-gray-500" },
              ].map((s) => (
                <div key={s.label} className="bg-gray-800/60 border border-gray-700/50 rounded-xl p-3.5">
                  <p className="text-xs text-gray-500">{s.label}</p>
                  <p className="text-xl font-bold text-white mt-0.5">{s.value}</p>
                  <p className={`text-xs mt-0.5 ${s.subColor}`}>{s.sub}</p>
                </div>
              ))}
            </div>

            {/* Chart */}
            <div className="bg-gray-800/40 border border-gray-700/40 rounded-xl p-4">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-medium text-gray-400">Daily Spend by Provider</p>
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-indigo-500" />OpenAI</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-orange-500" />Anthropic</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-blue-500" />Google</span>
                </div>
              </div>
              <div className="flex items-end gap-1 h-28">
                {CHART_BARS.map((bar) => {
                  const total = bar.openai + bar.anthropic + bar.google;
                  const maxH = 112;
                  const h = Math.round((total / 130) * maxH);
                  const oH = Math.round((bar.openai / total) * h);
                  const aH = Math.round((bar.anthropic / total) * h);
                  const gH = h - oH - aH;
                  return (
                    <div key={bar.day} className="flex-1 flex flex-col-reverse gap-0.5 group" title={bar.day}>
                      <div className="w-full bg-indigo-500 rounded-t-sm opacity-80 group-hover:opacity-100 transition-opacity" style={{ height: oH }} />
                      <div className="w-full bg-orange-500 opacity-80 group-hover:opacity-100 transition-opacity" style={{ height: aH }} />
                      <div className="w-full bg-blue-500 rounded-t-sm opacity-80 group-hover:opacity-100 transition-opacity" style={{ height: gH }} />
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between mt-2 text-xs text-gray-600">
                <span>Apr 1</span>
                <span>Apr 14</span>
              </div>
            </div>

            {/* Model table */}
            <div className="bg-gray-800/40 border border-gray-700/40 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-700/40">
                <p className="text-xs font-medium text-gray-400">Top Models by Cost</p>
              </div>
              <div className="divide-y divide-gray-700/30">
                {MODELS.map((m) => (
                  <div key={m.name} className="flex items-center gap-3 px-4 py-2.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${m.color} shrink-0`} />
                    <span className="text-xs font-mono text-gray-300 flex-1 min-w-0 truncate">{m.name}</span>
                    <span className="text-xs text-gray-500 hidden sm:block w-16 text-right">{m.requests}</span>
                    <span className="text-xs font-medium text-white w-16 text-right">{m.cost}</span>
                    <span className={`text-xs w-12 text-right font-medium ${m.trend < 0 ? "text-green-400" : "text-red-400"}`}>
                      {m.trend > 0 ? "+" : ""}{m.trend}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
