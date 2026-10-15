# Record the two-minute demo: "Said, done, billed"

Six beats on the web app at `http://localhost:5173`. The composer on `/app/inbox` has a **Send as** select (Client — Northwind, Acme, Globex, Initech, Account owner, Unknown sender) and a **Message** box. Invoices live under `/app/invoices/:id`, the ledger under `/app/audit`, journals under `/app/books`. The headless version of this script is `e2e/film-demo.ts`; it runs the same six beats against the mock stack and writes a video, a keyframe per beat and `beats.json`.

## Before you hit record

1. In `server/.env` set `STRIPE_SECRET_KEY` (an `rk_test_` key shows "Restricted key" on `/app/policy`; `sk_test_` also bills), `OPENAI_API_KEY`, `COGNEE_API_KEY`, `COGNEE_BASE_URL` and `TREG_TOKEN`. Without them the loop runs on its fallbacks.
2. If you use Treg, top up the account. Treg gives $1 of free credit once.
3. Choose live or mock:

	- **Live** (the track rule): real Stripe test mode, real Treg leads, real Cognee. The lead count depends on Apollo's inventory at the moment of the call. On 15 Oct, "in London" filled 182 leads (£728.00 net, under the 200-lead discount threshold) and "in the UK" filled 221 (£795.60 after Northwind's 10%). Tally bills exactly what it bought, so say "it bought N real leads and billed exactly those" and let the audit trail show the count. Extraction on gpt-5-mini takes 12 to 20 s; keep talking through the recall beat.
	- **Deterministic**: `E2E_SEED=demo bun e2e/stack.ts` (ports 4010, 8797, 5179; override with `MOCK_PORT`, `E2E_API_PORT`, `E2E_WEB_PORT`) and record on `http://localhost:5179/app/inbox`. 300 leads, £1,080.00 net, hosted "Pay with 4242" page served by the mock. Say that the Stripe calls are mirrored by a local mock and cut to the live Stripe dashboard for the invoices created by the live run.

4. Stop the server, then reset and seed the demo state. This resets the ledger, clears the kill switch, seeds Northwind's open need, and creates Globex's 50-lead invoice through the real billing path (a Stripe test-mode invoice for £200.00 net plus VAT, with 50 delivered rows and no remembered dispute) backdated 10 days against Globex's 7-day terms. It writes client facts and the company knowledge base to Cognee when keys exist and prints the ids it created. `bun scripts/verify-demo-seed.ts` in `server/` does the same on a scratch ledger and shows the reminder decision.

	```sh
	bun run demo:seed
	bun run dev
	```

5. Send one rehearsal order as Client — Northwind, check that a Stripe invoice appears, then run `bun run demo:seed` again and restart.
6. Browser zoom 125%, other tabs closed. Second tab on the Stripe test dashboard, Invoices page. Keep this file on a second screen.

Beats marked **needs merge** depend on slices still merging (intake P12, subscriptions P13, staff notes). Each one has a fallback line.

## Script

### 0:00 Beat 1. Hook

Open `http://localhost:5173/` and click **Open Tally** to land on `/app/inbox`.

Say: "Business happens in chat. The paperwork lags behind it. Tally hears what was agreed and does everything that used to follow: quote, order, invoice, VAT, collection, books. Inside a written policy, with a receipt for every pound."

### 0:15 Beat 2. A new client walks in (needs merge: intake P12)

Send as **Client — Initech**:

```
Hi, we're Initech. What do you charge for lead lists? We'd need around 300 fintech CFO leads in London.
```

What appears: Tally answers from the company knowledge base (£4 per lead, 100 minimum, 7-day terms, VAT on top) and asks the one clarifying question it needs. Audit: `company_learned`, `intake`.

Say: "Initech has never spoken to us. Tally answers from the company's own knowledge base and asks the one thing it still needs."

Send as **Client — Initech**:

```
Let's do 300. Fintech CFOs in London. Send invoices to ap@initech.example.
```

What appears: `onboard` (P12, standard price list), then an approval card for £1,200.00 net because a new client's first invoice always waits for the account owner. Click **Approve invoice**. Tally buys the leads from its supplier (real Treg leads on live), creates the Stripe invoice with 20% VAT and emails it. Open `/app/invoices` and the new invoice; show **Evidence trail** and the PDF appendix.

Say: "One message and Initech is a client: created in the ledger, priced from the standard list, first invoice held for one human click. Approve, and Tally buys the leads and emails a real Stripe invoice that cites Initech's own words and the clauses."

Fallback if intake is not in: send the same two messages as **Client — Northwind** with "same deal as last time" on the second; say "Northwind is a known client, so Tally recalls the agreed 10% over 200 leads and prices £1,080 net".

### 0:50 Beat 3. Tally spots revenue; the client's agent pays

What appears, without typing: the opportunity tick saw Northwind's seeded need ("the pipeline is thin", quarterly cadence, last list 2026-07-14) and posted an offer under O1 to O4. Click **Start buyer agent**. Northwind's procurement agent posts a PO, Tally prices it and asks for approval (over £1,000), click **Approve invoice**, Tally offers an upsell, the buyer declines it under B1 (budget), then pays the invoice itself and posts "Paid under B1–B3".

Say: "Nobody asked Northwind. Tally remembered a quarterly cadence and offered the next list. Northwind's own procurement agent checked its budget, declined an upsell, matched the PO and paid. No human on either side."

### 1:15 Beat 4. Plan change by conversation (needs merge: subscriptions P13 + staff notes)

Send as **Client — Northwind**:

```
Can we switch to 100 leads a month, billed yearly?
```

What appears: a Stripe subscription (product, price, `send_invoice`, prorations) at £4,320.00 net per year after the remembered 10%, a `plan_change` event under P13 and a `staff_note` on `/app/notifications`.

Say: "A plan change is a sentence, not a form. Tally creates the subscription in Stripe with proration and leaves the team a note."

Fallback if P13 is not wired: Tally answers in prose and bills a one-off yearly invoice. Say "the subscription adapter is on its branch; today it bills the year as one invoice".

### 1:30 Beat 5. Late payer, then a dispute

What appears, without typing: Globex's 50-lead invoice has been open 10 days against its remembered 7-day terms, so it is 3 days late and the first collections tick (every 60 s) posts a "Friendly reminder" in the Globex thread citing the agreed terms (P7). The seed leaves Globex with no remembered dispute, which is what lets the reminder go out, and its invoice exists in Stripe (test mode, or the mock), so the credit note below lands on a real invoice. Without a Stripe key the seed falls back to a placeholder id: the reminder still goes out, but the credit note fails at Stripe. Live Cognee keeps every fact earlier seeds wrote, so an older Globex fact that mentions a dispute makes the tick skip under P7; the `collections_skip` row on `/app/audit` names the fact. If that happens, delete the `globex-partners` dataset in Cognee Cloud and seed again, or record the beat on the mock stack.

Post as **Client — Globex** (it continues Globex's latest thread):

```
Only 40 of those leads were valid.
```

What appears: Tally checks the delivered rows and issues a Stripe credit note for 10 leads at £4.00 net, £40.00, automatic under P11 (up to £200). The dispute is remembered, so reminders stop.

Say: "Tally chases politely and once a day. The moment Globex disputes, it credits the invalid leads at the agreed net price and stops chasing. Above £200 a human approves."

### 1:45 Beat 6. Why, books, pause

Send as **Client — Northwind**:

```
Why £1,080?
```

The composer continues the author's latest thread. After beat 4 that is the plan-change thread, which holds no invoice, so the question would go unanswered there. Either ask it right after beat 3, before the plan change, or reply inside the £1,080 invoice's thread with `bun e2e/drive.ts thread-reply "Why £1,080?" --as "Client — Northwind"` (it replies in the newest invoice's thread). The film does the latter.

What appears: the answer quotes Northwind's own words, the remembered deal, the clauses and the Stripe invoice id. Then open `/app/books` and click **Export journals CSV**: debtors, sales, VAT and the sourcing cost, so the margin is in the books.

Send as **Account owner**: `/pause`. The sidebar shows **Paused** and the next sourcing or billing step is blocked under F1.

Say: "Ask why and you get the client's words, the memory, the clause and the invoice id. The books are posted. And one word stops it all. The LLM reads and explains. Code decides and executes."

Send `/resume` as **Account owner** after the take.
