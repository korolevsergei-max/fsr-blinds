"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  House,
  CalendarBlank,
  Bell,
} from "@phosphor-icons/react";

const navItems = [
  { href: "/installer",               label: "Home",     Icon: House },
  { href: "/installer/schedule",      label: "Schedule", Icon: CalendarBlank },
  { href: "/installer/notifications", label: "Alerts",   Icon: Bell },
];

export function BottomNav({
  unreadNotifications = 0,
}: {
  unreadNotifications?: number;
}) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main navigation"
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 backdrop-blur-md"
    >
      <div className="mx-auto flex max-w-lg items-center justify-around py-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {navItems.map(({ href, label, Icon }) => {
          const active =
            pathname === href ||
            (href !== "/installer" && pathname.startsWith(href));
          const showBadge =
            href === "/installer/notifications" && unreadNotifications > 0;

          return (
            <Link
              key={href}
              href={href}
              className={[
                "relative flex flex-col items-center gap-1 px-4 py-1.5",
                "rounded-[var(--radius-md)] transition-colors duration-150",
                active ? "text-accent" : "text-tertiary hover:text-secondary",
              ].join(" ")}
            >
              <div className="relative">
                <div
                  className={[
                    "flex items-center justify-center w-10 h-7 rounded-[var(--radius-sm)] transition-colors duration-150",
                    active ? "bg-accent-light" : "",
                  ].join(" ")}
                >
                  <Icon
                    size={22}
                    weight={active ? "fill" : "regular"}
                  />
                </div>
                {showBadge && (
                  <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[15px] h-[15px] px-0.5 rounded-full bg-danger text-white text-[8px] font-bold leading-none">
                    {unreadNotifications > 9 ? "9+" : unreadNotifications}
                  </span>
                )}
              </div>
              <span className="text-[12px] font-medium tracking-tight leading-none">
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
