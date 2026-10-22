"use client";
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="font-serif text-2xl">Something broke on our side</h1>
      <p className="muted mt-2 text-sm">{error.message}</p>
      <button type="button" className="btn btn-primary mt-6" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
