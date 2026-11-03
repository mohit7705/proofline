import { useMemo } from "react";
import { useLoad } from "../../hooks/useLoad";
import { listUsers, type ManagedUser } from "../../services/api";

/** Registered users, for resolving names and offering active workers as assignees. Managers only. */
export function useUsers() {
  const { data, error, loading, reload, setData } = useLoad(listUsers);

  const users = useMemo(() => data ?? [], [data]);
  const byId = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const workers = useMemo(() => users.filter((u) => u.role === "worker" && u.is_active), [users]);

  const nameOf = (id: string | null | undefined): string => {
    if (!id) return "Unassigned";
    return byId.get(id)?.full_name ?? "Unknown user";
  };

  return {
    users,
    workers,
    byId,
    nameOf,
    error,
    loading,
    reload,
    setUsers: (next: ManagedUser[]) => setData(next),
  };
}
