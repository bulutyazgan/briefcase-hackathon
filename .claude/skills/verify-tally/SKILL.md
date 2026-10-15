---
name: verify-tally
description: "Drive the Tally billing agent's web UI (client channel simulator, approval card, invoices + evidence, guardrails) in headless Chromium against local Stripe/Treg/Cognee mocks, and capture screenshot + mock-log proof. Use to prove a Tally change works end to end, before demoing, or when asked to verify/screenshot Tally behaviour."
---

# Verify Tally

Tally's user surface is the web UI (`web/`, Vite) backed by the Bun API (`server/`).
Paid providers are replaced by one mock server (`e2e/mock-providers/`, :4010) that
logs every request. Fireworks/Firecrawl/Slack keys are never set, so the product
uses its deterministic fallbacks. Feature recipes live in [`features/`](features/README.md).

Two ways to drive:

- **Scripted (preferred for proof):** `bun run e2e <scenario-id>` boots its own
  isolated stack per scenario, drives the UI, asserts UI + ledger + mock log, and
  tears down. Needs ports 8797, 5179 and 4010 free.
- **Ad hoc:** `bun e2e/stack.ts` keeps a stack up; `bun e2e/drive.ts <action>`
  performs one user action and saves evidence.

Never run both at once: both use API :8797 (E2E_API_PORT), web :5179 and mocks
:4010. `support/vite-e2e.config.ts` points Vite's proxy at :8797, so a
`bun run dev` on :8787 can keep running; never drive that instance.

## Launch

```sh
bun install                                   # once
mkdir -p e2e/artifacts/stack
bun e2e/stack.ts > e2e/artifacts/stack/stack.out 2>&1 &   # run in background
until grep -q "TALLY STACK READY" e2e/artifacts/stack/stack.out; do sleep 1; done
```

Ready = the line `TALLY STACK READY web=http://127.0.0.1:5179 api=http://127.0.0.1:8797 mock=http://127.0.0.1:4010 db=… pid=…`.
By then the ledger is reset in a fresh temp SQLite file, Cognee mock holds
`server/seed/memory.json`, the API answers `/health`, and Vite serves the UI.
It refuses to start (exit 2) if :8797 already answers.

Scripted runs need no launch: `bun run e2e` (all non-pending), `bun run e2e <id>`,
`bun run e2e -- --include-pending`.

## Doctor

```sh
bun e2e/doctor.ts
```

Read-only. Checks: `e2e/artifacts/stack/stack.json` exists (we own the stack),
mocks `/__health`, API `/health`, web up, web proxies `/api/state`,
`GET /api/control` reports a test key, Chromium present at
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. Any `FAIL` → do not drive;
clean up and relaunch.

## Drive

Scripted scenario ids (see `e2e/scenarios/index.ts`): `northwind-main-story`,
`unknown-sender-refused`, `replay-safety`, `pause-blocks-billing`,
`acme-auto-send` (pending), `treg-sourcing` (pending). `e2e/pending.ts` says why
each pending id is skipped; remove the id when the feature lands.

Ad-hoc actions against a launched stack (each waits for the 2s agent loop, or 12s
for the 10s payment poller, then saves evidence):

```sh
bun e2e/drive.ts send "Let's kick off Q4. 300 fintech CFO leads in London, same deal as last time."
bun e2e/drive.ts send "/resume" --as "Account owner"
bun e2e/drive.ts approve            # or: reject
bun e2e/drive.ts pay                # opens newest invoice's hosted page, clicks "Pay with 4242"
bun e2e/drive.ts thread-reply "Why £1,080?"
bun e2e/drive.ts post "Client — Initech" "Let's kick off. 300 leads please."
bun e2e/drive.ts snap <name>
bun e2e/drive.ts state              # ledger summary (read-only)
bun e2e/drive.ts log                # every mock provider request
```

Stable handles (Playwright): message box `getByLabel('Message')`, sender
`getByLabel('Send as')` (options `Client — Northwind`, `Account owner`), button
`Send`; approval `getByRole('region', { name: 'Invoice approval' })` with buttons
`Approve invoice` / `Reject`; invoices `getByRole('region', { name: 'Invoices' })`,
invoice rows are buttons named `in_mock_… £… · <status>`, link `Open Stripe invoice`,
heading `Evidence for this invoice`, clauses `getByLabel('Policy clauses')`;
guardrails heading `Guardrails`; audit heading `Audit trail`. Hosted invoice page:
button `Pay with 4242`, `getByTestId('paid')`.

Mock assertions: `GET http://127.0.0.1:4010/__log` (provider, method, path,
headers incl. `idempotency-key`, form body, status, response headers),
`GET /__state` (Stripe invoices with totals, Cognee datasets), `POST /__reset`.

## Evidence

- Scripted: `e2e/artifacts/<scenario>/<nn>-<step>.png`, `hosted-invoice-paid.png`,
  `e2e/artifacts/<scenario>.server.log`, `mock-log.json` on failure,
  `e2e/artifacts/results.json`.
- Ad hoc: `e2e/artifacts/drive/<iso>-<action>.png` + `.aria.txt`; server/web logs
  in `e2e/artifacts/stack/`.

Proof standards: drive the UI the way a user does (the simulator endpoint is used
only for senders/threads the UI cannot produce, and says so). Capture the action
and the resulting state. Check side effects in the mock log or `drive.ts state`,
not just the screen: e.g. "no Stripe invoice" means zero `POST /v1/invoices` in
`/__log`. A pending sub-check (e.g. `northwind-stripe-total`) prints a note
instead of asserting; never report it as verified.

## Cleanup

```sh
kill -TERM "$(jq -r .pid e2e/artifacts/stack/stack.json)"
```

`stack.ts` kills only the server, Vite and mocks it spawned, deletes its temp DB
and `stack.json`, and keeps `e2e/artifacts/` (git-ignored). Scripted runs clean
up after themselves; they wipe `e2e/artifacts/` at start, so copy evidence you
need to keep before the next scripted run. Never `pkill bun`/`pkill vite`.

## Helpers

- `e2e/run.ts` (`bun run e2e [ids] [--include-pending]`): scripted scenarios.
- `e2e/stack.ts`: long-running stack; prints the ready line; SIGTERM tears down.
- `e2e/doctor.ts`: read-only health check, exit 0/1.
- `e2e/drive.ts`: one action + evidence (usage at the top of the file).
- `e2e/mock-providers/server.ts` (`bun run --cwd=e2e mocks`): mocks alone.
- `e2e/support/stripe-base-preload.ts`: `bun --preload` plugin that points the
  Stripe SDK at `STRIPE_API_BASE` because `billing.ts` does not yet.
