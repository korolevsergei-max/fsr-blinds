# Performance Baseline

Date: 2026-06-01  
Next.js: 16.2.1 (Turbopack)  
Commit: post-instrumentation setup (dead deps removed, Speed Insights added, optimizePackageImports enabled)

## Notes on measurement

This build uses Turbopack, which does **not** emit the per-route "First Load JS" table that webpack-mode builds do. Sizes below are extracted from `.next/static/chunks` and the shared chunk list in each route's `build-manifest.json`.

All sizes are **uncompressed / gzip-compressed** (simulated at level 6).

---

## Shared base bundle (loaded on every route)

These 7 chunks appear in every route's `build-manifest.json` under `polyfillFiles` + `rootMainFiles`:

| Chunk | Raw | Gzip |
|---|---|---|
| `03~yq9q893hmn.js` (polyfills) | 110.0 kB | 38.5 kB |
| `092ppf.jo5imc.js` (framework) | 221.0 kB | 69.0 kB |
| `0o9k22~.s6xvc.js` | 107.0 kB | 28.4 kB |
| `0dnfuohlb8jlh.js` | 43.4 kB | 9.0 kB |
| `072wl6lcnqcg1.js` | 32.9 kB | 9.4 kB |
| `08.gdx.x9-k0w.js` | 30.6 kB | 9.6 kB |
| `turbopack-177-p9tqjbfh7.js` | 10.3 kB | 4.1 kB |
| **Total shared** | **555.2 kB** | **168.2 kB** |

All main routes (`/login`, `/management`, `/cutter`, `/installer`, `/assembler`, `/qc`, `/scheduler`) load the same shared base. Route-specific split chunks are additional on top of this.

## Total static JS (all 108 chunks)

| Metric | Value |
|---|---|
| Raw | 5,163 kB |
| Gzip (≈ wire size) | 1,498 kB |
| Chunk count | 108 |

## What changed in this commit

- Removed `lucide-react` from dependencies (confirmed 0 imports in `src/`)
- Moved `xlsx` to devDependencies (only used in `scripts/`, not `src/`)
- Added `optimizePackageImports` for `@phosphor-icons/react` and `framer-motion`
- Added `compiler.removeConsole` (strips `console.*` except `console.error` in prod)
- Added `@next/bundle-analyzer` + `npm run analyze` script
- Added `@vercel/speed-insights` for real-user LCP/INP/TTFB monitoring

## How to compare in future PRs

Run `npm run build` and compare the shared bundle total and overall chunk sizes. For a proper per-route diff, run `npm run analyze` (requires `ANALYZE=true next build`) and compare the Webpack bundle treemap.

When Turbopack adds bundle size reporting, update this methodology.
