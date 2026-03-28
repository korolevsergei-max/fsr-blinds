import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { homePathForRole } from "@/lib/role-routes";

export default async function AccountsRedirectPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (user.role === "owner") {
    redirect("/management/accounts");
  }

  redirect(homePathForRole(user.role));
}
