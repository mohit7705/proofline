import { Link } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
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
    <div className="manager-work-orders__table-wrap">
      <table className="table manager-work-orders__table">
        <caption className="sr-only">
          Work orders, status, assigned worker, due date, last update, and actions
        </caption>

        <thead>
          <tr>
            <th scope="col">Work order</th>
            <th scope="col">Status</th>
            <th scope="col">Assigned to</th>
            <th scope="col">Due</th>
            <th scope="col">Updated</th>
            <th scope="col" className="manager-work-orders__actions-heading">
              Actions
            </th>
          </tr>
        </thead>

        <tbody>
          {orders.map((order) => {
            const status = WORK_ORDER_STATUS[order.status];
            const overdue = isOverdue(order);
            const detailPath = `/manager/work-orders/${order.id}`;

            return (
              <tr key={order.id}>
                <th scope="row">
                  <div className="manager-work-orders__order-cell">
                    <span
                      className="manager-work-orders__order-icon"
                      aria-hidden="true"
                    >
                      <Icon name="clipboard" size={18} />
                    </span>
                    <span className="manager-work-orders__order-copy">
                      <Link
                        to={detailPath}
                        className="manager-work-orders__order-title"
                      >
                        {order.title}
                      </Link>
                      <span className="manager-work-orders__order-description">
                        {order.description || "No description provided"}
                      </span>
                    </span>
                  </div>
                </th>

                <td>
                  <StatusBadge label={status.label} tone={status.tone} />
                </td>

                <td>
                  <span
                    className={`manager-work-orders__assignee ${
                      order.assigned_to ? "" : "is-unassigned"
                    }`}
                  >
                    <span className="manager-work-orders__assignee-avatar">
                      {order.assigned_to
                        ? assigneeName(order.assigned_to)
                            .trim()
                            .split(/\s+/)
                            .slice(0, 2)
                            .map((part) => part[0])
                            .join("")
                            .toUpperCase()
                        : "—"}
                    </span>
                    <span>{assigneeName(order.assigned_to)}</span>
                  </span>
                </td>

                <td>
                  <span className="manager-work-orders__due">
                    <Icon name="calendar" size={15} />
                    <span>{formatDate(order.due_at)}</span>
                  </span>
                  {overdue ? (
                    <span className="manager-work-orders__overdue">
                      Overdue
                    </span>
                  ) : null}
                </td>

                <td>
                  <span className="manager-work-orders__updated">
                    <Icon name="clock" size={15} />
                    {relativeTime(order.updated_at)}
                  </span>
                </td>

                <td className="manager-work-orders__actions-cell">
                  <Link
                    to={detailPath}
                    className="manager-work-orders__view-action"
                    aria-label={`View work order: ${order.title}`}
                    title="View work order"
                  >
                    <Icon name="eye" size={17} />
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}