"use client";

import { useState, useTransition, type ReactNode } from "react";
import {
  Envelope,
  Phone,
  CheckCircle,
  ShieldCheck,
  Plus,
  UserCircle,
  Factory,
  WarningCircle,
  Buildings,
  CaretDown,
  CaretUp,
  Crown,
  CalendarCheck,
} from "@phosphor-icons/react";
import type { AppDataset } from "@/lib/app-dataset";
import type { Assembler, ManufacturingPartner, Qc, Subcontractor } from "@/lib/types";
import { InviteSubcontractorForm } from "./forms/invite-subcontractor-form";
import { deleteSubcontractorAccount, deleteManufacturingPartner } from "@/app/actions/auth-actions";
import type { InstallerCutterAuthDrift } from "@/lib/account-sync";
import { PageHeader } from "@/components/ui/page-header";
import { RefreshButton } from "@/components/ui/refresh-button";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { InstallersList } from "@/components/installers/installers-list";
import { InviteInstallerForm } from "@/components/installers/invite-installer-form";
import {
  deleteInstallerAccount,
  deleteCutterAccount,
  deleteSchedulerAccount,
  deleteAssemblerAccount,
  deleteQcAccount,
  deleteOwnerAccount,
  deleteOrphanAuthAccount,
} from "@/app/actions/auth-actions";
import { ChangePasswordInline } from "@/components/ui/change-password-inline";
import { SchedulerAccessEditor } from "./scheduler-access-editor";
import { InviteSchedulerForm } from "./forms/invite-scheduler-form";
import { InviteCutterForm } from "./forms/invite-cutter-form";
import { InviteAssemblerForm } from "./forms/invite-assembler-form";
import { InviteQcForm } from "./forms/invite-qc-form";
import { InviteOwnerForm } from "./forms/invite-owner-form";

type Tab =
  | "installers"
  | "cutters"
  | "schedulers"
  | "assemblers"
  | "qcs"
  | "subcontractors"
  | "owners";

type OwnerProfile = {
  authUserId: string;
  displayName: string;
  email: string;
};

/**
 * The three station-scoped roles share one card shape, so they render through
 * one section component instead of three near-identical blocks. Cutters carry a
 * separate contact name; assemblers and QCs do not, hence the optional field.
 */
type StationPerson = {
  id: string;
  name: string;
  email: string;
  phone: string;
  contactName?: string;
  authUserId: string | null;
  stationId: string;
};

/**
 * One station's people for one role, with its own Add affordance.
 *
 * Rendered even when the station has nobody yet — a newly opened station with no
 * staff must still be visible and addable, which is the whole point of splitting
 * these into sections. The station is not a field on the form: it is fixed by
 * which section's Add button was pressed, matching the DB rule that a login
 * belongs to exactly one station from creation onward.
 */
function StationAccountsSection({
  station,
  roleLabel,
  rolePlural,
  people,
  icon,
  deletePending,
  onDelete,
  formOpen,
  onToggleForm,
  form,
}: {
  station: ManufacturingPartner;
  /** Singular, shown on each card: "Cutter", "Quality Control". */
  roleLabel: string;
  /** Plural, shown in the count and empty state: "cutters", "QC accounts". */
  rolePlural: string;
  people: StationPerson[];
  icon: ReactNode;
  deletePending: boolean;
  onDelete: (person: StationPerson) => void;
  formOpen: boolean;
  onToggleForm: () => void;
  form: ReactNode;
}) {
  const orphans = people.filter((p) => !p.authUserId);
  return (
    <div className="flex flex-col gap-3 pt-3">
      <div className="flex items-center justify-between gap-3 border-b border-border-subtle pb-2">
        <div>
          <p className="text-[13px] font-semibold text-foreground tracking-tight">{station.name}</p>
          <p className="text-[11px] text-tertiary">
            {people.length} {rolePlural}
          </p>
        </div>
        <Button
          size="sm"
          variant={formOpen ? "secondary" : undefined}
          onClick={onToggleForm}
        >
          {formOpen ? (
            "Close"
          ) : (
            <>
              <Plus size={14} weight="bold" />
              Add
            </>
          )}
        </Button>
      </div>

      {formOpen && <div>{form}</div>}

      {people.length === 0 && !formOpen && (
        <p className="rounded-[var(--radius-md)] border border-dashed border-border px-3 py-5 text-center text-[12px] text-tertiary">
          No {rolePlural} at {station.name} yet.
        </p>
      )}

      {orphans.length > 0 && (
        <InlineAlert variant="error">
          Orphaned {rolePlural} not linked to Supabase Auth: {orphans.length}. Use Delete
          to remove them.
        </InlineAlert>
      )}

      {people.map((person) => (
        <div key={person.id} className="animate-fade-up">
          <div className="surface-card p-4">
            <div className="flex items-center gap-3 mb-3 justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-[var(--radius-md)] bg-surface border border-border flex items-center justify-center">
                  {icon}
                </div>
                <div>
                  <h3 className="text-[14px] font-semibold text-foreground tracking-tight">
                    {person.name}
                  </h3>
                  <p className="text-[12px] text-tertiary">
                    {roleLabel}
                    {person.authUserId ? "" : " (orphan)"}
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant="danger"
                disabled={deletePending}
                onClick={() => onDelete(person)}
              >
                Delete
              </Button>
            </div>

            <div className="flex flex-col gap-1.5">
              {person.contactName && (
                <div className="flex items-center gap-2 text-[12px] text-secondary">
                  <UserCircle size={12} />
                  {person.contactName}
                </div>
              )}
              <div className="flex items-center gap-2 text-[12px] text-secondary">
                <Envelope size={12} />
                {person.email}
              </div>
              {person.phone && (
                <div className="flex items-center gap-2 text-[12px] text-secondary">
                  <Phone size={12} />
                  {person.phone}
                </div>
              )}
            </div>
            {person.authUserId && <ChangePasswordInline authUserId={person.authUserId} />}
          </div>
        </div>
      ))}
    </div>
  );
}

export function AccountsManager({
  data,
  authDrift,
  schedulerAccess,
  ownerProfiles,
  assemblers,
  qcs,
  subcontractors,
  manufacturingPartners,
  currentUserAuthId,
}: {
  data: AppDataset;
  authDrift: InstallerCutterAuthDrift[];
  schedulerAccess: Record<string, string[]>;
  ownerProfiles: OwnerProfile[];
  assemblers: Assembler[];
  qcs: Qc[];
  subcontractors: Subcontractor[];
  manufacturingPartners: ManufacturingPartner[];
  currentUserAuthId: string;
}) {
  const { installers, cutters, schedulers, units, clients, buildings } = data;
  const [tab, setTab] = useState<Tab>("installers");
  const [showForm, setShowForm] = useState(false);
  /** `${tab}:${stationId}` of the open per-station invite form, or null. */
  const [openStationForm, setOpenStationForm] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [deletePending, startDeleteTransition] = useTransition();
  const [expandedAccessId, setExpandedAccessId] = useState<string | null>(null);

  const tabLabel =
    tab === "installers"
      ? "Installers"
      : tab === "cutters"
        ? "Cutters"
        : tab === "assemblers"
          ? "Assemblers"
          : tab === "qcs"
            ? "Quality Control"
          : tab === "schedulers"
            ? "Schedulers"
            : tab === "subcontractors"
              ? "Subcontractors"
              : "Owners";

  const linkedSchedulers = schedulers.filter((s) => Boolean(s.authUserId));
  const orphanSchedulers = schedulers.filter((s) => !s.authUserId);
  const externalPartners = manufacturingPartners.filter((p) => !p.isInternal);
  // Own stations only, in display order — walls Station A's people off from
  // Station B's in the accounts list the same way the RLS layer walls off units.
  const stations = manufacturingPartners.filter((p) => p.isInternal);
  const isStationTab = tab === "cutters" || tab === "assemblers" || tab === "qcs";

  const cutterPeople: StationPerson[] = cutters.map((c) => ({
    id: c.id,
    name: c.name,
    email: c.contactEmail,
    phone: c.contactPhone,
    contactName: c.contactName,
    authUserId: c.authUserId,
    stationId: c.stationId,
  }));
  const assemblerPeople: StationPerson[] = assemblers.map((a: Assembler) => ({
    id: a.id,
    name: a.name,
    email: a.email,
    phone: a.phone,
    authUserId: a.authUserId,
    stationId: a.stationId,
  }));
  const qcPeople: StationPerson[] = qcs.map((q) => ({
    id: q.id,
    name: q.name,
    email: q.email,
    phone: q.phone,
    authUserId: q.authUserId,
    stationId: q.stationId,
  }));

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

  const handleDeleteCutter = (cutter: StationPerson) => {
    if (!confirm(`Delete cutter "${cutter.name}"? This will remove their account from the app (and Supabase auth if linked).`)) {
      return;
    }
    setDeleteError("");
    startDeleteTransition(async () => {
      const result = await deleteCutterAccount(cutter.id, cutter.authUserId, cutter.email);
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

  const handleDeleteAssembler = (asm: StationPerson) => {
    if (!confirm(`Delete assembler "${asm.name}"? This will remove their account from the app (and Supabase auth if linked).`)) {
      return;
    }
    setDeleteError("");
    startDeleteTransition(async () => {
      const result = await deleteAssemblerAccount(asm.id, asm.authUserId, asm.email);
      if (!result.ok) {
        setDeleteError(result.error);
        return;
      }
      window.location.reload();
    });
  };

  const handleDeleteQc = (qc: StationPerson) => {
    if (!confirm(`Delete QC user "${qc.name}"? This will remove their account from the app (and Supabase auth if linked).`)) {
      return;
    }
    setDeleteError("");
    startDeleteTransition(async () => {
      const result = await deleteQcAccount(qc.id, qc.authUserId, qc.email);
      if (!result.ok) {
        setDeleteError(result.error);
        return;
      }
      window.location.reload();
    });
  };

  const handleDeleteSubcontractor = (sub: Subcontractor) => {
    if (!confirm(`Delete subcontractor login "${sub.name}"? This removes their account from the app (and Supabase auth if linked).`)) {
      return;
    }
    setDeleteError("");
    startDeleteTransition(async () => {
      const result = await deleteSubcontractorAccount(sub.id, sub.authUserId, sub.email);
      if (!result.ok) {
        setDeleteError(result.error);
        return;
      }
      window.location.reload();
    });
  };

  const handleDeletePartner = (partner: ManufacturingPartner) => {
    const assigned = subcontractors.filter((s) => s.partnerId === partner.id).length;
    if (
      !confirm(
        `Delete manufacturer "${partner.name}"?\n\n` +
          `${assigned} login${assigned === 1 ? "" : "s"} will be removed, and any units assigned ` +
          `to them return to the in-house factory queues.`
      )
    ) {
      return;
    }
    setDeleteError("");
    startDeleteTransition(async () => {
      const result = await deleteManufacturingPartner(partner.id);
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

  const handleRemoveDrift = (entry: InstallerCutterAuthDrift) => {
    if (
      !confirm(
        `Remove Supabase login for ${entry.email}? They will not be able to sign in until added again.`
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
      <PageHeader title="Accounts" actions={<RefreshButton />} />

      {authDrift.length > 0 && (
        <div className="px-4 pt-4 flex flex-col gap-3">
          <InlineAlert variant="warning">
            These logins exist in Supabase Authentication (installer or cutter) but are not
            linked from this Accounts list. Remove them to clear stale users, then add again if
            needed.
          </InlineAlert>
          {authDrift.map((entry, i) => (
            <div
                key={entry.authUserId}
                className="animate-fade-up"
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
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="px-4 pt-4 pb-3 flex gap-2 overflow-x-auto no-scrollbar">
        {(["schedulers", "installers", "cutters", "assemblers", "qcs", "subcontractors", "owners"] as Tab[]).map((t) => (
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
              : t === "cutters" ? "Cutters"
              : t === "assemblers" ? "Assemblers"
              : t === "qcs" ? "Quality Control"
              : t === "schedulers" ? "Schedulers"
              : t === "subcontractors" ? "Subcontractors"
              : "Owners"}
          </button>
        ))}
      </div>

      {/* Invite form */}
      {/* List */}
      <div className="px-4 flex flex-col gap-3 pb-8">
        {deleteError && <InlineAlert variant="error">{deleteError}</InlineAlert>}
        {/* Station-scoped roles get one Add per station section instead — the
            station a login belongs to is decided by which section you add from. */}
        {!isStationTab && (
          <div className="pt-1">
            <Button size="sm" onClick={() => setShowForm(!showForm)}>
              <Plus size={14} weight="bold" />
              {showForm ? `Close ${tabLabel}` : `Add ${tabLabel}`}
            </Button>
          </div>
        )}

        {showForm && !isStationTab && (
          <div>
            {tab === "installers" ? (
              <InviteInstallerForm
                onDone={() => { setShowForm(false); window.location.reload(); }}
              />
            ) : tab === "schedulers" ? (
              <InviteSchedulerForm
                onDone={() => { setShowForm(false); window.location.reload(); }}
              />
            ) : tab === "subcontractors" ? (
              <InviteSubcontractorForm
                partners={manufacturingPartners}
                onDone={() => { setShowForm(false); window.location.reload(); }}
              />
            ) : (
              <InviteOwnerForm
                onDone={() => { setShowForm(false); window.location.reload(); }}
              />
            )}
          </div>
        )}

        {tab === "installers" && (
          <>
            <InstallersList
              installers={installers}
              units={units}
              showDelete
              showChangePassword
              deletePending={deletePending}
              onDelete={handleDeleteInstaller}
              emptyMessage="No installers yet. Tap Add to add one."
            />
          </>
        )}

        {tab === "cutters" && stations.map((station) => (
          <StationAccountsSection
            key={station.id}
            station={station}
            roleLabel="Cutter"
            rolePlural="cutters"
            people={cutterPeople.filter((p) => p.stationId === station.id)}
            icon={<Factory size={22} className="text-tertiary" />}
            deletePending={deletePending}
            onDelete={handleDeleteCutter}
            formOpen={openStationForm === `cutters:${station.id}`}
            onToggleForm={() =>
              setOpenStationForm((cur) =>
                cur === `cutters:${station.id}` ? null : `cutters:${station.id}`
              )
            }
            form={
              <InviteCutterForm
                stationId={station.id}
                onDone={() => {
                  setOpenStationForm(null);
                  window.location.reload();
                }}
              />
            }
          />
        ))}

        {tab === "schedulers" && (
          <>
            {linkedSchedulers.map((sch, i) => (
              <div
                key={sch.id}
                className="animate-fade-up"
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
                  {sch.authUserId && <ChangePasswordInline authUserId={sch.authUserId} />}
                </div>
              </div>
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
                  <div
                key={sch.id}
                className="animate-fade-up"
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
                  </div>
                ))}
              </>
            )}

            {schedulers.length === 0 && (
              <div className="text-center py-12 text-[13px] text-tertiary">
                No schedulers yet. Tap Add to add one.
              </div>
            )}
          </>
        )}

        {tab === "assemblers" && stations.map((station) => (
          <StationAccountsSection
            key={station.id}
            station={station}
            roleLabel="Assembler"
            rolePlural="assemblers"
            people={assemblerPeople.filter((p) => p.stationId === station.id)}
            icon={<CheckCircle size={22} className="text-tertiary" />}
            deletePending={deletePending}
            onDelete={handleDeleteAssembler}
            formOpen={openStationForm === `assemblers:${station.id}`}
            onToggleForm={() =>
              setOpenStationForm((cur) =>
                cur === `assemblers:${station.id}` ? null : `assemblers:${station.id}`
              )
            }
            form={
              <InviteAssemblerForm
                stationId={station.id}
                onDone={() => {
                  setOpenStationForm(null);
                  window.location.reload();
                }}
              />
            }
          />
        ))}

        {tab === "qcs" && stations.map((station) => (
          <StationAccountsSection
            key={station.id}
            station={station}
            roleLabel="Quality Control"
            rolePlural="QC accounts"
            people={qcPeople.filter((p) => p.stationId === station.id)}
            icon={<ShieldCheck size={22} className="text-tertiary" />}
            deletePending={deletePending}
            onDelete={handleDeleteQc}
            formOpen={openStationForm === `qcs:${station.id}`}
            onToggleForm={() =>
              setOpenStationForm((cur) =>
                cur === `qcs:${station.id}` ? null : `qcs:${station.id}`
              )
            }
            form={
              <InviteQcForm
                stationId={station.id}
                onDone={() => {
                  setOpenStationForm(null);
                  window.location.reload();
                }}
              />
            }
          />
        ))}

        {tab === "subcontractors" && (
          <>
            {externalPartners.length === 0 && (
              <p className="py-6 text-center text-[13px] text-muted">
                No subcontractors yet. Add one to start sending units out for manufacturing.
              </p>
            )}
            {externalPartners.map((partner) => {
              const logins = subcontractors.filter((s) => s.partnerId === partner.id);
              return (
                <div key={partner.id} className="animate-fade-up">
                  <div className="surface-card p-4">
                    <div className="flex items-center gap-3 mb-3 justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-[var(--radius-md)] bg-surface border border-border flex items-center justify-center">
                          <Factory size={22} className="text-tertiary" />
                        </div>
                        <div>
                          <h3 className="text-[14px] font-semibold text-foreground tracking-tight">
                            {partner.name}
                          </h3>
                          <p className="text-[12px] text-tertiary">
                            {logins.length} login{logins.length === 1 ? "" : "s"}
                          </p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={deletePending}
                        onClick={() => handleDeletePartner(partner)}
                      >
                        Delete
                      </Button>
                    </div>

                    {logins.length === 0 ? (
                      <p className="text-[12px] text-tertiary">
                        No logins yet — add one so they can see their work list.
                      </p>
                    ) : (
                      <div className="flex flex-col gap-3">
                        {logins.map((sub) => (
                          <div
                            key={sub.id}
                            className="border-t border-border-subtle pt-3 flex flex-col gap-1.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-[13px] font-medium text-foreground">{sub.name}</p>
                              <Button
                                size="sm"
                                variant="danger"
                                disabled={deletePending}
                                onClick={() => handleDeleteSubcontractor(sub)}
                              >
                                Delete
                              </Button>
                            </div>
                            <div className="flex items-center gap-2 text-[12px] text-secondary">
                              <Envelope size={12} />
                              {sub.email}
                            </div>
                            {sub.phone && (
                              <div className="flex items-center gap-2 text-[12px] text-secondary">
                                <Phone size={12} />
                                {sub.phone}
                              </div>
                            )}
                            {sub.authUserId && <ChangePasswordInline authUserId={sub.authUserId} />}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}

        {tab === "owners" && (
          <>
            {ownerProfiles.map((owner, i) => (
              <div
                key={owner.authUserId}
                className="animate-fade-up"
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
                  <ChangePasswordInline authUserId={owner.authUserId} />
                </div>
              </div>
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
