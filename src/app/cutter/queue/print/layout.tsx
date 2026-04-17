import type { Metadata } from "next";

export const metadata: Metadata = { title: "Cut labels" };

export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return children;
}
