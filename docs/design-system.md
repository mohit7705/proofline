# Proofline design system

This describes what is in the code today. The source of truth is `frontend/src/styles/tokens.css`. If this document
and the CSS disagree, the CSS wins and this document needs an update.

## Principles

1. **Evidence first.** Screens show what was captured, what was checked and what is still open. Nothing is decorative.
2. **Colour is never the only signal.** Every status carries an icon and a word as well as a colour.
3. **Say what happened.** Errors explain the problem and the fix. Empty screens tell the person what to do next.
4. **Never fake certainty.** A screen that waits on the backend says so ("waiting on the backend"). Nothing shows made-up data.
5. **Navigation is not security.** Hiding a route is a courtesy. The backend decides who may do what.

## Colour

### Core

| Token | Value | Use |
|---|---|---|
| `--ink` | `#0f1530` | Headings and body text |
| `--ink-2` | `#3a4262` | Secondary text |
| `--ink-3` | `#5f6988` | Muted text, hints (see the accessibility note below) |
| `--paper` | `#f4f5fa` | Page background |
| `--surface` | `#ffffff` | Cards, inputs, tables |
| `--surface-2` | `#eef0f8` | Table headers, subtle panels |
| `--line`, `--line-strong` | `#e2e5f0`, `#cdd2e3` | Dividers, input borders |
| `--brand` | `#2d4bff` | Primary buttons, links, focus ring, selection |
| `--brand-hover` | `#2039d6` | Primary button on hover |
| `--brand-soft` | `#e6eaff` | Soft brand fills (avatar, selected rows) |
| `--dark`, `--dark-2`, `--dark-3` | `#0f1530`, `#171e42`, `#202853` | Sidebar, auth side panel, dark sections |
| `--on-dark`, `--on-dark-2` | `#f4f5ff`, `#aab2d6` | Text on dark surfaces |

### Status tones

Each tone has a text colour and a soft background. Badges use both.

| Tone | Text | Soft background | Meaning |
|---|---|---|---|
| `ok` | `#0a7a52` | `#dcf5ea` | Done, approved, verified |
| `warn` | `#9a5b00` | `#fdeecb` | More evidence needed, needs attention |
| `fail` | `#c62828` | `#fde4e2` | Rejected, failed, overdue |
| `review` | `#6b3fd4` | `#ece6fc` | Waiting for a person to decide |
| `pending` | `#5d6684` | `#e9ebf4` | Not started, draft, cancelled |
| `info` | `#2039d6` | `#e6eaff` | Open, in progress |

### Where each status shows

**Work order status** (`lib/status.ts`, `WORK_ORDER_STATUS`)

| Status | Label | Tone |
|---|---|---|
| `draft` | Draft | pending |
| `open` | Open | info |
| `in_progress` | In progress | info |
| `submitted` | Submitted | review |
| `under_review` | Under review | review |
| `approved` | Approved | ok |
| `rejected` | Rejected | fail |
| `cancelled` | Cancelled | pending |

**Task status** (`TASK_STATUS`)

| Status | Label | Tone |
|---|---|---|
| `pending` | Not started | pending |
| `in_progress` | In progress | info |
| `submitted` | Awaiting review | review |
| `approved` | Approved | ok |
| `rejected` | Needs correction | fail |

**Decision states** from the evidence gate (`VERDICTS`)

| Verdict | Label | Tone | Meaning |
|---|---|---|---|
| `verified` | Verified | ok | Every required check is backed by a real frame and nothing looks off |
| `needs_evidence` | Needs more evidence | warn | A view is missing, blocked or too far away to judge |
| `failed` | Failed inspection | fail | The footage clearly shows a required condition is not met |
| `needs_review` | Needs human review | review | The evidence conflicts, looks reused, or is beyond what the checks can settle |
| `pending` | Waiting for evidence | pending | Nothing submitted yet |

## Typography

| Role | Family | Used for |
|---|---|---|
| Display | Bricolage Grotesque (`--font-display`) | Headings, big numbers, the logo |
| Text | Schibsted Grotesk (`--font-body`) | Everything else |
| Mono | System monospace (`--font-mono`) | Hashes and ids |

Both web fonts load from Google Fonts in `index.html`, with `Segoe UI` and the system font as fallbacks.

Fluid scale (smallest to largest, in `rem`, growing with the screen width):

| Token | Range | Typical use |
|---|---|---|
| `--step--1` | 0.80 to 0.86 | Hints, table text, badges |
| `--step-0` | 0.94 to 1.03 | Body |
| `--step-1` | 1.10 to 1.28 | Panel titles |
| `--step-2` | 1.40 to 1.80 | Section titles |
| `--step-3` | 1.85 to 2.70 | Page titles, big numbers |
| `--step-4` | 2.50 to 4.50 | Landing hero |

Headings use tight letter spacing and `text-wrap: balance`. Line length stays under about 75 characters.

## Layout, shape and depth

- **Container:** `--max` is 76rem. Side padding `--gutter` grows from 1rem to 2.5rem.
- **App shell:** a 16.5rem dark sidebar (`--sidebar`) with the role's navigation, a top bar with the notification bell, and the page inside `<main id="main">`. On narrow screens the sidebar becomes a slide-in menu.
- **Spacing:** not tokenised yet. Only `--gutter` and `--max` are tokens. Spacing is written directly in `rem` in the stylesheets.
- **Radius:** `--r-xs` 6px (focus outlines), `--r-s` 10px (inputs, buttons), `--r-m` 14px (cards), `--r-l` 22px (dialogs, hero cards).
- **Shadow:** `--shadow-s` for resting cards, `--shadow-m` for raised elements, `--shadow-l` for dialogs. `--ring` is the soft focus glow on inputs.
- **Signature detail:** viewfinder corner brackets (`.bracketed`) mark anything that is being inspected.
- **Motion:** the landing frame scans once and its regions resolve in turn. Everything else uses short transitions with `--ease`. `prefers-reduced-motion` turns animation off.

### Breakpoints

Written as `max-width` queries in `rem` (16px = 1rem). The main layout switch is at 60rem (960px).

| Width | Typical change |
|---|---|
| 72rem and 66rem | Wide grids lose a column |
| 60rem (960px) | Sidebar collapses to a menu, two-column pages stack |
| 52rem and 48rem | Tables scroll sideways, tabs get tighter |
| 40rem and 36rem | Forms and rows become one column |

## Components

### Buttons and links (`components/ui/Button.tsx`)

| Component | Notes |
|---|---|
| `Button` | `variant`: `primary`, `secondary` (default), `ghost`, `danger`, `dark`, `outline-light`. `size`: `s`, `m` (default), `l`. Defaults to `type="button"` |
| `ButtonLink` | Same look as `Button`, renders a router link |
| `IconButton` | Icon only. `label` is required and becomes the accessible name |

Use one `primary` button per screen area. Use `danger` only for actions that cannot be undone.

### Forms (`components/forms/Field.tsx`)

`TextField`, `PasswordField`, `SelectField`, `TextAreaField`, `CheckboxField`, `InlineSelect`. Each wires its label, hint and error to the input with `aria-describedby`, and sets `aria-invalid` when there is an error.

### Status and feedback

| Component | Use |
|---|---|
| `StatusBadge` | A status as icon, word and colour |
| `VerdictBadge` | A decision state. `short` gives the compact label |
| `Alert` | An inline message with a tone |
| `ErrorState` | A failed load with a Try again button |
| `EmptyState` | An empty list with an icon, a title and what to do next |
| `PendingBackend` | "This feature is waiting on the backend" notice |
| `Toast` (`useToast().notify`) | A short confirmation. Announced politely to screen readers |
| `Spinner`, `Skeleton`, `PageLoading` | Loading states. `PageLoading` takes a label |

### Structure

| Component | Use |
|---|---|
| `Card`, `CardHeader` | A titled surface |
| `PageHeader` | Page title, subtitle and actions. Renders the page's one `h1` |
| `Stat` | A number with a label |
| `Tabs`, `Pagination`, `Stepper` | Switching, paging and the creation wizard |
| `ProgressBar` | Progress with an accessible label |
| `Avatar` | Initials in a circle |
| `Dialog`, `ConfirmDialog` | Built on the native `<dialog>`: focus trap, Escape and backdrop come from the browser |

### Layout

`AppShell` (role-aware frame), `AuthLayout` (sign in and register), `PublicNav`, `Footer`, `Logo`, `ActionCenter` (the notification bell, built from real work orders), `ScrollManager` (scroll and page title).

### Evidence

`EvidenceList`, `MediaViewer` (video and image with timestamp seeking), `EvidenceCompare` (two files side by side, warns when both share one SHA-256), `RequirementCoverage` (each checklist item against the files that cover it), `InspectionFrame` (the illustrated example on the landing page).

## Page map

| Route | Who | Purpose | Backend it uses |
|---|---|---|---|
| `/` | Everyone | Landing: the problem, how a decision is made, the four outcomes, fake-evidence defences, models | none |
| `/how-it-works` | Everyone | The decision process in detail | none |
| `/security` | Everyone | Security and privacy | none |
| `/login` | Signed out | Email and password, or Google | `POST /auth/login`, `POST /auth/google`, `GET /auth/me` |
| `/register` | Signed out | Create a manager or worker account | `POST /auth/register`, then login |
| `/manager` | Manager | Overview: open, overdue, awaiting review, unassigned, due soon | `GET /work-orders`, `GET /users` |
| `/manager/work-orders` | Manager | Search, filter and page through every work order | `GET /work-orders`, `GET /users` |
| `/manager/work-orders/new` | Manager | Wizard: details, tasks and checklist, review | `POST /work-orders`, `/tasks`, `/requirements`, `/locations`, `PATCH /work-orders/{id}` |
| `/manager/work-orders/:orderId` | Manager | Detail: status actions, tasks, checklists, report | work-order, task, requirement and evidence routes |
| `/manager/locations` | Manager | Sites, buildings, floors, rooms, equipment | `GET/POST /locations` |
| `/manager/team` | Manager | See users and change roles | `GET /users`, `PATCH /users/{id}/role` |
| `/worker` | Worker | Assigned tasks, what to capture, upload with progress | `GET /work-orders`, `/tasks`, `/requirements`, `POST /tasks/{id}/evidence` |
| `*` | Everyone | Page not found | none |
| any wrong-role route | Signed in | Access denied, with a link to the person's own workspace | none |

## User journeys

- **Manager:** sign in, see what needs attention on Overview, create a work order with tasks and a checklist, assign a worker, open the work order for work, watch it move to submitted, review or open the report.
- **Worker:** sign in, open a task, read what to capture, accept the recording notice once, take or choose photos and clips, watch progress, retry a failed file, see what has been submitted.
- **Manager:** open a work order that is awaiting review, play evidence and compare files, check coverage against the checklist, record a decision with a reason.

## Accessibility rules for new components

1. Every control has a visible or screen-reader label. Icon-only buttons use `IconButton`.
2. Every status uses an icon and a word, not just colour.
3. Text and its background meet 4.5:1 (3:1 for text of 18.5px bold or larger). Check new colour pairs before adding them.
4. Everything works with the keyboard alone, and the focus ring (`:focus-visible`, 3px brand outline) is never removed.
5. Each page has one `h1`, and headings go down one level at a time.
6. Loading and error states use `role="status"` or `role="alert"`.
7. Respect `prefers-reduced-motion`.
