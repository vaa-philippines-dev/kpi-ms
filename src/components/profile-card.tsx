"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { ChevronDown, Loader2, LogOut, Send, Settings } from "lucide-react";
import { roleLabel } from "@/lib/roles";
import { signOutAction } from "@/app/dashboard/actions";

function LogOutButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-danger transition hover:bg-surface-hover disabled:opacity-60"
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
      {pending ? "Logging out…" : "Log out"}
    </button>
  );
}

export function ProfileCard({
  name,
  email,
  role,
  departmentName,
}: {
  name: string | null;
  email: string;
  role: string;
  departmentName?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const displayName = name?.trim() || email.split("@")[0];
  const initial = (name?.trim() || email)[0]?.toUpperCase() ?? "?";

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

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Account menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-lg py-1 pr-1.5 pl-1 transition hover:bg-surface-hover"
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-semibold text-accent">
          {initial}
        </span>
        <span className="hidden min-w-0 text-left md:block">
          <span className="block max-w-32 truncate text-xs font-medium text-foreground">
            {displayName}
          </span>
          <span className="block text-[11px] text-muted">{roleLabel(role)}</span>
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-muted" />
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-60 overflow-hidden rounded-xl border border-surface-border bg-surface py-1 shadow-lg">
          <div className="border-b border-surface-border px-3 py-2.5">
            <p className="truncate text-sm font-medium">{displayName}</p>
            <p className="truncate text-xs text-muted">{email}</p>
            <p className="mt-1 text-[11px] text-muted">
              {roleLabel(role)}
              {departmentName ? ` · ${departmentName}` : ""}
            </p>
          </div>

          <Link
            href="/submit"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-foreground transition hover:bg-surface-hover"
          >
            <Send className="size-4" />
            Submit KPIs
          </Link>

          {(role === "ADMIN" || role === "EXECUTIVE") && (
            <Link
              href="/dashboard/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-foreground transition hover:bg-surface-hover"
            >
              <Settings className="size-4" />
              System Settings
            </Link>
          )}

          <form action={signOutAction}>
            <LogOutButton />
          </form>
        </div>
      )}
    </div>
  );
}
