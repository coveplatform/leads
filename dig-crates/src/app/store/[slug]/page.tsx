import type { Metadata } from "next";
import { notFound } from "next/navigation";
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
  return { title: store ? `${store.name} crates` : "Store not found" };
}

export default async function StorePage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { slug } = await params;
  const sp = await searchParams;
  const snapshot = await demoRepository.getSnapshot(slug);
  if (!snapshot) notFound();
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const val = one(v);
    if (val !== null) search.set(k, val);
  }
  return (
    <StoreExperience
      catalog={snapshot}
      presentationMode="standalone"
      themeOverride={decodeThemeParam(one(sp.theme))}
      allowLocalhost={allowLocalhostEmbeds()}
      initialUrl={{ crate: one(sp.crate), view: one(sp.view), record: one(sp.record), q: one(sp.q), search: search.toString() }}
      backHref={`/demo/hosts/${slug}`}
    />
  );
}
