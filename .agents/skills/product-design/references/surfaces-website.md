# Website surface

Load when: work touches `/` (marketing host only), or any file under `apps/web/src/features/website/workspace/`.
Canonical owner: `apps/web/src/features/website/feature-map.md`.

The website feature is the marketing site: one surface, one home. It mounts at `/` only when the request arrives on the marketing host. On the app host, `/` belongs to the authenticated shell (redirects to `/app/tasks`). An anonymous visitor never loads Clerk. A returning session loads it after render, only to show Dashboard.

## Section architecture (in order)

1. `site-nav.tsx` — the floating glass nav capsule at every width (`glass.*` tokens, `GlassFilter`). Below 600px, its button opens the full-screen `mobile-menu.tsx` (scroll lock, inert page behind, focus kept in the nav, Escape to close). One click on Talk to Zero asks for the mic and starts the call. A blocked microphone shows a recovery notice.
2. `hero-section.tsx` — the interactive Strobi hero. It has a Chat / Voice toggle backed by these files:
   - `use-elevenlabs-zero.tsx`
   - `hero-conversation.tsx` (queues actions before the ElevenLabs SDK chunk lands, then replays them on the live session)
   - `hero-voice-controller.tsx`

   `hero-backdrop.tsx` and `media.ts` stream the hero video from `media.cf0.ai`, poster-first. They respect reduced motion and Save-Data.
3. `product-demo-section.tsx` — a custom video player (scrub, play/pause, volume, speed) that demonstrates a Zero workflow.
4. `use-cases-section.tsx` — operational work categories with icon chips: Lettings, Repairs, Arrears, Voids, Checkouts, Renewals, Statements.
5. `impact-section.tsx` — quantified operator impact framing.
6. `integrations-section.tsx` — channel and tool marks (`native-tool-marks.ts`). Buyer-facing copy names real tools, e.g. WhatsApp, Outlook, Google Sheets. It never names the plumbing vendor behind them.
7. `deferred-book-demo-section.tsx` — pricing and the Cal.com booking embed (`book-demo-content.tsx`), mounted after window load plus idle.
8. `closing-cta-section.tsx` — final CTA pair (`cta-pair.tsx`): Sign Up and Book a Demo. The hero uses the same pair.
9. `site-footer.tsx` — wordmark (`wordmark.tsx`, `cf0-text.tsx`), nav links, legal links (shared with the pages of the `legal` feature).

`grid-overlay.tsx` is a dev/design overlay, not shipped chrome. Treat it as a design aid, not as a pattern to reuse elsewhere.

## Strobi on this surface

The hero drives `StrobiAvatar` from real ElevenLabs voice/chat state, not decoratively. `hero-section.tsx` maps those states to the public mood API. See `DESIGN.md` §Strobi for the mood keys. Do not expose raw animation states to the component.

## State inventory

- Hero voice/chat states map to the public avatar mood API. See `DESIGN.md` §Strobi.
- Hero video and product demo: poster-only (reduced motion / Save-Data / before load), streaming, playing, paused.
- Book-demo embed: unmounted until window load plus idle, then the Cal.com skeleton, then the live embed.
- Full `prefers-reduced-motion` support is expected sitewide. Verify it. Do not assume that it survives an edit.

## Coverage gaps

- No documented pattern yet for the use-case chip row at 390px (chip-row scroll vs. wrap).
