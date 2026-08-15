import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader, ComingSoon } from "@/components/page-header";
import { Table, TableHead, Th, Td, Tr } from "@/components/ui/table";
import { requireSession } from "@/lib/connection-scope";
import { roleLabel } from "@/lib/roles";

export default async function LoginActivityPage() {
  const session = await requireSession();
  if (session.role !== "ADMIN" && session.role !== "DM") {
    redirect("/dashboard");
  }

  const users = await prisma.user.findMany({
    where:
      session.role === "DM" && session.departmentId
        ? { departmentId: session.departmentId }
        : {},
    orderBy: { lastLogin: "desc" },
    include: { department: true },
  });

  return (
    <>
      <PageHeader
        title="Login Activity"
        description="Sign-in count and last login per user."
      />

      {users.length === 0 ? (
        <ComingSoon note="No users yet." />
      ) : (
        <div className="max-w-3xl">
          <Table>
            <TableHead>
              <tr>
                <Th>Email</Th>
                <Th>Name</Th>
                <Th>Role</Th>
                <Th>Department</Th>
                <Th>Login Count</Th>
                <Th>Last Login</Th>
              </tr>
            </TableHead>
            <tbody>
              {users.map((u) => (
                <Tr key={u.id}>
                  <Td>{u.email}</Td>
                  <Td>{u.name ?? "—"}</Td>
                  <Td className="text-muted">{roleLabel(u.role)}</Td>
                  <Td className="text-muted">{u.department?.name ?? "—"}</Td>
                  <Td className="text-muted">{u.loginCount}</Td>
                  <Td className="text-muted">
                    {u.lastLogin ? u.lastLogin.toLocaleString() : "Never"}
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
