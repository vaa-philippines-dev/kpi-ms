import Image from "next/image";

export function LogoBadge({ className = "h-8 w-auto" }: { className?: string }) {
  return (
    <Image
      src="/logo.png"
      alt="VAA Philippines"
      width={1930}
      height={1242}
      className={className}
      priority
    />
  );
}
