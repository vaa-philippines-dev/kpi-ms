const MONTH_ABBR: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * Parses either ISO ("2026-07-30") or legacy Apps Script ("Jul 04 2022")
 * date strings, shared by both the legacy-KPI-sheet sync and the CMS sync
 * (both source spreadsheets mix these two formats). Builds via Date.UTC
 * explicitly rather than `new Date(string)`, since the latter parses
 * date-only strings in the runtime's local timezone.
 */
export function dateOrNull(v: string | undefined): Date | null {
  if (v === undefined || v === "") return null;
  const trimmed = v.trim();

  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const [, y, m, d] = iso;
    return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  }

  const legacy = trimmed.match(/^([A-Za-z]{3})\s+(\d{1,2})\s+(\d{4})$/);
  if (legacy) {
    const [, mon, d, y] = legacy;
    const monthIndex = MONTH_ABBR[mon.toLowerCase()];
    if (monthIndex === undefined) return null;
    return new Date(Date.UTC(Number(y), monthIndex, Number(d)));
  }

  return null;
}
