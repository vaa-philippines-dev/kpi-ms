import { UserRole } from "@/generated/prisma/enums";

export const ROLE_LABELS: Record<string, string> = {
  [UserRole.ADMIN]: "Admin",
  [UserRole.DM]: "DM",
  [UserRole.OPS_MANAGER]: "Ops Manager",
  [UserRole.OM]: "Team Leader",
  [UserRole.SERVICE_MANAGER]: "Service Manager",
  [UserRole.VA]: "VA",
};

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}
