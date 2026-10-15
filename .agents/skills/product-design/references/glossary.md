# Glossary

Use product terms consistently in the interface, code, and documentation.
Treat these definitions as a guide to the current plan, not permission to
change product behavior.

| Term | Definition | Source |
| --- | --- | --- |
| Commitment | A client request that may lead to a billable order. | `PLAN.md` |
| Quote | Exact text from a message that supports an extracted commitment. | `PLAN.md` |
| Memory fact | A dated client fact used as evidence for a decision. | `PLAN.md` |
| Policy clause | A named rule used by code to decide whether an order can proceed. | `PLAN.md` |
| Approval | An account owner's decision required before billing can continue. | `PLAN.md` |
| Invoice | The bill prepared for an approved client order. | `PLAN.md` |
| Lead | A prospect in a sourced list. | `PLAN.md` |

## Rules

- Use one term for one concept.
- Check current UI and `PLAN.md` before adding or renaming a term.
- A rename of a persisted identifier also needs a data and code review.
