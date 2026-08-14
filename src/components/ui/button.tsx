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
      className={`rounded-lg px-4 py-2.5 text-sm font-medium transition ${VARIANT_STYLES[variant]} ${className}`}
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
      className={`text-xs transition hover:underline ${TONE_STYLES[tone]} ${className}`}
      {...props}
    />
  );
}
