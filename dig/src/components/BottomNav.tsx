"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Dig", match: (p: string) => p === "/" || p.startsWith("/dig") },
  { href: "/crates", label: "Crates", match: (p: string) => p.startsWith("/crates") },
  { href: "/history", label: "History", match: (p: string) => p.startsWith("/history") },
  { href: "/search", label: "Search", match: (p: string) => p.startsWith("/search") },
  {
    href: "/profile",
    label: "Profile",
    match: (p: string) => p.startsWith("/profile") || p.startsWith("/imports"),
  },
];

export function BottomNav() {
  const path = usePathname() ?? "/";
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t hairline md:inset-y-0 md:right-auto md:w-56 md:border-t-0 md:border-r"
      style={{ background: "var(--card)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="hidden px-5 pt-6 pb-4 md:block">
        <Link href="/" className="font-serif text-2xl tracking-tight">
          DIG.
        </Link>
        <p className="muted mt-1 text-xs">Find something you weren&apos;t looking for.</p>
      </div>
      <ul className="grid grid-cols-5 md:grid-cols-1 md:gap-1 md:px-3">
        {items.map((it) => {
          const active = it.match(path);
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-xs md:min-h-[44px] md:flex-row md:justify-start md:gap-3 md:rounded-md md:px-3 md:text-sm ${active ? "font-semibold" : "muted"}`}
              >
                <span
                  aria-hidden
                  className={`h-1.5 w-1.5 rounded-full md:h-2 md:w-2 ${active ? "bg-terracotta" : "bg-transparent"}`}
                />
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
