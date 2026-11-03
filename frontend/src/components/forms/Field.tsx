import {
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { Icon } from "../ui/Icon";

interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  children: (props: { id: string; describedBy?: string; invalid: boolean }) => ReactNode;
}

function Field({ label, hint, error, optional, children }: FieldProps) {
  const id = useId();
  const hintId = hint || error ? `${id}-d` : undefined;
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {optional ? <span className="field-optional">Optional</span> : null}
      </label>
      {children({ id, describedBy: hintId, invalid: Boolean(error) })}
      {error ? (
        <p id={hintId} className="field-error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type Meta = { label: string; hint?: string; error?: string; optional?: boolean };

export function TextField({
  label,
  hint,
  error,
  optional,
  ...rest
}: Meta & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Field label={label} hint={hint} error={error} optional={optional}>
      {({ id, describedBy, invalid }) => (
        <input
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className="input"
          {...rest}
        />
      )}
    </Field>
  );
}

/** Password input with a show/hide control. */
export function PasswordField({
  label,
  hint,
  error,
  ...rest
}: Meta & Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [shown, setShown] = useState(false);
  return (
    <Field label={label} hint={hint} error={error}>
      {({ id, describedBy, invalid }) => (
        <div className="input-wrap">
          <input
            id={id}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            className="input input-with-action"
            type={shown ? "text" : "password"}
            {...rest}
          />
          <button
            type="button"
            className="input-action"
            onClick={() => setShown((s) => !s)}
            aria-label={shown ? "Hide password" : "Show password"}
            aria-pressed={shown}
          >
            <Icon name={shown ? "eyeOff" : "eye"} size={18} />
          </button>
        </div>
      )}
    </Field>
  );
}

export function SelectField({
  label,
  hint,
  error,
  optional,
  children,
  ...rest
}: Meta & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Field label={label} hint={hint} error={error} optional={optional}>
      {({ id, describedBy, invalid }) => (
        <select
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className="input input-select"
          {...rest}
        >
          {children}
        </select>
      )}
    </Field>
  );
}

export function TextAreaField({
  label,
  hint,
  error,
  optional,
  ...rest
}: Meta & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Field label={label} hint={hint} error={error} optional={optional}>
      {({ id, describedBy, invalid }) => (
        <textarea
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className="input"
          rows={3}
          {...rest}
        />
      )}
    </Field>
  );
}

export function CheckboxField({
  label,
  hint,
  ...rest
}: { label: string; hint?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  return (
    <label className="check-field">
      <input type="checkbox" {...rest} />
      <span>
        <span className="check-field-label">{label}</span>
        {hint ? <span className="check-field-hint">{hint}</span> : null}
      </span>
    </label>
  );
}

/** Compact select used inside tables and cards. The accessible name is required. */
export function InlineSelect({
  label,
  children,
  ...rest
}: { label: string } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select aria-label={label} className="input input-select input-compact" {...rest}>
      {children}
    </select>
  );
}
