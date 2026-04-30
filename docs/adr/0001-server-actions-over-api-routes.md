# ADR-0001: Server Actions Over API Routes

## Status
Accepted (2026-04-30)

## Context
Next.js offers two ways to handle server-side mutations: traditional `/api` route handlers and the newer Server Actions pattern. The project needs a consistent mutation strategy that minimises boilerplate, keeps type safety end-to-end, and works well with React's `useTransition`/`useOptimistic` hooks. Early in the project a choice was made for one approach to avoid mixing patterns.

## Decision
We use Next.js Server Actions for all mutations. API routes are reserved only for external callers (e.g. cron jobs) that cannot invoke a Server Action directly.

## Consequences
- **Easier:** Type-safe mutations without a separate fetch layer; co-location of action logic with the pages that use it; no need to write request/response serialisation code.
- **Easier:** Automatic CSRF protection provided by the Server Actions runtime.
- **Harder:** Actions are not directly callable from outside the Next.js process, so any true webhook or external integration needs an `/api` route exception.
- **Harder:** Streaming or long-running work requires a different pattern (e.g. a cron route + background job).
