"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

const SIZE_CLASSES = {
  md: "max-w-lg",
  lg: "max-w-3xl",
  xl: "max-w-6xl",
} as const;

export function Modal({
  open,
  onClose,
  title,
  children,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** "lg" is for content-heavy modals (e.g. tabbed detail views); "xl" is for
   * wide side-by-side layouts (e.g. a detail panel next to a table) — every
   * other modal keeps the default. */
  size?: keyof typeof SIZE_CLASSES;
}) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="animate-overlay-in fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={`animate-modal-pop relative flex max-h-[85vh] w-full flex-col ${SIZE_CLASSES[size]} rounded-2xl border border-surface-border bg-surface p-6 shadow-2xl shadow-black/40`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 text-muted transition hover:text-foreground"
        >
          <X className="size-4" />
        </button>
        <h2 className="shrink-0 text-lg font-semibold tracking-tight">{title}</h2>
        {/* Content-heavy modals (e.g. the Connections detail view) can grow
            taller than the viewport — this is the scroll container, not the
            whole dialog, so the title and close button stay put. */}
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">{children}</div>
      </div>
    </div>
  );
}
