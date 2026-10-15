# Billing policy

- `P1` Bill only from a client message that contains an explicit commitment ("let's do", "go ahead", "order", a quantity).
- `P2` Prices come from the rate card only. Lead list £4/lead, setup £0.
- `P3` Discounts only if remembered as agreed (Cognee fact with date) and never above 15%.
- `P4` Auto-send invoices up to £1,000. Above that, one approval from the account owner.
- `P5` Known clients only (Stripe customer exists or is in the client list). Unknown → ask, do not bill.
- `P6` One invoice per commitment message (idempotency).
- `P7` Reminders at most once per 24 h, and never after a remembered dispute.
