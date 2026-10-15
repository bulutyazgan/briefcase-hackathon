import type Stripe from 'stripe'
import type { BuyerInvoice } from '../policy'

export interface BuyerPayments {
  retrieveInvoice(invoiceId: string): Promise<BuyerInvoice>
  payInvoice(invoice: BuyerInvoice): Promise<{ status: string }>
}

// Tally's invoice items are amount-based (quantity 1), so the lead count comes from the
// line description ("300 at £4.00 per lead"). An unreadable line counts as one lead and fails B2.
function leadsOnLine(line: Stripe.InvoiceLineItem): number {
  const match = line.description?.match(/(\d+) at £/)
  return match?.[1] ? Number(match[1]) : line.quantity ?? 1
}

function toBuyerInvoice(invoice: Stripe.Invoice): BuyerInvoice {
  if (!invoice.id) throw new Error('Stripe returned an invoice without an id.')
  return {
    id: invoice.id,
    customerId: typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id ?? '',
    status: invoice.status ?? 'unknown',
    totalPence: invoice.total,
    lines: invoice.lines.data.map((line) => ({ netPence: line.amount, leads: leadsOnLine(line) })),
    poNumber: invoice.metadata?.po_number ?? null,
  }
}

export function stripePayments(stripe: Stripe): BuyerPayments {
  return {
    async retrieveInvoice(invoiceId) {
      return toBuyerInvoice(await stripe.invoices.retrieve(invoiceId))
    },
    async payInvoice(invoice) {
      // invoices.pay only accepts a payment method owned by the invoice's customer, so the
      // pm_card_visa test method is attached first and its new pm_ id is charged.
      const paymentMethod = await stripe.paymentMethods.attach('pm_card_visa', {
        customer: invoice.customerId,
      }, { idempotencyKey: `buyer-attach-${invoice.id}` })
      const paid = await stripe.invoices.pay(invoice.id, {
        payment_method: paymentMethod.id,
      }, { idempotencyKey: `buyer-pay-${invoice.id}` })
      return { status: paid.status ?? 'unknown' }
    },
  }
}
