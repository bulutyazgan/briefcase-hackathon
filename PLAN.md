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
   1 extract   LLM (Fireworks, AI SDK) → typed BillableIntent {client, ask, icp, qty?, quote}
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
| Web | Vite + React 19 + TypeScript + StyleX (no Tailwind) | Louis's call; cf0 house style |
| Server | Hono on Bun, `bun:sqlite` | Zero setup, one process, fast |
| Agent | AI SDK + Fireworks model, tool loop with zod schemas | Key already available; typed extraction |
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

`.env` in `server/` (never commit): `STRIPE_SECRET_KEY` (sk_test only), `FIREWORKS_API_KEY`, `FIRECRAWL_API_KEY`, `COGNEE_API_KEY` + `COGNEE_BASE_URL`, `SLACK_BOT_TOKEN` + `SLACK_APP_TOKEN` (Socket Mode), optional `AGENTMAIL_API_KEY`. `server/.env.example` lists them.

## 11. Open questions

- Product name and the client persona for the video.
- Slack workspace for the demo (needs a Slack app with Socket Mode).
- Is the "agent sells to another agent" angle worth a 10-second stinger at the end?
