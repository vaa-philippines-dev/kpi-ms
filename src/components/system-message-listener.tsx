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
 * of nagging on every navigation or reload. Two delivery paths feed the same
 * check: the `message` prop (server-rendered, for a tab that was opened or
 * reloaded after the edit) and an SSE feed (for a tab that was already open
 * when an admin saved) — see /api/notifications/system-message/stream.
 */
export function SystemMessageListener({ message }: { message: SystemMessage }) {
  const { toast } = useToast();

  useEffect(() => {
    showIfUnseen(message, toast);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message.enabled, message.text, message.tone, message.updatedAt]);

  useEffect(() => {
    const source = new EventSource("/api/notifications/system-message/stream");
    source.onmessage = (e) => {
      const payload = JSON.parse(e.data) as SystemMessage;
      showIfUnseen(payload, toast);
    };
    return () => source.close();
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
