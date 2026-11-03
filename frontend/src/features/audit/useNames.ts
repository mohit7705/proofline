import { useCallback } from "react";
import { useLoad } from "../../hooks/useLoad";
import { shortId } from "../../lib/format";
import { getDirectory, listUsers } from "../../services/api";
import { useAuth } from "../auth/AuthContext";

interface Named {
  id: string;
  full_name: string;
}

/** Turns a user id into a name. Anyone the server won't name shows as a short id. */
export function useNames() {
  const { user } = useAuth();
  const role = user?.role;
  const staff = role === "manager";

  const { data } = useLoad(async (): Promise<Named[]> => {
    if (!staff) return [];
    try {
      return await getDirectory();
    } catch {
      // No directory route on this server: a manager may still list users.
      return role === "manager" ? await listUsers().catch(() => []) : [];
    }
  }, [role]);

  return useCallback(
    (id: string | null | undefined): string => {
      if (!id) return "System";
      return data?.find((u) => u.id === id)?.full_name ?? `User ${shortId(id)}`;
    },
    [data],
  );
}
