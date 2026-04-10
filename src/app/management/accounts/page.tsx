import { redirect } from "next/navigation";

export default function AccountsRedirectPage() {
  redirect("/management/settings?tab=accounts");
}
