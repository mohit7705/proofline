import type { KeyboardEvent } from "react";
import { VERDICTS } from "../../lib/status";
import type { Verdict } from "../../types";

export type RegionId = "wall" | "switch" | "debris";

export interface FrameRegion {
  id: RegionId;
  verdict: Verdict;
  label: string;
}

interface Props {
  regions: FrameRegion[];
  active?: RegionId | null;
  onSelect?: (id: RegionId) => void;
  animate?: boolean;
  timecode?: string;
  caption?: string;
}

/** Where each outlined region sits in the illustrated scene. */
const GEOMETRY: Record<RegionId, { x: number; y: number; w: number; h: number }> = {
  wall: { x: 46, y: 52, w: 92, h: 150 },
  switch: { x: 312, y: 104, w: 66, h: 82 },
  debris: { x: 192, y: 254, w: 150, h: 50 },
};

/**
 * An illustration of the product idea, used on the public pages only: a
 * viewfinder, the area a check is about, and the decision for that area.
 * It is never shown as real evidence inside the workspaces.
 */
export function InspectionFrame({
  regions,
  active,
  onSelect,
  animate = false,
  timecode = "00:46",
  caption,
}: Props) {
  const key = (id: RegionId) => (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect?.(id);
    }
  };

  return (
    <figure className={`frame ${animate ? "is-animated" : ""}`}>
      <svg
        viewBox="0 0 480 330"
        role="img"
        aria-label={caption ?? "Illustrated inspection frame with outlined regions"}
      >
        <defs>
          <pattern
            id="plaster"
            width="8"
            height="8"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(35)"
          >
            <line x1="0" y1="0" x2="0" y2="8" stroke="#c9cdd8" strokeWidth="1" />
          </pattern>
          <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#c2c7d3" />
            <stop offset="1" stopColor="#aab0bf" />
          </linearGradient>
        </defs>

        <rect width="480" height="330" fill="#dadde6" />
        <rect width="480" height="236" fill="url(#plaster)" opacity="0.55" />
        <rect y="236" width="480" height="94" fill="url(#floor)" />
        <rect y="228" width="480" height="9" fill="#aab0bf" />

        <rect x="62" y="68" width="58" height="118" rx="9" fill="#eaecf3" />
        <path
          d="M70 84l40 8M70 104l40 8M70 124l40 8M70 144l40 8M70 164l40 8"
          stroke="#d5d9e4"
          strokeWidth="2"
          strokeLinecap="round"
        />

        <rect x="350" y="22" width="118" height="214" fill="#9aa1b3" />
        <rect x="350" y="22" width="118" height="214" fill="none" stroke="#818aa0" strokeWidth="2" />
        <circle cx="372" cy="140" r="5" fill="#6f7890" />

        <rect x="324" y="116" width="40" height="58" rx="3" fill="#262c42" />
        <circle cx="336" cy="128" r="3.2" fill="#8d96b0" />
        <circle cx="336" cy="162" r="3.2" fill="#8d96b0" />
        <rect x="330" y="138" width="14" height="16" rx="2" fill="#4a5473" />

        <g fill="#82889b">
          <polygon points="212,276 230,270 238,284 218,290" />
          <polygon points="252,282 268,278 272,292 256,294" />
          <polygon points="292,270 312,272 304,286" />
          <polygon points="236,296 252,294 250,302 234,303" />
        </g>
        <g fill="#eff1f7">
          <circle cx="222" cy="298" r="2.4" />
          <circle cx="262" cy="270" r="2" />
          <circle cx="284" cy="294" r="2.6" />
          <circle cx="322" cy="290" r="2" />
          <circle cx="206" cy="284" r="1.8" />
        </g>

        {regions.map((r, i) => {
          const g = GEOMETRY[r.id];
          const tone = VERDICTS[r.verdict].tone;
          const label = r.label;
          const tagW = label.length * 6.4 + 18;
          const isActive = active === r.id;
          const interactive = Boolean(onSelect);
          return (
            <g
              key={r.id}
              className={`region region-${tone} ${isActive ? "is-active" : ""}`}
              style={{ ["--delay" as string]: `${0.9 + i * 0.6}s` }}
              tabIndex={interactive ? 0 : undefined}
              role={interactive ? "button" : undefined}
              aria-label={interactive ? `${label}: ${VERDICTS[r.verdict].label}` : undefined}
              aria-pressed={interactive ? isActive : undefined}
              onClick={interactive ? () => onSelect?.(r.id) : undefined}
              onKeyDown={interactive ? key(r.id) : undefined}
            >
              <rect className="region-box" x={g.x} y={g.y} width={g.w} height={g.h} rx="6" />
              <g transform={`translate(${g.x}, ${g.y - 22})`}>
                <rect className="region-tag" width={tagW} height="18" rx="9" />
                <text className="region-text" x="9" y="12.5">
                  {label}
                </text>
              </g>
            </g>
          );
        })}

        <g className="finder" fill="none" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 36V14h22M444 14h22v22M466 294v22h-22M36 316H14v-22" />
        </g>
        <text className="timecode" x="24" y="305">
          {timecode}
        </text>
        <rect className="scan" x="0" y="0" width="480" height="3" />
      </svg>
      {caption ? <figcaption className="frame-caption">{caption}</figcaption> : null}
    </figure>
  );
}
