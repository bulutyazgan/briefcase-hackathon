# The pivot, in the founder's words

Tally is not a lead-sourcing tool. It is the finance back office that lives inside your customer conversations. PostHog for finance and customer service.

Your clients already talk to you in chat. Telegram today; WhatsApp, WeChat, Slack and email are the same adapter shape. Tally reads those conversations, knows every active deal and every client fact (memory plus the CRM), and when a client says they have a problem, wants to switch from yearly to monthly, thinks they were overbilled, or needs more next month, it makes the change in the back end (Stripe) and sends the client the new invoice. Staff get a note instead of a ticket. Above the written limits a human taps approve in the same chat. One word pauses everything.

The model reads and asks. Code decides and pays. Lead sourcing is one fulfilment adapter plugged into this spine, not the story.

## The true moments (each with the file that implements it)

1. A client writes in Telegram and the agent reads it as part of the thread, not as a form: `server/src/features/channels/telegram.ts` (long polling into the ledger), `server/src/features/channels/channel.ts` (one reply path for every channel), `server/src/features/channels/slack.ts`.
2. It finds the client in the CRM and recalls their deal: `server/src/features/clients/clients.ts` (seeded and onboarded clients), `server/src/features/memory/memory.ts` and `server/seed/memory.json` (dated facts such as "Agreed 10% off orders over 200 leads", 2026-08-12).
3. It knows what the company sells and at what price: `server/seed/company.md` on `/app/company` (`server/src/features/company/company.ts`), `server/src/features/memory/company.ts`.
4. "Switch us to yearly" becomes a Stripe invoice, a PDF in the chat and a staff note, no dashboard touched: `server/src/features/concierge/concierge.ts` (`wantsPlanChange`, `converse`, `billYearly`), hooked in `server/src/features/agent/agent.ts`.
5. A plan change as a real Stripe subscription with prorations, inside the £12,000-a-year limit: `server/src/features/subscriptions/subscriptions.ts`, `catalogue.ts` (live-verified by `server/scripts/verify-subscriptions.ts`; not yet called from the loop, see SOURCES.md).
6. "Only 280 of those were valid" becomes a credit note, automatic up to £200: `server/src/features/credit-notes/credit-notes.ts`.
7. A late invoice gets a kind reminder, never twice a day and never after a dispute: `server/src/features/collections/collections.ts`.
8. A stranger asks "what do you charge?" and is answered from the company knowledge base, then onboarded when they commit, first invoice held for a human: `server/src/features/intake/intake.ts`.
9. "Why this amount?" is answered with the client's own words, the remembered fact, the clauses and the Stripe invoice id: `explainLatestInvoice` in `server/src/features/agent/agent.ts`; the PDF's evidence page in `server/src/features/invoice-pdf/`.
10. A human approves above the limits, from the chat (Telegram inline buttons) or the Inbox: `server/src/features/agent/agent.ts` (`handleApproval`), `telegram.ts` (`callback_query`).
11. `/pause` stops money moving and the log says so: `server/src/features/control/control.ts` (F1); the restricted Stripe key cannot refund or pay out (F2, `server/src/features/billing/billing.ts`, Guardrails on `/app/policy`).
12. Staff see what changed without asking: `web/src/features/notifications/view.tsx` (`staff_note`, `plan_change`, `client_identified`, `onboard`, `company_learned`).
13. The books stay right: `server/src/features/books/` (journals, VAT, margin), `/app/books`.

The policy that holds all of it: `server/policy/billing-policy.md` (P1 to P13, O1 to O4, F1 and F2) and `server/policy/buyer-policy.md` (B1 to B3). Code enforces each clause and the audit log cites it by id.

## Three things to never claim

1. **Provider names.** No vendor on screen or in the voice: not the memory vendor, not the lead gateway or its providers, not the model providers. Say "memory", "its supplier", "the model". The audit log keeps those names; the client and the film do not.
2. **localhost.** No `localhost`, no port numbers, no `/app/...` shown as a URL. The product runs in the client's chat and in Tally's own pages.
3. **Mock ids.** Nothing from the mock stack: no `sk_test_mock`, no mock hosted pay page, no invoice or subscription id that a mock minted. Only the Stripe test-mode ids from the live runs in SOURCES.md.

One more, from the code rather than the founder: do not say the Telegram plan switch "prorates" or "updates the subscription". In the loop it is a one-off yearly invoice. Proration lives in the subscriptions adapter, which is built and verified but not yet called.

## Screens kept and removed

Kept: `01-northwind-why-answer.png`, `02-invoice-evidence.png`, `03-globex-credit-note.png`, `04-landing.png`, `books.png`, `inbox-redesign.png`, `kill-switch-paused.png`, `landing-demo-dialog.png`, `paid-and-delivered.png` (fulfilment, show once at most), `policy-guardrails.png`, `real-stripe-invoice-paid.png`.

Removed as lead-sourcing-only: `buyer-agent-declines-upsell.png`, `opportunities.png`.

Missing and still needed: 1920x1080 captures of `/app/notifications`, `/app/company` and the Inbox with a plan-switch thread ("Can we switch the care plan to yearly?" as Client — Northwind). This machine has no headless browser and no e2e node modules, so they were not captured on this branch. Capture them with the mock stack (`bun e2e/stack.ts` on free `MOCK_PORT`/`E2E_API_PORT`/`E2E_WEB_PORT`) and crop every mock id out before use.

## Verified on this branch

`cd server && TALLY_DB_PATH=:memory: bun test` on this branch: 104 tests across 14 files, 350 expect calls, exit 0 (15 Oct 2026). The 22-clause count and the £5,000 / £400 / £4,320 figures in SOURCES.md were read from the code on this branch, not from older docs.
