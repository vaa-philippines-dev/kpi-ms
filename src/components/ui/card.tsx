import { ReactNode } from "react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-surface-border bg-surface ${className}`}
    >
      {children}
    </div>
  );
}
