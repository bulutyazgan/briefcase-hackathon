# Copy

Load for interface language, accessible names, and copy reviews.

Use the terms already established in the product and current surface. Check
`PLAN.md` and nearby UI before introducing a new term.

## Action labels

- Use a verb and the object for destructive actions: “Delete invoice” or
  “Cancel request”, not “Confirm” or “OK”.
- Use one verb for the same action across surfaces. Do not alternate between
  “Remove”, “Delete”, and “Cancel” without a product distinction.
- Name the consequence when the label alone is not enough.

## Messages

- Prefer direct wording. Do not add “successfully” when the result is clear
  without it.
- Use the present participle for work in progress: “Creating invoice…”.
- Use numerals for counts and amounts.
- Put validation beside the field. Say what the user can change.
- Keep error messages specific and preserve user input when recovery is
  possible.

## Accessible names

- Give every icon-only control an accessible name.
- Make an accessible name match the visible label when both exist.
- Name a control by its function, not its appearance.

## Process boundary

Copy mode changes user-facing language and directly required markup only.
Report structural problems found during a copy pass instead of fixing them
silently.
