"use client";

import { forwardRef } from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helper?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helper, id, className = "", ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-") || undefined;

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-[13px] font-medium text-secondary"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={[
            "h-[3.25rem] px-4",
            "rounded-[var(--radius-lg)]",
            "border bg-card text-[15px] text-foreground",
            "placeholder:text-tertiary",
            "transition-all duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
            "focus:outline-none focus:ring-[3px]",
            error
              ? "border-danger focus:border-danger focus:ring-[rgba(200,57,43,0.14)]"
              : "border-border focus:border-accent focus:ring-[rgba(15,118,110,0.14)]",
            className,
          ]
            .filter(Boolean)
            .join(" ")}
          {...props}
        />
        {error && (
          <p className="text-[13px] text-danger leading-snug">{error}</p>
        )}
        {helper && !error && (
          <p className="text-[13px] text-tertiary leading-snug">{helper}</p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
