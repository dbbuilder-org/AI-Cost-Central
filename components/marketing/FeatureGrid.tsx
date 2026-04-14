const FEATURES = [
  {
    icon: "📊",
    title: "Real-time Cost Tracking",
    description: "Every API call attributed to the right key, model, and team. Daily spend by provider across OpenAI, Anthropic, and Google.",
  },
  {
    icon: "🚨",
    title: "Anomaly Detection",
    description: "Z-score based spike and drop detection fires alerts before your bill surprises you. Email, push, and weekly digests included.",
  },
  {
    icon: "✦",
    title: "AI-Powered Recommendations",
    description: "Claude Haiku analyzes your spend patterns and surfaces specific model migration and optimization opportunities with estimated savings.",
  },
  {
    icon: "🔐",
    title: "Encrypted Key Vault",
    description: "Store provider API keys encrypted with AES-256-GCM. Per-org envelope encryption — keys never stored in plaintext.",
  },
  {
    icon: "👥",
    title: "Team & Division Management",
    description: "Invite teammates as owners, admins, or viewers. Organize into divisions with budget limits per team.",
  },
  {
    icon: "📈",
    title: "Trend Analysis & Forecasting",
    description: "30/90/365-day history with linear regression forecasting. See projected monthly spend before your invoice arrives.",
  },
  {
    icon: "🗂️",
    title: "Projects & Annotations",
    description: "Group API keys into projects. Annotate keys and cost patterns with context for your team. Filter dashboards by project.",
  },
  {
    icon: "🔁",
    title: "SmartRouter Proxy",
    description: "Drop-in OpenAI-compatible proxy that routes requests to the cheapest model meeting your quality tier — automatically.",
  },
];

export function FeatureGrid() {
  return (
    <section id="features" className="py-20 px-6 border-t border-gray-800">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold text-white">Everything your AI budget needs</h2>
          <p className="text-gray-400 mt-3">Built for engineering teams who want visibility and control over AI spend.</p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="bg-gray-900 border border-gray-800 rounded-2xl p-5 hover:border-gray-700 transition-colors"
            >
              <div className="text-2xl mb-3">{f.icon}</div>
              <h3 className="text-white font-semibold text-sm mb-2">{f.title}</h3>
              <p className="text-gray-500 text-xs leading-relaxed">{f.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
