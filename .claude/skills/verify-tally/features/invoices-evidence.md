# Invoices and evidence

The "Invoices" panel lists each Stripe invoice with amount and status. Selecting one shows the amount, links (Stripe hosted invoice, PDF, lead list) and "Evidence for this invoice": the client's verbatim quote, the recalled memory fact and the policy clauses.

## Sub-features

- `invoice-list` shows `in_mock_… £1,080.00 · open|paid`.
- `invoice-amount` Northwind 300 leads = £1,080.00 (300 × £4 − 10%).
- `invoice-evidence` quote, memory fact `Agreed 10% off orders over 200 leads`, clauses incl. P1, P3, P4.
- `invoice-links` hosted URL points at the Stripe (mock) hosted page; PDF and CSV links.
- `invoice-stripe-total` (pending sub-check `northwind-stripe-total`) Stripe's own invoice total equals the UI.

## How to get to it (user POV)

- After approving, the right column's "Invoices" panel shows the row; click it to select.

## Driving it with e2e harness

Preconditions: an approved Northwind invoice (see approvals.md).

- **Inspect.** `bun e2e/drive.ts snap invoice`. The `.aria.txt` shows the row button, `£1,080.00`, `Evidence for this invoice`, the quote and the clause list.
- **Side effects.** `bun e2e/drive.ts log` shows `POST /v1/invoiceitems` whose `amount` sums to 108000; `curl -s 127.0.0.1:4010/__state` shows the Stripe invoice.
- **Scripted proof.** `bun run e2e northwind-main-story` (steps 04-invoice-with-evidence).

## Gotchas

- `billing.ts` does not pass `pending_invoice_items_behavior: 'include'`; real Stripe (and the mock) then leaves the items pending and the invoice total is £0. The UI total comes from the ledger, so the screen looks right. Keep `northwind-stripe-total` pending until fixed.
- The heuristic intent (no Fireworks key) only bills Northwind via the simulator author `Client — Northwind`.
