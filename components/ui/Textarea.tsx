"use client";

import { cn } from "@/lib/cn";
import { forwardRef, type TextareaHTMLAttributes } from "react";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          "min-h-[88px] w-full rounded-lg border border-clinical-line bg-white px-3 py-2 text-sm text-clinical-ink shadow-sm outline-none transition placeholder:text-clinical-muted/70 focus:border-vilo-400 focus:ring-2 focus:ring-vilo-200",
          className
        )}
        {...props}
      />
    );
  }
);
