# Product judgment

Load for flow design, material changes, and full reviews.

## Internal brief

Before proposing a material change, answer each question in one sentence:

| Field | Question |
| --- | --- |
| User | Who is acting? |
| Job | What are they trying to accomplish? |
| Current behavior | What happens today? |
| Desired outcome | What should happen instead? |
| Success signal | How can the user or system observe success? |
| Non-goals | What is out of scope? |
| Object | Which message, commitment, invoice, approval, or evidence record changes? |
| Scope | Which records does the action affect? |
| Action | Is it destructive or reversible? |
| Consequence | What must the interface explain before and after? |
| Permissions | Who may act, and what do others see? |
| Open decisions | What remains unresolved, and who decides? |

## Material versus mechanical

A decision is material if it changes the user's task, a default, action scope or
consequence, navigation, the interaction surface, or reachable states.
Copy mechanics, token replacement, and established component substitutions
are usually mechanical.

## Evidence order

1. Verify product behavior in code or in the running app.
2. Read `AGENTS.md`, `PLAN.md`, and the relevant token source.
3. Use accepted decisions and checked examples.
4. Check adjacent patterns in the same feature.
5. Use general interface guidance only when direct evidence is absent. Label
   assumptions.

## Permissions

- Read the current authorization and policy behavior before changing a gate.
- Keep a user's information architecture consistent when permissions differ.
- Explain disabled actions when the reason affects the user's next step.
- Gate the action, not unrelated navigation.

## Destructive actions

Match friction to impact. Name the object before the action.

- Use confirmation when the user cannot quickly undo an action that stops
  ongoing work or changes a durable record.
- Use inline undo for small, immediately reversible changes.
- State what changed after every destructive action.

## Naming and copy

- Use a verb and object for destructive action labels.
- State what an action removes or stops.
- Keep confirmation text brief and specific.
- Offer undo only when the system can honor it.

## Anti-patterns

- Solving a judgment problem with styling alone.
- Treating one screenshot as a universal rule.
- Hiding an unresolved product choice in implementation details.
- Designing only the populated success state.
