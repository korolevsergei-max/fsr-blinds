export type PushbackDirection =
  | "assembler_to_cutter"
  | "qc_to_assembler"
  | "qc_to_cutter";

export const PUSHBACK_REASON_PRESETS: Record<PushbackDirection, readonly string[]> = {
  assembler_to_cutter: [
    "Wrong fabric width",
    "Wrong fabric height / drop",
    "Wrong valance length",
    "Wrong tube length",
    "Fabric cut crooked / not square",
    "Wrong fabric or color",
    "Damaged / flawed fabric",
    "Wrong blind type or hardware",
  ],
  qc_to_assembler: [
    "Hem not straight",
    "Chain on wrong side",
    "Chain tension / operation faulty",
    "Valance misaligned",
    "Bottom bar crooked",
    "Bracket / mounting hardware wrong",
    "Loose or incomplete assembly",
    "Wrong fabric or color installed",
  ],
  qc_to_cutter: [
    "Fabric width wrong",
    "Drop / height wrong",
    "Valance length wrong",
    "Tube length wrong",
    "Damaged fabric",
    "Wrong fabric or color",
  ],
} as const;

export const PUSHBACK_OTHER_OPTION = "Other";

export function getPushbackDirection(
  sourceRole: "assembler" | "qc",
  targetRole: "cutter" | "assembler"
): PushbackDirection {
  if (sourceRole === "assembler" && targetRole === "cutter") return "assembler_to_cutter";
  if (sourceRole === "qc" && targetRole === "assembler") return "qc_to_assembler";
  return "qc_to_cutter";
}

export function getPushbackDirectionLabel(direction: PushbackDirection): string {
  if (direction === "assembler_to_cutter") return "Return to cutter";
  if (direction === "qc_to_assembler") return "Return to assembler";
  return "Return to cutter";
}
