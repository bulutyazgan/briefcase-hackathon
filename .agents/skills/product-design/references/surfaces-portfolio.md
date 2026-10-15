# Portfolio surface

Load when: work touches `/app/portfolio`, portfolio metric sections, or the embedded Zero chat dock.
Canonical owner: `apps/web/src/features/portfolio/feature-map.md`.

Portfolio shows the properties of the firm at a glance: period metrics plus a live Zero conversation, on one dashboard.

## Layout

- `view.tsx` renders dashboard sections for the selected period. `portfolio-sections.tsx` holds the metric/section cards.
- Section order follows a saved tile order (`use-tile-order.ts`), not a fixed layout. A review should check that a reordered tile keeps its own state, not the state of its neighbor.
- `portfolio-chat-dock.tsx` embeds a live conversation with Zero (`useFirmChat` in `store.ts`) against the setup preview endpoint.
- `StrobiAvatar` here reflects real stream state through its `mood` prop. Use the API and mood table in `DESIGN.md` §Strobi.

## Interaction patterns

- Read-only metric presentation: a section with no data shows an explicit unavailable state, not an invented zero.
- The period picker changes the window in place. It does not navigate away from the dashboard.
- The chat dock streams incrementally. Check partial-response rendering and the terminal state, not only a fully-resolved reply.

## Coverage gaps

- No documented pattern yet for tile reordering on touch (390px) versus pointer drag.
