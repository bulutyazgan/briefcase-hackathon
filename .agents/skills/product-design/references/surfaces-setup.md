# Setup surface

Load when: work touches `/app/setup` or any firm-configuration dialog.
Canonical owner: `apps/web/src/features/setup/feature-map.md`.

Setup is the configuration checklist of the firm: agent identity, mailboxes, phone/WhatsApp, integrations, inbound routing, and team. It is composed from the public edges of other features (`@/features/mail`, `@/features/agent`, `@/features/registry`, `@/features/integrations`).

## Key pieces

- `view.tsx` composes the checklist.
- `setup-status.ts` derives the status of each section (connected / pending / not provisioned) from mailbox, integration, phone, and Zero state. The visible status of a section must trace to one of those sources, never to a hand-set flag.
- `setup-topology.tsx` renders `TopologyRails`: hairline SVG routing between channel nodes and a central `StrobiAvatar` node. It is the visual expression of the same checklist, not a separate data source.
- `setup-config-dialog.tsx` is the fenced-save shell that every firm-config dialog shares:
  - It snapshots the revision and org at open.
  - It aborts the request on close.
  - It disables Save on a stale (409) write, and does not risk a silent overwrite.
  - `setup-agent-name-dialog.tsx`, `setup-firm-profile-dialog.tsx`, and `setup-execution-dialog.tsx` sit on it. A new config dialog should too. It should not roll its own save lifecycle.
- `setup-memory-sheet.tsx` — the memory of Zero: a note draft (text + who Zero may tell), the notes list, and learned workflows behind a disclosure.
- `setup-team-dialog.tsx` — admins use it for these actions:
  - invite by email with a Member/Admin role
  - change roles
  - remove people (inline Keep/Remove confirm)
  - withdraw pending invites
- Nobody can demote or remove the last admin in an org. Surface that constraint before the user tries the action, not as a failed-request error.

## Interaction patterns

- Every config dialog in this feature shares one save lifecycle (see `setup-config-dialog.tsx` above). Do not introduce a second pattern for a new one.
- Section status is read-only for non-admins where the mutation is admin-gated. The section itself stays visible and legible. Only the action disables.
- New-account onboarding renders in place of the setup app surface. It has no separate route. Keep its flow and the setup checklist in the same feature.

## Coverage gaps

- No documented pattern yet for inbound-routing dialog copy when a channel has no eligible destination.
