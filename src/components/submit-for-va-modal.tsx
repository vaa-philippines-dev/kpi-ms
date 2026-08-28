"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, ArrowLeft, ArrowRight, UserRound, TriangleAlert } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/input";

export type SubmitForVaConnection = {
  id: string;
  clientName: string;
  secondaryName: string | null;
};

export type SubmitForVaOption = {
  vaUserId: string;
  vaName: string;
  vaEmail: string;
  departmentId: string;
  departmentName: string;
  connections: SubmitForVaConnection[];
};

/**
 * Note shown right where a TL/DM/Ops Manager/Admin picks the VA they're
 * about to submit for — the one place they can't miss it before entering
 * any numbers. Kept as a named export so the wording can be revised in one
 * place without hunting through the component.
 */
export const SUBMIT_FOR_VA_NOTICE =
  "Note: This submission will be recorded as you submitting on the VA's behalf. Your name will be logged upon audit, please make sure the KPI submission is accurate.\n\nThis is a temporary feature and will be removed in the future. Note that all VAs are required to submit their KPIs on their own.";

/**
 * Lets a TL (OM), DM/Ops Manager, or Admin submit a KPI report on behalf of
 * one of the VAs they manage — the backend (connectionScopeWhere,
 * createSubmission) already allowed this for anyone whose connection scope
 * covers the target connection, but there was previously no UI path to it
 * short of hand-typing /dashboard/submit-kpi?connectionId=. This modal only
 * covers picking *who* and *which connection* — period and KPI-value entry
 * reuse the exact same /dashboard/submit-kpi flow a VA gets, by navigating
 * there once a connection is picked.
 */
export function SubmitForVaModal({
  options,
  showDepartmentFilter,
}: {
  options: SubmitForVaOption[];
  /** Admin's scope spans every department, so it gets an extra filter to
   * narrow the VA list before searching; DM/Ops Manager/OM are already
   * scoped to one department or team, so they don't need it. */
  showDepartmentFilter: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [selectedVaId, setSelectedVaId] = useState<string | null>(null);

  const departments = useMemo(() => {
    const seen = new Map<string, string>();
    for (const o of options) seen.set(o.departmentId, o.departmentName);
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [options]);

  const filteredVas = useMemo(() => {
    const q = query.trim().toLowerCase();
    return options
      .filter((o) => !departmentFilter || o.departmentId === departmentFilter)
      .filter((o) => {
        if (!q) return true;
        return o.vaName.toLowerCase().includes(q) || o.vaEmail.toLowerCase().includes(q);
      })
      .sort((a, b) => a.vaName.localeCompare(b.vaName));
  }, [options, query, departmentFilter]);

  const selectedVa = options.find((o) => o.vaUserId === selectedVaId) ?? null;

  function reset() {
    setQuery("");
    setDepartmentFilter("");
    setSelectedVaId(null);
  }

  function close() {
    setOpen(false);
    reset();
  }

  function pickConnection(connectionId: string) {
    close();
    router.push(`/dashboard/submit-kpi?connectionId=${connectionId}`);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-surface-border px-3 py-2 text-xs font-medium transition hover:bg-surface-hover"
      >
        Submit KPI for VA
      </button>

      <Modal open={open} onClose={close} title="Submit KPI for VA" size="lg">
        {!selectedVa ? (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs whitespace-pre-line text-warning">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              <p>{SUBMIT_FOR_VA_NOTICE}</p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              {showDepartmentFilter && (
                <Select
                  value={departmentFilter}
                  onChange={(e) => setDepartmentFilter(e.target.value)}
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
              )}
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoFocus
                  placeholder="Search by VA name or email…"
                  className="w-full rounded-lg border border-surface-border bg-surface py-2.5 pr-3 pl-9 text-sm outline-none transition focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent/40"
                />
              </div>
            </div>

            <div className="max-h-72 space-y-1 overflow-y-auto">
              {filteredVas.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted">No matching VAs.</p>
              ) : (
                filteredVas.map((va) => (
                  <button
                    key={va.vaUserId}
                    type="button"
                    onClick={() => setSelectedVaId(va.vaUserId)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-surface-border bg-background/40 px-3 py-2.5 text-left text-sm transition hover:border-accent/40 hover:bg-surface-hover"
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <UserRound className="size-4 shrink-0 text-muted" />
                      <span className="min-w-0">
                        <span className="block font-medium">{va.vaName}</span>
                        <span className="block truncate text-xs text-muted">
                          {va.departmentName} · {va.connections.length} connection
                          {va.connections.length === 1 ? "" : "s"}
                        </span>
                      </span>
                    </span>
                    <ArrowRight className="size-4 shrink-0 text-muted" />
                  </button>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setSelectedVaId(null)}
              className="flex items-center gap-1.5 text-xs text-muted hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" />
              Back to VA list
            </button>

            <div>
              <p className="text-sm font-medium">{selectedVa.vaName}</p>
              <p className="text-xs text-muted">
                {selectedVa.vaEmail} · {selectedVa.departmentName}
              </p>
            </div>

            <p className="text-xs text-muted">
              Same VA, different clients can have their own connections — pick the one
              you&apos;re submitting for.
            </p>

            <div className="space-y-1.5">
              {selectedVa.connections.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => pickConnection(c.id)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-surface-border bg-background/40 px-3 py-2.5 text-left text-sm transition hover:border-accent/40 hover:bg-surface-hover"
                >
                  <span>
                    <span className="font-medium">{c.clientName}</span>
                    {c.secondaryName && (
                      <span className="block text-xs text-muted">{c.secondaryName}</span>
                    )}
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-muted" />
                </button>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
