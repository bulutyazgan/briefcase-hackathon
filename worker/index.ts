interface Env {
  ASSETS: { fetch: (request: Request) => Promise<Response> }
}

interface SnapshotAsset {
  path: string
  contentType: string
  disposition?: string
}

const jsonContentType = 'application/json; charset=utf-8'
const csvContentType = 'text/csv; charset=utf-8'
const pdfContentType = 'application/pdf'
const readOnlyError = 'Tally is a read-only demo. Run it locally with your own keys to try it live.'
const safeId = /^[A-Za-z0-9_-]+$/

function snapshotAsset(pathname: string): SnapshotAsset | null {
  const fixedAssets: Record<string, SnapshotAsset> = {
    '/api/state': { path: '/snapshot/state.json', contentType: jsonContentType },
    '/api/leads': { path: '/snapshot/leads.json', contentType: jsonContentType },
    '/api/company': { path: '/snapshot/company.json', contentType: jsonContentType },
    '/api/control': { path: '/snapshot/control.json', contentType: jsonContentType },
    '/api/opportunities': { path: '/snapshot/opportunities.json', contentType: jsonContentType },
    '/api/books/journals': { path: '/snapshot/books-journals.json', contentType: jsonContentType },
    '/api/books/journals.csv': {
      path: '/snapshot/books-journals.csv',
      contentType: csvContentType,
      disposition: 'attachment; filename="tally-books-journals.csv"',
    },
  }
  const fixed = fixedAssets[pathname]
  if (fixed) return fixed

  const invoiceLeads = pathname.match(/^\/api\/invoices\/([^/]+)\/leads$/)
  if (invoiceLeads && safeId.test(invoiceLeads[1])) {
    return { path: `/snapshot/invoice-leads/${invoiceLeads[1]}.json`, contentType: jsonContentType }
  }

  const leadsCsv = pathname.match(/^\/api\/leads\/([^/]+)\.csv$/)
  if (leadsCsv && safeId.test(leadsCsv[1])) {
    return {
      path: `/snapshot/leads-csv/${leadsCsv[1]}.csv`,
      contentType: csvContentType,
      disposition: `attachment; filename="tally-leads-${leadsCsv[1]}.csv"`,
    }
  }

  const invoicePdf = pathname.match(/^\/api\/invoices\/([^/]+)\/pdf$/)
  if (invoicePdf && safeId.test(invoicePdf[1])) {
    return {
      path: `/snapshot/pdf/${invoicePdf[1]}.pdf`,
      contentType: pdfContentType,
      disposition: `inline; filename="tally-${invoicePdf[1]}.pdf"`,
    }
  }

  return null
}

function jsonResponse(request: Request, value: unknown, status: number): Response {
  return new Response(request.method === 'HEAD' ? null : JSON.stringify(value), {
    status,
    headers: { 'Content-Type': jsonContentType },
  })
}

export async function fetch(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return jsonResponse(request, { error: readOnlyError }, 405)
  }

  const url = new URL(request.url)
  if (url.pathname === '/health') {
    return jsonResponse(request, { status: 'ok', mode: 'read-only' }, 200)
  }

  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    const asset = snapshotAsset(url.pathname)
    if (!asset) return jsonResponse(request, { error: 'Demo snapshot not found.' }, 404)

    url.pathname = asset.path
    url.search = ''
    try {
      const response = await env.ASSETS.fetch(new Request(url, { method: request.method }))
      if (!response.ok) return jsonResponse(request, { error: 'Demo snapshot not found.' }, 404)

      const headers = new Headers(response.headers)
      headers.set('Content-Type', asset.contentType)
      if (asset.disposition) headers.set('Content-Disposition', asset.disposition)
      return new Response(request.method === 'HEAD' ? null : response.body, {
        status: response.status,
        headers,
      })
    } catch {
      return jsonResponse(request, { error: 'Demo snapshot not found.' }, 404)
    }
  }

  return env.ASSETS.fetch(request)
}
