"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
import { CheckCircle, Factory, SignOut } from "@phosphor-icons/react";

import { signOut } from "@/app/actions/auth-actions";

const navItems = [
  { href: "/subcontractor", label: "Production", Icon: Factory },
  { href: "/subcontractor/completed", label: "Completed", Icon: CheckCircle },
];

/**
 * Desktop top bar, not the bottom tab bar the mobile portals use — this portal is
 * used at a desk, and a fixed bottom bar would cover the last rows of the table.
 */
export function SubcontractorNav({ displayName }: { displayName: string }) {
  const pathname = usePathname();
  const [signingOut, startSignOut] = useTransition();

  return (
    <header className="shrink-0 border-b border-border bg-card">
      <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-6 min-w-0">
          <span className="text-[15px] font-semibold tracking-tight text-foreground whitespace-nowrap">
            FSR Blinds
          </span>
          <nav aria-label="Subcontractor navigation" className="flex items-center gap-1">
            {navItems.map(({ href, label, Icon }) => {
              const active =
                href === "/subcontractor" ? pathname === href : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={[
                    "flex items-center gap-2 rounded-[var(--radius-md)] px-3 py-2 text-[13px] font-medium transition-colors",
                    active
                      ? "bg-accent-light text-accent"
                      : "text-tertiary hover:bg-surface hover:text-secondary",
                  ].join(" ")}
                >
                  <Icon size={17} weight={active ? "fill" : "regular"} />
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3 min-w-0">
          <span className="hidden sm:block text-[12px] text-tertiary truncate max-w-[220px]">
            {displayName}
          </span>
          <button
            type="button"
            disabled={signingOut}
            onClick={() => startSignOut(async () => { await signOut(); })}
            className="flex items-center gap-1.5 rounded-[var(--radius-md)] px-2.5 py-1.5 text-[12px] font-medium text-tertiary hover:bg-surface hover:text-secondary transition-colors disabled:opacity-60"
          >
            <SignOut size={15} />
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </div>
    </header>
  );
}
