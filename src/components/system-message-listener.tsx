"use client";

import { useEffect } from "react";
import { useToast } from "@/components/ui/toast";
import type { SystemMessage } from "@/lib/settings";

const STORAGE_KEY = "kpi-ms:system-message-seen";
const POLL_INTERVAL_MS = 60_000;

const TONE_TITLE: Record<SystemMessage["tone"], string> = {
  update: "Update",
  notice: "Notice",
  caution: "Caution",
};

/**
 * Pops the admin-configured system message (System Settings) as a toast.
 * Keyed off `updatedAt` in localStorage, so it shows once per edit instead
 * of nagging on every navigation or reload. Two delivery paths feed the same
 * check: the `message` prop (server-rendered, for a tab that was opened or
 * reloaded after the edit) and a poll (for a tab that was already open when
 * an admin saved) — see /api/notifications/system-message/poll.
 *
 * Polling (not an SSE push) so each check is a millisecond-scale request
 * instead of a connection held open for the life of the tab — the latter is
 * billed as continuous compute time on Vercel and was burning the plan's
 * function-duration quota with tabs left open all day. This banner changes
 * rarely, so a minute between checks is plenty.
 */
export function SystemMessageListener({ message }: { message: SystemMessage }) {
  const { toast } = useToast();

  useEffect(() => {
    showIfUnseen(message, toast);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message.enabled, message.text, message.tone, message.updatedAt]);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/notifications/system-message/poll");
        if (!res.ok || cancelled) return;
        const payload = (await res.json()) as SystemMessage;
        if (!cancelled) showIfUnseen(payload, toast);
      } catch {
        // Ignore — next interval tries again.
      }
    };
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

function showIfUnseen(message: SystemMessage, toast: (message: string, tone?: SystemMessage["tone"], options?: { title?: string; sticky?: boolean }) => void) {
  if (!message.enabled || !message.text) return;
  const seen = window.localStorage.getItem(STORAGE_KEY);
  if (seen === message.updatedAt) return;
  window.localStorage.setItem(STORAGE_KEY, message.updatedAt);
  toast(message.text, message.tone, { title: TONE_TITLE[message.tone], sticky: true });
}
