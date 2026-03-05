"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

type FormValues = z.infer<typeof schema>;

export function SignInForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: "demo@music.dev",
      password: "password123",
    },
  });

  const onSubmit = async (values: FormValues) => {
    setError(null);
    const result = await signIn("credentials", {
      ...values,
      redirect: false,
      callbackUrl: "/app",
    });

    if (result?.error) {
      setError("Invalid credentials");
      return;
    }

    router.push("/app");
    router.refresh();
  };

  const onGoogleSignIn = async () => {
    setError(null);
    setIsGoogleLoading(true);
    await signIn("google", { callbackUrl: "/app" });
    setIsGoogleLoading(false);
  };

  return (
    <Card className="w-full max-w-md border-white/15 bg-black/55 text-white backdrop-blur">
      <CardHeader>
        <CardTitle className="text-2xl">Sign in</CardTitle>
        <CardDescription className="text-white/70">
          Demo user included: demo@music.dev / password123
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-2">
            <label className="sr-only" htmlFor="email">Email</label>
            <Input {...register("email")} id="email" placeholder="Email" type="email" />
            {errors.email ? <p className="text-xs text-rose-300">{errors.email.message}</p> : null}
          </div>
          <div className="space-y-2">
            <label className="sr-only" htmlFor="password">Password</label>
            <Input {...register("password")} id="password" placeholder="Password" type="password" />
            {errors.password ? <p className="text-xs text-rose-300">{errors.password.message}</p> : null}
          </div>
          {error ? <p className="text-sm text-rose-300">{error}</p> : null}
          <Button className="w-full" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Signing in..." : "Continue"}
          </Button>
        </form>
        <div className="my-4 h-px bg-white/10" />
        <Button
          className="w-full"
          disabled={isSubmitting || isGoogleLoading}
          onClick={() => void onGoogleSignIn()}
          type="button"
          variant="ghost"
        >
          {isGoogleLoading ? "Redirecting to Google..." : "Sign in with Google"}
        </Button>
      </CardContent>
    </Card>
  );
}
