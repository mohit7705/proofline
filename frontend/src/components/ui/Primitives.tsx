import type { ReactNode } from "react";
import { initials } from "../../lib/format";
import { Icon, type IconName } from "./Icon";

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.38 }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

export function ProgressBar({
  value,
  max = 100,
  label,
  tone = "info",
}: {
  value: number;
  max?: number;
  label: string;
  tone?: "info" | "ok" | "warn";
}) {
  const pct = max <= 0 ? 0 : Math.min(100, Math.round((value / max) * 100));
  return (
    <div
      className="progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      aria-label={label}
    >
      <span className={`progress-fill progress-${tone}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Card({
  children,
  className = "",
  as: Tag = "section",
  ...rest
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article";
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag className={`card ${className}`.trim()} {...(rest as object)}>
      {children}
    </Tag>
  );
}

export function CardHeader({
  title,
  hint,
  actions,
  id,
}: {
  title: string;
  hint?: string;
  actions?: ReactNode;
  id?: string;
}) {
  return (
    <header className="card-head">
      <div>
        <h2 id={id} className="card-title">
          {title}
        </h2>
        {hint ? <p className="card-hint">{hint}</p> : null}
      </div>
      {actions ? <div className="card-actions">{actions}</div> : null}
    </header>
  );
}

export function Stat({
  label,
  value,
  icon,
  tone = "default",
  hint,
}: {
  label: string;
  value: number | string;
  icon: IconName;
  tone?: "default" | "warn" | "fail" | "review";
  hint?: string;
}) {
  return (
    <div className={`stat stat-${tone}`}>
      <span className="stat-icon" aria-hidden="true">
        <Icon name={icon} size={18} />
      </span>
      <dt>{label}</dt>
      <dd className="num">{value}</dd>
      {hint ? <p className="stat-hint">{hint}</p> : null}
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: { id: T; label: string; count?: number }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          className={`tab ${value === t.id ? "is-active" : ""}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
          {t.count !== undefined ? <span className="tab-count num">{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Pagination({
  page,
  pageCount,
  onPage,
  total,
  pageSize,
}: {
  page: number;
  pageCount: number;
  onPage: (page: number) => void;
  total: number;
  pageSize: number;
}) {
  if (pageCount <= 1) return null;
  const from = page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  return (
    <nav className="pagination" aria-label="Pagination">
      <p className="num">
        {from}–{to} of {total}
      </p>
      <div>
        <button
          type="button"
          className="btn btn-secondary btn-s"
          onClick={() => onPage(page - 1)}
          disabled={page === 0}
        >
          Previous
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-s"
          onClick={() => onPage(page + 1)}
          disabled={page >= pageCount - 1}
        >
          Next
        </button>
      </div>
    </nav>
  );
}

export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="stepper" aria-label="Progress">
      {steps.map((label, i) => (
        <li
          key={label}
          className={`stepper-item ${i < current ? "is-done" : ""} ${i === current ? "is-current" : ""}`}
          aria-current={i === current ? "step" : undefined}
        >
          <span className="stepper-dot num">{i < current ? <Icon name="check" size={13} /> : i + 1}</span>
          <span className="stepper-label">{label}</span>
        </li>
      ))}
    </ol>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  back,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  back?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div className="page-head-text">
        {back}
        <h1 className="page-title">{title}</h1>
        {subtitle ? <p className="page-sub">{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </div>
  );
}
