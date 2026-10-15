# Logic Prototype

A logic prototype is a single, self-contained HTML file. It is a **shareable demo** that lets anyone drive a state model by clicking buttons. Use it when the question is about **business logic, state transitions, or data shape**. These things look reasonable on paper, but they can feel wrong when you push them through real cases.

It is one file with nothing to install. So you can give it to a non-developer (a designer, a PM, a domain expert) and let them feel the model for themselves. It speaks their language, not the language of the code.

## When this is the right shape

- "I'm not sure if this state machine handles the edge case where X then Y."
- "Does this data model actually let me represent the case where..."
- "I want to feel out what the API should look like before writing it."
- Anything where someone wants to **press buttons and watch state change**.

If the question is "what should this look like", this is the wrong branch. Use [UI.md](UI.md).

## Process

### 1. State the question

Before you write code, write down the state model and the question that you prototype. Write one paragraph at the top of the demo, in a visible intro, not only in a comment. A logic prototype that answers the wrong question is pure waste. Make the question explicit, so that someone can check it later. This applies when the user watches now and when the user comes back to it AFK.

### 2. Isolate the logic in a portable module

Put the actual logic (the part that answers the question) in a single `<script>` block. Write it as a small, pure module that you can later lift out and drop into the real codebase. The page around it is throwaway. This module is not.

The right shape depends on the question:

- **A pure reducer**: `(state, action) => state`. Good when actions are discrete events and state is a single value.
- **A state machine**: explicit states and transitions. Good when "which actions are even legal right now" is part of the question.
- **A small set of pure functions** over a plain data type. Good when there is no implicit current state, only transformations.
- **A class or module with a clear method surface**, when the logic genuinely owns ongoing internal state.

Pick the shape that best fits the question, *not* the shape that is easiest to connect to a page. Keep it pure:

- No DOM.
- No `document`.
- No button handlers that reach inside it.

The page calls into the module. Nothing flows in the other direction. This makes the prototype useful after its own lifetime. When the prototype answers the question, the proven reducer / machine / function set lifts into the real module by itself.

### 3. Build the shareable HTML file

Use one file of plain HTML/CSS/JS. Use no framework, no bundler and no server. Put everything inline, so that it opens by double-click and still works after people email it around. Anyone should be able to run it by opening it.

Write it for a non-developer. Every label is in **domain language**, not code. Buttons and state read like the business, not like the reducer. Explain in plain words what happens.

Use a clean hierarchy, from top to bottom:

1. **Title and one-line explanation** of what this demo lets you explore (the question from step 1).
2. **Current state.** Show the full relevant state as a readable panel (labelled fields, not a raw JSON dump). Render it again after every click, so that the change is visible. Where it helps a non-developer, show what just changed.
3. **Free-play buttons.** Show one button for each action, always available. Then anyone can try the model in any order. Each click dispatches its action and renders the state again.
4. **Guided walkthroughs.** Show a set of **scenarios**, one for each tab:
   - Each tab holds a short plain-language description of the scenario: the situation that it sets up and what to watch for.
   - Below the description are the ordered **buttons to press** for that scenario.
   - Each step is a real button. A click performs that action and moves to the next step.
   - A walkthrough starts with a reset to a known initial state, so the scenario runs the same way every time.

Choose scenarios that show the awkward cases: the happy path, a tricky edge case, and an attempt at something that should be illegal. These are the cases that are hard to reason about on paper.

Keep it beautiful but restrained: clean typography, generous spacing, one accent colour. Use no animations and no gimmicks. Nothing should compete with the state and the buttons.

### 4. Hand it over

Send them the file, or open it for them. They click through the walkthroughs and free-play when they have time. The interesting moments come when they say "wait, that shouldn't be possible" or "huh, I assumed X would be different". Those are the bugs in the _idea_, and finding them is the purpose. If they want new actions or a new scenario, add them. Prototypes evolve.

### 5. Capture the answer and the prototype

When the prototype answers its question, capture the answer. Then capture the prototype as the [SKILL](SKILL.md) describes. For a logic prototype, the mapping is this:

- The proven reducer / machine / function set lifts into the real module. This is the decision, absorbed.
- The HTML shell goes to the throwaway branch that keeps the prototype as a primary source. It is one self-contained file, so it stays trivially re-runnable there.

## Anti-patterns

- **Do not add tests.** A prototype that needs tests is no longer a prototype.
- **Do not connect it to the real database.** Use in-memory state, unless the question is specifically about persistence.
- **Do not generalise.** No "what if we wanted to support X later." The prototype answers one question.
- **Do not mix the logic and the page together.** Keep the page as a thin shell over a pure module. You cannot lift out a module that references the DOM, `document`, or button handlers.
- **Do not use a framework, bundler, or server.** Use one file that the recipient double-clicks. A React app or a dev server defeats "shareable".
- **Do not ship the HTML shell into production.** The page is optimised for clicks by hand. The logic module behind it is the part to keep.
