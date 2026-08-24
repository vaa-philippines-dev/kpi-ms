import Link from "next/link";
import { X } from "lucide-react";
import { HeroBackground } from "@/components/hero-background";

/**
 * Presented as a modal over the landing hero — same chrome as AuthModal —
 * but /submit stays its own real URL, since it's the link VAs actually
 * bookmark/get sent directly rather than reach by clicking through "/".
 * Shared with loading.tsx so the route-level fallback matches the real
 * shell exactly (no layout shift when the content swaps in).
 */
export function SubmitShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden px-6 py-16">
      <HeroBackground />
      {/* overflow-y-auto here (not on the card) is load-bearing: with ~9+
          KPIs the card can grow taller than the viewport, and without this
          the fixed overlay just clips it — the title and Submit button
          become unreachable with no way to scroll to them. */}
      <div className="animate-overlay-in fixed inset-0 z-50 flex justify-center overflow-y-auto bg-black/60 p-6 backdrop-blur-sm">
        <Link
          href="/"
          aria-label="Close"
          className="fixed top-5 right-5 z-[60] text-muted transition hover:text-foreground"
        >
          <X className="size-4" />
        </Link>
        <div className="animate-modal-pop relative my-auto w-full max-w-lg rounded-2xl border border-surface-border bg-surface p-8 shadow-2xl shadow-black/40">
          {children}
        </div>
      </div>
    </main>
  );
}
