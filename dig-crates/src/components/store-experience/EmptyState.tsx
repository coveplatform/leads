"use client";

import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  body?: string;
  actions?: ReactNode;
  testId?: string;
}

export function EmptyState({ title, body, actions, testId }: EmptyStateProps) {
  return (
    <div className="dig-empty" data-testid={testId}>
      <h3 className="dig-display" style={{ fontSize: "1.3rem" }}>{title}</h3>
      {body ? <p style={{ margin: 0, maxWidth: 420 }}>{body}</p> : null}
      {actions ? <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>{actions}</div> : null}
    </div>
  );
}
