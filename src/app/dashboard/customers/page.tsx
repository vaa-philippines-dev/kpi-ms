import { AlertTriangle } from "lucide-react";
import { PageHeader, ComingSoon } from "@/components/page-header";
import { Table, TableHead, Th, Td, Tr } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getEffectiveSession } from "@/lib/view-as";

// Faithful port of legacy's renderCustomersAdmin() (AppUsers.html) — that
// page is a placeholder there too: sample rows, no real backend, pending a
// separate Customers Google Sheet that was never connected. Kept as an
// honest placeholder here rather than silently dropped, since it's a
// feature staff would expect to still see in the nav.
const SAMPLE_CUSTOMERS = [
  {
    id: "CUST_0001",
    name: "Acme Logistics Co.",
    account: "Acme Logistics — Primary",
    status: "Active",
  },
  {
    id: "CUST_0002",
    name: "Brightline Retail Inc.",
    account: "Brightline Retail — Main",
    status: "Active",
  },
  {
    id: "CUST_0003",
    name: "Coastal Realty Group",
    account: "Coastal Realty — East",
    status: "Pending",
  },
  {
    id: "CUST_0004",
    name: "Driftwood Hospitality",
    account: "Driftwood Hospitality — HQ",
    status: "Inactive",
  },
] as const;

const STATUS_TONE = {
  Active: "success",
  Pending: "warning",
  Inactive: "neutral",
} as const;

export default async function CustomersPage() {
  const session = await getEffectiveSession();
  const isAdmin = session?.role === "ADMIN" || session?.role === "EXECUTIVE";

  if (!isAdmin) {
    return (
      <>
        <PageHeader title="Customers" />
        <ComingSoon note="Only admins can view the Customers directory." />
      </>
    );
  }

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <PageHeader title="Customers" description="Customer directory." />
        <Button
          type="button"
          disabled
          title="Not yet connected — data source pending"
          className="opacity-50"
        >
          + New Customer
        </Button>
      </div>

      <div className="max-w-4xl space-y-6">
        <div className="flex items-start gap-3 rounded-lg border border-warning/25 bg-warning/10 p-4">
          <AlertTriangle className="mt-0.5 size-4.5 shrink-0 text-warning" />
          <div>
            <p className="text-sm font-semibold text-warning">Not yet connected</p>
            <p className="mt-0.5 text-xs text-muted">
              This module is a placeholder. The Customers database will be
              sourced from a separate system once connected. The rows below
              are sample data showing the intended table structure.
            </p>
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold text-muted uppercase">
            Customer Directory
          </h2>
          <p className="mb-3 text-xs text-muted">Sample data — not live.</p>
          <Table>
            <TableHead>
              <tr>
                <Th>Customer ID</Th>
                <Th>Customer Name</Th>
                <Th>Account Name</Th>
                <Th>Account Status</Th>
              </tr>
            </TableHead>
            <tbody>
              {SAMPLE_CUSTOMERS.map((c) => (
                <Tr key={c.id}>
                  <Td className="font-mono text-xs text-muted">{c.id}</Td>
                  <Td className="font-medium">{c.name}</Td>
                  <Td className="text-muted">{c.account}</Td>
                  <Td>
                    <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
      </div>
    </>
  );
}
