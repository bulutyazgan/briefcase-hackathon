---
name: base-framework
description: >-
  Repository architecture guidance. Load before writing, moving, or reviewing
  code in web/ or server/, changing feature boundaries, or changing durable
  state and its writer.
---

# Repository architecture

Follow `AGENTS.md` and `PLAN.md`. This guide applies their structure to code
placement and ownership.

## Core rules

1. The conventional path should require fewer decisions than a shortcut.
2. Forbidden dependencies should fail mechanically where practical.
3. Every durable value has one obvious writer.
4. New work should stay inside the feature that owns it.
5. Exceptions should be narrow and explicit.

## Placement procedure

1. Put web behavior in `web/src/features/<name>/` and server behavior in
   `server/src/features/<name>/`. Keep related behavior together.
2. Follow the feature's existing file and import patterns. Do not add a shared
   registry or abstraction without a concrete need.
3. Keep database writes in `server/src/features/ledger`. It is the only
   database writer and uses `bun:sqlite`. Other features call its named
   functions.
4. Keep vendor-specific code inside the owning feature, under `providers/` or
   `adapters/` when that boundary is needed.
5. Keep types honest. Use `unknown` and narrow it with a guard. Do not use
   `any`, `as` casts except `as const`, or default exports. Use kebab-case
   file names.

## Web features

Web features live in `web/src/features/<name>/`. The current layout uses files
such as `view.tsx`, `api.ts`, and `*.stylex.ts`. Follow the structure of the
closest feature instead of inventing a new feature anatomy.

Use tokens from `web/src/tokens/tokens.stylex.ts`. Keep styling in StyleX and
do not add a CSS framework.

## Server features

Server features live in `server/src/features/<name>/`. Keep route handling,
domain behavior, and integration code with the feature that owns them. Call
the ledger for durable writes; do not write to SQLite from another feature.

## Verification

Run `bun run typecheck` after code changes. Run `bun run build` when a change
can affect the web build. Read `PLAN.md` for the product flow and the
acceptance details for the task.
