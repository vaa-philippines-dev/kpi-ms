"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, ChevronDown, Check } from "lucide-react";
import { Select } from "@/components/ui/input";

export type ConnectionOption = {
  id: string;
  clientName: string;
  vaLabel: string;
  departmentId: string;
  departmentName: string;
};

/**
 * Searchable connection picker for Client Detail — replaces a bare native
 * `<select>` listing every connection (unusable once an org has more than a
 * handful) with a type-to-filter combobox plus a department dropdown to
 * narrow the list first. Navigates by pushing `?connectionId=` onto the
 * current URL, same as the old GET form, just without the extra "View"
 * button click.
 */
export function ConnectionCombobox({
  options,
  departments,
  selectedId,
}: {
  options: ConnectionOption[];
  departments: { id: string; name: string }[];
  selectedId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selected = options.find((o) => o.id === selectedId);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return options.filter((o) => {
      if (departmentFilter && o.departmentId !== departmentFilter) return false;
      if (!q) return true;
      return (
        o.clientName.toLowerCase().includes(q) ||
        o.vaLabel.toLowerCase().includes(q) ||
        o.departmentName.toLowerCase().includes(q)
      );
    });
  }, [options, query, departmentFilter]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function select(option: ConnectionOption) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("connectionId", option.id);
    router.push(`${pathname}?${params.toString()}`);
    setOpen(false);
    setQuery("");
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      e.preventDefault();
      setOpen(true);
      return;
    }
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[highlighted]) select(filtered[highlighted]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row" ref={containerRef}>
      <Select
        value={departmentFilter}
        onChange={(e) => {
          setDepartmentFilter(e.target.value);
          setHighlighted(0);
        }}
        className="sm:w-56"
        aria-label="Filter by department"
      >
        <option value="">All departments</option>
        {departments.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </Select>

      <div className="relative flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
        <input
          value={open ? query : selected ? `${selected.clientName} · ${selected.vaLabel}` : ""}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlighted(0);
            if (!open) setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            setQuery("");
            setHighlighted(0);
          }}
          onKeyDown={handleKeyDown}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls={listboxId}
          placeholder="Search by client or VA name…"
          className="w-full rounded-lg border border-surface-border bg-surface py-2.5 pr-9 pl-9 text-sm outline-none transition focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent/40"
        />
        <ChevronDown
          className={`pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted transition ${
            open ? "rotate-180" : ""
          }`}
        />

        {open && (
          <div
            id={listboxId}
            role="listbox"
            className="absolute z-20 mt-1.5 max-h-72 w-full overflow-y-auto rounded-lg border border-surface-border bg-surface py-1 shadow-xl shadow-black/10"
          >
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted">No matching connections.</p>
            ) : (
              filtered.map((o, i) => (
                <button
                  key={o.id}
                  type="button"
                  role="option"
                  aria-selected={o.id === selectedId}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => select(o)}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition ${
                    i === highlighted ? "bg-surface-hover" : "hover:bg-surface-hover"
                  }`}
                >
                  <span>
                    <span className="font-medium">{o.clientName}</span>
                    <span className="text-muted"> · {o.vaLabel}</span>
                    <span className="block text-xs text-muted">{o.departmentName}</span>
                  </span>
                  {o.id === selectedId && <Check className="size-4 shrink-0 text-accent" />}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
