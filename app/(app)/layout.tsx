"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard,
  LineChart,
  FolderOpen,
  Settings,
  CreditCard,
  Key,
  Brain,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/analytics", label: "Analytics", icon: LineChart },
  { href: "/projects", label: "Projects", icon: FolderOpen },
  { href: "/keys", label: "Key Intel", icon: Brain },
  { href: "/settings/keys", label: "API Keys", icon: Key },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/billing", label: "Billing", icon: CreditCard },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      {/* Top nav */}
      <nav className="border-b border-gray-800 px-4 py-2.5 flex items-center justify-between bg-gray-950/80 backdrop-blur sticky top-0 z-40">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="text-base font-bold text-white">AICostCentral</span>
            <Badge className="bg-indigo-900/60 text-indigo-300 border-indigo-800 text-xs">Beta</Badge>
          </Link>

          {/* Primary nav */}
          <div className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(href + "/");
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    active
                      ? "bg-gray-800 text-white"
                      : "text-gray-400 hover:text-white hover:bg-gray-900"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <OrganizationSwitcher
            appearance={{
              elements: {
                organizationSwitcherTrigger:
                  "text-gray-300 hover:text-white text-xs rounded-md px-2 py-1 hover:bg-gray-800",
              },
            }}
          />
          <UserButton
            appearance={{
              elements: {
                userButtonAvatarBox: "w-7 h-7",
              },
            }}
          />
        </div>
      </nav>

      {/* Page content */}
      <main className="flex-1">{children}</main>
    </div>
  );
}
