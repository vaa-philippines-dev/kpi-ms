"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import type { SubmissionNotification } from "@/lib/realtime";

/**
 * Opens the SSE feed from /api/notifications/stream and, for every
 * submission in this manager's own department/team scope, pops a toast and
 * refreshes the current route — which re-runs the server components behind
 * the sidebar's Submissions badge and the topbar bell (see layout.tsx /
 * dashboard-topbar.tsx) so those counts go live without a manual reload.
 * Mounted only for the roles the stream can ever notify (see
 * WATCHER_ROLES in the route handler); every other role skips the
 * connection entirely.
 */
export function SubmissionNotificationListener() {
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    const source = new EventSource("/api/notifications/stream");

    source.onmessage = (e) => {
      const payload = JSON.parse(e.data) as SubmissionNotification;
      const label = payload.cluster ? `${payload.period.toLowerCase()} (${payload.cluster})` : payload.period.toLowerCase();
      toast(`${payload.clientName} submitted their ${label} KPI`, "info");
      router.refresh();
    };

    return () => source.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
