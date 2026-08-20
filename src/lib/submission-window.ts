const MANILA_TZ = "Asia/Manila";

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function nowMinutesInManila(now: Date): number {
  const label = new Intl.DateTimeFormat("en-GB", {
    timeZone: MANILA_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  return toMinutes(label);
}

/**
 * Checks whether `now` falls inside a department's [start, end) submission
 * window, in Asia/Manila time. A window with either side unset is treated
 * as unrestricted. Windows that wrap past midnight (start > end) are
 * supported by treating the range as spanning the day boundary.
 */
export function isWithinSubmissionWindow(
  start: string | null,
  end: string | null,
  now: Date,
): boolean {
  if (!start || !end) return true;
  const nowMin = nowMinutesInManila(now);
  const startMin = toMinutes(start);
  const endMin = toMinutes(end);
  if (startMin === endMin) return true;
  if (startMin < endMin) return nowMin >= startMin && nowMin < endMin;
  return nowMin >= startMin || nowMin < endMin;
}

export function formatManilaWindow(start: string, end: string): string {
  return `${start}–${end} (Asia/Manila time)`;
}
