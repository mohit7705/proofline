import { TextField } from "../../components/forms/Field";
import type { Location, LocationCreateInput } from "../../types";

export interface LocationDraft {
  site: string;
  building: string;
  floor: string;
  room: string;
  equipment: string;
}

export const EMPTY_LOCATION: LocationDraft = { site: "", building: "", floor: "", room: "", equipment: "" };

export function locationLabel(
  l: Pick<Location, "site" | "building" | "floor" | "room" | "equipment">,
): string {
  return [l.site, l.building, l.floor, l.room, l.equipment].filter(Boolean).join(" · ");
}

/** Blank optional fields become null so the API stores them as empty. */
export function toLocationInput(d: LocationDraft): LocationCreateInput {
  const opt = (v: string) => (v.trim() ? v.trim() : null);
  return {
    site: d.site.trim(),
    building: opt(d.building),
    floor: opt(d.floor),
    room: opt(d.room),
    equipment: opt(d.equipment),
  };
}

export function validateLocation(d: LocationDraft): Partial<Record<keyof LocationDraft, string>> {
  const errors: Partial<Record<keyof LocationDraft, string>> = {};
  if (!d.site.trim()) errors.site = "Name the site.";
  else if (d.site.trim().length > 200) errors.site = "Keep the site under 200 characters.";
  if (d.building.length > 200) errors.building = "Keep this under 200 characters.";
  if (d.floor.length > 100) errors.floor = "Keep this under 100 characters.";
  if (d.room.length > 100) errors.room = "Keep this under 100 characters.";
  if (d.equipment.length > 200) errors.equipment = "Keep this under 200 characters.";
  return errors;
}

export function LocationFields({
  value,
  onChange,
  errors,
  disabled,
}: {
  value: LocationDraft;
  onChange: (next: LocationDraft) => void;
  errors?: Partial<Record<keyof LocationDraft, string>>;
  disabled?: boolean;
}) {
  const set = (key: keyof LocationDraft) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [key]: e.target.value });
  return (
    <div className="stack">
      <TextField
        label="Site"
        value={value.site}
        onChange={set("site")}
        error={errors?.site}
        disabled={disabled}
        placeholder="The property or premises"
      />
      <div className="row-2">
        <TextField
          label="Building"
          optional
          value={value.building}
          onChange={set("building")}
          error={errors?.building}
          disabled={disabled}
        />
        <TextField
          label="Floor"
          optional
          value={value.floor}
          onChange={set("floor")}
          error={errors?.floor}
          disabled={disabled}
        />
      </div>
      <div className="row-2">
        <TextField
          label="Room"
          optional
          value={value.room}
          onChange={set("room")}
          error={errors?.room}
          disabled={disabled}
        />
        <TextField
          label="Equipment"
          optional
          value={value.equipment}
          onChange={set("equipment")}
          error={errors?.equipment}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
