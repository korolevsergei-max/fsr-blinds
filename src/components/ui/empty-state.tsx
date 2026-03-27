"use client";

import type { Icon as PhosphorIcon } from "@phosphor-icons/react";

interface EmptyStateProps {
  icon: PhosphorIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-14 h-14 rounded-[var(--radius-xl)] bg-surface border border-border flex items-center justify-center mb-5">
        <Icon size={24} weight="duotone" className="text-accent" />
      </div>
      <h3 className="text-[15px] font-semibold text-foreground tracking-tight mb-1.5">
        {title}
      </h3>
      <p className="text-sm text-secondary max-w-[28ch] leading-relaxed mb-6">
        {description}
      </p>
      {action}
    </div>
  );
}
