---
name: product-design
description: >-
  Single entry point for product design and user-facing implementation in
  apps/web. It covers shaping flows, building or reviewing pages and
  components, and product copy. It also covers DESIGN.md/token compliance
  across hierarchy, layout, interaction, accessibility, and every reachable
  state. Also applies when backend behavior changes a user-visible outcome.
  Not for backend-only, test-only, or marketing work.
---
# cf0 Product Design

Make the interface right for the user, the product, and cf0. Working code is not enough. Choose the right interaction. Make scope and consequences clear. Cover reality beyond the happy path. Check the rendered result.

## Operating Contract

- **Start with the job, not the pixels.** Identify these items:
  - who acts (letting agent, landlord, tenant, contractor, applicant)
  - what they try to accomplish
  - the product object (property, portfolio, task, work order, conversation)
  - what the system will change
- **Define the outcome before the output.** Set the current user problem, the desired behavior, the success signal, and the non-goals. Do this before you choose a surface or component.
- **Use evidence, not taste.** Trace each decision to product behavior, canonical repository guidance, an accepted design decision, or a checked adjacent pattern.
- **Separate facts from decisions.** Mark assumptions and unresolved product choices explicitly. Do not hide them inside implementation details.
- **Treat shipped code as evidence, not automatic precedent.** It proves what exists, not why it is right. Check it against current components, product behavior, and explicit guidance.
- **Choose the smallest coherent intervention.** Before you add UI, consider better defaults, better behavior, or reuse. Do not solve one job with unrelated settings or abstractions.
- **Decide before decorating.** Resolve information architecture, component semantics, interaction, and state behavior before you style or rewrite copy.
- **Design every reachable state.** Include only states that the product can actually enter. Do not stop at the populated success case.
- **Check the real surface.** Source inspection establishes behavior. A rendered interface establishes visual and interaction quality. Never claim visual verification from code alone.
- **Keep one user-facing entry point.** Invoke `product-design`. It routes internally to the canonical sources below.

## The System

- **Token source.** `apps/web/src/tokens/design-tokens.css` owns values. `apps/web/src/tokens/token-consts.stylex.ts` exports their typed accessors. See `DESIGN.md` for the settled design decisions.
- **Typography, labels and color.** Follow `DESIGN.md` sections "Typography", "Labels and copy" and "Color". Do not duplicate those decisions here.
- **Closed-API components.** `apps/web/src/components/ui/`, imported via `@/ui/*`, is the component source. It holds `Button`, `Dialog`, `Select`, `Tabs`, `Table`, `Metric`, `PageHeader` and `EmptyState`. These components take no `className` or `style` unless the component API names that prop. Add a variant to the component when a need is missing. See `DESIGN.md` for the closed-API exception.
- **Liquefy primitives.** `liquid-button`, `liquid-segmented`, `liquid-menu`, `liquid-progress` and `liquid-breadcrumbs` render through `@liquefy-ui/core`. Their wrappers and theme mapping live in `apps/web/src/components/ui/` and `apps/web/src/tokens/liquefy-ui.css`. Follow `DESIGN.md` §Buttons and controls.
- **Strobi.** `StrobiAvatar` (`apps/web/src/components/ui/StrobiAvatar.tsx`) accepts `mood?: AvatarMood`. Use the mood table and mapping in `DESIGN.md` §Strobi.

## Request Modes

Resolve the mode from the verb and artifact of the user before you act.

| Mode      | Typical request                                                     | Required behavior                                                                                                                                                     |
| --------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shape     | "Design this flow", "How should this work?", feature brief without settled UI | Frame the problem and evidence. Compare material alternatives. Then define the flow, states, acceptance criteria, risks, and open decisions. Do not edit unless asked. |
| Implement | "Build", "fix", "improve", "make compliant"                          | Resolve material product decisions. Then implement the smallest coherent end-to-end change within scope. Do not absorb unrelated review findings.                      |
| Review    | "Audit", "critique", "what's wrong?", code review                    | Inspect source and rendered evidence. Then report prioritized findings. Do not edit unless asked.                                                                      |
| Copy      | "Fix the copy", "rewrite these errors"                               | Edit user-facing language, accessible names, and directly required JSX only. Report structural blockers. Do not silently broaden scope.                               |
| Harden    | "Polish", "production-ready", "handle edge cases"                    | Keep the settled product direction. Fix state, resilience, responsive, accessibility, and finish defects.                                                             |

When intent is ambiguous, use the narrowest mode that the verb supports. A URL, screenshot, route, or component identifies scope. It does not by itself authorize edits.

A material decision changes one of these: the task of the user, a default, scope, a consequence, navigation, the interaction surface, or reachable states. Copy mechanics, token replacement, and established component substitutions usually are not material.

## Decision Authority

Resolve conflicts in this order:

1. The explicit goal and constraints of the user.
2. Checked user/product evidence and system truth.
3. Repository-canonical guidance: `AGENTS.md`, `DESIGN.md`, token SOT `apps/web/src/tokens/design-tokens.css` (values) + `apps/web/src/tokens/token-consts.stylex.ts` (typed accessors), `sg-rules/`, and routed skills (`stylex-authoring`, `react-doctor`).
4. Accepted product/design decisions and exemplars with stable evidence.
5. Checked adjacent shipped patterns in the same product area.
6. General interface heuristics.

## Workflow

### 1. Set scope and mode
Name the target surface and request mode in the work plan or review notes.

### 2. Load product context
Before you propose UI, read these sources:

- the applicable `AGENTS.md` chain
- supplied briefs and designs
- the product logic that determines mutations, permissions, validation, errors, and side effects

### 3. Model the product decision
Do this step for Shape, Implement, Harden, full Review, or any material product/flow change. Read `references/product-judgment.md`. Write a compact internal brief. The brief covers user, job, current behavior, desired outcome, success signal, non-goals, object, scope, action, consequence, reversibility, permissions, and open decisions.

### 4. Map the surface and states
Inventory entry points, visible regions, overlays, transitions, exits, and return paths. Map only reachable states. These include loading, empty, sparse, populated, validation, error, permission, disabled, optimistic, stale, destructive, and responsive variants.

### 5. Load the routed references

| Need | Load |
| ---- | ---- |
| Product/flow/component decision | `references/product-judgment.md` |
| Implementation, material visual change, or full review | `references/interface-quality.md` |
| Copy or accessible names | `references/copy.md` + `references/surfaces.md` routing |
| Layout, typography, color, spacing, token values | `DESIGN.md` + `apps/web/src/tokens/token-consts.stylex.ts` + `stylex-authoring` skill |
| Overflow, localization, extreme data, network/error resilience | `references/resilience.md` |
| Surface-specific decisions | `references/surfaces.md` → `references/surfaces-{surface}.md` |

### 6. Decide, then implement
For each non-mechanical change, you must be able to answer these questions:

- What user problem does this solve?
- Why is this component appropriate?
- What consequence must the interface communicate?
- Which evidence supports the decision?
- What is the smallest coherent change?

### 7. Check the result
1. Check the primary job and acceptance criteria.
2. Run `./c check` (biome, ast-grep, jscpd, knip, react-doctor, types and structure).
3. For any UI change, use the `verification` skill to drive the affected routes at 1440px and 390px. Reach each changed state. Record console errors and check for horizontal overflow.
4. Save screenshots and report them as evidence. The `verification` skill has the proof-artifact convention.
5. If the required browser path is blocked, report the exact blocker. Do not claim visual verification from code alone.
6. Exercise every materially changed reachable state.
7. Check keyboard order, focus movement, loading behavior, and pointer/touch targets.
8. Test long content, large values, constrained width, and localization/RTL risk.


## Product Design Standards

- Make the primary task and primary action of the user unmistakable.
- Keep the mental model and current context of the user, unless a change solves a verified problem.
- Name the exact object, scope, and consequence of important actions.
- Use navigation components for navigation and action components for actions.
- Reach for `@/ui/*` first (`apps/web/src/components/ui/`, closed-API). Hand-roll only when no component covers the case.
- Match surface persistence to importance.
- Prefer inline disclosure before you add a modal.
- Expose advanced controls when needed. Do not make the default path carry their complexity.
- Prefer strong defaults and direct behavior over configuration that the user must learn and maintain.
- Use hierarchy, spacing, and alignment before you add containers.
- Keep user input through validation and recoverable errors.
- Keep loading control labels stable. Use the loading/busy affordance of the component.
- Make destructive actions proportional to impact. Provide undo when the system can honestly support it.
- Do not add decorative novelty, motion, or copy unless it clarifies structure, state, or brand intent.
- Follow `DESIGN.md` sections "Typography", "Color", "Surfaces and elevation", and "Enforcement". Do not restate their values or rules here.

## Review Output

Lead with findings, ordered by user impact:

- **P0:** blocks the primary task, creates severe accessibility failure, or can cause unrecoverable user harm.
- **P1:** likely task failure, misleading consequence, missing critical state, or major responsive/accessibility defect.
- **P2:** meaningful friction, inconsistency, weak hierarchy, or recoverability issue.
- **P3:** minor craft or consistency improvement.

For each finding, include these items: file/line or rendered location, verification status, canonical source, user consequence, and smallest concrete fix.

## Skill Integrity

- Add or change a rule only after verification against current sources and human acceptance.
- Record scope, rationale, evidence, exceptions, and a bad/good example.
- Prefer the narrowest destination: canonical source, routed reference, exemplar, lint/eval check, or coverage gap.
- Keep deterministic checks mechanical. Keep judgment in prose with its evidence and degree of freedom.
- Never promote one screenshot, one shipped file, or one reviewer comment into a universal rule by itself.
