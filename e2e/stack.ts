// Starts mocks + seeded server + web and keeps them up for manual or agent driving.
// Ready when it prints "TALLY STACK READY". Ctrl-C (SIGINT/SIGTERM) tears down
// everything it started; evidence in e2e/artifacts/stack/ is kept.
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startMockProviders } from './mock-providers/server'
import { waitFor } from './support/harness'
import { apiBase, apiPort, artifactsDir, healthy, mockBase, mockPort, seedCogneeFromProductSeed, startServer, startWeb, webBase } from './support/stack'

if (await healthy(`${apiBase}/health`)) {
  console.error(`Port ${apiPort} already serves an API that this run did not start. Stop it first.`)
  process.exit(2)
}
const logDir = join(artifactsDir, 'stack')
await mkdir(logDir, { recursive: true })
const workDir = await mkdtemp(join(tmpdir(), 'tally-stack-'))
const dbPath = join(workDir, 'tally.db')
const mocks = startMockProviders(mockPort)
await seedCogneeFromProductSeed()
const stopServer = await startServer(dbPath, join(logDir, 'server.log'))
const stopWeb = startWeb(logDir)
await waitFor('web dev server', async () => healthy(webBase), 30000)
await Bun.write(join(logDir, 'stack.json'), JSON.stringify({ pid: process.pid, web: webBase, api: apiBase, mock: mockBase, dbPath }, null, 2))
console.info(`TALLY STACK READY web=${webBase} api=${apiBase} mock=${mockBase} db=${dbPath} pid=${process.pid}`)

let stopping = false
async function shutdown(): Promise<void> {
  if (stopping) return
  stopping = true
  stopWeb()
  await stopServer()
  mocks.stop()
  await rm(workDir, { recursive: true, force: true })
  await rm(join(logDir, 'stack.json'), { force: true })
  console.info('Tally stack stopped.')
  process.exit(0)
}
process.on('SIGINT', () => void shutdown())
process.on('SIGTERM', () => void shutdown())
