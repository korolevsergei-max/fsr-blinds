"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";

type ActionResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

async function requirePostInstallIssueUser() {
  const user = await getCurrentUser();
  if (!user) return { ok: false as const, error: "Not authenticated" };
  if (user.role !== "owner" && user.role !== "scheduler") {
    return {
      ok: false as const,
      error: "Only owners and schedulers can manage post-install issues.",
    };
  }
  return { ok: true as const, user };
}

async function logUnitActivity(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: {
    unitId: string;
    actorRole: string;
    actorName: string;
    action: string;
    details: Record<string, unknown>;
  }
) {
  await supabase.from("unit_activity_log").insert({
    id: `log-${crypto.randomUUID()}`,
    unit_id: input.unitId,
    actor_role: input.actorRole,
    actor_name: input.actorName,
    action: input.action,
    details: input.details,
    created_at: new Date().toISOString(),
  });
}

function revalidatePostInstallIssuePaths(unitId: string) {
  revalidatePath("/management", "layout");
  revalidatePath("/scheduler", "layout");
  revalidatePath("/installer", "layout");
  revalidatePath("/management/reports", "page");
  revalidatePath(`/management/units/${unitId}`, "page");
  revalidatePath(`/scheduler/units/${unitId}`, "page");
  revalidatePath(`/installer/units/${unitId}`, "page");
}

async function loadIssueContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  issueId: string
) {
  const { data, error } = await supabase
    .from("window_post_install_issues")
    .select("id, unit_id, window_id, status")
    .eq("id", issueId)
    .maybeSingle();

  if (error) return { ok: false as const, error: error.message };
  if (!data) return { ok: false as const, error: "Post-install issue not found." };

  return {
    ok: true as const,
    issue: data as {
      id: string;
      unit_id: string;
      window_id: string;
      status: "open" | "resolved";
    },
  };
}

export async function openPostInstallIssue(input: {
  windowId: string;
  unitId: string;
  body: string;
}): Promise<ActionResult<{ issueId: string }>> {
  const auth = await requirePostInstallIssueUser();
  if (!auth.ok) return auth;

  const body = input.body.trim();
  if (!body) return { ok: false, error: "Note is required." };

  const supabase = await createClient();
  const { data: windowRow, error: windowError } = await supabase
    .from("windows")
    .select("id, label, installed, rooms!inner(unit_id, name)")
    .eq("id", input.windowId)
    .maybeSingle();

  if (windowError) return { ok: false, error: windowError.message };
  const room = windowRow?.rooms as unknown as { unit_id?: string; name?: string } | null;
  if (!windowRow || room?.unit_id !== input.unitId) {
    return { ok: false, error: "Window not found for this unit." };
  }
  if (!windowRow.installed) {
    return { ok: false, error: "Only installed windows can be flagged." };
  }

  const issueId = crypto.randomUUID();
  const { error: issueError } = await supabase.from("window_post_install_issues").insert({
    id: issueId,
    window_id: input.windowId,
    unit_id: input.unitId,
    opened_by_user_id: auth.user.id,
    opened_by_role: auth.user.role,
    status: "open",
  });
  if (issueError) return { ok: false, error: issueError.message };

  const { error: noteError } = await supabase.from("window_post_install_issue_notes").insert({
    id: crypto.randomUUID(),
    issue_id: issueId,
    author_user_id: auth.user.id,
    author_role: auth.user.role,
    body,
  });
  if (noteError) return { ok: false, error: noteError.message };

  await logUnitActivity(supabase, {
    unitId: input.unitId,
    actorRole: auth.user.role,
    actorName: auth.user.displayName,
    action: "post_install_issue_opened",
    details: {
      issueId,
      windowId: input.windowId,
      windowLabel: windowRow.label,
      roomName: room?.name ?? null,
      note: body,
    },
  });

  revalidatePostInstallIssuePaths(input.unitId);
  return { ok: true, issueId };
}

export async function addPostInstallIssueNote(input: {
  issueId: string;
  body: string;
}): Promise<ActionResult> {
  const auth = await requirePostInstallIssueUser();
  if (!auth.ok) return auth;

  const body = input.body.trim();
  if (!body) return { ok: false, error: "Note is required." };

  const supabase = await createClient();
  const context = await loadIssueContext(supabase, input.issueId);
  if (!context.ok) return context;
  if (context.issue.status !== "open") {
    return { ok: false, error: "Resolved issues cannot receive new notes." };
  }

  const { error } = await supabase.from("window_post_install_issue_notes").insert({
    id: crypto.randomUUID(),
    issue_id: input.issueId,
    author_user_id: auth.user.id,
    author_role: auth.user.role,
    body,
  });
  if (error) return { ok: false, error: error.message };

  await logUnitActivity(supabase, {
    unitId: context.issue.unit_id,
    actorRole: auth.user.role,
    actorName: auth.user.displayName,
    action: "post_install_issue_note_added",
    details: {
      issueId: input.issueId,
      windowId: context.issue.window_id,
      note: body,
    },
  });

  revalidatePostInstallIssuePaths(context.issue.unit_id);
  return { ok: true };
}

export async function resolvePostInstallIssue(input: {
  issueId: string;
  closingNote?: string;
}): Promise<ActionResult> {
  const auth = await requirePostInstallIssueUser();
  if (!auth.ok) return auth;

  const closingNote = input.closingNote?.trim() ?? "";
  const supabase = await createClient();
  const context = await loadIssueContext(supabase, input.issueId);
  if (!context.ok) return context;
  if (context.issue.status === "resolved") return { ok: true };

  if (closingNote) {
    const { error: noteError } = await supabase.from("window_post_install_issue_notes").insert({
      id: crypto.randomUUID(),
      issue_id: input.issueId,
      author_user_id: auth.user.id,
      author_role: auth.user.role,
      body: closingNote,
    });
    if (noteError) return { ok: false, error: noteError.message };
  }

  const { error } = await supabase
    .from("window_post_install_issues")
    .update({
      status: "resolved",
      resolved_at: new Date().toISOString(),
      resolved_by_user_id: auth.user.id,
    })
    .eq("id", input.issueId);
  if (error) return { ok: false, error: error.message };

  await logUnitActivity(supabase, {
    unitId: context.issue.unit_id,
    actorRole: auth.user.role,
    actorName: auth.user.displayName,
    action: "post_install_issue_resolved",
    details: {
      issueId: input.issueId,
      windowId: context.issue.window_id,
      note: closingNote || null,
    },
  });

  revalidatePostInstallIssuePaths(context.issue.unit_id);
  return { ok: true };
}
