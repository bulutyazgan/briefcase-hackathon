import { describe, expect, test } from 'bun:test'
import type { SourcedLead } from '../leads/sourcing'
import { saveInvoice } from '../ledger/store'
import {
  invoiceLeadRows,
  meterQualifiedLeads,
  qualifyLeads,
  recordLeadQualification,
  type MeterApi,
} from './meters'

function lead(id: string, overrides: Partial<SourcedLead> = {}): SourcedLead {
  return {
    id,
    name: `Person ${id}`,
    company: `Company ${id}`,
    url: `https://example.com/${id}`,
    provider: 'treg:apollo.people.search',
    costMicro: 2_000,
    ...overrides,
  }
}

function fakeStripe(existingMeters: Array<{ id: string; event_name: string }> = []) {
  const meterEvents: Array<{ identifier: string; customer: string; value: string; idempotencyKey: string }> = []
  const metersCreated: string[] = []
  const api: MeterApi = {
    billing: {
      meters: {
        list: async () => ({ data: existingMeters }),
        create: async (params) => {
          metersCreated.push(params.event_name)
          const meter = { id: `mtr_${existingMeters.length + 1}`, event_name: params.event_name }
          existingMeters.push(meter)
          return meter
        },
      },
      meterEvents: {
        create: async (params, options) => {
          meterEvents.push({
            identifier: params.identifier,
            customer: params.payload.stripe_customer_id,
            value: params.payload.value,
            idempotencyKey: options.idempotencyKey,
          })
          return { identifier: params.identifier }
        },
      },
    },
  }
  return { api, meterEvents, metersCreated }
}

function seedInvoice(messageId: string): void {
  saveInvoice({
    id: messageId,
    message_id: messageId,
    stripe_invoice_id: `in_${messageId}`,
    client_id: 'cus_northwind',
    total_pence: 1_200,
    status: 'open',
    hosted_url: 'https://invoice.stripe.test',
    pdf_path: null,
  })
}

describe('qualifyLeads', () => {
  test('qualifies leads with name, company and url', () => {
    const [verdict] = qualifyLeads([lead('a')])
    expect(verdict?.qualified).toBe(true)
  })

  test('rejects a lead missing a name, company or url', () => {
    const verdicts = qualifyLeads([
      lead('a', { name: ' ' }),
      lead('b', { company: '' }),
      lead('c', { url: '' }),
    ])
    expect(verdicts.map((verdict) => [verdict.qualified, verdict.reason])).toEqual([
      [false, 'missing name'],
      [false, 'missing company'],
      [false, 'missing url'],
    ])
  })

  test('rejects duplicates by id, url, or name and company', () => {
    const verdicts = qualifyLeads([
      lead('a'),
      lead('a', { name: 'Other', company: 'Other', url: 'https://other.example' }),
      lead('b', { url: 'http://www.example.com/a/' }),
      lead('c', { name: 'person a', company: 'COMPANY A', url: 'https://c.example' }),
      lead('d'),
    ])
    expect(verdicts.map((verdict) => [verdict.id, verdict.qualified, verdict.reason])).toEqual([
      ['a', true, 'has name, company and url; not a duplicate'],
      ['a', false, 'duplicate of a'],
      ['b', false, 'duplicate of a'],
      ['c', false, 'duplicate of a'],
      ['d', true, 'has name, company and url; not a duplicate'],
    ])
  })
})

describe('meterQualifiedLeads', () => {
  test('sends one meter event per qualified lead with identifier = order:lead id', async () => {
    const messageId = 'msg-meter-1'
    seedInvoice(messageId)
    recordLeadQualification(messageId, [lead('q1'), lead('q2', { url: '' }), lead('q3')])
    const fake = fakeStripe()

    expect(await meterQualifiedLeads(messageId, fake.api)).toBe(2)
    expect(fake.metersCreated).toEqual(['qualified_lead'])
    expect(fake.meterEvents.map((event) => [event.identifier, event.customer, event.value])).toEqual([
      ['msg-meter-1:q1', 'cus_northwind', '1'],
      ['msg-meter-1:q3', 'cus_northwind', '1'],
    ])
  })

  test('replay sends no duplicate meter events and reuses the existing meter', async () => {
    const messageId = 'msg-meter-2'
    seedInvoice(messageId)
    const leads = [lead('r1'), lead('r2')]
    recordLeadQualification(messageId, leads)
    const fake = fakeStripe([{ id: 'mtr_existing', event_name: 'qualified_lead' }])

    await meterQualifiedLeads(messageId, fake.api)
    recordLeadQualification(messageId, leads)
    expect(await meterQualifiedLeads(messageId, fake.api)).toBe(0)

    expect(fake.metersCreated).toEqual([])
    expect(fake.meterEvents.map((event) => event.identifier)).toEqual(['msg-meter-2:r1', 'msg-meter-2:r2'])
    expect(invoiceLeadRows(messageId)?.length).toBe(2)
  })
})

describe('invoiceLeadRows', () => {
  test('returns client-safe per-lead rows without provider or cost', async () => {
    const messageId = 'msg-meter-3'
    seedInvoice(messageId)
    recordLeadQualification(messageId, [lead('s1'), lead('s1', { name: 'Other' })])
    await meterQualifiedLeads(messageId, fakeStripe().api)

    const rows = invoiceLeadRows(messageId)
    expect(rows).toEqual([
      {
        id: 's1',
        name: 'Person s1',
        company: 'Company s1',
        qualified: true,
        reason: 'has name, company and url; not a duplicate',
        meterIdentifier: 'msg-meter-3:s1',
      },
      {
        id: 's1',
        name: 'Other',
        company: 'Company s1',
        qualified: false,
        reason: 'duplicate of s1',
        meterIdentifier: null,
      },
    ])
    const serialized = JSON.stringify(rows)
    expect(serialized).not.toContain('treg')
    expect(serialized).not.toContain('provider')
    expect(serialized).not.toContain('cost')
  })

  test('returns null for an unknown invoice', () => {
    expect(invoiceLeadRows('missing')).toBeNull()
  })
})
