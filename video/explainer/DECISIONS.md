# DECISIONS.md: the explainer film, one line per call

Branch `video/explainer-pivot`, built 15 Oct 2026 from the analyst's brief (60273165). The brief is PROMPT.md; the only numbers allowed are in SOURCES.md.

## The idea

One sentence: a client's chat message becomes a correct invoice while you watch, because the model only reads and asks, and code decides and pays inside a written policy.

The question the film answers, in the viewer's words: "Can my customers change their deal just by messaging us, and will the books still be right?"

The hook (the belief that turns out to be wrong): a billing change means a dashboard and a form, and an AI touching money is reckless. The film opens on the form (the usual next step) and dissolves it; the split that makes it safe is the key idea at 18 s and the turn at 56 s.

After watching, the viewer can say: "my customers can change their deal by messaging, and the books stay right", and name the split: the model reads and asks, code decides and pays, inside a written policy, with a human above the limits.

## Must-know (in) and cut list (out)

In: a Telegram message; Tally reads the thread; CRM, dated memory, price list; the model/code split; the written policy and its limits (£1,000 to send, £200 to credit, £12,000 a year to change a plan, 22 clauses); clauses P2, P5, P8 on the yearly invoice; £5,000.00, due in 7 days, "You save £1,000.00 a year"; PDF in the chat; the evidence page; the staff note ("No action needed"); the books; a dispute (240 valid, 60 × £3.60 = £216.00) crossing the £200 limit; Approve/Reject in the chat; /pause.

Out: lead sourcing (shown nowhere; SOURCES allows once, restraint cut it); the subscriptions adapter and proration (built, not in the loop; never claimed); the £728 / £954.72 live runs; 104 tests; onboarding a stranger (P12); reminders (P7); Slack and in-app chat (true, but one channel on screen keeps one name per thing; "Telegram" is the pill); vendor names; localhost; mock ids; the 15% discount cap; the 40% margin floor is reduced to the chip "P8 · margin kept".

## Calls made without asking

- No Agent tool exists in this session, so the swarm collapsed into one studio: every role (directions, build, sound, captions, design review, accessibility) ran in sequence by the same hands. The directions page, the review questions and the accessibility pass were still done as separate passes.
- Palette stays the brand's cool neutral (#F4F4F5 ground, #FFFFFF cards, #171717 ink) rather than a warm ground: anchoring to the real product beat the brief's "warm" adjective. One accent, #1D6F42 (green, 6.2:1 on white), used only where code acted and money moved: checks, "sent", approval, the quote tag.
- Two typefaces from the brand: Geist for words, Geist Mono for money, ids, dates and clauses.
- The whole film is one chat thread with the back office docking beside it (direction A, "The Thread"). See directions.html for the four directions and why A won.
- The camera reframes only three times: the thread scrolls at 42 s and 56 s, and a 1.08 punch-in on the evidence page at 42 s that keeps both columns in frame. A 1.25 punch-in was tried and cut: it pushed the chat (where the client asks "why") out of frame.
- The Turn uses the credit-note dispute ("Only 240 of those were valid") rather than a bigger plan change, because it is the case SOURCES documents as asking for approval (£216.00 > £200, P11) and it shows customer service and finance as one queue.
- The agent's chat replies are written from the code's behaviour, not pasted: the LLM step says it noted the change and that the invoice follows (concierge.ts prompt), then billYearly's own string "£5,000.00 for 12 months, due in 7 days. You save £1,000.00 a year". The Stripe invoice id is left off the bubble because the only live ids in SOURCES belong to other invoices.
- Voice: gpt-4o-mini-tts, voice onyx, one call per caption line. Lines were trimmed of silence at both ends and fitted into their planned slots with a tempo change capped at 1.2 (six lines took 1.13 to 1.2; the rest 1.0). The measured times drive the burned-in captions, captions.srt and the ducking, from one file (src/captions-timing.json).
- Captions are burned in as full voice lines (they are the voice line, which is what captions are for); the on-screen anchors at the top are the short words, never the full line.
- 9:16 and 1:1 are recompositions, not crops: the 1920×1080 stage is scaled to the width, and the anchor and captions are re-set at native size in the free space. UI text inside the stage is small on a phone; the anchor and captions carry the idea there.
- The reduced-motion cut is implemented (`?rm=1` cuts every move at its start, same sequence of ideas) and documented, but its render was cut from the time box; `node src/render.mjs --rm --out out/master_16x9_reduced_motion.mp4` produces it.

## Design review (Meaghan Choi's questions, asked of the cut at 46 s and 61 s)

- Who is this for? Founders, finance leads and client-facing teams who already run clients in chat. They are not shown a dashboard; the film never leaves the thread and the column beside it.
- What are we communicating? One thing: the message is the request, and the split (model reads, code pays, policy, human above limits) is what makes that safe. Every scene's "teaches" line in src/timeline.js is one element.
- Does it need a name or can it stay invisible? The split needed a name and got the two column headers that stay for the rest of the film. The policy stays as "Written policy · 22 clauses", not a product feature name. Nothing else is named.
- Fixes from the review, each with a before/after pair in README.md: the quote tag was clipped under the next bubble (moved to the bubble's bottom edge); the policy card's fourth line was cut (card grew to 176 px and the limits line moved first so the compact state keeps it); the thread's own overflow clip moved with its scroll so the Turn's chat was empty (static clip wrapper added); the punch-in hid the chat (1.25 → 1.08 about centre).

## Accessibility pass

- Contrast, measured (see README for the numbers): every text/background pair in the film is at least 4.74:1; most are above 9:1.
- Colour is never the only signal: checks carry a glyph and a word ("sent", "Approved · credit note sent"); the accent is always paired with text.
- No flashes; the fastest repeated change is the three clause ticks 0.8 s apart.
- Captions burned in at 36 px (16:9), 42 px (9:16), 32 px (1:1), white card with hairline, and shipped as captions.srt.
- Reduced motion: `?rm=1` on the page keeps the same order of ideas with cuts instead of moves.
