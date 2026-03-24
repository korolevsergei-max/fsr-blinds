"use client";

import { forwardRef } from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  helper?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helper, id, className = "", ...props }, ref) => {
    const inputId = id || label.toLowerCase().replace(/\s+/g, "-");
    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={inputId} className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
          {label}
        </label>
        <input
          ref={ref}
          id={inputId}
          className={`
            h-12 px-4 rounded-2xl border text-sm text-foreground bg-white
            placeholder:text-zinc-400
            focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent
            transition-all duration-200
            ${error ? "border-red-400 focus:ring-red-200 focus:border-red-500" : "border-border"}
            ${className}
          `}
          {...props}
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        {helper && !error && <p className="text-xs text-muted">{helper}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";
