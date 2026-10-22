"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

const ThemeLab = dynamic(() => import("./ThemeLab").then((m) => m.ThemeLab), {
  ssr: false,
  loading: () => <main className="hub"><p>Loading theme lab…</p></main>,
});

/** The lab reads localStorage drafts during initialisation, so it renders on the client only. */
export function ThemeLabLoader(props: ComponentProps<typeof ThemeLab>) {
  return <ThemeLab {...props} />;
}
