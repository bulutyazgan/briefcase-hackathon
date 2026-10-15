# Tasks surface

Load when: work touches `/app/tasks`, task cards, board filters, or task status transitions.
Canonical owner: `apps/web/src/features/tasks/feature-map.md`.

The tasks board is where the work of Zero and staff briefs land. It is the default route of the shell (`/` → `/app/tasks`). Status changes organize the board. They never approve or stop an external action by themselves.

## Layout and columns

Four columns match `TaskState`:

- `Needs you` (waiting on operator review or sign-off before dispatch)
- `In progress`
- `Parked` (deferred, waiting on an external event)
- `Done`

A `Closed` filter surfaces cancelled tasks separately, not as a fifth column. The header has a list/board layout toggle. The toolbar has an `Updated` range filter (`all`/`7d`/`30d`), search, and a "New task" action.

The board reads `GET /api/tasks?view=board`: every open task plus the first 50 Done. Server totals drive the column counts. "Show more" under Done pages 50 at a time. Closed loads on first open.

## Key files

- `view.tsx` — board/list page, toolbar, filters.
- `task-drawer.tsx` — the task detail drawer: brief, status actions, loop notes.
- `store.ts` — `useTasksBoard`, the Client. Commands carry request keys and generation ordering. A stale refresh loses to a newer one, and retries dedupe by idempotency key.
- `api.ts` — the typed edge to `/api/tasks[...]`, including `cancel(id, reason?)`.

## Interaction patterns

- A card opens in a drawer, not in a route change. The board stays mounted behind it.
- Status transitions give immediate optimistic feedback, then reconcile with the server. A conflicting concurrent edit surfaces as a 409. It does not silently overwrite.
- Task cards, columns, and the composer expose stable `aria-label`s (`section[aria-label="Needs you"|...]`, `button[aria-label^="Open task:"]`, `textarea[aria-label="Task brief"]`) . Reuse them for tests and locators. Do not invent new ones.

## Coverage gaps

- No documented pattern yet for the board at 390px (horizontal scroll vs. stacked columns). See `coverage-gaps.md`.
