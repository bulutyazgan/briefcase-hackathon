# Tally

A billing agent for work agreed in chat. A client writes "Let's kick off Q4. 300 fintech CFO leads in London, same deal as last time." and Tally recalls the deal, prices it, buys the leads, raises a Stripe invoice with VAT, collects, delivers, and books it. Every line cites the client quote, the memory fact, and the policy clause behind it.

Built for the Stripe x Briefcase AI FinTech Hackathon, London, 15 Oct 2026 (Track 02, Agents that collect). The hosted site replays a recorded run; the live agent runs locally with your own test keys.

## How it works

The LLM extracts and explains. Code decides and executes. Prices, limits, approvals, sourcing spend, and Stripe calls never come straight from model output.

```
client message (in-app simulator, Slack, or Telegram)
  1 extract   LLM fills a typed intent; the quote must be a verbatim substring
  2 recall    Cognee facts for this client (seed file as fallback)
  3 price     price list x quantity - remembered discount
  4 decide    auto | needs_approval | refuse, with clause ids
  5 approve   approval card in the Inbox when the policy asks for one
  6 buy       leads from Treg, one meter event per lead, under a spend cap
  7 bill      Stripe customer, invoice items with 20% UK VAT, finalize
  8 render    PDF invoice plus a "Why we billed this" evidence page
  9 deliver   hosted invoice, PDF, and lead CSV in the thread; leads on paid
 10 explain   "why" in the thread answers with quote, fact, clauses, invoice id
  every step -> SQLite event ledger -> Audit page
```

`server/policy/billing-policy.md` is the policy. Each clause (P1 to P11, O1 to O4, F1, F2) is enforced in code and cited by id in the audit log. A second agent in `server/src/features/buyer/` plays the client's procurement side under its own policy (B1 to B3) and pays invoices whose PO matches.

## Run it locally

Needs [Bun](https://bun.sh) 1.3+.

```sh
bun install
cp server/.env.example server/.env   # add a Stripe test key; everything else is optional
bun run seed                         # reset the ledger
bun run dev                          # API on :8787, web on :5173
```

Open `http://localhost:5173/app/inbox` and send a message from the composer. `STRIPE_SECRET_KEY` must be `rk_test_` or `sk_test_`; live keys are refused. Each other key has a fallback (local extraction rules, seed memory, synthetic leads), so the loop runs with only Stripe.

- `cd server && TALLY_DB_PATH=:memory: bun test` runs the unit tests.
- `server/scripts/verify-*.ts` hit the real providers once the matching key is set.

## Stack

Stripe test mode (invoices, tax rates, credit notes, meter events), OpenAI and Fireworks via the AI SDK, Cognee Cloud for memory, Treg for lead sourcing, Forme for the PDF, Hono on Bun with `bun:sqlite`, Vite + React 19 + StyleX, deployed as a Cloudflare Worker.

## Team

Louis and Bulut, with Claude agents building the layers in parallel.
