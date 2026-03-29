"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  backHref?: string;
  actions?: React.ReactNode;
  /** Renders below the title row inside the sticky header (e.g. in-page tabs). */
  belowTitle?: React.ReactNode;
}

export function PageHeader({
  title,
  subtitle,
  backHref,
  actions,
  belowTitle,
}: PageHeaderProps) {
  const router = useRouter();

  return (
    <header className="sticky top-0 z-30 bg-card/90 backdrop-blur-md border-b border-border">
      <div className="flex items-center gap-2 px-4 py-3">
        {backHref && (
          <button
            onClick={() => router.push(backHref)}
            aria-label="Go back"
            className="flex items-center justify-center w-9 h-9 -ml-1.5 rounded-[var(--radius-md)] text-secondary hover:bg-surface hover:text-foreground transition-all duration-150 active:scale-[0.95]"
          >
            <ArrowLeft size={18} weight="bold" />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-[17px] font-semibold tracking-tight text-foreground truncate leading-snug">
            {title}
          </h1>
          {subtitle && (
            <p className="text-[12px] text-tertiary truncate mt-0.5 leading-none">
              {subtitle}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2">{actions}</div>
        )}
      </div>
      {belowTitle && (
        <div className="px-4 pb-3 pt-0 border-t border-border/60 bg-card/95">
          {belowTitle}
        </div>
      )}
    </header>
  );
}
