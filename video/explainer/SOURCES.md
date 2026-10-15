# SOURCES.md: every number in the film, with where it comes from

- 221 real leads bought in one order, invoice £795.60 net + £159.12 VAT (20%) = £954.72, paid with the Stripe test card: live run on 15 Oct 2026 (DEMO.md "Before you hit record", item 4; ledger state saved by the coordinator). Earlier live run: 182 leads, £728.00 net.
- £1,080.00 = 300 leads × £4.00 − 10% (remembered deal "Agreed 10% off orders over 200 leads", dated 2026-08-12): server/seed/memory.json; pricing in server/src/features/pricing/.
- £1,000 auto-send limit (P4), 15% discount cap (P3), 40% margin floor (P8), £200 auto credit-note limit (P11), £12,000/yr auto plan-change limit (P13): server/policy/billing-policy.md.
- Buyer agent policy B1 £1,500/month, B2 £5/lead, B3 PO required: server/policy/buyer-policy.md.
- 104 server tests: `cd server && TALLY_DB_PATH=:memory: bun test` on 15 Oct 2026 (head 8564cc0+).
- Clause count: count the `P`, `O`, `F` and `B` clauses in server/policy/*.md before stating a number.
- Channels: Telegram (server/src/features/channels/telegram.ts), Slack (slack.ts), in-app simulator.
- Memory: Cognee (server/src/features/memory/providers/cognee.ts); company knowledge base (memory/company.ts, company/).
- Never name the lead providers or the lead gateway's brand or the memory vendor on screen; say "its supplier" and "memory".
