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
  UploadSimple,
} from "@phosphor-icons/react";
import { getUnitsByBuilding } from "@/lib/app-dataset";
import type { AppDataset } from "@/lib/app-dataset";
import { StatusChip } from "@/components/ui/status-chip";
import { SectionLabel } from "@/components/ui/section-label";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { createUnit } from "@/app/actions/management-actions";

export function BuildingDetail({ data }: { data: AppDataset }) {
  const { id: buildingId } = useParams<{ id: string }>();
  const building = data.buildings.find((b) => b.id === buildingId);
  const client = building
    ? data.clients.find((c) => c.id === building.clientId)
    : null;

  const [showForm, setShowForm] = useState(false);
  const [unitNumber, setUnitNumber] = useState("");
  const [earliestBracketing, setEarliestBracketing] = useState("");
  const [earliestInstallation, setEarliestInstallation] = useState("");
  const [formError, setFormError] = useState("");
  const [pending, startTransition] = useTransition();

  if (!building || !client) {
    return <div className="p-6 text-center text-muted">Building not found</div>;
  }

  const buildingUnits = getUnitsByBuilding(data, building.id);

  const handleCreateUnit = () => {
    if (!unitNumber.trim()) {
      setFormError("Unit number is required");
      return;
    }
    setFormError("");
    startTransition(async () => {
      const result = await createUnit(
        building.id,
        client.id,
        unitNumber,
        earliestBracketing,
        earliestInstallation
      );
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      setUnitNumber("");
      setEarliestBracketing("");
      setEarliestInstallation("");
      setShowForm(false);
      window.location.reload();
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
            <Link href={`/management/buildings/${building.id}/import`}>
              <Button size="sm" variant="secondary">
                <UploadSimple size={14} weight="bold" />
                Import
              </Button>
            </Link>
            <Button size="sm" onClick={() => setShowForm(!showForm)}>
              <Plus size={14} weight="bold" />
              Unit
            </Button>
          </div>
        }
      />

      {showForm && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="px-4 pt-4"
        >
          <div className="bg-white rounded-2xl border border-border p-4 flex flex-col gap-3">
            <SectionLabel as="h3" noMargin>Add unit</SectionLabel>
            {formError && <p className="text-xs text-red-600">{formError}</p>}
            <Input
              label="Unit Number"
              value={unitNumber}
              onChange={(e) => setUnitNumber(e.target.value)}
              placeholder="Unit 1207"
              autoFocus
            />
            <DateInput
              label="Earliest Bracketing Date"
              value={earliestBracketing}
              onChange={setEarliestBracketing}
              helper="When can bracketing start?"
            />
            <DateInput
              label="Earliest Installation Date"
              value={earliestInstallation}
              onChange={setEarliestInstallation}
              helper="When can installation start?"
            />
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
              <Button size="sm" disabled={pending || !unitNumber.trim()} onClick={handleCreateUnit}>
                {pending ? "Creating…" : "Add Unit"}
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
                    <ArrowRight size={14} className="text-zinc-400" />
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
