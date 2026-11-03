import { VERDICTS } from "../../lib/status";
import type { Verdict } from "../../types";
import { Icon, type IconName } from "./Icon";

const ICONS: Record<Verdict, IconName> = {
  verified: "check",
  needs_evidence: "camera",
  failed: "x",
  needs_review: "eye",
  pending: "clock",
};

/** Colour is never the only signal: every verdict also carries an icon and a word. */
export function VerdictBadge({ verdict, short = false }: { verdict: Verdict; short?: boolean }) {
  const meta = VERDICTS[verdict];
  return (
    <span className={`badge badge-${meta.tone}`}>
      <Icon name={ICONS[verdict]} size={13} />
      {short ? meta.short : meta.label}
    </span>
  );
}
