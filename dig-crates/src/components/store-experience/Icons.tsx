import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 20, ...rest }: IconProps) {
  return { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, focusable: false, ...rest };
}

export const IconPrev = (p: IconProps) => (<svg {...base(p)}><path d="M15 6l-6 6 6 6" /></svg>);
export const IconNext = (p: IconProps) => (<svg {...base(p)}><path d="M9 6l6 6-6 6" /></svg>);
export const IconPlay = (p: IconProps) => (<svg {...base(p)}><path d="M7 5v14l11-7z" fill="currentColor" stroke="none" /></svg>);
export const IconPause = (p: IconProps) => (<svg {...base(p)}><rect x="6" y="5" width="4" height="14" fill="currentColor" stroke="none" /><rect x="14" y="5" width="4" height="14" fill="currentColor" stroke="none" /></svg>);
export const IconStop = (p: IconProps) => (<svg {...base(p)}><rect x="6" y="6" width="12" height="12" fill="currentColor" stroke="none" /></svg>);
export const IconClose = (p: IconProps) => (<svg {...base(p)}><path d="M6 6l12 12M18 6L6 18" /></svg>);
export const IconBack = (p: IconProps) => (<svg {...base(p)}><path d="M19 12H5M11 18l-6-6 6-6" /></svg>);
export const IconPile = (p: IconProps) => (<svg {...base(p)}><rect x="4" y="5" width="16" height="4" rx="1" /><rect x="4" y="10" width="16" height="4" rx="1" /><rect x="4" y="15" width="16" height="4" rx="1" /></svg>);
export const IconPlus = (p: IconProps) => (<svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>);
export const IconCheck = (p: IconProps) => (<svg {...base(p)}><path d="M5 12l5 5L20 7" /></svg>);
export const IconSearch = (p: IconProps) => (<svg {...base(p)}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>);
export const IconFilter = (p: IconProps) => (<svg {...base(p)}><path d="M4 6h16M7 12h10M10 18h4" /></svg>);
export const IconDig = (p: IconProps) => (<svg {...base(p)}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="2" /><path d="M12 3v4M12 17v4M3 12h4M17 12h4" /></svg>);
export const IconInfo = (p: IconProps) => (<svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>);
export const IconMute = (p: IconProps) => (<svg {...base(p)}><path d="M4 10v4h4l5 4V6L8 10H4z" /><path d="M16 9l5 6M21 9l-5 6" /></svg>);
export const IconVolume = (p: IconProps) => (<svg {...base(p)}><path d="M4 10v4h4l5 4V6L8 10H4z" /><path d="M16.5 8.5a5 5 0 010 7" /></svg>);
export const IconSkip = (p: IconProps) => (<svg {...base(p)}><path d="M6 5l9 7-9 7z" fill="currentColor" stroke="none" /><rect x="17" y="5" width="2.5" height="14" fill="currentColor" stroke="none" /></svg>);
export const IconNoAudio = (p: IconProps) => (<svg {...base(p)}><path d="M4 10v4h4l5 4V6L8 10H4z" /><path d="M3 3l18 18" /></svg>);
export const IconGrid = (p: IconProps) => (<svg {...base(p)}><rect x="4" y="4" width="7" height="7" /><rect x="13" y="4" width="7" height="7" /><rect x="4" y="13" width="7" height="7" /><rect x="13" y="13" width="7" height="7" /></svg>);
export const IconRecord = (p: IconProps) => (<svg {...base(p)}><rect x="4" y="4" width="16" height="16" rx="1" /><circle cx="12" cy="12" r="3" /></svg>);
export const IconHeadphones = (p: IconProps) => (<svg {...base(p)}><path d="M4 14v-2a8 8 0 0116 0v2" /><rect x="4" y="14" width="4" height="6" rx="1" /><rect x="16" y="14" width="4" height="6" rx="1" /></svg>);
export const IconCopy = (p: IconProps) => (<svg {...base(p)}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 012-2h10" /></svg>);
export const IconTrash = (p: IconProps) => (<svg {...base(p)}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>);
export const IconHome = (p: IconProps) => (<svg {...base(p)}><path d="M3 11l9-8 9 8v9a1 1 0 01-1 1h-5v-6h-6v6H4a1 1 0 01-1-1z" /></svg>);
