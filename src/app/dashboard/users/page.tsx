import { PageHeader, ComingSoon } from "@/components/page-header";

export default function UsersPage() {
  return (
    <>
      <PageHeader
        title="Users"
        description="Dashboard users and roles (Admin, DM, OM, Service Manager)."
      />
      <ComingSoon note="Users are provisioned on first Google SSO login (Phase 2); role assignment UI lands in Phase 6." />
    </>
  );
}
