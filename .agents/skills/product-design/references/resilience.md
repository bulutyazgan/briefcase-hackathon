# Resilience

Load for: Harden mode, state coverage work, reviews of data-dependent surfaces.

## The state inventory

Every data-bound region maps its reachable states. A missing state is a finding:

| State | Requirement |
|---|---|
| Loading | Skeleton or busy affordance. Labels stay stable (no "Load" → "Loading…" text swap). No layout shift on resolve |
| Empty | Says what will appear here, and the one action that fills it. Never a bare "No data" |
| Sparse | Degrades gracefully at 1–3 items (no stretched skeletons, no orphaned bulk actions) |
| Populated | The happy path. But it is not the design |
| Validation | Inline, near the field, keeps user input. Error text says what to change, not just that it failed |
| Error | Distinguishes "your input" from "our system". Offers retry where retry can honestly succeed |
| Permission | Shows the locked state and who to ask. Not silence, not a 403 dump |
| Disabled | Disabled controls explain why (title, helper text, or adjacent note) |
| Optimistic | Marks pending state. Defines the rollback visual when the server rejects |
| Stale | Shows data age when staleness changes decisions (financial figures, sync status) |
| Destructive | Names object + scope + consequence before the action. Undo where honest |

## Extreme data

- Long unbroken strings (emails, URLs, reference numbers) wrap or truncate with a path to the full value.
- Large numbers use the formatted/abbreviated form that the product defines. Raw values are available on focus/detail.
- Lists paginate or virtualize before they can grow past a screen. Bulk actions stay bounded.
- Empty-string, null, and zero are three different states. Render them differently only when the difference is real.

## Network and system

- Every mutation has a failure visual and a retry path.
- Prevent double-submit structurally (busy state), not by hope.
- Timeouts and offline states degrade to a readable message. Never a spinner until heat death.
- Regional/system errors keep the context and input of the user. Never navigate away on failure.

## Coverage rule

For any surface you touch, list its reachable states in the PR description. A state that you cannot reach is fine. A state that you did not consider is a P1 finding.
