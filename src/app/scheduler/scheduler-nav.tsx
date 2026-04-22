"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ChartBar, Buildings, CalendarBlank, UsersFour, Bell, Factory } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";

const navItems = [
  { href: "/scheduler", label: "Dashboard", Icon: ChartBar },
  { href: "/scheduler/units", label: "Units", Icon: Buildings },
  { href: "/scheduler/schedule", label: "Schedule", Icon: CalendarBlank },
  { href: "/scheduler/process", label: "Process", Icon: Factory },
  { href: "/scheduler/installers", label: "Installers", Icon: UsersFour },
  { href: "/scheduler/notifications", label: "Alerts", Icon: Bell },
];

export function SchedulerNav({
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
      .channel(`scheduler-nav-notifications-${recipientId}`)
      .on(
        "postgres_changes" as "system",
        { event: "INSERT", schema: "public", table: "notifications" } as unknown as { event: "system" },
        (payload) => {
          const next = payload.new as { recipient_role: string; recipient_id: string };
          if (next.recipient_role === "scheduler" && next.recipient_id === recipientId) {
            setLiveUnreadCount((count) => count + 1);
          }
        }
      )
      .subscribe();

    const readsChannel = supabase
      .channel(`scheduler-nav-reads-${recipientId}`)
      .on(
        "postgres_changes" as "system",
        { event: "INSERT", schema: "public", table: "notification_reads" } as unknown as { event: "system" },
        (payload) => {
          const next = payload.new as { user_role: string; user_id: string };
          if (next.user_role === "scheduler" && next.user_id === recipientId) {
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
      aria-label="Scheduler navigation"
      className="fixed bottom-0 left-1/2 z-50 w-full max-w-lg -translate-x-1/2 border-t border-border bg-card/98 backdrop-blur-lg"
    >
      <div className="mx-auto flex max-w-lg items-center justify-between px-1 py-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {navItems.map(({ href, label, Icon }) => {
          const active =
            pathname === href ||
            (href !== "/scheduler" && pathname.startsWith(href));
          const showBadge =
            href === "/scheduler/notifications" && liveUnreadCount > 0;

          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={[
                "relative flex flex-1 flex-col items-center gap-1 px-0.5 py-1.5 min-w-0 transition-opacity active:opacity-70",
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
                  <Icon size={21} weight={active ? "fill" : "regular"} />
                </div>
                {showBadge && (
                  <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[15px] h-[15px] px-0.5 rounded-full bg-danger text-white text-[8px] font-bold leading-none">
                    {liveUnreadCount > 9 ? "9+" : liveUnreadCount}
                  </span>
                )}
              </div>
              <span className="text-[9px] sm:text-[10px] font-medium tracking-tight leading-none truncate w-full text-center px-1">
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
