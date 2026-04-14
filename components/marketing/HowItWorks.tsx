const STEPS = [
  {
    step: "01",
    title: "Connect your provider keys",
    description:
      "Add your OpenAI, Anthropic, and Google admin API keys in Settings. Keys are encrypted with AES-256-GCM — we never store them in plaintext.",
    detail: "Takes 2 minutes. No SDK or code changes required.",
  },
  {
    step: "02",
    title: "Spend data flows in automatically",
    description:
      "AICostCentral pulls usage from each provider's admin API daily. See cost by model, API key, and team — broken down to the hour.",
    detail: "28-day history on Free · 90 days on Growth · 365 on Business.",
  },
  {
    step: "03",
    title: "Get recommendations and alerts",
    description:
      "Claude Haiku analyzes your patterns and surfaces specific savings. Anomaly detection fires before a runaway job becomes a surprise invoice.",
    detail: "Avg team saves 20–40% within the first 30 days.",
  },
];

export function HowItWorks() {
  return (
    <section className="py-24 px-6 border-t border-gray-800">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-white">Up and running in minutes</h2>
          <p className="text-gray-400 mt-3 max-w-xl mx-auto">
            No SDK to integrate. No code to change. Just connect your keys and start seeing where your AI budget goes.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 relative">
          {/* Connector line */}
          <div className="hidden md:block absolute top-8 left-[calc(33%+1rem)] right-[calc(33%+1rem)] h-px bg-gradient-to-r from-indigo-800 via-indigo-600 to-indigo-800" />

          {STEPS.map((s) => (
            <div key={s.step} className="relative space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-600/40 flex items-center justify-center text-indigo-400 font-bold text-sm font-mono shrink-0">
                  {s.step}
                </div>
                <div className="h-px flex-1 bg-gray-800 md:hidden" />
              </div>
              <h3 className="text-white font-semibold text-base">{s.title}</h3>
              <p className="text-gray-400 text-sm leading-relaxed">{s.description}</p>
              <p className="text-gray-600 text-xs">{s.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
