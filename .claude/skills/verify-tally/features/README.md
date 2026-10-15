# Tally verification map

The maintained source for verifying Tally's user-facing behaviour. Read this
index, then use the matching feature file as the recipe.

## Baseline preconditions

- Ports 8797, 5179 and 4010 free (a `bun run dev` on :8787 is fine).
- Scripted: `bun run e2e <scenario>` starts everything with a fresh ledger.
- Ad hoc: `bun e2e/stack.ts` printed `TALLY STACK READY` and `bun e2e/doctor.ts` exits 0.
- Seed: ledger empty; Cognee mock holds Northwind's facts (10% off orders over
  200 leads, 7-day terms, billing contact). Known simulator senders:
  `Client — Northwind`, `Account owner`.

## Driving conventions

- Prefer ARIA roles and accessible names (listed in `../SKILL.md`).
- Messages are processed by a 2s agent loop; payment is polled every 10s.
- Use the simulator endpoint (`drive.ts post` / `thread-reply`) only for senders
  or thread replies the UI cannot produce, and record that you did.

## Proof and skip reporting

- Screenshot the action and the resulting state; pair UI proof with the mock
  `/__log` or `drive.ts state` for side effects.
- Report pending scenarios/sub-checks from `e2e/pending.ts` as pending, with the reason.

## Feature entry contract

Each file: H1, one paragraph, then `Sub-features`, `How to get to it (user POV)`,
`Driving it with e2e harness`, `Gotchas`.

## Features

- [Client channel simulator](./client-channel.md): sending messages, agent replies, refusals (P1, P5).
- [Approvals](./approvals.md): approval card for invoices over £1,000 (P4), approve/reject, replay safety (P6).
- [Invoices and evidence](./invoices-evidence.md): invoice list, amount, quote, memory fact, clauses.
- [Hosted payment and delivery](./hosted-pay-delivery.md): client pays the Stripe hosted invoice, Tally posts the lead list.
- [Why-explain](./why-explain.md): "Why £1,080?" answered with cited evidence.
- [Kill switch](./kill-switch.md): `/pause` and `/resume` (F1).
- Credit notes (P11): `bun run e2e globex-dispute`. Agent-to-agent buyer (B1–B3): `bun run e2e buyer-agent` (pending, see `e2e/pending.ts`).

The UI is routed since the redesign: `/app/inbox` (composer, "Pending approvals"
cards), `/app/invoices` (table), `/app/invoices/<id>` ("Evidence trail", `View
Stripe invoice`), `/app/audit`. Where a recipe below names the old single-page
panels ("Invoice approval" region, "Invoices" panel, `Open Stripe invoice`,
"Evidence for this invoice", Guardrails), read the current selectors in
`../SKILL.md`; the scripted scenarios are the maintained source.
