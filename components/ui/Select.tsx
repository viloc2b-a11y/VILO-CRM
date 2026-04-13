"use client";

import { cn } from "@/lib/cn";
import { forwardRef, type SelectHTMLAttributes } from "react";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          "w-full rounded-lg border border-clinical-line bg-white px-3 py-2 text-sm text-clinical-ink shadow-sm outline-none focus:border-vilo-400 focus:ring-2 focus:ring-vilo-200",
          className
        )}
        {...props}
      >
        {children}
      </select>
    );
  }
);
