"use client";

import { useState, useTransition } from "react";
import { CheckCircle, Copy, Eye, EyeSlash } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InlineAlert } from "@/components/ui/inline-alert";
import {
  createManufacturingPartner,
  createSubcontractorAccount,
} from "@/app/actions/auth-actions";
import type { ManufacturingPartner } from "@/lib/types";

/**
 * Two steps in one form: a subcontractor login must belong to a partner company,
 * and on first use no external company exists yet — so the partner picker doubles
 * as a "create one" affordance rather than sending the owner to another screen.
 */
export function InviteSubcontractorForm({
  partners,
  onDone,
}: {
  partners: ManufacturingPartner[];
  onDone: () => void;
}) {
  const external = partners.filter((p) => !p.isInternal);

  const [partnerId, setPartnerId] = useState(external[0]?.id ?? "");
  const [newPartnerName, setNewPartnerName] = useState("");
  const [creatingPartner, setCreatingPartner] = useState(external.length === 0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [createdCreds, setCreatedCreds] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState<"email" | "password" | null>(null);
  const [pending, startTransition] = useTransition();

  const handleCreatePartner = () => {
    if (!newPartnerName.trim()) {
      setError("Enter the manufacturer's company name.");
      return;
    }
    setError("");
    startTransition(async () => {
      const result = await createManufacturingPartner(newPartnerName, "", "", "");
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // The partner list arrives with the dataset; reload so the picker sees it.
      window.location.reload();
    });
  };

  const handleSubmit = () => {
    if (!partnerId) {
      setError("Choose which manufacturer this login belongs to.");
      return;
    }
    if (!name.trim() || !email.trim()) {
      setError("Name and email are required.");
      return;
    }
    if (!password || password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setError("");
    startTransition(async () => {
      const result = await createSubcontractorAccount(name, email, phone, password, partnerId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCreatedCreds({ email: email.trim(), password });
    });
  };

  const handleCopy = (field: "email" | "password", value: string) => {
    navigator.clipboard.writeText(value);
    setCopied(field);
    setTimeout(() => setCopied(null), 2000);
  };

  if (createdCreds) {
    return (
      <div className="surface-card p-4 flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <CheckCircle size={18} weight="fill" className="text-success" />
          <p className="text-[15px] font-semibold text-foreground tracking-tight">Account created</p>
        </div>
        <p className="text-[12px] text-tertiary -mt-2">
          Share these login credentials with the subcontractor directly.
        </p>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 bg-surface border border-border rounded-[var(--radius-md)] px-3 py-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-tertiary w-14 flex-shrink-0">Email</span>
            <code className="flex-1 text-[13px] font-mono text-foreground truncate">{createdCreds.email}</code>
            <button type="button" onClick={() => handleCopy("email", createdCreds.email)} className="text-[12px] font-medium text-accent hover:text-accent/80 transition-colors flex items-center gap-1">
              <Copy size={12} />
              {copied === "email" ? "Copied!" : "Copy"}
            </button>
          </div>
          <div className="flex items-center gap-2 bg-surface border border-border rounded-[var(--radius-md)] px-3 py-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-tertiary w-14 flex-shrink-0">Password</span>
            <code className="flex-1 text-[13px] font-mono text-foreground tracking-wide">
              {showPassword ? createdCreds.password : "•".repeat(createdCreds.password.length)}
            </code>
            <button type="button" onClick={() => setShowPassword((v) => !v)} className="text-tertiary hover:text-foreground transition-colors mr-1">
              {showPassword ? <EyeSlash size={14} /> : <Eye size={14} />}
            </button>
            <button type="button" onClick={() => handleCopy("password", createdCreds.password)} className="text-[12px] font-medium text-accent hover:text-accent/80 transition-colors flex items-center gap-1">
              <Copy size={12} />
              {copied === "password" ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
        <button type="button" onClick={onDone} className="text-[13px] font-medium text-accent hover:underline text-left">Done</button>
      </div>
    );
  }

  if (creatingPartner) {
    return (
      <div className="surface-card p-4 flex flex-col gap-4">
        <div>
          <p className="text-[15px] font-semibold text-foreground tracking-tight">Add manufacturer</p>
          <p className="text-[12px] text-tertiary mt-0.5">
            The company that will manufacture the units. You&apos;ll create their login next.
          </p>
        </div>
        {error && <InlineAlert variant="error">{error}</InlineAlert>}
        <Input
          label="Company name"
          value={newPartnerName}
          onChange={(e) => { setNewPartnerName(e.target.value); if (error) setError(""); }}
          placeholder="Precision Blinds Co."
          autoFocus
        />
        <div className="flex gap-2">
          <Button onClick={handleCreatePartner} disabled={pending} className="flex-1">
            {pending ? "Adding…" : "Add manufacturer"}
          </Button>
          {external.length > 0 && (
            <Button variant="secondary" onClick={() => { setCreatingPartner(false); setError(""); }}>
              Cancel
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="surface-card p-4 flex flex-col gap-4">
      <div>
        <p className="text-[15px] font-semibold text-foreground tracking-tight">Add subcontractor login</p>
        <p className="text-[12px] text-tertiary mt-0.5">
          Set their email and password — no email sent. Share credentials directly.
        </p>
      </div>
      {error && <InlineAlert variant="error">{error}</InlineAlert>}

      <div className="flex flex-col gap-1.5">
        <label className="text-[12px] font-semibold text-secondary">Manufacturer</label>
        <select
          value={partnerId}
          onChange={(e) => { setPartnerId(e.target.value); if (error) setError(""); }}
          className="w-full border border-border rounded-[var(--radius-md)] px-3 py-2.5 text-[13px] text-foreground bg-card focus:outline-none focus:ring-2 focus:ring-accent"
        >
          {external.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => { setCreatingPartner(true); setError(""); }}
          className="text-[12px] font-medium text-accent hover:underline text-left"
        >
          + Add another manufacturer
        </button>
      </div>

      <Input label="Name" value={name} onChange={(e) => { setName(e.target.value); if (error) setError(""); }} placeholder="Jordan Blake" />
      <Input label="Email" type="email" value={email} onChange={(e) => { setEmail(e.target.value); if (error) setError(""); }} placeholder="jordan@precisionblinds.ca" />
      <Input label="Phone" type="tel" value={phone} onChange={(e) => { setPhone(e.target.value); if (error) setError(""); }} placeholder="+1 (416) 555-0000" />
      <div className="flex flex-col gap-1.5">
        <label className="text-[12px] font-semibold text-secondary">Password</label>
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => { setPassword(e.target.value); if (error) setError(""); }}
            placeholder="Min. 8 characters"
            className="w-full border border-border rounded-[var(--radius-md)] px-3 py-2.5 pr-10 text-[13px] text-foreground bg-card focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-tertiary hover:text-foreground transition-colors"
          >
            {showPassword ? <EyeSlash size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>
      <Button onClick={handleSubmit} disabled={pending} className="w-full">
        {pending ? "Creating…" : "Create Account"}
      </Button>
    </div>
  );
}
