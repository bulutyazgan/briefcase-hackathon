// P10: the only Treg catalogue endpoints Tally may buy from.
// Prices from https://treg.to/catalog/endpoints/<id> (checked 2026-10-15):
//   apollo.people.search    free (0 credits, no contact data returned)
//   apollo.companies.search 1 credit per page ≈ $0.026
//   apollo.companies.news   1 credit per page ≈ $0.026
// `maxCostMicro` is the per-call ceiling code sends as X-Treg-Route-Max-Cost (P9), set a little
// above the listed price so a small repricing does not block the call.
// Not allowlisted: apollo.companies.jobs (needs an Apollo organization id path param first).

export type TregEndpointKind = 'people' | 'company' | 'signal'

export interface TregEndpoint {
  id: string
  provider: string
  kind: TregEndpointKind
  description: string
  listedCostMicro: number
  maxCostMicro: number
}

export const tregAllowlist = [
  {
    id: 'apollo.people.search',
    provider: 'apollo',
    kind: 'people',
    description: 'People by job title, seniority, location, company domain or size. Params: person_titles[], person_seniorities[], person_locations[], organization_locations[], q_organization_domains_list[], organization_num_employees_ranges[] ("min,max"), per_page.',
    listedCostMicro: 0,
    maxCostMicro: 10_000,
  },
  {
    id: 'apollo.companies.search',
    provider: 'apollo',
    kind: 'company',
    description: 'Companies by location, size, funding or tech. Params: organization_locations[], organization_num_employees_ranges[], q_organization_domains_list[], currently_using_any_of_technology_uids[], per_page.',
    listedCostMicro: 26_000,
    maxCostMicro: 40_000,
  },
  {
    id: 'apollo.companies.news',
    provider: 'apollo',
    kind: 'signal',
    description: 'Buying signals: company news (funding, hires, launches). Params: organization_ids[], categories[], published_at[min], per_page.',
    listedCostMicro: 26_000,
    maxCostMicro: 40_000,
  },
] as const satisfies readonly TregEndpoint[]

export type TregEndpointId = (typeof tregAllowlist)[number]['id']

export function findAllowedEndpoint(endpointId: string): TregEndpoint | null {
  return tregAllowlist.find((endpoint) => endpoint.id === endpointId) ?? null
}
