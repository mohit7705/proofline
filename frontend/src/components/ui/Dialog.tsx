import { useEffect, useId, useRef, type ReactNode } from "react";
import { Icon } from "./Icon";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  size?: "m" | "l" | "xl";
  children: ReactNode;
}

/** Native <dialog>: focus trapping, Escape to close and the backdrop come from the browser. */
export function Dialog({ open, onClose, title, description, size = "m", children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`dialog dialog-${size}`}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open ? (
        <div className="dialog-body">
          <header className="dialog-head">
            <div>
              <h2 id={titleId} className="dialog-title">
                {title}
              </h2>
              {description ? <p className="dialog-desc">{description}</p> : null}
            </div>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close dialog">
              <Icon name="x" size={18} />
            </button>
          </header>
          {children}
        </div>
      ) : null}
    </dialog>
  );
}

interface ConfirmProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  busy?: boolean;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  busy,
  danger,
  onConfirm,
  onClose,
}: ConfirmProps) {
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <p className="dialog-text">{message}</p>
      <div className="dialog-actions">
        <button type="button" className="btn btn-ghost btn-m" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          className={`btn ${danger ? "btn-danger" : "btn-primary"} btn-m`}
          onClick={onConfirm}
          disabled={busy}
        >
          {busy ? "Working…" : confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
