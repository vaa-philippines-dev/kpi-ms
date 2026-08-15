import { prisma } from "@/lib/prisma";

export const DEFAULT_INTERVENTION_TYPES = [
  "Coaching",
  "Training",
  "Performance Plan",
  "Process Change",
  "Escalation",
  "1-on-1 Meeting",
];

export async function getInterventionTypes(): Promise<string[]> {
  const setting = await prisma.setting.findUnique({
    where: { key: "INTERVENTION_TYPES" },
  });
  if (!setting?.value) return DEFAULT_INTERVENTION_TYPES;
  return setting.value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export const DEFAULT_APP_NAME = "VAA KPI Monitoring System";

export async function getAppName(): Promise<string> {
  const setting = await prisma.setting.findUnique({ where: { key: "APP_NAME" } });
  return setting?.value || DEFAULT_APP_NAME;
}

/** 0=Sunday..6=Saturday. Defaults to Monday (1), matching legacy's default. */
export async function getWeekStartDay(): Promise<number> {
  const setting = await prisma.setting.findUnique({
    where: { key: "WEEK_START_DAY" },
  });
  const parsed = setting?.value ? Number(setting.value) : NaN;
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 6 ? parsed : 1;
}
