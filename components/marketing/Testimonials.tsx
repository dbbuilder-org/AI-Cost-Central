const TESTIMONIALS = [
  {
    quote: "We were spending $8K/month on GPT-4o for tasks that needed gpt-4o-mini. AICostCentral surfaced it in the first week. Saved us $5K/month.",
    name: "Sarah K.",
    role: "Staff Engineer",
    company: "FinTech startup",
    savings: "$5K/mo saved",
  },
  {
    quote: "The anomaly detection caught a runaway job before our bill arrived. Would have been a $2,000 surprise. Now it's a $12 alert.",
    name: "Marcus T.",
    role: "ML Platform Lead",
    company: "Enterprise SaaS",
    savings: "$2K incident avoided",
  },
  {
    quote: "We have 4 teams sharing API keys. Division breakdown and per-team budget limits finally gave us real accountability for AI spend.",
    name: "Priya M.",
    role: "Engineering Manager",
    company: "AI-first startup",
    savings: "Full cost visibility",
  },
];

function Stars() {
  return (
    <div className="flex gap-0.5">
      {[...Array(5)].map((_, i) => (
        <svg key={i} className="w-3.5 h-3.5 text-yellow-400 fill-current" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

export function Testimonials() {
  return (
    <section className="py-24 px-6 border-t border-gray-800">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-bold text-white">Trusted by engineering teams</h2>
          <p className="text-gray-400 mt-3">Real results from teams who stopped guessing at their AI bill.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {TESTIMONIALS.map((t) => (
            <div key={t.name} className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4 hover:border-gray-700 transition-colors">
              <Stars />
              <p className="text-gray-300 text-sm leading-relaxed">&ldquo;{t.quote}&rdquo;</p>
              <div className="flex items-center justify-between pt-1">
                <div>
                  <p className="text-white text-sm font-semibold">{t.name}</p>
                  <p className="text-gray-500 text-xs">{t.role} · {t.company}</p>
                </div>
                <div className="px-2.5 py-1 bg-green-500/10 border border-green-500/20 rounded-lg">
                  <p className="text-green-400 text-xs font-medium whitespace-nowrap">{t.savings}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
