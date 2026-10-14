export function FormAlert({ error, notice }: { error?: string; notice?: string }) {
  if (error)
    return (
      <p role="alert" className="rounded-control bg-danger/10 px-3 py-2.5 text-sm text-danger">
        {error}
      </p>
    );
  if (notice)
    return (
      <p role="status" className="rounded-control bg-accent-soft px-3 py-2.5 text-sm text-ink">
        {notice}
      </p>
    );
  return null;
}
