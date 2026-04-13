"use client";

import { cn } from "@/lib/cn";
import { useEffect, type ReactNode } from "react";
import { Button } from "./Button";

export function Modal({
  open,
  title,
  children,
  onClose,
  wide,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-clinical-ink/40 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        className={cn(
          "relative z-10 max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-clinical-line bg-clinical-paper shadow-xl sm:rounded-2xl",
          wide ? "max-w-3xl" : "max-w-lg"
        )}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-clinical-line bg-clinical-paper/95 px-4 py-3 backdrop-blur">
          <h2 className="text-sm font-semibold text-clinical-ink">{title}</h2>
          <Button variant="ghost" className="px-2 py-1 text-lg leading-none" onClick={onClose}>
            ×
          </Button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
