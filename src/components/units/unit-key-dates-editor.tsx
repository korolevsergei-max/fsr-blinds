"use client";

import { useState, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";

import { CheckCircle } from "@phosphor-icons/react";
import { updateUnitAssignment } from "@/app/actions/fsr-data";
import { updateUnitCompleteByDate } from "@/app/actions/management-actions";
import type { AppDataset } from "@/lib/app-dataset";
import { useDatasetSelectorMaybe } from "@/lib/dataset-context";
import { useDatasetMutation } from "@/lib/use-dataset-mutation";
import { PageHeader } from "@/components/ui/page-header";
import { DateInput } from "@/components/ui/date-input";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/status-chip";

type UnitKeyDatesEditorProps = {
  data: Pick<AppDataset, "units">;
  /** Base route segment: `/scheduler/units` or `/management/units` */
  unitsBasePath: "/scheduler/units" | "/management/units";
  /** Only the owner can set the Complete By date — hide entirely for schedulers */
  showCompleteBy?: boolean;
};

export function UnitKeyDatesEditor({ data, unitsBasePath, showCompleteBy = false }: UnitKeyDatesEditorProps) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { afterMutate } = useDatasetMutation();
  const isHydratingInitialData = useDatasetSelectorMaybe((value) => value.isHydratingInitialData);
  const unit = data.units.find((u) => u.id === id);

  const [measurementDate, setMeasurementDate] = useState(unit?.measurementDate ?? "");
  const [bracketingDate, setBracketingDate] = useState(unit?.bracketingDate ?? "");
  const [installationDate, setInstallationDate] = useState(unit?.installationDate ?? "");
  const [completeByDate, setCompleteByDate] = useState(unit?.completeByDate ?? "");
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [pending, startTransition] = useTransition();

  if (!unit && isHydratingInitialData) {
    return <div className="p-6 text-center text-muted">Loading unit…</div>;
  }

  if (!unit) {
    return <div className="p-6 text-center text-muted">Unit not found</div>;
  }

  const detailHref = `${unitsBasePath}/${unit.id}`;

  const handleSave = () => {
    setSaveError("");
    startTransition(async () => {
      const datesResult = await updateUnitAssignment(
        unit.id,
        unit.assignedInstallerId || undefined,
        measurementDate,
        bracketingDate,
        installationDate
      );
      if (!datesResult.ok) {
        setSaveError(datesResult.error);
        return;
      }
      if (showCompleteBy) {
        const completeByResult = await updateUnitCompleteByDate(unit.id, completeByDate || null);
        if (!completeByResult.ok) {
          setSaveError(completeByResult.error);
          return;
        }
      }
      setSaved(true);
      afterMutate((prev) => ({
        ...prev,
        units: prev.units.map((u) =>
          u.id === unit.id
            ? {
                ...u,
                measurementDate: measurementDate || null,
                bracketingDate: bracketingDate || null,
                installationDate: installationDate || null,
                completeByDate: completeByDate || null,
              }
            : u
        ),
      }));
      setTimeout(() => router.push(detailHref), 900);
    });
  };

  return (
    <div className="flex flex-col min-h-[100dvh]">
      <PageHeader
        title="Key dates"
        subtitle={`Unit ${unit.unitNumber} • ${unit.buildingName}`}
        backHref={detailHref}
      />

      <div className="flex-1 px-4 py-5 flex flex-col gap-6">
        {saveError && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
            {saveError}
          </p>
        )}

        <div
          className="animate-fade-up"
        >
          <StatusChip status={unit.status} />
        </div>

        <div
          className="animate-fade-up flex flex-col gap-4"
          style={{ "--anim-delay": "0.08s" } as React.CSSProperties}
        >
          <DateInput
            label="Measurement date"
            value={measurementDate}
            onChange={setMeasurementDate}
            helper="Scheduled date for taking window measurements"
          />
          <DateInput
            label="Bracketing date"
            value={bracketingDate}
            onChange={setBracketingDate}
            helper="Scheduled date for the bracketing visit"
          />
          <DateInput
            label="Installation date"
            value={installationDate}
            onChange={setInstallationDate}
            helper="Scheduled date for installation (also serves as the target completion date)"
          />
          {showCompleteBy && (
            <DateInput
              label="Complete by"
              value={completeByDate}
              onChange={setCompleteByDate}
              helper="Static client deadline for prioritization — does not affect unit status"
            />
          )}
        </div>

        <div
          className="animate-fade-up pt-2 pb-24"
          style={{ "--anim-delay": "0.16s" } as React.CSSProperties}
        >
          {saved ? (
            <div
              className="animate-fade-scale flex items-center justify-center gap-2 h-13 rounded-xl bg-emerald-500 text-white font-medium"
            >
              <CheckCircle size={20} weight="fill" />
              Dates saved
            </div>
          ) : (
            <Button fullWidth size="lg" disabled={pending} onClick={handleSave}>
              {pending ? "Saving…" : "Save dates"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
