"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import type { SubmissionNotification } from "@/lib/realtime";

const POLL_INTERVAL_MS = 20_000;

/**
 * Polls /api/notifications/poll and, for every submission in this manager's
 * own department/team scope, pops a toast and refreshes the current route —
 * which re-runs the server components behind the sidebar's Submissions badge
 * and the topbar bell (see layout.tsx / dashboard-topbar.tsx) so those counts
 * go live without a manual reload. Mounted only for the roles the endpoint
 * can ever return anything for (see SUBMISSION_WATCHER_ROLES); every other
 * role skips this entirely.
 *
 * Polling (not an SSE push) so each check is a millisecond-scale request
 * instead of a connection held open for the life of the tab — the latter is
 * billed as continuous compute time on Vercel and was burning the plan's
 * function-duration quota with tabs left open all day.
 *
 * The refresh is debounced: a burst of submissions arriving together
 * collapses into a single router.refresh() instead of one per event, since
 * each refresh re-runs every server component on the current route.
 */
export function SubmissionNotificationListener() {
  const router = useRouter();
  const { toast } = useToast();
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    let since = new Date().toISOString();

    const poll = async () => {
      let data: { events: SubmissionNotification[]; serverTime: string };
      try {
        const res = await fetch(`/api/notifications/poll?since=${encodeURIComponent(since)}`);
        if (!res.ok) return;
        data = await res.json();
      } catch {
        return;
      }
      if (cancelled) return;
      since = data.serverTime;

      for (const payload of data.events) {
        const label = payload.cluster
          ? `${payload.period.toLowerCase()} (${payload.cluster})`
          : payload.period.toLowerCase();
        toast(`${payload.clientName} submitted their ${label} KPI`, "info", { title: "New submission" });
      }
      if (data.events.length > 0) {
        if (refreshTimer.current) clearTimeout(refreshTimer.current);
        refreshTimer.current = setTimeout(() => router.refresh(), 1500);
      }
    };

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
