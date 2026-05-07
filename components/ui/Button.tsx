"use client";

import { cn } from "@/lib/cn";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary:
    "bg-vilo-300 text-clinical-ink hover:bg-vilo-400 shadow-sm border border-vilo-200 font-semibold",
  secondary:
    "bg-white text-clinical-ink border border-clinical-line hover:bg-vilo-50",
  ghost: "text-clinical-muted hover:bg-vilo-50 hover:text-clinical-ink",
  danger: "bg-clinical-alert text-white hover:opacity-90",
};

export function Button({
  className,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
