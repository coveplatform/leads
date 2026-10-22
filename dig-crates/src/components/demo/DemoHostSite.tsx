import Link from "next/link";
import type { ReactNode } from "react";
import type { RecordItem, Store } from "@/domain/types";
import { formatPrice } from "@/domain/pricing";

interface DemoHostSiteProps {
  store: Store;
  teasers: RecordItem[];
  /** Which page of the simulated site is shown. */
  page: "home" | "crates";
  children?: ReactNode;
}

const COPY: Record<string, { tagline: string; intro: string; about: string }> = {
  "basement-wax": {
    tagline: "Underground club records, Melbourne.",
    intro: "Deep house, dub techno, electro and leftfield 12-inches, hand-picked each week. Open Thursday to Sunday, or dig through everything online.",
    about: "Basement Wax is a fictional shop created to demonstrate DIG Crates. Nothing here is for sale.",
  },
  "sunday-records": {
    tagline: "Jazz, soul, world and ambient for slow mornings.",
    intro: "A calm little shop with a strong coffee machine and a wall of spiritual jazz. New arrivals every Sunday, naturally.",
    about: "Sunday Records is a fictional shop created to demonstrate DIG Crates. Nothing here is for sale.",
  },
  "signal-records": {
    tagline: "Find a different frequency.",
    intro: "Italo, synth pop, nu disco and post-punk, loud and in colour. We ship worldwide and play it louder in store.",
    about: "Signal Records is a fictional shop created to demonstrate DIG Crates. Nothing here is for sale.",
  },
};

/**
 * A plausible, visibly distinct retailer website. The DIG launcher is the only shared element:
 * one button with `data-dig-open` and the tiny `/embed/dig.js` script.
 */
export function DemoHostSite({ store, teasers, page, children }: DemoHostSiteProps) {
  const copy = COPY[store.slug] ?? { tagline: store.headline, intro: store.description, about: "Fictional demo shop." };
  return (
    <div className={`host host-${store.slug}`} data-testid="demo-host" data-host={store.slug}>
      <header className="host-nav">
        <div className="host-wrap host-nav-inner">
          <Link href={`/demo/hosts/${store.slug}`} className="host-brand">{store.name}</Link>
          <nav aria-label="Shop navigation">
            <Link href={`/demo/hosts/${store.slug}`}>Home</Link>
            <Link href={`/demo/hosts/${store.slug}/crates`}>Dig Our Crates</Link>
            <a href="#new-in">New in</a>
            <a href="#about">About</a>
          </nav>
        </div>
      </header>

      {page === "home" ? (
        <section className="host-hero">
          <div className="host-wrap">
            <h1>{copy.tagline}</h1>
            <p>{copy.intro}</p>
            <button type="button" className="host-cta" data-dig-open={store.slug} data-testid="host-launcher">
              Dig Our Crates
            </button>
            <p className="host-note" style={{ marginTop: 16 }}>
              Opens our crates right here on the site. Prefer a page? <Link href={`/demo/hosts/${store.slug}/crates`}>Browse the embedded crates</Link>.
            </p>
          </div>
        </section>
      ) : null}

      {children}

      <section className="host-section" id="new-in">
        <div className="host-wrap">
          <h2>New in this week</h2>
          <div className="host-grid">
            {teasers.map((r) => (
              <article key={r.id} className="host-product">
                {r.artworkUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- fixture SVG
                  <img src={r.artworkUrl} alt={`${r.artist} – ${r.title}`} loading="lazy" width={330} height={330} />
                ) : (
                  <div className="ph">No cover</div>
                )}
                <strong>{r.title}</strong>
                <span>{r.artist}</span>
                <span className="price">{formatPrice(r.priceMinor, r.currency)}</span>
              </article>
            ))}
          </div>
          <p className="host-note">Product teasers are plain links on a real shop site. In this demo they are static.</p>
        </div>
      </section>

      <footer className="host-footer" id="about">
        <div className="host-wrap">
          <p>{copy.about} Stores, products, artwork and music in this demonstration are fictional.</p>
          <p>
            <Link href="/">DIG Crates demo hub</Link> · <Link href={`/demo/theme-lab/${store.slug}`}>Theme lab</Link>
          </p>
        </div>
      </footer>
      <script async src="/embed/dig.js" />
    </div>
  );
}
