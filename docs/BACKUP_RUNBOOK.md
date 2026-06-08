# FSR Blinds — Backup & Disaster-Recovery Runbook

This project backs the client's business. This runbook describes the layers of
protection and exactly how to set them up, verify them, and restore from them.

## TL;DR — what protects what

| Layer | Covers | Where it lives | Set up by |
|---|---|---|---|
| **Git / GitHub** | All source code + DB **schema** (migrations) | GitHub | already in place |
| **Supabase native backups** | Whole DB incl. auth + storage metadata | Inside Supabase account | dashboard (Phase 3 below) |
| **Nightly off-site backup** ⭐ | DB **data** (pg_dump) + **photos** (Storage) | **Google Drive** (independent of Supabase + GitHub) | this runbook |
| **Manual snapshot** | Public-table data + photos | Wherever you run it / Drive | `scripts/backup-snapshot.mjs` |

The nightly off-site backup is the one that survives a hacked or deleted Supabase
account, because it lives in a separate Google account.

---

## Project facts

- Supabase project ref: `fbjjqfmsroryfgfushmb` (region `us-west-2`)
- Storage buckets: `fsr-media`, `fsr-owner-verification`
- Postgres major version: **17**
- Drive backup folder: `FSR-Blinds-Backups/` (`db/` for dumps, `storage/<bucket>/` for photos)

---

## A. One-time setup of the nightly off-site backup

You set up three credentials once, store them as GitHub Actions secrets, and the
workflow at `.github/workflows/backup.yml` runs every night.

### A1. Supabase database connection string (`SUPABASE_DB_URL`)

1. Supabase Dashboard → **Settings → Database → Connection string → URI**.
2. Choose the **direct connection** (port `5432`, session mode) — *not* the
   transaction pooler (6543), which `pg_dump` can't use.
3. Copy the full string and substitute your DB password for `[YOUR-PASSWORD]`.

### A2. Supabase S3 access keys (for syncing photos)

1. Supabase Dashboard → **Storage → Settings → S3 Connection** → enable it.
2. Note the **endpoint** (e.g. `https://fbjjqfmsroryfgfushmb.storage.supabase.co/storage/v1/s3`)
   and **region** (`us-west-2`).
3. Create **S3 access keys** → copy the access key id + secret (shown once).

### A3. Google Drive access for rclone (the part that needs care)

rclone needs an OAuth token for your Google account. Google expires refresh
tokens after **7 days** for OAuth apps in "testing" mode, so create your own
OAuth client and publish it — then the token doesn't expire.

1. Go to <https://console.cloud.google.com> → create/select a project.
2. **APIs & Services → Library →** enable **Google Drive API**.
3. **OAuth consent screen** → External → fill required fields → add yourself as a
   test user → then **Publish app** (Publishing status: *In production*).
4. **Credentials → Create credentials → OAuth client ID → Desktop app**. Copy the
   **Client ID** and **Client secret**.
5. On your Mac: `brew install rclone` then run `rclone config`:
   - `n` (new remote) → name **`gdrive`** → storage **`drive`**.
   - Paste the Client ID + secret from step 4.
   - scope: `1` (full drive access).
   - `y` to "use auto config" → authorize in the browser as
     **korolev.sergei@gmail.com**.
   - Not a shared/team drive → `n`. Confirm.

### A4. Add the Supabase S3 remote to the same rclone config

Run `rclone config` again → `n` → name **`supa`** → storage **`s3`** →
provider **`Other`**, then enter the access key/secret/endpoint/region from A2.
Or open `~/.config/rclone/rclone.conf` and add:

```ini
[supa]
type = s3
provider = Other
access_key_id = <S3 access key from A2>
secret_access_key = <S3 secret from A2>
endpoint = https://fbjjqfmsroryfgfushmb.storage.supabase.co/storage/v1/s3
region = us-west-2
force_path_style = true
no_check_bucket = true
```

Verify both remotes work:

```bash
rclone lsd gdrive:                         # lists your Drive folders
rclone ls supa:fsr-media | head            # lists some photos
```

### A5. Store the three secrets in GitHub

GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
|---|---|
| `SUPABASE_DB_URL` | the URI from A1 (with password) |
| `RCLONE_CONF_B64` | output of `base64 -i ~/.config/rclone/rclone.conf` (one line) |

> `RCLONE_CONF_B64` bundles both the `gdrive` and `supa` remotes (including the S3
> keys), so you don't need separate S3 secrets. macOS `base64` already prints a
> single line; if you used `base64 -w0` elsewhere that's fine too.

### A6. Run it

GitHub repo → **Actions → "Backup (DB + Storage) to Google Drive" → Run workflow**.
Confirm a green run, then check Google Drive:
`FSR-Blinds-Backups/db/fsr-blinds-db-YYYY-MM-DD.sql.gz` and
`FSR-Blinds-Backups/storage/fsr-media/...`, `.../fsr-owner-verification/...`.
After that it runs automatically every night at 08:00 UTC.

---

## B. Restore procedure (practice this once — see C)

### B1. Database

```bash
# Into a fresh or scratch Supabase project (set SUPABASE_DB_URL to its URI):
gunzip -c fsr-blinds-db-YYYY-MM-DD.sql.gz | psql "$SUPABASE_DB_URL"
# If you also captured auth users:
gunzip -c fsr-blinds-auth-YYYY-MM-DD.sql.gz | psql "$SUPABASE_DB_URL"
```

The dump is `public` schema with `--clean --if-exists`, so it drops and recreates
the business tables. Then re-point the app's env vars at the restored project.

### B2. Photos

```bash
# Push the backed-up photos back into the bucket (reverse of the nightly copy):
rclone copy "gdrive:FSR-Blinds-Backups/storage/fsr-media" "supa:fsr-media"
rclone copy "gdrive:FSR-Blinds-Backups/storage/fsr-owner-verification" "supa:fsr-owner-verification"
```

### B3. From a manual snapshot instead

`scripts/backup-snapshot.mjs` writes per-table JSON + downloaded photos. Photos
restore the same way (rclone/upload). JSON restore is a manual import (the dump in
B1 is the preferred full-fidelity path).

---

## C. Verify the backups are real (do this once now, then quarterly)

A backup you've never restored is a guess. To prove it:

1. Create a throwaway Supabase project ("fsr-restore-test").
2. Run B1 against it; confirm row counts roughly match production
   (`select count(*) from windows;` etc.).
3. Run B2 for one bucket; open a restored photo.
4. Delete the throwaway project.

---

## D. Supabase native backups (second layer — dashboard)

1. **Settings → Billing**: confirm the project is on **Pro** (Free has no
   automated backups).
2. **Database → Backups**: confirm **daily backups** are listed (7-day retention
   on Pro).
3. Consider enabling **Point-in-Time Recovery (PITR)** (paid add-on) for
   to-the-minute restores — recommended given this is the client's only system.
4. Keep the DB password and S3 keys only in GitHub secrets / your password
   manager — never commit them.

---

## E. Manual snapshot anytime (no DB password needed)

```bash
node scripts/backup-snapshot.mjs --measure     # see sizes first
node scripts/backup-snapshot.mjs               # full snapshot -> ./backup/<timestamp>/
```

Uses only `SUPABASE_SERVICE_ROLE_KEY` from `.env.local`. The `backup/` folder is
gitignored — move/upload it somewhere safe (e.g. Drive) after running.
