/**
 * KpiDefinition.unit is a free-text display format — historically only ever
 * populated by the legacy sync ("%", "hrs", …), never editable in-app and
 * never actually interpreted, so a KPI like ROAS synced in as "%" just got
 * a "%" concatenated onto a raw ratio (e.g. "3.53%" instead of "3.53").
 * These two values are now structured, editable choices in the KPI Library
 * form: "Number" always renders with exactly 2 decimal places, "%" appends
 * a percent sign, and anything else (a custom unit, or none at all) falls
 * back to the previous plain-number-plus-suffix behavior.
 */
export function formatKpiValue(
  value: number | null | undefined,
  unit: string | null | undefined,
): string {
  if (value === null || value === undefined) return "—";
  if (unit === "Number") return value.toFixed(2);
  if (unit === "%") return `${value}%`;
  return unit ? `${value} ${unit}` : String(value);
}
