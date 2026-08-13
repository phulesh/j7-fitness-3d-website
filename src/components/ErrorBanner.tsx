"use client";

export function ErrorBanner({
  message,
  onRetry,
  onDismiss,
}: {
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
}) {
  if (!message) return null;
  return (
    <div className="mt-4 rounded-xl border border-unsupported/30 bg-unsupported/5 px-4 py-3 text-sm text-unsupported">
      <p>{message}</p>
      <div className="mt-2 flex gap-3">
        {onRetry && (
          <button className="underline" onClick={onRetry}>
            Retry
          </button>
        )}
        {onDismiss && (
          <button className="underline" onClick={onDismiss}>
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}
