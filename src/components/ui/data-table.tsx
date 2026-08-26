"use client";

import { useMemo, useState } from "react";
import { ArrowUp, ArrowDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Table, TableHead, Th, Td, Tr } from "@/components/ui/table";
import { Input, Select } from "@/components/ui/input";

export type DataTableColumn<T> = {
  key: keyof T & string;
  label: string;
  sortable?: boolean;
  /** `true` only counts toward the global search; `"select"` also gets its own dropdown. */
  filterable?: true | "select";
  /** Explicit {value,label} pairs for the select filter — omit to auto-derive from the data. */
  filterOptions?: { value: string; label: string }[];
  filterPlaceholder?: string;
  /** Initial value for a `"select"` filter (e.g. "ACTIVE") — omit to start unfiltered. */
  defaultValue?: string;
  render?: (value: T[keyof T], row: T) => React.ReactNode;
  /**
   * What the global search box matches against for this column, when the
   * raw stored value isn't what's shown on screen (an enum like
   * `END_OF_CONTRACT` rendered as "End of Contract") — without this, typing
   * the visible label finds nothing. Falls back to the raw cell text.
   */
  searchText?: (row: T) => string;
  className?: string;
};

const DEFAULT_LIMIT_OPTIONS = [10, 25, 50, 100];

function cellText<T>(row: T, key: keyof T & string): string {
  const v = row[key];
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return String(v);
  return String(v);
}

/**
 * Client-side sortable / filterable / paginated table — a React port of
 * legacy's reusable `renderDataTable()` (AppCore.html): a global search box,
 * an optional per-column dropdown filter, click-to-sort headers, and a
 * rows-per-page selector with numbered pagination. All data is loaded
 * upfront (as it already is throughout this app) and sliced client-side.
 */
export function DataTable<T>({
  columns,
  data,
  getRowId,
  defaultLimit = 10,
  limitOptions = DEFAULT_LIMIT_OPTIONS,
  emptyMessage = "No records found.",
  defaultSort,
  onRowClick,
}: {
  columns: DataTableColumn<T>[];
  data: T[];
  getRowId: (row: T) => string | number;
  defaultLimit?: number;
  limitOptions?: number[];
  emptyMessage?: string;
  defaultSort?: { key: keyof T & string; dir: "asc" | "desc" };
  onRowClick?: (row: T) => void;
}) {
  const [globalQuery, setGlobalQuery] = useState("");
  const [colFilters, setColFilters] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      columns
        .filter((c) => c.filterable === "select" && c.defaultValue)
        .map((c) => [c.key, c.defaultValue as string]),
    ),
  );
  const [sortKey, setSortKey] = useState<string | null>(defaultSort?.key ?? null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(defaultSort?.dir ?? "asc");
  const [limit, setLimit] = useState(defaultLimit);
  const [page, setPage] = useState(1);

  const selectColumns = columns.filter((c) => c.filterable === "select");

  const selectOptions = useMemo(() => {
    const map = new Map<string, { value: string; label: string }[]>();
    for (const col of selectColumns) {
      if (col.filterOptions) {
        map.set(col.key, col.filterOptions);
        continue;
      }
      const values = Array.from(
        new Set(data.map((row) => cellText(row, col.key))),
      )
        .filter(Boolean)
        .sort();
      map.set(
        col.key,
        values.map((v) => ({ value: v, label: v })),
      );
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, columns]);

  const filtered = useMemo(() => {
    const q = globalQuery.trim().toLowerCase();
    let rows = data;
    if (q) {
      rows = rows.filter((row) =>
        columns
          .filter((c) => c.filterable)
          .map((c) => (c.searchText ? c.searchText(row) : cellText(row, c.key)))
          .join(" ")
          .toLowerCase()
          .includes(q),
      );
    }
    for (const [key, value] of Object.entries(colFilters)) {
      if (!value) continue;
      const needle = value.toLowerCase();
      rows = rows.filter((row) =>
        cellText(row, key as keyof T & string).toLowerCase().includes(needle),
      );
    }
    if (sortKey) {
      rows = [...rows].sort((a, b) => {
        const av = cellText(a, sortKey as keyof T & string);
        const bv = cellText(b, sortKey as keyof T & string);
        const an = parseFloat(av);
        const bn = parseFloat(bv);
        const cmp =
          !isNaN(an) && !isNaN(bn) && av.trim() !== "" && bv.trim() !== ""
            ? an - bn
            : av.localeCompare(bv);
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return rows;
  }, [data, columns, globalQuery, colFilters, sortKey, sortDir]);

  const hasActiveFilters = Boolean(globalQuery) || Object.values(colFilters).some(Boolean);

  function clearFilters() {
    setGlobalQuery("");
    setColFilters({});
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / limit));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * limit;
  const pageRows = filtered.slice(start, start + limit);

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(1);
  }

  // First/last page always shown, plus a window of ±1 around the current page.
  const pageNumbers: (number | "…")[] = [];
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1) {
      pageNumbers.push(p);
    } else if (pageNumbers[pageNumbers.length - 1] !== "…") {
      pageNumbers.push("…");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={globalQuery}
          onChange={(e) => {
            setGlobalQuery(e.target.value);
            setPage(1);
          }}
          placeholder="Search all columns…"
          className="w-full max-w-xs"
        />
        {selectColumns.map((col) => (
          <Select
            key={col.key}
            value={colFilters[col.key] ?? ""}
            onChange={(e) => {
              setColFilters((f) => ({ ...f, [col.key]: e.target.value }));
              setPage(1);
            }}
            className="w-auto"
          >
            <option value="">{col.filterPlaceholder ?? `All ${col.label}`}</option>
            {(selectOptions.get(col.key) ?? []).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        ))}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="text-xs text-accent hover:underline"
          >
            Clear filters
          </button>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <label className="text-xs whitespace-nowrap text-muted">Rows:</label>
          <Select
            value={String(limit)}
            onChange={(e) => {
              setLimit(Number(e.target.value));
              setPage(1);
            }}
            className="w-auto py-1"
          >
            {limitOptions.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <Table>
        <TableHead>
          <tr>
            {columns.map((col) => (
              <Th
                key={col.key}
                onClick={col.sortable ? () => toggleSort(col.key) : undefined}
              >
                <span className="inline-flex items-center gap-1">
                  {col.label}
                  {col.sortable && sortKey === col.key ? (
                    sortDir === "asc" ? (
                      <ArrowUp className="size-3" />
                    ) : (
                      <ArrowDown className="size-3" />
                    )
                  ) : null}
                </span>
              </Th>
            ))}
          </tr>
        </TableHead>
        <tbody>
          {pageRows.length === 0 ? (
            <Tr>
              <Td colSpan={columns.length} className="py-6 text-center text-muted">
                {emptyMessage}
              </Td>
            </Tr>
          ) : (
            pageRows.map((row) => (
              <Tr key={getRowId(row)} onClick={onRowClick ? () => onRowClick(row) : undefined}>
                {columns.map((col) => (
                  <Td key={col.key} className={col.className}>
                    {col.render
                      ? col.render(row[col.key], row)
                      : (cellText(row, col.key) || "—")}
                  </Td>
                ))}
              </Tr>
            ))
          )}
        </tbody>
      </Table>

      <div className="flex items-center justify-between text-xs text-muted">
        <span>
          {filtered.length === 0
            ? "No results"
            : `Showing ${start + 1}–${Math.min(start + limit, filtered.length)} of ${filtered.length}`}
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={currentPage === 1}
              onClick={() => setPage(currentPage - 1)}
              className="flex size-7 items-center justify-center rounded-md text-muted transition hover:bg-surface-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
              aria-label="Previous page"
            >
              <ChevronLeft className="size-4" />
            </button>
            {pageNumbers.map((p, i) =>
              p === "…" ? (
                <span key={`ellipsis-${i}`} className="px-1">
                  …
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPage(p)}
                  className={`flex size-7 items-center justify-center rounded-md transition ${
                    p === currentPage
                      ? "bg-accent text-accent-foreground"
                      : "text-muted hover:bg-surface-hover hover:text-foreground"
                  }`}
                >
                  {p}
                </button>
              ),
            )}
            <button
              type="button"
              disabled={currentPage === totalPages}
              onClick={() => setPage(currentPage + 1)}
              className="flex size-7 items-center justify-center rounded-md text-muted transition hover:bg-surface-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
              aria-label="Next page"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
