# FSR Blinds — Domain Context

## Entities

**Client** — A property owner or property management company that has engaged FSR Blinds for a project. A client can own multiple buildings.

**Building** — A physical property (e.g. a residential tower or complex) belonging to a client. Units are grouped under a building.

**Unit** — A single apartment or suite within a building. The primary scheduling and progress-tracking unit. Each unit has a `unit_number`, belongs to a building and client, can be assigned to an installer and a scheduler, and carries a top-level `status` that summarises how far its windows have progressed through the pipeline.

**Room** — A named room inside a unit (e.g. "Living Room", "Bedroom 1"). Rooms are the middle tier of the hierarchy; windows are attached to rooms.

**Window** — A single blind to be measured, manufactured, and installed. Belongs to a room. Carries physical measurements (`width`, `height`, `depth`), a `blind_type` (`screen` or `blackout`), installation details (`window_installation`, `wand_chain`, `chain_side`, `fabric_adjustment_side`), boolean milestone flags (`measured`, `bracketed`, `installed`), a `riskFlag`, and a linked `window_production_status` record that tracks manufacturing progress.

**MediaUpload** — A photo file attached to a unit, room, or window. Has an `upload_kind`, a `stage`, a `phase`, and optional uploader identity fields (`uploaded_by_user_id`, `uploaded_by_name`, `uploaded_by_role`). Used by installers and the QC team to document each milestone.

**ScheduleEntry** — A scheduled task entry linking a unit to a task date and status. Used by schedulers to assign installation (or other) dates to units.

**WindowManufacturingEscalation** — A formal pushback or blocker raised by one manufacturing role against another (e.g. cutter pushes back to assembler). Tracks `source_role`, `target_role`, `escalation_type` (`pushback` | `blocker`), and `status` (`open` | `resolved`).

**WindowPostInstallIssue** — A defect or concern raised after installation, opened by an owner or scheduler, with threaded notes and a resolution status.

**Notification** — An in-app notification addressed to a specific `recipient_role` and `recipient_id`.

---

## Roles

**owner** — The property owner or client representative. Day-to-day they review installed work, raise post-install issues when something looks wrong, and track overall project progress across their buildings.

**scheduler** — Coordinates the installation pipeline for their assigned units. Day-to-day they assign units to installers, set task dates in the schedule, monitor which units are ready for each phase, and triage post-install issues.

**installer** — A field technician who visits units on-site. Day-to-day they perform bracketing and measurement of windows, then return to install finished blinds, uploading photos at each stage to document completion.

**cutter** — A manufacturing team member responsible for cutting blind materials to spec. Day-to-day they receive windows queued for cutting, cut the materials, and mark each window's production status as `cut`.

**assembler** — A manufacturing team member who builds the finished blind from cut components. Day-to-day they pick up cut windows, assemble them, and advance the production status to `assembled`.

**qc** — Quality control inspector in the manufacturing facility. Day-to-day they inspect assembled blinds against the original measurements and specifications, approve passing units (`qc_approved`), or raise escalations back to cutter or assembler for rework.

**manufacturer** — TODO: confirm with Sergei (the term `manufacturer` appears as a portal path `/manufacturer/` but no distinct role record was found in the source separate from cutter/assembler/qc).

---

## Lifecycle stages

A Window (blind) passes through the following stages. Measurement and bracketing are parallel — both must complete before cutting begins.

### Production status (per-window manufacturing track — `window_production_status.status`)
- `pending` — window exists but manufacturing has not started
- `cut` — materials have been cut by a cutter
- `assembled` — blind has been assembled by an assembler
- `qc_approved` — blind has passed quality control inspection

### Current stage (per-unit pipeline display — `CurrentStage`)
- `not_started` — no work has begun on any window in the unit
- `measurement` — windows are being or have been measured by the installer
- `bracketing` — brackets are being or have been installed
- `cutting` — windows are in the cutting stage of manufacturing
- `assembling` — windows are in the assembly stage of manufacturing
- `qc` — windows are undergoing quality control
- `installation` — finished blinds are being or have been installed
- `post_install_issue` — installation is complete but an open issue has been raised

### Unit status (coarse summary — `UnitStatus`)
- `not_started`
- `measured`
- `bracketed`
- `manufactured`
- `installed`

### Photo stages (`UnitPhotoStage`)
- `scheduled_bracketing` — before-bracketing photos (first set)
- `bracketed_measured` — after-bracketing photos (second set)
- `installed_pending_approval` — completion photos awaiting client approval
