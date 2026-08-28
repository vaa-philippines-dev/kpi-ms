"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { CheckCircle2, XCircle, Info, Megaphone, AlertTriangle, X } from "lucide-react";

export type ToastTone = "success" | "error" | "info" | "update" | "notice" | "caution";

type ToastOptions = {
  /** Bold lead line above the message — e.g. an event name or actor. */
  title?: string;
  /** Makes the whole card clickable (e.g. open the thing the toast is about); closes the toast on click. */
  onClick?: () => void;
  /** Skips the auto-dismiss timer — stays until the reader clicks the X. */
  sticky?: boolean;
};

type ToastItem = {
  id: number;
  message: string;
  tone: ToastTone;
  title?: string;
  onClick?: () => void;
  sticky?: boolean;
};

type ToastContextValue = {
  toast: (message: string, tone?: ToastTone, options?: ToastOptions) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_ICON = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  update: Megaphone,
  notice: Info,
  caution: AlertTriangle,
} as const;

const TONE_BADGE = {
  success: "bg-success/10 text-success",
  error: "bg-danger/10 text-danger",
  info: "bg-accent/10 text-accent",
  update: "bg-accent/10 text-accent",
  notice: "bg-foreground/10 text-foreground",
  caution: "bg-warning/10 text-warning",
} as const;

const TONE_BAR = {
  success: "bg-success",
  error: "bg-danger",
  info: "bg-accent",
  update: "bg-accent",
  notice: "bg-foreground",
  caution: "bg-warning",
} as const;

const AUTO_DISMISS_MS = 5000;
// Keep in sync with .animate-toast-out's duration in globals.css.
const EXIT_MS = 180;

/**
 * App-wide toast notifications. Mounted once in the dashboard layout;
 * any client component calls `useToast().toast(message, tone, options)`.
 * Docked bottom-right, Discord-style: icon badge, optional bold title,
 * a progress bar that pauses on hover, and (via `onClick`) a whole-card
 * click target for jumping straight to whatever the toast is about.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, tone: ToastTone = "info", options?: ToastOptions) => {
      const id = nextId.current++;
      setItems((prev) => [
        ...prev,
        {
          id,
          message,
          tone,
          title: options?.title,
          onClick: options?.onClick,
          sticky: options?.sticky,
        },
      ]);
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-4 z-[100] flex flex-col gap-2 sm:inset-x-auto sm:right-4 sm:w-96">
        {items.map((item) => (
          <ToastCard key={item.id} item={item} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const [hovered, setHovered] = useState(false);
  const [leaving, setLeaving] = useState(false);
  // Wall-clock deadline, recomputed on every hover/unhover so pausing on
  // hover actually pauses (not just visually) instead of dismissing under
  // the reader's cursor mid-read.
  const remainingRef = useRef(AUTO_DISMISS_MS);
  // Set for real inside the effect below, before it's ever read (the
  // cleanup only reads it once the effect has already run) — avoids calling
  // the impure Date.now() during render just to seed a ref.
  const deadlineRef = useRef(0);

  const close = useCallback(() => {
    setLeaving(true);
    setTimeout(() => onDismiss(item.id), EXIT_MS);
  }, [item.id, onDismiss]);

  useEffect(() => {
    if (hovered || leaving || item.sticky) return;
    deadlineRef.current = Date.now() + remainingRef.current;
    const timer = setTimeout(close, remainingRef.current);
    return () => {
      clearTimeout(timer);
      remainingRef.current = Math.max(deadlineRef.current - Date.now(), 0);
    };
  }, [hovered, leaving, item.sticky, close]);

  const Icon = TONE_ICON[item.tone];
  const clickable = Boolean(item.onClick);

  return (
    <div
      role="status"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={
        clickable
          ? () => {
              item.onClick?.();
              close();
            }
          : undefined
      }
      className={`group pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-xl border border-surface-border bg-surface p-3 pr-8 shadow-2xl shadow-black/30 ${
        leaving ? "animate-toast-out" : "animate-toast-in"
      } ${clickable ? "cursor-pointer transition-colors hover:bg-surface-hover" : ""}`}
    >
      <div className={`flex size-9 shrink-0 items-center justify-center rounded-full ${TONE_BADGE[item.tone]}`}>
        <Icon className="size-5" />
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        {item.title && <p className="text-sm font-semibold text-foreground">{item.title}</p>}
        <p className="text-sm leading-snug text-muted">{item.message}</p>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          close();
        }}
        aria-label="Dismiss"
        className="absolute top-2 right-2 flex size-5 items-center justify-center rounded-full text-muted opacity-0 transition hover:bg-surface-border hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
      >
        <X className="size-3.5" />
      </button>
      {!item.sticky && (
        <div
          className={`absolute inset-x-0 bottom-0 h-0.5 origin-left ${TONE_BAR[item.tone]} opacity-40 ${
            leaving ? "" : "animate-toast-progress"
          }`}
          style={{ animationPlayState: hovered ? "paused" : "running" }}
        />
      )}
    </div>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
