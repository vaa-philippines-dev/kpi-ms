import { PageHeader, ComingSoon } from "@/components/page-header";

export default function SubmissionsPage() {
  return (
    <>
      <PageHeader
        title="Submissions"
        description="Raw KPI submissions received from the public portal."
      />
      <ComingSoon note="Populated once the public submission form (Phase 3) is writing Submission + SubmissionRecord rows." />
    </>
  );
}
