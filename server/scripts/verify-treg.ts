// One real, cheap Treg call: apollo.people.search is listed free on the catalogue.
// Run from server/: TREG_TOKEN=... bun scripts/verify-treg.ts
import { createTregSourcer } from '../src/features/leads/providers/treg/treg-sourcer'
import { fallbackProposal } from '../src/features/leads/providers/treg/treg-proposer'

if (!process.env.TREG_TOKEN) {
  console.error('TREG_TOKEN is not set. Add it to the environment and rerun: bun scripts/verify-treg.ts')
  process.exit(1)
}

const source = createTregSourcer({ propose: async (request) => fallbackProposal(request) })
const result = await source({
  orderId: 'verify-treg',
  icp: 'Head of Marketing at fintech',
  signals: [],
  quantity: 3,
  maxTotalCostMicro: 50_000,
})

for (const call of result.calls) {
  console.log(`${call.accepted ? 'accepted' : 'rejected'} ${call.endpointId} cost=${call.costMicro}µUSD ${call.reason}`)
}
console.log(`leads=${result.leads.length} totalCostMicro=${result.costMicro}`)
for (const lead of result.leads) console.log(`- ${lead.name} @ ${lead.company} (${lead.url})`)
if (!result.calls.some((call) => call.accepted)) process.exit(1)
