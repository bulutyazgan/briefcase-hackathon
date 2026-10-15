// Scenarios (or sub-checks) that depend on features not yet merged into the
// branch under test. run.ts skips scenarios listed here; scenarios consult it
// for sub-checks. Remove an id to enable it.
export const pending: Record<string, string> = {
  'why-from-composer':
    'The simulator composer gives every message its own thread and explainLatestInvoice only looks in the same thread, '
    + 'so "Why £1,080?" typed in the UI is treated as a new (refused) commitment. The scenario sends it as a thread reply via the simulator endpoint.',
}
