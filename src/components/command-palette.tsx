"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { navItemLabel, visibleNavGroups } from "@/lib/nav";

type Entry = {
  href: string;
  label: string;
  group: string;
  icon: React.ComponentType<{ className?: string }>;
  haystack: string;
};

export function CommandPalette({ role }: { role: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const entries = useMemo<Entry[]>(
    () =>
      visibleNavGroups(role).flatMap((group) =>
        group.items.map((item) => {
          const label = navItemLabel(item, role);
          return {
            href: item.href,
            label,
            group: group.label,
            icon: item.icon,
            haystack: `${label} ${item.label} ${group.label} ${item.keywords ?? ""}`.toLowerCase(),
          };
        }),
      ),
    [role],
  );

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => q.split(/\s+/).every((term) => e.haystack.includes(term)));
  }, [entries, query]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setCursor(0);
  }, []);

  const go = useCallback(
    (href: string) => {
      close();
      router.push(href);
    },
    [close, router],
  );

  // ⌘K / Ctrl+K from anywhere in the dashboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Keep the highlighted row in view when arrowing past the fold.
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${cursor}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => (results.length === 0 ? 0 : (c + 1) % results.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => (results.length === 0 ? 0 : (c - 1 + results.length) % results.length));
    } else if (e.key === "Enter" && results[cursor]) {
      e.preventDefault();
      go(results[cursor].href);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-8 items-center gap-2 rounded-lg border border-surface-border bg-surface px-2.5 text-xs text-muted transition hover:border-accent/50 hover:text-foreground sm:w-56"
      >
        <Search className="size-3.5 shrink-0" />
        <span className="hidden flex-1 text-left sm:block">Search…</span>
        <kbd className="hidden shrink-0 rounded border border-surface-border px-1 py-px font-sans text-[10px] sm:block">
          ⌘K
        </kbd>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Search pages"
          className="animate-overlay-in fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-6 pt-[12vh] backdrop-blur-sm"
          onClick={close}
        >
          <div
            className="animate-modal-pop w-full max-w-lg overflow-hidden rounded-2xl border border-surface-border bg-surface shadow-2xl shadow-black/40"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-surface-border px-4">
              <Search className="size-4 shrink-0 text-muted" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setCursor(0);
                }}
                onKeyDown={onInputKeyDown}
                placeholder="Jump to a page…"
                aria-label="Jump to a page"
                className="w-full bg-transparent py-3.5 text-sm outline-none placeholder:text-muted"
              />
            </div>

            <div ref={listRef} className="max-h-80 overflow-y-auto p-1.5">
              {results.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted">No matching page.</p>
              ) : (
                results.map((entry, i) => {
                  const Icon = entry.icon;
                  return (
                    <button
                      key={entry.href}
                      data-index={i}
                      type="button"
                      onMouseEnter={() => setCursor(i)}
                      onClick={() => go(entry.href)}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition ${
                        i === cursor ? "bg-surface-hover text-foreground" : "text-muted"
                      }`}
                    >
                      <Icon className="size-4 shrink-0" />
                      <span className="flex-1 truncate text-foreground">{entry.label}</span>
                      <span className="shrink-0 text-xs text-muted">{entry.group}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
