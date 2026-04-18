import type { Metadata } from "next";

export const metadata: Metadata = { title: "Cutting list" };

export default function PrintListLayout({ children }: { children: React.ReactNode }) {
  return children;
}
