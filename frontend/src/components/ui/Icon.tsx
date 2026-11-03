const PATHS = {
  check: "M5 12.5l4.2 4.2L19 7",
  checkCircle: "M12 21a9 9 0 100-18 9 9 0 000 18zM8 12.3l2.7 2.7L16 9.5",
  x: "M6 6l12 12M18 6L6 18",
  alert: "M12 7.5v5.5M12 16.8h.01M12 21a9 9 0 100-18 9 9 0 000 18z",
  info: "M12 11v5.5M12 7.7h.01M12 21a9 9 0 100-18 9 9 0 000 18z",
  helpCircle: "M12 21a9 9 0 100-18 9 9 0 000 18zM9.6 9a2.5 2.5 0 014.8.8c0 1.7-2.4 2.1-2.4 3.7M12 17h.01",
  camera: "M4 8.5h3l1.5-2h7l1.5 2h3v10H4zM12 16.2a3.2 3.2 0 100-6.4 3.2 3.2 0 000 6.4z",
  video: "M3.5 7h11v10h-11zM14.5 10.5l6-3v9l-6-3z",
  image: "M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M9 9.4h.01",
  upload: "M12 16V5M7.5 9.5L12 5l4.5 4.5M5 19h14",
  download: "M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14",
  mic: "M12 14.5a3 3 0 003-3V6.5a3 3 0 00-6 0v5a3 3 0 003 3zM6.5 11.5a5.5 5.5 0 0011 0M12 17v3",
  eye: "M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12zM12 14.6a2.6 2.6 0 100-5.2 2.6 2.6 0 000 5.2z",
  eyeOff:
    "M3 3l18 18M10.6 6.6A9.8 9.8 0 0112 6.5c6 0 9.5 5.5 9.5 5.5a15 15 0 01-3 3.5M6.4 8.4A15 15 0 002.5 12S6 17.5 12 17.5a9.5 9.5 0 003.5-.7M9.9 9.9a3 3 0 004.2 4.2",
  shield: "M12 3l7 2.8v5.6c0 4.4-2.9 7.9-7 9.6-4.1-1.7-7-5.2-7-9.6V5.8z",
  layers: "M12 4l8.5 4.5L12 13 3.5 8.5zM3.5 12.5L12 17l8.5-4.5M3.5 16.5L12 21l8.5-4.5",
  clock: "M12 7v5l3.2 2M12 21a9 9 0 100-18 9 9 0 000 18z",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  logout: "M10 5H6v14h4M14 8l4 4-4 4M18 12H9.5",
  flag: "M6 20V4M6 5h11l-2 3.5L17 12H6",
  file: "M7 3.5h7.5L19 8v12.5H7zM14.5 3.5V8H19",
  arrow: "M5 12h14M13 6l6 6-6 6",
  arrowLeft: "M19 12H5M11 6l-6 6 6 6",
  chevronRight: "M9 5l7 7-7 7",
  chevronDown: "M5 9l7 7 7-7",
  menu: "M4 7h16M4 12h16M4 17h16",
  bell: "M6 16.5V11a6 6 0 1112 0v5.5l1.5 2h-15zM10 21h4",
  search: "M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4",
  dashboard: "M4 4h7v8H4zM13 4h7v5h-7zM13 11h7v9h-7zM4 14h7v6H4z",
  clipboard:
    "M9 4h6v3H9zM8 5.5H6.5A1.5 1.5 0 005 7v12.5A1.5 1.5 0 006.5 21h11a1.5 1.5 0 001.5-1.5V7a1.5 1.5 0 00-1.5-1.5H16M9 12h6M9 16h4",
  users:
    "M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2.5 20c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5M16 4.3a3.5 3.5 0 010 6.4M18 14.8c2 .6 3.5 2.2 3.5 5.2",
  user: "M12 12a4 4 0 100-8 4 4 0 000 8zM4.5 20.5c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6",
  mapPin:
    "M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0113 0c0 5.4-6.5 11-6.5 11zM12 12.2a2.4 2.4 0 100-4.8 2.4 2.4 0 000 4.8z",
  refresh: "M20 11a8 8 0 00-14.3-4.2L4 9M4 4v5h5M4 13a8 8 0 0014.3 4.2L20 15M20 20v-5h-5",
  print: "M7 9V4h10v5M7 17H5V9h14v8h-2M7 14h10v6H7z",
  play: "M8 5.5v13l11-6.5z",
  trash: "M5 7h14M9.5 7V4.5h5V7M7 7l.8 12.5h8.4L17 7M10.5 11v5M13.5 11v5",
  edit: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4",
  lock: "M6.5 11h11v9h-11zM8.5 11V8a3.5 3.5 0 017 0v3",
  calendar: "M5 6.5h14V20H5zM5 10.5h14M9 4v4M15 4v4",
  hash: "M9.5 4L8 20M16 4l-1.5 16M5 9h15M4 15h15",
  building: "M5 21V4.5h9V21M14 9h5v12M8.5 8h2M8.5 12h2M8.5 16h2M3 21h18",
  filter: "M4 5h16l-6 7.5V19l-4-2v-4.5z",
  settings: "M12 8.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7zM19.4 15a1.7 1.7 0 00.3 1.9l.1.1-1.7 2.9-.2-.1a1.7 1.7 0 00-1.8.2l-.2.1h-3.4l-.1-.2a1.7 1.7 0 00-1.5-1l-.2.1-2.9-1.7.1-.2a1.7 1.7 0 00-.2-1.8l-.1-.2v-3.4l.2-.1a1.7 1.7 0 001-1.5l-.1-.2 1.7-2.9.2.1a1.7 1.7 0 001.8-.2l.2-.1h3.4l.1.2a1.7 1.7 0 001.5 1l.2-.1 2.9 1.7-.1.2a1.7 1.7 0 00.2 1.8l.1.2v3.4z",
  wifiOff: "M3 3l18 18M8.5 16.5a5 5 0 017 0M5 12.5a10 10 0 014.2-2.4M19 12.5a10 10 0 00-5.8-2.7M12 20h.01",
  link: "M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1",
  target: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 16.5a4.5 4.5 0 100-9 4.5 4.5 0 000 9zM12 12h.01",
  inbox: "M4 13l2.5-7.5h11L20 13M4 13v6h16v-6M4 13h4.5l1 2.5h5l1-2.5H20",
  chart: "M5 20v-8M12 20V5M19 20v-5M3 20.5h18",
  sparkle: "M11 3l1.9 5.6L18.5 10.5 12.9 12.4 11 18l-1.9-5.6L3.5 10.5 9.1 8.6zM18.5 15l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9z",
  scan: "M4 8V5.5A1.5 1.5 0 015.5 4H8M16 4h2.5A1.5 1.5 0 0120 5.5V8M20 16v2.5a1.5 1.5 0 01-1.5 1.5H16M8 20H5.5A1.5 1.5 0 014 18.5V16M4 12h16",
} as const;

export type IconName = keyof typeof PATHS;

interface Props {
  name: IconName;
  size?: number;
  label?: string;
  className?: string;
}

export function Icon({ name, size = 18, label, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      className={className}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
