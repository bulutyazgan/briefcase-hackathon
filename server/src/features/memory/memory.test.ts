import { afterEach, describe, expect, test } from 'bun:test'
import { clearSessionFacts, decodeFacts, encodeFact, recall, recallFacts, remember } from './memory'
import { createCogneeClient, type FetchLike } from './providers/cognee'

afterEach(() => clearSessionFacts())

describe('seeded memory', () => {
  test('loads facts, terms and a saved ICP for all three demo clients', async () => {
    for (const client of ['Northwind Capital', 'Acme Ventures', 'Globex Partners']) {
      const facts = await recall(client, 'anything', undefined, { cognee: null })
      expect(facts.length).toBeGreaterThan(1)
      expect(facts.some((entry) => /Saved ICP/.test(entry.fact))).toBe(true)
      expect(facts.some((entry) => /-day terms/.test(entry.fact))).toBe(true)
      expect(facts.every((entry) => entry.sourceMessageId.length > 0)).toBe(true)
    }
    const northwind = await recall('Northwind', 'discount', undefined, { cognee: null })
    expect(northwind.some((entry) => entry.fact === 'Agreed 10% off orders over 200 leads' && entry.date === '2026-08-12')).toBe(true)
    const globex = await recall('Globex Partners', 'dispute', 'collections', { cognee: null })
    expect(globex.map((entry) => entry.date)).toEqual(['2026-09-20'])
  })

  test('legacy recallFacts wrapper still returns MemoryFact-compatible entries', async () => {
    const saved = process.env.COGNEE_API_KEY
    delete process.env.COGNEE_API_KEY
    const facts = await recallFacts('Northwind Capital', 'discount')
    if (saved !== undefined) process.env.COGNEE_API_KEY = saved
    expect(facts.some((entry) => entry.fact.startsWith('Agreed 10%'))).toBe(true)
  })
})

describe('role-tagged memory', () => {
  test('round-trips role, date and source locally', async () => {
    await remember('Acme Ventures', 'collections', "We'll pay Friday", 'msg-42', {
      cognee: null,
      now: new Date('2026-10-13T12:00:00Z'),
    })
    const collections = await recall('Acme', 'pay', 'collections', { cognee: null })
    expect(collections).toEqual([{
      clientName: 'Acme Ventures',
      role: 'collections',
      fact: "We'll pay Friday",
      sourceMessageId: 'msg-42',
      date: '2026-10-13',
    }])
    const sales = await recall('Acme', 'pay', 'sales', { cognee: null })
    expect(sales.some((entry) => entry.sourceMessageId === 'msg-42')).toBe(false)
  })

  test('round-trips tags through the Cognee provider', async () => {
    const stored: string[] = []
    const calls: string[] = []
    const fakeFetch: FetchLike = async (url, init) => {
      calls.push(url)
      expect(new Headers(init?.headers).get('X-Api-Key')).toBe('test-key')
      if (url.endsWith('/api/v1/add') && init?.body instanceof FormData) {
        const file = init.body.get('data')
        if (file instanceof Blob) stored.push(await file.text())
        expect(init.body.get('datasetName')).toBe('globex-partners')
      }
      if (url.endsWith('/api/v1/search')) return Response.json([{ search_result: stored }])
      return Response.json({ ok: true })
    }
    const cognee = createCogneeClient({ apiKey: 'test-key', baseUrl: 'http://cognee.test/', fetch: fakeFetch })
    await remember('Globex', 'sales', 'Wants 50 more leads next month', 'msg-7', {
      cognee,
      now: new Date('2026-10-14T00:00:00Z'),
    })
    clearSessionFacts() // force the fact to come back from Cognee
    const facts = await recall('Globex Partners', 'leads', 'sales', { cognee })
    expect(facts).toContainEqual({
      clientName: 'Globex Partners',
      role: 'sales',
      fact: 'Wants 50 more leads next month',
      sourceMessageId: 'msg-7',
      date: '2026-10-14',
    })
    expect(calls).toEqual([
      'http://cognee.test/api/v1/add',
      'http://cognee.test/api/v1/cognify',
      'http://cognee.test/api/v1/search',
    ])
  })

  test('decodes only facts for the requested client', () => {
    const text = encodeFact({
      clientName: 'Acme Ventures',
      role: 'billing',
      fact: 'Pays on 14-day terms',
      date: '2026-08-20',
      sourceMessageId: 's1',
    })
    expect(decodeFacts(text, 'Acme Ventures')).toHaveLength(1)
    expect(decodeFacts(text, 'Globex Partners')).toHaveLength(0)
  })
})
