import { PageHeader, ComingSoon } from "@/components/page-header";

export default function ConnectionsPage() {
  return (
    <>
      <PageHeader
        title="Connections"
        description="VA ↔ client connections, sourced from the Workforce Management system."
      />
      <ComingSoon note="Backed by a local Connection table until Phase 5 wires up the real Workforce Management integration (see lib/wfm/)." />
    </>
  );
}
