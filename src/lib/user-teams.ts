import type { Prisma } from "@/generated/prisma/client";

/**
 * A VA's full set of team ids — their primary `teamId` plus whatever's in
 * `additionalTeams` (see the User.additionalTeams schema comment). Every
 * query that decides "is this VA on team X" should read this union rather
 * than the primary teamId alone, mirroring getConnectionServiceIds in
 * lib/connection-services.ts one level up.
 */
export function getUserTeamIds(user: {
  teamId: string | null;
  additionalTeams: { teamId: string }[];
}): string[] {
  const ids = new Set<string>();
  if (user.teamId) ids.add(user.teamId);
  for (const t of user.additionalTeams) ids.add(t.teamId);
  return [...ids];
}

/**
 * Which of a VA's teams (home or additional) belongs to `departmentId` — a
 * VA holds at most one team per department (see
 * assertTeamsAndServicesInDepartments in dashboard/users/actions.ts), so
 * this is never ambiguous. Generalizes the same inline check repeated across
 * dashboard/performance/page.tsx, dashboard/submissions/page.tsx,
 * dashboard/submissions/actions.ts, and lib/submission-trend.ts
 * (`vaUser.team?.departmentId === connection.departmentId ? vaUser.team :
 * null`) to also cover additional teams from a hybrid VA's other
 * departments.
 */
export function pickTeamForDepartment<T extends { id: string; departmentId: string }>(
  user: {
    team: T | null;
    additionalTeams: { team: T }[];
  },
  departmentId: string,
): T | null {
  if (user.team?.departmentId === departmentId) return user.team;
  const additional = user.additionalTeams.find((t) => t.team.departmentId === departmentId);
  return additional?.team ?? null;
}

/**
 * "Is this user on team `teamId` at all" — home or additional — for
 * filtering/excluding users by team membership (e.g. a Team page's roster
 * or its "available to add" list).
 */
export function teamMembershipWhere(teamId: string): Prisma.UserWhereInput {
  return { OR: [{ teamId }, { additionalTeams: { some: { teamId } } }] };
}
