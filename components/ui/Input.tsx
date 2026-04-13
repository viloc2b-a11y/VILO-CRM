"use client";

import { cn } from "@/lib/cn";
import { forwardRef, type InputHTMLAttributes } from "react";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "w-full rounded-lg border border-clinical-line bg-white px-3 py-2 text-sm text-clinical-ink shadow-sm outline-none transition placeholder:text-clinical-muted/70 focus:border-vilo-400 focus:ring-2 focus:ring-vilo-200",
          className
        )}
        {...props}
      />
    );
  }
);
