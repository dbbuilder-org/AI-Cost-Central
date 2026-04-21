import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Routes that do NOT require authentication
const isPublicRoute = createRouteMatcher([
  "/",                          // Marketing landing page
  "/pricing(.*)",               // Pricing page
  "/sign-in(.*)",               // Clerk auth
  "/sign-up(.*)",               // Clerk auth
  "/api/webhooks/(.*)",         // Clerk + Stripe webhooks (validated by signature in handler)
  "/api/cron/(.*)",             // Cron jobs (validated by x-cron-secret header in each handler)
  "/api/health",                // Health check
]);

export default clerkMiddleware(async (auth, request) => {
  const { userId, orgId } = await auth();
  const url = request.nextUrl;

  // Public routes — always allow through
  if (isPublicRoute(request)) {
    return NextResponse.next();
  }

  // Not authenticated — redirect to sign-in
  if (!userId) {
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("redirect_url", url.pathname);
    return NextResponse.redirect(signInUrl);
  }

  // Authenticated but no org selected — redirect to onboarding
  // (except when already going to onboarding or org-selection routes)
  if (!orgId && !url.pathname.startsWith("/onboarding") && !url.pathname.startsWith("/select-org")) {
    return NextResponse.redirect(new URL("/onboarding", request.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Match all paths except Next.js internals and static files
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?)).*)",
  ],
};
