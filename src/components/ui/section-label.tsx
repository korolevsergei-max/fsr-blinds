interface SectionLabelProps {
  children: React.ReactNode;
  as?: "h2" | "h3" | "p";
  className?: string;
  noMargin?: boolean;
}

export function SectionLabel({
  children,
  as: Tag = "p",
  className = "",
  noMargin = false,
}: SectionLabelProps) {
  return (
    <Tag
      className={[
        "text-[11px] font-semibold text-tertiary tracking-[0.06em] uppercase",
        noMargin ? "" : "mb-2.5",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </Tag>
  );
}
