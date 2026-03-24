"use client";

import { motion } from "framer-motion";
import { Image as ImageIcon } from "@phosphor-icons/react";
import type { InstallerMediaItem } from "@/lib/server-data";

export function UploadsGallery({ items }: { items: InstallerMediaItem[] }) {
  return (
    <div className="px-5 py-4 grid grid-cols-2 gap-3 pb-24">
      {items.map((item, i) => (
        <motion.a
          key={item.id}
          href={item.publicUrl}
          target="_blank"
          rel="noopener noreferrer"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            delay: i * 0.04,
            duration: 0.28,
            ease: [0.16, 1, 0.3, 1],
          }}
          className="group flex flex-col rounded-2xl border border-border bg-white overflow-hidden hover:border-zinc-300 transition-colors active:scale-[0.99]"
        >
          <div className="aspect-[4/3] bg-surface relative overflow-hidden">
            <img
              src={item.publicUrl}
              alt=""
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
          </div>
          <div className="p-3 flex flex-col gap-0.5 min-w-0">
            <p className="text-xs font-bold text-foreground truncate">
              {item.label || "Photo"}
            </p>
            <p className="text-[10px] text-accent font-bold uppercase tracking-wider truncate">
              {item.unitNumber ?? item.unitId}
            </p>
            <p className="text-[10px] text-zinc-400 font-mono">
              {new Date(item.createdAt).toLocaleString("en-CA", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          </div>
        </motion.a>
      ))}
    </div>
  );
}

export function UploadsEmpty() {
  return (
    <div className="px-5 py-8 flex flex-col items-center text-center gap-3">
      <div className="w-14 h-14 rounded-2xl bg-accent/8 flex items-center justify-center text-accent">
        <ImageIcon size={28} />
      </div>
      <p className="text-sm text-muted max-w-xs leading-relaxed">
        Add windows with photos on a unit to see them listed here. Images are
        stored in your Supabase project.
      </p>
    </div>
  );
}
