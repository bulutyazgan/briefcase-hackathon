// Scenarios (or sub-checks) that depend on features not yet merged into the
// branch under test. run.ts skips scenarios listed here; scenarios consult it
// for sub-checks. Remove an id to enable it.
export const pending: Record<string, string> = {}
