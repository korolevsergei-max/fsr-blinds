"use client";

import { useState, useTransition } from "react";
import { CheckCircle } from "@phosphor-icons/react";
import { createInstallerAccount } from "@/app/actions/auth-actions";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { Input } from "@/components/ui/input";

function humanizeInviteError(message: string): string {
  const normalized = message.toLowerCase();

  if (normalized.includes("email rate limit exceeded")) {
    return "Too many emails were sent recently. Please wait a few minutes, then try again.";
  }
  if (normalized.includes("user already registered")) {
    return "This email is already registered. Ask the user to sign in or use Forgot password.";
  }
  if (normalized.includes("invalid email")) {
    return "Please enter a valid email address.";
  }

  return message;
}

export function InviteInstallerForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [tempPassword, setTempPassword] = useState("");
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const handleSubmit = () => {
    if (!name.trim() || !email.trim()) {
      setError("Name and email are required.");
      return;
    }

    setError("");
    startTransition(async () => {
      const result = await createInstallerAccount(name, email, phone);
      if (!result.ok) {
        setError(humanizeInviteError(result.error));
        return;
      }
      if (result.tempPassword) {
        setTempPassword(result.tempPassword);
      }
      setSuccess(true);
      if (!result.tempPassword) setTimeout(onDone, 800);
    });
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(tempPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="surface-card p-4 flex flex-col gap-4">
      <div>
        <p className="text-[15px] font-semibold text-foreground tracking-tight">Invite installer</p>
        <p className="text-[12px] text-tertiary mt-0.5">
          They will receive an email to set up their account.
        </p>
      </div>

      {error && <InlineAlert variant="error">{error}</InlineAlert>}

      {success ? (
        tempPassword ? (
          <div className="flex flex-col gap-3">
            <InlineAlert variant="warning">
              Email invite couldn&apos;t be sent (rate limit). Account was created, share this
              temporary password with the installer:
            </InlineAlert>
            <div className="flex items-center gap-2 bg-surface border border-border rounded-[var(--radius-md)] px-3 py-2">
              <code className="flex-1 text-[14px] font-mono font-semibold text-foreground tracking-wide">
                {tempPassword}
              </code>
              <button
                type="button"
                onClick={handleCopy}
                className="text-[12px] font-medium text-accent hover:text-accent/80 transition-colors"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <p className="text-[11px] text-tertiary">
              The installer can change their password after first login.
            </p>
            <button
              type="button"
              onClick={onDone}
              className="text-[13px] font-medium text-accent hover:underline text-left"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-[14px] text-success font-medium py-2">
            <CheckCircle size={16} weight="fill" />
            Invite sent
          </div>
        )
      ) : (
        <>
          <Input
            label="Name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError("");
            }}
            placeholder="Alex Naidu"
            autoFocus
          />
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (error) setError("");
            }}
            placeholder="jane@fsrblinds.ca"
          />
          <Input
            label="Phone"
            type="tel"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              if (error) setError("");
            }}
            placeholder="+1 (416) 555-0000"
          />
          <div className="flex gap-2 pt-1">
            <Button size="sm" variant="secondary" onClick={onDone}>
              Cancel
            </Button>
            <Button size="sm" disabled={pending} onClick={handleSubmit}>
              {pending ? "Sending…" : "Send invite"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
