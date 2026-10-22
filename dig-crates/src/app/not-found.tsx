import Link from "next/link";

export default function NotFound() {
  return (
    <main className="hub">
      <h1>Not found</h1>
      <p>That store or page does not exist in this demo. Only the fictional demo stores are available.</p>
      <p><Link href="/">Back to the demo hub</Link></p>
    </main>
  );
}
