import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { SignInForm } from "@/components/sign-in-form";
import { authOptions } from "@/lib/auth";

export default async function SignInPage() {
  const session = await getServerSession(authOptions);

  if (session) {
    redirect("/app");
  }

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden px-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_10%,rgba(156,255,67,0.25),transparent_40%),radial-gradient(circle_at_90%_20%,rgba(59,130,246,0.25),transparent_45%),linear-gradient(180deg,#04030c_0%,#111827_100%)]" />
      <SignInForm />
    </main>
  );
}
