# Patterns

Use a pattern across surfaces only after checking that it fits both contexts.
Surface-specific decisions belong in the matching surface reference.

## Destructive actions

- Name the object, scope, and consequence before the action.
- Use verb-and-object labels.
- Provide undo when the system can support it. Otherwise, use a confirmation
  when the action has a lasting or broad effect.
- Never let a destructive action finish without a clear result.

## Forms and settings

- Prefer a strong default to a setting that users rarely change.
- Use progressive disclosure for advanced controls.
- Validate inline and preserve input after a recoverable error.
- Use radio buttons or a segmented control for a small set of fixed options
  when that is clearer than a select menu.

## Loading and feedback

- Keep action labels stable while work is pending.
- Use optimistic updates only when the rollback state is defined.
- Do not trust response arrival order when requests can overlap.
- For long work, show progress and let the user leave the view.

## Navigation

- Use links to navigate and buttons to act.
- Make the return path clear after a drill-in.
- Preserve useful filters and location when returning to a list.

## Data display

- Use the same status, amount, and date format across related surfaces.
- Align numeric values consistently and make important totals easy to compare.
- Show unavailable data as unavailable; do not replace it with an invented
  value.
