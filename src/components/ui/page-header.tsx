"use client";

import Link from "next/link";
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
  return (
    <header className="sticky top-0 z-30 bg-card/90 backdrop-blur-md border-b border-border" suppressHydrationWarning>
      <div className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-start md:gap-4 md:py-4">
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          {backHref && (
            <Link
              href={backHref}
              aria-label="Go back"
              className="flex-shrink-0 flex items-center justify-center w-9 h-9 -ml-1 rounded-[var(--radius-md)] text-secondary hover:bg-surface hover:text-foreground transition-all duration-150 active:scale-[0.95]"
            >
              <ArrowLeft size={18} weight="bold" />
            </Link>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-[17px] sm:text-[18px] font-semibold tracking-tight text-foreground leading-snug break-words">
              {title}
            </h1>
            {subtitle && (
              <p className="text-[12px] sm:text-[13px] text-tertiary mt-0.5 leading-snug break-words">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {actions && (
          <div className="flex w-full max-w-full items-center gap-2 overflow-x-auto no-scrollbar pb-0.5 md:ml-auto md:w-auto md:max-w-[48%] md:flex-shrink-0 md:pb-0 [&>*]:shrink-0">
            {actions}
          </div>
        )}
      </div>
      {belowTitle && (
        <div className="border-t border-border/60 bg-card/95 px-4 py-3">
          {belowTitle}
        </div>
      )}
    </header>
  );
}
