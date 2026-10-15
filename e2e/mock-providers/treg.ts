// Treg hosted gateway replica. Wire shapes mirror the comment at the top of
// server/src/features/leads/providers/treg/treg-client.ts:
//   POST /call/<catalog-id>?<query>   (Apollo params in the query string, arrays as field[]=v)
//   X-Treg-Token required; X-Treg-Route-Max-Cost in USD decimal.
//   Price above the route max → 402 {"error":"route_max_cost"}, no X-Treg-Cost-Micro (no charge).
//   Success → verbatim Apollo body + X-Treg-Cost-Micro (integer micro-USD) + X-Treg-Call-Id.
// All response bodies are built in `tregBody` so the shape can be adjusted in one place.

const priceMicro: Record<string, number> = {
  'apollo.people.search': 0,
  'apollo.companies.search': 26_000,
  'apollo.companies.news': 26_000,
}

let callCounter = 0

export function resetTreg(): void {
  callCounter = 0
}

function tregBody(endpointId: string, params: URLSearchParams): Record<string, unknown> {
  const perPage = Math.min(Math.max(Number(params.get('per_page') ?? 10) || 10, 1), 100)
  const page = Math.max(Number(params.get('page') ?? 1) || 1, 1)
  const range = Array.from({ length: perPage }, (_, index) => (page - 1) * perPage + index + 1)
  const title = params.getAll('person_titles[]')[0] ?? 'Chief Financial Officer'
  if (endpointId === 'apollo.people.search') {
    return {
      people: range.map((n) => ({
        id: `mock_person_${n}`,
        first_name: `Mock${n}`,
        last_name_obfuscated: 'Pe***n',
        title,
        organization: { name: `Mock Fintech ${n} Ltd` },
      })),
      total_entries: 1000,
    }
  }
  if (endpointId === 'apollo.companies.search') {
    return {
      organizations: range.map((n) => ({
        id: `mock_org_${n}`,
        name: `Mock Fintech ${n} Ltd`,
        website_url: `http://www.mockfintech${n}.example`,
        primary_domain: `mockfintech${n}.example`,
      })),
    }
  }
  if (endpointId === 'apollo.companies.news') {
    return {
      news_articles: range.map((n) => ({
        id: `mock_news_${n}`,
        url: `https://news.example/${n}`,
        title: `Mock Fintech ${n} raises Series B`,
        organization_ids: [`mock_org_${n}`],
      })),
    }
  }
  return { error: 'unknown_endpoint' }
}

export function handleTreg(request: Request, url: URL): Response {
  if (!request.headers.get('x-treg-token')) {
    return Response.json({ error: 'missing_token' }, { status: 401 })
  }
  const endpointId = decodeURIComponent(url.pathname.replace(/^\/call\//, ''))
  const price = priceMicro[endpointId]
  if (price === undefined) return Response.json({ error: 'unknown_endpoint' }, { status: 404 })
  const maxUsd = request.headers.get('x-treg-route-max-cost')
  if (maxUsd !== null && price > Math.round(Number(maxUsd) * 1_000_000)) {
    return Response.json({ error: 'route_max_cost', price_usd: price / 1_000_000, max_usd: Number(maxUsd) }, { status: 402 })
  }
  callCounter += 1
  return Response.json(tregBody(endpointId, url.searchParams), {
    headers: {
      'X-Treg-Cost-Micro': String(price),
      'X-Treg-Call-Id': `call_mock_${callCounter}`,
    },
  })
}
