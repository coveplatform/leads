import Link from "next/link";
import { demoRepository, STRESS_STORE_SLUG, getSeedDisclaimer } from "@/data/demo-repository";
import { publicAppOrigin } from "@/lib/server-env";

export const dynamic = "force-static";

export default async function HubPage() {
  const stores = await demoRepository.listStores();
  const origin = publicAppOrigin();
  return (
    <main className="hub">
      <h1>DIG Crates: demo hub</h1>
      <p>
        A white-label record-browsing layer that record shops embed on their own websites. This hub is for developers; customers
        would only ever see a shop&rsquo;s own site with the crates inside it.
      </p>
      <p className="hub-note">{getSeedDisclaimer()} Nothing can be purchased and demo audio is synthetic test sound, not the records.</p>

      <h2>Fictional demo shops</h2>
      <div className="hub-grid">
        {stores.map((s) => (
          <div key={s.slug} className="hub-card">
            <strong>{s.name}</strong>
            <span>{s.description}</span>
            <div className="swatches" aria-hidden="true">
              {[s.theme.background, s.theme.surface, s.theme.foreground, s.theme.accent].map((c) => (
                <span key={c} style={{ background: c }} />
              ))}
            </div>
            <ul>
              <li><Link href={`/demo/hosts/${s.slug}`}>Simulated shop website</Link> (full-screen launcher)</li>
              <li><Link href={`/demo/hosts/${s.slug}/crates`}>Shop&rsquo;s &ldquo;Dig Our Crates&rdquo; page</Link> (inline embed)</li>
              <li><Link href={`/store/${s.slug}`}>Standalone store route</Link></li>
              <li><Link href={`/demo/theme-lab/${s.slug}`}>Theme lab</Link></li>
            </ul>
          </div>
        ))}
      </div>

      <h2>Developer tools</h2>
      <ul>
        <li><Link href="/demo/events">Demo events viewer</Link>: shows the client-side analytics pipeline.</li>
        <li><Link href={`/store/${STRESS_STORE_SLUG}`}>Stress-test store</Link>: 5,000 generated records for virtualisation and filter performance.</li>
        <li><Link href="/store/does-not-exist">Unknown store</Link>: clean 404 behaviour.</li>
      </ul>

      <h2>Read-only demo API</h2>
      <table>
        <thead><tr><th>Route</th><th>Purpose</th></tr></thead>
        <tbody>
          <tr><td><code>/api/demo/stores/basement-wax</code></td><td>Store theme and metadata</td></tr>
          <tr><td><code>/api/demo/stores/basement-wax/crates</code></td><td>Curated crate descriptors</td></tr>
          <tr><td><code>/api/demo/stores/basement-wax/records?crate=basement-wax-house&amp;q=night&amp;sort=recent&amp;limit=24</code></td><td>Paginated, filtered records</td></tr>
          <tr><td><code>/api/demo/stores/basement-wax/related/ba-002</code></td><td>Related records with explanations</td></tr>
        </tbody>
      </table>

      <h2>Embedding</h2>
      <p>Full-screen overlay (recommended first integration):</p>
      <pre>{`<button type="button" data-dig-open="basement-wax">Dig Our Crates</button>\n<script async src="${origin}/embed/dig.js"></script>`}</pre>
      <p>In-page embed:</p>
      <pre>{`<div class="dig-crates-container" data-dig-inline="basement-wax" style="min-height:650px"></div>\n<script async src="${origin}/embed/dig.js"></script>`}</pre>
      <p>See <code>docs/EMBEDDING.md</code> and <code>docs/ARCHITECTURE.md</code> in the repository for origins, theming and the message protocol.</p>
    </main>
  );
}
