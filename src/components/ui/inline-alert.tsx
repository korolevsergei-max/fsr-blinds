type AlertVariant = "error" | "info" | "success" | "warning";

const variantStyles: Record<
  AlertVariant,
  { wrapper: string; text: string }
> = {
  error: {
    wrapper: "bg-danger-light border-[rgba(200,57,43,0.2)]",
    text: "text-danger",
  },
  info: {
    wrapper: "bg-accent-light border-[rgba(15,118,110,0.2)]",
    text: "text-accent",
  },
  success: {
    wrapper: "bg-success-light border-[rgba(15,118,110,0.2)]",
    text: "text-success",
  },
  warning: {
    wrapper: "bg-warning-light border-[rgba(201,122,16,0.2)]",
    text: "text-warning",
  },
};

interface InlineAlertProps {
  variant?: AlertVariant;
  children: React.ReactNode;
}

export function InlineAlert({
  variant = "error",
  children,
}: InlineAlertProps) {
  const { wrapper, text } = variantStyles[variant];
  return (
    <div
      role="alert"
      className={`rounded-[var(--radius-md)] border px-3.5 py-3 text-[13px] leading-snug font-medium ${wrapper} ${text}`}
    >
      {children}
    </div>
  );
}
