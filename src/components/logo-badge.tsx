// A plain <img>, not next/image — this is a small fixed-size static PNG
// that doesn't need resizing/format negotiation, and next/image routes it
// through Vercel's Image Optimization pipeline, which has its own quota
// separate from bandwidth/invocations and breaks the logo everywhere once
// exceeded (already happened once, see the Vercel-quota fixes in git log).
export function LogoBadge({ className = "h-8 w-auto" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/logo.png" alt="VAA Philippines" width={1930} height={1242} className={className} />
  );
}
