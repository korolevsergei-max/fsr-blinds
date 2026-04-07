"use client";

import { useState, useTransition } from "react";
import { CaretDown, CheckCircle, Eye, EyeSlash, Copy } from "@phosphor-icons/react";
import { changeAccountPassword } from "@/app/actions/auth-actions";
import { Button } from "@/components/ui/button";

/** Inline expand/collapse change-password panel used inside account cards. */
export function ChangePasswordInline({ authUserId }: { authUserId: string }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [savedPassword, setSavedPassword] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSave() {
    if (!password || password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setError("");
    startTransition(async () => {
      const result = await changeAccountPassword(authUserId, password);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSavedPassword(password);
      setPassword("");
    });
  }

  function handleCopy() {
    if (!savedPassword) return;
    navigator.clipboard.writeText(savedPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleClose() {
    setOpen(false);
    setSavedPassword(null);
    setPassword("");
    setError("");
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 flex items-center gap-1.5 text-[12px] font-medium text-accent hover:text-accent/80 transition-colors"
      >
        <CaretDown size={11} />
        Change password
      </button>
    );
  }

  return (
    <div className="mt-3 border-t border-border pt-3 flex flex-col gap-2">
      {savedPassword ? (
        <>
          <p className="text-[12px] text-success font-medium flex items-center gap-1.5">
            <CheckCircle size={13} weight="fill" />
            Password updated — share it with the user:
          </p>
          <div className="flex items-center gap-2 bg-surface border border-border rounded-[var(--radius-md)] px-3 py-2">
            <code className="flex-1 text-[13px] font-mono font-semibold text-foreground tracking-wide">
              {showPassword ? savedPassword : "•".repeat(savedPassword.length)}
            </code>
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="text-tertiary hover:text-foreground transition-colors mr-1"
            >
              {showPassword ? <EyeSlash size={14} /> : <Eye size={14} />}
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="text-[12px] font-medium text-accent hover:text-accent/80 flex items-center gap-1 transition-colors"
            >
              <Copy size={12} />
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="text-[12px] font-medium text-accent hover:underline text-left"
          >
            Done
          </button>
        </>
      ) : (
        <>
          {error && <p className="text-[11px] text-destructive">{error}</p>}
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError("");
              }}
              placeholder="New password (min. 8 chars)"
              className="w-full border border-border rounded-[var(--radius-md)] px-3 py-2 pr-10 text-[13px] text-foreground bg-card focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-tertiary hover:text-foreground transition-colors"
            >
              {showPassword ? <EyeSlash size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={handleClose}>
              Cancel
            </Button>
            <Button size="sm" disabled={pending} onClick={handleSave}>
              {pending ? "Saving…" : "Save password"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
