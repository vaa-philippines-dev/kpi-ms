"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { CsClientTable } from "@/components/cs-client-table";
import { CsStatusTable } from "@/components/cs-status-table";
import { CsTeamTable, type CsTeamRow } from "@/components/cs-team-table";
import { ClientDetail, CsConnectionTable, SpecialistDetail } from "@/components/cs-book-views";
import type { CsBookClientRow, CsBookConnectionRow } from "@/lib/cs-book";
import { CustomerStatus, PerformanceStatus } from "@/generated/prisma/enums";

const STATUS_TILES = [
  { status: PerformanceStatus.ON_TARGET, label: "On Target", style: "border-success/30 text-success" },
  { status: PerformanceStatus.AT_RISK, label: "At Risk", style: "border-warning/30 text-warning" },
  { status: PerformanceStatus.CRITICAL, label: "Critical", style: "border-danger/30 text-danger" },
] as const;

type TileKey = "specialists" | "clients" | "connections" | PerformanceStatus;

type View =
  | { kind: "tile"; tile: TileKey }
  | { kind: "specialist"; id: string }
  | { kind: "client"; id: string };

const TILE_TITLE: Record<TileKey, string> = {
  specialists: "Specialists",
  clients: "Active Clients",
  connections: "Live VA Connections",
  ON_TARGET: "On Target",
  AT_RISK: "At Risk",
  CRITICAL: "Critical",
  NO_DATA: "No Data",
};

const TILE_CLASS = "rounded-xl border bg-surface p-4 text-left transition hover:bg-surface-hover";

function Tile({
  value,
  label,
  style = "border-surface-border",
  muted = true,
  onClick,
}: {
  value: number;
  label: string;
  style?: string;
  muted?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className={`${TILE_CLASS} ${style}`}>
      <div className="text-3xl font-semibold">{value}</div>
      <div className={`mt-1 text-sm ${muted ? "text-muted" : ""}`}>{label}</div>
    </button>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 text-sm font-semibold text-muted uppercase">{children}</h2>;
}

/**
 * The CS Specialist / CS Manager dashboard body. Every tile and table row
 * opens a drill-down in one modal; drilling further (a specialist, then one
 * of their clients) stacks views with a Back button instead of nesting
 * modals.
 */
export function CsDashboard({
  mode,
  clientRows,
  connectionRows,
  teamRows = [],
  pendingCount,
  weekLabel,
}: {
  mode: "specialist" | "manager";
  clientRows: CsBookClientRow[];
  connectionRows: CsBookConnectionRow[];
  /** Manager only — one row per specialist. */
  teamRows?: CsTeamRow[];
  pendingCount: number;
  weekLabel: string;
}) {
  const isManager = mode === "manager";
  const [stack, setStack] = useState<View[]>([]);
  const push = (v: View) => setStack((s) => [...s, v]);
  const close = () => setStack([]);
  const view = stack.at(-1);

  const activeClients = clientRows.filter((r) => r.status === CustomerStatus.ACTIVE);
  // Connection rows are per CS assignment, so a client with two CSs appears
  // under each — match on both.
  const clientConns = (c: CsBookClientRow) =>
    connectionRows.filter((r) => r.customerId === c.customerId && r.csUserId === c.csUserId);
  const openClient = (c: CsBookClientRow) => push({ kind: "client", id: c.id });

  let title = "";
  let body: React.ReactNode = null;
  if (view?.kind === "tile") {
    title = TILE_TITLE[view.tile];
    if (view.tile === "specialists") {
      body = <CsTeamTable rows={teamRows} onOpen={(r) => push({ kind: "specialist", id: r.id })} />;
    } else if (view.tile === "clients") {
      body = (
        <CsClientTable rows={activeClients} showCs={isManager} onOpen={(r) => openClient(r as CsBookClientRow)} />
      );
    } else {
      const tile = view.tile;
      const rows = tile === "connections" ? connectionRows : connectionRows.filter((r) => r.status === tile);
      body = <CsConnectionTable rows={rows} showCs={isManager} />;
    }
  } else if (view?.kind === "specialist") {
    const row = teamRows.find((r) => r.id === view.id);
    if (row) {
      title = row.name;
      body = (
        <SpecialistDetail
          row={row}
          clients={clientRows.filter((c) => c.csUserId === row.id)}
          conns={connectionRows.filter((c) => c.csUserId === row.id)}
          weekLabel={weekLabel}
          onOpenClient={openClient}
        />
      );
    }
  } else if (view?.kind === "client") {
    const client = clientRows.find((c) => c.id === view.id);
    if (client) {
      title = client.clientName;
      body = <ClientDetail client={client} conns={clientConns(client)} weekLabel={weekLabel} showCs={isManager} />;
    }
  }

  return (
    <div className="space-y-8">
      <div className={`grid grid-cols-2 gap-4 sm:grid-cols-4 ${isManager ? "lg:grid-cols-7" : "lg:grid-cols-6"}`}>
        {isManager && (
          <Tile
            value={teamRows.filter((r) => r.isActive).length}
            label="Specialists"
            onClick={() => push({ kind: "tile", tile: "specialists" })}
          />
        )}
        <Tile
          value={activeClients.length}
          label="Active Clients"
          onClick={() => push({ kind: "tile", tile: "clients" })}
        />
        <Tile
          value={connectionRows.length}
          label="Live VA Connections"
          onClick={() => push({ kind: "tile", tile: "connections" })}
        />
        <Link
          href="/dashboard/status-requests"
          className={`${TILE_CLASS} ${pendingCount > 0 ? "border-accent/40 text-accent" : "border-surface-border"}`}
        >
          <div className="text-3xl font-semibold">{pendingCount}</div>
          <div className="mt-1 text-sm">Pending Status Requests</div>
        </Link>
        {STATUS_TILES.map((tile) => (
          <Tile
            key={tile.status}
            value={connectionRows.filter((r) => r.status === tile.status).length}
            label={tile.label}
            style={tile.style}
            muted={false}
            onClick={() => push({ kind: "tile", tile: tile.status })}
          />
        ))}
      </div>

      {isManager ? (
        <div>
          <SectionTitle>Specialists — {weekLabel}</SectionTitle>
          <p className="-mt-2 mb-3 text-xs text-muted">Click a specialist to see their clients.</p>
          <CsTeamTable rows={teamRows} onOpen={(r) => push({ kind: "specialist", id: r.id })} />
        </div>
      ) : (
        <>
          <div>
            <SectionTitle>My Clients</SectionTitle>
            <p className="-mt-2 mb-3 text-xs text-muted">Click a client to see its VAs.</p>
            <CsClientTable rows={clientRows} onOpen={(r) => openClient(r as CsBookClientRow)} />
          </div>
          <div>
            <SectionTitle>VA Connections — {weekLabel}</SectionTitle>
            <CsStatusTable rows={connectionRows} weekLabel={weekLabel} />
          </div>
        </>
      )}

      <Modal open={stack.length > 0} onClose={close} title={title} size="xl">
        {stack.length > 1 && (
          <button
            type="button"
            onClick={() => setStack((s) => s.slice(0, -1))}
            className="mb-4 inline-flex items-center gap-1 text-xs text-accent hover:underline"
          >
            <ArrowLeft className="size-3.5" />
            Back
          </button>
        )}
        {/* Keyed so table search/sort/page state resets per view. */}
        <div key={stack.length}>{body}</div>
      </Modal>
    </div>
  );
}
