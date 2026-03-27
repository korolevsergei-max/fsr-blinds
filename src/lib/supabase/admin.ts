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

export function getAdminClientDiagnostics() {
  const envUrl = normalizeEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL);
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
  const url = firstNonEmptyValue(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    readLocalEnvValue("NEXT_PUBLIC_SUPABASE_URL"),
    readLocalEnvValue("SUPABASE_URL")
  );
  const serviceKey = firstNonEmptyValue(
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.SUPABASE_SERVICE_ROLE,
    process.env.SUPABASE_SERVICE_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY,
    readLocalEnvValue("SUPABASE_SERVICE_ROLE_KEY")
  );

  if (!url || !serviceKey) {
    throw new Error(
      `Missing Supabase admin config. Debug: hasEnvUrl=${diagnostics.hasEnvUrl}, hasFileUrl=${diagnostics.hasFileUrl}, hasEnvServiceKey=${diagnostics.hasEnvServiceKey}, hasFileServiceKey=${diagnostics.hasFileServiceKey}, cwd=${diagnostics.cwd}. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env.local and restart dev server (Cmd+C, then npm run dev).`
    );
  }

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
