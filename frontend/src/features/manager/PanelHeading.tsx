import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon, type IconName } from "../../components/ui/Icon";

interface Props {
  id: string;
  icon: IconName;
  title: string;
  subtitle?: ReactNode;
  /** Optional "View all" style link shown on the right. */
  linkTo?: string;
  linkLabel?: string;
}

/** Heading used by the Manager overview panels (icon tile, title, subtitle, link). */
export function PanelHeading({ id, icon, title, subtitle, linkTo, linkLabel = "View all" }: Props) {
  return (
    <div className="manager-overview__panel-heading">
      <div className="manager-overview__panel-title">
        <span className="manager-overview__panel-icon" aria-hidden="true">
          <Icon name={icon} size={20} />
        </span>
        <span>
          <h2 id={id} className="manager-overview__panel-h">
            {title}
          </h2>
          {subtitle ? <p className="manager-overview__panel-subtitle">{subtitle}</p> : null}
        </span>
      </div>
      {linkTo ? (
        <Link to={linkTo} className="manager-overview__panel-link">
          {linkLabel} <Icon name="arrow" size={14} />
        </Link>
      ) : null}
    </div>
  );
}
