import { useState, type FormEvent } from "react";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Icon } from "../../components/ui/Icon";
import { Card, PageHeader } from "../../components/ui/Primitives";
import { Alert, EmptyState, ErrorState } from "../../components/ui/States";
import { PageLoading } from "../../components/ui/Spinner";
import { useToast } from "../../components/ui/Toast";
import {
  EMPTY_LOCATION,
  LocationFields,
  toLocationInput,
  validateLocation,
  type LocationDraft,
} from "../../features/work-orders/LocationFields";
import { useLoad } from "../../hooks/useLoad";
import { createLocation, errorMessage, listLocations } from "../../services/api";

export function LocationsPage() {
  const { notify } = useToast();
  const { data, error, loading, reload } = useLoad(listLocations);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<LocationDraft>(EMPTY_LOCATION);
  const [errors, setErrors] = useState<Partial<Record<keyof LocationDraft, string>>>({});
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const found = validateLocation(draft);
    setErrors(found);
    if (Object.keys(found).length) return;

    setBusy(true);
    setSaveError("");
    try {
      await createLocation(toLocationInput(draft));
      notify("Location saved.");
      setDraft(EMPTY_LOCATION);
      setOpen(false);
      void reload();
    } catch (err) {
      setSaveError(errorMessage(err, "Could not save the location."));
    } finally {
      setBusy(false);
    }
  }

  const locations = data ?? [];

  return (
    <>
      <PageHeader
        title="Locations"
        subtitle="Buildings, floors, rooms and equipment that tasks point to, so a photo is tied to a place."
        actions={
          <Button variant="primary" onClick={() => setOpen(true)}>
            <Icon name="plus" size={16} />
            New location
          </Button>
        }
      />

      {error ? <ErrorState message={error} onRetry={() => void reload()} /> : null}

      <Card>
        {loading && !data ? (
          <PageLoading label="Loading locations…" />
        ) : locations.length === 0 && !error ? (
          <EmptyState
            icon="mapPin"
            title="No locations yet"
            action={
              <Button variant="primary" onClick={() => setOpen(true)}>
                <Icon name="plus" size={16} />
                Add a location
              </Button>
            }
          >
            Add the places your work happens, then pick them when you create tasks.
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <caption className="sr-only">Saved locations</caption>
              <thead>
                <tr>
                  <th scope="col">Site</th>
                  <th scope="col">Building</th>
                  <th scope="col">Floor</th>
                  <th scope="col">Room</th>
                  <th scope="col">Equipment</th>
                </tr>
              </thead>
              <tbody>
                {locations.map((l) => (
                  <tr key={l.id}>
                    <th scope="row">
                      <span className="table-title">
                        <Icon name="mapPin" size={15} /> {l.site}
                      </span>
                    </th>
                    <td className={l.building ? "" : "muted"}>{l.building ?? "None"}</td>
                    <td className={l.floor ? "" : "muted"}>{l.floor ?? "None"}</td>
                    <td className={l.room ? "" : "muted"}>{l.room ?? "None"}</td>
                    <td className={l.equipment ? "" : "muted"}>{l.equipment ?? "None"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="New location"
        description="Only the site is required. Add detail so workers know exactly where to capture evidence."
      >
        <form onSubmit={onSubmit} noValidate className="stack">
          <LocationFields value={draft} onChange={setDraft} errors={errors} disabled={busy} />
          {saveError ? <Alert tone="fail">{saveError}</Alert> : null}
          <div className="dialog-actions">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "Saving…" : "Save location"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
