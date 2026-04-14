import Link from "next/link";

const LINKS = [
  { label: "Features", href: "/#features" },
  { label: "Pricing", href: "/pricing" },
  { label: "Sign in", href: "/sign-in" },
  { label: "Sign up", href: "/sign-up" },
];

export function MarketingFooter() {
  return (
    <footer className="border-t border-gray-800 bg-gray-950 py-10 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-md bg-indigo-600 flex items-center justify-center shrink-0">
              <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
              </svg>
            </div>
            <div>
              <span className="font-bold text-white text-sm">AICostCentral</span>
              <p className="text-gray-600 text-xs">AI cost intelligence for engineering teams.</p>
            </div>
          </div>

          <nav className="flex items-center gap-5">
            {LINKS.map((l) => (
              <Link key={l.label} href={l.href} className="text-sm text-gray-500 hover:text-white transition-colors">
                {l.label}
              </Link>
            ))}
          </nav>

          <p className="text-gray-700 text-xs">© {new Date().getFullYear()} ServiceVision. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
