import { useState, type FormEvent } from "react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Primitives";
import { useToast } from "../../components/ui/Toast";
import { createUser, errorMessage, type ManagedUser } from "../../services/api";
import type { Role } from "../../types";

/** A manager adds a person and sets the role in one step. */
export function AddMemberForm({ onAdded }: { onAdded: (user: ManagedUser) => void }) {
  const { notify } = useToast();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("worker");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const user = await createUser({ full_name: fullName.trim(), email: email.trim(), password, role });
      onAdded(user);
      notify(`Added ${user.email}. Share the temporary password in person.`);
      setFullName("");
      setEmail("");
      setPassword("");
      setRole("worker");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <form className="add-member" onSubmit={(event) => void submit(event)}>
        <h3>Add team member</h3>
        <label>
          Full name
          <input
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            minLength={2}
            maxLength={200}
            required
          />
        </label>
        <label>
          Email
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label>
          Temporary password (12 or more characters)
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
            required
          />
        </label>
        <label>
          Role
          <select value={role} onChange={(event) => setRole(event.target.value as Role)}>
            <option value="worker">Worker</option>
            <option value="manager">Manager</option>
          </select>
        </label>
        {error ? (
          <p role="alert" className="ba-error">
            {error}
          </p>
        ) : null}
        <Button variant="primary" type="submit" disabled={saving}>
          {saving ? "Adding…" : "Add member"}
        </Button>
      </form>
    </Card>
  );
}
