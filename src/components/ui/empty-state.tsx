"use client";

import type { Icon as PhosphorIcon } from "@phosphor-icons/react";

interface EmptyStateProps {
  icon: PhosphorIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-accent/8 mb-5">
        <Icon size={28} weight="duotone" className="text-accent" />
      </div>
      <h3 className="text-base font-semibold text-foreground tracking-tight mb-1.5">
        {title}
      </h3>
      <p className="text-sm text-muted max-w-[28ch] leading-relaxed mb-6">
        {description}
      </p>
      {action}
    </div>
  );
}
