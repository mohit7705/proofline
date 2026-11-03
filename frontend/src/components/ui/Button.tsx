import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link, type LinkProps } from "react-router-dom";
import { Icon, type IconName } from "./Icon";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "dark" | "outline-light";
type Size = "m" | "s" | "l";

interface Common {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

const cls = (variant: Variant, size: Size, extra: string) => `btn btn-${variant} btn-${size} ${extra}`.trim();

export function Button({
  variant = "secondary",
  size = "m",
  className = "",
  type = "button",
  children,
  ...rest
}: Common & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} className={cls(variant, size, className)} {...rest}>
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = "secondary",
  size = "m",
  className = "",
  children,
  ...rest
}: Common & LinkProps) {
  return (
    <Link className={cls(variant, size, className)} {...rest}>
      {children}
    </Link>
  );
}

/** Icon-only button. A text label is required for assistive technology. */
export function IconButton({
  icon,
  label,
  size = 18,
  className = "",
  type = "button",
  ...rest
}: { icon: IconName; label: string; size?: number } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} className={`icon-btn ${className}`.trim()} aria-label={label} title={label} {...rest}>
      <Icon name={icon} size={size} />
    </button>
  );
}
