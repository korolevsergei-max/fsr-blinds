# ADR-0002: Supabase Joins in JavaScript

## Status
Accepted (2026-04-30)

## Context
Supabase supports PostgREST's foreign-key-based `.select()` embedding to fetch related rows in a single request. However, the app's data model involves many-to-many and derived relationships (e.g. scheduler→unit assignments, installer team scoping) that are awkward to express as PostgREST embeds. A choice was needed between pushing join logic into SQL/PostgREST or handling it in TypeScript.

## Decision
Joins between Supabase tables are performed in TypeScript mapper functions, not in SQL or PostgREST embeds. Each table is queried with a flat `.from().select('*')` and the results are assembled into the `AppDataset` shape by `src/lib/server-data.ts` and `src/lib/dataset-mappers.ts`.

## Consequences
- **Easier:** Join logic is fully type-checked and debuggable in TypeScript; no PostgREST embed syntax to learn or maintain.
- **Easier:** Complex derived relationships (assignment maps, scheduler scoping) are straightforward to express.
- **Harder:** Multiple round-trips to Supabase per page load; mitigated by the `get_full_dataset` RPC fast path and React `cache()`.
- **Harder:** Large datasets require chunking (`selectInChunks`) to stay under URL-length limits on `.in()` queries.
