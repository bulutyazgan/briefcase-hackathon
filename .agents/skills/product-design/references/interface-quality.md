# Interface quality

Load for implementation work, material visual changes, and full reviews.

## Hierarchy

- Establish hierarchy with type, spacing, and alignment before adding
  containers.
- Give each view one clear primary action.
- Keep the current task and the relevant evidence visible.

## Tokens and components

- Use StyleX tokens from `web/src/tokens/tokens.stylex.ts`.
- Follow the token and component patterns in the feature being changed.
- Keep feature-specific components in `web/src/features/<name>/`.
- Do not add a second design-token source or a UI framework.

## Surfaces and type

- Use borders for in-flow separation. Reserve shadows for floating content.
- Use readable type sizes and line lengths.
- Keep labels and body copy clear at the displayed size.

## Layout and responsive behavior

- Check narrow and wide viewports, long strings, and large values for overflow.
- Give touch controls usable targets at compact widths.
- Provide a non-hover path for actions that appear on hover.
- Put hover motion behind a suitable hover-capability media query.

## Review

- Check focus order, keyboard use, contrast, and accessible names.
- Compare the rendered interface with the source tokens and current feature
  patterns.
