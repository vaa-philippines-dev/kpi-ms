/**
 * A connection's full set of assigned services — its primary `serviceId`
 * plus whatever's in `additionalServices` (see the Connection.additionalServices
 * schema comment). Every query that decides "which KPIs apply to this
 * connection" should filter on this union rather than the primary serviceId
 * alone, so a connection tagged into more than one service (e.g. a CSR VA
 * who also does EA Admin & Business Support work for the same client) sees
 * KPI clusters from all of them.
 */
export function getConnectionServiceIds(connection: {
  serviceId: string | null;
  additionalServices: { serviceId: string }[];
}): string[] {
  const ids = new Set<string>();
  if (connection.serviceId) ids.add(connection.serviceId);
  for (const s of connection.additionalServices) ids.add(s.serviceId);
  return [...ids];
}
