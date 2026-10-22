"use client";

import { useCallback, useEffect, useLayoutEffect, useState, type RefObject } from "react";

interface Options {
  rowCount: number;
  rowHeight: number;
  overscan?: number;
  /** The scrolling element. */
  scrollRef: RefObject<HTMLElement | null>;
  /** The element that contains the rows, when it does not start at the top of the scroll container. */
  innerRef?: RefObject<HTMLElement | null>;
}

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Windowed rows for a fixed-row-height list/grid inside a scroll container. */
export function useVirtualRows({ rowCount, rowHeight, overscan = 2, scrollRef, innerRef }: Options) {
  const [range, setRange] = useState({ start: 0, end: Math.min(rowCount, 8) });
  const [width, setWidth] = useState(0);

  const offsetOf = useCallback(() => {
    const scroll = scrollRef.current;
    const inner = innerRef?.current;
    if (!scroll || !inner) return 0;
    return Math.max(0, inner.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop);
  }, [scrollRef, innerRef]);

  const measure = useCallback(() => {
    const el = scrollRef.current;
    if (!el || rowHeight <= 0) return;
    const relativeTop = el.scrollTop - offsetOf();
    const start = Math.max(0, Math.floor(relativeTop / rowHeight) - overscan);
    const visible = Math.ceil(el.clientHeight / rowHeight) + overscan * 2 + 1;
    const end = Math.min(rowCount, start + visible);
    setRange((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
    setWidth((w) => (w === el.clientWidth ? w : el.clientWidth));
  }, [overscan, rowCount, rowHeight, scrollRef, offsetOf]);

  useIsoLayoutEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(onScroll) : null;
    ro?.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", onScroll);
      ro?.disconnect();
    };
  }, [measure, scrollRef]);

  const scrollToRow = useCallback(
    (row: number, behavior: ScrollBehavior = "auto") => {
      const el = scrollRef.current;
      if (!el) return;
      const top = offsetOf() + row * rowHeight;
      if (top < el.scrollTop || top + rowHeight > el.scrollTop + el.clientHeight) {
        el.scrollTo({ top: Math.max(0, top - 12), behavior });
      }
    },
    [rowHeight, scrollRef, offsetOf],
  );

  return { range, width, totalHeight: rowCount * rowHeight, scrollToRow, remeasure: measure };
}
