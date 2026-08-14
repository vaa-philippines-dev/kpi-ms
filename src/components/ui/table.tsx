import { ReactNode } from "react";

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-surface-border">
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

export function TableHead({ children }: { children: ReactNode }) {
  return (
    <thead className="bg-surface text-left text-xs tracking-wide text-muted uppercase">
      {children}
    </thead>
  );
}

export function Th({ children }: { children?: ReactNode }) {
  return <th className="px-4 py-2.5 font-medium">{children}</th>;
}

export function Td({
  children,
  className = "",
  colSpan,
}: {
  children?: ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td colSpan={colSpan} className={`px-4 py-2.5 ${className}`}>
      {children}
    </td>
  );
}

export function Tr({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <tr
      className={`border-t border-surface-border transition hover:bg-surface-hover ${className}`}
    >
      {children}
    </tr>
  );
}
