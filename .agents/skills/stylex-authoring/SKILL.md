---
name: stylex-authoring
description: StyleX 0.19 authoring guide for cf0 — longhand properties, valid shorthands, dropped shorthands, token usage, and the traps that silently produce missing CSS. Load when writing or reviewing .stylex.ts files, debugging missing styles, or migrating CSS/Tailwind to StyleX.
---

# StyleX authoring guide (cf0)

This guide adapts the [official StyleX LLM authoring guide](https://github.com/facebook/stylex/blob/main/packages/docs/static/llm/stylex-authoring.md). We verified the cf0-specific traps against the installed `@stylexjs/stylex@0.19.0` / `@stylexjs/unplugin@0.19.0`.

## cf0 conventions

- Use longhand properties, or a single-value shorthand, over a multi-value shorthand. Use `null` to unset a property.
- Never use a literal value for a scale property: `fontSize`, `padding`/`margin`/`gap`, `borderRadius`, line-height, letter-spacing, font-weight. Always use the matching token from `@/tokens/token-consts.stylex.ts`. Always take it from the token family of that property:
  - `fontSize`/`lineHeight`/`letterSpacing`/`fontWeight` → `text.*`
  - `padding*`/`margin*`/`gap`/`rowGap`/`columnGap` → `space.*`
  - `border*Radius` → `radius.*`

  A token from the wrong family is still well-typed. So the compiler and the value lint of StyleX cannot catch it. Only a render that looks wrong shows it. Two `sg-rules` enforce this: `no-arbitrary-stylex-value` (literal instead of token) and `no-cross-scale-token` (token from the wrong family).
- `stylex.defineConsts()` and `stylex.defineVars()` live only in a `.stylex.ts` file with only named exports. No default export is permitted (the `named-exports-only` law of cf0). `defineConsts` lives only in `apps/web/src/tokens/token-consts.stylex.ts`. The reason:
  - StyleX resolves consts to literals at compile time.
  - So the dev server must transform the declaring module before it serves `virtual:stylex.css`.
  - A second `defineConsts` module races that order. The page then fails with a 500 and an unresolved `var(--hash)` in the generated CSS.
- Prefer JS state changes over `:first-child`/`:nth-child` pseudo-classes. Prefer real HTML elements over `::before`/`::after`.

## cf0-specific traps (verified against @stylexjs/babel-plugin@0.19.0)

These are real bugs that shipped on the cf0 landing page. Each one silently drops CSS. You get no build error, no warning and no test failure.

### 1. `background` shorthand silently drops CSS variable tokens

The `background` shorthand is "valid" in the property map of StyleX. But when you give it a CSS variable token (`var(--cf0-canvas)`), the compiler cannot find the sub-property to expand to. So it drops the full declaration.

```tsx
const styles = stylex.create({
  page: { backgroundColor: color.canvas },
});
```

Always use `backgroundColor` with token references. The full cf0 codebase uses `backgroundColor`, never `background`.

### 2. `borderBlockEnd` / `borderBottom` throw and are silently dropped

`borderBlockEnd` maps to `borderBottom`, which throws: `"borderBottom is not supported. Use borderBottomWidth, borderBottomStyle and borderBottomColor instead."` In dev with HMR, StyleX catches the error and silently drops the property.

```tsx
const styles = stylex.create({
  section: {
    borderBottomColor: color.hairline,
    borderBottomStyle: 'solid',
    borderBottomWidth: '1px',
  },
});
```

Always use the three longhands for any block-axis or inline-axis border.

### 3. Numeric values without units are dropped for non-px properties

Length properties use pixels by default when you give them numbers. Non-length properties (like `borderRadius` in some contexts) may not.

```tsx
const styles = stylex.create({
  card: { borderRadius: '12px', borderWidth: '1px', height: '640px' },
});
```

Always use strings with explicit units for any value that is not a bare pixel length.

### 4. Literal hex colors instead of design-system tokens

```tsx
import { color } from '@/tokens/token-consts.stylex.ts';

const styles = stylex.create({
  section: { backgroundColor: color.canvas, borderColor: color.hairline },
});
```

cf0 token reference (`design-tokens.css`): `color.canvas` = `#f5f5f5`, `color.hairline` = `#e4e4e7`, `color.hairlineStrong` = `#d4d4d8`. Always prefer tokens over literals. `no-arbitrary-stylex-value` also flags a hex literal.

### 5. `animation` shorthand with `keyframes()` objects

The babel plugin does not resolve a `stylex.keyframes()` object inside a shorthand template string. So the full declaration disappears with no build error. The plugin also never emits the `@keyframes` block. A grep of the built CSS for the duration finds nothing.

```tsx
const styles = stylex.create({
  cell: {
    animationName: pixelOn,
    animationDuration: '650ms',
    animationTimingFunction: 'ease-in-out',
    animationIterationCount: 'infinite',
  },
});
```

Always put the keyframes object on `animationName`, with the remaining longhands.

### 6. Valid shorthands that work (safe to use)

These shorthands are valid in StyleX 0.19 and expand correctly:

- `borderColor`, `borderStyle`, `borderWidth`, `borderRadius` (all four sides/corners)
- `padding` (→ `paddingBlock` + `paddingInline`)
- `margin` (→ `marginBlock` + `marginInline`)
- `paddingBlock`/`paddingInline`/`marginBlock`/`marginInline` (→ start/end)

### 7. Debugging dropped styles

When StyleX silently drops a style property, do these steps:

1. Check the Vite-transformed module: `curl -sk "https://<worktree-slug>.app.local.cf0.ai:1355/src/features/<name>/workspace/<file>.stylex.ts" | grep -A15 '<namespace>:'`
2. If the property key is missing from the output object, StyleX dropped it.
3. Check the generated CSS: `curl -sk "https://<worktree-slug>.app.local.cf0.ai:1355/virtual:stylex.css" | grep '<atomic-class>'`
4. Replace the shorthand with the longhand equivalent. If the drop is the order trap above, move the const declaration into `token-consts.stylex.ts`.
5. Check the transformed module again. Make sure that the property now generates.

## More resources

- Official documentation: https://stylexjs.com
- API reference: https://stylexjs.com/docs/api
- GitHub repository: https://github.com/facebook/stylex
- LLM authoring guide (source): https://github.com/facebook/stylex/blob/main/packages/docs/static/llm/stylex-authoring.md
