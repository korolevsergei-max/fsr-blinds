export type MediaUploadRow = {
  id: string;
  public_url: string;
  label: string | null;
  unit_id: string;
  room_id: string | null;
  window_id: string | null;
  upload_kind: string;
  stage: string | null;
  phase: string | null;
  created_at: string;
  uploaded_by_user_id: string | null;
  uploaded_by_name: string | null;
  uploaded_by_role: string | null;
};

export type ManufacturingEscalationRow = {
  id: string;
  window_id: string;
  unit_id: string;
  source_role: "cutter" | "assembler" | "qc";
  target_role: "cutter" | "assembler" | "qc";
  escalation_type: "pushback" | "blocker";
  status: "open" | "resolved";
  reason: string | null;
  notes: string | null;
  opened_by_user_id: string | null;
  opened_at: string;
  resolved_by_user_id: string | null;
  resolved_at: string | null;
  created_at: string;
};

export type PostInstallIssueRow = {
  id: string;
  window_id: string;
  unit_id: string;
  opened_by_user_id: string;
  opened_by_role: "owner" | "scheduler";
  opened_at: string;
  resolved_by_user_id: string | null;
  resolved_at: string | null;
  status: "open" | "resolved";
  created_at: string;
};

export type PostInstallIssueNoteRow = {
  id: string;
  issue_id: string;
  author_user_id: string;
  author_role: string;
  body: string;
  created_at: string;
};
