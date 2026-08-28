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

export const DEFAULT_APP_NAME = "VAA KPI Ms";

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

export type SystemMessageTone = "update" | "notice" | "caution";

export const SYSTEM_MESSAGE_KEYS = {
  enabled: "SYSTEM_MESSAGE_ENABLED",
  text: "SYSTEM_MESSAGE_TEXT",
  tone: "SYSTEM_MESSAGE_TONE",
} as const;

export type SystemMessage = {
  enabled: boolean;
  text: string;
  tone: SystemMessageTone;
  /** Latest of the three settings' updatedAt, ISO string — a version marker
   *  so the banner re-shows on an edit but not on every page load. */
  updatedAt: string;
};

/** Site-wide "Update / Notice / Caution" banner, admin-editable from System
 *  Settings and shown as a toast in the bottom-right corner. */
export async function getSystemMessage(): Promise<SystemMessage> {
  const rows = await prisma.setting.findMany({
    where: { key: { in: Object.values(SYSTEM_MESSAGE_KEYS) } },
  });
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
  const updatedAt = rows.reduce(
    (latest, r) => (r.updatedAt > latest ? r.updatedAt : latest),
    new Date(0),
  );
  const tone = byKey[SYSTEM_MESSAGE_KEYS.tone]?.value;
  return {
    enabled: byKey[SYSTEM_MESSAGE_KEYS.enabled]?.value === "true",
    text: byKey[SYSTEM_MESSAGE_KEYS.text]?.value ?? "",
    tone: tone === "update" || tone === "caution" ? tone : "notice",
    updatedAt: updatedAt.toISOString(),
  };
}
