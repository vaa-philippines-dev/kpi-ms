"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { MoreVertical, UserCog, LogOut } from "lucide-react";
import { roleLabel } from "@/lib/roles";
import { signOutAction } from "@/app/dashboard/actions";

export function UserMenu({ email, role }: { email: string; role: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const initial = email[0]?.toUpperCase() ?? "?";

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
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

  return (
    <div ref={rootRef} className="relative flex items-center gap-2 px-1">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-semibold text-accent">
        {initial}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">{email}</p>
        <p className="text-[11px] text-muted">{roleLabel(role)}</p>
      </div>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Account menu"
        aria-expanded={open}
        className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-surface-hover hover:text-foreground"
      >
        <MoreVertical className="size-4" />
      </button>

      {open && (
        <div className="absolute right-0 bottom-full mb-2 w-44 overflow-hidden rounded-xl border border-surface-border bg-surface py-1 shadow-lg">
          <Link
            href="/dashboard/settings"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-foreground transition hover:bg-surface-hover"
          >
            <UserCog className="size-4" />
            Edit Profile
          </Link>
          <form action={signOutAction}>
            <button
              type="submit"
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-danger transition hover:bg-surface-hover"
            >
              <LogOut className="size-4" />
              Log out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
