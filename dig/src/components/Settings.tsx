"use client";
import { useEffect } from "react";

/** Applies per-viewer a11y prefs saved in localStorage as data attributes. */
export function ApplyPrefs() {
  useEffect(() => {
    try {
      const motion = localStorage.getItem("dig:motion");
      const contrast = localStorage.getItem("dig:contrast");
      const theme = localStorage.getItem("dig:theme");
      const root = document.documentElement;
      if (motion === "reduced") root.dataset.motion = "reduced";
      else delete root.dataset.motion;
      if (contrast === "high") root.dataset.contrast = "high";
      else delete root.dataset.contrast;
      if (theme === "dark" || theme === "light") root.dataset.theme = theme;
      else delete root.dataset.theme;
    } catch {
      /* storage unavailable */
    }
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);
  return null;
}
