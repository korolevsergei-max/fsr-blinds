"use client";

import { forwardRef } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: [
    "bg-accent text-white",
    "hover:bg-accent-hover",
    "active:scale-[0.97] active:brightness-95",
    "shadow-[0_1px_3px_rgba(15,118,110,0.25)]",
    "disabled:opacity-40",
  ].join(" "),
  secondary: [
    "bg-card text-foreground",
    "border border-border",
    "hover:bg-surface hover:border-zinc-300",
    "active:scale-[0.97]",
    "shadow-[0_1px_2px_rgba(26,26,26,0.04)]",
    "disabled:opacity-40",
  ].join(" "),
  ghost: [
    "text-secondary",
    "hover:text-foreground hover:bg-surface",
    "active:scale-[0.97]",
    "disabled:opacity-40",
  ].join(" "),
  danger: [
    "bg-danger text-white",
    "hover:brightness-95",
    "active:scale-[0.97]",
    "shadow-[0_1px_3px_rgba(200,57,43,0.25)]",
    "disabled:opacity-40",
  ].join(" "),
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "h-9 px-4 text-[13px] rounded-[var(--radius-md)] gap-1.5",
  md: "h-11 px-5 text-sm rounded-[var(--radius-lg)] gap-2",
  lg: "h-[3.25rem] px-6 text-[15px] rounded-[var(--radius-full)] gap-2.5",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      fullWidth,
      className = "",
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={[
          "inline-flex items-center justify-center",
          "font-semibold tracking-[-0.01em]",
          "transition-all duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
          "select-none cursor-pointer",
          "disabled:pointer-events-none",
          variantStyles[variant],
          sizeStyles[size],
          fullWidth ? "w-full" : "",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
