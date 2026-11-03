import { Link } from "react-router-dom";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { formatDate, relativeTime } from "../../lib/format";
import { isOverdue, WORK_ORDER_STATUS } from "../../lib/status";
import type { WorkOrder } from "../../types";

interface Props {
  orders: WorkOrder[];
  assigneeName: (id: string | null) => string;
}

export function WorkOrderTable({ orders, assigneeName }: Props) {
  return (
    <div className="table-wrap">
      <table className="table">
        <caption className="sr-only">Work orders, their status, assignee and due date</caption>
        <thead>
          <tr>
            <th scope="col">Work order</th>
            <th scope="col">Status</th>
            <th scope="col">Assigned to</th>
            <th scope="col">Due</th>
            <th scope="col">Updated</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => {
            const meta = WORK_ORDER_STATUS[o.status];
            const overdue = isOverdue(o);
            return (
              <tr key={o.id}>
                <th scope="row">
                  <Link to={`/manager/work-orders/${o.id}`} className="table-link">
                    {o.title}
                  </Link>
                  <span className="table-meta table-clamp">{o.description}</span>
                </th>
                <td>
                  <StatusBadge label={meta.label} tone={meta.tone} />
                </td>
                <td className={o.assigned_to ? "" : "muted"}>{assigneeName(o.assigned_to)}</td>
                <td>
                  <span className="num">{formatDate(o.due_at)}</span>
                  {overdue ? <span className="chip chip-fail">Overdue</span> : null}
                </td>
                <td className="muted">{relativeTime(o.updated_at)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
