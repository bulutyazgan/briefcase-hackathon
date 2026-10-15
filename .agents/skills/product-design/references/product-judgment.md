# Product judgment

Load for:

- Shape mode
- Implement/Harden on material changes
- full reviews
- any decision that changes the task of the user, a default, scope, consequence, navigation, interaction surface, or reachable states

## The internal brief

Before you propose UI, write a compact brief. Answer each line in one sentence:

| Field | Question |
|---|---|
| User | Who is acting? (letting agent, landlord, tenant, contractor, applicant, admin) |
| Job | What are they trying to accomplish? |
| Current behavior | What happens today, exactly? |
| Desired outcome | What should happen instead? |
| Success signal | How do we know it worked? Is it observable in the UI or product data? |
| Non-goals | What is explicitly out of scope? |
| Object | Which product object does the action touch? (property, tenancy, task, work order, mailbox, integration, conversation) |
| Scope | Which records does it affect: one, a selection, everything? |
| Action | What is the verb, and is it destructive, reversible, or both? |
| Consequence | What must the interface communicate before and after? |
| Reversibility | Can the user undo it? Can the system? |
| Permissions | Who is allowed to do this, and what does the UI show those who are not? |
| Open decisions | What is unresolved, and who decides? |

## Material vs mechanical

A decision is **material** if it changes any of these:

- the task of the user
- a default
- scope or consequence of an action
- navigation
- the interaction surface
- the set of reachable states

Mechanical (do not escalate): copy mechanics, token value replacement, established component substitutions, pure refactors with identical rendered output.

## Evidence hierarchy

1. Verified product behavior (run it, read the handler).
2. Canonical repo guidance (DESIGN.md, AGENTS.md, sg-rules).
3. Accepted decisions and exemplars in this skill.
4. Verified adjacent shipped patterns in the same surface.
5. General interface heuristics. Use them as a last resort, and label them as such in output.

## Permissions

cf0 is multi-tenant on Clerk organizations. `roleCan` (`apps/web/src/lib/auth/roles.ts`) maps `org:admin` / `org:member` (and their bare-role aliases) to two capabilities, `staff` and `admin`. `useIsOrgAdmin` (`apps/web/src/features/auth/workspace/use-is-org-admin.ts`) reads the admin capability from the active org role.

- Use the same information architecture for every role. A member sees the same navigation and boards as an admin.
- Admin-only mutations (team invitations, execution permissions, mailbox provisioning) disable with a reason. They do not disappear.
- Gate at the point of action, not at the point of navigation. Let the operator understand the capability before they reach the boundary.
- The org gate itself (`apps/web/src/features/auth/workspace/org-gate.tsx`) resolves zero, one, or multiple memberships before the app renders:
  - Zero memberships go to a founder-contact gate.
  - More than one membership gets an org picker.
  - Exactly one membership renders straight through.

## Destructive actions

Match friction to blast radius. Name the object before the act.

- **Files** — `apps/api/src/features/files/store-d1.ts` has no hard delete.
  - `softDelete()` writes a tombstone.
  - The purge relay (`apps/api/src/features/files/purge.ts`) deletes bytes later on its own schedule.
  - `sg-rules/no-blob-hard-delete.yml` and `sg-rules/no-raw-r2-bucket-delete.yml` enforce this.
  - Never write "this cannot be undone" for a tombstoned object. Say what the user experiences (`This removes {name} from your workspace`) and stop there.
  - Recovery before purge is an operator action, not a user-facing promise.
- **Tasks** — `cancel` (`apps/web/src/features/tasks/workspace/api.ts`) moves a task to the `cancelled` state. That state is visible behind the Closed filter of the board. State the brief of the task in the confirmation, not just "this task".
- **Mailboxes / channels** — `revokeMailbox` (`apps/web/src/features/mail/workspace/api.ts`) and `disconnectIntegration` (`apps/web/src/features/integrations/workspace/api.ts`) immediately stop Zero from reading or acting through that channel. Name the channel and what stops working: "Zero will stop reading this inbox", not a generic "disconnect".
- **Team** — nobody can demote or remove the last admin in an org (`apps/web/src/features/setup/workspace/setup-team-dialog.tsx`). The UI must make that floor visible before the user tries the action, not after a failed request.

### When to use a confirmation dialog vs inline undo

- **Confirmation dialog:** the action stops a live workflow that the user cannot restore in one click. Examples: revoke a channel, disconnect an integration, remove a team member.
- **Inline undo:** the action is small and immediately reversible by the same user in the same view.
- **Never silent:** no destructive action completes without a confirmation or an undoable toast. A row that vanishes with no signal is a defect.

### Naming and copy

- Destructive button text: use `Verb + noun` ("Delete task", "Revoke mailbox", "Remove member"). Never use "Are you sure?" as the label. Follow `DESIGN.md` §Labels and copy for app casing.
- Dialog body: one sentence, in sentence case, that states what the action removes or stops.
- Toast on success: sentence case, one line, with an Undo action when the change is reversible.

## Anti-patterns

- A judgment problem solved with styling. A nicer button does not fix a confusing flow.
- One screenshot promoted into a universal rule.
- An unresolved product choice hidden inside an implementation detail.
- A design of the populated success case, and nothing more.
