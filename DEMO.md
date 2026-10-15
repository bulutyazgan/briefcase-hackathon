# Record the two-minute demo

This script follows the two-minute target in `PLAN.md` section 12. It runs on the in-app simulator at `http://localhost:5173`.

Beats marked **optional** depend on layers that may not merge: the buyer agent (A), meters (B), credit notes (D), and books (E). Each optional beat has a fallback line. If a layer is missing, record the fallback instead.

## Before you hit record

1. In `server/.env`, set `STRIPE_SECRET_KEY` to an `rk_test_` key. An `sk_test_` key also bills, but the **Guardrails** panel then shows "secret" instead of "restricted".
2. Set `FIREWORKS_API_KEY`, `COGNEE_API_KEY`, `COGNEE_BASE_URL`, and `TREG_TOKEN` if you have them. Without them the loop still runs on its fallbacks.
3. If you use Treg, top up the account. Treg gives $1 of free credit once.
4. Stop the server, then reset the ledger.

	```sh
	bun run seed
	```

5. Start the app.

	```sh
	bun run dev
	```

6. Check the **Guardrails** panel. If it shows paused, send `/resume` as **Account owner**. `bun run seed` does not clear the kill switch.
7. Send one rehearsal order, check that a Stripe invoice appears, then run `bun run seed` again and restart.
8. Set the browser zoom to 125% and close other tabs. Open a second tab on the Stripe test dashboard, Invoices page.
9. Keep this file open on a second screen.

## Script

### 0:00 The problem

Show the empty **Client channel** panel.

Say: "Agencies agree work with clients in chat. Then nobody raises the invoice. Tally hears the commitment and bills it, inside a written policy."

### 0:15 The client commits

In the simulator, choose **Client — Northwind** and send:

```
Let's kick off Q4. 300 fintech CFO leads in London, same deal as last time.
```

Say: "Northwind just ordered 300 leads in a chat message. Nobody on our side has touched it."

### 0:30 Recall, price, decide

Wait for Tally's reply asking for approval. Scroll to the **Audit trail** panel.

Say: "Tally recalled from Cognee that Northwind agreed 10% off orders over 200 leads on August 12. Code priced it at 300 times £4, less 10%, which is £1,080. That is over the £1,000 auto-send limit, so policy clause P4 asks the account owner."

### 0:45 Approve, buy, bill

Click **Approve invoice** on the approval card.

Say: "One click. Only now does Tally spend money. It buys the leads, and code caps every supplier call and the order total under P9. Then it creates and finalizes a real Stripe test invoice."

When the reply appears, click the hosted invoice link, then open the **Invoice PDF** link and scroll to page 2.

Say: "Page 2 is the evidence appendix. Every line carries the client's quote, the memory fact, and the policy clauses."

### 1:05 Payment (optional, layer A)

With the buyer agent merged, Northwind's procurement agent rejects one over-budget counter-offer, accepts £1,080, and pays.

Say: "Northwind's own agent checked its budget, rejected a counter-offer, and paid. No human on either side."

Fallback: on the hosted invoice page, pay with card `4242 4242 4242 4242`, any future date, any CVC. Say: "The client pays the hosted Stripe invoice."

### 1:20 Delivery (optional, layer E)

Wait up to 10 seconds for "Payment received. Here is the lead list." in the thread.

With books merged, open the journal export. Say: "Tally posted the journal: debtors, sales, 20% VAT, and the sourcing cost, so the margin is in the books."

Fallback: show the `margin` event in the **Audit trail** panel. Say: "Payment received, the leads are delivered, and the margin check under P8 is in the audit log."

### 1:35 Dispute (optional, layer D)

With credit notes merged, choose Globex in the simulator and send:

```
Only 240 of those leads were valid.
```

Say: "Globex disputes 60 leads. Tally checks the delivered rows and issues a Stripe credit note within policy."

Fallback: choose **Account owner** and send `/pause`. Then choose **Client — Northwind** and send `Go ahead with 50 more leads.` Say: "The kill switch stops all sourcing and billing, and the audit log records the blocked step under F1." Send `/resume` as **Account owner** after the take.

Meters (layer B) have no beat of their own. With meters merged, add one line at 0:45: "Each qualified lead sends a Stripe meter event, so every pound traces to one lead."

### 1:50 Why did you bill this?

The simulator composer does not send a thread id yet, so a "why" typed into the composer starts a new thread and gets no answer. Send the question from a terminal into the order's thread instead.

```sh
THREAD=$(curl -s localhost:8787/api/state | jq -r '[.messages[] | select(.text | test("300 fintech"))][0].thread')
curl -s localhost:8787/api/channels/simulator/messages \
	-H 'content-type: application/json' \
	-d "{\"author\":\"Client — Northwind\",\"text\":\"Why did you bill £1,080?\",\"thread\":\"$THREAD\"}"
```

Say: "Ask why, and Tally answers with the client's own words, the remembered deal, the policy clauses, and the Stripe invoice id."

### 2:00 Close

Scroll the **Audit trail** panel once.

Say: "The LLM reads and explains. Code decides and executes. Every pound has a receipt."
