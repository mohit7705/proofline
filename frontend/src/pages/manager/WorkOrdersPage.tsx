import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { InlineSelect } from "../../components/forms/Field";
import { ButtonLink } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { Card, PageHeader, Pagination, Tabs } from "../../components/ui/Primitives";
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

const MATCH: Record<Filter, (o: WorkOrder) => boolean> = {
  all: () => true,
  active: isActive,
  review: (o) => isAwaitingReview(o.status),
  overdue: (o) => isOverdue(o),
  draft: (o) => o.status === "draft",
  done: (o) => isTerminal(o.status),
};

export function WorkOrdersPage() {
  const [params, setParams] = useSearchParams();
  const filter = (params.get("filter") as Filter) in MATCH ? (params.get("filter") as Filter) : "all";
  const [query, setQuery] = useState("");
  const [assignee, setAssignee] = useState("");
  const [page, setPage] = useState(0);

  const { data, error, loading, reload } = useLoad(listAllWorkOrders);
  const { users, nameOf } = useUsers();
  const orders = useMemo(() => data?.orders ?? [], [data]);

  const counts = useMemo(
    () =>
      Object.fromEntries(
        (Object.keys(MATCH) as Filter[]).map((f) => [f, orders.filter(MATCH[f]).length]),
      ) as Record<Filter, number>,
    [orders],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders
      .filter(MATCH[filter])
      .filter((o) =>
        assignee === "" ? true : assignee === "none" ? !o.assigned_to : o.assigned_to === assignee,
      )
      .filter((o) =>
        q ? o.title.toLowerCase().includes(q) || o.description.toLowerCase().includes(q) : true,
      );
  }, [orders, filter, assignee, query]);

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const rows = visible.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  return (
    <>
      <PageHeader
        title="Work orders"
        subtitle="Every job, with its status, owner and due date."
        actions={
          <ButtonLink to="/manager/work-orders/new" variant="primary">
            <Icon name="plus" size={16} />
            New work order
          </ButtonLink>
        }
      />

      {error ? <ErrorState message={error} onRetry={() => void reload()} /> : null}

      <Card>
        <div className="toolbar">
          <Tabs<Filter>
            label="Filter work orders"
            value={filter}
            onChange={(f) => {
              setParams(f === "all" ? {} : { filter: f });
              setPage(0);
            }}
            tabs={[
              { id: "all", label: "All", count: counts.all },
              { id: "active", label: "Active", count: counts.active },
              { id: "review", label: "Awaiting review", count: counts.review },
              { id: "overdue", label: "Overdue", count: counts.overdue },
              { id: "draft", label: "Drafts", count: counts.draft },
              { id: "done", label: "Closed", count: counts.done },
            ]}
          />
          <div className="toolbar-right">
            <label className="search">
              <Icon name="search" size={16} />
              <span className="sr-only">Search work orders</span>
              <input
                type="search"
                placeholder="Search work orders"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
              />
            </label>
            <InlineSelect
              label="Filter by assignee"
              value={assignee}
              onChange={(e) => {
                setAssignee(e.target.value);
                setPage(0);
              }}
            >
              <option value="">All workers</option>
              <option value="none">Unassigned</option>
              {users
                .filter((u) => u.role === "worker")
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name}
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
              <ButtonLink to="/manager/work-orders/new" variant="primary">
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
            <Pagination
              page={safePage}
              pageCount={pageCount}
              onPage={setPage}
              total={visible.length}
              pageSize={PAGE_SIZE}
            />
          </>
        )}
        {data?.truncated ? (
          <p className="muted small">Showing the most recent {orders.length} work orders.</p>
        ) : null}
      </Card>
    </>
  );
}
