"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Link2, Image as ImageIcon, X } from "lucide-react";
import { Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { sendTicketMessage } from "@/app/dashboard/dev/actions";
import { subscribeToTicketLive } from "@/lib/ticket-live-bus";
import { TICKET_STATUS_LABELS } from "@/lib/ticket-labels";
import type { TicketStatus } from "@/generated/prisma/enums";

type ThreadMessage = {
  id: string;
  senderId: string;
  senderName: string;
  body: string;
  attachmentUrl: string | null;
  createdAt: string;
  pending?: boolean;
};

type SystemEvent = {
  id: string;
  text: string;
  createdAt: string;
};

const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|avif|svg)(\?.*)?$/i;

function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function formatDateLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(iso) === dayKey(today.toISOString())) return "Today";
  if (dayKey(iso) === dayKey(yesterday.toISOString())) return "Yesterday";
  const sameYear = d.getFullYear() === today.getFullYear();
  return d.toLocaleDateString([], sameYear ? { month: "long", day: "numeric" } : { month: "long", day: "numeric", year: "numeric" });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

/**
 * Two-party iMessage-style chat thread for one support ticket — bubble
 * grouping, date separators, and an optimistic composer, adapted from the
 * user's reference app (va-management's InboxView) but to this app's own
 * design tokens and without any of the Slack-shaped features (channels,
 * mentions, pinning, forwarding) that a support thread never needs.
 */
export function TicketThread({
  ticketId,
  currentUserId,
  initialMessages,
  initialStatus,
  className = "h-[70vh]",
}: {
  ticketId: string;
  currentUserId: string;
  initialMessages: ThreadMessage[];
  initialStatus: TicketStatus;
  /** Overrides the thread's own height — pass e.g. "h-full" when embedding inside a taller shell. */
  className?: string;
}) {
  const { toast } = useToast();
  const [messages, setMessages] = useState<ThreadMessage[]>(initialMessages);
  const [systemEvents, setSystemEvents] = useState<SystemEvent[]>([]);
  const [, setStatus] = useState<TicketStatus>(initialStatus);
  const [draft, setDraft] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [showAttachment, setShowAttachment] = useState(false);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  function applyMessage(msg: ThreadMessage) {
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev;
      const pendingIdx = prev.findIndex(
        (m) => m.pending && m.senderId === msg.senderId && m.body === msg.body,
      );
      if (pendingIdx !== -1) {
        const next = [...prev];
        next[pendingIdx] = msg;
        return next;
      }
      return [...prev, msg];
    });
  }

  useEffect(() => {
    return subscribeToTicketLive(ticketId, (event) => {
      if (event.kind === "message" && event.message) {
        applyMessage({ ...event.message, createdAt: event.createdAt });
      } else if (event.kind === "status") {
        setStatus(event.status);
        setSystemEvents((prev) => [
          ...prev,
          {
            id: `status-${event.createdAt}`,
            text: `${event.actorName} set status to ${TICKET_STATUS_LABELS[event.status]}`,
            createdAt: event.createdAt,
          },
        ]);
      }
    });
  }, [ticketId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, systemEvents.length]);

  const timeline = useMemo(() => {
    const items: Array<
      { type: "message"; data: ThreadMessage } | { type: "system"; data: SystemEvent }
    > = [
      ...messages.map((m) => ({ type: "message" as const, data: m })),
      ...systemEvents.map((s) => ({ type: "system" as const, data: s })),
    ];
    items.sort((a, b) => new Date(a.data.createdAt).getTime() - new Date(b.data.createdAt).getTime());
    return items;
  }, [messages, systemEvents]);

  async function handleSend() {
    const body = draft.trim();
    if (!body || sending) return;
    const cleanAttachment = attachmentUrl.trim() || null;
    const tempId = `pending-${currentUserId}-${body}-${Date.now()}`;
    applyMessage({
      id: tempId,
      senderId: currentUserId,
      senderName: "You",
      body,
      attachmentUrl: cleanAttachment,
      createdAt: new Date().toISOString(),
      pending: true,
    });
    setDraft("");
    setAttachmentUrl("");
    setShowAttachment(false);
    setSending(true);
    try {
      const result = await sendTicketMessage(ticketId, body, cleanAttachment);
      applyMessage(result);
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      toast("Couldn't send that message — try again.", "error");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={`flex flex-col rounded-2xl border border-surface-border bg-surface ${className}`}>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="flex flex-col">
          {timeline.length === 0 && (
            <p className="py-8 text-center text-sm text-muted">No messages yet.</p>
          )}
          {timeline.map((item, i) => {
            const prevMessage = [...timeline.slice(0, i)].reverse().find((it) => it.type === "message");
            const nextMessage = timeline.slice(i + 1).find((it) => it.type === "message");
            const showDateSeparator = !prevMessage || dayKey(prevMessage.data.createdAt) !== dayKey(item.data.createdAt);

            if (item.type === "system") {
              return (
                <div key={item.data.id} className="my-3 flex items-center gap-3">
                  <div className="h-px flex-1 bg-surface-border" />
                  <p className="shrink-0 text-[11px] font-medium text-muted">{item.data.text}</p>
                  <div className="h-px flex-1 bg-surface-border" />
                </div>
              );
            }

            const m = item.data;
            const isMe = m.senderId === currentUserId;
            const isGroupedWithPrev =
              !showDateSeparator &&
              prevMessage?.type === "message" &&
              prevMessage.data.senderId === m.senderId &&
              new Date(m.createdAt).getTime() - new Date(prevMessage.data.createdAt).getTime() < 5 * 60 * 1000;
            const isGroupedWithNext =
              nextMessage?.type === "message" &&
              dayKey(nextMessage.data.createdAt) === dayKey(m.createdAt) &&
              nextMessage.data.senderId === m.senderId &&
              new Date(nextMessage.data.createdAt).getTime() - new Date(m.createdAt).getTime() < 5 * 60 * 1000;
            const isImage = m.attachmentUrl && IMAGE_EXTENSIONS.test(m.attachmentUrl);

            return (
              <div key={m.id}>
                {showDateSeparator && (
                  <div className="my-3 flex items-center gap-3">
                    <div className="h-px flex-1 bg-surface-border" />
                    <p className="shrink-0 text-[11px] font-medium text-muted">{formatDateLabel(m.createdAt)}</p>
                    <div className="h-px flex-1 bg-surface-border" />
                  </div>
                )}
                <div className={`flex items-end gap-2 ${isMe ? "flex-row-reverse" : ""} ${isGroupedWithPrev ? "mt-0.5" : "mt-3"}`}>
                  {isMe || isGroupedWithNext ? (
                    <div className="size-7 shrink-0" />
                  ) : (
                    <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-hover text-[10px] font-semibold text-muted">
                      {initials(m.senderName)}
                    </div>
                  )}
                  <div className={`flex max-w-[75%] flex-col gap-0.5 ${isMe ? "items-end" : "items-start"}`}>
                    {!isGroupedWithPrev && (
                      <p className={`px-1 text-[11px] text-muted ${isMe ? "text-right" : ""}`}>
                        {!isMe && <span className="font-medium">{m.senderName} · </span>}
                        {formatTime(m.createdAt)}
                      </p>
                    )}
                    <div
                      className={`rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words ${
                        isMe ? "bg-accent text-accent-foreground" : "bg-surface-hover text-foreground"
                      } ${m.pending ? "opacity-60" : ""}`}
                    >
                      {m.body}
                      {m.attachmentUrl && (
                        <div className="mt-2">
                          {isImage ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={m.attachmentUrl}
                              alt="Attachment"
                              className="max-h-48 max-w-full rounded-lg object-cover"
                            />
                          ) : (
                            <a
                              href={m.attachmentUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`inline-flex items-center gap-1 text-xs underline underline-offset-2 ${
                                isMe ? "text-accent-foreground" : "text-accent"
                              }`}
                            >
                              <Link2 className="size-3" />
                              Attachment
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                    {isMe && m.pending && <p className="px-1 text-[10px] text-muted">Sending…</p>}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t border-surface-border p-3">
        {showAttachment && (
          <div className="mb-2 flex items-center gap-2">
            <ImageIcon className="size-4 shrink-0 text-muted" />
            <input
              value={attachmentUrl}
              onChange={(e) => setAttachmentUrl(e.target.value)}
              placeholder="Paste an image/video link…"
              className="w-full rounded-lg border border-surface-border bg-surface px-3 py-1.5 text-xs outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={() => {
                setShowAttachment(false);
                setAttachmentUrl("");
              }}
              aria-label="Remove attachment"
              className="shrink-0 text-muted hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => setShowAttachment((v) => !v)}
            aria-label="Attach a link"
            className={`flex size-9 shrink-0 items-center justify-center rounded-full transition ${
              showAttachment ? "bg-accent/15 text-accent" : "text-muted hover:bg-surface-hover hover:text-foreground"
            }`}
          >
            <Link2 className="size-4" />
          </button>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            rows={1}
            placeholder="Write a reply…"
            className="max-h-32 min-h-9 w-full resize-none py-2"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!draft.trim() || sending}
            aria-label="Send"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowUp className="size-4" strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
  );
}
