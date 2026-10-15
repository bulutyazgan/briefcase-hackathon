---
name: prototype
description: Build a throwaway prototype to answer a design question. Use when the user wants to sanity-check whether a state model or logic feels right, or explore what a UI should look like.
---

# Prototype

A prototype is **throwaway code that answers a question**. The question decides the shape.

## Pick a branch

Identify the question that the prototype answers. Use the prompt of the user, the surrounding code, or ask the user if the user is available.

- **"Does this logic / state model feel right?"** → [LOGIC.md](LOGIC.md). Build a single shareable HTML file with free-play buttons and tabbed guided walkthroughs. It pushes the state machine through cases that are hard to reason about on paper. A non-developer can drive it.
- **"What should this look like?"** → [UI.md](UI.md). Generate several radically different UI variations on a single route. A URL search param and a floating bottom bar switch between them.

The two branches produce very different artifacts. If you pick the wrong branch, you waste the full prototype. The question can be genuinely ambiguous while the user is not reachable. Then use the branch that better matches the surrounding code (a backend module → logic, a page or component → UI). State the assumption at the top of the prototype.

## Rules that apply to both

1. **Throwaway from day one, and clearly marked as such.** Put the prototype code near the place where it will actually be used. Put it next to the module or page that it is for. Then the context is obvious. But name it so that a casual reader can see it is a prototype, not production. For throwaway UI routes, obey the routing convention that the project already uses. Do not invent a new top-level structure.
2. **Trivial to run.** A UI prototype starts from one command in the task runner of the project: `pnpm <name>`, `python <path>`, `bun <path>`, etc. A logic demo is a single HTML file that the user double-clicks. In both cases, the user must not need to think to start it.
3. **No persistence by default.** State lives in memory. The prototype _checks_ persistence. It must not depend on it. If the question explicitly involves a database, use a scratch DB or a local file with a clear "PROTOTYPE — wipe me" name.
4. **Skip the polish.** No tests, no abstractions, and no error handling beyond what makes the prototype _runnable_. The goal is to learn something fast.
5. **Surface the state.** After every action (logic) or on every variant switch (UI), print or render the full relevant state. Then the user can see what changed.
6. **Capture it when done.** Do these steps:
   1. Put any proven decision into the real code.
   2. Capture the prototype itself as a **primary source**. Commit it to a throwaway branch, out of main.
   3. Leave a context pointer to that branch on the implementation issue.
   4. Capture the answer too: the verdict and the question that it settled. Put it in the issue or a commit.

   The main branch keeps only the proven decision.
