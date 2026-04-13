"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  House,
  CalendarBlank,
  Bell,
} from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";

const navItems = [
  { href: "/installer",               label: "Home",     Icon: House },
  { href: "/installer/schedule",      label: "Schedule", Icon: CalendarBlank },
  { href: "/installer/notifications", label: "Alerts",   Icon: Bell },
];

export function BottomNav({
  unreadNotifications = 0,
  recipientId,
}: {
  unreadNotifications?: number;
  recipientId?: string | null;
}) {
  const pathname = usePathname();
  const [liveUnreadCount, setLiveUnreadCount] = useState(unreadNotifications);

  useEffect(() => {
    setLiveUnreadCount(unreadNotifications);
  }, [unreadNotifications]);

  useEffect(() => {
    if (!recipientId) return;

    const supabase = createClient();
    const notificationsChannel = supabase
      .channel(`installer-nav-notifications-${recipientId}`)
      .on(
        "postgres_changes" as "system",
        { event: "INSERT", schema: "public", table: "notifications" } as unknown as { event: "system" },
        (payload) => {
          const next = payload.new as { recipient_role: string; recipient_id: string };
          if (next.recipient_role === "installer" && next.recipient_id === recipientId) {
            setLiveUnreadCount((count) => count + 1);
          }
        }
      )
      .subscribe();

    const readsChannel = supabase
      .channel(`installer-nav-reads-${recipientId}`)
      .on(
        "postgres_changes" as "system",
        { event: "INSERT", schema: "public", table: "notification_reads" } as unknown as { event: "system" },
        (payload) => {
          const next = payload.new as { user_role: string; user_id: string };
          if (next.user_role === "installer" && next.user_id === recipientId) {
            setLiveUnreadCount((count) => Math.max(0, count - 1));
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(notificationsChannel);
      void supabase.removeChannel(readsChannel);
    };
  }, [recipientId]);

  return (
    <nav
      aria-label="Main navigation"
      className="fixed bottom-0 left-1/2 z-50 w-full max-w-lg -translate-x-1/2 border-t border-border bg-card/98 backdrop-blur-lg"
    >
      <div className="mx-auto flex max-w-lg items-center justify-between px-1 py-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {navItems.map(({ href, label, Icon }) => {
          const active =
            pathname === href ||
            (href !== "/installer" && pathname.startsWith(href));
          const showBadge =
            href === "/installer/notifications" && liveUnreadCount > 0;

          return (
            <Link
              key={href}
              href={href}
              className={[
                "relative flex flex-1 flex-col items-center gap-1.5 px-0.5 py-1.5 min-w-0 transition-opacity active:opacity-70",
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
                    {liveUnreadCount > 9 ? "9+" : liveUnreadCount}
                  </span>
                )}
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
