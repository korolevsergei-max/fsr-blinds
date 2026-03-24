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
  primary:
    "bg-accent text-white hover:bg-accent-dark active:scale-[0.98] active:-translate-y-[0.5px] shadow-sm",
  secondary:
    "bg-white text-foreground border border-border hover:bg-surface active:scale-[0.98]",
  ghost:
    "text-muted hover:text-foreground hover:bg-surface active:scale-[0.98]",
  danger:
    "bg-red-600 text-white hover:bg-red-700 active:scale-[0.98] shadow-sm",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "h-9 px-3.5 text-sm rounded-lg gap-1.5",
  md: "h-11 px-5 text-sm rounded-xl gap-2",
  lg: "h-13 px-6 text-[15px] rounded-2xl gap-2.5",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", fullWidth, className = "", children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={`
          inline-flex items-center justify-center font-semibold tracking-tight
          transition-all duration-200
          disabled:opacity-40 disabled:pointer-events-none
          ${variantStyles[variant]}
          ${sizeStyles[size]}
          ${fullWidth ? "w-full" : ""}
          ${className}
        `}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
