import { AUTH_COOKIE_PURGE_FLAG } from "@/lib/supabase/auth-errors";

/**
 * Runs before React and vendor chunks: if middleware set fsr_auth_purge, delete all
 * `sb-*` cookies so createBrowserClient never calls refresh with a dead token (avoids AuthApiError in console).
 */
export function SupabaseCookiePurgeScript() {
  const key = AUTH_COOKIE_PURGE_FLAG;
  const js = `(function(){var k=${JSON.stringify(key)};if(document.cookie.indexOf(k+"=")<0)return;var names=document.cookie.split(";").map(function(s){return s.trim().split("=")[0]}).filter(Boolean);for(var i=0;i<names.length;i++){var n=names[i];if(n.slice(0,3)==="sb-"){document.cookie=n+"=;path=/;max-age=0;expires=Thu, 01 Jan 1970 00:00:00 GMT";}}document.cookie=k+"=;path=/;max-age=0;expires=Thu, 01 Jan 1970 00:00:00 GMT";})();`;
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}
