# Billing policy

- `P1` Bill only from a client message that contains an explicit commitment ("let's do", "go ahead", "order", a quantity).
- `P2` Prices come from the client's price list only (e.g. Northwind £4/lead, Acme £5/lead). The client is billed for leads actually bought and delivered.
- `P3` Discounts only if remembered as agreed (Cognee fact with date) and never above 15%.
- `P4` Auto-send invoices up to £1,000. Above that, one approval from the account owner.
- `P5` Known clients only (in the seeded client list). Unknown → ask, do not bill.
- `P6` One invoice per commitment message (idempotency).
- `P7` Reminders at most once per 24 h, and never after a remembered dispute.
- `P8` Margin ≥ 40% over Treg sourcing cost, otherwise the invoice needs approval.
- `P9` Sourcing spend caps: every Treg call carries `X-Treg-Route-Max-Cost`, and each order has a total sourcing cap. Code enforces both.
- `P10` Treg calls only to an allowlist of catalogue endpoints (people, company, buying signals).
- `P11` A client dispute about delivered leads earns a credit note for the leads the client says were invalid, capped at the number delivered, at the invoice's net price per lead. Auto-issue credit notes up to £200. Above that, one approval from the account owner. The dispute is remembered, so P7 stops reminders.

## Opportunities

Tally spots revenue (order cadence from memory, a need said in the channel, buying signals on target accounts) and offers it. Every gate decision is recorded with its clause.

- `O1` Offers go only to known clients (the seeded list) and only for catalogue services (lead-list).
- `O2` An offer worth up to £1,000 net is posted automatically. Above that, one approval from the account owner before it is posted.
- `O3` At most one open offer per client, a 7-day cooldown after a decline or expiry, and never while a dispute is remembered.
- `O4` An offer bills only after an explicit acceptance in the same thread that quotes it; the acceptance then runs the normal commitment path (P1 to P10).

Notes for code: the order sourcing cap (P9) is 60% of the invoice net. Sourcing cost (micro-USD) is compared with invoice amounts (pence) at a fixed rate of 1 USD = 79p.

## Guardrails

- `F1` Kill switch. A `/pause` message in any channel stops all sourcing and billing. Only the account owner can `/resume`. While paused, every blocked step is recorded in the audit log with clause F1.
- `F2` Least-privilege key. Tally runs on a Stripe restricted test key (`rk_test_`) with write access only to Customers, Invoices, Invoice items, Credit notes and Meter events. Even a prompt-injected agent cannot refund, pay out or create charges: Stripe rejects those calls.
