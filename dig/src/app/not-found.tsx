import Link from "next/link";
export default function NotFound() {
  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="font-serif text-2xl">Nothing in this crate</h1>
      <p className="muted mt-2 text-sm">That page doesn&apos;t exist.</p>
      <Link href="/" className="btn btn-primary mt-6">
        Back to Dig
      </Link>
    </main>
  );
}
