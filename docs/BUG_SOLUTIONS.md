# Bug Solutions and Patterns

## Login Redirect Loop After Successful Auth

**Symptoms:** Login succeeds (Supabase auth logs show 200), but user is stuck on the login page.

**Root Cause:**
The `user_profiles` table (and related triggers/RLS policies) existed only in local migration files but were **never applied** to the Supabase database. The middleware queries `user_profiles` to determine the user's role for routing. When the table doesn't exist or has no row for the user, the role lookup returns `null`, and the middleware redirects back to `/login`.

**Fix:**
1. Apply missing migrations via `mcp_supabase-mcp-server_apply_migration` (or `supabase db push`).
2. Manually insert a profile row for any users who signed up before the migration was applied:
```sql
INSERT INTO public.user_profiles (id, role, display_name, email)
VALUES ('<user-id>', 'owner', '<name>', '<email>')
ON CONFLICT (id) DO UPDATE SET role = 'owner';
```

**Prevention:** Always run `supabase db push` after adding new migrations before testing auth flows.

---


## Supabase Auth: Email Rate Limit on Invite (`inviteUserByEmail`)

**Error Message:** `Too many emails were sent recently. Please wait a few minutes, then try again.`

**Root Cause:** Supabase's built-in SMTP has a per-hour rate limit on invite/auth emails.

**Fix implemented in `auth-actions.ts`:** When `inviteUserByEmail` fails with a rate limit error, the action automatically falls back to `admin.auth.admin.createUser({ email_confirm: true, password: tempPassword })`. The temporary password is returned to the UI and displayed in a copy-able panel so the owner can share it manually with the installer.

**Long-term solution:** Configure a custom SMTP provider (e.g. Resend, SendGrid) in Supabase Dashboard → Authentication → SMTP Settings to avoid rate limits in production.


**Root Cause:**
By default, Supabase's built-in email service on the Free plan limits you to sending 3-4 emails per hour (for Signups, Magic Links, Password Resets). When doing development or testing accounts, you quickly hit this SMTP rate limit and get blocked.

**Solution:**
1. **For Development (Disable Confirmations):**
   - Go to your Supabase Dashboard
   - Click on **Authentication** > **Providers** > **Email**
   - Toggle **OFF** "Confirm email"
   - *(Note: This allows users to sign up instantly without needing to verify their email, effectively bypassing the email rate limit since no verification email is sent.)*

2. **For Production (Custom SMTP):**
   - In your Supabase Dashboard, go to **Project Settings** > **Email**
   - Under "Custom SMTP provider", toggle "Enable Custom SMTP"
   - Configure a third-party transactional email service like Resend, Sendgrid, or AWS SES to handle email delivery without Supabase's default rate limits.

---

## Installer UI: Building Details Show 0 Units

**Symptoms:** The installer home page correctly lists a building with its units, but clicking into the building (e.g., `/installer/buildings/bld-1`) shows "0 UNITS".

**Root Cause:**
The building details page (`src/app/installer/buildings/[buildingId]/page.tsx`) was not fetching the currently logged-in user's `installerId` to pass to the `<BuildingUnits />` component. As a result, the component fell back to its default prop `installerId="inst-1"`. If the logged-in installer is not `"inst-1"`, the page filters down to 0 units. This created a discrepancy between the home page (which extracted the ID properly) and the detail page.

**Fix:**
Ensure the current user is fetched via Supabase auth on every server-rendered page that depends on the `installerId`, updating `page.tsx` to retrieve it and pass it to the client component:
```tsx
import { getCurrentUser, getLinkedInstallerId } from "@/lib/auth";

// Inside the page component:
const user = await getCurrentUser();
const installerId = user ? await getLinkedInstallerId(user.id) : null;
<BuildingUnits data={data} installerId={installerId ?? "inst-1"} />
```
