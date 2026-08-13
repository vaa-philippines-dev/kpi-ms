export function PageHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-8">
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
