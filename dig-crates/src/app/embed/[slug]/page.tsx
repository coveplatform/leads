import type { Metadata } from "next";
import { StoreExperience } from "@/components/store-experience/StoreExperience";
import { demoRepository } from "@/data/demo-repository";
import { allowLocalhostEmbeds } from "@/lib/server-env";
import { decodeThemeParam } from "@/lib/store-theme";

type Params = Promise<{ slug: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

const one = (v: string | string[] | undefined): string | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const store = await demoRepository.getStore(slug);
  return { title: store ? `${store.name} crates (embed)` : "Store not found" };
}

/** The iframe document. `mode=overlay` shows a close control; `mode=inline` does not. */
export default async function EmbedPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { slug } = await params;
  const sp = await searchParams;
  const snapshot = await demoRepository.getSnapshot(slug);
  if (!snapshot) {
    return (
      <main className="hub" data-testid="embed-not-found">
        <h1>Store not found</h1>
        <p>This embed points at a store that does not exist in the demo. Check the <code>data-dig-open</code> value.</p>
      </main>
    );
  }
  const mode = one(sp.mode) === "inline" ? "inline" : "overlay";
  return (
    <StoreExperience
      catalog={snapshot}
      presentationMode={mode}
      parentOrigin={one(sp.parentOrigin)}
      allowLocalhost={allowLocalhostEmbeds()}
      themeOverride={decodeThemeParam(one(sp.theme))}
      backHref={`/demo/hosts/${slug}`}
    />
  );
}
