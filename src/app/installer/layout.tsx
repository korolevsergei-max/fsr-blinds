import { BottomNav } from "@/components/ui/bottom-nav";

export default function InstallerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-[100dvh] bg-background pb-20">
      {children}
      <BottomNav />
    </div>
  );
}
