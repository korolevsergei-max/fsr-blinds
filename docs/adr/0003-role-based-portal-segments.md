# ADR-0003: Role-Based Portal Segments

## Status
Accepted (2026-04-30)

## Context
The application serves multiple distinct user roles — management, scheduler, installer, cutter, assembler, qc, and manufacturer — each with a different set of screens and data access needs. A routing strategy was needed that keeps role-specific code isolated, makes it easy to apply per-role middleware/auth guards, and lets each portal evolve independently.

## Decision
Each user role has its own top-level URL segment under `src/app/`: `/management/`, `/scheduler/`, `/installer/`, `/cutter/`, `/assembler/`, `/qc/`, `/manufacturer/`. Shared UI components live in `src/components/`; role-specific pages and layouts live entirely within their segment.

## Consequences
- **Easier:** Auth guards and layout wrappers can be applied per-segment in a single `layout.tsx` or middleware matcher.
- **Easier:** Role-specific features can be added or removed without touching other portals.
- **Harder:** Shared behaviour (e.g. a common unit detail view) must either be duplicated or extracted into a shared component/route, which requires discipline to avoid drift.
- **Harder:** Navigation between roles (e.g. a scheduler viewing installer progress) requires crossing segment boundaries explicitly.
