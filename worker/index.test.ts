import { describe, expect, test } from 'bun:test'
import { fetch as workerFetch } from './index'

function createEnv(assetBody = '{"messages":[]}') {
  const paths: string[] = []
  const env = {
    ASSETS: {
      async fetch(request: Request) {
        paths.push(new URL(request.url).pathname)
        return new Response(assetBody, { headers: { 'Content-Type': 'text/plain' } })
      },
    },
  }
  return { env, paths }
}

describe('read-only demo worker', () => {
  test('maps the state API to its snapshot asset', async () => {
    const { env, paths } = createEnv()
    const response = await workerFetch(new Request('https://demo.test/api/state'), env)

    expect(paths).toEqual(['/snapshot/state.json'])
    expect(response.headers.get('Content-Type')).toBe('application/json; charset=utf-8')
    expect(await response.json()).toEqual({ messages: [] })
  })

  test('rejects writes without requesting an asset', async () => {
    const { env, paths } = createEnv()
    const response = await workerFetch(new Request('https://demo.test/api/state', { method: 'POST' }), env)

    expect(response.status).toBe(405)
    expect(paths).toEqual([])
    expect(await response.json()).toEqual({
      error: 'Tally is a read-only demo. Run it locally with your own keys to try it live.',
    })
  })

  test('rejects path traversal ids', async () => {
    const { env, paths } = createEnv()
    for (const path of [
      'https://demo.test/api/invoices/..%2Fescape/pdf',
      'https://demo.test/api/invoices/%2e%2e%2Fescape/pdf',
    ]) {
      const response = await workerFetch(new Request(path), env)
      expect(response.status).toBe(404)
    }
    expect(paths).toEqual([])
  })

  test('reports the read-only health mode', async () => {
    const { env, paths } = createEnv()
    const response = await workerFetch(new Request('https://demo.test/health'), env)

    expect(paths).toEqual([])
    expect(await response.json()).toEqual({ status: 'ok', mode: 'read-only' })
  })
})
