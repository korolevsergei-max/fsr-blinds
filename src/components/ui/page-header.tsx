"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  backHref?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ title, subtitle, backHref, actions }: PageHeaderProps) {
  const router = useRouter();

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-border">
      <div className="flex items-center gap-3 px-4 py-3.5">
        {backHref && (
          <button
            onClick={() => router.push(backHref)}
            className="flex items-center justify-center w-9 h-9 -ml-1 rounded-xl text-accent hover:bg-accent/5 transition-colors active:scale-[0.96]"
          >
            <ArrowLeft size={20} weight="bold" />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold tracking-tight text-accent truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs text-muted truncate mt-0.5">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
