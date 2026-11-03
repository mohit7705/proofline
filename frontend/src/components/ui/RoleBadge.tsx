import type { Role } from "../../types";

const LABEL: Record<Role, string> = { manager: "Manager", worker: "Worker" };

/** Role as a coloured pill. Always text, never colour alone. */
export function RoleBadge({ role }: { role: Role }) {
  return <span className={`role-badge role-${role}`}>{LABEL[role]}</span>;
}

export function SelfCreatedTag() {
  return <span className="role-badge role-self">Self-created</span>;
}
