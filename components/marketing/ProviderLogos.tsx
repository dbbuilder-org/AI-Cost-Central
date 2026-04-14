const PROVIDERS = [
  { name: "OpenAI", color: "text-green-400" },
  { name: "Anthropic", color: "text-orange-400" },
  { name: "Google Gemini", color: "text-blue-400" },
  { name: "Groq", color: "text-yellow-400" },
  { name: "Mistral", color: "text-violet-400" },
];

export function ProviderLogos() {
  return (
    <section className="py-14 px-6 border-t border-gray-800/50">
      <div className="max-w-4xl mx-auto text-center">
        <p className="text-gray-600 text-sm mb-8 uppercase tracking-widest font-medium">
          Tracks spend across all major providers
        </p>
        <div className="flex flex-wrap justify-center items-center gap-8">
          {PROVIDERS.map((p) => (
            <span key={p.name} className={`text-lg font-bold ${p.color} opacity-60 hover:opacity-100 transition-opacity`}>
              {p.name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
