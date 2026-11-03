import { useMemo, useState } from "react";
import { InlineSelect } from "../../components/forms/Field";
import { Avatar, Card, PageHeader, Tabs } from "../../components/ui/Primitives";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { Alert, EmptyState, ErrorState } from "../../components/ui/States";
import { PageLoading } from "../../components/ui/Spinner";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { useToast } from "../../components/ui/Toast";
import { useAuth } from "../../features/auth/AuthContext";
import { AddMemberForm } from "../../features/manager/AddMemberForm";
import { useLoad } from "../../hooks/useLoad";
import { errorMessage, listUsers, updateUserRole } from "../../services/api";
import type { Role } from "../../types";

type RoleFilter = "all" | Role;

const ROLE_TONE = { manager: "review", worker: "pending" } as const;

export function TeamPage() {
  const { user: currentUser } = useAuth();
  const { notify } = useToast();
  const { data: users, error, loading, reload, setData } = useLoad(listUsers);
  const [draftRoles, setDraftRoles] = useState<Record<string, Role>>({});
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState("");
  const [filter, setFilter] = useState<RoleFilter>("all");

  const list = useMemo(() => users ?? [], [users]);
  const counts = useMemo(
    () => ({
      all: list.length,
      manager: list.filter((u) => u.role === "manager").length,
      worker: list.filter((u) => u.role === "worker").length,
    }),
    [list],
  );
  const shown = filter === "all" ? list : list.filter((u) => u.role === filter);

  async function saveUserRole(userId: string) {
    const role = draftRoles[userId];
    if (!role) return;
    setSavingUserId(userId);
    setSaveError("");
    try {
      const updated = await updateUserRole(userId, role);
      setData((current) => (current ? current.map((u) => (u.id === userId ? updated : u)) : current));
      setDraftRoles((current) => {
        const next = { ...current };
        delete next[userId];
        return next;
      });
      notify(`Role updated for ${updated.email}.`);
    } catch (err) {
      setSaveError(errorMessage(err, "Could not update role."));
    } finally {
      setSavingUserId(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Team and roles"
        subtitle="New accounts start as workers. Assign managers and workers here."
        actions={
          <Button onClick={() => void reload()}>
            <Icon name="refresh" size={16} />
            Refresh
          </Button>
        }
      />

      {error ? <ErrorState message={error} onRetry={() => void reload()} /> : null}
      {saveError ? <Alert tone="fail">{saveError}</Alert> : null}
      <AddMemberForm onAdded={(added) => setData((current) => (current ? [...current, added] : [added]))} />

      <Card>
        <Tabs<RoleFilter>
          label="Filter by role"
          value={filter}
          onChange={setFilter}
          tabs={[
            { id: "all", label: "Everyone", count: counts.all },
            { id: "manager", label: "Managers", count: counts.manager },
            { id: "worker", label: "Workers", count: counts.worker },
          ]}
        />

        {loading && !users ? (
          <PageLoading label="Loading registered users…" />
        ) : shown.length === 0 && !error ? (
          <EmptyState icon="users" title="No users found">
            {filter === "all" ? "Registered users appear here." : "No one has this role yet."}
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <caption className="sr-only">Registered users and their roles</caption>
              <thead>
                <tr>
                  <th scope="col">User</th>
                  <th scope="col">Current role</th>
                  <th scope="col">Account</th>
                  <th scope="col">Assign role</th>
                  <th scope="col">
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((managedUser) => {
                  const isSelf = managedUser.email.toLowerCase() === currentUser?.email.toLowerCase();
                  const draft = draftRoles[managedUser.id] ?? managedUser.role;
                  return (
                    <tr key={managedUser.id}>
                      <th scope="row">
                        <span className="person">
                          <Avatar name={managedUser.full_name} />
                          <span>
                            <span className="table-title">{managedUser.full_name}</span>
                            <span className="table-meta">{managedUser.email}</span>
                          </span>
                        </span>
                      </th>
                      <td>
                        <StatusBadge
                          label={managedUser.role[0].toUpperCase() + managedUser.role.slice(1)}
                          tone={ROLE_TONE[managedUser.role]}
                          icon="user"
                        />
                      </td>
                      <td>
                        <span className={managedUser.is_active ? "" : "muted"}>
                          {managedUser.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td>
                        <InlineSelect
                          label={`Role for ${managedUser.email}`}
                          value={draft}
                          disabled={savingUserId === managedUser.id || isSelf}
                          onChange={(event) =>
                            setDraftRoles((current) => ({
                              ...current,
                              [managedUser.id]: event.target.value as Role,
                            }))
                          }
                        >
                          <option value="worker">Worker</option>
                          <option value="manager">Manager</option>
                        </InlineSelect>
                      </td>
                      <td className="table-act">
                        <Button
                          size="s"
                          disabled={savingUserId === managedUser.id || draft === managedUser.role || isSelf}
                          onClick={() => void saveUserRole(managedUser.id)}
                        >
                          {savingUserId === managedUser.id ? "Saving…" : "Save"}
                        </Button>
                        {isSelf ? <span className="table-meta">Cannot change own role</span> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
