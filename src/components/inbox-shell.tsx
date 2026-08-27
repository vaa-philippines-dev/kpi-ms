"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, Search } from "lucide-react";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { subscribeToTicketLive } from "@/lib/ticket-live-bus";
import {
  TICKET_STATUS_LABELS,
  TICKET_PRIORITY_LABELS,
  TICKET_PRIORITY_TONE,
} from "@/lib/ticket-labels";
import { TicketCategory, TicketPriority, TicketStatus } from "@/generated/prisma/enums";

export type InboxTicketRow = {
  id: string;
  subject: string;
  requesterId: string;
  requesterName: string;
  requesterRole: string;
  departmentName: string | null;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  updatedAt: string;
  lastMessage: { body: string; senderId: string } | null;
};

const STATUS_TABS = ["ALL", "NEEDS_REPLY", ...Object.values(TicketStatus)] as const;
type StatusTab = (typeof STATUS_TABS)[number];

const STATUS_TAB_LABELS: Record<StatusTab, string> = {
  ALL: "All",
  NEEDS_REPLY: "Needs reply",
  ...TICKET_STATUS_LABELS,
};

function needsReply(row: Pick<InboxTicketRow, "status" | "requesterId" | "lastMessage">): boolean {
  if (row.status === TicketStatus.CLOSED) return false;
  return !row.lastMessage || row.lastMessage.senderId === row.requesterId;
}

// Deterministic per-ticket accent, cycling through the app's 8-hue series
// palette (dataviz-validated, already used for KPI trend lines — see
// client-kpi-trend-chart.tsx) so the conversation list reads as
// colorful/scannable like a real chat app instead of a wall of identical
// grey circles. Full class strings, not string-interpolated — Tailwind only
// generates classes it can find literally in source.
const AVATAR_TONE_CLASSES = [
  "bg-series-1/15 text-series-1",
  "bg-series-2/15 text-series-2",
  "bg-series-3/15 text-series-3",
  "bg-series-4/15 text-series-4",
  "bg-series-5/15 text-series-5",
  "bg-series-6/15 text-series-6",
  "bg-series-7/15 text-series-7",
  "bg-series-8/15 text-series-8",
] as const;

function avatarToneClass(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_TONE_CLASSES[hash % AVATAR_TONE_CLASSES.length];
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

/**
 * Messenger-style shell for the admin Inbox: a conversation list on the
 * left (search + department/status filters, colored avatars, unread-style
 * "needs reply" dot) and the selected ticket's thread on the right via
 * `children` — the [id] route renders TicketThread/TicketMetaPanel there,
 * the bare /inbox route renders an empty state. Live-patches whichever row
 * is currently open (via ticket-live-bus, the same per-tab fan-out
 * TicketThread itself uses) so the preview/order stays current while
 * chatting instead of only refreshing once you navigate away — every other
 * row still updates the normal way, via TicketNotificationListener's
 * router.refresh() re-running the server-fetched list in inbox/layout.tsx.
 */
export function InboxShell({ tickets, children }: { tickets: InboxTicketRow[]; children: ReactNode }) {
  const pathname = usePathname();
  const selectedId = pathname.startsWith("/dashboard/dev/inbox/")
    ? pathname.slice("/dashboard/dev/inbox/".length)
    : null;
  const hasSelection = selectedId !== null;

  const [rows, setRows] = useState(tickets);
  // Re-sync from the freshly server-fetched list (a new `tickets` reference
  // arrives whenever TicketNotificationListener's router.refresh() re-runs
  // inbox/layout.tsx) without an effect — adjusting state during render per
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes.
  const [syncedTickets, setSyncedTickets] = useState(tickets);
  if (tickets !== syncedTickets) {
    setSyncedTickets(tickets);
    setRows(tickets);
  }

  useEffect(() => {
    if (!selectedId) return;
    return subscribeToTicketLive(selectedId, (event) => {
      if (event.kind === "message" && event.message) {
        setRows((prev) => {
          const next = prev.map((r) =>
            r.id === selectedId
              ? {
                  ...r,
                  updatedAt: event.createdAt,
                  status: event.status,
                  lastMessage: { body: event.message!.body, senderId: event.message!.senderId },
                }
              : r,
          );
          next.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
          return next;
        });
      } else if (event.kind === "status") {
        setRows((prev) => prev.map((r) => (r.id === selectedId ? { ...r, status: event.status } : r)));
      }
    });
  }, [selectedId]);

  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("ALL");
  const [statusTab, setStatusTab] = useState<StatusTab>("ALL");

  const departmentOptions = useMemo(() => {
    const names = new Set<string>();
    let hasNone = false;
    for (const r of rows) {
      if (r.departmentName) names.add(r.departmentName);
      else hasNone = true;
    }
    return [...[...names].sort(), ...(hasNone ? ["No department"] : [])];
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !r.subject.toLowerCase().includes(q) && !r.requesterName.toLowerCase().includes(q)) return false;
      if (department !== "ALL") {
        const rowDept = r.departmentName ?? "No department";
        if (rowDept !== department) return false;
      }
      if (statusTab === "NEEDS_REPLY") return needsReply(r);
      if (statusTab !== "ALL") return r.status === statusTab;
      return true;
    });
  }, [rows, search, department, statusTab]);

  return (
    <div className="flex h-[75vh] min-h-[560px] overflow-hidden rounded-2xl border border-surface-border bg-surface">
      <aside
        className={`h-full min-h-0 w-full min-w-0 shrink-0 flex-col border-surface-border md:w-80 md:border-r lg:w-96 ${
          hasSelection ? "hidden md:flex" : "flex"
        }`}
      >
        <div className="shrink-0 space-y-2.5 border-b border-surface-border p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tickets or requesters…"
              className="w-full pl-8 text-xs"
            />
          </div>
          <Select value={department} onChange={(e) => setDepartment(e.target.value)} className="w-full text-xs">
            <option value="ALL">All departments</option>
            {departmentOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
          <div className="flex flex-wrap gap-1">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setStatusTab(tab)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                  statusTab === tab
                    ? "bg-accent text-accent-foreground"
                    : "bg-surface-hover text-muted hover:text-foreground"
                }`}
              >
                {STATUS_TAB_LABELS[tab]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="p-6 text-center text-xs text-muted">No tickets match.</p>
          ) : (
            filtered.map((row) => {
              const unread = needsReply(row);
              const active = row.id === selectedId;
              return (
                <Link
                  key={row.id}
                  href={`/dashboard/dev/inbox/${row.id}`}
                  className={`flex items-start gap-2.5 border-b border-surface-border/60 px-3 py-3 transition ${
                    active ? "bg-surface-hover" : "hover:bg-surface-hover/60"
                  }`}
                >
                  <div
                    className={`relative flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${avatarToneClass(row.id)}`}
                  >
                    {initials(row.requesterName)}
                    {row.priority === TicketPriority.URGENT && (
                      <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-danger ring-2 ring-surface" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className={`truncate text-sm ${unread ? "font-semibold text-foreground" : "font-medium text-foreground"}`}>
                        {row.requesterName}
                      </p>
                      <span className="shrink-0 text-[10px] text-muted">{relativeTime(row.updatedAt)}</span>
                    </div>
                    <p className="truncate text-xs text-muted">{row.subject}</p>
                    {row.lastMessage && (
                      <p className={`mt-0.5 truncate text-xs ${unread ? "text-foreground" : "text-muted"}`}>
                        {row.lastMessage.senderId === row.requesterId ? "" : "You: "}
                        {row.lastMessage.body}
                      </p>
                    )}
                    <div className="mt-1 flex items-center gap-1.5">
                      {unread && <span className="size-1.5 shrink-0 rounded-full bg-accent" />}
                      <span className="text-[10px] text-muted">{row.departmentName ?? "No department"}</span>
                      {row.priority !== TicketPriority.NORMAL && (
                        <Badge tone={TICKET_PRIORITY_TONE[row.priority]}>{TICKET_PRIORITY_LABELS[row.priority]}</Badge>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </aside>

      <div
        className={`h-full min-h-0 min-w-0 flex-1 flex-col overflow-y-auto ${
          hasSelection ? "flex" : "hidden md:flex"
        }`}
      >
        {hasSelection && (
          <Link
            href="/dashboard/dev/inbox"
            className="flex shrink-0 items-center gap-1.5 border-b border-surface-border px-3 py-2.5 text-xs font-medium text-muted hover:text-foreground md:hidden"
          >
            <ArrowLeft className="size-3.5" />
            Back to Inbox
          </Link>
        )}
        {children}
      </div>
    </div>
  );
}
