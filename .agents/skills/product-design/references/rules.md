# Rules

Stable-ID registry of accepted and proposed product-design rules. A rule lands here only with scope, why, exceptions, and source. Deterministic rules graduate to `sg-rules/` or biome (enforced by `./c check`). They keep an entry here that points at the check.

Statuses: `proposed` (awaiting human acceptance) · `accepted` (canonical) · `rejected` (with reason).

## Design system

### rule/one-token-source — `accepted`
- Scope: all UI code in apps/web.
- Rule: follow `DESIGN.md` §Enforcement and use the token accessors for tokened values.
- Source: `DESIGN.md` §Enforcement.

### rule/one-accent — `accepted`
- Scope: all UI code.
- Rule: follow `DESIGN.md` §Color.
- Source: `DESIGN.md` §Color.

### rule/hairline-separation — `accepted`
- Scope: surface composition.
- Rule: follow `DESIGN.md` §Surfaces and elevation.
- Source: `DESIGN.md` §Surfaces and elevation.

### rule/type-roles — `accepted`
- Scope: all UI code.
- Rule: follow `DESIGN.md` §Typography.
- Source: `DESIGN.md` §Typography.

### rule/shape-by-role — `accepted`
- Scope: buttons.
- Rule: follow `DESIGN.md` §Buttons and controls.
- Source: `DESIGN.md` §Buttons and controls.

### rule/copy-case-by-surface — `accepted`
- Scope: web app and landing-page copy.
- Rule: follow `DESIGN.md` §Labels and copy.
- Source: `DESIGN.md` §Labels and copy.

### rule/reject-generated-design-reflexes — `accepted`
- Scope: any new surface or component.
- Rule: DESIGN.md § "Reject the generated-design reflexes" names the specific tells to avoid:
  - gradients
  - emoji iconography
  - a shadow on every card
  - everything rounded to `xl`
  - centred body text
  - a coloured badge on every row
  - decorative dividers
  - three font weights in one component
  - "successfully" copy
  - animation on mount everywhere
  - a spinner for every fetch
  - uniform padding
- Before you ship a new surface, check it against that table by name.
- Source: DESIGN.md § Reject the generated-design reflexes.

### rule/squint-and-text-mask-tests — `accepted`
- Scope: any new or materially changed surface, pre-ship.
- Rule: run the two hierarchy tests of DESIGN.md before you call a surface done:
  - The squint test: blur until text is unreadable. The primary action and data shape must survive.
  - The text-mask test: replace every string with a grey bar. The layout must still be usable.
- Cite them by name in review.
- Source: DESIGN.md § Checking hierarchy without rendering.

## Interaction

### rule/inline-before-modal — `proposed`
- Scope: new UI affordances.
- Rule: prefer inline disclosure before you add a modal. A modal must interrupt for a reason (irreversible act, focused single task).
- Why: modals break focus flow and bury context. This is a Vercel pattern, and it fits the operational surfaces of cf0.
- Source: Vercel product-design, SKILL.md standards.

### rule/no-nested-modals — `accepted`
- Scope: all UI code.
- Rule: never nest modals. Use sequential dialogs, not stacked ones. Close the outer surface before you open the inner one, or render the inner one as a non-modal popover.
- Why: focus management, keyboard escape, and layering all break with two modal traps open at once.
- Source: `sg-rules/no-nested-modals.yml` (root, error severity).

## Copy

See `copy.md` (rule/verb-noun-destructive, rule/canonical-verbs, rule/copy-case-by-surface above).

## Lint ownership map

| Deterministic check | Owner | Enforced by |
|---|---|---|
| Design-token gates (`web-color-literal-in-token-source`, `web-css-var-in-token-source`, `web-button-element-in-design-system`, `web-no-eyebrow`, `web-button-radius-is-pill`, `web-no-geist-sans`, `web-no-shadcn-theme-vars`, `web-font-weight-token`) | `base.rules.yaml` | `./c check structure` |
| StyleX token and component boundaries (`no-raw-var-strings-in-design-system(-tsx)`, `no-unprefixed-design-system-token-vars`, `no-design-system-deep-imports(-ts)`, `no-arbitrary-stylex-value(-ts)`, `no-cross-scale-token`) | `sg-rules/` (root) | `./c check syntax` |
| Motion durations, UI imports and component rules | `apps/web/sg-rules/` | `./c check syntax` |
| Modal nesting, feature/UI import boundaries | `sg-rules/` (root) | `./c check syntax` |
| Feature anatomy, cross-feature imports, D1-in-repo-only | `base.rules.yaml` via `scripts/c/_lib/scanner.py` | `./c check structure` |
| React health (hooks, memo, keys) | react-doctor | `./c check health` |
| Duplication / dead code | jscpd, knip | `./c check clones dead-code` |

Some rules need product context to evaluate. Examples: the right object name for a destructive action, or whether a surface is "in the document flow". Such a rule stays here or in `interface-quality.md`, in prose. It is review-only until someone finds a syntactic form for it.
