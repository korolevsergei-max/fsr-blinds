#!/usr/bin/env bash
#
# Dump the FSR Blinds Supabase Postgres database to a compressed, dated SQL file.
#
# Requires:
#   - pg_dump  (PostgreSQL 17+ client, to match the Supabase server major version)
#   - SUPABASE_DB_URL in the environment: the *direct / session* connection string
#     (port 5432) including the database password. Get it from:
#       Supabase Dashboard -> Settings -> Database -> Connection string -> "URI".
#     Do NOT use the transaction pooler (port 6543) -- pg_dump needs a session.
#
# Usage:
#   SUPABASE_DB_URL="postgresql://..." ./scripts/backup-db.sh [OUTPUT_DIR]
#
# Env overrides:
#   DUMP_SCHEMAS   space-separated schemas to dump (default: "public").
#                  "public" holds all business data. Supabase's own backups cover
#                  auth/storage/extensions; we additionally capture auth.users below.
#
set -euo pipefail

OUT_DIR="${1:-./backup-out}"
mkdir -p "$OUT_DIR"

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "ERROR: SUPABASE_DB_URL is not set." >&2
  exit 1
fi

STAMP="$(date -u +%Y-%m-%d)"
SCHEMAS="${DUMP_SCHEMAS:-public}"
MAIN_FILE="$OUT_DIR/fsr-blinds-db-${STAMP}.sql.gz"
AUTH_FILE="$OUT_DIR/fsr-blinds-auth-${STAMP}.sql.gz"

# Build --schema flags from $SCHEMAS.
SCHEMA_FLAGS=()
for s in $SCHEMAS; do SCHEMA_FLAGS+=( "--schema=$s" ); done

echo "==> Dumping schema(s) [$SCHEMAS] -> ${MAIN_FILE}"
pg_dump "$SUPABASE_DB_URL" \
  --no-owner --no-privileges \
  --clean --if-exists \
  --quote-all-identifiers \
  "${SCHEMA_FLAGS[@]}" \
  | gzip -9 > "$MAIN_FILE"
echo "    done: $(du -h "$MAIN_FILE" | cut -f1)"

# Best-effort: capture auth user identities (data only) so a fresh-project restore
# can keep the user<->data links. Skipped silently if the role lacks permission.
echo "==> Dumping auth.users / auth.identities (data-only, best-effort)"
if pg_dump "$SUPABASE_DB_URL" \
     --no-owner --no-privileges --data-only \
     --table=auth.users --table=auth.identities 2>/dev/null \
     | gzip -9 > "$AUTH_FILE"; then
  echo "    done: $(du -h "$AUTH_FILE" | cut -f1)"
else
  rm -f "$AUTH_FILE"
  echo "    skipped (insufficient permissions on auth schema)"
fi

# Emit the main dump path on stdout's last line for callers to capture.
echo "$MAIN_FILE"
