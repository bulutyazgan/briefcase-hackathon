# Tally: the agent that bills what your clients already agreed to

Stripe x Briefcase AI FinTech Hackathon, London, 15 Oct 2026. **Track 02: Agents that collect.** Side quest: best use of Cognee memory.

Team: Louis, Bulut (+ agents). "Tally" is a working name for the billing agent, not the tally.so form builder. **Rename before recording** (see §11).

## 1. The bar we are judged on

| Points | Criterion | How Tally scores it |
| --- | --- | --- |
| 35 | Works end to end: money is billed in Stripe test mode on video | Real Stripe test invoice, paid with card 4242 on camera, agent reacts to `invoice.paid` |
| 25 | Autonomy with control: acts without a human, inside an explicit policy | Written `billing-policy.md`; code (not the LLM) enforces limits, approvals, discount caps, margin floor, sourcing spend caps, duplicate guard |
| 20 | Explains every pound: audit trail of why it acted | Every invoice line carries the client quote, the memory fact and the policy clause it used, and maps to the leads actually bought. "Why did you bill this?" answered in channel |
| 20 | Product and creativity: would a finance team want it? | Revenue leakage: agencies forget to bill work clients asked for in Slack. Tally catches it the moment it is said, sources the work at a cost and bills it at a margin |

Track rules we must hit: a real-world trigger (a conversation), a real Stripe test-mode bill, **no human raises the bill**. Demo video ≤ 2:00. Public GitHub repo. Submit 20:30–21:00.

## 2. The product in one sentence

An always-on agent that lives in a lead-gen agency's client channels, hears a client commit to work, buys the leads from its supplier, and turns them into a policy-checked Stripe invoice with a receipt of why — then collects and delivers.

Who does what:

- **The lead-gen agency** is our user. It runs Tally.
- **Tally** hears the order, sources the leads, invoices the client in Stripe, collects and delivers.
- **Treg** (hosted `treg.to`) is Tally's supplier: one gateway to many lead, people, company and buying-signal providers. Every call costs real money (`X-Treg-Cost-Micro`), so Tally resells at a margin and policy caps the spend.
- **Treg and the provider names are never shown to the client** — not on the invoice, the PDF or in channel replies. They live only in the internal audit log.

## 3. Demo story (lead-gen agency, Bulut's flow)

Recorded on the in-app channel simulator. Slack appears only if it works by 20:00.

1. **Trigger.** In the client channel Northwind writes: *"Let's kick off Q4. 300 fintech CFO leads in London, same deal as last time."*
2. **Recall.** Tally reacts and recalls from Cognee: *"Aug 12: agreed 10% off orders over 200 leads"* and *"pays on 7-day terms"*.
3. **Price and decide.** Northwind's price list: £4/lead → 300 × £4 = £1,200, minus 10% = £1,080. Above the £1,000 auto-send limit (P4) → approval needed.
4. **Approve.** The account owner approves the card in the dashboard. One click.
5. **Source.** Only now does Tally spend money: it proposes Treg catalogue calls for the ICP and buying signals; code accepts or rejects each (P9, P10) and buys the leads.
6. **Bill.** Stripe test invoice for exactly the leads bought, created and finalised (no human typed it). pdfcn renders our invoice PDF; page 2 is the **evidence appendix** (quote, memory fact, policy clause per line). Both land in the thread.
7. **Collect.** The client pays the hosted invoice with 4242. Tally sees `invoice.paid` and delivers the lead CSV in the thread.
8. **Explain.** "Why £1,080?" → Tally answers with the message link, the Cognee memory, the policy clauses and the Stripe invoice id.
9. **Always on.** An unpaid invoice past due → Tally sends a polite reminder that cites what the client agreed (never to a client with a remembered dispute, P7).

Seeded mock clients, so every rule fires on camera at least once:

| Client | Memory | Shows |
| --- | --- | --- |
| Northwind Capital | 10% off orders over 200 leads, 7-day terms | Main story: £1,080, needs approval (P3, P4) |
| Acme Ventures | No discount; orders 100 leads | Auto-sends a small invoice (P4) |
| Globex Partners | A remembered dispute | No reminders (P7); the credit-note story (layer D) |
| Unknown sender | — | Refused, asked who they are (P5) |

## 4. Architecture

```
channels (simulator | Slack Socket Mode | email)        web (Vite + React + StyleX)
        │  normalized ChannelMessage                       │ inbox, invoices, approvals, policy, audit
        ▼                                                  ▼
server (Hono on Bun) ── agent loop ─────────────────────────────────────────────
   1 extract   LLM (Fireworks, AI SDK) → typed BillableIntent {client, ask, icp, signals, qty?, quote}
   2 recall    memory (Cognee) → facts about this client (price list, discounts, promises, disputes, saved ICP)
   3 price     code: client price list × qty − validated discount
   4 decide    code: policy → auto | needs_approval | refuse (with clause ids)
   5 approve   dashboard approval card when P4 or P8 requires it
   6 source    LLM proposes Treg catalogue calls; code accepts each (allowlist, per-call cap, order cap) → leads bought + cost
   7 bill      Stripe: customer, invoice items for leads bought, invoice, finalize (idempotency key = message id)
   8 render    pdfcn (Forme) invoice + evidence appendix
   9 deliver   reply in the same channel; on invoice.paid deliver the goods
   every step → ledger (SQLite event log): the audit trail and the durability
```

Rules of the loop:

- **The LLM extracts and explains. Code decides and executes.** Prices, limits, approvals, Treg spend and Stripe calls never come from model output directly — the model fills a typed schema or proposes, code validates.
- **Discounts are extracted, then checked.** The LLM extracts `{percent, threshold, date}` from Cognee recall; code validates it against P3.
- **Signals.** Extraction adds `signals` from the message ("fintechs that just raised"); memory adds the client's saved ICP; the message wins on conflict.
- **Provider choice.** The LLM proposes Treg catalogue calls from the ICP and signals. Code accepts or rejects each one (P9, P10) and logs the call, its cost and the reason.
- **Decide, then buy, then bill.** Tally never spends on an order that is refused or not yet approved, and bills exactly what it bought.
- **No bill without a quote.** A `BillableIntent` with no verbatim source quote is dropped.
- **Idempotent by message.** The inbound message id is the Stripe idempotency key and the ledger key. A replay never bills twice.
- **Durable by event log.** Inbound messages land in a table first; the loop works the oldest unprocessed one and records each step. Restart → it resumes. (Flue/Eve were considered; Eve is tied to Vercel/AI Gateway and both add setup risk in a 3-hour build. Revisit after the hack.)
- **Always on.** One process: Slack Socket Mode listener + a tick (every ~10 s) that polls open Stripe invoices for status changes and due dates. No public URL needed; a webhook via `stripe listen` is optional.

## 5. Policy (the "control" in autonomy with control)

Lives in `server/policy/billing-policy.md` (human-readable, shown in the UI) and is mirrored as typed constants in code. Each rule has a clause id that the audit trail cites.

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

## 6. Stack

| Concern | Choice | Why |
| --- | --- | --- |
| Web | Vite + React 19 + TypeScript + StyleX (no Tailwind) | Louis's call; cf0 house style |
| Server | Hono on Bun, `bun:sqlite` | Zero setup, one process, fast |
| Agent | AI SDK + Fireworks model, tool loop with zod schemas | Key already available; typed extraction |
| Memory | Cognee Cloud HTTP API (`/api/v1/add`, `/cognify`, `/search`, `X-Api-Key`) — one dataset per client. Local fallback store if no key | Sponsor stack + side quest |
| Billing | Stripe test mode (`sk_test_…`): customers, invoice items, invoices, hosted invoice page | Track requirement |
| PDF | pdfcn Forme blocks (`@pdfcn/forme/invoice-minimal`) on `@formepdf/react` | Louis's call; looks great on video |
| Leads | Treg hosted gateway (`https://treg.to/call/`, `X-Treg-Token`, cost in `X-Treg-Cost-Micro`). Existing Firecrawl code and seeded `leads.csv` stay as fallbacks when Treg is unavailable | Many lead providers behind one token, with a real cost per call |
| Channels | In-app channel simulator (always works on video), Slack via Bolt Socket Mode, email (AgentMail) stretch | Agent lives in many channels |

Quality bar: types on, no `any`, small deep modules, names by function. **No hard lint gates** — speed wins tonight. Read `AGENTS.md` and `.agents/skills/` before writing code.

## 7. Repo layout

```
web/                      Vite app
  src/features/<name>/    one folder per feature: view.tsx, store.ts, api.ts, *.stylex.ts
    inbox/                channel simulator + live agent replies
    invoices/             list + detail with the evidence per line
    approvals/            approve / reject cards
    audit/                ledger timeline ("why did you bill this?"), incl. Treg calls and cost
  src/tokens/             tokens.stylex.ts (the only defineVars/defineConsts)
server/
  src/features/
    channels/             simulator, slack, email → ChannelMessage
    agent/                the loop (extract → … → deliver)
    memory/               cognee client + local fallback
    clients/              seeded client list + per-client price lists
    pricing/              price list × qty, discount extraction + validation, margin (P8)
    leads/                sourcing: providers/treg (proposal + accept/reject), firecrawl + seed fallbacks
    policy/               policy evaluation (+ ../policy/billing-policy.md)
    billing/              stripe calls + invoice status tick
    invoice-pdf/          pdfcn render
    ledger/               sqlite event log (the only db writer)
    <layer>/              one folder per ambitious layer (§12), one small hook into agent/
  policy/billing-policy.md
```

## 8. Who does what

- **Louis:** agent loop + Stripe end to end on the simulator channel first. Pushes his work before the layer agents start.
- **Bulut:** product design pass on this plan, UI polish of inbox/invoices/audit, demo script + video.
- **Claude agents:** build the base changes and the §12 layers in parallel, in dependency waves, each checking its own work (§12, "How we build it").

## 9. Timeline (today)

| Time | Milestone |
| --- | --- |
| 18:45 | Scaffold runs. Simulator message → Stripe test invoice (hard-coded intent) |
| 19:30 | Real extraction + pricing + policy + ledger. PDF with evidence appendix |
| 19:40 | Wave 1 agents start (Treg sourcing, pricing + clients, F, C) |
| 20:00 | Wave 2 agents start (B, D, E, A). Slack in or out |
| 20:05 | Hard cutoff: anything not green is dropped, not patched |
| 20:20 | Feature freeze. Seed demo data. Rehearse |
| 20:30 | Record ≤ 2:00 video, submit. Edit until 21:00 |

Cut order if late: email → Slack (simulator only) → Treg (seeded list) → reminders. Never cut: real Stripe invoice, policy decision, evidence trail.

## 10. Environment

`.env` in `server/` (never commit): `STRIPE_SECRET_KEY` (sk_test only), `TREG_TOKEN`, `FIREWORKS_API_KEY`, `FIRECRAWL_API_KEY`, `COGNEE_API_KEY` + `COGNEE_BASE_URL`, `SLACK_BOT_TOKEN` + `SLACK_APP_TOKEN` (Socket Mode), optional `AGENTMAIL_API_KEY`. `server/.env.example` lists them.

For cloud agents, `STRIPE_SECRET_KEY` and `TREG_TOKEN` go into the cloud environment's secrets (picked up by new sessions). Treg gives $1 of free credit once; top up a few dollars before the demo.

## 11. Open questions

- Product name (must not be "Tally", which reads as tally.so forms) and the client persona for the video.
- Slack workspace for the demo (needs a Slack app with Socket Mode).

## 12. Go ambitious: all layers in scope

Researched at 18:30, all in scope since 19:30. Each layer maps to a track idea the organisers listed or to a sponsor, and stands alone, so we can drop any of them at the cutoff.

| # | Layer | Why judges care | Sponsor / tool | Cost |
|---|---|---|---|---|
| A | **Agent sells to agent.** Northwind's side is its own *procurement agent* (a second Tally process with a buyer policy: budget £1,500/month, max £5/lead, needs a PO number). The two agents negotiate in the channel; the buyer agent rejects one over-budget counter-offer on camera, accepts Northwind's £1,080 invoice, and then **pays it itself** with `pm_card_visa`. No human on either side; both cite their own policy. | Listed track idea ("an agent that sells to another agent"). Also shows the Track 01 spend side, so the demo covers both themes. | Stripe test mode: `invoices.pay` with `pm_card_visa`; stretch: Shared Payment Tokens (`/v1/test_helpers/shared_payment/granted_tokens`) or Machine Payments Protocol for agent-native pay | M |
| B | **Pay per qualified lead (meters).** Each lead bought through Treg that passes qualification sends a Stripe **meter event** (`billing.meter_events.create`, `identifier` = lead id). The campaign subscription invoices the metered usage. Every pound traces to one lead row. | Listed track idea ("usage logs → meter events → invoice"). Strongest "explains every pound". | Stripe Billing meters + Treg lead rows | M |
| C | **One shared customer memory, three agents.** Sales (scopes the ask), Billing (prices and invoices), Collections (chases payment) read and write one Cognee dataset per client. Collections remembers "we'll pay Friday" and disputes, so it never chases early or chases a disputed line (P7). "Why?" answers come from Cognee with the source message. | This is the exact Cognee brief for Track 02 and the side quest criteria ("how central memory is"). | Cognee Cloud `remember` / `search` / `recall`; Cognee MCP server as an option | S–M |
| D | **Disputes → credit notes.** Globex: "Only 240 of those leads were valid" in the channel → the agent checks the delivered rows, issues a Stripe **credit note** for the invalid ones within policy (auto ≤ £200, above that needs approval), and records the dispute in memory. | Autonomy with control, both directions of money. | Stripe credit notes | S |
| E | **Books-ready (Briefcase).** Briefcase has no public API (apis.io profile: "publishes no developer/API documentation"). So each invoice, payment and credit note posts a double-entry journal (Dr Debtors / Cr Sales / Cr VAT 20%, plus Dr Cost of sales / Cr Creditors for the Treg sourcing cost) to our ledger, exported as a Briefcase/Xero-ready CSV. UK VAT on the invoice via a Stripe Tax Rate (20%, exclusive). Ján (Briefcase) is a judge: correct VAT, margin and journals speak his language. | "Would a finance team want it?" (product, 20 pts) | Stripe tax rates; CSV export | S |
| F | **Least-privilege key as a guardrail.** Tally runs on a Stripe **restricted test key** (`rk_test_`) with only Customers, Invoices, Invoice items, Credit notes, Meter events write. The UI shows the scope list: even a prompt-injected agent cannot refund, pay out or create charges. Kill switch: a `/pause` message in any channel stops all billing and sourcing until the account owner resumes. | Autonomy with control (25 pts), and it costs almost nothing. | Stripe restricted keys | XS |
| G | **Agent tooling (setup, not a layer).** `npx skills add https://docs.stripe.com` (Stripe's agent skills) and the hosted Stripe MCP (`https://mcp.stripe.com`) for *our* coding agents while we build. Tally itself keeps calling the Stripe SDK from code (rule: code executes). | Speed for us | Stripe AI repo `stripe/ai` | XS |

### How we build it

- **Dependency waves, in parallel.**
  - Base + wave 1 (no dependencies): Treg sourcing (P9, P10, signals) · pricing (client list, price lists, discount extraction, P8) · F restricted key + `/pause` · C shared memory.
  - Wave 2 (needs wave 1): B meters per bought lead · D credit notes · E journals with Treg cost of sale + 20% VAT · A buyer agent.
- **One module per layer** in `server/src/features/<layer>/`, with one small hook into `agent.ts` (the file every layer touches).
- **Two-stage verification.**
  - *Built:* `bun run typecheck` + `bun test` on the logic that calls no outside service (pricing, clauses, journals, credit-note limits, buyer policy), plus a recording fake of our billing module so the whole loop runs in tests.
  - *Verified:* a `verify-<layer>.ts` script creates the real Stripe test object (invoice, meter event, credit note, restricted-key call) and prints its id. Runs once `STRIPE_SECRET_KEY` and `TREG_TOKEN` are in the environment. Only verified layers go in the video.
- **Merging.** Agents branch from `main` after Louis pushes. Layers merge into an `ambitious` branch in dependency order, with typecheck + tests after each merge. Louis merges `ambitious` into `main` once the core demo bills. Anything not green by 20:05 is dropped, not patched.

**Two-minute video (target):** 0:00 the problem (work agreed in chat, never invoiced) → 0:15 client message in the channel → 0:30 Tally recalls the 10% deal from Cognee, prices £1,080, needs approval (P4) → 0:45 approve → leads bought within spend caps (P9) → real Stripe invoice + PDF in channel → 1:05 buyer agent rejects a counter-offer, accepts and pays (A) → 1:20 leads delivered, journal with margin posted (E) → 1:35 Globex disputes 60 leads → credit note (D) → 1:50 "Why did you bill £1,080?" → cited answer. Close on the audit timeline.

**For the future host (Louis):** the reusable parts are the channel adapter interface, the policy-as-code + clause ids, the ledger event log, and the "LLM extracts, code decides" split. A starter repo with those four, plus seeded Stripe test data, would let teams spend the evening on the idea, not the plumbing.
