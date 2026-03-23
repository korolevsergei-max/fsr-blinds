"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SignIn } from "@phosphor-icons/react";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("Please enter both email and password");
      return;
    }

    setLoading(true);

    // Mock auth: route based on email domain
    await new Promise((r) => setTimeout(r, 600));

    if (email.includes("admin")) {
      router.push("/management");
    } else {
      router.push("/installer");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <Input
        label="Email"
        type="email"
        placeholder="tom.u@fsrblinds.ca"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
        autoFocus
      />

      <div>
        <Input
          label="Password"
          type="password"
          placeholder="Enter your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          error={error || undefined}
        />
        <button
          type="button"
          className="mt-2 text-xs text-accent font-medium hover:underline"
        >
          Forgot password?
        </button>
      </div>

      <Button type="submit" fullWidth size="lg" disabled={loading}>
        {loading ? (
          <span className="flex items-center gap-2">
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Signing in...
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <SignIn size={18} weight="bold" />
            Sign In
          </span>
        )}
      </Button>
    </form>
  );
}
