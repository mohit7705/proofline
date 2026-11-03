import { WORK_ORDER_STATUS, WORK_ORDER_STATUS_ORDER } from "../../lib/status";
import type { WorkOrder, WorkOrderStatus } from "../../types";

/** Every work order, split by where it stands. */
export function StatusDistribution({ orders }: { orders: WorkOrder[] }) {
  const counts = Object.fromEntries(WORK_ORDER_STATUS_ORDER.map((s) => [s, 0])) as Record<
    WorkOrderStatus,
    number
  >;
  for (const o of orders) counts[o.status] += 1;
  const total = orders.length;
  const present = WORK_ORDER_STATUS_ORDER.filter((s) => counts[s] > 0);

  return (
    <div>
      <div
        className="dist-bar"
        role="img"
        aria-label={
          present.map((s) => `${counts[s]} ${WORK_ORDER_STATUS[s].label}`).join(", ") || "No work orders"
        }
      >
        {present.length === 0 ? <span className="seg seg-empty" style={{ flexGrow: 1 }} /> : null}
        {present.map((s) => (
          <span key={s} className={`seg seg-${WORK_ORDER_STATUS[s].tone}`} style={{ flexGrow: counts[s] }} />
        ))}
      </div>
      <ul className="dist-legend">
        {WORK_ORDER_STATUS_ORDER.map((s) => (
          <li key={s} className={counts[s] === 0 ? "is-zero" : ""}>
            <span className={`dot dot-${WORK_ORDER_STATUS[s].tone}`} aria-hidden="true" />
            <span>{WORK_ORDER_STATUS[s].label}</span>
            <span className="num dist-count">
              {counts[s]}
              {total > 0 ? <span className="muted"> ({Math.round((counts[s] / total) * 100)}%)</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
