# Tally

Tally listens to a lead-gen agency's client channel, hears a client commit to an order, buys the leads, and bills them as a Stripe test-mode invoice that cites the quote, the memory, and the policy clause behind every line.

Built for the Stripe x Briefcase AI FinTech Hackathon, London, 15 Oct 2026. Track 02, Agents that collect.

## Name

Tally is the working title. The product name is Tally in the code, the UI, and these docs.

## Work agreed in chat never gets invoiced

A client writes "Let's kick off Q4. 300 fintech CFO leads in London, same deal as last time." in a chat thread. Someone has to remember the deal, price it, check the discount, buy the leads, raise the invoice, and chase it. When nobody does, the agency does the work and never bills it. Tally does those steps from the message itself, and no human types the invoice.

## How the loop runs

`server/src/features/agent/agent.ts` polls the ledger every 2 seconds and works the oldest unprocessed message through these steps. Each step writes an event to the SQLite ledger. The steps that apply policy (`extract`, `discount`, `price`, `decide`, `source`, `margin`, `approval`, `bill`, `render`, `deliver`, `explain`) record the clause ids they applied. The `recall`, `size`, and `remember` steps record their data and no clause.

```
client message (in-app simulator or Slack Socket Mode)
  |
  1 extract  Fireworks LLM fills a typed intent; the quote must be a verbatim substring (P1)
  2 recall   Cognee facts for this client, else server/seed/memory.json
  3 price    code: price list x quantity - validated discount (P2, P3)
  4 decide   code: auto | needs_approval | refuse, with clause ids (P4, P5)
  5 approve  approval card in the dashboard when P4 or P8 requires it
  6 buy      LLM proposes Treg calls; code accepts each one (P9, P10); one meter event per qualified lead
  7 bill     Stripe customer, draft invoice, invoice items attached with the 20% UK VAT tax rate, finalize (idempotency key = message id, P6)
  8 render   PDF invoice plus an evidence appendix page
  9 deliver  reply in the thread with the hosted invoice, PDF, and lead CSV; on paid, post the leads and the journal
 10 explain  "why" in the same thread: quote, memory fact, clauses, Stripe invoice id
  |
  every step -> ledger (bun:sqlite event log) -> audit timeline in the web app
```

Policy limits apply to the net amount. The demo order is 300 leads at £4 less 10%, which is £1,080.00 net. Stripe adds £216.00 VAT, so the invoice total is £1,296.00 gross. P4 compares the £1,080.00 net with its £1,000 limit.

Two more timers run in the same process. One polls open Stripe invoices every 10 seconds and delivers the lead list once Stripe reports `paid`. The other runs the collections tick every 60 seconds and sends past-due reminders under P7. A client dispute in an invoice's thread goes to `credit-notes/credit-notes.ts`, which issues a Stripe credit note under P11.

The LLM extracts and explains. Code decides and executes. Prices, limits, approvals, sourcing spend, and Stripe calls never come straight from model output.

## Autonomy with control

`server/policy/billing-policy.md` holds the billing policy. `server/policy/buyer-policy.md` holds the policy of the Northwind procurement agent, a second actor that runs in the same process and buys from Tally. Code enforces each clause and the audit log cites it by id.

| Clause | Rule | Enforced in |
| --- | --- | --- |
| `P1` | Bill only from a message with an explicit commitment and a verbatim quote. | `agent/agent.ts` |
| `P2` | Prices come from the client's price list only (Northwind £4, Acme £5, Globex £4 per lead). Bill only leads bought. | `clients/clients.ts`, `pricing/order.ts` |
| `P3` | Discounts only if remembered with a date, never above 15%. | `pricing/discount.ts`, `policy/decide.ts` |
| `P4` | Auto-send up to £1,000 net. Above that, the account owner approves. | `policy/decide.ts` |
| `P5` | Known clients only. An unknown sender is refused. | `policy/decide.ts`, `billing/billing.ts` |
| `P6` | One invoice per commitment message. | `billing/billing.ts` |
| `P7` | Reminders at most once per 24 hours, never after a remembered dispute. | `collections/collections.ts` |
| `P8` | Margin of at least 40% over sourcing cost, otherwise approval. | `pricing/pricing.ts` |
| `P9` | Every Treg call carries `X-Treg-Route-Max-Cost`, and each order has a sourcing cap of 60% of the invoice net. | `leads/providers/treg/` |
| `P10` | Treg calls only to an allowlist of catalogue endpoints. | `leads/providers/treg/treg-catalog.ts` |
| `P11` | A dispute earns a credit note for the invalid leads, capped at the number delivered, at the net price per lead. Auto-issue up to £200, above that the account owner approves. | `credit-notes/credit-notes.ts` |
| `B1` | Buyer: gross spend this calendar month stays at or below £1,500. Over-budget offers and invoices are rejected. | `buyer/policy.ts`, `buyer/buyer.ts` |
| `B2` | Buyer: the net price per lead on every invoice line is at most £5.00. | `buyer/policy.ts` |
| `B3` | Buyer: every order carries a PO number, and an invoice is paid only when its `po_number` metadata matches. | `buyer/policy.ts`, `buyer/buyer.ts` |
| `F1` | `/pause` in any channel stops sourcing and billing. Only the account owner can `/resume`. | `control/control.ts` |
| `F2` | Tally is meant to run on a restricted test key (`rk_test_`). The scope list in `control/control.ts` is the documented least-privilege set: Customers, Invoices, Invoice items, Credit notes, and Meter events. | `control/control.ts`, `billing/billing.ts` |

`billing.ts` refuses any key that does not start with `sk_test_` or `rk_test_`. Stripe enforces the F2 scopes only when you create the key as a restricted key with those scopes. A full `sk_test_` key is accepted and bills, and the **Guardrails** panel then shows the warning label "Full secret key (sk_test_) — switch to restricted". With an `rk_test_` key the panel shows "Restricted key (rk_test_)" and the scope list.

## Explains every pound

- Each invoice line stores the client quote, the memory fact, and the policy clauses it used.
- Page 2 of the PDF is an evidence appendix with that quote, fact, and clause list per line.
- The **Invoices** panel shows the evidence for the selected invoice, with the links **Open Stripe invoice**, **View PDF**, and **Download lead list**.
- The **Audit trail** panel lists the ledger events. The `source` event holds every Treg call, its cost, and the cap it ran under. Provider names stay in this internal log and never reach the client.
- The **Books** panel shows double-entry journals per invoice (debtors, sales, 20% VAT, sourcing cost, margin) and exports them as CSV.
- A message containing "why" in the invoice's thread gets a reply with the quote, the memory fact, the clauses, and the Stripe invoice id.

## How Tally maps to the judging criteria

| Points | Criterion | What Tally does |
| --- | --- | --- |
| 35 | Works end to end | Creates and finalizes a real Stripe test invoice from a chat message, then delivers the leads when Stripe reports `paid`. |
| 25 | Autonomy with control | Code enforces `P1` to `P11`, `F1`, and `F2` on the seller side and `B1` to `B3` on the buyer side. Approval cards, a kill switch, a restricted key, and sourcing spend caps. |
| 20 | Explains every pound | Quote, memory fact, and clause per line, a PDF evidence appendix, an audit timeline, journals, and "why" answers in the thread. |
| 20 | Product and creativity | Catches revenue leakage at the moment the client commits, buys the work at a cost, bills it at a margin, and negotiates with the client's own buying agent. |

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

5. Open `http://localhost:5173` and send a message from the simulator, or click **Start buyer agent** to let the procurement agent order.

Each missing key has a fallback, so the loop runs with only a Stripe key:

- Without `FIREWORKS_API_KEY`, extraction, discount parsing, and the Treg proposal use local rules.
- Without `COGNEE_API_KEY`, recall reads `server/seed/memory.json`.
- Without `TREG_TOKEN`, sourcing uses Firecrawl if `FIRECRAWL_API_KEY` is set, else the 400 synthetic leads in `server/seed/leads.csv`.
- Without the Slack tokens, the in-app simulator is the only channel.

### Run the mock harness

`bun run e2e` drives the real web UI and server in headless Chromium against local replicas of Stripe, Treg, and Cognee. It starts the mocks on port 4010, the Vite dev server on port 5179, and a fresh server per scenario on port 8797, so a `bun run dev` on 8787 can keep running. No real provider is reached. `e2e/README.md` lists the scenarios, the mock behaviour, and what the harness does not prove. Agents use the `verify-tally` skill in `.claude/skills/verify-tally/` to run one scenario or drive the stack by hand and capture screenshot and mock-log proof.

### Run the tests and the verify scripts

Run the unit tests from `server/`.

```sh
cd server && TALLY_DB_PATH=:memory: bun test
```

The 72 tests in 11 files cover books, the buyer agent, clients, collections, control, credit notes, memory, meters, pricing, and the Treg and fallback sourcers. They call no outside service. To point the Stripe SDK at a local mock, set `STRIPE_API_BASE`.

Seven scripts in `server/scripts/` call the real services once the matching key is set. Run each from `server/`.

| Script | Proves | Command |
| --- | --- | --- |
| `verify-books.ts` | A 20% exclusive GB VAT rate and a taxed invoice. | `STRIPE_SECRET_KEY=sk_test_... bun scripts/verify-books.ts` |
| `verify-buyer.ts` | A small invoice with a PO passes B1 to B3 and the buyer pays it with `pm_card_visa`. | `STRIPE_SECRET_KEY=sk_test_... bun scripts/verify-buyer.ts` |
| `verify-control.ts` | A restricted `rk_test_` key cannot refund, pay out, or charge (F2). | `STRIPE_SECRET_KEY=rk_test_... bun scripts/verify-control.ts` |
| `verify-credit-notes.ts` | A finalized invoice, then a credit note for invalid leads (P11). | `STRIPE_SECRET_KEY=sk_test_... bun scripts/verify-credit-notes.ts` |
| `verify-memory.ts` | Adds one role-tagged fact to Cognee Cloud and searches it back. | `COGNEE_API_KEY=... COGNEE_BASE_URL=... bun scripts/verify-memory.ts` |
| `verify-meters.ts` | Creates or finds the `qualified_lead` meter and sends one meter event. | `STRIPE_SECRET_KEY=sk_test_... bun scripts/verify-meters.ts` |
| `verify-treg.ts` | One real, cheap Treg call to `apollo.people.search`. | `TREG_TOKEN=... bun scripts/verify-treg.ts` |

## Stack and sponsors

- **Stripe** test mode for customers, tax rates, invoice items, invoices, credit notes, meter events, and the hosted invoice page.
- **Cognee** Cloud for client memory, with one dataset per client and role-tagged facts.
- **Fireworks** models through the AI SDK for extraction, discount parsing, and Treg proposals.
- **Treg** (`treg.to`) as the lead supplier, with a cost on every call.
- **Forme** (`@formepdf/react` for the document tree and `@formepdf/core` for `renderDocument`) renders the invoice PDF and its evidence appendix in `server/src/features/invoice-pdf/render.tsx`. The pdfcn invoice block from `PLAN.md` is not used.
- Hono on Bun with `bun:sqlite` for the server. Vite, React 19, and StyleX for the web app. Slack Bolt for Socket Mode.

## Team

Louis and Bulut, with Claude agents building the layers in parallel.
