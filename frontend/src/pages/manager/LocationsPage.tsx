import { useMemo, useState, type FormEvent } from "react";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Icon, type IconName } from "../../components/ui/Icon";
import { Card } from "../../components/ui/Primitives";
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
import type { Location } from "../../types";

interface LocationStat {
  label: string;
  value: number;
  icon: IconName;
  tone: "purple" | "blue" | "green" | "amber";
  helper: string;
}

function distinctFilledCount(values: Array<string | null>) {
  return new Set(
    values
      .map((value) => value?.trim().toLocaleLowerCase() ?? "")
      .filter(Boolean),
  ).size;
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div className="manager-locations__detail-row">
      <span>{label}</span>
      <strong>{value?.trim() || "Not specified"}</strong>
    </div>
  );
}

export function LocationsPage() {
  const { notify } = useToast();
  const { data, error, loading, reload } = useLoad(listLocations);

  const [open, setOpen] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<LocationDraft>(EMPTY_LOCATION);
  const [errors, setErrors] = useState<
    Partial<Record<keyof LocationDraft, string>>
  >({});
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState("");

  const locations = data ?? [];

  const stats = useMemo<LocationStat[]>(
    () => [
      {
        label: "Total locations",
        value: locations.length,
        icon: "mapPin",
        tone: "purple",
        helper: "Saved places",
      },
      {
        label: "Buildings",
        value: distinctFilledCount(locations.map((location) => location.building)),
        icon: "building",
        tone: "blue",
        helper: "Unique buildings",
      },
      {
        label: "Rooms",
        value: distinctFilledCount(locations.map((location) => location.room)),
        icon: "hash",
        tone: "green",
        helper: "Unique room labels",
      },
      {
        label: "Equipment",
        value: distinctFilledCount(locations.map((location) => location.equipment)),
        icon: "settings",
        tone: "amber",
        helper: "Unique equipment items",
      },
    ],
    [locations],
  );

  const filteredLocations = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return locations;

    return locations.filter((location) =>
      [
        location.site,
        location.building,
        location.floor,
        location.room,
        location.equipment,
      ].some((value) => value?.toLocaleLowerCase().includes(normalized)),
    );
  }, [locations, query]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();

    const found = validateLocation(draft);
    setErrors(found);
    if (Object.keys(found).length) return;

    setBusy(true);
    setSaveError("");

    try {
      await createLocation(toLocationInput(draft));
      notify("Location saved.");
      setDraft(EMPTY_LOCATION);
      setErrors({});
      setOpen(false);
      void reload();
    } catch (err) {
      setSaveError(errorMessage(err, "Could not save the location."));
    } finally {
      setBusy(false);
    }
  }

  function openCreateDialog() {
    setDraft(EMPTY_LOCATION);
    setErrors({});
    setSaveError("");
    setOpen(true);
  }

  return (
    <div className="manager-locations">
      <header className="manager-locations__heading">
        <div className="manager-locations__heading-copy">
          <span className="manager-locations__heading-icon" aria-hidden="true">
            <Icon name="mapPin" size={26} />
          </span>

          <div>
            <h1>Locations</h1>
            <p>
              Buildings, floors, rooms and equipment that tasks point to, so
              evidence is tied to the right place.
            </p>
          </div>
        </div>

        <Button
          variant="primary"
          className="manager-locations__new-button"
          onClick={openCreateDialog}
        >
          <Icon name="plus" size={16} />
          New location
        </Button>
      </header>

      {error ? (
        <ErrorState message={error} onRetry={() => void reload()} />
      ) : null}

      {loading && !data ? (
        <section
          className="manager-locations__stats"
          aria-label="Loading location summary"
          aria-busy="true"
        >
          {Array.from({ length: 4 }, (_, index) => (
            <div
              className="manager-locations__stat-skeleton"
              key={index}
            />
          ))}
        </section>
      ) : data ? (
        <section
          className="manager-locations__stats"
          aria-label="Location summary"
        >
          {stats.map((stat) => (
            <article className="manager-locations__stat" key={stat.label}>
              <span
                className={`manager-locations__stat-icon is-${stat.tone}`}
                aria-hidden="true"
              >
                <Icon name={stat.icon} size={21} />
              </span>

              <span className="manager-locations__stat-label">
                {stat.label}
              </span>

              <strong className="manager-locations__stat-value">
                {stat.value}
              </strong>

              <span className="manager-locations__stat-helper">
                {stat.helper}
              </span>
            </article>
          ))}
        </section>
      ) : null}

      <Card className="manager-locations__card">
        <div className="manager-locations__toolbar">
          <div className="manager-locations__toolbar-copy">
            <h2>All locations</h2>
            <p>
              {filteredLocations.length}{" "}
              {filteredLocations.length === 1 ? "location" : "locations"}
              {query.trim() ? " found" : " registered"}
            </p>
          </div>

          <label className="manager-locations__search">
            <Icon name="search" size={17} />
            <span className="sr-only">Search locations</span>
            <input
              type="search"
              placeholder="Search locations..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query ? (
              <button
                type="button"
                className="manager-locations__clear-search"
                onClick={() => setQuery("")}
                aria-label="Clear location search"
              >
                <Icon name="x" size={15} />
              </button>
            ) : null}
          </label>
        </div>

        {loading && !data ? (
          <PageLoading label="Loading locations…" />
        ) : locations.length === 0 && !error ? (
          <EmptyState
            icon="mapPin"
            title="No locations yet"
            action={
              <Button variant="primary" onClick={openCreateDialog}>
                <Icon name="plus" size={16} />
                Add a location
              </Button>
            }
          >
            Add the places your work happens, then select them when creating
            tasks.
          </EmptyState>
        ) : filteredLocations.length === 0 ? (
          <EmptyState icon="search" title="No locations match your search">
            Try another site, building, floor, room, or equipment name.
          </EmptyState>
        ) : (
          <div className="manager-locations__table-wrap">
            <table className="table manager-locations__table">
              <caption className="sr-only">
                Saved sites, buildings, floors, rooms, equipment, and actions
              </caption>

              <thead>
                <tr>
                  <th scope="col">Site</th>
                  <th scope="col">Building</th>
                  <th scope="col">Floor</th>
                  <th scope="col">Room</th>
                  <th scope="col">Equipment</th>
                  <th
                    scope="col"
                    className="manager-locations__actions-heading"
                  >
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredLocations.map((location) => (
                  <tr key={location.id}>
                    <th scope="row">
                      <span className="manager-locations__site-cell">
                        <span
                          className="manager-locations__site-icon"
                          aria-hidden="true"
                        >
                          <Icon name="mapPin" size={17} />
                        </span>
                        <span>{location.site}</span>
                      </span>
                    </th>

                    <td className={!location.building ? "muted" : ""}>
                      {location.building || "Not specified"}
                    </td>

                    <td className={!location.floor ? "muted" : ""}>
                      {location.floor || "Not specified"}
                    </td>

                    <td className={!location.room ? "muted" : ""}>
                      {location.room || "Not specified"}
                    </td>

                    <td className={!location.equipment ? "muted" : ""}>
                      {location.equipment || "Not specified"}
                    </td>

                    <td className="manager-locations__actions-cell">
                      <button
                        type="button"
                        className="manager-locations__view-action"
                        onClick={() => setSelectedLocation(location)}
                        aria-label={`View location: ${location.site}`}
                        title="View location"
                      >
                        <Icon name="eye" size={17} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title="New location"
        description="Only the site is required. Add details so workers know exactly where to capture evidence."
      >
        <form onSubmit={onSubmit} noValidate className="stack">
          <LocationFields
            value={draft}
            onChange={setDraft}
            errors={errors}
            disabled={busy}
          />

          {saveError ? <Alert tone="fail">{saveError}</Alert> : null}

          <div className="dialog-actions">
            <Button
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>

            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "Saving…" : "Save location"}
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={selectedLocation !== null}
        onClose={() => setSelectedLocation(null)}
        title="Location details"
        description="Saved location information used when assigning tasks."
      >
        {selectedLocation ? (
          <div className="manager-locations__detail">
            <div className="manager-locations__detail-site">
              <span className="manager-locations__detail-site-icon">
                <Icon name="mapPin" size={21} />
              </span>
              <div>
                <span>Site</span>
                <strong>{selectedLocation.site}</strong>
              </div>
            </div>

            <DetailRow
              label="Building"
              value={selectedLocation.building}
            />
            <DetailRow label="Floor" value={selectedLocation.floor} />
            <DetailRow label="Room" value={selectedLocation.room} />
            <DetailRow
              label="Equipment"
              value={selectedLocation.equipment}
            />

            <div className="dialog-actions">
              <Button
                variant="secondary"
                onClick={() => setSelectedLocation(null)}
              >
                Close
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}