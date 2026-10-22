import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ThemeLabLoader } from "@/components/demo/ThemeLabLoader";
import { demoRepository } from "@/data/demo-repository";

type Params = Promise<{ slug: string }>;

export const metadata: Metadata = { title: "Theme lab" };

export default async function ThemeLabPage({ params }: { params: Params }) {
  const { slug } = await params;
  const snapshot = await demoRepository.getSnapshot(slug);
  if (!snapshot) notFound();
  const stores = await demoRepository.listStores();
  return <ThemeLabLoader snapshot={snapshot} presets={stores.map((s) => ({ slug: s.slug, name: s.name, theme: s.theme }))} />;
}
