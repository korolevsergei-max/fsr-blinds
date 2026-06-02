// Barrel: this module was split into cohesive per-entity modules under ./fsr-data/.
// The original path is preserved as a re-export so existing import sites keep working.
export type { ActionResult } from "./fsr-data/_shared";
export * from "./fsr-data/assignments";
export * from "./fsr-data/rooms";
export * from "./fsr-data/windows";
export * from "./fsr-data/photos";
export * from "./fsr-data/notifications";
