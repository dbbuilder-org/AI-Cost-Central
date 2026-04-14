import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Key, Users, GitBranch, CreditCard, Shield } from "lucide-react";

const SETTINGS_SECTIONS = [
  {
    href: "/settings/keys",
    icon: Key,
    title: "API Keys",
    description: "Manage your provider API keys (OpenAI, Anthropic, Google). Keys are encrypted at rest.",
  },
  {
    href: "/settings/members",
    icon: Users,
    title: "Members",
    description: "Invite team members and manage roles (owner, admin, viewer).",
  },
  {
    href: "/settings/divisions",
    icon: GitBranch,
    title: "Divisions",
    description: "Organize your team into divisions or teams. Set budget limits per division.",
  },
  {
    href: "/billing",
    icon: CreditCard,
    title: "Billing",
    description: "Manage your subscription plan, payment method, and invoices.",
  },
  {
    href: "/settings/audit",
    icon: Shield,
    title: "Audit Log",
    description: "View all actions taken in your organization (owners only).",
  },
];

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-gray-950 p-6 lg:p-10">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Settings</h1>
          <p className="text-gray-400 mt-1">Manage your organization, API keys, team members, and billing</p>
        </div>

        <div className="space-y-3">
          {SETTINGS_SECTIONS.map(({ href, icon: Icon, title, description }) => (
            <Link key={href} href={href}>
              <Card className="bg-gray-900 border-gray-800 hover:border-gray-700 transition-colors cursor-pointer">
                <CardHeader className="py-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-gray-800 rounded-md">
                      <Icon className="w-4 h-4 text-indigo-400" />
                    </div>
                    <div>
                      <CardTitle className="text-white text-sm">{title}</CardTitle>
                      <CardDescription className="text-gray-400 text-xs mt-0.5">{description}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
