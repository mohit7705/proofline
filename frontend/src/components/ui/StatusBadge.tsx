import type { Tone } from "../../lib/status";
import { Icon, type IconName } from "./Icon";

const TONE_ICON: Record<Tone, IconName> = {
  ok: "check",
  warn: "camera",
  fail: "x",
  review: "eye",
  pending: "clock",
  info: "clock",
};

interface Props {
  label: string;
  tone: Tone;
  icon?: IconName;
  title?: string;
}

/** Colour is never the only signal: every status also carries an icon and a word. */
export function StatusBadge({ label, tone, icon, title }: Props) {
  return (
    <span className={`badge badge-${tone}`} title={title}>
      <Icon name={icon ?? TONE_ICON[tone]} size={13} />
      {label}
    </span>
  );
}
