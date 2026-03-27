"use client";

import { useState, useTransition } from "react";
import { motion } from "framer-motion";
import {
  Envelope,
  Phone,
  Buildings,
  CheckCircle,
  Plus,
  UserCircle,
  Factory,
  WarningCircle,
} from "@phosphor-icons/react";
import type { AppDataset } from "@/lib/app-dataset";
import type { InstallerManufacturerAuthDrift } from "@/lib/account-sync";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InlineAlert } from "@/components/ui/inline-alert";
import {
  createInstallerAccount,
  createManufacturerAccount,
  createSchedulerAccount,
  deleteInstallerAccount,
  deleteManufacturerAccount,
  deleteSchedulerAccount,
  deleteOrphanAuthAccount,
} from "@/app/actions/auth-actions";
import { CalendarCheck } from "@phosphor-icons/react";

type Tab = "installers" | "manufacturers" | "schedulers";

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
}: {
  data: AppDataset;
  authDrift: InstallerManufacturerAuthDrift[];
}) {
  const { installers, manufacturers, schedulers, units } = data;
  const [tab, setTab] = useState<Tab>("installers");
  const [showForm, setShowForm] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deletePending, startDeleteTransition] = useTransition();

  const linkedInstallers = installers.filter((i) => Boolean(i.authUserId));
  const orphanInstallers = installers.filter((i) => !i.authUserId);
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
        {(["installers", "manufacturers", "schedulers"] as Tab[]).map((t) => (
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
            {t === "installers" ? "Installers" : t === "manufacturers" ? "Manufacturers" : "Schedulers"}
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
          ) : (
            <InviteSchedulerForm
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
            {linkedInstallers.map((inst, i) => {
              const assignedUnits = units.filter(
                (u) => u.assignedInstallerId === inst.id
              );
              const activeUnits = assignedUnits.filter(
                (u) => u.status !== "client_approved"
              );
              const completedUnits = assignedUnits.filter(
                (u) => u.status === "client_approved"
              );

              return (
                <motion.div
                  key={inst.id}
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
                          <UserCircle size={22} className="text-tertiary" />
                        </div>
                        <div>
                          <h3 className="text-[14px] font-semibold text-foreground tracking-tight">
                            {inst.name}
                          </h3>
                          <p className="text-[12px] text-tertiary">Installer</p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={deletePending}
                        onClick={() => handleDeleteInstaller(inst)}
                      >
                        Delete
                      </Button>
                    </div>

                    <div className="flex flex-col gap-1.5 mb-3">
                      <div className="flex items-center gap-2 text-[12px] text-secondary">
                        <Envelope size={12} />
                        {inst.email}
                      </div>
                      <div className="flex items-center gap-2 text-[12px] text-secondary">
                        <Phone size={12} />
                        {inst.phone}
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-[12px] text-tertiary border-t border-border-subtle pt-3">
                      <span className="flex items-center gap-1">
                        <Buildings size={12} />
                        <span className="font-mono font-semibold text-foreground">
                          {activeUnits.length}
                        </span>{" "}
                        active
                      </span>
                      <span className="flex items-center gap-1">
                        <CheckCircle size={12} />
                        <span className="font-mono font-semibold text-foreground">
                          {completedUnits.length}
                        </span>{" "}
                        completed
                      </span>
                    </div>
                  </div>
                </motion.div>
              );
            })}

            {orphanInstallers.length > 0 && (
              <>
                <div className="pt-2">
                  <InlineAlert variant="error">
                    Orphaned installer records (not linked to Supabase Auth):{" "}
                    {orphanInstallers.length}. Use Delete to remove them.
                  </InlineAlert>
                </div>
                {orphanInstallers.map((inst, i) => {
                  const assignedUnits = units.filter(
                    (u) => u.assignedInstallerId === inst.id
                  );
                  const activeUnits = assignedUnits.filter(
                    (u) => u.status !== "client_approved"
                  );
                  const completedUnits = assignedUnits.filter(
                    (u) => u.status === "client_approved"
                  );

                  return (
                    <motion.div
                      key={inst.id}
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
                              <UserCircle size={22} className="text-tertiary" />
                            </div>
                            <div>
                              <h3 className="text-[14px] font-semibold text-foreground tracking-tight">
                                {inst.name}
                              </h3>
                              <p className="text-[12px] text-tertiary">Installer</p>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={deletePending}
                            onClick={() => handleDeleteInstaller(inst)}
                          >
                            Delete
                          </Button>
                        </div>

                        <div className="flex flex-col gap-1.5 mb-3">
                          <div className="flex items-center gap-2 text-[12px] text-secondary">
                            <Envelope size={12} />
                            {inst.email}
                          </div>
                          <div className="flex items-center gap-2 text-[12px] text-secondary">
                            <Phone size={12} />
                            {inst.phone}
                          </div>
                        </div>

                        <div className="flex items-center gap-4 text-[12px] text-tertiary border-t border-border-subtle pt-3">
                          <span className="flex items-center gap-1">
                            <Buildings size={12} />
                            <span className="font-mono font-semibold text-foreground">
                              {activeUnits.length}
                            </span>{" "}
                            active
                          </span>
                          <span className="flex items-center gap-1">
                            <CheckCircle size={12} />
                            <span className="font-mono font-semibold text-foreground">
                              {completedUnits.length}
                            </span>{" "}
                            completed
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </>
            )}

            {installers.length === 0 && (
              <div className="text-center py-12 text-[13px] text-tertiary">
                No installers yet. Tap Invite to add one.
              </div>
            )}
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
      </div>
    </div>
  );
}

function InviteInstallerForm({ onDone }: { onDone: () => void }) {
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
        <p className="text-[12px] text-tertiary mt-0.5">They will receive an email to set up their account.</p>
      </div>

      {error && <InlineAlert variant="error">{error}</InlineAlert>}

      {success ? (
        tempPassword ? (
          <div className="flex flex-col gap-3">
            <InlineAlert variant="warning">
              Email invite couldn&apos;t be sent (rate limit). Account was created — share this temporary password with the installer:
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
            <p className="text-[11px] text-tertiary">The installer can change their password after first login.</p>
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
          <Input label="Name" value={name} onChange={(e) => { setName(e.target.value); if (error) setError(""); }} placeholder="Alex Naidu" autoFocus />
          <Input label="Email" type="email" value={email} onChange={(e) => { setEmail(e.target.value); if (error) setError(""); }} placeholder="jane@fsrblinds.ca" />
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

function InviteSchedulerForm({ onDone }: { onDone: () => void }) {
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
      const result = await createSchedulerAccount(name, email, phone);
      if (!result.ok) {
        setError(humanizeInviteError(result.error));
        return;
      }
      if (result.tempPassword) setTempPassword(result.tempPassword);
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
        <p className="text-[15px] font-semibold text-foreground tracking-tight">Invite scheduler</p>
        <p className="text-[12px] text-tertiary mt-0.5">They will receive an email to set up their account.</p>
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
          <Input label="Name" value={name} onChange={(e) => { setName(e.target.value); if (error) setError(""); }} placeholder="Jordan Bell" autoFocus />
          <Input label="Email" type="email" value={email} onChange={(e) => { setEmail(e.target.value); if (error) setError(""); }} placeholder="jordan@fsrblinds.ca" />
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
