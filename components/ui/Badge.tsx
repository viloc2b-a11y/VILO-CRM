"use client";

import { cn } from "@/lib/cn";
import type { HTMLAttributes } from "react";

type Tone = "vilo" | "vitalis" | "neutral" | "alert" | "success";

const tones: Record<Tone, string> = {
  vilo: "bg-vilo-100 text-vilo-800 border-vilo-200",
  vitalis: "bg-vitalis-100 text-vitalis-900 border-vitalis-200",
  neutral: "bg-white text-clinical-muted border-clinical-line",
  alert: "bg-red-50 text-clinical-alert border-red-200",
  success: "bg-emerald-50 text-emerald-800 border-emerald-200",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        tones[tone],
        className
      )}
      {...props}
    />
  );
}
