export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-panel border border-dashed border-line px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      {description && <p className="mx-auto mt-1 max-w-sm text-sm text-ink-2">{description}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
