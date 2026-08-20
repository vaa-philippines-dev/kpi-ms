import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

export type RateLimitResult = { allowed: boolean; retryAfterMs: number };

/**
 * DB-backed fixed-window rate limiter — there's no Redis/KV in this stack
 * (and the app isn't deployed anywhere yet), so a small Postgres table
 * stands in rather than adding an external dependency. Prunes rows for
 * `key` older than the window on every check, so there's no separate
 * cleanup job to run.
 */
export async function checkRateLimit(
  key: string,
  { max, windowMs }: { max: number; windowMs: number },
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = new Date(now - windowMs);

  await prisma.rateLimitEvent.deleteMany({
    where: { key, createdAt: { lt: windowStart } },
  });

  const count = await prisma.rateLimitEvent.count({
    where: { key, createdAt: { gte: windowStart } },
  });

  if (count >= max) {
    const oldest = await prisma.rateLimitEvent.findFirst({
      where: { key, createdAt: { gte: windowStart } },
      orderBy: { createdAt: "asc" },
    });
    const retryAfterMs = oldest ? oldest.createdAt.getTime() + windowMs - now : windowMs;
    return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 0) };
  }

  await prisma.rateLimitEvent.create({ data: { key } });
  return { allowed: true, retryAfterMs: 0 };
}

/**
 * Best-effort caller IP for rate-limit keys, read from the first hop's
 * `x-forwarded-for`. Fine behind a single reverse proxy (e.g. Vercel) but
 * not a hardened anti-spoofing signal by itself — combined with a
 * per-account/per-connection key wherever one is available.
 */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return h.get("x-real-ip") ?? "unknown";
}

/** Formats a retry-after duration for user-facing rate-limit messages. */
export function formatRetryAfter(ms: number): string {
  const minutes = Math.ceil(ms / 60000);
  if (minutes <= 1) return "a minute";
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.ceil(minutes / 60);
  return hours === 1 ? "an hour" : `${hours} hours`;
}
