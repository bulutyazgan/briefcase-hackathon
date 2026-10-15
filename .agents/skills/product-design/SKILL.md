---
name: product-design
description: >-
  Guidance for shaping, building, or reviewing user-facing flows, pages,
  components, and copy in web/. Also applies when server behavior changes a
  visible result.
---

# Product design

Make the interface useful, clear, and consistent with the product. Resolve the
user's task and the consequences of each action before polishing the visuals.
Design every reachable state, not only the happy path.

## Operating contract

- Start with the user's job, the object they act on, and the result they need.
- Define the current problem, desired behavior, success signal, and non-goals.
- Trace decisions to product behavior, repository guidance, or checked
  examples. Separate facts from assumptions.
- Treat shipped code as evidence of current behavior, not automatic precedent.
- Choose the smallest coherent change. Prefer a better default or clearer
  behavior over an unrelated setting or abstraction.
- Include reachable loading, empty, sparse, validation, error, disabled,
  stale, destructive, and responsive states.
- Inspect the rendered surface for visual changes. Do not claim visual
  verification from source code alone.

## Repository sources

- `AGENTS.md` defines the project conventions.
- `PLAN.md` defines the product flow and scope.
- `web/src/tokens/tokens.stylex.ts` is the StyleX token source.
- Reuse existing components in the feature. Keep feature-specific UI in
  `web/src/features/<name>/`.

## Request modes

| Mode | Typical request | Required behavior |
| --- | --- | --- |
| Shape | Design a flow or resolve an open brief | Compare material options, then define the flow, states, risks, and decisions. Do not edit unless asked. |
| Implement | Build, fix, or improve | Resolve material decisions, then make the smallest coherent change in scope. |
| Review | Audit, critique, or review | Inspect source and rendered evidence. Report prioritized findings. Do not edit unless asked. |
| Copy | Fix interface text or accessible names | Edit copy and directly required markup. Report structural issues without silently broadening scope. |
| Harden | Polish or handle edge cases | Improve state handling, resilience, responsive behavior, accessibility, and finish. |

When intent is unclear, use the narrowest mode supported by the request. A URL,
screenshot, route, or component identifies scope but does not authorize edits
by itself.

A decision is material when it changes the user's task, a default, scope,
consequence, navigation, interaction surface, or reachable state. Copy
mechanics and established component substitutions are usually mechanical.

## Decision order

Resolve conflicts in this order:

1. The user's explicit goal and constraints.
2. Checked product behavior and system truth.
3. `AGENTS.md`, `PLAN.md`, and the token source.
4. Accepted decisions and examples with clear evidence.
5. Checked patterns in the same feature.
6. General interface heuristics.

## Workflow

1. Name the target surface and request mode.
2. Read the relevant repository guidance, brief, and behavior that governs
   mutations, validation, errors, and side effects.
3. For a material change, write a short internal brief covering the user, job,
   current behavior, desired result, success signal, non-goals, object, scope,
   action, consequence, reversibility, permissions, and open decisions.
4. Map visible regions, entry points, overlays, transitions, exits, and return
   paths. Include only states the system can reach.
5. Load the relevant reference:

   | Need | Reference |
   | --- | --- |
   | Product or flow decision | `references/product-judgment.md` |
   | Visual implementation or review | `references/interface-quality.md` |
   | Copy or accessible names | `references/copy.md` |
   | Overflow, unusual data, or errors | `references/resilience.md` |
   | A known surface | `references/surfaces.md` |

6. Before implementation, answer: what user problem does this solve, why is
   this interaction appropriate, what consequence must be clear, what evidence
   supports the decision, and what is the smallest coherent change?
7. Check the primary task and changed states. Run `bun run typecheck`; run
   `bun run build` for changes that affect the web build. Render and exercise
   the changed surface when visual behavior is in scope.
8. Report blockers and the evidence for each verification claim.

## Product design standards

- Make the primary task and action clear.
- Keep the user's mental model unless evidence supports a change.
- Name the object, scope, and consequence of important actions.
- Use navigation controls for navigation and action controls for mutations.
- Reuse feature components before adding new ones.
- Prefer inline disclosure before a modal. Use a modal only for a focused task
  or an action that needs interruption.
- Prefer strong defaults to options users must learn and maintain.
- Use hierarchy, spacing, and alignment before adding containers.
- Preserve input through validation and recoverable errors.
- Keep action labels stable while work is pending.
- Match confirmation and undo to the impact of an action.
- Add motion or decoration only when it clarifies structure, state, or intent.

## Review output

Lead with findings by user impact:

- **P0:** blocks the primary task or can cause severe, unrecoverable harm.
- **P1:** likely task failure, misleading consequences, or a major state,
  responsive, or accessibility defect.
- **P2:** meaningful friction or inconsistency.
- **P3:** minor craft improvement.

For each finding, include the location, verification status, relevant source,
user consequence, and smallest concrete fix.

## Skill integrity

- Change a rule only after checking its source and evidence.
- Record its scope, reason, exceptions, and a bad/good example.
- Keep deterministic checks mechanical and judgment rules evidence-based.
- Do not turn one screenshot, file, or review comment into a universal rule.
