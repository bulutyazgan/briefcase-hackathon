<prompt>
<goal>
Turn Tally, the finance back office that lives in your customer conversations (a client messages on Telegram or Slack to change their plan, question a bill or ask for more, and the agent reads the thread, recalls the deal, makes the change in Stripe, sends the new invoice and leaves a note for staff, inside a written policy, with a receipt of why for every pound) into a finished explainer film that leaves founders, finance leads and customer-facing teams at agencies, SaaS and service businesses who already handle clients in chat with one new understanding in 75 seconds. The deliverable is a rendered video with sound and captions, plus the source that re-renders it. A plan, a moodboard or a still frame is not the deliverable.
</goal>

<role>
You are the whole studio: creative director, explainer writer, motion designer, sound designer and render engineer. When the brief is thin, make the call, log it in one line in DECISIONS.md and keep moving.
</role>

<principles>
Work the way Meaghan Choi, Head of Design for Claude Code at Anthropic, describes her own process:
- Shape before polish. Settle the one idea and the viewer's mental model first; polish is the last pass. [Dive Club]
- Ask her review questions before designing: who is this for, what are we communicating, does it need a name or can it stay invisible? [Dive Club]
- Never start from nothing. Anchor to the brand, the product and real screenshots, or you get the generic look every model makes. [Behind the Craft]
- Go wide, then decide: 3-4 directions side by side in one HTML page that doubles as a decision log. [Dive Club]
- Restraint is taste. You can build anything, so cut whatever does not serve the idea. [Dive Club]
</principles>

<inputs>
Topic: Tally, the finance back office that lives in your customer conversations. It sits in the chat your clients already use (Telegram and Slack today; any chat is the same adapter). When a client writes "switch us to yearly", "only 280 of those were valid", "what do you charge?" or "why this amount?", the agent reads the thread, finds the client in the CRM, recalls their deal and the company's price list from memory, and acts in Stripe: a new invoice for the plan change, a credit note for the dispute, a reminder when an invoice is late, a new client onboarded from the company knowledge base, a PDF sent back in the chat. Every change is explained with the client's own words, the remembered fact and the policy clause, and a note goes to staff. Above the written limits (£1,000 to send, £200 to credit, £12,000 a year to change a plan, any first invoice) a human taps approve in the same chat. One word pauses everything. The model reads and asks; code decides and pays.
Audience, and what they already believe: founders, finance leads and customer-facing teams at agencies, SaaS and service businesses who already handle clients in chat. They believe a billing change means a dashboard and a form, that support and finance are two different queues, and that an AI touching money is reckless.
After watching they can: say in their own words "my customers can change their deal by messaging, and the books stay right", and name the split that makes it safe: the model reads and asks, code decides and pays, inside a written policy, with a human above the limits.
Length: 75 s (30-90)
Formats: 16:9 master, then 9:16 and 1:1 recompositions
Brand and references: ./brand, ./refs, ./screens (see SOURCES.md for every number you may use and where it comes from)
</inputs>

<discovery>
- Write the one question the film answers, in the viewer's own words.
- Split facts into must-know and cut list; the cut list stays out.
- Find the hook: the belief most viewers hold that turns out to be wrong.
- Use a metaphor only if it makes the idea more accurate. Otherwise show the real thing.
</discovery>

<story_arc>
- Question (0-10%): open on the thing people get wrong, as an image, not a title card.
- Model (10-35%): build the smallest correct picture of how it works, one element per beat.
- Proof (35-75%): run the model on a real case and let cause and effect play out on screen.
- Turn (75-90%): change one variable and show what follows. Understanding clicks here.
- Payoff (90-100%): the opening image again, now read correctly, plus one next step.
</story_arc>

<visual_system>
- Pull palette, type and spacing from ./brand into tokens before drawing anything.
- Warm neutral ground, one accent, two typefaces, one grid.
- Prefer real UI, real data and clean diagrams over illustration.
- Banned: neon glow, stock 3D blobs, gradient title cards, floating particles, fake metrics.
</visual_system>

<motion_language>
- Motion carries meaning: things move to show grouping, order, cause or scale.
- One focal action at a time; everything else holds still.
- Keep objects alive across scenes and transform them instead of replacing them: a dot becomes a node, a label becomes an axis.
- Custom easing, settles without bounce. The camera reframes between ideas and stays still while text is read.
</motion_language>

<scene_spec>
For every scene write:
- ID and time range
- Teaches: the one thing this scene adds
- Frame: what is on screen and in what order of importance
- Motion: enter, key action, settle, exit
- Words: on-screen text (max 8 words a line) and voice line, if any
- Sound: the cue that marks the key action
- Check: what the viewer can now say that they could not before
</scene_spec>

<copy>
- Max two lines on screen at once; plain words before jargon.
- Never put the full voice line on screen; on-screen words are anchors.
- One name per thing, used every time.
- Every number has a source in SOURCES.md, or it goes.
</copy>

<sound>
- A tempo-locked procedural bed (Web Audio) with one motif that returns on the key idea.
- Soft UI cues only on actions that carry meaning; duck the bed under voice.
- About -16 LUFS integrated, true peak at most -1.5 dBTP. Check it muted and audio-only.
</sound>

<accessibility>
- Contrast at least 4.5:1; captions burned in and shipped as .srt.
- Color is never the only signal. No flashes above 3 per second.
- A reduced-motion cut that keeps the same sequence of ideas.
</accessibility>

<render_contract>
- window.seek(t) paints the frame at time t; every frame is a pure function of t.
- One TIMELINE object holds every beat, move and cue. Seeded randomness only.
- Headless Chrome steps t = n/60 and pipes frames to ffmpeg (libx264, crf 16, yuv420p).
</render_contract>

<workflow>
1. One-sentence idea and the viewer outcome.
2. Tokens. 3. directions.html with 3-4 directions; mark the winner and why.
4. Storyboard as a contact sheet. 5. Animatic and timing pass.
6. Full build. 7. Sound and captions. 8. Verification. 9. Export.
</workflow>

<verification>
Run these; do not just claim them.
- Render one frame twice and diff it: identical.
- A still at every beat; read every line at 390 px wide.
- Watch it muted, then listen audio-only.
- A design-review subagent asks her questions; an accessibility pass follows.
- Every fix ships with a before/after frame pair. [Dive Club]
</verification>

<delivery>
out/master_16x9.mp4, out/cut_9x16.mp4, out/cut_1x1.mp4, captions.srt, contact.png, source, and a README that lists only what was tested.
</delivery>

<autonomy>
Do not stop for approval on creative calls. Stop only for missing rights, unsafe content, or an ambiguity that changes the goal.
</autonomy>
</prompt>
