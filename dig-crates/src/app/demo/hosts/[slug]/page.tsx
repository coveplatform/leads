import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DemoHostSite } from "@/components/demo/DemoHostSite";
import { demoRepository } from "@/data/demo-repository";

type Params = Promise<{ slug: string }>;

export async function generateStaticParams() {
  const stores = await demoRepository.listStores();
  return stores.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const store = await demoRepository.getStore(slug);
  return { title: store ? `${store.name} (demo shop)` : "Shop not found" };
}

export default async function HostHomePage({ params }: { params: Params }) {
  const { slug } = await params;
  const snapshot = await demoRepository.getSnapshot(slug);
  if (!snapshot) notFound();
  const teasers = snapshot.records.filter((r) => r.newArrival && r.artworkUrl).slice(0, 6);
  return <DemoHostSite store={snapshot.store} teasers={teasers} page="home" />;
}
