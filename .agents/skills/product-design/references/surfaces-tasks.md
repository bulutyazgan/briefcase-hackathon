# Message inbox surface

Load when changing message threads, message composition, replies, or approval
cards inside the inbox.

Read `PLAN.md` and the `inbox` feature before changing the surface.

## Interaction

- Keep the message and its replies together in the thread.
- Make the speaker and message source clear.
- Preserve a draft when validation or a recoverable request fails.
- Show agent progress and the final reply as distinct states.
- Keep approvals next to the request that produced them.

## Coverage

Check empty, populated, pending, and error states. Check long messages and
narrow viewports. Keep the send action usable by keyboard and pointer.
