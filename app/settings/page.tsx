import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiKeyForm } from "@/components/settings/ApiKeyForm";
import { RepoLinkForm } from "@/components/settings/RepoLinkForm";

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-gray-950 p-6 lg:p-10">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Settings</h1>
          <p className="text-gray-400 mt-1">Configure API keys, provider access, and code repo links</p>
        </div>

        {/* ── OpenAI Admin Key ── */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">OpenAI Admin API Key</CardTitle>
            <CardDescription className="text-gray-400">
              Required to pull usage and cost data across all projects and API keys.
              Generate one at{" "}
              <a
                href="https://platform.openai.com/settings/organization/admin-keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-400 hover:underline"
              >
                platform.openai.com/settings/organization/admin-keys
              </a>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ApiKeyForm />
          </CardContent>
        </Card>

        {/* ── GitHub Repo Links ── */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">GitHub Repo Links</CardTitle>
            <CardDescription className="text-gray-400">
              Link each API key to a GitHub repository. When you run AI Analysis, the scanner
              finds model call sites in your code and recommendations will name exact files and
              line numbers rather than generic patterns.
              Requires a <code className="bg-gray-800 px-1 rounded text-xs">GITHUB_TOKEN</code> (read-only PAT) set in Vercel environment variables.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RepoLinkForm />
          </CardContent>
        </Card>

        {/* ── Future providers ── */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white text-sm">SmartRouter — Coming in Phase 1</CardTitle>
            <CardDescription className="text-gray-500 text-xs">
              Drop-in OpenAI-compatible proxy that automatically routes to the cheapest model
              that meets your quality requirements. BYOK (bring your own provider keys).
              Set routing rules per project, budget ceilings, and task-type overrides.
            </CardDescription>
          </CardHeader>
        </Card>

        <div className="grid grid-cols-3 gap-3">
          {["Anthropic", "Google Vertex AI", "AWS Bedrock"].map((p) => (
            <Card key={p} className="bg-gray-900/40 border-gray-800 border-dashed opacity-50">
              <CardHeader className="py-3">
                <CardTitle className="text-gray-600 text-xs">{p} — Phase 2</CardTitle>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
