# Tally: the agent that bills what your clients already agreed to

Stripe x Briefcase AI FinTech Hackathon, London, 15 Oct 2026. **Track 02: Agents that collect.** Side quest: best use of Cognee memory.

Team: Louis, Bulut (+ agents). Working name "Tally" — rename freely.

## 1. The bar we are judged on

| Points | Criterion | How Tally scores it |
| --- | --- | --- |
| 35 | Works end to end: money is billed in Stripe test mode on video | Real Stripe test invoice, paid with card 4242 on camera, agent reacts to `invoice.paid` |
| 25 | Autonomy with control: acts without a human, inside an explicit policy | Written `billing-policy.md`; code (not the LLM) enforces limits, approvals, discount caps, duplicate guard |
| 20 | Explains every pound: audit trail of why it acted | Every invoice line carries the client quote, the memory fact and the policy clause it used. "Why did you bill this?" answered in channel |
| 20 | Product and creativity: would a finance team want it? | Revenue leakage: agencies forget to bill work clients asked for in Slack. Tally catches it the moment it is said |

Track rules we must hit: a real-world trigger (a conversation), a real Stripe test-mode bill, **no human raises the bill**. Demo video ≤ 2:00. Public GitHub repo. Submit 20:30–21:00.

## 2. The product in one sentence

An always-on agent that lives in your client channels, hears a client commit to work, and turns it into a policy-checked Stripe invoice with a receipt of why — then collects and fulfils.

## 3. Demo story (lead-gen agency, Bulut's flow)

1. **Trigger.** In the shared Slack channel the client writes: *"Let's kick off Q4. 300 fintech CFO leads in London, same deal as last time."*
2. **Recall.** Tally reacts, and recalls from Cognee: *"Aug 12: agreed 10% off orders over 200 leads"* and *"pays on 7-day terms"*.
3. **Size.** Tally builds the lead list for the ICP (Firecrawl search), so the quantity is real, not guessed.
4. **Price.** Rate card: £4/lead → 300 × £4 = £1,200, minus 10% = £1,080.
5. **Policy.** Auto-send limit is £1,000 → this one needs approval. Tally posts an approval card to the account owner. One click.
6. **Bill.** Stripe test invoice is created and finalised (no human typed it). pdfcn renders our invoice PDF, page 2 is the **evidence appendix** (quote, memory fact, policy clause per line). Both land in the thread.
7. **Collect.** Client pays the hosted invoice with 4242. Tally sees `invoice.paid` and delivers the lead CSV in the thread.
8. **Explain.** "Why £1,080?" → Tally answers with the message link, the Cognee memory, the policy clause and the Stripe invoice id.
9. **Always on (if time).** An unpaid invoice past due → Tally sends a polite reminder that cites what the client agreed.

## 4. Architecture

```
channels (simulator | Slack Socket Mode | email)        web (Vite + React + StyleX)
        │  normalized ChannelMessage                       │ inbox, invoices, policy, audit
        ▼                                                  ▼
server (Hono on Bun) ── agent loop ─────────────────────────────────────────────
   1 extract   LLM (OpenAI, AI SDK) → typed BillableIntent {client, ask, icp, qty?, quote}
   2 recall    memory (Cognee) → facts about this client (rates, discounts, promises, disputes)
   3 size      leads (Firecrawl) → lead list + count
   4 price     code: rate card × qty − allowed discount
   5 decide    code: policy → auto | needs_approval | refuse (with clause ids)
   6 bill      Stripe: customer, invoice items, invoice, finalize (idempotency key = message id)
   7 render    pdfcn (Forme) invoice + evidence appendix
   8 deliver   reply in the same channel; on invoice.paid deliver the goods
   every step → ledger (SQLite event log): the audit trail and the durability
```

Rules of the loop:

- **The LLM extracts and explains. Code decides and executes.** Prices, limits, approvals and Stripe calls never come from model output directly — the model fills a typed schema, code validates it.
- **No bill without a quote.** A `BillableIntent` with no verbatim source quote is dropped.
- **Idempotent by message.** The inbound message id is the Stripe idempotency key and the ledger key. A replay never bills twice.
- **Durable by event log.** Inbound messages land in a table first; the loop works the oldest unprocessed one and records each step. Restart → it resumes. (Flue/Eve were considered; Eve is tied to Vercel/AI Gateway and both add setup risk in a 3-hour build. Revisit after the hack.)
- **Always on.** One process: Slack Socket Mode listener + a tick (every ~10 s) that polls open Stripe invoices for status changes and due dates. No public URL needed; a webhook via `stripe listen` is optional.

## 5. Policy (the "control" in autonomy with control)

Lives in `server/policy/billing-policy.md` (human-readable, shown in the UI) and is mirrored as typed constants in code. Each rule has a clause id that the audit trail cites.

- `P1` Bill only from a client message that contains an explicit commitment ("let's do", "go ahead", "order", a quantity).
- `P2` Prices come from the rate card only. Lead list £4/lead, setup £0.
- `P3` Discounts only if remembered as agreed (Cognee fact with date) and never above 15%.
- `P4` Auto-send invoices up to £1,000. Above that, one approval from the account owner.
- `P5` Known clients only (Stripe customer exists or is in the client list). Unknown → ask, do not bill.
- `P6` One invoice per commitment message (idempotency).
- `P7` Reminders at most once per 24 h, and never after a remembered dispute.

## 6. Stack

| Concern | Choice | Why |
| --- | --- | --- |
| Web | Vite + React 19 + TypeScript + StyleX (no Tailwind) | Finance-focused visual system |
| Server | Hono on Bun, `bun:sqlite` | No extra services, one process, fast |
| Agent | AI SDK + OpenAI model, tool loop with zod schemas | Key already available; typed extraction |
| Memory | Cognee Cloud HTTP API (`/api/v1/add`, `/cognify`, `/search`, `X-Api-Key`) — one dataset per client. Local fallback store if no key | Sponsor stack + side quest |
| Billing | Stripe test mode (`sk_test_…`): customers, invoice items, invoices, hosted invoice page | Track requirement |
| PDF | pdfcn Forme blocks (`@pdfcn/forme/invoice-minimal`) on `@formepdf/react` | Louis's call; looks great on video |
| Leads | Firecrawl search (ICP → companies/people) | Key available; real data |
| Channels | In-app channel simulator (always works on video), Slack via Bolt Socket Mode, email (AgentMail) stretch | Agent lives in many channels |

Quality bar: types on, no `any`, small deep modules, names by function. **No hard lint gates** — speed wins tonight. Read `AGENTS.md` and `.agents/skills/` before writing code.

## 7. Repo layout

```
web/                      Vite app
  src/features/<name>/    one folder per feature: view.tsx, store.ts, api.ts, *.stylex.ts
    inbox/                channel simulator + live agent replies
    invoices/             list + detail with the evidence per line
    approvals/            approve / reject cards
    audit/                ledger timeline ("why did you bill this?")
  src/tokens/             tokens.stylex.ts (the only defineVars/defineConsts)
server/
  src/features/
    channels/             simulator, slack, email → ChannelMessage
    agent/                the loop (extract → … → deliver)
    memory/               cognee client + local fallback
    leads/                firecrawl lead sourcing
    policy/               policy evaluation (+ ../policy/billing-policy.md)
    billing/              stripe calls + invoice status tick
    invoice-pdf/          pdfcn render
    ledger/               sqlite event log (the only db writer)
  policy/billing-policy.md
```

## 8. Who does what (first pass — Bulut, reshape freely)

- **Louis:** agent loop + Stripe end to end on the simulator channel first.
- **Bulut:** product design pass on this plan, UI polish of inbox/invoices/audit, demo script + video.
- **Agents (Devin/Cursor):** scaffold, pdfcn invoice, Cognee adapter, Slack adapter, seed data.

## 9. Timeline (today)

| Time | Milestone |
| --- | --- |
| 18:45 | Scaffold runs. Simulator message → Stripe test invoice (hard-coded intent) |
| 19:30 | Real extraction + pricing + policy + ledger. PDF with evidence appendix |
| 20:00 | Cognee memory + Firecrawl leads + Slack channel. Paid → deliver |
| 20:20 | Feature freeze. Seed demo data. Rehearse |
| 20:30 | Record ≤ 2:00 video, submit. Edit until 21:00 |

Cut order if late: email → Slack (simulator only) → Firecrawl (seeded list) → reminders. Never cut: real Stripe invoice, policy decision, evidence trail.

## 10. Environment

`.env` in `server/` (never commit): `STRIPE_SECRET_KEY` (sk_test only), `OPENAI_API_KEY`, `OPENAI_MODEL` (default `gpt-5-mini`), `FIRECRAWL_API_KEY`, `COGNEE_API_KEY` + `COGNEE_BASE_URL`, `SLACK_BOT_TOKEN` + `SLACK_APP_TOKEN` (Socket Mode), optional `AGENTMAIL_API_KEY`. `server/.env.example` lists them.

## 11. Open questions

- Product name and the client persona for the video.
- Slack workspace for the demo (needs a Slack app with Socket Mode).
- Is the "agent sells to another agent" angle worth a 10-second stinger at the end?

## 12. Go ambitious (layer on once the core slice bills)

Researched at 18:30. Each layer maps to a track idea the organisers listed or to a sponsor. Build them in this order. Each one stands alone, so we can stop after any of them.

| # | Layer | Why judges care | Sponsor / tool | Cost |
|---|---|---|---|---|
| A | **Agent sells to agent.** Northwind's side is its own *procurement agent* (a second Tally process with a buyer policy: budget £1,500/month, max £5/lead, needs a PO number). The two agents negotiate in the channel, the buyer agent accepts, and then it **pays the invoice itself** with a test payment method. No human on either side; both cite their own policy. | Listed track idea ("an agent that sells to another agent"). Also shows the Track 01 spend side, so the demo covers both themes. | Stripe test mode: `invoices.pay` with `pm_card_visa`; stretch: Shared Payment Tokens (`/v1/test_helpers/shared_payment/granted_tokens`) or Machine Payments Protocol for agent-native pay | M |
| B | **Pay per qualified lead (meters).** Instead of one fixed line, each lead that passes qualification sends a Stripe **meter event** (`billing.meter_events.create`, `identifier` = lead id). The campaign subscription invoices the metered usage. Every pound traces to one lead row with its source URL. | Listed track idea ("usage logs → meter events → invoice"). Strongest "explains every pound". | Stripe Billing meters + Firecrawl lead rows | M |
| C | **One shared customer memory, three agents.** Sales (scopes the ask), Billing (prices and invoices), Collections (chases payment) read and write one Cognee dataset per client. Collections remembers "we'll pay Friday" and disputes, so it never chases early or chases a disputed line (P7). "Why?" answers come from Cognee with the source message. | This is the exact Cognee brief for Track 02 and the side quest criteria ("how central memory is"). | Cognee Cloud `remember` / `search` / `recall`; Cognee MCP server as an option | S–M |
| D | **Disputes → credit notes.** "Only 240 of those leads were valid" in the channel → the agent checks the delivered rows, issues a Stripe **credit note** for the invalid ones within policy (auto ≤ £200, above that needs approval), and records the dispute in memory. | Autonomy with control, both directions of money. | Stripe credit notes | S |
| E | **Books-ready (Briefcase).** Briefcase has no public API (apis.io profile: "publishes no developer/API documentation"). So each invoice, payment and credit note posts a double-entry journal (Dr Debtors / Cr Sales / Cr VAT 20%) to our ledger, exported as a Briefcase/Xero-ready CSV. UK VAT on the invoice via a Stripe Tax Rate (20%, exclusive). Ján (Briefcase) is a judge: correct VAT + journals speak his language. | "Would a finance team want it?" (product, 20 pts) | Stripe tax rates; CSV export | S |
| F | **Least-privilege key as a guardrail.** Tally runs on a Stripe **restricted test key** (`rk_test_`) with only Customers, Invoices, Invoice items, Credit notes, Meter events write. The UI shows the scope list: even a prompt-injected agent cannot refund, pay out or create charges. Kill switch: a `/pause` message in any channel stops all billing until the account owner resumes. | Autonomy with control (25 pts), and it costs almost nothing. | Stripe restricted keys | XS |
| G | **Agent tooling.** Use `npx skills add https://docs.stripe.com` (Stripe's agent skills) and the hosted Stripe MCP (`https://mcp.stripe.com`) for *our* coding agents while we build. Tally itself keeps calling the Stripe SDK from code (rule: code executes). | Speed for us | Stripe AI repo `stripe/ai` | XS |

**Two-minute video (target):** 0:00 the problem (work agreed in chat, never invoiced) → 0:15 client message in Slack → 0:30 Tally recalls the 10% deal from Cognee, sizes 300 real leads, needs approval (P4) → 0:50 approve → real Stripe invoice + PDF in channel → 1:05 buyer agent negotiates and pays (A) → 1:20 leads delivered, journal posted (E) → 1:35 client disputes 60 leads → credit note (D) → 1:50 "Why did you bill £1,080?" → cited answer. Close on the audit timeline.

**For the future host (Louis):** the reusable parts are the channel adapter interface, the policy-as-code + clause ids, the ledger event log, and the "LLM extracts, code decides" split. A starter repo with those four, plus seeded Stripe test data, would let teams spend the evening on the idea, not the plumbing.
