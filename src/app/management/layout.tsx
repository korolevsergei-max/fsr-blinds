import { ManagementNav } from "./management-nav";

export default function ManagementLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-[100dvh] bg-background pb-20">
      {children}
      <ManagementNav />
    </div>
  );
}
