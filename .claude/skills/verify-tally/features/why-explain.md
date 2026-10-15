# Why-explain

A client asks "Why £1,080?" in the invoice's thread. Tally answers from the audit ledger: the amount, the verbatim quote, the memory fact, the policy clauses and the Stripe invoice id.

## Sub-features

- `why-thread` a "why" question in the invoice thread gets a cited answer.
- `why-composer` (pending sub-check `why-from-composer`) the same question typed in the UI composer.

## How to get to it (user POV)

- Reply "Why £1,080?" in the thread that holds the invoice (Slack thread, or the simulator via thread reply).

## Driving it with e2e harness

Preconditions: an invoice exists for Northwind.

- **Ask.** `bun e2e/drive.ts thread-reply "Why £1,080?"`. The feed shows `This invoice is £1080.00 because the client agreed to the work.` followed by `Quote:`, `Memory: … 10% off …`, `Policy: … P3, P4`, and `Stripe invoice: in_mock_…`.
- **Side effects.** The audit trail gains an `Explain` step.
- **Scripted proof.** `bun run e2e northwind-main-story` (06-why-answer).

## Gotchas

- The composer starts a new thread per message and the agent only explains invoices in the same thread, so "Why £1,080?" typed in the UI is treated as a new, refused commitment. Use `thread-reply` and report `why-composer` as pending.
