# SOURCES.md: every number in the film, with where it comes from

Read against the code on branch `video/pivot-brief` (from `origin/ambitious` 64db52b), 15 Oct 2026. A number not listed here does not go on screen.

## The plan switch (the film's proof case)

Two code paths exist. Only one runs in the agent loop. Do not merge them on screen.

- **In the loop today** (`server/src/features/agent/agent.ts` → `wantsPlanChange` → `converse`, `server/src/features/concierge/concierge.ts`): the client's care plan moves from monthly to yearly. Prices come from the company knowledge base (`server/seed/company.md`, "Website care plan: £500 per month billed monthly, or £5,000 per year billed yearly"), fixed in `concierge.ts` as `PLAN = { monthlyPence: 50000, yearlyPence: 500000 }`. Code creates a Stripe invoice for **£5,000.00**, due in 7 days, line "Website care plan, yearly (was £500.00 per month)", replies "You save £1,000.00 a year", renders a PDF whose line carries the quote, the memory fact and clauses P2, P5, P8, sends the PDF into the Telegram chat (`sendTelegramPdf`), remembers the plan (`plan:<client>` = yearly) and writes a `staff_note` ("No action needed."). A second "switch to yearly" answers "You are already on yearly billing, so nothing changes (P8)". This is a one-off invoice, not a Stripe subscription, and there is no proration on this path.
- **Built and live-verified, not wired into the loop** (`server/src/features/subscriptions/subscriptions.ts`, `catalogue.ts`): a real Stripe subscription for "100 leads a month, billed monthly or yearly" at the client's rate less the remembered discount (P3 rules in `server/src/features/pricing/discount.ts`), `proration_behavior: 'create_prorations'` on change, auto up to £12,000 net a year (P13), approval above. Northwind: monthly 100 × £4.00 = **£400.00** net (100 leads is not over the 200-lead threshold, so no discount); yearly 1,200 × £4.00 = £4,800.00 less 10% = **£4,320.00** net (discount "Agreed 10% off orders over 200 leads", dated 2026-08-12, `server/seed/memory.json`). Computed by `quotePlan` in `catalogue.ts`; the same figures are recorded in SYNC.md (21:40 entry). Live run: `server/scripts/verify-subscriptions.ts` created `sub_1UQuuYBcNwFEjQK2NSeS26o0` monthly, replayed unchanged, updated to yearly with prorations (SYNC.md). `agent.ts` does not import `handlePlanChange`; the e2e scenario `plan-change` sits in `e2e/pending.ts`. Say "with proration" only over this path and only as what the adapter does, never as what the Telegram demo did.

## Limits the policy sets (all net of VAT)

- £1,000 auto-send limit, P4: `AUTO_SEND_LIMIT_PENCE = 100000` in `server/src/features/policy/decide.ts`.
- £200 auto credit-note limit, P11: `AUTO_CREDIT_LIMIT_PENCE = 20000` in `server/src/features/credit-notes/credit-notes.ts`.
- £12,000 a year auto plan-change limit, P13: `AUTO_PLAN_LIMIT_PENCE = 1_200_000` in `server/src/features/subscriptions/subscriptions.ts`.
- 15% discount cap, P3: `MAX_DISCOUNT_PERCENT = 15` in `server/src/features/pricing/discount.ts`.
- 40% margin floor, P8; first invoice of a new client always approved by a human, P12; reminders at most once per 24 h and never after a remembered dispute, P7: `server/policy/billing-policy.md`.
- Clause count: **22** clauses across `server/policy/*.md` (P1 to P13, O1 to O4, F1 and F2 in `billing-policy.md`, B1 to B3 in `buyer-policy.md`), counted with `grep -oE '\b(P|O|F|B)[0-9]+\b' server/policy/*.md | sort -u | wc -l` on this branch. The billing policy alone is 19.

## Kill switch and key

- `/pause` in any channel stops sourcing and billing; only the account owner can `/resume`; blocked steps are logged under F1: `server/src/features/control/control.ts`, `billing-policy.md` F1.
- Stripe restricted test key (`rk_test_`) with write access to Customers, Invoices, Invoice items, Credit notes and Meter events only: F2. The Guardrails panel on `/app/policy` shows the key mode (`screens/policy-guardrails.png`).

## Channels (from the code, not the roadmap)

- Telegram: long polling, inline Approve / Reject buttons on an approval, the invoice PDF posted into the chat: `server/src/features/channels/telegram.ts`.
- Slack, Socket Mode: `server/src/features/channels/slack.ts`.
- In-app simulator (the Inbox composer): `server/src/features/channels/routes.ts`.
- One shape: every adapter inserts a `ChannelMessage` into the ledger and `channels/channel.ts` routes the reply back by channel prefix. WhatsApp, WeChat and email are not in the code. On screen they are "any chat", a claim about the adapter shape, never a shipped integration.

## Memory and CRM (what the product actually knows)

- CRM: the client list in `server/src/features/clients/clients.ts` (four seeded clients: Louis, Northwind Capital at £4 per lead, Acme Ventures at £5, Globex Partners at £4, each with a billing email and account owner) plus the ledger `clients` table for clients onboarded in conversation (P12, `server/src/features/intake/intake.ts`). The concierge step reads "Found Northwind Capital in the CRM (website care plan, monthly)". The web page at `/app/leads` is a lead directory (every sourced prospect and the invoice that funds it), not a client CRM; do not call it the CRM on screen.
- Client memory: dated facts per client (`server/seed/memory.json`, nine seeded facts, e.g. Northwind "Agreed 10% off orders over 200 leads" 2026-08-12, "Pays on 7-day terms", "Orders a fresh list of 200 leads every quarter"), recalled through `server/src/features/memory/memory.ts` and the memory provider in `memory/providers/cognee.ts`.
- Company knowledge: `server/seed/company.md` ("Brightline Studio", services, price bands, terms), shown on `/app/company` and learned into the memory dataset `company-profile` (`server/src/features/company/company.ts`); `server/seed/company.json` feeds onboarding through dataset `company` (`memory/company.ts`).
- Notifications for staff: `/app/notifications` lists the steps `staff_note`, `client_identified`, `onboard`, `plan_change`, `company_learned` with their clauses (`web/src/features/notifications/view.tsx`).

## Real money moved (Stripe test mode)

- Live run, 15 Oct 2026, real OpenAI, Cognee, Treg and Stripe test keys: Stripe invoice `in_1UQuBX…` for £728.00 net + 20% VAT, paid with the 4242 test card, 182 leads delivered (DEMO.md, "Before you hit record", item 4).
- Second live run the same day: 221 leads, £795.60 net + £159.12 VAT = £954.72, paid (ledger state saved by the coordinator; previous SOURCES.md).
- Credit note path: a dispute "Only 280 of those leads were valid" credits 20 × £3.60 = £72.00 automatically under P11; "Only 240" credits £216.00 and asks for approval (DEMO.md 1:35; `screens/03-globex-credit-note.png`).
- Lead buying is one fulfilment adapter. The film may show it once as "one of the things it fulfils" and must not make it the story.

## Explain

- "Why £1,080?" (or any message containing "why") in an invoice's thread answers with the quote, the memory fact, the clauses and the Stripe invoice id: `explainLatestInvoice` in `agent.ts`; `screens/01-northwind-why-answer.png`.

## Tests

- **104 server tests** across 14 files: `cd server && TALLY_DB_PATH=:memory: bun test` on this branch, 15 Oct 2026 ("Ran 104 tests across 14 files", 350 expect calls). Rerun before stating a different number.

## Never on screen

- Provider and vendor names (the memory vendor, the lead gateway, the lead providers, the model providers). Say "memory", "its supplier", "the model".
- `localhost`, port numbers, `/app/...` paths as URLs.
- Mock ids and mock keys (`sk_test_mock`, mock hosted pages, anything from `e2e/mock-providers/`). Only ids from the live runs above.
