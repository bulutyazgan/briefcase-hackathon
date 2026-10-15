interface Env {
  API_ORIGIN: string
  ASSETS: { fetch: (request: Request) => Promise<Response> }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/api/') || url.pathname === '/health') {
      return fetch(new Request(new URL(url.pathname + url.search, env.API_ORIGIN), request))
    }
    return env.ASSETS.fetch(request)
  },
}
