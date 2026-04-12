import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiKeyForm } from "@/components/settings/ApiKeyForm";

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-gray-950 p-6 lg:p-10">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Settings</h1>
          <p className="text-gray-400 mt-1">Configure your AI provider API keys</p>
        </div>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">OpenAI</CardTitle>
            <CardDescription className="text-gray-400">
              An Admin API key is required to access usage and cost data across all projects.
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

        <Card className="bg-gray-900/50 border-gray-800 border-dashed opacity-60">
          <CardHeader>
            <CardTitle className="text-gray-500">Anthropic — Coming in Phase 2</CardTitle>
          </CardHeader>
        </Card>

        <Card className="bg-gray-900/50 border-gray-800 border-dashed opacity-60">
          <CardHeader>
            <CardTitle className="text-gray-500">Google Vertex AI — Coming in Phase 2</CardTitle>
          </CardHeader>
        </Card>

        <Card className="bg-gray-900/50 border-gray-800 border-dashed opacity-60">
          <CardHeader>
            <CardTitle className="text-gray-500">AWS Bedrock — Coming in Phase 2</CardTitle>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
