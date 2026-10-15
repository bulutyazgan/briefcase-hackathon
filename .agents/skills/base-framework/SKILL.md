---
name: base-framework
description: >-
  The Base framework — cf0's agent-first architecture (our Dune). Load before
  writing, moving, or reviewing any code in apps/: adding files or features,
  imports across feature boundaries, D1 access, SQL, stores, ledgers, new
  product surfaces, "where does this live" questions, or when a structure/lint
  gate fails and you need to know why. It encodes the five rules as a decision
  procedure and routes to the canonical references inside this package.
---

# Base — the framework skill

Base is the agent-first framework layer of cf0. It supplies discovery, boundaries, structure law and verification once, so a feature supplies only behavior. Grok calls theirs Dune. Ours is Base. The five rules are hard constraints, not style:

1. **The conventional path requires fewer decisions than a shortcut.**
2. **Forbidden dependencies fail mechanically.**
3. **Every durable value has one obvious writer.**
4. **New product work adds isolated files rather than branches in shared roots.**
5. **Exceptions are narrow, explicit, and reviewed as architecture changes.**

If you are about to write code that violates one of these "just this once", stop. The answer is a different file location or an injected dependency, not an exemption.

## Before writing code: the placement procedure

Answer in this order. Each question has exactly one right answer.

1. **Which feature owns this behavior?** If no feature owns it, the work goes in one of two places:
   - `shared/`, for app-agnostic utility only. `shared/` never imports a feature.
   - A new feature folder.

   It is never a branch inside the file of another feature.
2. **What layer does the owner sit at?** API features import only from strictly lower layers:

   `shared` < `identity` < `contacts` < `files` < `actions` < `work` < `mail` < `integrations` < `onboarding` < `registry` < `agent`

   Nothing imports `agent`. If a lower feature needs higher behavior, the composition root injects it. Only `app.ts`, `scheduled.ts` and `index.ts` may import across freely.
3. **Which reserved slot does the code go in?** Do not invent layout. The anatomy is fixed (below).
4. **Does anything cross a boundary?** Cross-feature traffic goes through the edge file only (`index.ts` on web, `routes.ts` on api). Never deep-import the internals of another feature.
5. **Who writes the durable value?** Each value has one writer.
   - D1 lives only in `repo.ts`, `*-ledger.ts`, or `store.ts`/`*-store.ts`.
   - `.prepare()` takes constant SQL only.
   - If another feature needs your write, expose a fragment or function at your edge. Do not let the other feature write your table.

## Web feature anatomy — `apps/web/src/features/<name>/`

| File | Role |
|---|---|
| `entrypoint.ts` | Route identity + policy, eager. The catalog reads this file. |
| `index.ts` | The only public cross-feature edge |
| `feature-map.md` | Product knowledge SOT, in four sections: Sub-features, How to get to it (user POV), Driving it with agent-browser, Gotchas (the `verification` skill has the contract) |
| `workspace/` | Everything else, flat and co-located: lazy `view.tsx`, `store.ts` (Client: one writer, named commands, request keys), `api.ts` (the only place where `fetch` may live), components, cards, `*.stylex.ts` |

Discovery is mechanical. `features/catalog.ts` globs entrypoints eagerly and views lazily. It checks the catalog when the module loads. Never register a feature in a shared inventory. The reserved files are the registration.

## API feature anatomy — `apps/api/src/features/<name>/`

| File | Role |
|---|---|
| `routes.ts` | The typed edge, and the only public surface |
| `service.ts` | Behavior |
| `repo.ts`, `*-ledger.ts`, or `store.ts`/`*-store.ts` | Sole D1 writer for the tables of the feature, constant SQL |
| `feature-map.md` | Product knowledge SOT |

API layer order is law (`docs/decisions/2026-09-24-api-feature-layers.md`). Composition roots inject downward. For example, `identity` receives the org eraser of each feature from `app.ts`. It does not import the features.

## Patterns that resolve "impossible" constraints

- **Another feature must write into my table** → export one plain, idempotent ledger function from your edge. The exemplar: `work` exports `createTaskLedger`, and `mail` calls its `recordTask` for the task of an unanswered email. The task id comes from `(orgId, idempotencyKey)`, so a replay writes no second row (`docs/decisions/2026-10-06-ledger-writes-from-the-single-writer.md`). One writer and constant SQL both hold.
- **A lower layer needs higher behavior** → inject it at the composition root. Never add an upward import or an exemption.
- **A type must be re-exported** → use `export type`. Never use a value export of a type, because it crashes at runtime under bun.
- **Data arrives untyped** → narrow honestly (`isRecord`, `unknown` → guard). These are all banned at zero tolerance: `as`, `as unknown as`, `!`, unchecked `JSON.parse` casts and generic type predicates.

## The gate (what will catch you anyway)

`./c check` is every gate, in one table (`./c check --list`). The steps are these:

- structure (`base.rules.yaml` + layout law)
- syntax (sg-rules)
- styles (StyleX values)
- deps (syncpack)
- types (`tsc`, `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`)
- format (biome)
- clones (jscpd)
- dead-code (knip)
- health (react-doctor ≥90)

Each check has one step. A failure names `./c check <step>`, so you can run it again. `.githooks/pre-commit` runs `./c check --staged` on every commit. It is the only place where those steps run. CI runs `./c check --ci`: the fresh-D1 schema apply, the web build + `verify:dist`, and structure as the `--no-verify` backstop. CI runs only these steps to stay inside the free GitHub Actions minutes. Never commit with `--no-verify`.

An agent can make a rule stricter at any time. A looser rule needs a PR and the `rules-approved` label, which only a human adds. Locally the scanner warns about the loosening. On `main` it blocks the commit.

## References — load the one you need

| File | Load when |
|---|---|
| `references/foundations.md` | You design anything structural: the five nouns, the vertical-slice blueprint, the guardrail ladder, the one-writer write path. Then verification, trust, automations, the formal-verification rung (§12), and the Base name and lifecycle (§13). |
| `references/rules-catalog.md` | You check the disposition of a specific ban. It holds the rule catalog and the enforcement ledger, which names the engine that owns each rule. Then the public Dune research record. |
| `references/transformation-plan.md` | You want to know why the codebase looks the way it does. It records the applied phases. |
| `references/source-lauren-tan.md` | The research record behind it all: talks, deck breakdown, provenance. |

Settled decisions live in `docs/decisions/` (indexed in its README). This skill does not copy them. Read them before you touch the agent, mail, identity, tasks or configuration surfaces.

## Meta-rule

If you can defend an invariant only in review comments, that is a code smell. When you explain a rule twice, move it down the ladder: prose → type → lint rule → structure rule. A new rule lands as one `base.rules.yaml` entry or one sg-rule file, plus the fix to zero in the same change. It is never a new script.
