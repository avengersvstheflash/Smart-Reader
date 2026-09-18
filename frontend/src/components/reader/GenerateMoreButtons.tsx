export function GenerateMoreButtons({
  remaining,
  onGenerate,
  counts = [1, 3, 5, 10],
  busy = false,
  disabled = false,
  onStop,
}: {
  remaining: number;
  onGenerate: (n: number) => void;
  counts?: number[];
  busy?: boolean;
  disabled?: boolean;
  onStop?: () => void;
}) {
  if (remaining === 0) {
    return (
      <p className="text-caption text-ink-muted italic m-0 select-none">
        All chapters generated.
      </p>
    );
  }

  const isGroupDisabled = disabled || busy;

  return (
    <div
      role="group"
      aria-label="Generate more chapters"
      aria-busy={busy}
      className="inline-flex items-center gap-1.5 flex-wrap"
    >
      <span className="sr-only">Generate more chapters</span>

      {counts.map((n) => {
        const isCountExceeded = n > remaining;
        const isDisabled = isGroupDisabled || isCountExceeded;
        const isPrimary = n === 1;

        return (
          <button
            key={n}
            type="button"
            disabled={isDisabled}
            title={isCountExceeded ? `Only ${remaining} left` : undefined}
            onClick={() => onGenerate(n)}
            className={`min-h-[36px] px-3 py-1.5 text-ui-sm font-medium rounded-md transition-all select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              isPrimary
                ? 'bg-brand text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed'
                : 'border border-line bg-surface text-ink hover:bg-subtle disabled:opacity-50 disabled:cursor-not-allowed'
            }`}
          >
            +{n}
          </button>
        );
      })}

      {busy && (
        <button
          type="button"
          onClick={onStop}
          className="min-h-[36px] px-3 py-1.5 text-ui-sm font-medium rounded-md border border-line bg-surface text-ink-muted hover:text-ink hover:bg-subtle transition-colors select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Stop
        </button>
      )}
    </div>
  );
}
