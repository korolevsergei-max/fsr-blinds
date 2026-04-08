/**
 * Default app home by `user_profiles.role`.
 * Unknown / missing role → "/" (middleware sends to login if needed).
 */
export function homePathForRole(role: string | null | undefined): string {
  if (role === "installer") return "/installer";
  if (role === "owner") return "/management";
  if (role === "cutter") return "/cutter";
  if (role === "scheduler") return "/scheduler";
  if (role === "assembler") return "/assembler";
  return "/";
}
