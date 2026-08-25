"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { Input, Select } from "@/components/ui/input";

type Option = { id: string; name: string };

/**
 * Department + search controls for the Users list, driving the server
 * component's `?departmentId=&q=` props via router.replace instead of the
 * old plain `<form method="GET">` + manual "Filter" button. Auto-submits on
 * every change (search is debounced so typing doesn't fire a navigation per
 * keystroke) and dims `children` with a spinner while the new server data
 * is in flight, so switching filters gives visible feedback instead of the
 * page just sitting frozen mid-navigation.
 */
export function UsersFilters({
  isDM,
  departments,
  actions,
  children,
}: {
  isDM: boolean;
  departments: Option[];
  actions: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");

  const departmentId = searchParams.get("departmentId") ?? "";

  function navigate(next: { departmentId?: string; q?: string }) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.departmentId !== undefined) {
      if (next.departmentId) params.set("departmentId", next.departmentId);
      else params.delete("departmentId");
    }
    if (next.q !== undefined) {
      if (next.q) params.set("q", next.q);
      else params.delete("q");
    }
    const qs = params.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  useEffect(() => {
    const current = searchParams.get("q") ?? "";
    if (query === current) return;
    const timer = setTimeout(() => navigate({ q: query }), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {!isDM && (
            <Select
              value={departmentId}
              onChange={(e) => navigate({ departmentId: e.target.value })}
              className="w-40"
              aria-label="Filter by department"
            >
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          )}
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by email or name…"
              className="w-full max-w-xs pl-9"
            />
          </div>
          <span
            className={`flex items-center gap-1.5 text-xs text-muted transition-opacity ${
              isPending ? "opacity-100" : "opacity-0"
            }`}
            aria-live="polite"
          >
            <Loader2 className="size-3.5 shrink-0 animate-spin" />
            Loading…
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-3">{actions}</div>
      </div>

      <div
        className={`transition-opacity duration-150 ${
          isPending ? "pointer-events-none opacity-50" : "opacity-100"
        }`}
      >
        {children}
      </div>
    </div>
  );
}
