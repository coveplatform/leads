"use client";

import { useEffect } from "react";
import { useBrowse } from "./BrowseContext";
import { IconClose } from "./Icons";

/** Transient status toast plus a polite live region for screen readers. */
export function Notice() {
  const { state, dispatch } = useBrowse();
  const notice = state.notice;
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => dispatch({ type: "DISMISS_NOTICE" }), 5000);
    return () => window.clearTimeout(t);
  }, [notice, dispatch]);
  return (
    <div role="status" aria-live="polite" aria-atomic="true">
      {notice ? (
        <div className="dig-toast dig-fade" data-testid="dig-notice">
          <span>{notice.text}</span>
          <button type="button" onClick={() => dispatch({ type: "DISMISS_NOTICE" })} aria-label="Dismiss message">
            <IconClose size={16} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
