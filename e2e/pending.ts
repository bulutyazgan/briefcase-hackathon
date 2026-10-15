// Scenarios (or sub-checks) that depend on features not yet merged into the
// branch under test. run.ts skips scenarios listed here; scenarios consult it
// for sub-checks. Remove an id to enable it.
export const pending: Record<string, string> = {
  'plan-change': 'subscriptions/handlePlanChange is not hooked into processMessage yet: concierge.ts owns the plan-change detector (wantsPlanChange) and still bills a one-off invoice; enable once concierge calls stripeSubscriptionGateway for lead-list plans',
}
