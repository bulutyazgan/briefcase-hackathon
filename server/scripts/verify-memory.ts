// Live check against Cognee Cloud: adds one role-tagged fact and searches it back.
// Usage (from server/): COGNEE_API_KEY=... COGNEE_BASE_URL=... bun scripts/verify-memory.ts
import { recall, remember } from '../src/features/memory/memory'
import { cogneeConfigFromEnv, createCogneeClient } from '../src/features/memory/providers/cognee'

const config = cogneeConfigFromEnv()
if (!config) {
  console.info('COGNEE_API_KEY and COGNEE_BASE_URL must both be set to verify Cognee. Tally is using local seed memory.')
  process.exit(0)
}

const cognee = createCogneeClient(config)
const marker = `verify-${Date.now()}`
const written = await remember('Northwind Capital', 'collections', `Verification fact ${marker}`, marker, { cognee })
console.info('Added:', written)

const raw = await cognee.search('northwind-capital', `Verification fact ${marker}`)
console.info('Raw search strings:', raw.slice(0, 5))

const facts = await recall('Northwind Capital', `Verification fact ${marker}`, 'collections', { cognee })
console.info('Recalled collections facts:', facts)
const found = raw.some((text) => text.includes(marker))
console.info(found
  ? 'OK: fact found in Cognee search results.'
  : 'Fact not yet visible in Cognee search (cognify runs in the background); retry shortly.')
