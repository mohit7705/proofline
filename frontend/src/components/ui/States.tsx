import type { ReactNode } from "react";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";

/** An empty screen is an invitation to act, so it always says what to do next. */
export function EmptyState({
  icon = "inbox",
  title,
  children,
  action,
}: {
  icon?: IconName;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon" aria-hidden="true">
        <Icon name={icon} size={22} />
      </span>
      <h3>{title}</h3>
      {children ? <p>{children}</p> : null}
      {action ? <div className="empty-action">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="alert alert-fail" role="alert">
      <Icon name="alert" size={18} />
      <p>{message}</p>
      {onRetry ? (
        <Button size="s" onClick={onRetry}>
          <Icon name="refresh" size={14} />
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function Alert({
  tone = "info",
  children,
  role,
}: {
  tone?: "info" | "warn" | "fail" | "ok";
  children: ReactNode;
  role?: "alert" | "status" | "note";
}) {
  const icon: IconName = tone === "ok" ? "checkCircle" : tone === "info" ? "info" : "alert";
  return (
    <div className={`alert alert-${tone}`} role={role ?? (tone === "fail" ? "alert" : "note")}>
      <Icon name={icon} size={18} />
      <div className="alert-body">{children}</div>
    </div>
  );
}
