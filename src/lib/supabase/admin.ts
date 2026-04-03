import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function normalizeEnvValue(value: string | undefined): string | undefined {
  const normalized = value?.trim().replace(/^['"]|['"]$/g, "");
  return normalized ? normalized : undefined;
}

function firstNonEmptyValue(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const normalized = normalizeEnvValue(value);
    if (normalized) return normalized;
  }
  return undefined;
}

function readLocalEnvValue(key: string): string | undefined {
  if (process.env.NODE_ENV === "production") return undefined;

  const candidateRoots = Array.from(
    new Set(
      [
        process.cwd(),
        process.env.INIT_CWD,
        process.env.PWD,
        "/Users/sergeikorolev/5. Vibe coding/260322-FSRblinds",
      ].filter((value): value is string => Boolean(value))
    )
  );

  try {
    for (const root of candidateRoots) {
      const envPath = join(root, ".env.local");
      if (!existsSync(envPath)) continue;

      const envContent = readFileSync(envPath, "utf8");
      const matchedLine = envContent
        .split("\n")
        .find((line) => line.trim().startsWith(`${key}=`));

      if (!matchedLine) continue;

      const raw = matchedLine.slice(matchedLine.indexOf("=") + 1);
      const normalized = normalizeEnvValue(raw);
      if (normalized) return normalized;
    }

    return undefined;
  } catch {
    return undefined;
  }
}

function resolveSupabaseUrl(): string | undefined {
  return firstNonEmptyValue(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_URL,
    readLocalEnvValue("NEXT_PUBLIC_SUPABASE_URL"),
    readLocalEnvValue("SUPABASE_URL")
  );
}

function resolveServiceRoleKey(): string | undefined {
  return firstNonEmptyValue(
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.SUPABASE_SERVICE_ROLE,
    process.env.SUPABASE_SERVICE_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY,
    readLocalEnvValue("SUPABASE_SERVICE_ROLE_KEY")
  );
}

function formatMissingAdminConfigError(
  diagnostics: ReturnType<typeof getAdminClientDiagnostics>,
  missingUrl: boolean,
  missingKey: boolean
): string {
  const isDeployed = process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
  if (isDeployed) {
    const parts: string[] = [];
    if (missingUrl) {
      parts.push(
        "Set NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL (Vercel → Environment Variables), matching your Supabase project API URL."
      );
    }
    if (missingKey) {
      parts.push(
        "Add SUPABASE_SERVICE_ROLE_KEY with the service_role secret from Supabase (Dashboard → Project Settings → API). " +
          "Apply to Production and Preview, save, then redeploy."
      );
    }
    return (
      parts.join(" ") +
      ` Debug: hasEnvUrl=${diagnostics.hasEnvUrl}, hasEnvServiceKey=${diagnostics.hasEnvServiceKey}.`
    );
  }
  return (
    `Missing Supabase admin config. Debug: hasEnvUrl=${diagnostics.hasEnvUrl}, hasFileUrl=${diagnostics.hasFileUrl}, hasEnvServiceKey=${diagnostics.hasEnvServiceKey}, hasFileServiceKey=${diagnostics.hasFileServiceKey}, cwd=${diagnostics.cwd}. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env.local and restart dev server (Cmd+C, then npm run dev).`
  );
}

export function getAdminClientDiagnostics() {
  const envUrl = firstNonEmptyValue(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_URL
  );
  const fileUrl = firstNonEmptyValue(
    readLocalEnvValue("NEXT_PUBLIC_SUPABASE_URL"),
    readLocalEnvValue("SUPABASE_URL")
  );
  const envServiceKey = firstNonEmptyValue(
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.SUPABASE_SERVICE_ROLE,
    process.env.SUPABASE_SERVICE_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY
  );
  const fileServiceKey = readLocalEnvValue("SUPABASE_SERVICE_ROLE_KEY");

  return {
    hasEnvUrl: Boolean(envUrl),
    hasFileUrl: Boolean(fileUrl),
    hasEnvServiceKey: Boolean(envServiceKey),
    hasFileServiceKey: Boolean(fileServiceKey),
    cwd: process.cwd(),
  };
}

export function createAdminClient() {
  const diagnostics = getAdminClientDiagnostics();
  const url = resolveSupabaseUrl();
  const serviceKey = resolveServiceRoleKey();

  if (!url || !serviceKey) {
    throw new Error(formatMissingAdminConfigError(diagnostics, !url, !serviceKey));
  }

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
