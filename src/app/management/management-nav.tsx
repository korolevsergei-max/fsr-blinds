"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChartBar,
  AddressBook,
  Buildings,
  CalendarBlank,
  ChartLineUp,
  Gear,
  Factory,
} from "@phosphor-icons/react";

const baseNavItems = [
  { href: "/management", label: "Dashboard", Icon: ChartBar },
  { href: "/management/clients", label: "Clients", Icon: AddressBook },
  { href: "/management/units", label: "Units", Icon: Buildings },
  { href: "/management/schedule", label: "Schedule", Icon: CalendarBlank },
  { href: "/management/process", label: "Process", Icon: Factory },
  { href: "/management/reports", label: "Reports", Icon: ChartLineUp },
];

const settingsNavItem = {
  href: "/management/settings",
  label: "Settings",
  Icon: Gear,
};

export function ManagementNav({ showAccounts }: { showAccounts: boolean }) {
  const pathname = usePathname();
  const navItems = showAccounts
    ? [...baseNavItems, settingsNavItem]
    : baseNavItems;

  return (
    <nav
      aria-label="Management navigation"
      className="fixed bottom-0 left-1/2 z-50 w-full max-w-lg -translate-x-1/2 border-t border-border bg-card/98 backdrop-blur-lg"
    >
      <div className="mx-auto flex max-w-lg items-center justify-between px-1 py-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {navItems.map(({ href, label, Icon }) => {
          const active =
            pathname === href ||
            (href !== "/management" && pathname.startsWith(href));

          return (
            <Link
              key={href}
              href={href}
              prefetch={href === "/management/settings" ? false : undefined}
              aria-current={active ? "page" : undefined}
              aria-label={label}
              title={label}
              className={[
                "flex flex-1 flex-col items-center justify-center gap-0 px-0.5 py-1.5 min-w-0 transition-opacity active:opacity-70",
                "rounded-[var(--radius-md)] transition-colors duration-150",
                active ? "text-accent" : "text-tertiary hover:text-secondary",
              ].join(" ")}
            >
              <div
                className={[
                  "flex items-center justify-center w-10 h-7 rounded-[var(--radius-sm)] transition-colors duration-150",
                  active ? "bg-accent-light" : "",
                ].join(" ")}
              >
                <Icon size={22} weight={active ? "fill" : "regular"} />
              </div>
              <span className="sr-only">
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
