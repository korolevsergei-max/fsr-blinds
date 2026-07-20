import { NextResponse } from "next/server";
import { ownerAccountExists } from "@/app/actions/auth/helpers";

// Lets the (now static) login shell decide whether to offer first-owner signup
// without making the page itself dynamic. Reveals only the same boolean the
// login page previously computed server-side; signUpOwnerAction still enforces
// the real rule (no self-signup once an owner exists).
export async function GET() {
  const exists = await ownerAccountExists();
  return NextResponse.json({ ownerExists: exists });
}
