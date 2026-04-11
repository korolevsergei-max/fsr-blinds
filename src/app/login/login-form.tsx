"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { refreshDataset } from "@/app/actions/dataset-queries";
import { setCachedData } from "@/lib/offline-cache";
import { homePathForRole } from "@/lib/role-routes";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { ArrowRight, UserPlus } from "@phosphor-icons/react";

const DATASET_CACHE_KEY = "app-dataset";

function prefetchDatasetInBackground(role?: string) {
  const kind =
    role === "scheduler" ? "scheduler" : role === "installer" ? "installer" : "full";
  refreshDataset(kind)
    .then((data) => setCachedData(DATASET_CACHE_KEY, data))
    .catch(() => {/* best-effort */});
}

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  const getAuthRedirectBaseUrl = () => {
    if (typeof window !== "undefined") return window.location.origin;
    return "http://localhost:3000";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setInfo("");

    if (!email || !password) {
      setError("Please enter both email and password.");
      return;
    }
    if (mode === "signup" && !name.trim()) {
      setError("Please enter your name.");
      return;
    }

    setLoading(true);
    const supabase = createClient();

    try {
      if (mode === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: name.trim() } },
        });

        if (signUpError) {
          setError(signUpError.message);
          setLoading(false);
          return;
        }

        if (data.session) {
          router.push("/management");
          router.refresh();
          return;
        }

        setInfo("Check your email for a confirmation link, then sign in.");
        setMode("signin");
        setLoading(false);
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message);
        setLoading(false);
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("role")
          .eq("id", user.id)
          .single();

        const metadataRole =
          typeof user.user_metadata?.role === "string" ? user.user_metadata.role : undefined;
        const resolvedRole = profile?.role ?? metadataRole;
        const nextPath = homePathForRole(resolvedRole);

        // Warm IDB cache while router navigates — fire-and-forget.
        prefetchDatasetInBackground(resolvedRole);

        router.push(nextPath === "/" ? "/management" : nextPath);
        router.refresh();
        return;
      }

      setLoading(false);
    } catch {
      setError("Connection failed. Please try again.");
      setLoading(false);
    }
  };

  const isSignup = mode === "signup";
  const handleForgotPassword = async () => {
    setError("");
    setInfo("");

    if (!email.trim()) {
      setError("Enter your email first, then tap Forgot password.");
      return;
    }

    const supabase = createClient();
    const redirectTo = `${getAuthRedirectBaseUrl()}/auth/set-password`;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo,
    });

    if (resetError) {
      setError(resetError.message);
      return;
    }

    setInfo("Password reset link sent. Check your email.");
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">

      {/* Mode heading */}
      <div className="mb-1">
        <h2 className="text-[17px] font-semibold text-foreground tracking-tight">
          {isSignup ? "Create an account" : "Sign in"}
        </h2>
        <p className="text-[13px] text-secondary mt-0.5">
          {isSignup
            ? "Set up your owner account to get started."
            : "Enter your credentials to continue."}
        </p>
      </div>

      {info && <InlineAlert variant="info">{info}</InlineAlert>}

      {isSignup && (
        <Input
          label="Full name"
          type="text"
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
        />
      )}

      <Input
        label="Email"
        type="email"
        placeholder="you@fsrblinds.ca"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
        autoFocus
      />

      <div className="flex flex-col gap-1.5">
        <Input
          label="Password"
          type="password"
          placeholder="Enter your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={isSignup ? "new-password" : "current-password"}
          error={error || undefined}
        />
        {!isSignup && (
          <button
            type="button"
            onClick={handleForgotPassword}
            className="self-end text-[12px] text-accent font-medium hover:underline"
          >
            Forgot password?
          </button>
        )}
      </div>

      <Button type="submit" fullWidth size="lg" disabled={loading}>
        {loading ? (
          <span className="flex items-center gap-2">
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            {isSignup ? "Creating account…" : "Signing in…"}
          </span>
        ) : (
          <span className="flex items-center gap-2">
            {isSignup ? <UserPlus size={17} weight="bold" /> : <ArrowRight size={17} weight="bold" />}
            {isSignup ? "Create account" : "Sign in"}
          </span>
        )}
      </Button>

      <button
        type="button"
        onClick={() => {
          setMode(isSignup ? "signin" : "signup");
          setError("");
          setInfo("");
        }}
        className="text-[12px] text-center text-secondary hover:text-accent transition-colors"
      >
        {isSignup
          ? "Already have an account? Sign in"
          : "First time? Create an owner account"}
      </button>
    </form>
  );
}
