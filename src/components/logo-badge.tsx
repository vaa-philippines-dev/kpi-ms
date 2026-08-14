import Image from "next/image";

/**
 * The logo artwork has white text baked in, so it needs a permanently dark
 * backing regardless of the active site theme — not the `--surface` token,
 * which turns white in light mode and would make the text disappear.
 */
export function LogoBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full border border-white/10 bg-[#0b0f14] px-4 py-2 ${className}`}
    >
      <Image
        src="/logo.webp"
        alt="VAA Philippines"
        width={350}
        height={134}
        className="h-5 w-auto"
        priority
      />
    </span>
  );
}
