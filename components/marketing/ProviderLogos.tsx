const PROVIDERS = [
  { name: "OpenAI",        abbr: "OAI", color: "text-green-400",  bg: "bg-green-400/10",  border: "border-green-400/20"  },
  { name: "Anthropic",     abbr: "ANT", color: "text-orange-400", bg: "bg-orange-400/10", border: "border-orange-400/20" },
  { name: "Google Gemini", abbr: "GGL", color: "text-blue-400",   bg: "bg-blue-400/10",   border: "border-blue-400/20"   },
  { name: "Groq",          abbr: "GRQ", color: "text-yellow-400", bg: "bg-yellow-400/10", border: "border-yellow-400/20" },
  { name: "Mistral",       abbr: "MST", color: "text-violet-400", bg: "bg-violet-400/10", border: "border-violet-400/20" },
];

const STATS = [
  { value: "3 providers", label: "natively supported" },
  { value: "< 5 min",     label: "to first insight" },
  { value: "AES-256",     label: "key encryption" },
  { value: "20–40%",      label: "avg cost reduction" },
];

export function ProviderLogos() {
  return (
    <section className="py-14 px-6 border-t border-gray-800/60 bg-gray-950/50">
      <div className="max-w-5xl mx-auto space-y-10">
        {/* Provider strip */}
        <div className="text-center">
          <p className="text-gray-600 text-xs mb-6 uppercase tracking-widest font-medium">
            Tracks spend across all major AI providers
          </p>
          <div className="flex flex-wrap justify-center items-center gap-3">
            {PROVIDERS.map((p) => (
              <div
                key={p.name}
                className={`flex items-center gap-2 px-4 py-2 rounded-full border ${p.border} ${p.bg}`}
              >
                <span className={`text-xs font-bold font-mono ${p.color}`}>{p.abbr}</span>
                <span className="text-sm font-medium text-gray-300">{p.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-2xl font-bold text-white">{s.value}</p>
              <p className="text-xs text-gray-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
