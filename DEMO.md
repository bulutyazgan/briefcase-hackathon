# Record the two-minute demo

This script follows the two-minute target in `PLAN.md` section 12. It runs on the web app at `http://localhost:5173`. The landing page is at `/`. The dashboard is under `/app`: `/app/inbox` has the client channel, the composer, and the approval cards, `/app/invoices/:id` has the invoice, the evidence, and the PDF, and `/app/audit` has the ledger. The buyer agent, meters, credit notes, and books are merged on the server, so every beat below runs on the current code. Another agent is adding the Books page at `/app/books` and the Guardrails panel on `/app/policy`.

## Before you hit record

1. In `server/.env`, set `STRIPE_SECRET_KEY` to an `rk_test_` key. An `sk_test_` key also bills, but the Guardrails panel then shows "Full secret key (sk_test_) — switch to restricted" instead of "Restricted key (rk_test_)". Until the panel is on `/app/policy`, `curl localhost:8787/api/control` shows the same key mode.
2. Set `OPENAI_API_KEY` (or `FIREWORKS_API_KEY`), `COGNEE_API_KEY`, `COGNEE_BASE_URL`, and `TREG_TOKEN` if you have them. Without them the loop still runs on its fallbacks.
3. If you use Treg, top up the account. Treg gives $1 of free credit once.
4. Run the mock harness as the proof step. It needs ports 4010, 5179, and 8797 free. The rehearsal on 15 Oct 2026 on the merged base (`MOCK_PORT=4011 E2E_API_PORT=8798 E2E_WEB_PORT=5180 bun run e2e`, because 8797 was taken) gave this table:

	```
	✗ FAIL northwind-main-story: TimeoutError: for: Timeout 15000ms exceeded.
	✗ FAIL unknown-sender-refused: TimeoutError: for: Timeout 15000ms exceeded.
	✗ FAIL replay-safety: TimeoutError: for: Timeout 15000ms exceeded.
	✗ FAIL pause-blocks-billing: TimeoutError: for: Timeout 15000ms exceeded.
	✗ FAIL acme-auto-send: TimeoutError: for: Timeout 15000ms exceeded.
	✗ FAIL treg-sourcing: TimeoutError: for: Timeout 15000ms exceeded.
	0 passed, 6 failed, 0 pending.
	```

	Every scenario fails at the same line: `page.goto(context.web)` opens `/`, which is now the landing page, and the wait for the "Client channel" heading on `/app/inbox` times out. The harness needs `context.web + '/app/inbox'` in `e2e/scenarios/*.ts` before it proves anything on this base. On the base before the landing page landed, the same run gave 5 passed and 1 failed (`northwind-main-story` showed £400.00 instead of £1,080.00). Rerun `bun run e2e` until every scenario passes. Screenshots land in `e2e/artifacts/`.

5. Stop the server, then reset the ledger.

	```sh
	bun run seed
	```

6. Start the app.

	```sh
	bun run dev
	```

7. Check the kill switch with `curl localhost:8787/api/control`. If it shows paused, send `/resume` as **Account owner** from the composer. `bun run seed` does not clear the kill switch.
8. Send one rehearsal order, check that a Stripe invoice appears, then run `bun run seed` again and restart.
9. Set the browser zoom to 125% and close other tabs. Open a second tab on the Stripe test dashboard, Invoices page.
10. Keep this file open on a second screen.

## Script

### 0:00 The problem

Open `http://localhost:5173/` and show the landing page, then click **Open Tally** to land on the empty Inbox.

Say: "Agencies agree work with clients in chat. Then nobody raises the invoice. Tally hears the commitment and bills it, inside a written policy."

### 0:15 The client commits

In the composer on `/app/inbox`, choose **Client — Northwind** and send:

```
Let's kick off Q4. 300 fintech CFO leads in London, same deal as last time.
```

Say: "Northwind just ordered 300 leads in a chat message. Nobody on our side has touched it."

### 0:30 Recall, price, decide

Wait for Tally's reply asking for approval. Open `/app/audit` in a second tab, or scroll the Inbox reply.

With `COGNEE_API_KEY` set, say: "Tally recalled from Cognee that Northwind agreed 10% off orders over 200 leads on August 12." Without it, say: "Tally recalled from its seeded memory that Northwind agreed 10% off orders over 200 leads on August 12."

Then say: "Code priced it at 300 times £4, less 10%, which is £1,080 net. That is over the £1,000 auto-send limit, so policy clause P4 asks the account owner."

### 0:45 Approve, buy, bill

Click **Approve invoice** on the approval card.

Say: "One click. Only now does Tally spend money. It buys the leads, and code caps every supplier call and the order total under P9. Each qualified lead sends a Stripe meter event, so every pound traces to one lead. Then it creates a draft Stripe invoice, attaches the lines with 20% UK VAT, and finalizes it. £1,080 net, £216 VAT, £1,296 on the invoice."

Go to `/app/invoices` and open the invoice. Click **Open Stripe invoice** in the page header for the hosted page, then scroll the PDF frame to page 2, or click **Open PDF**. The links in the chat reply are text, so use the invoice page.

Say: "Page 2 is the evidence appendix, 'Why we billed this.' Every line carries the client's quote, the memory fact, and the policy clauses."

### 1:05 Payment

Pick one of the two paths.

Test card: on the invoice page, click **Pay as client (test card)**. That calls `POST /api/invoices/:id/simulate-payment`, which pays with Stripe's `pm_card_visa`. Say: "The client pays the Stripe invoice."

Buyer agent: the web app has no button for it yet, so start it from a terminal.

```sh
curl -s -X POST localhost:8787/api/buyer/start
```

Watch the Inbox thread in this order:

1. The procurement agent posts "PO-2026-104: Let's kick off Q4. 300 fintech CFO leads in London, same deal as last time."
2. Tally prices it and asks for approval. Click **Approve invoice**.
3. Tally finalizes the invoice, then offers an upsell: "Add 200 more leads for £800.00?"
4. The buyer declines the upsell under B1, its monthly budget.
5. The buyer pays the invoice itself with `pm_card_visa` and posts "Paid under B1–B3: ...".

Say: "Northwind's own agent checked its budget, declined an upsell, matched the PO, and paid. No human on either side."

### 1:20 Delivery and the books

Wait up to 10 seconds for "Payment received. Here is the lead list." in the thread.

Say: "Tally posted the journal: debtors, sales, 20% VAT, and the sourcing cost, so the margin is in the books." When the Books page is on `/app/books`, open it and click **Export journals CSV** while you say it. Until then, show the `margin` event on `/app/audit`.

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

Scroll `/app/audit` once.

Say: "The LLM reads and explains. Code decides and executes. Every pound has a receipt."
