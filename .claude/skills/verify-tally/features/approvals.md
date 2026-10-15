# Approvals

Invoices above the £1,000 auto-send limit (P4) wait for the account owner. An "Approval needed" card appears in the client channel with the amount and reason; approving creates exactly one Stripe invoice, rejecting creates none.

## Sub-features

- `approval-card` shows amount and reason for over-limit work.
- `approval-approve` creates and finalizes one Stripe invoice.
- `approval-reject` closes the card with no Stripe writes.
- `approval-replay` replays the same message and still yields one Stripe invoice (P6).
- `approval-auto` (pending: `acme-auto-send`) sends small invoices with no card.

## How to get to it (user POV)

- Send a Northwind commitment for 300 leads; the card appears under Tally's "Approval required for £1080.00" reply.
- Click `Approve invoice` or `Reject` on the card.

## Driving it with e2e harness

Preconditions: baseline; no pending approval.

- **Raise.** `bun e2e/drive.ts send "Let's kick off Q4. 300 fintech CFO leads in London, same deal as last time."`. Region `Invoice approval` shows `£1080.00 exceeds the £1,000 auto-send limit.`; mock log has no `POST /v1/invoices`.
- **Approve.** `bun e2e/drive.ts approve`. Feed shows `Approved. Tally is creating the invoice.` then `Invoice created for £1080.00.`; mock log has one `POST /v1/invoices` and one `/finalize`, each with an `idempotency-key`.
- **Reject.** On a fresh card, `bun e2e/drive.ts reject`. Feed shows `Invoice rejected. No Stripe charge was created.`; no new Stripe writes.
- **Scripted proof.** `bun run e2e replay-safety`: approve, second approval POST returns 409, message replayed by clearing `processed_at`, re-opened card approved again, ledger + UI + Stripe mock still hold one invoice.

## Gotchas

- Replay re-opens the approval card and re-posts "Approval required" in the thread; the Stripe side stays single only because `createInvoice` short-circuits on the ledger row and Idempotency-Keys.
- `acme-auto-send` is pending: Acme is not a known client in the current heuristic intent.
