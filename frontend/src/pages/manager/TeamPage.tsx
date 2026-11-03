import { useMemo, useState } from "react";
import { InlineSelect } from "../../components/forms/Field";
import { Avatar, Card, Tabs } from "../../components/ui/Primitives";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { Alert, EmptyState, ErrorState } from "../../components/ui/States";
import { PageLoading } from "../../components/ui/Spinner";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { useToast } from "../../components/ui/Toast";
import { useAuth } from "../../features/auth/AuthContext";
import { AddMemberForm } from "../../features/manager/AddMemberForm";
import { useLoad } from "../../hooks/useLoad";
import {
  errorMessage,
  listUsers,
  updateUserRole,
  type ManagedUser,
} from "../../services/api";
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
  const [query, setQuery] = useState("");

  const list = useMemo(() => users ?? [], [users]);

  const counts = useMemo(
    () => ({
      all: list.length,
      manager: list.filter((user) => user.role === "manager").length,
      worker: list.filter((user) => user.role === "worker").length,
    }),
    [list],
  );

  const shown = useMemo(() => {
    const roleFiltered =
      filter === "all" ? list : list.filter((user) => user.role === filter);

    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return roleFiltered;

    return roleFiltered.filter((user) =>
      [
        user.full_name,
        user.email,
        user.role,
        user.is_active ? "active" : "inactive",
      ].some((value) => value.toLocaleLowerCase().includes(normalized)),
    );
  }, [filter, list, query]);

  async function saveUserRole(userId: string) {
    const role = draftRoles[userId];
    if (!role) return;

    setSavingUserId(userId);
    setSaveError("");

    try {
      const updated = await updateUserRole(userId, role);

      setData((current) =>
        current
          ? current.map((user) => (user.id === userId ? updated : user))
          : current,
      );

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

  function handleMemberAdded(added: ManagedUser) {
    setData((current) => (current ? [...current, added] : [added]));
  }

  return (
    <div className="manager-team">
      <header className="manager-team__heading">
        <div className="manager-team__heading-copy">
          <span className="manager-team__heading-icon" aria-hidden="true">
            <Icon name="users" size={27} />
          </span>

          <div>
            <h1>Team and roles</h1>
            <p>
              Add new accounts, assign roles, and manage your team.
            </p>
          </div>
        </div>

        <Button
          onClick={() => void reload()}
          disabled={loading}
          className="manager-team__refresh"
        >
          <Icon name="refresh" size={16} />
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
      </header>

      {error ? (
        <ErrorState message={error} onRetry={() => void reload()} />
      ) : null}

      {saveError ? <Alert tone="fail">{saveError}</Alert> : null}

      <div className="manager-team__add-card">
        <AddMemberForm onAdded={handleMemberAdded} />
      </div>

      <Card className="manager-team__members-card">
        <div className="manager-team__toolbar">
          <Tabs<RoleFilter>
            label="Filter team members by role"
            value={filter}
            onChange={setFilter}
            tabs={[
              { id: "all", label: "Everyone", count: counts.all },
              { id: "manager", label: "Managers", count: counts.manager },
              { id: "worker", label: "Workers", count: counts.worker },
            ]}
          />

          <label className="manager-team__search">
            <Icon name="search" size={17} />
            <span className="sr-only">Search team members</span>
            <input
              type="search"
              placeholder="Search team members..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query ? (
              <button
                type="button"
                className="manager-team__clear-search"
                onClick={() => setQuery("")}
                aria-label="Clear team member search"
              >
                <Icon name="x" size={15} />
              </button>
            ) : null}
          </label>
        </div>

        {loading && !users ? (
          <PageLoading label="Loading registered users…" />
        ) : shown.length === 0 && !error ? (
          <EmptyState
            icon="users"
            title={query.trim() ? "No team members match your search" : "No users found"}
          >
            {query.trim()
              ? "Try another name, email, role, or account status."
              : filter === "all"
                ? "Registered users appear here."
                : "No one has this role yet."}
          </EmptyState>
        ) : (
          <div className="manager-team__table-wrap">
            <table className="table manager-team__table">
              <caption className="sr-only">
                Registered team members, account status, and role assignment
              </caption>

              <thead>
                <tr>
                  <th scope="col">User</th>
                  <th scope="col">Current role</th>
                  <th scope="col">Account</th>
                  <th scope="col">Assign role</th>
                  <th scope="col" className="manager-team__actions-heading">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody>
                {shown.map((managedUser) => {
                  const isSelf =
                    managedUser.email.toLowerCase() ===
                    currentUser?.email.toLowerCase();

                  const draft =
                    draftRoles[managedUser.id] ?? managedUser.role;

                  const hasRoleChange = draft !== managedUser.role;
                  const isSaving = savingUserId === managedUser.id;

                  return (
                    <tr key={managedUser.id}>
                      <th scope="row">
                        <span className="person manager-team__person">
                          <Avatar name={managedUser.full_name} size={36} />

                          <span className="manager-team__person-copy">
                            <span className="table-title">
                              {managedUser.full_name}
                            </span>
                            <span className="table-meta">
                              {managedUser.email}
                            </span>
                          </span>
                        </span>
                      </th>

                      <td>
                        <StatusBadge
                          label={
                            managedUser.role[0].toUpperCase() +
                            managedUser.role.slice(1)
                          }
                          tone={ROLE_TONE[managedUser.role]}
                          icon="user"
                        />
                      </td>

                      <td>
                        <span
                          className={
                            managedUser.is_active
                              ? "manager-team__account-active"
                              : "manager-team__account-inactive"
                          }
                        >
                          <span aria-hidden="true" />
                          {managedUser.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>

                      <td>
                        <InlineSelect
                          label={`Role for ${managedUser.email}`}
                          value={draft}
                          disabled={isSaving || isSelf}
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

                      <td className="manager-team__actions-cell">
                        <Button
                          size="s"
                          variant={hasRoleChange ? "primary" : "secondary"}
                          className="manager-team__save-button"
                          disabled={isSaving || !hasRoleChange || isSelf}
                          onClick={() => void saveUserRole(managedUser.id)}
                        >
                          {isSaving ? (
                            "Saving…"
                          ) : (
                            <>
                              <Icon name="check" size={14} />
                              Save
                            </>
                          )}
                        </Button>

                        {isSelf ? (
                          <span className="manager-team__self-note">
                            Cannot change own role
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="manager-team__table-footer">
          <span>
            Showing {shown.length} of {list.length} team members
          </span>
          {query.trim() ? (
            <button type="button" onClick={() => setQuery("")}>
              Clear search
            </button>
          ) : null}
        </div>
      </Card>
    </div>
  );
}