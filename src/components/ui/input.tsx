import { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export function Input({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`rounded-lg border border-surface-border bg-transparent px-3 py-2 text-sm outline-none transition focus:border-accent ${className}`}
      {...props}
    />
  );
}

export function Textarea({
  className = "",
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`rounded-lg border border-surface-border bg-transparent px-3 py-2 text-sm outline-none transition focus:border-accent ${className}`}
      {...props}
    />
  );
}

export function Select({
  className = "",
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-accent ${className}`}
      {...props}
    />
  );
}
