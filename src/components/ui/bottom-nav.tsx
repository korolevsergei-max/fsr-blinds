"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  House,
  CalendarBlank,
  UploadSimple,
  Bell,
} from "@phosphor-icons/react";

const navItems = [
  { href: "/installer", label: "HOME", Icon: House },
  { href: "/installer/schedule", label: "SCHEDULE", Icon: CalendarBlank },
  { href: "/installer/uploads", label: "UPLOADS", Icon: UploadSimple },
  { href: "/installer/notifications", label: "ALERTS", Icon: Bell },
];

export function BottomNav({
  unreadNotifications = 0,
}: {
  unreadNotifications?: number;
}) {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-lg items-center justify-around py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
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
              className={`relative flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors ${
                active ? "text-accent" : "text-zinc-400 hover:text-zinc-600"
              }`}
            >
              <div className="relative">
                <Icon size={22} weight={active ? "fill" : "regular"} />
                {showBadge && (
                  <span className="absolute -top-1 -right-1.5 flex items-center justify-center min-w-[15px] h-[15px] px-0.5 rounded-full bg-red-500 text-white text-[8px] font-bold leading-none">
                    {unreadNotifications > 9 ? "9+" : unreadNotifications}
                  </span>
                )}
              </div>
              <span className="text-[9px] font-bold tracking-wider">
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
