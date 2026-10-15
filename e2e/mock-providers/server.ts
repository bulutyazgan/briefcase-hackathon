import { cogneeDatasets, handleCognee, resetCognee, seedCognee } from './cognee'
import { handleStripe, hostedInvoicePage, payInvoice, resetStripe, stripeInvoices, stripeObjects } from './stripe'
import { handleTreg, resetTreg } from './treg'

export interface LoggedRequest {
  provider: 'stripe' | 'treg' | 'cognee' | 'hosted'
  method: string
  path: string
  query: string
  headers: Record<string, string>
  body: string
  status: number
  responseHeaders: Record<string, string>
  at: string
}

const log: LoggedRequest[] = []

function providerFor(path: string): LoggedRequest['provider'] | null {
  if (path.startsWith('/v1/')) return 'stripe'
  if (path.startsWith('/call/')) return 'treg'
  if (path.startsWith('/api/v1/')) return 'cognee'
  if (path.startsWith('/hosted/')) return 'hosted'
  return null
}

async function route(request: Request, url: URL, base: string): Promise<Response> {
  const path = url.pathname
  if (path.startsWith('/v1/')) return handleStripe(request, url, base)
  if (path.startsWith('/call/')) return handleTreg(request, url)
  if (path.startsWith('/api/v1/')) return handleCognee(request, url)
  const pay = path.match(/^\/hosted\/([^/]+)\/pay$/)
  if (pay && request.method === 'POST') {
    payInvoice(pay[1] ?? '')
    return Response.redirect(`${base}/hosted/${pay[1]}`, 303)
  }
  const hosted = path.match(/^\/hosted\/([^/]+)$/)
  if (hosted) return hostedInvoicePage(hosted[1] ?? '')
  return new Response('Not found', { status: 404 })
}

export function startMockProviders(port = Number(process.env.MOCK_PORT ?? 4010)): { stop: () => void; base: string } {
  const base = `http://127.0.0.1:${port}`
  const server = Bun.serve({
    port,
    hostname: '127.0.0.1',
    async fetch(request) {
      const url = new URL(request.url)
      if (url.pathname === '/__health') return Response.json({ status: 'ok' })
      if (url.pathname === '/__reset' && request.method === 'POST') {
        log.length = 0
        resetStripe()
        resetCognee()
        resetTreg()
        return Response.json({ status: 'reset' })
      }
      if (url.pathname === '/__log') return Response.json(log)
      if (url.pathname === '/__state') return Response.json({ invoices: stripeInvoices(), objects: stripeObjects(), cognee: cogneeDatasets() })
      if (url.pathname === '/__cognee/seed' && request.method === 'POST') {
        const body: unknown = await request.json()
        if (Array.isArray(body)) {
          for (const entry of body) {
            const record = entry !== null && typeof entry === 'object' ? Object.fromEntries(Object.entries(entry)) : {}
            seedCognee(String(record.dataset), String(record.text), String(record.date))
          }
        }
        return Response.json({ status: 'seeded' })
      }
      const provider = providerFor(url.pathname)
      const body = request.method === 'GET' || request.method === 'HEAD' ? '' : await request.clone().text()
      const response = await route(request, url, base)
      if (provider) {
        log.push({
          provider,
          method: request.method,
          path: url.pathname,
          query: url.search,
          headers: Object.fromEntries(request.headers),
          body,
          status: response.status,
          responseHeaders: Object.fromEntries(response.headers),
          at: new Date().toISOString(),
        })
      }
      return response
    },
  })
  return { stop: () => void server.stop(true), base }
}

if (import.meta.main) {
  const { base } = startMockProviders()
  console.info(`Mock providers listening on ${base}`)
}
