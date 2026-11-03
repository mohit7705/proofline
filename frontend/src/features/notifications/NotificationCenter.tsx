import { useEffect, useMemo, useState } from "react";
import "./notification-center.css";

export interface WorkerNotification {
  id: string;
  title: string;
  message: string;
  createdAt?: string | null;
  href?: string | null;
}

interface NotificationCenterProps {
  notifications: WorkerNotification[];
  onOpenNotification?: (notification: WorkerNotification) => void;
  onClose: () => void;
}

interface StoredNotificationState {
  readIds: string[];
  dismissedIds: string[];
}

const STORAGE_KEY = "proofline.worker.notification-state";

function readStoredState(): StoredNotificationState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { readIds: [], dismissedIds: [] };

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return { readIds: [], dismissedIds: [] };
    }

    const value = parsed as Partial<StoredNotificationState>;

    return {
      readIds: Array.isArray(value.readIds)
        ? value.readIds.filter((id): id is string => typeof id === "string")
        : [],
      dismissedIds: Array.isArray(value.dismissedIds)
        ? value.dismissedIds.filter((id): id is string => typeof id === "string")
        : [],
    };
  } catch {
    return { readIds: [], dismissedIds: [] };
  }
}

function saveStoredState(state: StoredNotificationState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Keep the dropdown usable if browser storage is unavailable.
  }
}

function formatNotificationDate(value?: string | null): string {
  if (!value) return "New";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "New";

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export default function NotificationCenter({
  notifications,
  onOpenNotification,
  onClose,
}: NotificationCenterProps) {
  const [storedState, setStoredState] = useState<StoredNotificationState>(readStoredState);

  useEffect(() => {
    saveStoredState(storedState);
  }, [storedState]);

  const dismissedIds = useMemo(
    () => new Set(storedState.dismissedIds),
    [storedState.dismissedIds],
  );
  const readIds = useMemo(
    () => new Set(storedState.readIds),
    [storedState.readIds],
  );

  const visibleNotifications = notifications.filter(
    (notification) => !dismissedIds.has(notification.id),
  );

  const unreadCount = visibleNotifications.filter(
    (notification) => !readIds.has(notification.id),
  ).length;

  function markAsRead(id: string) {
    setStoredState((current) => ({
      ...current,
      readIds: current.readIds.includes(id)
        ? current.readIds
        : [...current.readIds, id],
    }));
  }

  function markAllAsRead() {
    setStoredState((current) => ({
      ...current,
      readIds: Array.from(
        new Set([
          ...current.readIds,
          ...visibleNotifications.map((notification) => notification.id),
        ]),
      ),
    }));
  }

  function dismissOne(id: string) {
    setStoredState((current) => ({
      ...current,
      dismissedIds: current.dismissedIds.includes(id)
        ? current.dismissedIds
        : [...current.dismissedIds, id],
    }));
  }

  function clearAll() {
    setStoredState((current) => ({
      ...current,
      dismissedIds: Array.from(
        new Set([
          ...current.dismissedIds,
          ...visibleNotifications.map((notification) => notification.id),
        ]),
      ),
    }));
  }

  return (
    <section
      className="notification-center"
      aria-label="Notifications"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <header className="notification-center__header">
        <div>
          <h2>Notifications</h2>
          <p>
            {unreadCount === 0
              ? "You're all caught up"
              : `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`}
          </p>
        </div>
        <button
          type="button"
          className="notification-center__close"
          onClick={onClose}
          aria-label="Close notifications"
          title="Close"
        >
          ×
        </button>
      </header>

      {visibleNotifications.length > 0 && (
        <div className="notification-center__toolbar">
          <button type="button" onClick={markAllAsRead} disabled={unreadCount === 0}>
            Mark all as read
          </button>
          <button type="button" onClick={clearAll}>
            Clear all
          </button>
        </div>
      )}

      {visibleNotifications.length === 0 ? (
        <div className="notification-center__empty">
          <span className="notification-center__empty-icon" aria-hidden="true">✓</span>
          <strong>You're all caught up</strong>
          <p>New task updates and activity will appear here.</p>
        </div>
      ) : (
        <ul className="notification-center__list">
          {visibleNotifications.map((notification) => {
            const isRead = readIds.has(notification.id);

            return (
              <li
                className={`notification-center__item${isRead ? " is-read" : " is-unread"}`}
                key={notification.id}
              >
                <button
                  type="button"
                  className="notification-center__content"
                  onClick={() => {
                    markAsRead(notification.id);
                    onOpenNotification?.(notification);
                  }}
                >
                  <span className="notification-center__indicator" aria-hidden="true" />
                  <span className="notification-center__copy">
                    <strong>{notification.title}</strong>
                    <span>{notification.message}</span>
                    <small>{formatNotificationDate(notification.createdAt)}</small>
                  </span>
                </button>

                <div className="notification-center__item-actions">
                  {!isRead && (
                    <button
                      type="button"
                      onClick={() => markAsRead(notification.id)}
                      aria-label={`Mark "${notification.title}" as read`}
                      title="Mark as read"
                    >
                      ✓
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => dismissOne(notification.id)}
                    aria-label={`Dismiss "${notification.title}"`}
                    title="Dismiss notification"
                  >
                    ×
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}