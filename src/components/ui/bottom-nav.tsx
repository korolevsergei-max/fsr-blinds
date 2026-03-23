"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, CalendarBlank, UploadSimple, UserCircle } from "@phosphor-icons/react";

const navItems = [
  { href: "/installer", label: "Home", Icon: House },
  { href: "/installer/schedule", label: "Schedule", Icon: CalendarBlank },
  { href: "/installer/uploads", label: "Uploads", Icon: UploadSimple },
  { href: "/installer/profile", label: "Profile", Icon: UserCircle },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-lg items-center justify-around py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {navItems.map(({ href, label, Icon }) => {
          const active = pathname === href || (href !== "/installer" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors ${
                active
                  ? "text-accent"
                  : "text-muted hover:text-foreground"
              }`}
            >
              <Icon size={24} weight={active ? "fill" : "regular"} />
              <span className="text-[10px] font-medium tracking-tight">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
