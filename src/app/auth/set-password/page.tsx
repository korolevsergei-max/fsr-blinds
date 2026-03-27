"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { homePathForRole } from "@/lib/role-routes";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";

export default function SetPasswordPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function restoreSessionFromUrl() {
      try {
        const hash = window.location.hash?.startsWith("#")
          ? window.location.hash.slice(1)
          : window.location.hash;
        const hashParams = new URLSearchParams(hash || "");

        const accessToken =
          hashParams.get("access_token") ||
          hashParams.get("accessToken") ||
          new URLSearchParams(window.location.search).get("access_token") ||
          new URLSearchParams(window.location.search).get("accessToken");

        const refreshToken =
          hashParams.get("refresh_token") ||
          hashParams.get("refreshToken") ||
          new URLSearchParams(window.location.search).get("refresh_token") ||
          new URLSearchParams(window.location.search).get("refreshToken");

        if (accessToken && refreshToken) {
          await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });

          // Remove auth tokens from the URL.
          const cleanUrl = `${window.location.pathname}${window.location.search}`;
          window.history.replaceState({}, document.title, cleanUrl);
        }

        // Ensure we have a user; invite acceptance should populate the session.
        const { data: userData } = await supabase.auth.getUser();
        if (!cancelled && !userData?.user) {
          setError("Invite accepted, but we couldn’t find your session. Please sign in, then set your password.");
        }
      } catch {
        if (!cancelled) {
          setError("Could not restore your session. Please try the invite link again.");
        }
      } finally {
        if (!cancelled) setInitializing(false);
      }
    }

    restoreSessionFromUrl();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) {
      setError("You must accept the invite first (session missing).");
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    setSuccess("Password set successfully. Redirecting...");
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    router.push(homePathForRole(profile?.role));
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
      <div className="w-full max-w-md surface-card p-5 flex flex-col gap-4">
        <div>
          <h1 className="text-[18px] font-semibold tracking-tight">Set your password</h1>
          <p className="text-[13px] text-secondary mt-1">
            Create a password to finish account setup.
          </p>
        </div>

        {initializing ? (
          <InlineAlert variant="info">Preparing your account…</InlineAlert>
        ) : error ? (
          <InlineAlert variant="error">{error}</InlineAlert>
        ) : null}
        {success ? <InlineAlert variant="success">{success}</InlineAlert> : null}

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Input
            label="New password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
          />
          <Input
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter password"
          />
          <Button type="submit" size="lg" fullWidth disabled={loading || initializing}>
            {loading ? "Saving..." : "Save password"}
          </Button>
        </form>
      </div>
    </div>
  );
}
