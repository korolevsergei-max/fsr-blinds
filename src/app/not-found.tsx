"use client";

import Link from "next/link";
import { MapTrifold } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center px-6 text-center bg-background">
      <div className="w-14 h-14 rounded-[var(--radius-xl)] bg-surface border border-border flex items-center justify-center mb-5">
        <MapTrifold size={24} weight="duotone" className="text-tertiary" />
      </div>
      <h1 className="text-[19px] font-semibold text-foreground tracking-tight mb-2">
        Page not found
      </h1>
      <p className="text-[14px] text-secondary max-w-[30ch] leading-relaxed mb-8">
        The page you are looking for does not exist or has been moved.
      </p>
      <Link href="/">
        <Button>Back to home</Button>
      </Link>
    </div>
  );
}
