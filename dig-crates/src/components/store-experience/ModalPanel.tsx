"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { IconClose } from "./Icons";

interface ModalPanelProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** Visually hidden extra description for assistive tech. */
  description?: string;
  variant?: "drawer" | "wide" | "center";
  children: ReactNode;
  footer?: ReactNode;
  headerExtra?: ReactNode;
  testId?: string;
}

/**
 * Accessible modal built on the native <dialog>: focus containment, Escape and focus restoration
 * come from the platform. Clicking the backdrop closes it.
 */
export function ModalPanel({ open, onClose, title, description, variant = "drawer", children, footer, headerExtra, testId }: ModalPanelProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      try {
        dialog.showModal();
      } catch {
        dialog.setAttribute("open", "");
      }
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    dialog.addEventListener("cancel", onCancel);
    return () => dialog.removeEventListener("cancel", onCancel);
  }, [onClose]);

  // The element stays mounted while closed (display:none via the UA stylesheet) so that
  // dialog.close() runs and the browser restores focus to the invoking control.
  return (
    <dialog
      ref={ref}
      className={`dig-dialog dig-dialog-${variant}`}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      data-testid={open ? testId : undefined}
      data-open={open ? "true" : "false"}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {open ? (
      <div className="dig-dialog-panel dig-fade" role="document">
        <div className="dig-dialog-head">
          <h2 id={titleId} className="dig-display">{title}</h2>
          {description ? <p id={descId} className="sr-only">{description}</p> : null}
          {headerExtra}
          <button type="button" className="dig-btn dig-btn-ghost dig-btn-icon" onClick={onClose} aria-label="Close">
            <IconClose />
          </button>
        </div>
        <div className="dig-dialog-body">{children}</div>
        {footer ? <div className="dig-dialog-foot">{footer}</div> : null}
      </div>
      ) : null}
    </dialog>
  );
}
