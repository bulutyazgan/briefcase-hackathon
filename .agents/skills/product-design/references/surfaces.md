# Surfaces

Load when: you start work on any user-facing surface, or you route copy/interaction decisions.

Canonical owner: `apps/web/src/features/<name>/feature-map.md` for each feature. It holds the entry point, user path, files, and DOM locators. This file routes design judgment. The feature map routes engineering verification.

## Surface index

| Surface | Feature | Routes | Surface file |
|---|---|---|---|
| Website (marketing) | `website` | `/` (marketing host only) | `surfaces-website.md` |
| Tasks | `tasks` | `/app/tasks` (shell default), `/app/needs-you` (redirect) | `surfaces-tasks.md` |
| Portfolio | `portfolio` | `/app/portfolio` | `surfaces-portfolio.md` |
| Registry | `registry` | `/app/properties`, `/app/tenants`, `/app/landlords`, `/app/contractors`, `/app/leads`, `/app/work-orders` | none yet — general standards apply |
| Setup | `setup` | `/app/setup` (new-account onboarding renders here) | `surfaces-setup.md` |
| Billing | `billing` | `/app/billing` | none yet — general standards apply |
| Design kit | `design` | `/app/design` | none yet — development showcase |
| Mail | `mail` | none (panels inside Setup and the connections dialog) | none yet |
| Zero | `agent` | none (panels inside the connections dialog and Setup) | none yet |
| Integrations | `integrations` | `/integrations/callback`, the connections dialog | none yet |
| Auth | `auth` | `/login/*` | none yet |
| Support | `support` | `/support` | none yet |
| Legal | `legal` | `/privacy`, `/terms`, `/dpa` | none yet |
| Attachment confirm | `attachment-confirm` | `/confirm/attachment` | none yet |

Onboarding has no separate route. New accounts see it at `/app/setup`.

A surface file exists only when that surface collects real, surface-specific decisions beyond what `interface-quality.md`, `product-judgment.md`, and `resilience.md` already cover. Missing file + repeated review findings on that surface = create it (see `coverage-gaps.md`).

## Surface file format

```markdown
# {Surface}

Load when: {modes and tasks}
Canonical owner: {feature path, feature-map.md}

## rule/{stable-id}
Scope:
Rule:
Why:
Exceptions:
Source:

## Examples
Bad:
Good:

## Coverage gaps
- {missing decision or evidence}
```

## Routing rule

Record copy, interaction, and state decisions on the narrowest surface file that covers them. Cross-surface patterns graduate to `patterns.md` only after they hold on two surfaces.
