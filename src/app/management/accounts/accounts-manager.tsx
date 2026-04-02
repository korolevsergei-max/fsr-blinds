"use client";

import { useState, useTransition } from "react";
import { motion } from "framer-motion";
import {
  Envelope,
  Phone,
  CheckCircle,
  Plus,
  UserCircle,
  Factory,
  WarningCircle,
  Buildings,
  CaretDown,
  CaretUp,
  Eye,
  EyeSlash,
  Copy,
  Crown,
} from "@phosphor-icons/react";
import type { AppDataset } from "@/lib/app-dataset";
import type { Building, Client } from "@/lib/types";
import type { InstallerManufacturerAuthDrift } from "@/lib/account-sync";
import type { OwnerProfile } from "./page";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InlineAlert } from "@/components/ui/inline-alert";
import { InstallersList } from "@/components/installers/installers-list";
import { InviteInstallerForm } from "@/components/installers/invite-installer-form";
import {
  createManufacturerAccount,
  createSchedulerAccount,
  createOwnerAccount,
  deleteInstallerAccount,
  deleteManufacturerAccount,
  deleteSchedulerAccount,
  deleteOwnerAccount,
  deleteOrphanAuthAccount,
  setSchedulerBuildingAccess,
} from "@/app/actions/auth-actions";
import { CalendarCheck } from "@phosphor-icons/react";

type Tab = "installers" | "manufacturers" | "schedulers" | "owners";

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

export function AccountsManager({
  data,
  authDrift,
  schedulerAccess,
  ownerProfiles,
  currentUserAuthId,
}: {
  data: AppDataset;
  authDrift: InstallerManufacturerAuthDrift[];
  schedulerAccess: Record<string, string[]>;
  ownerProfiles: OwnerProfile[];
  currentUserAuthId: string;
}) {
  const { installers, manufacturers, schedulers, units, clients, buildings } = data;
  const [tab, setTab] = useState<Tab>("installers");
  const [showForm, setShowForm] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deletePending, startDeleteTransition] = useTransition();
  const [expandedAccessId, setExpandedAccessId] = useState<string | null>(null);

  const linkedManufacturers = manufacturers.filter((m) => Boolean(m.authUserId));
  const orphanManufacturers = manufacturers.filter((m) => !m.authUserId);
  const linkedSchedulers = schedulers.filter((s) => Boolean(s.authUserId));
  const orphanSchedulers = schedulers.filter((s) => !s.authUserId);

  const handleDeleteInstaller = (inst: AppDataset["installers"][number]) => {
    if (!confirm(`Delete installer "${inst.name}"? This will remove their account from the app (and Supabase auth if linked).`)) {
      return;
    }
    setDeleteError("");
    startDeleteTransition(async () => {
      const result = await deleteInstallerAccount(inst.id, inst.authUserId, inst.email);
      if (!result.ok) {
        setDeleteError(result.error);
        return;
      }
      window.location.reload();
    });
  };

  const handleDeleteManufacturer = (mfr: AppDataset["manufacturers"][number]) => {
    if (!confirm(`Delete manufacturer "${mfr.name}"? This will remove their account from the app (and Supabase auth if linked).`)) {
      return;
    }
    setDeleteError("");
    startDeleteTransition(async () => {
      const result = await deleteManufacturerAccount(mfr.id, mfr.authUserId, mfr.contactEmail);
      if (!result.ok) {
        setDeleteError(result.error);
        return;
      }
      window.location.reload();
    });
  };

  const handleDeleteScheduler = (sch: AppDataset["schedulers"][number]) => {
    if (!confirm(`Delete scheduler "${sch.name}"? This will remove their account from the app (and Supabase auth if linked).`)) {
      return;
    }
    setDeleteError("");
    startDeleteTransition(async () => {
      const result = await deleteSchedulerAccount(sch.id, sch.authUserId, sch.email);
      if (!result.ok) {
        setDeleteError(result.error);
        return;
      }
      window.location.reload();
    });
  };

  const handleDeleteOwner = (owner: OwnerProfile) => {
    if (owner.authUserId === currentUserAuthId) {
      alert("You cannot delete your own account.");
      return;
    }
    if (!confirm(`Delete owner "${owner.displayName}"? They will lose access immediately.`)) {
      return;
    }
    setDeleteError("");
    startDeleteTransition(async () => {
      const result = await deleteOwnerAccount(owner.authUserId, owner.email);
      if (!result.ok) {
        setDeleteError(result.error);
        return;
      }
      window.location.reload();
    });
  };

  const handleRemoveDrift = (entry: InstallerManufacturerAuthDrift) => {
    if (
      !confirm(
        `Remove Supabase login for ${entry.email}? They will not be able to sign in until invited again.`
      )
    ) {
      return;
    }
    setDeleteError("");
    startDeleteTransition(async () => {
      const result = await deleteOrphanAuthAccount(entry.authUserId, entry.email);
      if (!result.ok) {
        setDeleteError(result.error);
        return;
      }
      window.location.reload();
    });
  };

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Accounts"
        actions={
          <Button size="sm" onClick={() => setShowForm(!showForm)}>
            <Plus size={14} weight="bold" />
            Invite
          </Button>
        }
      />

      {authDrift.length > 0 && (
        <div className="px-4 pt-4 flex flex-col gap-3">
          <InlineAlert variant="warning">
            These logins exist in Supabase Authentication (installer or manufacturer) but are not
            linked from this Accounts list. Remove them to clear stale users, then invite again if
            needed.
          </InlineAlert>
          {authDrift.map((entry, i) => (
            <motion.div
              key={entry.authUserId}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: i * 0.06,
                duration: 0.3,
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              <div className="surface-card p-4">
                <div className="flex items-center gap-3 mb-3 justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-[var(--radius-md)] bg-warning-light border border-border flex items-center justify-center">
                      <WarningCircle size={22} className="text-warning" weight="fill" />
                    </div>
                    <div>
                      <h3 className="text-[14px] font-semibold text-foreground tracking-tight">
                        {entry.displayName}
                      </h3>
                      <p className="text-[12px] text-tertiary capitalize">
                        {entry.role} · not linked in app
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={deletePending}
                    onClick={() => handleRemoveDrift(entry)}
                  >
                    Remove from Auth
                  </Button>
                </div>
                <div className="flex items-center gap-2 text-[12px] text-secondary">
                  <Envelope size={12} />
                  {entry.email}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="px-4 pt-4 pb-3 flex gap-2 overflow-x-auto no-scrollbar">
        {(["installers", "manufacturers", "schedulers", "owners"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={[
              "px-4 py-2 rounded-[var(--radius-full)] text-[13px] font-semibold transition-all duration-150 whitespace-nowrap",
              tab === t
                ? "bg-accent text-white"
                : "bg-surface border border-border text-secondary hover:text-foreground",
            ].join(" ")}
          >
            {t === "installers" ? "Installers"
              : t === "manufacturers" ? "Manufacturers"
              : t === "schedulers" ? "Schedulers"
              : "Owners"}
          </button>
        ))}
      </div>

      {/* Invite form */}
      {showForm && (
        <div className="px-4 pb-3">
          {tab === "installers" ? (
            <InviteInstallerForm
              onDone={() => { setShowForm(false); window.location.reload(); }}
            />
          ) : tab === "manufacturers" ? (
            <InviteManufacturerForm
              onDone={() => { setShowForm(false); window.location.reload(); }}
            />
          ) : tab === "schedulers" ? (
            <InviteSchedulerForm
              onDone={() => { setShowForm(false); window.location.reload(); }}
            />
          ) : (
            <InviteOwnerForm
              onDone={() => { setShowForm(false); window.location.reload(); }}
            />
          )}
        </div>
      )}

      {/* List */}
      <div className="px-4 flex flex-col gap-3 pb-8">
        {deleteError && <InlineAlert variant="error">{deleteError}</InlineAlert>}

        {tab === "installers" && (
          <>
            <InstallersList
              installers={installers}
              units={units}
              showDelete
              deletePending={deletePending}
              onDelete={handleDeleteInstaller}
              emptyMessage="No installers yet. Tap Invite to add one."
            />
          </>
        )}

        {tab === "manufacturers" && (
          <>
            {linkedManufacturers.map((mfr, i) => (
              <motion.div
                key={mfr.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: i * 0.06,
                  duration: 0.3,
                  ease: [0.16, 1, 0.3, 1],
                }}
              >
                <div className="surface-card p-4">
                  <div className="flex items-center gap-3 mb-3 justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-[var(--radius-md)] bg-surface border border-border flex items-center justify-center">
                        <Factory size={22} className="text-tertiary" />
                      </div>
                      <div>
                        <h3 className="text-[14px] font-semibold text-foreground tracking-tight">
                          {mfr.name}
                        </h3>
                        <p className="text-[12px] text-tertiary">Manufacturer</p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={deletePending}
                      onClick={() => handleDeleteManufacturer(mfr)}
                    >
                      Delete
                    </Button>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    {mfr.contactName && (
                      <div className="flex items-center gap-2 text-[12px] text-secondary">
                        <UserCircle size={12} />
                        {mfr.contactName}
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-[12px] text-secondary">
                      <Envelope size={12} />
                      {mfr.contactEmail}
                    </div>
                    {mfr.contactPhone && (
                      <div className="flex items-center gap-2 text-[12px] text-secondary">
                        <Phone size={12} />
                        {mfr.contactPhone}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}

            {orphanManufacturers.length > 0 && (
              <>
                <div className="pt-2">
                  <InlineAlert variant="error">
                    Orphaned manufacturer records (not linked to Supabase Auth):{" "}
                    {orphanManufacturers.length}. Use Delete to remove them.
                  </InlineAlert>
                </div>
                {orphanManufacturers.map((mfr, i) => (
                  <motion.div
                    key={mfr.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      delay: i * 0.06,
                      duration: 0.3,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                  >
                    <div className="surface-card p-4">
                      <div className="flex items-center gap-3 mb-3 justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-[var(--radius-md)] bg-surface border border-border flex items-center justify-center">
                            <Factory size={22} className="text-tertiary" />
                          </div>
                          <div>
                            <h3 className="text-[14px] font-semibold text-foreground tracking-tight">
                              {mfr.name}
                            </h3>
                            <p className="text-[12px] text-tertiary">Manufacturer</p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={deletePending}
                          onClick={() => handleDeleteManufacturer(mfr)}
                        >
                          Delete
                        </Button>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        {mfr.contactName && (
                          <div className="flex items-center gap-2 text-[12px] text-secondary">
                            <UserCircle size={12} />
                            {mfr.contactName}
                          </div>
                        )}
                        <div className="flex items-center gap-2 text-[12px] text-secondary">
                          <Envelope size={12} />
                          {mfr.contactEmail}
                        </div>
                        {mfr.contactPhone && (
                          <div className="flex items-center gap-2 text-[12px] text-secondary">
                            <Phone size={12} />
                            {mfr.contactPhone}
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </>
            )}

            {manufacturers.length === 0 && (
              <div className="text-center py-12 text-[13px] text-tertiary">
                No manufacturers yet. Tap Invite to add one.
              </div>
            )}
          </>
        )}

        {tab === "schedulers" && (
          <>
            {linkedSchedulers.map((sch, i) => (
              <motion.div
                key={sch.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className="surface-card p-4">
                  <div className="flex items-center gap-3 mb-3 justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-[var(--radius-md)] bg-surface border border-border flex items-center justify-center">
                        <CalendarCheck size={22} className="text-tertiary" />
                      </div>
                      <div>
                        <h3 className="text-[14px] font-semibold text-foreground tracking-tight">
                          {sch.name}
                        </h3>
                        <p className="text-[12px] text-tertiary">Scheduler</p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={deletePending}
                      onClick={() => handleDeleteScheduler(sch)}
                    >
                      Delete
                    </Button>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2 text-[12px] text-secondary">
                      <Envelope size={12} />
                      {sch.email}
                    </div>
                    {sch.phone && (
                      <div className="flex items-center gap-2 text-[12px] text-secondary">
                        <Phone size={12} />
                        {sch.phone}
                      </div>
                    )}
                  </div>

                  {/* Building access toggle */}
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedAccessId(expandedAccessId === sch.id ? null : sch.id)
                    }
                    className="mt-3 flex items-center gap-1.5 text-[12px] font-medium text-accent hover:text-accent/80 transition-colors"
                  >
                    <Buildings size={13} />
                    Manage building access
                    {expandedAccessId === sch.id ? (
                      <CaretUp size={11} />
                    ) : (
                      <CaretDown size={11} />
                    )}
                  </button>

                  {expandedAccessId === sch.id && (
                    <SchedulerAccessEditor
                      schedulerId={sch.id}
                      clients={clients}
                      buildings={buildings}
                      initialAllowedIds={schedulerAccess[sch.id] ?? []}
                    />
                  )}
                </div>
              </motion.div>
            ))}

            {orphanSchedulers.length > 0 && (
              <>
                <div className="pt-2">
                  <InlineAlert variant="error">
                    Orphaned scheduler records (not linked to Supabase Auth):{" "}
                    {orphanSchedulers.length}. Use Delete to remove them.
                  </InlineAlert>
                </div>
                {orphanSchedulers.map((sch, i) => (
                  <motion.div
                    key={sch.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <div className="surface-card p-4">
                      <div className="flex items-center gap-3 justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-[var(--radius-md)] bg-surface border border-border flex items-center justify-center">
                            <CalendarCheck size={22} className="text-tertiary" />
                          </div>
                          <div>
                            <h3 className="text-[14px] font-semibold text-foreground tracking-tight">{sch.name}</h3>
                            <p className="text-[12px] text-tertiary">Scheduler (orphan)</p>
                          </div>
                        </div>
                        <Button size="sm" variant="danger" disabled={deletePending} onClick={() => handleDeleteScheduler(sch)}>
                          Delete
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </>
            )}

            {schedulers.length === 0 && (
              <div className="text-center py-12 text-[13px] text-tertiary">
                No schedulers yet. Tap Invite to add one.
              </div>
            )}
          </>
        )}

        {tab === "owners" && (
          <>
            {ownerProfiles.map((owner, i) => (
              <motion.div
                key={owner.authUserId}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className="surface-card p-4">
                  <div className="flex items-center gap-3 justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-[var(--radius-md)] bg-accent/10 border border-accent/20 flex items-center justify-center">
                        <Crown size={20} className="text-accent" weight="fill" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h3 className="text-[14px] font-semibold text-foreground tracking-tight">
                            {owner.displayName}
                          </h3>
                          {owner.authUserId === currentUserAuthId && (
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-accent bg-accent/10 px-1.5 py-0.5 rounded-full">
                              you
                            </span>
                          )}
                        </div>
                        <p className="text-[12px] text-tertiary">Owner</p>
                      </div>
                    </div>
                    {owner.authUserId !== currentUserAuthId && (
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={deletePending}
                        onClick={() => handleDeleteOwner(owner)}
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-[12px] text-secondary">
                    <Envelope size={12} />
                    {owner.email}
                  </div>
                </div>
              </motion.div>
            ))}

            {ownerProfiles.length === 0 && (
              <div className="text-center py-12 text-[13px] text-tertiary">
                No owner profiles found.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SchedulerAccessEditor({
  schedulerId,
  clients,
  buildings,
  initialAllowedIds,
}: {
  schedulerId: string;
  clients: Client[];
  buildings: Building[];
  initialAllowedIds: string[];
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(initialAllowedIds)
  );
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const handleSave = () => {
    setError("");
    startTransition(async () => {
      const result = await setSchedulerBuildingAccess(schedulerId, [...selectedIds]);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    });
  };

  const toggleBuilding = (buildingId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(buildingId)) next.delete(buildingId);
      else next.add(buildingId);
      return next;
    });
    setSaved(false);
  };

  const toggleClient = (clientId: string) => {
    const clientBuildings = buildings.filter((b) => b.clientId === clientId);
    const allSelected = clientBuildings.every((b) => selectedIds.has(b.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        clientBuildings.forEach((b) => next.delete(b.id));
      } else {
        clientBuildings.forEach((b) => next.add(b.id));
      }
      return next;
    });
    setSaved(false);
  };

  const clientsWithBuildings = clients.filter((c) =>
    buildings.some((b) => b.clientId === c.id)
  );

  return (
    <div className="mt-3 pt-3 border-t border-border flex flex-col gap-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-tertiary">
        Building Access
      </p>

      {clientsWithBuildings.length === 0 ? (
        <p className="text-[12px] text-tertiary">No clients or buildings configured yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {clientsWithBuildings.map((client) => {
            const clientBuildings = buildings.filter((b) => b.clientId === client.id);
            const allSelected = clientBuildings.every((b) => selectedIds.has(b.id));
            const someSelected = clientBuildings.some((b) => selectedIds.has(b.id));

            return (
              <div key={client.id} className="border border-border rounded-[var(--radius-md)] p-3">
                <button
                  type="button"
                  onClick={() => toggleClient(client.id)}
                  className="flex items-center gap-2 w-full text-left"
                >
                  <span
                    className={[
                      "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors",
                      allSelected
                        ? "bg-accent border-accent"
                        : someSelected
                          ? "bg-accent/25 border-accent/50"
                          : "border-border bg-surface",
                    ].join(" ")}
                  >
                    {(allSelected || someSelected) && (
                      <CheckCircle
                        size={10}
                        className="text-white"
                        weight="fill"
                      />
                    )}
                  </span>
                  <span className="text-[13px] font-semibold text-foreground flex-1">
                    {client.name}
                  </span>
                  <span className="text-[11px] text-tertiary">
                    {clientBuildings.filter((b) => selectedIds.has(b.id)).length}/
                    {clientBuildings.length}
                  </span>
                </button>

                <div className="mt-2 flex flex-col gap-1.5 pl-6">
                  {clientBuildings.map((building) => (
                    <button
                      key={building.id}
                      type="button"
                      onClick={() => toggleBuilding(building.id)}
                      className="flex items-center gap-2 text-left"
                    >
                      <span
                        className={[
                          "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors",
                          selectedIds.has(building.id)
                            ? "bg-accent border-accent"
                            : "border-border bg-surface",
                        ].join(" ")}
                      >
                        {selectedIds.has(building.id) && (
                          <CheckCircle size={10} className="text-white" weight="fill" />
                        )}
                      </span>
                      <span className="text-[12px] text-secondary">{building.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {error && <InlineAlert variant="error">{error}</InlineAlert>}

      <div className="flex items-center gap-3">
        <Button size="sm" disabled={pending} onClick={handleSave}>
          {pending ? "Saving…" : saved ? "Saved!" : "Save access"}
        </Button>
        {saved && (
          <span className="flex items-center gap-1 text-[12px] text-success font-medium">
            <CheckCircle size={13} weight="fill" />
            Changes saved
          </span>
        )}
      </div>
    </div>
  );
}

function InviteSchedulerForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [createdCreds, setCreatedCreds] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState<"email" | "password" | null>(null);
  const [pending, startTransition] = useTransition();

  const handleSubmit = () => {
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
      const result = await createSchedulerAccount(name, email, phone, password);
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
          Share these login credentials with the scheduler directly.
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

  return (
    <div className="surface-card p-4 flex flex-col gap-4">
      <div>
        <p className="text-[15px] font-semibold text-foreground tracking-tight">Add scheduler</p>
        <p className="text-[12px] text-tertiary mt-0.5">Set their email and password — no email sent. Share credentials directly.</p>
      </div>

      {error && <InlineAlert variant="error">{error}</InlineAlert>}

      <Input label="Name" value={name} onChange={(e) => { setName(e.target.value); if (error) setError(""); }} placeholder="Jordan Bell" autoFocus />
      <Input label="Email" type="email" value={email} onChange={(e) => { setEmail(e.target.value); if (error) setError(""); }} placeholder="jordan@fsrblinds.ca" />
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
          <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-tertiary hover:text-foreground transition-colors">
            {showPassword ? <EyeSlash size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <Button size="sm" variant="secondary" onClick={onDone}>Cancel</Button>
        <Button size="sm" disabled={pending} onClick={handleSubmit}>
          {pending ? "Creating…" : "Create account"}
        </Button>
      </div>
    </div>
  );
}

function InviteManufacturerForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [tempPassword, setTempPassword] = useState("");
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const handleSubmit = () => {
    if (!name.trim() || !email.trim()) {
      setError("Company name and email are required.");
      return;
    }
    setError("");
    startTransition(async () => {
      const result = await createManufacturerAccount(name, email, contactName, phone);
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
        <p className="text-[15px] font-semibold text-foreground tracking-tight">Invite manufacturer</p>
        <p className="text-[12px] text-tertiary mt-0.5">They will receive an email to complete setup.</p>
      </div>

      {error && <InlineAlert variant="error">{error}</InlineAlert>}

      {success ? (
        tempPassword ? (
          <div className="flex flex-col gap-3">
            <InlineAlert variant="warning">
              Email invite couldn&apos;t be sent (rate limit). Account was created — share this temporary password:
            </InlineAlert>
            <div className="flex items-center gap-2 bg-surface border border-border rounded-[var(--radius-md)] px-3 py-2">
              <code className="flex-1 text-[14px] font-mono font-semibold text-foreground tracking-wide">{tempPassword}</code>
              <button
                onClick={handleCopy}
                className="text-[12px] font-medium text-accent hover:text-accent/80 transition-colors"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <p className="text-[11px] text-tertiary">They can change their password after first login.</p>
            <button onClick={onDone} className="text-[13px] font-medium text-accent hover:underline text-left">Done</button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-[14px] text-success font-medium py-2">
            <CheckCircle size={16} weight="fill" />
            Invite sent
          </div>
        )
      ) : (
        <>
          <Input label="Company name" value={name} onChange={(e) => { setName(e.target.value); if (error) setError(""); }} placeholder="Cascade Window Co" autoFocus />
          <Input label="Contact person" value={contactName} onChange={(e) => { setContactName(e.target.value); if (error) setError(""); }} placeholder="Reza Tehrani" />
          <Input label="Email" type="email" value={email} onChange={(e) => { setEmail(e.target.value); if (error) setError(""); }} placeholder="info@blindsco.ca" />
          <Input label="Phone" type="tel" value={phone} onChange={(e) => { setPhone(e.target.value); if (error) setError(""); }} placeholder="+1 (416) 555-0000" />
          <div className="flex gap-2 pt-1">
            <Button size="sm" variant="secondary" onClick={onDone}>Cancel</Button>
            <Button size="sm" disabled={pending} onClick={handleSubmit}>
              {pending ? "Sending…" : "Send invite"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function InviteOwnerForm({ onDone }: { onDone: () => void }) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [createdCreds, setCreatedCreds] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState<"email" | "password" | null>(null);
  const [pending, startTransition] = useTransition();

  const handleSubmit = () => {
    if (!displayName.trim() || !email.trim()) {
      setError("Name and email are required.");
      return;
    }
    if (!password || password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setError("");
    startTransition(async () => {
      const result = await createOwnerAccount(displayName, email, password);
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
          <p className="text-[15px] font-semibold text-foreground tracking-tight">Owner account created</p>
        </div>
        <p className="text-[12px] text-tertiary -mt-2">
          Share these login credentials with the new co-owner directly.
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

  return (
    <div className="surface-card p-4 flex flex-col gap-4">
      <div>
        <p className="text-[15px] font-semibold text-foreground tracking-tight">Add co-owner</p>
        <p className="text-[12px] text-tertiary mt-0.5">
          They will have full owner access. No email sent — share credentials directly.
        </p>
      </div>

      {error && <InlineAlert variant="error">{error}</InlineAlert>}

      <Input label="Full name" value={displayName} onChange={(e) => { setDisplayName(e.target.value); if (error) setError(""); }} placeholder="Alex Korolev" autoFocus />
      <Input label="Email" type="email" value={email} onChange={(e) => { setEmail(e.target.value); if (error) setError(""); }} placeholder="alex@fsrblinds.ca" />

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
          <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-tertiary hover:text-foreground transition-colors">
            {showPassword ? <EyeSlash size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <Button size="sm" variant="secondary" onClick={onDone}>Cancel</Button>
        <Button size="sm" disabled={pending} onClick={handleSubmit}>
          {pending ? "Creating…" : "Create owner account"}
        </Button>
      </div>
    </div>
  );
}
