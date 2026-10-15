# Rules

Use this file to record design rules that are useful across features. Add a
rule only when its scope and evidence are clear.

Statuses: `proposed` (needs review), `accepted` (confirmed for the project),
`rejected` (keep the reason).

## Tokens and styling

### rule/one-token-source
- Scope: StyleX values in `web/`.
- Rule: Use tokens from `web/src/tokens/tokens.stylex.ts` for values owned by
  the design system.
- Source: `AGENTS.md` and the token file.

### rule/consistent-hierarchy
- Scope: related views and components.
- Rule: Use consistent type, spacing, and color roles for equivalent content.
- Source: Checked examples from the relevant feature.

### rule/reject-generated-design-reflexes
- Scope: new or materially changed surfaces.
- Rule: Do not add gradients, decorative badges, repeated card shadows,
  unnecessary dividers, or motion without a clear purpose.
- Source: Interface-quality review.

### rule/surface-tests
- Scope: new or materially changed surfaces.
- Rule: Check that the primary action and data shape remain clear when the
  text is hard to read, and that the layout remains usable when text is
  replaced by placeholders.
- Source: Interface-quality review.

## Interaction

### rule/inline-before-modal
- Scope: new interface affordances.
- Rule: Prefer inline disclosure. Use a modal for a focused task or an action
  that needs interruption.
- Source: Checked user-flow evidence.

### rule/no-nested-modals
- Scope: all interface code.
- Rule: Do not nest modal dialogs. Use sequential dialogs or a non-modal
  popover for secondary content.
- Source: Focus management and keyboard behavior.

## Copy

See `copy.md` for action labels, errors, and accessible names.

## Checks

| Concern | Check |
| --- | --- |
| TypeScript | `bun run typecheck` |
| Web output | `bun run build` |
| Other concerns | Follow `AGENTS.md` and the owning feature's existing checks |

Keep deterministic checks in commands. Keep judgment rules in prose with
evidence.
