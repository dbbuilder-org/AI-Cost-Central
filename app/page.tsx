import { redirect } from "next/navigation";

// Root / — middleware handles auth redirect.
// Authenticated users with an org go to /dashboard.
// New users without an org go to /onboarding.
// Unauthenticated users see the (marketing) landing page via route group.
export default function Home() {
  redirect("/dashboard");
}
