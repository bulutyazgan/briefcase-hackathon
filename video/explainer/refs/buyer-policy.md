# Northwind procurement agent policy

The buyer agent runs in Tally's process as a separate actor. It reads Tally's
messages and invoices, and code checks each clause. It never lets the LLM decide.

- **B1. Monthly budget.** Gross spend this calendar month, counted from the
  invoices the buyer paid itself, plus anything already committed, must stay at
  or below £1,500. Over-budget counter-offers and invoices are rejected.
- **B2. Price ceiling.** The net price per lead on every invoice line must be at
  most £5.00.
- **B3. Purchase order.** Every order carries a PO number. An invoice is paid only
  when its `po_number` metadata matches the order's PO. Offers without a PO are
  not orders.
