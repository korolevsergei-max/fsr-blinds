"use client";

import { useTransition, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell,
  CalendarBlank,
  Warning,
  CheckCircle,
  UserPlus,
  Package,
  Buildings,
  Circle,
  CheckCircle as CheckCircleIcon,
  X,
} from "@phosphor-icons/react";
import { markNotificationRead, markAllNotificationsRead } from "@/app/actions/fsr-data";
import type { Notification } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import {
  type NotifCategory,
  NOTIF_META,
} from "@/lib/notification-types";

// ─── Icon resolver ─────────────────────────────────────────────────────────────

type IconName = "Bell" | "CalendarBlank" | "Warning" | "CheckCircle" | "UserPlus" | "Package" | "Buildings";

const ICONS: Record<IconName, React.ElementType> = {
  Bell,
  CalendarBlank,
  Warning,
  CheckCircle,
  UserPlus,
  Package,
  Buildings,
};

function NotifIcon({ type, read }: { type: string; read: boolean }) {
  const meta = NOTIF_META[type] ?? { icon: "Bell", accent: "text-accent" };
  const IconComp = ICONS[meta.icon as IconName] ?? Bell;
  return (
    <div
      className={[
        "mt-0.5 flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-colors",
        read ? "bg-surface" : "bg-accent/10",
      ].join(" ")}
    >
      <IconComp
        size={18}
        weight="fill"
        className={read ? "text-zinc-400" : (meta.accent || "text-accent")}
      />
    </div>
  );
}

// ─── Date formatter ───────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function NotificationsList({
  notifications,
  recipientId,
  recipientRole,
  categories,
  unitBasePath,
}: {
  notifications: Notification[];
  recipientId: string;
  recipientRole: "scheduler" | "installer";
  categories: NotifCategory[];
  /** Base path for unit deep-links, e.g. "/scheduler/units". Serializable string — no functions. */
  unitBasePath?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Category filter state — all active by default
  const [activeCategories, setActiveCategories] = useState<Set<string>>(
    new Set(categories.map((c) => c.key))
  );

  const toggleCategory = (key: string) => {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Build the set of visible type strings from active category keys
  const visibleTypes = useMemo(() => {
    const types = new Set<string>();
    for (const cat of categories) {
      if (activeCategories.has(cat.key)) {
        cat.types.forEach((t) => types.add(t));
      }
    }
    return types;
  }, [categories, activeCategories]);

  const filtered = useMemo(
    () => notifications.filter((n) => visibleTypes.has(n.type)),
    [notifications, visibleTypes]
  );

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleRead = (notif: Notification) => {
    const href =
      notif.relatedUnitId && unitBasePath
        ? `${unitBasePath}/${notif.relatedUnitId}`
        : null;

    if (notif.read) {
      if (href) router.push(href);
      return;
    }
    startTransition(async () => {
      await markNotificationRead(notif.id, recipientRole, recipientId);
      router.refresh();
      if (href) router.push(href);
    });
  };

  const handleMarkAllRead = () => {
    startTransition(async () => {
      await markAllNotificationsRead(recipientRole, recipientId);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col min-h-[100dvh]">
      <PageHeader title="Alerts" />

      {/* Category filter chips */}
      {categories.length > 1 && (
        <div className="px-5 pt-3 pb-1">
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
            {categories.map((cat) => {
              const active = activeCategories.has(cat.key);
              return (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => toggleCategory(cat.key)}
                  className={[
                    "flex-shrink-0 inline-flex items-center gap-1 h-7 px-3 rounded-full text-[11px] font-semibold tracking-tight border transition-all",
                    active
                      ? "bg-accent text-white border-accent"
                      : "bg-white text-zinc-500 border-border hover:border-accent/40",
                  ].join(" ")}
                >
                  {!active && <X size={10} weight="bold" />}
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Mark all read */}
      {unreadCount > 0 && (
        <div className="px-5 pt-2 pb-0 flex items-center justify-between">
          <span className="text-[11px] text-tertiary">
            {unreadCount} unread
          </span>
          <button
            type="button"
            onClick={handleMarkAllRead}
            disabled={pending}
            className="text-[11px] font-semibold text-accent hover:text-accent/80 transition-colors disabled:opacity-50"
          >
            Mark all as read
          </button>
        </div>
      )}

      <div className="flex-1 px-5 py-4">
        {filtered.length === 0 ? (
          <EmptyState
            icon={Bell}
            title={notifications.length === 0 ? "All caught up" : "No alerts in view"}
            description={
              notifications.length === 0
                ? "No notifications right now. We'll let you know when something needs your attention."
                : "No notifications match the active filters. Try enabling more categories."
            }
          />
        ) : (
          <div className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {filtered.map((notif, i) => (
                <motion.button
                  key={notif.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{
                    delay: i * 0.03,
                    duration: 0.3,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  onClick={() => handleRead(notif)}
                  disabled={pending}
                  className={[
                    "w-full text-left rounded-2xl border p-3.5 transition-all active:scale-[0.99]",
                    notif.read
                      ? "border-border bg-white"
                      : "border-accent/20 bg-accent/3",
                  ].join(" ")}
                >
                  <div className="flex items-start gap-3">
                    <NotifIcon type={notif.type} read={notif.read} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p
                          className={[
                            "text-[13px] leading-tight tracking-tight",
                            notif.read
                              ? "font-medium text-zinc-600"
                              : "font-bold text-foreground",
                          ].join(" ")}
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
                        <p className="mt-1 text-[12px] leading-snug text-zinc-600">
                          {notif.body}
                        </p>
                      )}

                      <div className="mt-2.5 flex items-center gap-2 text-[10px] text-zinc-400">
                        <span>{formatDate(notif.createdAt)}</span>
                        {notif.read && (
                          <span className="flex items-center gap-0.5 text-emerald-500">
                            <CheckCircleIcon size={12} weight="fill" />
                            Read
                          </span>
                        )}
                        {notif.relatedUnitId && unitBasePath && (
                          <span className="text-accent font-semibold">
                            Tap to view unit →
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.button>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
