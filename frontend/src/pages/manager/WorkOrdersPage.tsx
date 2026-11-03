import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { InlineSelect } from "../../components/forms/Field";
import { ButtonLink } from "../../components/ui/Button";
import { Icon, type IconName } from "../../components/ui/Icon";
import { Card, Pagination, Tabs } from "../../components/ui/Primitives";
import { EmptyState, ErrorState } from "../../components/ui/States";
import { PageLoading } from "../../components/ui/Spinner";
import { WorkOrderTable } from "../../features/manager/WorkOrderTable";
import { useUsers } from "../../features/manager/useUsers";
import { useLoad } from "../../hooks/useLoad";
import { isActive, isAwaitingReview, isOverdue, isTerminal } from "../../lib/status";
import { listAllWorkOrders } from "../../services/api";
import type { WorkOrder } from "../../types";

const PAGE_SIZE = 10;

type Filter = "all" | "active" | "review" | "overdue" | "draft" | "done";

const MATCH: Record<Filter, (order: WorkOrder) => boolean> = {
  all: () => true,
  active: isActive,
  review: (order) => isAwaitingReview(order.status),
  overdue: (order) => isOverdue(order),
  draft: (order) => order.status === "draft",
  done: (order) => isTerminal(order.status),
};

interface StatCard {
  label: string;
  value: number;
  icon: IconName;
  tone: "purple" | "blue" | "red" | "green" | "amber";
  detail: string;
}

export function WorkOrdersPage() {
  const [params, setParams] = useSearchParams();
  const requestedFilter = params.get("filter") as Filter | null;
  const filter: Filter =
    requestedFilter && requestedFilter in MATCH ? requestedFilter : "all";

  const [query, setQuery] = useState("");
  const [assignee, setAssignee] = useState("");
  const [page, setPage] = useState(0);

  const { data, error, loading, reload } = useLoad(listAllWorkOrders);
  const { users, nameOf } = useUsers();
  const orders = useMemo(() => data?.orders ?? [], [data]);

  const counts = useMemo(
    () =>
      Object.fromEntries(
        (Object.keys(MATCH) as Filter[]).map((key) => [
          key,
          orders.filter(MATCH[key]).length,
        ]),
      ) as Record<Filter, number>,
    [orders],
  );

  const stats = useMemo<StatCard[]>(
    () => [
      {
        label: "Total work orders",
        value: orders.length,
        icon: "clipboard",
        tone: "purple",
        detail: "All recorded work",
      },
      {
        label: "Active",
        value: counts.active,
        icon: "play",
        tone: "blue",
        detail: "Currently in progress",
      },
      {
        label: "Overdue",
        value: counts.overdue,
        icon: "alert",
        tone: "red",
        detail: "Past the due date",
      },
      {
        label: "Awaiting review",
        value: counts.review,
        icon: "eye",
        tone: "green",
        detail: "Submitted for review",
      },
      {
        label: "Unassigned",
        value: orders.filter((order) => !order.assigned_to).length,
        icon: "user",
        tone: "amber",
        detail: "Need a worker",
      },
    ],
    [orders, counts],
  );

  const visible = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return orders
      .filter(MATCH[filter])
      .filter((order) =>
        assignee === ""
          ? true
          : assignee === "none"
            ? !order.assigned_to
            : order.assigned_to === assignee,
      )
      .filter((order) =>
        normalizedQuery
          ? order.title.toLowerCase().includes(normalizedQuery) ||
            order.description.toLowerCase().includes(normalizedQuery)
          : true,
      );
  }, [orders, filter, assignee, query]);

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const rows = visible.slice(
    safePage * PAGE_SIZE,
    (safePage + 1) * PAGE_SIZE,
  );

  const changeFilter = (nextFilter: Filter) => {
    setParams(nextFilter === "all" ? {} : { filter: nextFilter });
    setPage(0);
  };

  return (
    <div className="manager-work-orders">
      <header className="manager-work-orders__heading">
        <div className="manager-work-orders__heading-copy">
          <span className="manager-work-orders__heading-icon" aria-hidden="true">
            <Icon name="layers" size={25} />
          </span>
          <div>
            <h1>Work orders</h1>
            <p>Every job, with its status, owner, and due date in one place.</p>
          </div>
        </div>

        <ButtonLink
          to="/manager/work-orders/new"
          variant="primary"
          className="manager-work-orders__new-button"
        >
          <Icon name="plus" size={16} />
          New work order
        </ButtonLink>
      </header>

      {error ? <ErrorState message={error} onRetry={() => void reload()} /> : null}

      {loading && !data ? (
        <div
          className="manager-work-orders__stats"
          aria-busy="true"
          aria-label="Loading work order summary"
        >
          {Array.from({ length: 5 }, (_, index) => (
            <div
              className="manager-work-orders__stat-skeleton"
              key={index}
            />
          ))}
        </div>
      ) : data ? (
        <section
          className="manager-work-orders__stats"
          aria-label="Work order summary"
        >
          {stats.map((stat) => (
            <article
              className="manager-work-orders__stat"
              key={stat.label}
            >
              <span
                className={`manager-work-orders__stat-icon is-${stat.tone}`}
                aria-hidden="true"
              >
                <Icon name={stat.icon} size={20} />
              </span>
              <span className="manager-work-orders__stat-label">
                {stat.label}
              </span>
              <strong className="manager-work-orders__stat-value">
                {stat.value}
              </strong>
              <span className="manager-work-orders__stat-detail">
                {stat.detail}
              </span>
            </article>
          ))}
        </section>
      ) : null}

      <Card>
        <section className="manager-work-orders__workspace">
          <div className="manager-work-orders__toolbar">
            <div className="manager-work-orders__tabs">
              <Tabs<Filter>
                label="Filter work orders"
                value={filter}
                onChange={changeFilter}
                tabs={[
                  { id: "all", label: "All", count: counts.all },
                  { id: "active", label: "Active", count: counts.active },
                  { id: "review", label: "Awaiting review", count: counts.review },
                  { id: "overdue", label: "Overdue", count: counts.overdue },
                  { id: "draft", label: "Drafts", count: counts.draft },
                  { id: "done", label: "Closed", count: counts.done },
                ]}
              />
            </div>

            <div className="manager-work-orders__filters">
              <label className="manager-work-orders__search">
                <Icon name="search" size={16} />
                <span className="sr-only">Search work orders</span>
                <input
                  type="search"
                  placeholder="Search work orders..."
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(0);
                  }}
                />
              </label>

              <InlineSelect
                label="Filter by assignee"
                value={assignee}
                onChange={(event) => {
                  setAssignee(event.target.value);
                  setPage(0);
                }}
              >
                <option value="">All workers</option>
                <option value="none">Unassigned</option>
                {users
                  .filter((user) => user.role === "worker")
                  .map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.full_name}
                    </option>
                  ))}
              </InlineSelect>
            </div>
          </div>

          {loading && !data ? (
            <PageLoading label="Loading work orders…" />
          ) : orders.length === 0 && !error ? (
            <EmptyState
              icon="clipboard"
              title="No work orders yet"
              action={
                <ButtonLink
                  to="/manager/work-orders/new"
                  variant="primary"
                >
                  <Icon name="plus" size={16} />
                  Create a work order
                </ButtonLink>
              }
            >
              Create one, add tasks with a checklist, and assign it to a worker.
            </EmptyState>
          ) : visible.length === 0 ? (
            <EmptyState icon="search" title="No work orders match">
              Try a different filter or clear the search.
            </EmptyState>
          ) : (
            <>
              <WorkOrderTable orders={rows} assigneeName={nameOf} />
              <div className="manager-work-orders__pagination">
                <Pagination
                  page={safePage}
                  pageCount={pageCount}
                  onPage={setPage}
                  total={visible.length}
                  pageSize={PAGE_SIZE}
                />
              </div>
            </>
          )}

          {data?.truncated ? (
            <p className="manager-work-orders__truncated">
              Showing the most recent {orders.length} work orders.
            </p>
          ) : null}
        </section>
      </Card>
    </div>
  );
}