# Tally

Tally listens to a lead-gen agency's client channel, hears a client commit to an order, buys the leads, and bills them as a Stripe test-mode invoice that cites the quote, the memory, and the policy clause behind every line.

Built for the Stripe x Briefcase AI FinTech Hackathon, London, 15 Oct 2026. Track 02, Agents that collect.

## Work agreed in chat never gets invoiced

A client writes "Let's kick off Q4. 300 fintech CFO leads in London, same deal as last time." in a chat thread. Someone has to remember the deal, price it, check the discount, buy the leads, raise the invoice, and chase it. When nobody does, the agency does the work and never bills it. Tally does those steps from the message itself, and no human types the invoice.

## How the loop runs

`server/src/features/agent/agent.ts` polls the ledger every 2 seconds and works the oldest unprocessed message through these steps. Each step writes an event to the SQLite ledger with the policy clauses it applied.

```
client message (in-app simulator or Slack Socket Mode)
  |
  1 extract  Fireworks LLM fills a typed intent; the quote must be a verbatim substring (P1)
  2 recall   Cognee facts for this client, else server/seed/memory.json
  3 price    code: price list x quantity - validated discount (P2, P3)
  4 decide   code: auto | needs_approval | refuse, with clause ids (P4, P5)
  5 approve  approval card in the dashboard when P4 or P8 requires it
  6 buy      LLM proposes Treg calls; code accepts each one (P9, P10)
  7 bill     Stripe customer, invoice items, invoice, finalize (idempotency key = message id, P6)
  8 render   PDF invoice plus an evidence appendix page
  9 deliver  reply in the thread with the hosted invoice, PDF, and lead CSV; on paid, post the leads
 10 explain  "why" in the same thread: quote, memory fact, clauses, Stripe invoice id
  |
  every step -> ledger (bun:sqlite event log) -> audit timeline in the web app
```

Two more timers run in the same process. One polls open Stripe invoices every 10 seconds and delivers the lead list once Stripe reports `paid`. The other runs the collections tick every 60 seconds and sends past-due reminders under P7.

The LLM extracts and explains. Code decides and executes. Prices, limits, approvals, sourcing spend, and Stripe calls never come straight from model output.

## Autonomy with control

`server/policy/billing-policy.md` holds the policy. Code enforces each clause and the audit log cites it by id.

| Clause | Rule | Enforced in |
| --- | --- | --- |
| `P1` | Bill only from a message with an explicit commitment and a verbatim quote. | `agent/agent.ts` |
| `P2` | Prices come from the client's price list only (Northwind £4, Acme £5, Globex £4 per lead). Bill only leads bought. | `clients/clients.ts`, `pricing/order.ts` |
| `P3` | Discounts only if remembered with a date, never above 15%. | `pricing/discount.ts`, `policy/decide.ts` |
| `P4` | Auto-send up to £1,000. Above that, the account owner approves. | `policy/decide.ts` |
| `P5` | Known clients only. An unknown sender is refused. | `policy/decide.ts`, `billing/billing.ts` |
| `P6` | One invoice per commitment message. | `billing/billing.ts` |
| `P7` | Reminders at most once per 24 hours, never after a remembered dispute. | `collections/collections.ts` |
| `P8` | Margin of at least 40% over sourcing cost, otherwise approval. | `pricing/pricing.ts` |
| `P9` | Every Treg call carries `X-Treg-Route-Max-Cost`, and each order has a sourcing cap of 60% of the invoice net. | `leads/providers/treg/` |
| `P10` | Treg calls only to an allowlist of catalogue endpoints. | `leads/providers/treg/treg-catalog.ts` |
| `F1` | `/pause` in any channel stops sourcing and billing. Only the account owner can `/resume`. | `control/control.ts` |
| `F2` | Tally runs on a restricted test key (`rk_test_`) scoped to Customers, Invoices, Invoice items, Credit notes, and Meter events. Stripe rejects refunds, payouts, and charges. | `control/control.ts`, `billing/billing.ts` |

`billing.ts` refuses any key that does not start with `sk_test_` or `rk_test_`. The **Guardrails** panel shows whether the key is restricted and lists its scopes.

## Explains every pound

- Each invoice line stores the client quote, the memory fact, and the policy clauses it used.
- Page 2 of the PDF is an evidence appendix with that quote, fact, and clause list per line.
- The **Invoices** panel shows the evidence for the selected invoice.
- The **Audit trail** panel lists the ledger events. The `source` event holds every Treg call, its cost, and the cap it ran under. Provider names stay in this internal log and never reach the client.
- A message containing "why" in the invoice's thread gets a reply with the quote, the memory fact, the clauses, and the Stripe invoice id.

## How Tally maps to the judging criteria

| Points | Criterion | What Tally does |
| --- | --- | --- |
| 35 | Works end to end | Creates and finalizes a real Stripe test invoice from a chat message, then delivers the leads when Stripe reports `paid`. |
| 25 | Autonomy with control | Code enforces `P1` to `P10`, `F1`, and `F2`. Approval cards, a kill switch, a restricted key, and sourcing spend caps. |
| 20 | Explains every pound | Quote, memory fact, and clause per line, a PDF evidence appendix, an audit timeline, and "why" answers in the thread. |
| 20 | Product and creativity | Catches revenue leakage at the moment the client commits, buys the work at a cost, and bills it at a margin. |

## Run it locally

You need [Bun](https://bun.sh) 1.3 or later.

1. Install the dependencies.

	```sh
	bun install
	```

2. Copy the example environment file and fill in the keys you have. `server/.env.example` describes each variable.

	```sh
	cp server/.env.example server/.env
	```

	Use a Stripe test key only. `STRIPE_SECRET_KEY` must start with `sk_test_` or `rk_test_`, otherwise billing is blocked and logged.

3. Reset the ledger.

	```sh
	bun run seed
	```

4. Start the API on port 8787 and the web app on port 5173.

	```sh
	bun run dev
	```

5. Open `http://localhost:5173` and send a message from the simulator.

Each missing key has a fallback, so the loop runs with only a Stripe key:

- Without `FIREWORKS_API_KEY`, extraction, discount parsing, and the Treg proposal use local rules.
- Without `COGNEE_API_KEY`, recall reads `server/seed/memory.json`.
- Without `TREG_TOKEN`, sourcing uses Firecrawl if `FIRECRAWL_API_KEY` is set, else the 400 synthetic leads in `server/seed/leads.csv`.
- Without the Slack tokens, the in-app simulator is the only channel.

To run the tests, use `bun test`. The 41 tests cover pricing, clients, memory, collections, control, and the Treg and fallback sourcers. They call no outside service. To point the Stripe SDK at a local mock, set `STRIPE_API_BASE`. The repo ships no Stripe mock, so the tests do not create invoices.

`server/scripts/verify-treg.ts`, `verify-memory.ts`, and `verify-control.ts` call the real services once the matching keys are set.

## Stack and sponsors

- **Stripe** test mode for customers, invoice items, invoices, and the hosted invoice page.
- **Cognee** Cloud for client memory, with one dataset per client and role-tagged facts.
- **Fireworks** models through the AI SDK for extraction, discount parsing, and Treg proposals.
- **Treg** (`treg.to`) as the lead supplier, with a cost on every call.
- **pdfcn** Forme (`@formepdf/react`) for the invoice PDF and its evidence appendix.
- Hono on Bun with `bun:sqlite` for the server. Vite, React 19, and StyleX for the web app. Slack Bolt for Socket Mode.

## Team

Louis and Bulut, with Claude agents building the layers in parallel.
