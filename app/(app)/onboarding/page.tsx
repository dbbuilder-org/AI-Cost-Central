"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CreateOrganization } from "@clerk/nextjs";

type Step = "org" | "key" | "done";

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("org");

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-8">
        {/* Progress */}
        <div className="flex items-center gap-2">
          {(["org", "key", "done"] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
                  step === s
                    ? "border-indigo-500 bg-indigo-600 text-white"
                    : i < ["org", "key", "done"].indexOf(step)
                    ? "border-green-500 bg-green-600 text-white"
                    : "border-gray-700 bg-gray-900 text-gray-500"
                }`}
              >
                {i + 1}
              </div>
              {i < 2 && <div className="flex-1 h-0.5 bg-gray-800" />}
            </div>
          ))}
        </div>

        {/* Step: Create org */}
        {step === "org" && (
          <div className="space-y-4">
            <div>
              <h1 className="text-2xl font-bold text-white">Create your organization</h1>
              <p className="text-gray-400 mt-1 text-sm">
                Your organization is the workspace for your team and API key vault.
              </p>
            </div>
            <div className="flex justify-center">
              <CreateOrganization
                afterCreateOrganizationUrl="/onboarding?step=key"
                appearance={{
                  elements: {
                    card: "bg-gray-900 border-gray-800 shadow-none",
                    headerTitle: "text-white",
                    formFieldInput: "bg-gray-800 border-gray-700 text-white",
                    formButtonPrimary: "bg-indigo-600 hover:bg-indigo-500",
                  },
                }}
              />
            </div>
          </div>
        )}

        {/* Step: Add first key — shown after org created */}
        {step === "key" && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Add your first API key</h1>
              <p className="text-gray-400 mt-1 text-sm">
                Add an admin key for OpenAI, Anthropic, or Google. Keys are encrypted and stored securely.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => router.push("/settings/keys?onboarding=1")}
                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg transition-colors text-sm"
              >
                Add API Key
              </button>
              <button
                onClick={() => setStep("done")}
                className="px-4 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors text-sm"
              >
                Skip for now
              </button>
            </div>
          </div>
        )}

        {/* Step: Done */}
        {step === "done" && (
          <div className="space-y-6 text-center">
            <div className="w-16 h-16 bg-green-600 rounded-full flex items-center justify-center mx-auto text-3xl">
              ✓
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">You&apos;re all set!</h1>
              <p className="text-gray-400 mt-2 text-sm">
                Your organization is ready. Go to your dashboard to start tracking AI spend.
              </p>
            </div>
            <button
              onClick={async () => {
                await fetch("/api/org/onboarding/complete", { method: "POST" });
                router.push("/dashboard");
              }}
              className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg transition-colors"
            >
              Go to Dashboard →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
