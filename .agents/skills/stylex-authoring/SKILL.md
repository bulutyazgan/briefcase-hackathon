---
name: stylex-authoring
description: StyleX authoring guidance for longhand properties, tokens, and common compiler pitfalls. Load when writing or reviewing StyleX files or debugging missing styles.
---

# StyleX authoring

Follow the patterns in the installed StyleX version and
`web/src/tokens/tokens.stylex.ts`.

## Properties and tokens

- Prefer longhand properties or a single-value shorthand over a multi-value
  shorthand.
- Use the matching design token for values owned by the design system.
- Use `null` to unset a property.
- Prefer state changes in JavaScript over structural pseudo-classes when the
  state is already available to the component.
- Prefer real HTML elements over generated content for meaningful content.

## Token definitions

Keep token definitions in `web/src/tokens/tokens.stylex.ts`. Do not add another
token source. Use named exports and follow the existing token families.

StyleX resolves constants during compilation. The dev server must transform
the module that declares them before it serves generated StyleX CSS. A second
definition module can introduce ordering problems.

## Common pitfalls

### Background values

Use `backgroundColor` with a token rather than a `background` shorthand when
the shorthand cannot be expanded safely.

### Borders

Use explicit color, style, and width properties for a border. Some logical
border shorthands map to unsupported physical properties in StyleX.

```tsx
const styles = stylex.create({
  section: {
    borderBottomColor: color.hairline,
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
  },
});
```

### Units

Use explicit units for values that are not bare pixel lengths. Confirm the
compiled value for properties where numeric values have different meanings.

### Animation

Put a `stylex.keyframes()` value on `animationName`. Set duration, timing,
delay, and iteration behavior with their own properties.

### Shorthands

Check the installed StyleX version before relying on a shorthand. Prefer
longhands when compiler support is unclear.

## Debugging

1. Inspect the Vite-transformed module in the local dev server.
2. Check that the expected property is present in the transformed output.
3. Inspect the generated StyleX CSS for the expected atomic class.
4. Replace unsupported shorthand properties with longhands and check again.

## Resources

- Official documentation: https://stylexjs.com
- API reference: https://stylexjs.com/docs/api
- Source: https://github.com/facebook/stylex
- LLM authoring guide: https://github.com/facebook/stylex/blob/main/packages/docs/static/llm/stylex-authoring.md
