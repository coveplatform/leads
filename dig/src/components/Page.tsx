export function Page({
  title,
  actions,
  children,
  intro,
}: {
  title?: string;
  actions?: React.ReactNode;
  intro?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main
      id="main"
      className="mx-auto w-full max-w-3xl px-4 pb-28 pt-5 md:pb-10 md:pl-60 md:pr-8 lg:max-w-5xl"
    >
      {(title || actions) && (
        <header className="mb-4 flex items-start justify-between gap-3">
          {title && <h1 className="font-serif text-2xl md:text-3xl">{title}</h1>}
          {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
        </header>
      )}
      {intro}
      {children}
    </main>
  );
}
