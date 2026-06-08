#!/usr/bin/env bash
#
# Orchestrate a full off-site backup of FSR Blinds to Google Drive:
#   1. pg_dump the database         -> dated .sql.gz
#   2. copy the dump to Drive       -> gdrive:$DRIVE_ROOT/db/
#   3. copy Storage buckets to Drive-> gdrive:$DRIVE_ROOT/storage/<bucket>/  (additive)
#   4. prune DB dumps older than $RETENTION_DAYS days on Drive
#
# This is what the nightly GitHub Action runs. It can also be run locally.
#
# Requires (all present on the GitHub Actions ubuntu runner after the install step):
#   - pg_dump (v17+), gzip
#   - rclone, with a config that defines two remotes:
#       gdrive : Google Drive (OAuth token)
#       supa   : s3 backend pointed at Supabase's S3-compatible Storage endpoint
#     See docs/BACKUP_RUNBOOK.md for how to build that rclone.conf.
#   - SUPABASE_DB_URL in the environment (see scripts/backup-db.sh).
#
# Env:
#   DRIVE_ROOT       Drive folder name           (default: FSR-Blinds-Backups)
#   RETENTION_DAYS   prune DB dumps older than N  (default: 30)
#   BUCKETS          space-separated bucket list  (default: "fsr-media fsr-owner-verification")
#
# Usage:
#   ./scripts/backup-run.sh [OUTPUT_DIR]
#
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="${1:-./backup-out}"
DRIVE_ROOT="${DRIVE_ROOT:-FSR-Blinds-Backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
BUCKETS="${BUCKETS:-fsr-media fsr-owner-verification}"

mkdir -p "$OUT_DIR"

echo "===================================================================="
echo " FSR Blinds backup  |  $(date -u '+%Y-%m-%d %H:%M:%SZ')"
echo " Drive root: gdrive:${DRIVE_ROOT}   retention: ${RETENTION_DAYS}d"
echo "===================================================================="

# 1 + 2: database dump -> Drive ------------------------------------------------
echo
echo "### 1/4  Dumping database"
DUMP_PATH="$(bash "$HERE/backup-db.sh" "$OUT_DIR" | tail -n1)"

echo
echo "### 2/4  Uploading DB dump(s) to gdrive:${DRIVE_ROOT}/db/"
rclone copy "$OUT_DIR" "gdrive:${DRIVE_ROOT}/db" \
  --include "*.sql.gz" --progress

# 3: Storage buckets -> Drive (additive copy; never deletes from backup) -------
echo
echo "### 3/4  Mirroring Storage buckets to Drive (additive)"
for bucket in $BUCKETS; do
  echo "--> ${bucket}"
  # 'copy' is additive: it never deletes from the backup, so an accidental or
  # malicious deletion in Supabase cannot wipe the backed-up photo. See runbook
  # for the 'sync --backup-dir' variant if you want an exact mirror + archive.
  rclone copy "supa:${bucket}" "gdrive:${DRIVE_ROOT}/storage/${bucket}" \
    --fast-list --transfers 8 --progress
done

# 4: prune old DB dumps on Drive ----------------------------------------------
echo
echo "### 4/4  Pruning DB dumps older than ${RETENTION_DAYS} days"
rclone delete "gdrive:${DRIVE_ROOT}/db" \
  --include "*.sql.gz" --min-age "${RETENTION_DAYS}d" --rmdirs || true

echo
echo "Backup complete. Local copy: ${DUMP_PATH}"
