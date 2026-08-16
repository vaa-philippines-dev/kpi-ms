export function PageHeader({
  title,
  description,
  className = "mb-6",
}: {
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {description && <p className="mt-1 text-sm text-muted">{description}</p>}
    </div>
  );
}

export function ComingSoon({ note }: { note: string }) {
  return (
    <div className="rounded-lg border border-dashed border-surface-border p-8 text-sm text-muted">
      {note}
    </div>
  );
}
