"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Camera,
  CheckCircle,
  Warning,
  WarningCircle,
  UploadSimple,
} from "@phosphor-icons/react";
import { units, rooms } from "@/lib/mock-data";
import type { BlindType, RiskFlag } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function WindowForm() {
  const { id, roomId } = useParams<{ id: string; roomId: string }>();
  const router = useRouter();
  const unit = units.find((u) => u.id === id);
  const room = rooms.find((r) => r.id === roomId);

  const [label, setLabel] = useState("");
  const [blindType, setBlindType] = useState<BlindType>("screen");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [depth, setDepth] = useState("");
  const [notes, setNotes] = useState("");
  const [riskFlag, setRiskFlag] = useState<RiskFlag>("green");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (!label.trim()) e.label = "Window label is required";
    if (!width || parseFloat(width) <= 0) e.width = "Valid width required";
    if (!height || parseFloat(height) <= 0) e.height = "Valid height required";
    if (!photoPreview) e.photo = "Pre-measurement photo is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handlePhotoCapture = () => {
    setPhotoPreview("https://picsum.photos/seed/newwindow/400/300");
    setErrors((e) => {
      const next = { ...e };
      delete next.photo;
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    router.push(`/installer/units/${id}/rooms/${roomId}`);
  };

  if (!unit || !room) {
    return <div className="p-6 text-center text-muted">Not found</div>;
  }

  const riskOptions: { value: RiskFlag; label: string; color: string; Icon: typeof Warning }[] = [
    { value: "green", label: "No Issue", color: "border-emerald-300 bg-emerald-50 text-emerald-700", Icon: CheckCircle },
    { value: "yellow", label: "Needs Escalation", color: "border-amber-300 bg-amber-50 text-amber-700", Icon: Warning },
    { value: "red", label: "Timeline at Risk", color: "border-red-300 bg-red-50 text-red-700", Icon: WarningCircle },
  ];

  return (
    <div className="flex flex-col min-h-[100dvh] bg-background">
      <PageHeader
        title="Add Window"
        subtitle={`${room.name} \u2022 ${unit.unitNumber}`}
        backHref={`/installer/units/${id}/rooms/${roomId}`}
      />

      <form onSubmit={handleSubmit} className="flex-1 px-4 py-5 flex flex-col gap-6">
        {/* Label + Blind Type */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col gap-5"
        >
          <Input
            label="Window Label"
            placeholder="e.g. Window A, Balcony Door"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            error={errors.label}
            autoFocus
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-zinc-700 tracking-tight">
              Blind Type
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(["screen", "blackout"] as BlindType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setBlindType(t)}
                  className={`h-11 rounded-xl border text-sm font-medium tracking-tight transition-all active:scale-[0.97] ${
                    blindType === t
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-border bg-white text-zinc-600 hover:bg-zinc-50"
                  }`}
                >
                  {t === "screen" ? "Screen" : "Blackout"}
                </button>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Measurements */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <h2 className="text-xs font-medium text-muted uppercase tracking-widest mb-3">
            Measurements (inches)
          </h2>
          <div className="grid grid-cols-3 gap-3">
            <Input
              label="Width"
              type="number"
              step="0.25"
              placeholder="48.5"
              value={width}
              onChange={(e) => setWidth(e.target.value)}
              error={errors.width}
            />
            <Input
              label="Height"
              type="number"
              step="0.25"
              placeholder="72"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              error={errors.height}
            />
            <Input
              label="Depth"
              type="number"
              step="0.25"
              placeholder="3.5"
              value={depth}
              onChange={(e) => setDepth(e.target.value)}
              helper="Optional"
            />
          </div>
        </motion.div>

        {/* Photo Upload */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <h2 className="text-xs font-medium text-muted uppercase tracking-widest mb-3">
            Pre-measurement Photo
            <span className="text-red-500 ml-1">*</span>
          </h2>
          {photoPreview ? (
            <div className="relative rounded-2xl overflow-hidden border border-border">
              <img
                src={photoPreview}
                alt="Window measurement"
                className="w-full h-48 object-cover"
              />
              <div className="absolute top-3 right-3">
                <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500 text-white text-xs font-medium">
                  <CheckCircle size={14} weight="fill" />
                  Captured
                </span>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={handlePhotoCapture}
              className={`w-full h-40 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-colors active:scale-[0.99] ${
                errors.photo
                  ? "border-red-300 bg-red-50"
                  : "border-zinc-300 bg-white hover:border-zinc-400 hover:bg-zinc-50"
              }`}
            >
              <Camera
                size={28}
                className={errors.photo ? "text-red-400" : "text-zinc-400"}
              />
              <span
                className={`text-sm font-medium ${
                  errors.photo ? "text-red-500" : "text-zinc-500"
                }`}
              >
                Tap to capture photo
              </span>
              {errors.photo && (
                <span className="text-xs text-red-500">{errors.photo}</span>
              )}
            </button>
          )}
        </motion.div>

        {/* Notes */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.24, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <label className="text-sm font-medium text-zinc-700 tracking-tight mb-1.5 block">
            Notes
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any special conditions, frame damage, clearance issues..."
            rows={3}
            className="w-full px-3.5 py-3 rounded-xl border border-border text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all resize-none"
          />
        </motion.div>

        {/* Risk Flag */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.32, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <h2 className="text-xs font-medium text-muted uppercase tracking-widest mb-3">
            Issue Flag
          </h2>
          <div className="flex flex-col gap-2">
            {riskOptions.map(({ value, label: rLabel, color, Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setRiskFlag(value)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium transition-all active:scale-[0.98] ${
                  riskFlag === value ? color : "border-border bg-white text-zinc-600"
                }`}
              >
                <Icon size={18} weight={riskFlag === value ? "fill" : "regular"} />
                {rLabel}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Submit */}
        <div className="pt-2 pb-24">
          <Button type="submit" fullWidth size="lg">
            <UploadSimple size={18} weight="bold" />
            Save Window
          </Button>
        </div>
      </form>
    </div>
  );
}
