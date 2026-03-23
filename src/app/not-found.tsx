"use client";

import Link from "next/link";
import { MapTrifold } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center px-6 text-center bg-background">
      <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-zinc-100 mb-5">
        <MapTrifold size={28} weight="duotone" className="text-zinc-400" />
      </div>
      <h1 className="text-xl font-semibold text-zinc-900 tracking-tight mb-2">
        Page not found
      </h1>
      <p className="text-sm text-muted max-w-[30ch] leading-relaxed mb-8">
        The page you are looking for does not exist or has been moved.
      </p>
      <Link href="/">
        <Button>Back to Home</Button>
      </Link>
    </div>
  );
}
