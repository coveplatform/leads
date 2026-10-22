import type { RecordCard } from "@/domain/types";
import { hueOf } from "@/lib/client/format";

/** Artwork or an honest neutral placeholder (no artwork rights assumed). */
export function Sleeve({
  card,
  size = "lg",
  className = "",
}: {
  card: RecordCard;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const dim = size === "lg" ? "w-full aspect-square" : size === "md" ? "h-24 w-24" : "h-12 w-12";
  const hue = hueOf(card.recording.id);
  const art = card.release?.artworkUrl;
  if (art) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={art}
        alt={`Artwork for ${card.recording.title}`}
        className={`sleeve object-cover ${dim} ${className}`}
      />
    );
  }
  const initials = (card.artist?.name ?? card.recording.title)
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div
      role="img"
      aria-label={`No artwork available for ${card.recording.title}`}
      className={`sleeve relative flex items-center justify-center overflow-hidden ${dim} ${className}`}
      style={{
        background: `linear-gradient(135deg, hsl(${hue} 18% 28%), hsl(${(hue + 40) % 360} 22% 16%))`,
      }}
    >
      <div aria-hidden className="absolute inset-[18%] rounded-full border border-white/15" />
      <div aria-hidden className="absolute inset-[30%] rounded-full border border-white/10" />
      <div
        aria-hidden
        className="absolute inset-[44%] rounded-full bg-paper/90"
        style={{ background: `hsl(${(hue + 180) % 360} 35% 78%)` }}
      />
      <span
        className={`relative font-serif text-paper/90 ${size === "lg" ? "text-3xl" : size === "md" ? "text-sm" : "text-[10px]"}`}
      >
        {initials}
      </span>
    </div>
  );
}
