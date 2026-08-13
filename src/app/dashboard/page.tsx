import { PageHeader, ComingSoon } from "@/components/page-header";

export default function DashboardOverviewPage() {
  return (
    <>
      <PageHeader
        title="Overview"
        description="Weekly / monthly performance across all departments."
      />
      <ComingSoon note="Performance summary tiles and status breakdown (On Target / At Risk / Critical) land in Phase 4, once KPI Library data and submissions exist." />
    </>
  );
}
