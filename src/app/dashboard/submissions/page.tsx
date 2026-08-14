import { prisma } from "@/lib/prisma";
import { PageHeader, ComingSoon } from "@/components/page-header";
import { Table, TableHead, Th, Td, Tr } from "@/components/ui/table";

export default async function SubmissionsPage() {
  const submissions = await prisma.submission.findMany({
    orderBy: { submittedAt: "desc" },
    take: 50,
    include: {
      connection: { include: { department: true } },
      records: { include: { kpiDefinition: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="Submissions"
        description="Raw KPI submissions received from the public portal."
      />

      {submissions.length === 0 ? (
        <ComingSoon note="No submissions yet — they'll show up here once VAs start using the public form at /submit." />
      ) : (
        <div className="max-w-4xl">
          <Table>
            <TableHead>
              <tr>
                <Th>Submitted</Th>
                <Th>VA</Th>
                <Th>Client</Th>
                <Th>Department</Th>
                <Th>Period</Th>
                <Th>Values</Th>
              </tr>
            </TableHead>
            <tbody>
              {submissions.map((sub) => (
                <Tr key={sub.id} className="align-top">
                  <Td className="whitespace-nowrap text-muted">
                    {sub.submittedAt.toLocaleString()}
                  </Td>
                  <Td>{sub.connection.vaName}</Td>
                  <Td>{sub.connection.clientName}</Td>
                  <Td className="text-muted">{sub.connection.department.name}</Td>
                  <Td className="text-muted">
                    {sub.period} · {sub.periodStart.toLocaleDateString()}
                  </Td>
                  <Td className="text-muted">
                    {sub.records
                      .map((r) => `${r.kpiDefinition.name}: ${r.value}`)
                      .join(", ")}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </>
  );
}
