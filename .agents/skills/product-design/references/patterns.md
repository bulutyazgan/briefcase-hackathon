# Patterns

Cross-surface interaction patterns. A pattern graduates here only after it holds on two surfaces (see `surfaces.md` routing rule).

## Destructive actions

- Name object + scope + consequence before the act (`Delete Task — removes it from every board column`). See `product-judgment.md` for the concrete classes (files, tasks, mailboxes, team).
- Use Verb + Noun labels for destructive actions. Follow `DESIGN.md` §Labels and copy for case (`copy.md` rule/copy-case-by-surface).
- Provide undo where the system can honestly support it. Files soft-delete with a tombstone (see `product-judgment.md`). Otherwise, ask for confirmation with the object named.

## Forms and settings

- Prefer strong defaults over configuration. An option that nobody changes is a default, not a setting.
- Progressive disclosure: advanced controls are available, and the default path does not carry them.
- The config dialogs of setup (`apps/web/src/features/setup/workspace/setup-config-dialog.tsx`) share one fenced-save shell:
  - It snapshots the revision and org at open.
  - It aborts on close.
  - A stale write disables Save. It does not silently overwrite.
- Validation is inline and forgiving. Keep input across errors.
- A control with 2–3 static, non-toolbar options is a candidate for a segmented control or radio group over a `Select` (see `interface-quality.md`).

## Loading and feedback

- Keep control labels stable across states. Use busy/disabled affordances, not text swaps.
- Use optimistic UI only with a defined rollback visual.
- The tasks Client (`apps/web/src/features/tasks/workspace/store.ts`) carries request keys and generation ordering. A stale refresh loses to a newer one, and retries dedupe by idempotency key.
- Model new optimistic flows the same way. Do not trust arrival order.
- Background/long work: display progress and let the user leave. Never trap them in a modal spinner.

## Navigation

- Navigation components navigate. Action components act. A button that looks like a link to another view must never do a mutation.
- Deep-linkable state: the tab and dialog state of setup, and the per-route lists of the registry, survive a reload. The reason: the view state rides the URL or the persisted snapshot of the Client, not component state alone.
- Return paths: every drill-in (a task drawer, a registry detail) has an obvious way back that keeps the filters of the list.

## Feedback

- Toasts render via `sonner`. `apps/web/src/components/ui/sonner.stylex.ts` holds the styling.
- The status-icon mapping (success, info, warning, error, loading) lives in `apps/web/src/App.tsx`. It uses `HugeiconsIcon` from `@hugeicons/react`.
- Do not pass a different icon set for a new toast.
- Inline validation errors sit below the field, in sentence case, with no modal.

## Loading

- Route/Suspense boundaries: a skeleton that matches the final layout (`Cf0Skeleton`).
- Inline/button loading: `LiquidSpinner` (`apps/web/src/components/ui/liquid-progress.tsx`) or a skeleton that matches the final layout.
- Streamed agent output (the Zero chat dock of portfolio, mailbox provisioning): a shimmer or caret on the in-flight text (`text-shimmer-wave.tsx`). Not a spinner beside it.

## Data display

- Chart series follow `series1`–`series6` and `seqStart`/`seqMid`/`seqEnd` of the token set (`apps/web/src/tokens/token-consts.stylex.ts`). Never use a literal hex for each series.
- Use tabular numerals on every numeric column, metric, and chart axis (`text.code` or a numeric StyleX rule with `fontVariantNumeric: 'tabular-nums'`).

## Coverage gaps

- The destructive-action inventory across `/app/tasks`, `/app/setup`, and the registry routes is not yet complete. See `coverage-gaps.md`.
- No documented pattern yet for the per-surface list chrome of the registry (property/tenant/landlord/contractor/lead/work-order). Today `registry-shell.tsx` owns it structurally, and nothing more.
