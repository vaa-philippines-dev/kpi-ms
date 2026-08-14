import { UserRole } from "@/generated/prisma/enums";

export const ROLE_LABELS: Record<string, string> = {
  [UserRole.ADMIN]: "Admin",
  [UserRole.DM]: "DM",
  [UserRole.OM]: "OM",
  [UserRole.SERVICE_MANAGER]: "Service Manager",
};

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}
