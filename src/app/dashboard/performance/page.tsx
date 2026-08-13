import { PageHeader, ComingSoon } from "@/components/page-header";

export default function PerformancePage() {
  return (
    <>
      <PageHeader
        title="Performance"
        description="Actual vs. target per connection, with On Target / At Risk / Critical status."
      />
      <ComingSoon note="Backed by PerformanceSummary, computed on write from submissions in Phase 4." />
    </>
  );
}
