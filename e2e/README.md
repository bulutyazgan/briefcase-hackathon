# Tally e2e harness

Drives the real Tally web UI and server in headless Chromium against local
replicas of every paid provider.

## Run

```sh
bun install
bun run e2e                          # all non-pending scenarios
bun run e2e northwind-main-story     # one scenario
bun run e2e -- --include-pending     # also run scenarios listed in e2e/pending.ts
bun run --cwd=e2e mocks              # mock providers alone on :4010
bun e2e/stack.ts                     # mocks + server + web, kept up for manual driving
bun e2e/doctor.ts                    # read-only health check of a running stack
```

`run.ts` starts the mocks (:4010), the Vite dev server (:5179), and, per
scenario, a fresh server on :8797 (`E2E_API_PORT`; `support/vite-e2e.config.ts` proxies there)
with a temp SQLite file, `STRIPE_SECRET_KEY=sk_test_mock`, Treg/Cognee pointed at
the mocks, and no OpenAI/Fireworks/Firecrawl/Slack keys (the product uses its
deterministic fallbacks). A `bun run dev` on :8787 can keep running.

Evidence lands in `e2e/artifacts/` (git-ignored): `<scenario>/<nn>-<step>.png`,
`<scenario>.server.log`, `mock-log.json` on failure, and `results.json`.

Scenarios live in `e2e/scenarios/`; `e2e/pending.ts` lists scenarios and
sub-checks that wait on unmerged product work, with the reason. The UI is routed:
scenarios open `/app/inbox` (composer, approval cards), `/app/invoices/<id>`
(evidence trail, Stripe link) and `/app/audit`; `support/harness.ts` holds the
navigation helpers and the selectors (`approvalCard`, `stripeInvoiceLink`).
Scenarios: `northwind-main-story`, `unknown-sender-refused`, `replay-safety`,
`pause-blocks-billing`, `acme-auto-send`, `treg-sourcing`, `globex-dispute`
(credit note, P11), `buyer-agent` (pending: the Stripe mock lacks
`POST /v1/invoices/:id/send`).

## What the mocks replicate (`e2e/mock-providers/`)

- **Stripe** (`stripe.ts`): form-encoded `/v1` customers list/create,
  invoiceitems, invoices create/finalize/retrieve/list/pay, credit_notes,
  billing/meter_events, tax_rates. `Idempotency-Key` returns the cached object.
  Finalize sets `open` and `hosted_invoice_url=<mock>/hosted/<id>`; that page has
  a "Pay with 4242" button that marks the invoice paid. `rk_test_` keys get
  Stripe's 403 permission error on refunds/charges/payouts/payment_intents.
  Pending invoice items are only pulled into an invoice with
  `pending_invoice_items_behavior=include`, matching real Stripe's default.
- **Treg** (`treg.ts`): `POST /call/<catalog id>?<apollo params>`, shapes from
  `server/src/features/leads/providers/treg/treg-client.ts`. Requires
  `X-Treg-Token`, returns `X-Treg-Cost-Micro` and `X-Treg-Call-Id`, refuses with
  402 `route_max_cost` and no charge when the price exceeds `X-Treg-Route-Max-Cost`.
- **Cognee** (`cognee.ts`): `add`, `remember`, `cognify`, `search` with
  `X-Api-Key`, per-dataset storage. `run.ts` loads `server/seed/memory.json`
  into the mock, standing in for seeding a real tenant.
- `GET /__log` (every provider request with headers, body, status and response
  headers), `POST /__reset`, `GET /__state`.

`billing.ts` now honours `STRIPE_API_BASE`; `support/stripe-base-preload.ts`
(bun --preload) also rewrites the SDK default host as a belt-and-braces guard
so no harness run can reach api.stripe.com. Safe to delete.

## Not proven

- Real Stripe, Treg and Cognee accounts, auth, rate limits and response drift.
  The mocks follow documented shapes and can be wrong in the details.
- OpenAI and Fireworks extraction (only the heuristic fallback runs), Firecrawl, Slack.
- The PDF content (only that rendering ran and the link exists).
