# Kill switch

Anyone can send `/pause` in a channel to stop all billing and sourcing (F1). While paused, commitments are held with a reply and nothing reaches Stripe or Treg. Only the account owner's `/resume` re-enables Tally. The "Guardrails" panel shows the Stripe key mode and restricted-key scopes.

## Sub-features

- `pause` `/pause` replies `Tally is paused (F1 kill switch).` and `GET /api/control` reports `paused: true`.
- `pause-hold` a commitment while paused is not sourced or billed.
- `resume-owner` `/resume` as `Account owner` re-enables Tally.
- `resume-non-owner` `/resume` from a client is ignored.
- `guardrails-panel` shows key mode (`sk_test_` warns "switch to restricted") and scopes.

## How to get to it (user POV)

- Type `/pause` in the composer and send.
- Switch `Send as` to `Account owner` and send `/resume`.

## Driving it with e2e harness

Preconditions: baseline (not paused).

- **Pause.** `bun e2e/drive.ts send "/pause"`. Feed shows `No billing or sourcing until the account owner sends /resume.`; `curl -s 127.0.0.1:8797/api/control` has `"paused":true`.
- **Hold.** `bun e2e/drive.ts send "Let's kick off Q4. 300 fintech CFO leads in London, same deal as last time."`. Feed shows `this request was not sourced or billed`; no approval card; `drive.ts log` shows no Stripe writes and no `/call/`.
- **Non-owner resume.** `bun e2e/drive.ts send "/resume"`. Feed shows `Only the account owner can resume Tally.`
- **Owner resume.** `bun e2e/drive.ts send "/resume" --as "Account owner"`. Feed shows `Tally resumed by the account owner.`; `/api/control` has `"paused":false`.
- **Scripted proof.** `bun run e2e pause-blocks-billing`.

## Gotchas

- Pause state is stored in the ledger's `settings` table and survives a server restart on the same DB; always `/resume` (or relaunch the stack) before driving other features.
- The restricted-key (`rk_test_`) path is not in the default run; launch with `E2E_STRIPE_KEY=rk_test_mock` to see the Guardrails panel's restricted mode and the mock's 403s on refunds/charges/payouts.
