import { prisma } from "@/lib/prisma";
import { PageHeader, ComingSoon } from "@/components/page-header";

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
        <div className="max-w-4xl overflow-x-auto rounded-lg border border-surface-border">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Submitted</th>
                <th className="px-4 py-2 font-medium">VA</th>
                <th className="px-4 py-2 font-medium">Client</th>
                <th className="px-4 py-2 font-medium">Department</th>
                <th className="px-4 py-2 font-medium">Period</th>
                <th className="px-4 py-2 font-medium">Values</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((sub) => (
                <tr key={sub.id} className="border-t border-surface-border align-top">
                  <td className="whitespace-nowrap px-4 py-2 text-muted">
                    {sub.submittedAt.toLocaleString()}
                  </td>
                  <td className="px-4 py-2">{sub.connection.vaName}</td>
                  <td className="px-4 py-2">{sub.connection.clientName}</td>
                  <td className="px-4 py-2 text-muted">
                    {sub.connection.department.name}
                  </td>
                  <td className="px-4 py-2 text-muted">
                    {sub.period} · {sub.periodStart.toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2 text-muted">
                    {sub.records
                      .map((r) => `${r.kpiDefinition.name}: ${r.value}`)
                      .join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
