"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import type { Alert } from "@/lib/alerts";

export function NotificationBell({ alerts }: { alerts: Alert[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const hasDanger = alerts.some((a) => a.tone === "danger");

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={
          alerts.length > 0 ? `Notifications (${alerts.length})` : "Notifications"
        }
        aria-expanded={open}
        className="relative flex size-8 items-center justify-center rounded-lg text-muted transition hover:bg-surface-hover hover:text-foreground"
      >
        <Bell className="size-4" />
        {alerts.length > 0 && (
          <span
            className={`absolute top-1.5 right-1.5 size-1.5 rounded-full ${
              hasDanger ? "bg-danger" : "bg-warning"
            }`}
          />
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-72 overflow-hidden rounded-xl border border-surface-border bg-surface py-1 shadow-lg">
          {alerts.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-muted">
              Nothing needs attention.
            </p>
          ) : (
            alerts.map((alert) => (
              <Link
                key={alert.id}
                href={alert.href}
                onClick={() => setOpen(false)}
                className="flex items-start gap-2.5 px-3 py-2.5 text-sm transition hover:bg-surface-hover"
              >
                <span
                  className={`mt-1.5 size-1.5 shrink-0 rounded-full ${
                    alert.tone === "danger" ? "bg-danger" : "bg-warning"
                  }`}
                />
                <span className="text-muted">
                  <span className="font-semibold text-foreground">{alert.count}</span>{" "}
                  {alert.label}
                </span>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
