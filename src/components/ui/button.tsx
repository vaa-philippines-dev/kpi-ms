import { ButtonHTMLAttributes } from "react";

type ButtonVariant = "solid" | "outline";

const VARIANT_STYLES: Record<ButtonVariant, string> = {
  solid: "bg-accent text-accent-foreground hover:opacity-90",
  outline: "border border-surface-border text-foreground hover:bg-surface-hover",
};

export function Button({
  variant = "solid",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={`rounded-lg px-4 py-2.5 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50 ${VARIANT_STYLES[variant]} ${className}`}
      {...props}
    />
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
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: ActionTone }) {
  return (
    <button
      className={`rounded text-xs transition hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50 disabled:no-underline ${TONE_STYLES[tone]} ${className}`}
      {...props}
    />
  );
}
