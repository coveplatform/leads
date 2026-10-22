import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DemoHostSite } from "@/components/demo/DemoHostSite";
import { InlineEmbedContainer } from "@/components/demo/InlineEmbedContainer";
import { demoRepository } from "@/data/demo-repository";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const store = await demoRepository.getStore(slug);
  return { title: store ? `Dig Our Crates · ${store.name}` : "Shop not found" };
}

/** The shop's dedicated "Dig Our Crates" page with the in-page embed under the shop header. */
export default async function HostCratesPage({ params }: { params: Params }) {
  const { slug } = await params;
  const snapshot = await demoRepository.getSnapshot(slug);
  if (!snapshot) notFound();
  const teasers = snapshot.records.filter((r) => r.staffPick && r.artworkUrl).slice(0, 6);
  return (
    <DemoHostSite store={snapshot.store} teasers={teasers} page="crates">
      <section className="host-section" aria-labelledby="dig-heading">
        <div className="host-wrap">
          <h2 id="dig-heading">Explore our record crates</h2>
          <p className="host-note">The crates below are embedded in this page. On a phone they scroll inside the frame.</p>
          <InlineEmbedContainer slug={snapshot.store.slug} />
          <p className="host-note">
            Without the launcher script, a plain <code>&lt;iframe src=&quot;/embed/{snapshot.store.slug}?mode=inline&quot;&gt;</code> works too (see <code>docs/EMBEDDING.md</code>).
          </p>
        </div>
      </section>
    </DemoHostSite>
  );
}
