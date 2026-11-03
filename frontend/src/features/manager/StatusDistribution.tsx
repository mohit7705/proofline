import { WORK_ORDER_STATUS, WORK_ORDER_STATUS_ORDER } from "../../lib/status";
import type { WorkOrder, WorkOrderStatus } from "../../types";

const STATUS_COLOR: Record<WorkOrderStatus, string> = {
  draft: "#c4c7d6",
  open: "#1769ee",
  in_progress: "#5428e9",
  submitted: "#7447ee",
  under_review: "#a28af2",
  approved: "#1f9d57",
  rejected: "#e4313c",
  cancelled: "#b9b9cf",
};

/** Every work order, split by where it stands: donut on the left, legend on the right. */
export function StatusDistribution({ orders }: { orders: WorkOrder[] }) {
  const counts = Object.fromEntries(WORK_ORDER_STATUS_ORDER.map((s) => [s, 0])) as Record<
    WorkOrderStatus,
    number
  >;
  for (const o of orders) counts[o.status] += 1;
  const total = orders.length;

  let cursor = 0;
  const stops: string[] = [];
  for (const s of WORK_ORDER_STATUS_ORDER) {
    if (counts[s] === 0) continue;
    const start = cursor;
    cursor += (counts[s] / total) * 360;
    stops.push(`${STATUS_COLOR[s]} ${start}deg ${cursor}deg`);
  }
  const background = total > 0 ? `conic-gradient(${stops.join(", ")})` : "#e4e7f3";

  return (
    <div className="manager-overview__status-content">
      <div
        className="manager-overview__donut"
        style={{ background }}
        role="img"
        aria-label={
          WORK_ORDER_STATUS_ORDER.filter((s) => counts[s] > 0)
            .map((s) => `${counts[s]} ${WORK_ORDER_STATUS[s].label}`)
            .join(", ") || "No work orders"
        }
      >
        <div className="manager-overview__donut-hole">
          <strong>{total}</strong>
          <span>Total</span>
        </div>
      </div>
      <ul className="manager-overview__legend">
        {WORK_ORDER_STATUS_ORDER.map((s) => (
          <li key={s}>
            <span
              className="manager-overview__legend-dot"
              style={{ ["--dot-color" as string]: STATUS_COLOR[s] }}
              aria-hidden="true"
            />
            <span>{WORK_ORDER_STATUS[s].label}</span>
            <strong>
              {counts[s]} ({total > 0 ? Math.round((counts[s] / total) * 100) : 0}%)
            </strong>
          </li>
        ))}
      </ul>
    </div>
  );
}
