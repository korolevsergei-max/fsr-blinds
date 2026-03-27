"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle } from "@phosphor-icons/react";
import { createClient_ } from "@/app/actions/management-actions";
import { PageHeader } from "@/components/ui/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";

export function ClientForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const handleSave = () => {
    setError("");
    if (!name.trim()) {
      setError("Client name is required.");
      return;
    }

    startTransition(async () => {
      const result = await createClient_(
        name,
        contactName,
        contactEmail,
        contactPhone
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
      setTimeout(() => router.push("/management/clients"), 800);
    });
  };

  return (
    <div className="flex flex-col min-h-[100dvh]">
      <PageHeader title="New client" backHref="/management/clients" />

      <div className="flex-1 px-4 py-5 flex flex-col gap-4">
        {error && <InlineAlert variant="error">{error}</InlineAlert>}

        <Input
          label="Company name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Granite Peak Developments"
          autoFocus
        />
        <Input
          label="Contact name"
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
          placeholder="Marcus Albrecht"
        />
        <Input
          label="Contact email"
          type="email"
          value={contactEmail}
          onChange={(e) => setContactEmail(e.target.value)}
          placeholder="marcus@company.ca"
        />
        <Input
          label="Contact phone"
          type="tel"
          value={contactPhone}
          onChange={(e) => setContactPhone(e.target.value)}
          placeholder="+1 (416) 555-7834"
        />

        <div className="pt-4 pb-24">
          {saved ? (
            <div className="flex items-center justify-center gap-2 h-[3.25rem] rounded-[var(--radius-full)] bg-success text-white font-semibold text-[15px]">
              <CheckCircle size={18} weight="fill" />
              Client created
            </div>
          ) : (
            <Button
              fullWidth
              size="lg"
              disabled={!name.trim() || pending}
              onClick={handleSave}
            >
              {pending ? "Creating…" : "Create client"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
