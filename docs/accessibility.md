# Accessibility audit and checklist

Target: WCAG 2.2 level AA.

## Part 1: What was audited in the code

| Check | Result | Notes |
|---|---|---|
| Page language | Pass | `<html lang="en">` |
| Skip link | Pass | "Skip to content" jumps to `#main` in the app shell |
| Visible keyboard focus | Pass | Global `:focus-visible` is a 3px brand outline. Inputs use a brand border and a soft ring |
| Reduced motion | Pass | `prefers-reduced-motion: reduce` shortens animations and transitions |
| Form labels | Pass | Every field helper renders a `<label>`. The search box and the compare dropdowns are wrapped in labels. The three hidden file inputs are opened by labelled buttons and are skipped by the keyboard on purpose |
| Icon-only buttons | Pass | `IconButton` requires a `label`. Close buttons have `aria-label` |
| Status not by colour alone | Pass | `StatusBadge` and `VerdictBadge` always add an icon and a word |
| Dialogs | Pass | Native `<dialog>`: focus is trapped, Escape closes, the title names the dialog |
| Errors and loading | Pass | Errors use `role="alert"`, loading uses `role="status"`, toasts use `aria-live="polite"` |
| Page titles | **Fixed** | Every page had the same tab title. `ScrollManager` now sets one per route |
| Contrast of text | **Fixed** | See the table below |
| Tap target size | Pass | Buttons are at least 2.3rem (about 37px) high, above the 24px WCAG 2.2 minimum. Primary actions are 2.75rem or more |

## Part 2: Contrast measurements

Ratio of text colour to its background. Needs 4.5:1 for normal text.

| Pair | Before | After | Needs 4.5 |
|---|---|---|---|
| Body text on page background | 16.48 | 16.48 | Pass |
| Secondary text on white | 9.83 | 9.83 | Pass |
| Muted text on white | 4.91 | 5.44 | Pass |
| Muted text on page background | 4.51 | 4.99 | Pass |
| Muted text on `--surface-2` | **4.31** | 4.78 | Pass |
| Brand text on white | 5.90 | 5.90 | Pass |
| White text on brand button | 5.90 | 5.90 | Pass |
| `ok` badge text on its background | **4.37** | 4.67 | Pass |
| `warn` badge | 4.72 | 4.72 | Pass |
| `fail` badge | 4.65 | 4.65 | Pass |
| `review` badge | 5.26 | 5.26 | Pass |
| `pending` badge | 4.77 | 4.77 | Pass |
| `info` badge | 6.72 | 6.72 | Pass |
| Light text on dark sidebar | 16.54 | 16.54 | Pass |
| Muted light text on dark | 8.59 | 8.59 | Pass |

Input borders (`--line-strong` on white) are 1.51:1. That is below the 3:1 WCAG asks for the edge of a control. The inputs still have a clear focus ring, a label and a placeholder, but for strict AA you can darken the input border:

~~~css
.input { border-color: #8f98b5; } /* about 3:1 on white */
~~~

This is optional and was not applied.

## Part 3: Manual checklist (about 30 minutes)

Run with a keyboard and one screen reader (NVDA on Windows, VoiceOver on Mac or iPhone, or TalkBack on Android). Tick each line.

### Keyboard only (unplug the mouse)

- [ ] Landing: Tab reaches every link and button in reading order. The mobile menu button opens and closes with Enter. The notification bell opens with Enter and closes with Escape.
- [ ] Sign in: Tab goes email, password (with its show/hide button), Sign in, Google. Enter submits.
- [ ] A wrong password shows an error that is read out without moving focus.
- [ ] Manager sidebar: Tab reaches each link. The skip link appears on first Tab and works.
- [ ] New work order: every step can be completed without a mouse. Errors appear next to the field.
- [ ] A dialog opens, focus moves into it, Tab stays inside, Escape closes it, and focus returns to the button that opened it.
- [ ] Worker: the capture buttons work with Enter and Space. A failed upload's Retry and Remove buttons are reachable.
- [ ] Manager: the decision options can be changed with the arrow keys. Submit works with Enter.

### Screen reader

- [ ] Each page's tab title is announced on arrival and matches the page.
- [ ] Each page has one main heading.
- [ ] Badges read as words ("Approved", "Needs correction"), not just icons.
- [ ] Upload progress bars announce the file name and the percentage.
- [ ] A toast ("Role updated", "Approved and logged") is announced.
- [ ] Tables have a header row, and each row's title is read first.

### Zoom, size and motion

- [ ] At 200% browser zoom nothing is cut off, and there is no sideways scrolling except inside tables.
- [ ] At 360px wide, every screen is usable (use the browser's device mode).
- [ ] Turn on "reduce motion" in the operating system. The landing frame no longer animates.
- [ ] Turn on Windows High Contrast (or forced colours). Buttons, inputs and badges still have visible edges.

### Automated check

Install the free **axe DevTools** or **WAVE** browser extension. Run it on: `/`, `/login`, `/register`, `/manager`, `/manager/work-orders/new`, `/worker` and `/worker/tasks`. Fix anything marked Critical or Serious. Also run Lighthouse (Chrome DevTools, Accessibility): aim for 95 or higher on each page.

## Known gaps (not blocking)

- Focus does not move to the page heading after a route change. A screen-reader user hears the new tab title but must navigate to the content. A small `useEffect` that focuses the `h1` on route change would improve this.
- Input borders are lighter than the 3:1 guideline (see Part 2).



mkdir -p ~/proofline-data/evidence
set -a; source ../.env; set +a
export MODEL_MOCK=false
uv run uvicorn app.main:app --port 8000



   cd ~/Downloads/proofline/backend
   set -a; source ../.env; set +a
   export MODEL_MOCK=false
   uv run uvicorn app.main:app --port 8000
