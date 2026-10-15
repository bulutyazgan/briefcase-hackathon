# Surfaces

Load when work affects a user-facing view or when routing copy and interaction
decisions.

Read `PLAN.md` for the product flow. Check the owning feature before adding
surface-specific rules.

## Surface index

| Surface | Feature | Reference |
| --- | --- | --- |
| Landing page | `landing` | `surfaces-website.md` |
| Message inbox | `inbox` | `surfaces-tasks.md` |
| Invoice and evidence | `invoices` | `surfaces-portfolio.md` |
| Approvals | `inbox` | `surfaces-setup.md` |
| Audit timeline | `audit` | General standards apply |

A surface reference is useful only when it records decisions beyond
`interface-quality.md`, `product-judgment.md`, and `resilience.md`.

## Surface reference format

```markdown
# Surface

Load when:
Source:

## Rules
- Scope:
- Rule:
- Evidence:

## Coverage gaps
- Missing decision or evidence
```

## Routing

Record a decision in the narrowest reference that covers it. Add a
cross-surface pattern only after checking it in more than one context.
