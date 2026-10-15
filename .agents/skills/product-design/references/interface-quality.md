# Interface quality

Load for: implementation work, material visual changes and full reviews.

## Hierarchy

- Establish hierarchy with type, spacing and alignment before adding containers.
- Give each view one primary action.
- Use the color roles in `DESIGN.md` §Color.

## Tokens

Follow `DESIGN.md` §Enforcement for token use. Use `stylex-authoring` for StyleX syntax and file conventions.

## Surfaces and elevation

Follow `DESIGN.md` §Surfaces and elevation. Use borders for in-flow separation. Reserve shadows for floating UI.

## Type and copy

Follow `DESIGN.md` §Typography and §Labels and copy. Use `copy.md` for the copy workflow.

## Layout and responsive

Use the layout and breakpoint accessors. Follow `DESIGN.md` §Layout and breakpoints. Check narrow and wide viewports. Check long strings and large values for overflow.

- Give touch controls a usable target at compact widths.
- Give hover-only actions a non-hover path.
- Put hover motion behind `@media (hover: hover) and (pointer: fine)`.

## Components

Reach for `@/ui/*` first. The components in `apps/web/src/components/ui/` own their visual API. Add a component variant when a need is missing. Do not bypass the API at a call site.

Follow `DESIGN.md` §Buttons and controls for the Liquefy boundary.
