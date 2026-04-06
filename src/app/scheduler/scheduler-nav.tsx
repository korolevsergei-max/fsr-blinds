"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChartBar, Buildings, CalendarBlank, UsersFour } from "@phosphor-icons/react";

const navItems = [
  { href: "/scheduler", label: "Dashboard", Icon: ChartBar },
  { href: "/scheduler/units", label: "Units", Icon: Buildings },
  { href: "/scheduler/schedule", label: "Schedule", Icon: CalendarBlank },
  { href: "/scheduler/installers", label: "Installers", Icon: UsersFour },
];

export function SchedulerNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Scheduler navigation"
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/98 backdrop-blur-lg lg:border-r"
    >
      <div className="mx-auto flex max-w-lg items-center justify-between px-1 py-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {navItems.map(({ href, label, Icon }) => {
          const active =
            pathname === href ||
            (href !== "/scheduler" && pathname.startsWith(href));

          return (
            <Link
              key={href}
              href={href}
              className={[
                "flex flex-1 flex-col items-center gap-1.5 px-0.5 py-1.5 min-w-0 transition-opacity active:opacity-70",
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
              <span className="text-[10px] sm:text-[11px] font-medium tracking-tight leading-none truncate w-full text-center px-1">
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
