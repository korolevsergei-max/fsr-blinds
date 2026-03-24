"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Bell,
  CalendarBlank,
  Circle,
  CheckCircle,
} from "@phosphor-icons/react";
import { markNotificationRead } from "@/app/actions/fsr-data";
import type { Notification } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function NotificationsList({
  notifications,
}: {
  notifications: Notification[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const handleRead = (notif: Notification) => {
    if (notif.read) {
      if (notif.type === "schedule_published") {
        router.push("/installer/schedule");
      }
      return;
    }
    startTransition(async () => {
      await markNotificationRead(notif.id, "installer", "inst-1");
      router.refresh();
      if (notif.type === "schedule_published") {
        router.push("/installer/schedule");
      }
    });
  };

  return (
    <div className="flex flex-col min-h-[100dvh]">
      <PageHeader title="Notifications" />

      <div className="flex-1 px-5 py-5">
        {notifications.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="All caught up"
            description="No notifications right now. We'll let you know when something needs your attention."
          />
        ) : (
          <div className="flex flex-col gap-2">
            {notifications.map((notif, i) => (
              <motion.button
                key={notif.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: i * 0.04,
                  duration: 0.3,
                  ease: [0.16, 1, 0.3, 1],
                }}
                onClick={() => handleRead(notif)}
                disabled={pending}
                className={`w-full text-left rounded-2xl border p-4 transition-all active:scale-[0.99] ${
                  notif.read
                    ? "border-border bg-white"
                    : "border-accent/20 bg-accent/3"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`mt-0.5 flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center ${
                      notif.read ? "bg-surface" : "bg-accent/10"
                    }`}
                  >
                    {notif.type === "schedule_published" ? (
                      <CalendarBlank
                        size={18}
                        weight="fill"
                        className={notif.read ? "text-zinc-400" : "text-accent"}
                      />
                    ) : (
                      <Bell
                        size={18}
                        weight="fill"
                        className={notif.read ? "text-zinc-400" : "text-accent"}
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p
                        className={`text-sm tracking-tight ${
                          notif.read
                            ? "font-medium text-zinc-600"
                            : "font-bold text-foreground"
                        }`}
                      >
                        {notif.title}
                      </p>
                      {!notif.read && (
                        <Circle
                          size={8}
                          weight="fill"
                          className="text-accent flex-shrink-0"
                        />
                      )}
                    </div>
                    {notif.body && (
                      <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
                        {notif.body}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-2 text-[11px] text-zinc-400">
                      <span>{formatDate(notif.createdAt)}</span>
                      {notif.read && (
                        <span className="flex items-center gap-0.5 text-accent">
                          <CheckCircle size={12} weight="fill" />
                          Read
                        </span>
                      )}
                      {notif.type === "schedule_published" && (
                        <span className="text-accent font-semibold">
                          Tap to view schedule →
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </motion.button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
