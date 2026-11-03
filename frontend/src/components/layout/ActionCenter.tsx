import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useActionItems } from "../../features/notifications/useActionItems";
import type { Role } from "../../types";
import { Icon } from "../ui/Icon";
import { Spinner } from "../ui/Spinner";

export function ActionCenter({ role }: { role: Role }) {
  const { items, loading, failed, reload } = useActionItems(role);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="action-center" ref={root}>
      <button
        type="button"
        className="icon-btn bell"
        aria-label={
          items.length ? `${items.length} items need your attention` : "Nothing needs your attention"
        }
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => {
          setOpen((o) => !o);
          if (!open) void reload();
        }}
      >
        <Icon name="bell" size={19} />
        {items.length > 0 ? (
          <span className="bell-dot num">{items.length > 9 ? "9+" : items.length}</span>
        ) : null}
      </button>

      {open ? (
        <div className="popover" role="dialog" aria-label="What needs your attention">
          <div className="popover-head">
            <h2>Needs your attention</h2>
            {loading ? <Spinner size={14} label="Refreshing" /> : null}
          </div>
          {failed ? <p className="popover-empty">Couldn't refresh. Check your connection.</p> : null}
          {!failed && items.length === 0 && !loading ? (
            <p className="popover-empty">You're all caught up. New assignments and reviews show up here.</p>
          ) : null}
          <ul className="popover-list">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className={`popover-item tone-${item.tone}`}
                >
                  <span className="popover-icon" aria-hidden="true">
                    <Icon name={item.icon} size={16} />
                  </span>
                  <span>
                    <span className="popover-title">{item.title}</span>
                    <span className="popover-detail">{item.detail}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
