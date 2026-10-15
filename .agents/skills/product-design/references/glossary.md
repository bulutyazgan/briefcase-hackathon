# Glossary

Canonical product vocabulary. One concept, one name, everywhere in the UI, the code, and the docs. A synonym in user-facing language is a finding.

Statuses mirror `rules.md`. `accepted` needs a human yes. Everything else is `proposed`.

| Term | Definition | Status | Source |
|---|---|---|---|
| Zero | The AI property manager persona that users and the interface refer to. | accepted | `apps/web/src/features/agent/` |
| Strobi | Zero's visible avatar. See the Strobi section in `DESIGN.md`. | accepted | `apps/web/src/components/ui/StrobiAvatar.tsx` |
| Tasks (`/app/tasks`) | The board where Zero's work and staff briefs land: `Needs you`, `In progress`, `Parked`, `Done`, plus a `Closed` filter over cancelled tasks. | accepted | `apps/web/src/features/tasks/feature-map.md` |
| Needs you | The task board column for work waiting on operator review or sign-off before dispatch. | accepted | tasks feature-map |
| Portfolio (`/app/portfolio`) | The firm's properties at a glance: period metrics and the embedded Zero chat dock. | accepted | `apps/web/src/features/portfolio/feature-map.md` |
| Setup (`/app/setup`) | The firm setup checklist: agent identity, mailboxes, phone/WhatsApp, integrations, inbound routing, team. | accepted | `apps/web/src/features/setup/feature-map.md` |
| Registry | The property registry surfaces — Properties, Tenants, Landlords, Contractors, Leads, Work orders — behind one shared shell. | accepted | `apps/web/src/features/registry/feature-map.md` |
| PMS | Property Management System, connected through a `PmsVendor` seam (`apps/web/src/features/registry/workspace/pms-connect-panel.tsx`). | proposed | registry feature-map |
| Mailbox | A connected inbox (Gmail, Microsoft 365, Zoho) that Zero reads and acts through. The states are `pending`, `active`, `reauth_required`, `revoked`. | accepted | `apps/web/src/features/mail/workspace/api.ts` |
| Work order | A maintenance request tracked in the registry. | proposed | registry feature-map |
| Lead | A prospective tenant or applicant tracked in the registry. | proposed | registry feature-map |

## Rules

- **rule/canonical-terms** — `proposed`. UI copy uses these terms exactly. Use no synonyms ("listing" for property, "ticket" for task, "chat" for the portfolio dock) without a decision recorded here.
- New term → add a row with source.
- A rename of a persisted/durable identifier is a backend decision too. Never rename for cleanliness alone.

## User roles

Clerk organizations drive authorization. `roleCan` (`apps/web/src/lib/auth/roles.ts`) maps role strings to capabilities:

| Role | Clerk role values | Capability |
|---|---|---|
| Admin | `org:admin` / `admin` | `staff` + `admin` — team, execution permissions, mailbox provisioning, billing |
| Member | `org:member` / `member` | `staff` — day-to-day operations: tasks, portfolio, registry |

## Coverage gaps

- Registry object vocabulary (Property, Tenant, Landlord, Contractor, Lead, Work order) is `proposed` until a human pass checks that no surface uses a synonym.
- No canonical term yet for the portfolio's embedded Zero conversation ("chat dock" is the file name, not a decided user-facing word).
