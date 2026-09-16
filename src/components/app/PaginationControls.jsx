export function PaginationControls({
  page,
  totalCount,
  pageSize = 50,
  hasNextPage,
  hasPreviousPage,
  loading = false,
  onPrevious,
  onNext,
}) {
  const pageCount = Math.max(
    1,
    Math.ceil(totalCount / pageSize),
  );

  if (pageCount <= 1 && page <= 1) {
    return null;
  }

  return (
    <div className="mt-3 flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
      <div className="text-sm text-muted-foreground">
        Page {page} of {pageCount}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onPrevious}
          disabled={loading || !hasPreviousPage}
          className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          Previous
        </button>

        <button
          type="button"
          onClick={onNext}
          disabled={loading || !hasNextPage}
          className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}
