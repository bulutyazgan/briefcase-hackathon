# Client channel simulator

The left panel ("Client channel") shows the simulator thread. A user picks a sender, types a message and sends it; Tally replies in the feed within a few seconds, either moving the work forward or refusing.

## Sub-features

- `channel-send` sends a message as `Client — Northwind` or `Account owner`.
- `channel-reply` shows Tally's reply in the feed.
- `channel-refuse-p1` refuses a message without an explicit commitment.
- `channel-refuse-p5` refuses an unknown sender and creates nothing in Stripe.

## How to get to it (user POV)

- Open the web UI; the "Client channel" panel is on the left.
- Choose a sender in `Send as`, type in `Message`, press `Send`.
- Slack threads land in the same feed (not covered: no Slack keys in the harness).

## Driving it with e2e harness

Preconditions: baseline; empty ledger.

- **Send.** `bun e2e/drive.ts send "Can you send me a quote?"`. The feed shows the message and a `tally` reply `I could not confirm a billable client commitment in that message.`
- **Unknown sender.** `bun e2e/drive.ts post "Client — Initech Unknown" "Let's kick off. 300 fintech CFO leads in London please."`. Tally replies with a refusal; `bun e2e/drive.ts log` shows no `POST /v1/...`.
- **Scripted proof.** `bun run e2e unknown-sender-refused` asserts the refusal in the UI, no invoice/approval in the ledger, empty Invoices panel, and zero Stripe writes.

## Gotchas

- The `Send as` select only offers Northwind and the account owner; other senders must use `drive.ts post` (simulator endpoint).
- Each composer message starts its own thread; there is no reply-in-thread control in the UI.
- Today an unknown sender is refused by P1 (not a recognised client message), not by an explicit "who are you?" P5 reply. The proof is the absence of Stripe writes.
