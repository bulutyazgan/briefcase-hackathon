# Record the two-minute demo

This script follows the two-minute target in `PLAN.md` section 12. It runs on the in-app simulator at `http://localhost:5173`. The buyer agent, meters, credit notes, and books are merged, so every beat below runs on the current code.

## Before you hit record

1. In `server/.env`, set `STRIPE_SECRET_KEY` to an `rk_test_` key. An `sk_test_` key also bills, but the **Guardrails** panel then shows "Full secret key (sk_test_) — switch to restricted" instead of "Restricted key (rk_test_)".
2. Set `FIREWORKS_API_KEY`, `COGNEE_API_KEY`, `COGNEE_BASE_URL`, and `TREG_TOKEN` if you have them. Without them the loop still runs on its fallbacks.
3. If you use Treg, top up the account. Treg gives $1 of free credit once.
4. Run the mock harness as the proof step. It needs ports 4010, 5179, and 8797 free. The rehearsal on 15 Oct 2026 (`MOCK_PORT=4011 E2E_API_PORT=8798 E2E_WEB_PORT=5180 bun run e2e`, because 8797 was taken) gave this table, and the main story needs a fix before you record:

	```
	✗ FAIL northwind-main-story: Error: Northwind 300 leads must invoice £1,080.00; UI shows in_mock_0003
	£400.00 · open
	✓ PASS unknown-sender-refused (2.4s)
	✓ PASS replay-safety (9.6s) — replay re-opened approval: true
	✓ PASS pause-blocks-billing (6.8s)
	✓ PASS acme-auto-send (2.9s)
	✓ PASS treg-sourcing (3.9s) — Treg calls: 1, charged 0 micro-USD

	5 passed, 1 failed, 0 pending.
	```

	Rerun `bun run e2e` until `northwind-main-story` passes. Screenshots land in `e2e/artifacts/`.

5. Stop the server, then reset the ledger.

	```sh
	bun run seed
	```

6. Start the app.

	```sh
	bun run dev
	```

7. Check the **Guardrails** panel. If it shows paused, send `/resume` as **Account owner**. `bun run seed` does not clear the kill switch.
8. Send one rehearsal order, check that a Stripe invoice appears, then run `bun run seed` again and restart.
9. Set the browser zoom to 125% and close other tabs. Open a second tab on the Stripe test dashboard, Invoices page.
10. Keep this file open on a second screen.

## Script

### 0:00 The problem

Show the empty **Client channel** panel.

Say: "Agencies agree work with clients in chat. Then nobody raises the invoice. Tally hears the commitment and bills it, inside a written policy."

### 0:15 The client commits

In the composer, choose **Client — Northwind** and send:

```
Let's kick off Q4. 300 fintech CFO leads in London, same deal as last time.
```

Say: "Northwind just ordered 300 leads in a chat message. Nobody on our side has touched it."

### 0:30 Recall, price, decide

Wait for Tally's reply asking for approval. Scroll to the **Audit trail** panel.

With `COGNEE_API_KEY` set, say: "Tally recalled from Cognee that Northwind agreed 10% off orders over 200 leads on August 12." Without it, say: "Tally recalled from its seeded memory that Northwind agreed 10% off orders over 200 leads on August 12."

Then say: "Code priced it at 300 times £4, less 10%, which is £1,080 net. That is over the £1,000 auto-send limit, so policy clause P4 asks the account owner."

### 0:45 Approve, buy, bill

Click **Approve invoice** on the approval card.

Say: "One click. Only now does Tally spend money. It buys the leads, and code caps every supplier call and the order total under P9. Each qualified lead sends a Stripe meter event, so every pound traces to one lead. Then it creates a draft Stripe invoice, attaches the lines with 20% UK VAT, and finalizes it. £1,080 net, £216 VAT, £1,296 on the invoice."

In the **Invoices** panel, select the invoice and click **Open Stripe invoice**, then **View PDF** and scroll to page 2. The links in the chat reply are text, so use the panel.

Say: "Page 2 is the evidence appendix. Every line carries the client's quote, the memory fact, and the policy clauses."

### 1:05 The client's own agent buys and pays

Click **Start buyer agent** in the **Client channel** header. Watch the thread in this order:

1. The procurement agent posts "PO-2026-104: Let's kick off Q4. 300 fintech CFO leads in London, same deal as last time."
2. Tally prices it and asks for approval. Click **Approve invoice**.
3. Tally finalizes the invoice, then offers an upsell: "Add 200 more leads for £800.00?"
4. The buyer declines the upsell under B1, its monthly budget.
5. The buyer pays the invoice itself with `pm_card_visa` and posts "Paid under B1–B3: ...".

Say: "Northwind's own agent checked its budget, declined an upsell, matched the PO, and paid. No human on either side."

### 1:20 Delivery and the books

Wait up to 10 seconds for "Payment received. Here is the lead list." in the thread.

Open the **Books** panel and click **Export journals CSV**. Say: "Tally posted the journal: debtors, sales, 20% VAT, and the sourcing cost, so the margin is in the books."

### 1:35 Dispute

The composer continues the author's latest thread, so a dispute typed as **Client — Northwind** lands on the first order. Send:

```
Only 280 of those leads were valid.
```

Say: "Northwind disputes 20 leads. Tally checks the delivered rows and issues a Stripe credit note at the net price per lead. Up to £200 is automatic under P11. Above that, the account owner approves."

With 280 valid of 300, the credit is 20 times £3.60, which is £72, so it is automatic. "Only 240 of those leads were valid." credits £216 and shows an approval card instead. The composer offers only **Client — Northwind** and **Account owner**, so a Globex dispute needs a Globex order posted through `POST /api/channels/simulator/messages` first.

Kill-switch variant, if time allows: choose **Account owner** and send `/pause`. Then choose **Client — Northwind** and send `Go ahead with 50 more leads.` Say: "The kill switch stops all sourcing and billing, and the audit log records the blocked step under F1." Send `/resume` as **Account owner** after the take.

### 1:50 Why did you bill this?

Choose **Client — Northwind** and send:

```
Why £1,080?
```

The composer continues Northwind's latest thread, so the question reaches the order and Tally answers in it.

Say: "Ask why, and Tally answers with the client's own words, the remembered deal, the policy clauses, and the Stripe invoice id."

### 2:00 Close

Scroll the **Audit trail** panel once.

Say: "The LLM reads and explains. Code decides and executes. Every pound has a receipt."
