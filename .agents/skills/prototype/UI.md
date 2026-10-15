# UI Prototype

Generate **several radically different UI variations** on a single route. A floating bottom bar switches between them. The user moves between variants in the browser and picks one (or takes parts from each). Then the user discards the rest.

If the question is about logic/state and not about how something looks, this is the wrong branch. Use [LOGIC.md](LOGIC.md).

## When this is the right shape

- "What should this page look like?"
- "I want to see a few options for this dashboard before committing."
- "Try a different layout for the settings screen."
- Any time that the user would otherwise spend a day to pick between three vague mockups in their head.

## Two sub-shapes — strongly prefer sub-shape A

A UI prototype is much easier to judge when it sits **against the rest of the app**: real header, real sidebar, real data, real density. A throwaway route alone is a vacuum, and every variant looks fine in isolation. Use sub-shape A by default when a plausible existing page can host the variants. Use sub-shape B only if the prototype genuinely has no nearby home.

### Sub-shape A — adjustment to an existing page (preferred)

The route already exists. The variants render **on the same route**, behind a `?variant=` URL search param. The existing data fetching, params and auth all stay. Only the rendering changes. This is the default. Pick it unless there is a specific reason not to.

The prototype can be for something that has no page yet but *would naturally live inside one*. Examples are a new section of the dashboard, a new card on the settings screen, or a new step in an existing flow. That is still sub-shape A. Mount the variants inside the host page.

### Sub-shape B — a new page (last resort)

Use this only when the prototype genuinely has no existing page to live inside. Examples are an entirely new top-level surface, or a flow that you cannot embed anywhere sensible.

Create a **throwaway route** that follows the routing convention that the project already uses. Do not invent a new top-level structure. Name it so that it is obviously a prototype (for example, include the word `prototype` in the path or filename). Use the same `?variant=` pattern.

Before you commit to sub-shape B, sanity-check: is there really no existing page to embed this in? An empty route hides design problems that a populated route shows.

In both sub-shapes the floating bottom bar is identical.

## Process

### 1. State the question and pick N

Use **3 variants** by default. More than 5 variants are no longer radically different and become noise. Stop at 5.

Write down the plan in one line, in the location of the prototype or in a top-of-file comment:

> "Three variants of the settings page, switchable via `?variant=`, on the existing `/settings` route."

This works when the user is present to disagree and when the user is not.

### 2. Generate radically different variants

Draft each variant. Hold each one to these limits:

- The purpose of the page and the data that it can access.
- The component library / styling system of the project (TailwindCSS, shadcn, MUI, plain CSS, whatever).
- A clear exported component name, for example `VariantA`, `VariantB`, `VariantC`.

Variants must be **structurally different**: a different layout, a different information hierarchy, a different primary affordance. Different colours alone are not sufficient. Three card grids with small changes are not a UI prototype. They are wallpaper. If two drafts are too similar, do one again with explicit "do not use a card grid" guidance.

### 3. Wire them together

Create a single switcher component on the route:

```tsx
// pseudo-code — adapt to the project's framework
const variant = searchParams.get('variant') ?? 'A';
return (
  <>
    {variant === 'A' && <VariantA {...data} />}
    {variant === 'B' && <VariantB {...data} />}
    {variant === 'C' && <VariantC {...data} />}
    <PrototypeSwitcher variants={['A','B','C']} current={variant} />
  </>
);
```

For sub-shape A (existing page), keep all the existing data fetching above the switcher. Only the rendered subtree changes for each variant.

For sub-shape B (new page), the throwaway route under `/prototype/<name>` mounts the same switcher.

### 4. Build the floating switcher

Make a small fixed-position bar at the bottom-centre of the screen. It has three parts:

- **Left arrow.** It moves to the previous variant (wraps around).
- **Variant label.** It shows the current variant key. If the variant exports a name, it shows that name too, for example `B — Sidebar layout`.
- **Right arrow.** It moves forward (wraps around).

Behaviour:

- A click on an arrow updates the URL search param. Use the router of the framework: `router.replace` on Next, `navigate` on React Router, etc. Then the variant is shareable and stays the same after a reload.
- Keyboard: the `←` and `→` arrow keys also cycle. Do not intercept arrow keys when an `<input>`, `<textarea>`, or `[contenteditable]` has focus.
- Make it visually different from the page (for example, a high-contrast pill, a subtle shadow). Then it is obviously not part of the design under evaluation.
- Hide it in production builds. Gate on `process.env.NODE_ENV !== 'production'` or an equivalent check. Then a stray prototype merge cannot ship the bar to users.

Put the switcher in a single shared component, so both sub-shapes can use it. Put it where shared UI lives in the project.

### 5. Hand it over

Show the URL (and the `?variant=` keys). The user moves through the variants when the user has time. The interesting feedback is usually **"I want the header from B with the sidebar from C"**. That is the actual design that the user wants.

### 6. Capture the answer and clean up

When a variant wins, capture the answer: which variant, and why. Then capture the prototype as the [SKILL](SKILL.md) describes. Put the winner into the real code. Move the rest onto the throwaway branch, not into main:

- **Sub-shape A**: put the winner into the existing page. Remove the losing variants and the switcher from main.
- **Sub-shape B**: promote the winning variant to a real route. Remove the throwaway route and the switcher from main.

The full set of variants is the primary source. So it goes to the throwaway branch, not the bin. Variant components and a switcher left in the main branch decay fast and confuse the next reader.

## Anti-patterns

- **Variants that differ only in colour or copy.** That is a tweak, not a prototype. Real variants disagree about structure.
- **Too much shared code between variants.** A shared `<Header>` is fine. A shared `<Layout>` defeats the purpose. Each variant must be free to discard the layout.
- **Variants wired to real mutations.** Read-only prototypes are fine. If a variant must mutate, point it at a stub. The question is "what should this look like", not "does the backend work".
- **Promotion of the prototype directly to production.** The variant code obeys prototype constraints (no tests, minimal error handling). Write it again correctly when you put it into the real code.
