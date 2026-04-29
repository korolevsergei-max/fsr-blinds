"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useState, useTransition } from "react";
import { motion } from "framer-motion";
import {
  Plus,
  ArrowRight,
  UserCircle,
  CalendarBlank,
  Trash,
  PencilSimple,
} from "@phosphor-icons/react";
import { getUnitsByBuilding } from "@/lib/app-dataset";
import type { AppDataset } from "@/lib/app-dataset";
import { StatusChip } from "@/components/ui/status-chip";
import { SectionLabel } from "@/components/ui/section-label";
import { PageHeader } from "@/components/ui/page-header";
import { RefreshButton } from "@/components/ui/refresh-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteBuilding, updateBuilding } from "@/app/actions/management-actions";
import { UserRole } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { useDatasetMutation } from "@/lib/use-dataset-mutation";

export function BuildingDetail({
  data,
  userRole,
  isHydratingInitialData = false,
}: {
  data: AppDataset;
  userRole?: UserRole;
  isHydratingInitialData?: boolean;
}) {
  const router = useRouter();
  const { afterMutate } = useDatasetMutation();
  const { id: buildingId } = useParams<{ id: string }>();
  const building = data.buildings.find((b) => b.id === buildingId);
  const client = building
    ? data.clients.find((c) => c.id === building.clientId)
    : null;

  const [showEditForm, setShowEditForm] = useState(false);
  const [editName, setEditName] = useState(building?.name ?? "");
  const [editAddress, setEditAddress] = useState(building?.address ?? "");
  const [formError, setFormError] = useState("");
  const [pending, startTransition] = useTransition();

  if ((!building || !client) && isHydratingInitialData) {
    return <div className="p-6 text-center text-muted">Loading building…</div>;
  }

  if (!building || !client) {
    return <div className="p-6 text-center text-muted">Building not found</div>;
  }

  const buildingUnits = getUnitsByBuilding(data, building.id);

  const handleEditBuilding = () => {
    if (!editName.trim()) return;
    startTransition(async () => {
      const result = await updateBuilding(building.id, editName, editAddress);
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      setShowEditForm(false);
      afterMutate((prev) => ({
        ...prev,
        buildings: prev.buildings.map((item) =>
          item.id === building.id
            ? { ...item, name: editName.trim(), address: editAddress.trim() }
            : item
        ),
        units: prev.units.map((item) =>
          item.buildingId === building.id
            ? { ...item, buildingName: editName.trim() }
            : item
        ),
      }));
    });
  };

  const handleDeleteBuilding = () => {
    if (
      !window.confirm(
        "Are you sure you want to delete this building and all its units? This cannot be undone."
      )
    )
      return;
    startTransition(async () => {
      const result = await deleteBuilding(building.id);
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      router.push(`/management/clients/${client.id}`);
    });
  };

  return (
    <div className="flex flex-col">
      <PageHeader
        title={building.name}
        subtitle={`${client.name} \u2022 ${building.address}`}
        backHref={`/management/clients/${client.id}`}
        actions={
          <div className="flex items-center gap-2">
            <RefreshButton />
            <Link href={`/management/buildings/${building.id}/import`}>
              <Button size="sm">
                <Plus size={14} weight="bold" />
                Units
              </Button>
            </Link>
            {userRole === "owner" && (
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setEditName(building.name);
                    setEditAddress(building.address ?? "");
                    setShowEditForm(true);
                  }}
                >
                  <PencilSimple size={14} weight="bold" />
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={handleDeleteBuilding}
                  disabled={pending}
                >
                  <Trash size={14} weight="bold" />
                  Delete
                </Button>
              </>
            )}
          </div>
        }
      />

      {showEditForm && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="px-4 pt-4"
        >
          <div className="bg-white rounded-2xl border border-border p-4 flex flex-col gap-3">
            <SectionLabel as="h3" noMargin>Edit building</SectionLabel>
            {formError && <p className="text-xs text-red-600">{formError}</p>}
            <Input
              label="Building Name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              autoFocus
            />
            <Input
              label="Address"
              value={editAddress}
              onChange={(e) => setEditAddress(e.target.value)}
            />
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setShowEditForm(false)}>
                Cancel
              </Button>
              <Button size="sm" disabled={pending || !editName.trim()} onClick={handleEditBuilding}>
                {pending ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </motion.div>
      )}

      <div className="px-4 py-4 flex flex-col gap-2">
        <p className="text-xs text-muted mb-1">
          {buildingUnits.length} unit{buildingUnits.length !== 1 ? "s" : ""}
        </p>

        {buildingUnits.map((unit, i) => (
          <motion.div
            key={unit.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              delay: i * 0.04,
              duration: 0.3,
              ease: [0.16, 1, 0.3, 1],
            }}
          >
            <Link href={`/management/units/${unit.id}`}>
              <div className="bg-white rounded-xl border border-border px-4 py-3.5 hover:border-zinc-300 transition-all active:scale-[0.99]">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-semibold text-zinc-900 tracking-tight">
                      {unit.unitNumber}
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted">
                      {unit.bracketingDate && (
                        <span className="flex items-center gap-1">
                          <CalendarBlank size={10} />
                          {unit.bracketingDate}
                        </span>
                      )}
                      {unit.assignedInstallerName && (
                        <span className="flex items-center gap-1">
                          <UserCircle size={10} />
                          {unit.assignedInstallerName}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shadow-sm">
                      <ArrowRight size={14} weight="bold" className="text-white" />
                    </div>
                  </div>
                </div>
                <StatusChip status={unit.status} />
              </div>
            </Link>
          </motion.div>
        ))}


      </div>
    </div>
  );
}
