"use client";

import { ButtonHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

type ButtonVariant = "solid" | "outline";

const VARIANT_STYLES: Record<ButtonVariant, string> = {
  solid: "bg-accent text-accent-foreground hover:opacity-90",
  outline: "border border-surface-border text-foreground hover:bg-surface-hover",
};

export function Button({
  variant = "solid",
  className = "",
  loading,
  disabled,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; loading?: boolean }) {
  // Falls back to the enclosing <form>'s pending state so a plain
  // `<form action={serverAction}><Button type="submit">` gets a spinner for
  // free — `loading` only needs to be passed explicitly for actions
  // triggered outside a form (useTransition, onClick).
  const { pending } = useFormStatus();
  const isLoading = loading ?? (props.type === "submit" && pending);

  return (
    <button
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50 ${VARIANT_STYLES[variant]} ${className}`}
      {...props}
    >
      {isLoading && <Loader2 className="size-4 shrink-0 animate-spin" />}
      {children}
    </button>
  );
}

type ActionTone = "accent" | "danger" | "muted";

const TONE_STYLES: Record<ActionTone, string> = {
  accent: "text-accent",
  danger: "text-danger",
  muted: "text-muted hover:text-foreground",
};

export function TextAction({
  tone = "accent",
  className = "",
  loading,
  disabled,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: ActionTone; loading?: boolean }) {
  const { pending } = useFormStatus();
  const isLoading = loading ?? (props.type === "submit" && pending);

  return (
    <button
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      className={`inline-flex items-center gap-1.5 rounded text-xs transition hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50 disabled:no-underline ${TONE_STYLES[tone]} ${className}`}
      {...props}
    >
      {isLoading && <Loader2 className="size-3 shrink-0 animate-spin" />}
      {children}
    </button>
  );
}
