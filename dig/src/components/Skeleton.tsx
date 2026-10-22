export function CardSkeleton() {
  return (
    <div aria-busy className="grid gap-4 md:grid-cols-[240px_1fr]">
      <div className="skeleton mx-auto aspect-square w-full max-w-[280px]" />
      <div className="space-y-3">
        <div className="skeleton h-8 w-3/4" />
        <div className="skeleton h-5 w-1/2" />
        <div className="skeleton h-4 w-2/3" />
        <div className="skeleton h-24 w-full" />
      </div>
    </div>
  );
}
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div aria-busy className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton h-14 w-full" />
      ))}
    </div>
  );
}
