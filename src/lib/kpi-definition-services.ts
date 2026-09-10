/**
 * A KPI definition's full set of assigned services — its primary
 * `serviceId` plus whatever's in `additionalServices` (see the
 * KpiDefinition.additionalServices schema comment). `serviceId === null`
 * still means "applies department-wide, regardless of service" and is
 * handled separately by callers — this only matters once a KPI has at
 * least one specific service attached.
 */
export function getKpiDefinitionServiceIds(kpi: {
  serviceId: string | null;
  additionalServices: { serviceId: string }[];
}): string[] {
  const ids = new Set<string>();
  if (kpi.serviceId) ids.add(kpi.serviceId);
  for (const s of kpi.additionalServices) ids.add(s.serviceId);
  return [...ids];
}

/** Whether a KPI (department-wide, or scoped to one or more services) applies
 * to a connection with the given assigned service ids. */
export function kpiAppliesToServices(
  kpi: { serviceId: string | null; additionalServices: { serviceId: string }[] },
  connectionServiceIds: string[],
): boolean {
  if (kpi.serviceId === null) return true;
  return getKpiDefinitionServiceIds(kpi).some((id) => connectionServiceIds.includes(id));
}

/**
 * The Prisma `OR` fragment for "this KpiDefinition applies to a connection
 * with these assigned service ids" — department-wide (no primary service),
 * primary service in the set, or any additional service in the set. Shared
 * across every query that filters KpiDefinition by connection service.
 */
export function kpiApplicabilityOR(connectionServiceIds: string[]) {
  return [
    { serviceId: null },
    { serviceId: { in: connectionServiceIds } },
    { additionalServices: { some: { serviceId: { in: connectionServiceIds } } } },
  ];
}
