import { LogoBadge } from "@/components/logo-badge";

// A flex wrapper centers correctly regardless of the underlying <img>'s
// display type — next/image renders `display: block`, which a `text-center`
// ancestor has no effect on (that only centers inline content).
export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <LogoBadge className="h-10" />
      <p className="text-xs font-medium tracking-[0.2em] text-muted uppercase">
        VAA Philippines
      </p>
    </div>
  );
}
