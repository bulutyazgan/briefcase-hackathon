// Scenarios (or sub-checks) that depend on features not yet merged into the
// branch under test. run.ts skips scenarios listed here; scenarios consult it
// for sub-checks. Remove an id to enable it.
export const pending: Record<string, string> = {
  :
    'The server emails the buyer agent its invoice with POST /v1/invoices/:id/send, which e2e/mock-providers/stripe.ts does not implement '
    + '(StripeInvalidRequestError "Unrecognized request URL"), so billing stops before the upsell offer. Add /send to the mock, then remove this id.',
}
