// Read-only: is the running Tally verification stack worth driving?
import { join } from 'node:path'
import { apiBase, artifactsDir, chromePath, healthy, mockBase, webBase } from './support/stack'

const checks: [string, boolean, string][] = []
const stackFile = Bun.file(join(artifactsDir, 'stack', 'stack.json'))
const owned = await stackFile.exists()
checks.push(['stack started by e2e/stack.ts', owned, owned ? await stackFile.text().then((text) => text.replace(/\s+/g, ' ')) : 'no e2e/artifacts/stack/stack.json'])
checks.push(['mock providers', await healthy(`${mockBase}/__health`), mockBase])
checks.push(['api /health', await healthy(`${apiBase}/health`), apiBase])
checks.push(['web', await healthy(webBase), webBase])
checks.push(['web proxies /api', await healthy(`${webBase}/api/state`), `${webBase}/api/state`])
const control: unknown = await fetch(`${apiBase}/api/control`).then((response) => response.json()).catch(() => null)
const keyMode = control && typeof control === 'object' && 'keyMode' in control ? String(control.keyMode) : 'unknown'
checks.push(['Stripe key is a test key', keyMode === 'secret' || keyMode === 'restricted', `keyMode=${keyMode}`])
checks.push(['chromium present', await Bun.file(chromePath).exists(), chromePath])

let ok = true
for (const [name, pass, detail] of checks) {
  ok &&= pass
  console.info(`${pass ? 'ok  ' : 'FAIL'} ${name} — ${detail}`)
}
process.exit(ok ? 0 : 1)
