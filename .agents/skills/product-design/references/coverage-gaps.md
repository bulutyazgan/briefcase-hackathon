# Coverage gaps

Explicit record of decisions this skill does NOT yet govern. Reviews that hit these record the gap here instead of improvising a rule.

| Gap | Surface | Evidence needed |
|---|---|---|
| No exemplars yet — first shipped PR with a documented decision | any | merged PR + review comment |
| Destructive-action inventory (what exists today, per surface) | tasks, setup, registry | rendered audit of every destructive CTA |
| Registry object vocabulary unconfirmed (Property, Tenant, Landlord, Contractor, Lead, Work order) | registry | human pass over `glossary.md` |
| Empty-state inventory across the registry's six list views | registry | rendered audit |
| Form validation copy patterns | setup dialogs, onboarding | shipped forms review |
| Mobile layout for the tasks board (horizontal scroll vs. stacked columns) | tasks | rendered audit at 390px |

## Closing a gap

1. Collect evidence (shipped PR, rendered audit, review thread).
2. Write the decision in the surface file or `rules.md` with status `proposed`.
3. Human accepts → status flips to `accepted`, gap row removed.
