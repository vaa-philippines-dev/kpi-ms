import { InputHTMLAttributes, Ref, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export function Input({
  className = "",
  ref,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return (
    <input
      ref={ref}
      className={`rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent/40 ${className}`}
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
      className={`rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent/40 ${className}`}
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
      className={`rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent/40 ${className}`}
      {...props}
    />
  );
}
