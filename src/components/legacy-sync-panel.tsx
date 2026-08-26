"use client";

import { SyncButton } from "@/components/sync-button";

export function LegacySyncPanel() {
  return (
    <div className="space-y-4">
      <SyncButton label="Sync Reference Data (Departments, Services, Teams, Users, Connections, KPI Library, KPI Config, Interventions, Settings)" endpoint="/api/legacy-sync/reference" />
      <SyncButton label="Sync Historical Performance (KPI_Weekly_Summary / KPI_Monthly_Summary)" endpoint="/api/legacy-sync/performance" />
    </div>
  );
}
