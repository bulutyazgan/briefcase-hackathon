# Hosted payment and delivery

The client opens the Stripe hosted invoice link and pays. Tally's poller notices the invoice is paid, marks it paid in the Invoices panel and posts "Payment received. Here is the lead list." with the CSV in the thread.

## Sub-features

- `pay-hosted` the hosted page shows the amount and a `Pay with 4242` button.
- `pay-status` the invoice row turns `paid`.
- `pay-delivery` Tally posts the lead list in the source thread.

## How to get to it (user POV)

- Click `Open Stripe invoice` in the selected invoice, then `Pay with 4242`.
- Return to Tally; within ~10s the row and thread update.

## Driving it with e2e harness

Preconditions: an open, approved invoice.

- **Pay.** `bun e2e/drive.ts pay`. Saves `*-hosted-paid.png` (page shows `Paid. Thank you.`) and, after 12s, a UI shot with `£1,080.00 · paid` and `Payment received. Here is the lead list.`
- **Side effects.** `bun e2e/drive.ts log` shows `POST /hosted/in_mock_…/pay` and later `GET /v1/invoices/in_mock_…` polls; the audit trail has a `Paid` step (P2, P6).
- **Scripted proof.** `bun run e2e northwind-main-story` (hosted-invoice-paid.png, 05-paid-and-delivered).

## Gotchas

- The poller runs every 10s; wait at least 12s before asserting.
- The hosted page is the mock's (`http://127.0.0.1:4010/hosted/<id>`), not Stripe's real page.
- The delivered list has only the seed leads (3) because Firecrawl/Treg are not wired in the harness; the reply says so.
