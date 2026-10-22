import "./_env.mts";
// Writes the seed QA CSV required by the blueprint (§14) from the catalogue module.
import fs from "node:fs";
import { DEMO_ARTISTS, DEMO_RECORDINGS, DEMO_LABELS } from "../src/data/demo-catalogue";
import { deriveEdges } from "../src/lib/db/seed";

const edges = deriveEdges();
const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const rows = [
  [
    "recording",
    "artist",
    "release",
    "label",
    "year",
    "source_url",
    "playback_supported",
    "relation_type",
    "relation_target",
    "provenance",
    "licence_status",
    "last_checked",
  ].join(","),
];
for (const r of DEMO_RECORDINGS) {
  const artist = DEMO_ARTISTS.find((a) => a.key === r.artist)?.name ?? "";
  const label = r.label ? (DEMO_LABELS.find((l) => l.key === r.label)?.name ?? "") : "";
  const q = encodeURIComponent(`${artist} ${r.title}`);
  const mine = edges.filter((e) => e.from === r.key || e.to === r.key);
  const first = mine[0];
  rows.push(
    [
      r.title + (r.disambiguation ? ` (${r.disambiguation})` : ""),
      artist,
      r.release ?? "",
      label,
      r.year ?? "",
      `https://www.youtube.com/results?search_query=${q}`,
      "external_search_only",
      first?.relation ?? "",
      first ? (first.from === r.key ? first.to : first.from) : "",
      first?.provenance ?? "",
      "metadata_only_demo",
      "2026-10-23",
    ]
      .map(esc)
      .join(","),
  );
}
fs.mkdirSync("docs", { recursive: true });
fs.writeFileSync("docs/seed-qa.csv", rows.join("\n"));
console.log(`wrote docs/seed-qa.csv (${DEMO_RECORDINGS.length} rows)`);
