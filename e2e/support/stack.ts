import { join } from 'node:path'
import { waitFor } from './harness'

export const root = new URL('../..', import.meta.url).pathname
export const e2eDir = new URL('..', import.meta.url).pathname
export const artifactsDir = join(e2eDir, 'artifacts')
export const mockPort = Number(process.env.MOCK_PORT ?? 4010)
// Not 8787, so a developer's `bun run dev` can keep running; support/vite-e2e.config.ts proxies here.
export const apiPort = Number(process.env.E2E_API_PORT ?? 8797)
export const webPort = Number(process.env.E2E_WEB_PORT ?? 5179)
export const chromePath = process.env.E2E_CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'

export const mockBase = `http://127.0.0.1:${mockPort}`
export const apiBase = `http://127.0.0.1:${apiPort}`
export const webBase = `http://127.0.0.1:${webPort}`

export async function healthy(url: string): Promise<boolean> {
  try {
    return (await fetch(url)).ok
  } catch {
    return false
  }
}

export async function seedCogneeFromProductSeed(): Promise<void> {
  // Stands in for the one-off step that loads seeded client memory into a real Cognee tenant.
  const seed: unknown = await Bun.file(join(root, 'server/seed/memory.json')).json()
  const entries = Array.isArray(seed) ? seed : []
  const payload = entries.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || !('clientName' in entry) || !('fact' in entry) || !('date' in entry)) return []
    const dataset = String(entry.clientName).toLowerCase().replace(/[^a-z0-9]+/g, '-')
    return [{ dataset, text: String(entry.fact), date: String(entry.date) }]
  })
  await fetch(`${mockBase}/__cognee/seed`, { method: 'POST', body: JSON.stringify(payload) })
}

export function serverEnv(dbPath: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !/^(FIREWORKS|FIRECRAWL|OPENAI|SLACK|STRIPE|TREG|COGNEE)_/.test(key)) env[key] = value
  }
  return {
    ...env,
    PORT: String(apiPort),
    TALLY_DB_PATH: dbPath,
    // Bun fills a missing key from server/.env but keeps a preset one, so an empty key pins the heuristic extractor.
    OPENAI_API_KEY: '',
    STRIPE_SECRET_KEY: process.env.E2E_STRIPE_KEY ?? 'sk_test_mock',
    STRIPE_API_BASE: mockBase,
    TREG_TOKEN: 'mock',
    TREG_BASE_URL: mockBase,
    COGNEE_API_KEY: 'mock',
    COGNEE_BASE_URL: mockBase,
  }
}

export async function startServer(dbPath: string, logFile: string): Promise<() => Promise<void>> {
  const env = serverEnv(dbPath)
  // E2E_SEED=demo loads the six-beat demo state (Globex late invoice) for e2e/film-demo.ts.
  const seedScript = process.env.E2E_SEED === 'demo' ? 'src/demo-seed.ts' : 'src/seed.ts'
  const seed = Bun.spawn(['bun', seedScript], { cwd: join(root, 'server'), env, stdout: 'ignore', stderr: 'inherit' })
  if ((await seed.exited) !== 0) throw new Error('seed failed')
  const preload = join(e2eDir, 'support/stripe-base-preload.ts')
  const server = Bun.spawn(['bun', '--preload', preload, 'src/index.ts'], {
    cwd: join(root, 'server'),
    env,
    stdout: Bun.file(logFile),
    stderr: Bun.file(`${logFile}.err`),
  })
  await waitFor('API health', async () => healthy(`${apiBase}/health`), 20000)
  return async () => {
    server.kill()
    await server.exited
  }
}

export function startWeb(logDir: string): () => void {
  const config = join(e2eDir, 'support/vite-e2e.config.ts')
  const web = Bun.spawn(['bunx', 'vite', '--config', config, '--host', '127.0.0.1', '--port', String(webPort), '--strictPort'], {
    cwd: join(root, 'web'),
    env: { ...process.env, E2E_API_BASE: `http://127.0.0.1:${apiPort}` },
    stdout: Bun.file(join(logDir, 'web.log')),
    stderr: Bun.file(join(logDir, 'web.err.log')),
  })
  return () => web.kill()
}
