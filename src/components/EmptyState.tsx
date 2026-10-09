import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  body: string;
  action?: ReactNode;
}

export function EmptyState({ title, body, action }: EmptyStateProps) {
  return (
    <div className="empty">
      <span className="empty__mark" aria-hidden="true" />
      <h2 className="empty__title">{title}</h2>
      <p className="empty__body">{body}</p>
      {action && <div className="empty__action">{action}</div>}
    </div>
  );
}
