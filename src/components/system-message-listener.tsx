"use client";

import { useEffect } from "react";
import { useToast } from "@/components/ui/toast";
import type { SystemMessage } from "@/lib/settings";

const STORAGE_KEY = "kpi-ms:system-message-seen";

const TONE_TITLE: Record<SystemMessage["tone"], string> = {
  update: "Update",
  notice: "Notice",
  caution: "Caution",
};

/**
 * Pops the admin-configured system message (System Settings) as a toast.
 * Keyed off `updatedAt` in localStorage, so it shows once per edit instead
 * of nagging on every navigation or reload.
 *
 * Delivery is entirely server-rendered: the dashboard layout reads
 * getSystemMessage() and passes it down as `message`, so every navigation
 * and every reload already carries the current banner. There used to be a
 * 60s poll alongside it (/api/notifications/system-message/poll, since
 * deleted) covering the one case the prop misses — a tab sitting idle, not
 * navigating, at the moment an admin saves an edit. That bought seconds of
 * freshness for a banner that changes maybe monthly, and cost a function
 * invocation per minute per open tab around the clock, which was ~40% of
 * the project's entire Vercel invocation quota. An idle tab now picks the
 * banner up on its next navigation instead.
 */
export function SystemMessageListener({ message }: { message: SystemMessage }) {
  const { toast } = useToast();

  useEffect(() => {
    showIfUnseen(message, toast);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message.enabled, message.text, message.tone, message.updatedAt]);

  return null;
}

function showIfUnseen(message: SystemMessage, toast: (message: string, tone?: SystemMessage["tone"], options?: { title?: string; sticky?: boolean }) => void) {
  if (!message.enabled || !message.text) return;
  const seen = window.localStorage.getItem(STORAGE_KEY);
  if (seen === message.updatedAt) return;
  window.localStorage.setItem(STORAGE_KEY, message.updatedAt);
  toast(message.text, message.tone, { title: TONE_TITLE[message.tone], sticky: true });
}
