interface SurfaceCardProps {
  children: React.ReactNode;
  className?: string;
  noPadding?: boolean;
}

export function SurfaceCard({
  children,
  className = "",
  noPadding = false,
}: SurfaceCardProps) {
  return (
    <div
      className={[
        "surface-card overflow-hidden",
        noPadding ? "" : "p-4",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}
