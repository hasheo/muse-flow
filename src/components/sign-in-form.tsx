"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const credentialsSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

export function SignInForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const onGoogleSignIn = async () => {
    setError(null);
    setIsLoading(true);
    try {
      await signIn("google", { callbackUrl: "/quiz" });
    } catch {
      setError("Something went wrong. Please try again.");
      setIsLoading(false);
    }
  };

  const onCredentialsSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setValidationErrors({});

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    const parsed = credentialsSchema.safeParse({ email, password });
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as string;
        fieldErrors[field] = issue.message;
      }
      setValidationErrors(fieldErrors);
      return;
    }

    setIsLoading(true);
    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
        callbackUrl: "/quiz",
      });

      if (result?.error) {
        setError("Invalid credentials");
        setIsLoading(false);
      } else if (result?.url) {
        window.location.href = result.url;
      }
    } catch {
      setError("Something went wrong. Please try again.");
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md border-white/15 bg-black/55 text-white backdrop-blur">
      <CardHeader>
        <CardTitle className="text-2xl">Sign in</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {error ? <p className="text-sm text-rose-300">{error}</p> : null}
        <form className="space-y-4" onSubmit={(e) => void onCredentialsSignIn(e)}>
          <div className="space-y-1">
            <Input
              disabled={isLoading}
              name="email"
              placeholder="Email"
              type="email"
            />
            {validationErrors.email ? (
              <p className="text-sm text-rose-300">{validationErrors.email}</p>
            ) : null}
          </div>
          <div className="space-y-1">
            <Input
              disabled={isLoading}
              name="password"
              placeholder="Password"
              type="password"
            />
            {validationErrors.password ? (
              <p className="text-sm text-rose-300">{validationErrors.password}</p>
            ) : null}
          </div>
          <Button className="w-full" disabled={isLoading} type="submit">
            {isLoading ? "Signing in..." : "Continue"}
          </Button>
        </form>
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-white/15" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-black/55 px-2 text-white/50">or</span>
          </div>
        </div>
        <Button
          className="w-full gap-3"
          disabled={isLoading}
          onClick={() => void onGoogleSignIn()}
          type="button"
          variant="ghost"
        >
          <GoogleIcon className="h-5 w-5" />
          {isLoading ? "Redirecting..." : "Sign in with Google"}
        </Button>
      </CardContent>
    </Card>
  );
}
