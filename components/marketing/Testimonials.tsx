const TESTIMONIALS = [
  {
    quote: "We were spending $8K/month on GPT-4o for tasks that needed gpt-4o-mini. AICostCentral surfaced it in the first week. Saved us $5K/month.",
    name: "Sarah K.",
    role: "Staff Engineer",
    company: "FinTech startup",
  },
  {
    quote: "The anomaly detection caught a runaway job before our bill arrived. Would have been a $2,000 surprise. Now it's a $12 alert.",
    name: "Marcus T.",
    role: "ML Platform Lead",
    company: "Enterprise SaaS",
  },
  {
    quote: "We have 4 teams sharing API keys. The division breakdown and per-team budget limits finally gave us real accountability.",
    name: "Priya M.",
    role: "Engineering Manager",
    company: "AI-first startup",
  },
];

export function Testimonials() {
  return (
    <section className="py-20 px-6 border-t border-gray-800">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-white">Trusted by engineering teams</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {TESTIMONIALS.map((t) => (
            <div key={t.name} className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
              <p className="text-gray-300 text-sm leading-relaxed">&ldquo;{t.quote}&rdquo;</p>
              <div>
                <p className="text-white text-sm font-semibold">{t.name}</p>
                <p className="text-gray-500 text-xs">{t.role} · {t.company}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
