"use client";

import { Fragment, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  bulkCreateConnectionsFromRows,
  type ConnectionImportRow,
  type ConnectionImportRowResult,
} from "@/app/dashboard/connections/actions";

type Department = { id: string; name: string };
type Service = { id: string; name: string; departmentId: string };

type ParsedRow = ConnectionImportRow & {
  _row: number;
  _valid: boolean;
  _errors: string[];
};

const TEMPLATE_CSV =
  'Client Name,Secondary Name,Department,Service,VA Name,Start Date\n' +
  '"Acme Corp","AcmePh","Customer Service","Billing Support","Jane Doe","2025-01-15"\n' +
  '"Beta LLC","","Operations","Tech Support","","2025-03-01"\n';

function parseLine(line: string): ConnectionImportRow {
  const delim = line.includes("\t") ? "\t" : ",";
  const cols: string[] = [];
  let inQuotes = false;
  let cur = "";
  for (const ch of line) {
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === delim && !inQuotes) {
      cols.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  cols.push(cur.trim());
  return {
    clientName: cols[0] || "",
    secondaryName: cols[1] || "",
    departmentName: cols[2] || "",
    serviceName: cols[3] || "",
    vaName: cols[4] || "",
    startDate: cols[5] || "",
  };
}

/**
 * "Import" button + CSV wizard modal — mirrors legacy's
 * openImportConnections()/vaConnGoPreview()/vaConnRunImport()
 * (AppVAConnections.html:457-712): paste-or-upload CSV with columns
 * Client Name, Secondary Name, Department, Service, VA Name, Start Date,
 * a downloadable template, a validate-then-preview step, and an
 * imported/failed summary after running the import.
 */
export function ImportConnectionsModal({
  departments,
  services,
}: {
  departments: Department[];
  services: Service[];
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"input" | "preview" | "result">("input");
  const [pasted, setPasted] = useState("");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{
    imported: number;
    failed: number;
    results: ConnectionImportRowResult[];
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setStep("input");
    setPasted("");
    setRows([]);
    setResult(null);
  }

  function close() {
    setOpen(false);
    reset();
  }

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = String(e.target?.result ?? "");
      const lines = text.trim().split("\n");
      const first = (lines[0] || "").split(/[,\t]/)[0].trim().toLowerCase();
      const isHeader = first === "client name" || first === "client" || first === "clientname";
      setPasted((isHeader ? lines.slice(1) : lines).join("\n"));
    };
    reader.readAsText(file);
  }

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE_CSV], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "va_connections_template.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }

  function goPreview() {
    const lines = pasted
      .trim()
      .split("\n")
      .filter((l) => l.trim());
    const parsed: ParsedRow[] = lines.map((line, i) => {
      const row = parseLine(line);
      const errors: string[] = [];
      if (!row.clientName) errors.push("Client Name is required");
      if (!row.departmentName) errors.push("Department is required");
      if (!row.serviceName) errors.push("Service is required");
      const dept = departments.find(
        (d) => d.name.toLowerCase().trim() === row.departmentName.toLowerCase().trim(),
      );
      if (row.departmentName && !dept) {
        errors.push(`Department "${row.departmentName}" not found`);
      }
      const svc = services.find(
        (s) =>
          s.name.toLowerCase().trim() === row.serviceName.toLowerCase().trim() &&
          (!dept || s.departmentId === dept.id),
      );
      if (row.serviceName && !svc) {
        errors.push(`Service "${row.serviceName}" not found`);
      }
      if (!row.vaName) errors.push("VA Name is required");
      return { ...row, _row: i + 1, _valid: errors.length === 0, _errors: errors };
    });
    setRows(parsed);
    setStep("preview");
  }

  async function runImport() {
    const validRows = rows.filter((r) => r._valid);
    if (validRows.length === 0) return;
    setImporting(true);
    try {
      const res = await bulkCreateConnectionsFromRows(validRows);
      setResult(res);
      setStep("result");
    } catch (e) {
      setResult({
        imported: 0,
        failed: validRows.length,
        results: [
          {
            row: 0,
            success: false,
            clientName: "",
            message: e instanceof Error ? e.message : "Import failed.",
          },
        ],
      });
      setStep("result");
    } finally {
      setImporting(false);
    }
  }

  const validCount = rows.filter((r) => r._valid).length;
  const invalidCount = rows.length - validCount;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className="gap-1.5"
      >
        <Upload className="size-3.5" />
        Import
      </Button>

      <Modal
        open={open}
        onClose={close}
        title={
          step === "input"
            ? "Import VA Connections"
            : step === "preview"
              ? "Preview — Import VA Connections"
              : "Import Complete"
        }
        size="lg"
      >
        {step === "input" && (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Upload or paste CSV data. Columns:{" "}
              <strong className="text-foreground">
                Client Name, Secondary Name, Department, Service, VA Name, Start Date
              </strong>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {[
                "1. Client Name *",
                "2. Secondary Name",
                "3. Department *",
                "4. Service *",
                "5. VA Name *",
                "6. Start Date",
              ].map((pill) => (
                <span
                  key={pill}
                  className="rounded-full border border-surface-border px-2.5 py-0.5 text-xs text-muted"
                >
                  {pill}
                </span>
              ))}
            </div>

            <div>
              <Button type="button" variant="outline" onClick={downloadTemplate} className="text-xs">
                Download Template
              </Button>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted uppercase">
                Or upload CSV file
              </label>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.txt"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
                className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted uppercase">
                Paste data here (no header row, comma or tab separated)
              </label>
              <textarea
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                rows={8}
                placeholder={
                  "Acme Corp,,Customer Service,Billing Support,Jane Doe,2025-01-15\nBeta LLC,,Operations,Tech Support,,2025-03-01"
                }
                className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 font-mono text-xs outline-none focus:border-accent"
              />
            </div>

            <div className="flex justify-end gap-2 border-t border-surface-border pt-3">
              <Button type="button" variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button type="button" disabled={!pasted.trim()} onClick={goPreview}>
                Preview &amp; Validate →
              </Button>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="rounded-lg border border-surface-border px-4 py-2 text-center">
                <div className="text-lg font-semibold">{rows.length}</div>
                <div className="text-xs text-muted">Total</div>
              </div>
              <div className="rounded-lg border border-success/30 px-4 py-2 text-center">
                <div className="text-lg font-semibold text-success">{validCount}</div>
                <div className="text-xs text-muted">Ready</div>
              </div>
              {invalidCount > 0 && (
                <div className="rounded-lg border border-danger/30 px-4 py-2 text-center">
                  <div className="text-lg font-semibold text-danger">{invalidCount}</div>
                  <div className="text-xs text-muted">Errors</div>
                </div>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto rounded-lg border border-surface-border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface-hover text-xs text-muted">
                  <tr>
                    <th className="px-2 py-1.5 text-left">#</th>
                    <th className="px-2 py-1.5 text-left">Status</th>
                    <th className="px-2 py-1.5 text-left">Client Name</th>
                    <th className="px-2 py-1.5 text-left">Secondary</th>
                    <th className="px-2 py-1.5 text-left">Department</th>
                    <th className="px-2 py-1.5 text-left">Service</th>
                    <th className="px-2 py-1.5 text-left">VA Name</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <Fragment key={r._row}>
                      <tr className="border-t border-surface-border">
                        <td className="px-2 py-1.5 text-xs text-muted">{r._row}</td>
                        <td className="px-2 py-1.5">
                          <Badge tone={r._valid ? "success" : "danger"}>
                            {r._valid ? "Valid" : "Error"}
                          </Badge>
                        </td>
                        <td className="px-2 py-1.5 font-medium">{r.clientName || "—"}</td>
                        <td className="px-2 py-1.5 text-xs text-muted">{r.secondaryName || "—"}</td>
                        <td className="px-2 py-1.5">{r.departmentName || "—"}</td>
                        <td className="px-2 py-1.5">{r.serviceName || "—"}</td>
                        <td className="px-2 py-1.5">{r.vaName || "—"}</td>
                      </tr>
                      {!r._valid && (
                        <tr className="border-t border-surface-border bg-danger/5">
                          <td colSpan={7} className="px-2 py-1.5 text-xs text-danger">
                            {r._errors.map((e) => `⚠ ${e}`).join("   ")}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            <p
              className={`rounded-lg border px-3 py-2 text-xs ${
                invalidCount > 0
                  ? "border-warning/30 text-warning"
                  : "border-success/30 text-success"
              }`}
            >
              {invalidCount > 0
                ? `Error rows will be skipped. ${validCount} rows will be imported.`
                : `All ${validCount} rows are valid and ready.`}
            </p>

            <div className="flex justify-end gap-2 border-t border-surface-border pt-3">
              <Button type="button" variant="outline" onClick={() => setStep("input")}>
                ← Back
              </Button>
              <Button type="button" disabled={validCount === 0} loading={importing} onClick={runImport}>
                Import {validCount} Connection{validCount !== 1 ? "s" : ""}
              </Button>
            </div>
          </div>
        )}

        {step === "result" && result && (
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="rounded-lg border border-success/30 px-4 py-2 text-center">
                <div className="text-lg font-semibold text-success">{result.imported}</div>
                <div className="text-xs text-muted">Imported</div>
              </div>
              {result.failed > 0 && (
                <div className="rounded-lg border border-danger/30 px-4 py-2 text-center">
                  <div className="text-lg font-semibold text-danger">{result.failed}</div>
                  <div className="text-xs text-muted">Failed</div>
                </div>
              )}
            </div>

            {result.results.some((r) => !r.success) && (
              <div className="max-h-56 overflow-y-auto rounded-lg border border-surface-border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-surface-hover text-xs text-muted">
                    <tr>
                      <th className="px-2 py-1.5 text-left">Row</th>
                      <th className="px-2 py-1.5 text-left">Client</th>
                      <th className="px-2 py-1.5 text-left">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.results
                      .filter((r) => !r.success)
                      .map((r, i) => (
                        <tr key={i} className="border-t border-surface-border">
                          <td className="px-2 py-1.5 text-xs text-muted">{r.row}</td>
                          <td className="px-2 py-1.5">{r.clientName || "—"}</td>
                          <td className="px-2 py-1.5">
                            <Badge tone="danger">{r.message || "Failed"}</Badge>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex justify-end gap-2 border-t border-surface-border pt-3">
              <Button type="button" variant="outline" onClick={reset}>
                Import More
              </Button>
              <Button type="button" onClick={close}>
                Done — View Connections
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
