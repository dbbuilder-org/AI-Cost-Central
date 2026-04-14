import Link from "next/link";

export function MarketingFooter() {
  return (
    <footer className="border-t border-gray-800 bg-gray-950 py-10 px-6">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        <div>
          <span className="font-bold text-white">AICostCentral</span>
          <p className="text-gray-500 text-xs mt-1">AI cost intelligence for engineering teams.</p>
        </div>
        <div className="flex items-center gap-6 text-sm text-gray-500">
          <Link href="/pricing" className="hover:text-white transition-colors">Pricing</Link>
          <Link href="/sign-in" className="hover:text-white transition-colors">Sign in</Link>
          <Link href="/sign-up" className="hover:text-white transition-colors">Sign up</Link>
        </div>
        <p className="text-gray-600 text-xs">© {new Date().getFullYear()} ServiceVision. All rights reserved.</p>
      </div>
    </footer>
  );
}
