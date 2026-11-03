import { Link } from "react-router-dom";

export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
      className="logo-mark"
    >
      <rect width="32" height="32" rx="9" fill="currentColor" />
      <path
        d="M8 12V8h4M24 12V8h-4M8 20v4h4M24 20v4h-4"
        fill="none"
        stroke="#8f9bff"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M11.5 16.4l3 3 6-6.4"
        fill="none"
        stroke="#f3f5ff"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({ to = "/", tone = "auto" }: { to?: string; tone?: "auto" | "light" }) {
  return (
    <Link to={to} className={`logo ${tone === "light" ? "logo-light" : ""}`} aria-label="Proofline home">
      <LogoMark />
      <span>Proofline</span>
    </Link>
  );
}
