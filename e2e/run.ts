import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, type Browser } from 'playwright'
import { startMockProviders } from './mock-providers/server'
import { pending } from './pending'
import { scenarios } from './scenarios'
import type { LoggedRequest } from './mock-providers/server'
import { createShooter, waitFor } from './support/harness'
import { apiBase, apiPort, artifactsDir, chromePath, healthy, mockBase, mockPort, seedCogneeFromProductSeed, startServer, startWeb, webBase } from './support/stack'

const only = process.argv.slice(2).filter((arg) => !arg.startsWith('-'))
const includePending = process.argv.includes('--include-pending')

async function main(): Promise<number> {
  if (await healthy(`${apiBase}/health`)) {
    console.error(`Port ${apiPort} is already serving an API. Stop \`bun run dev\` first.`)
    return 2
  }
  await rm(artifactsDir, { recursive: true, force: true })
  await mkdir(artifactsDir, { recursive: true })
  const workDir = await mkdtemp(join(tmpdir(), 'tally-e2e-'))
  const mocks = startMockProviders(mockPort)
  const stopWeb = startWeb(artifactsDir)
  let browser: Browser | null = null
  const results: { id: string; status: 'pass' | 'fail' | 'pending'; detail: string }[] = []
  try {
    await waitFor('web dev server', async () => healthy(webBase), 30000)
    browser = await chromium.launch({
      headless: true,
      ...(existsSync(chromePath) ? { executablePath: chromePath } : {}),
    })
    for (const scenario of scenarios) {
      if (only.length && !only.includes(scenario.id)) continue
      const reason = pending[scenario.id]
      if (reason && !includePending) {
        results.push({ id: scenario.id, status: 'pending', detail: reason })
        console.info(`- PENDING ${scenario.id}: ${reason}`)
        continue
      }
      await fetch(`${mockBase}/__reset`, { method: 'POST' })
      await seedCogneeFromProductSeed()
      const dbPath = join(workDir, `${scenario.id}.db`)
      const stopServer = await startServer(dbPath, join(artifactsDir, `${scenario.id}.server.log`))
      const browserContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
      const page = await browserContext.newPage()
      page.setDefaultTimeout(15000)
      const notes: string[] = []
      const shot = createShooter(page, scenario.id, artifactsDir)
      const started = Date.now()
      try {
        await scenario.run({
          name: scenario.id,
          artifactsDir,
          browser,
          page,
          web: webBase,
          api: apiBase,
          mock: mockBase,
          dbPath,
          shot,
          mockLog: async (): Promise<LoggedRequest[]> => (await fetch(`${mockBase}/__log`)).json(),
          isPending: (id) => Boolean(pending[id]) && !includePending,
          note: (message) => notes.push(message),
        })
        results.push({ id: scenario.id, status: 'pass', detail: notes.join('; ') })
        console.info(`✓ PASS ${scenario.id} (${((Date.now() - started) / 1000).toFixed(1)}s)${notes.length ? ` — ${notes.join('; ')}` : ''}`)
      } catch (error) {
        await shot('failure').catch(() => undefined)
        await Bun.write(join(artifactsDir, scenario.id, 'mock-log.json'), JSON.stringify(await (await fetch(`${mockBase}/__log`)).json(), null, 2))
        results.push({ id: scenario.id, status: 'fail', detail: String(error) })
        console.error(`✗ FAIL ${scenario.id}: ${String(error)}`)
      } finally {
        await browserContext.close()
        await stopServer()
      }
    }
  } finally {
    await browser?.close()
    stopWeb()
    mocks.stop()
    await rm(workDir, { recursive: true, force: true })
  }
  await Bun.write(join(artifactsDir, 'results.json'), JSON.stringify(results, null, 2))
  const failed = results.filter((result) => result.status === 'fail').length
  const passed = results.filter((result) => result.status === 'pass').length
  const skipped = results.filter((result) => result.status === 'pending').length
  console.info(`\n${passed} passed, ${failed} failed, ${skipped} pending. Screenshots: ${artifactsDir}`)
  return failed || passed === 0 ? 1 : 0
}

process.exit(await main())
