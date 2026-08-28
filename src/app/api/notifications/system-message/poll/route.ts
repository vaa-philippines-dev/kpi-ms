import { NextResponse } from "next/server";
import { requireSession } from "@/lib/connection-scope";
import { getSystemMessage } from "@/lib/settings";

export const dynamic = "force-dynamic";

/**
 * Polled read of the admin-configured system message banner (System
 * Settings). Every signed-in user is a recipient. Replaced an SSE stream
 * that held a Vercel function invocation open for the life of every
 * dashboard tab; the client already dedupes by `updatedAt` in localStorage
 * (see system-message-listener.tsx), so a cheap poll is all this needs.
 */
export async function GET() {
  await requireSession();
  return NextResponse.json(await getSystemMessage());
}
