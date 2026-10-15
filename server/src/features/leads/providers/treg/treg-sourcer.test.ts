import { describe, expect, test } from 'bun:test'
import type { SourcingRequest } from '../../sourcing'
import { TregUnavailableError, type FetchLike } from './treg-client'
import type { Proposal, ProposedCall } from './treg-proposer'
import { createTregSourcer } from './treg-sourcer'

interface Seen {
  url: string
  headers: Headers
  method: string | undefined
}

function people(count: number, offset = 0) {
  return {
    people: Array.from({ length: count }, (_, index) => ({
      id: `p${index + offset}`,
      first_name: `First${index + offset}`,
      last_name_obfuscated: 'L***',
      organization: { name: `Co${index + offset}` },
    })),
  }
}

function fakeFetch(respond: (url: string) => { body: unknown; cost: number; status?: number }) {
  const seen: Seen[] = []
  const fetchImpl: FetchLike = async (input, init) => {
    seen.push({ url: input, headers: new Headers(init.headers), method: init.method })
    const { body, cost, status } = respond(input)
    return new Response(JSON.stringify(body), {
      status: status ?? 200,
      headers: { 'content-type': 'application/json', 'X-Treg-Cost-Micro': String(cost) },
    })
  }
  return { fetchImpl, seen }
}

function proposer(calls: ProposedCall[]) {
  return async (): Promise<Proposal> => ({ calls, model: 'test' })
}

const request: SourcingRequest = {
  orderId: 'o1',
  icp: 'Heads of marketing at UK fintechs',
  signals: [],
  quantity: 5,
  maxTotalCostMicro: 100_000,
}

describe('tregSourcer', () => {
  test('rejects endpoints not on the allowlist (P10) without calling Treg', async () => {
    const { fetchImpl, seen } = fakeFetch(() => ({ body: people(5), cost: 0 }))
    const source = createTregSourcer({
      token: 't', baseUrl: 'http://mock', fetch: fetchImpl,
      propose: proposer([{ endpointId: 'semrush.backlinks', params: {} }]),
    })
    const result = await source(request)
    expect(seen).toHaveLength(0)
    expect(result.calls).toEqual([{ endpointId: 'semrush.backlinks', accepted: false, reason: 'Endpoint is not on the Treg allowlist.', costMicro: 0, clauses: ['P10'] }])
    expect(result.source).toBe('treg')
  })

  test('sends token, per-call cap header and array params', async () => {
    const { fetchImpl, seen } = fakeFetch(() => ({ body: people(2), cost: 1_000 }))
    const source = createTregSourcer({
      token: 'tok', baseUrl: 'http://mock', fetch: fetchImpl,
      propose: proposer([{ endpointId: 'apollo.people.search', params: { person_titles: ['head of marketing'] } }]),
    })
    await source(request)
    expect(seen).toHaveLength(1)
    const call = seen[0]
    expect(call?.method).toBe('POST')
    expect(call?.headers.get('X-Treg-Token')).toBe('tok')
    expect(call?.headers.get('X-Treg-Route-Max-Cost')).toBe('0.01')
    expect(call?.url.startsWith('http://mock/call/apollo.people.search?')).toBe(true)
    expect(call?.url).toContain('person_titles%5B%5D=head+of+marketing')
    expect(call?.url).toContain('per_page=5')
  })

  test('reads cost from X-Treg-Cost-Micro and splits it across leads', async () => {
    const { fetchImpl } = fakeFetch(() => ({ body: people(3), cost: 10 }))
    const source = createTregSourcer({
      token: 't', baseUrl: 'http://mock', fetch: fetchImpl,
      propose: proposer([{ endpointId: 'apollo.people.search', params: {} }]),
    })
    const result = await source(request)
    expect(result.costMicro).toBe(10)
    expect(result.calls[0]?.costMicro).toBe(10)
    expect(result.leads.map((lead) => lead.costMicro)).toEqual([4, 3, 3])
    expect(result.leads[0]).toEqual({
      id: 'treg:apollo.people.search:p0', name: 'First0 L***', company: 'Co0',
      url: 'https://app.apollo.io/#/people/p0', provider: 'apollo', costMicro: 4,
    })
  })

  test('truncates to the requested quantity and skips calls once reached', async () => {
    const { fetchImpl, seen } = fakeFetch(() => ({ body: people(8), cost: 0 }))
    const source = createTregSourcer({
      token: 't', baseUrl: 'http://mock', fetch: fetchImpl,
      propose: proposer([
        { endpointId: 'apollo.people.search', params: {} },
        { endpointId: 'apollo.people.search', params: {} },
      ]),
    })
    const result = await source(request)
    expect(result.leads).toHaveLength(5)
    expect(seen).toHaveLength(1)
    expect(result.calls[1]?.accepted).toBe(false)
  })

  test('stops buying when the order total cap would be exceeded (P9)', async () => {
    const { fetchImpl, seen } = fakeFetch(() => ({
      body: { organizations: [{ id: 'o1', name: 'Acme', website_url: 'https://acme.test' }] },
      cost: 26_000,
    }))
    const source = createTregSourcer({
      token: 't', baseUrl: 'http://mock', fetch: fetchImpl,
      propose: proposer([
        { endpointId: 'apollo.companies.search', params: {} },
        { endpointId: 'apollo.companies.search', params: {} },
      ]),
    })
    const result = await source({ ...request, maxTotalCostMicro: 50_000 })
    expect(seen).toHaveLength(1)
    expect(result.costMicro).toBe(26_000)
    expect(result.calls[1]).toMatchObject({ accepted: false, clauses: ['P9'], costMicro: 0 })
  })

  test('records a Treg 402 route_max_cost refusal as rejected with no charge', async () => {
    const { fetchImpl } = fakeFetch(() => ({ body: { error: 'route_max_cost' }, cost: 0, status: 402 }))
    const source = createTregSourcer({
      token: 't', baseUrl: 'http://mock', fetch: fetchImpl,
      propose: proposer([{ endpointId: 'apollo.people.search', params: {} }]),
    })
    const result = await source(request)
    expect(result.leads).toHaveLength(0)
    expect(result.calls[0]).toMatchObject({ accepted: false, clauses: ['P9'], costMicro: 0 })
  })

  test('throws TregUnavailableError when TREG_TOKEN is missing', async () => {
    const previous = process.env.TREG_TOKEN
    delete process.env.TREG_TOKEN
    try {
      const source = createTregSourcer({ propose: proposer([]) })
      await expect(source(request)).rejects.toBeInstanceOf(TregUnavailableError)
    } finally {
      if (previous !== undefined) process.env.TREG_TOKEN = previous
    }
  })
})
