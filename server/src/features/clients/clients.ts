// Client list. P5: a client is known only if it is seeded here or was onboarded in
// conversation into the ledger `clients` table (P12). P2: each client's price lives here.
import { listClients } from '../ledger/store'

export interface Client {
  name: string
  // Lowercase words that identify the client in a message author or extracted name.
  aliases: string[]
  pricePerLeadPence: number
  billingEmail: string
  accountOwner: string
  // 'seed' clients carry remembered deals; 'intake' clients were onboarded at the standard price list.
  source: 'seed' | 'intake'
}

export const CLIENTS: readonly Client[] = [
  {
    name: 'Louis',
    source: 'seed',
    aliases: ['louis'],
    pricePerLeadPence: 400,
    billingEmail: process.env.DEMO_BILLING_EMAIL ?? 'louis@example.com',
    accountOwner: 'Bulut',
  },
  {
    name: 'Northwind Capital',
    aliases: ['northwind'],
    pricePerLeadPence: 400,
    billingEmail: 'billing+northwind@example.com',
    accountOwner: 'Bulut',
    source: 'seed',
  },
  {
    name: 'Acme Ventures',
    aliases: ['acme'],
    pricePerLeadPence: 500,
    billingEmail: 'billing+acme@example.com',
    accountOwner: 'Bulut',
    source: 'seed',
  },
  {
    name: 'Globex Partners',
    aliases: ['globex'],
    pricePerLeadPence: 400,
    billingEmail: 'billing+globex@example.com',
    accountOwner: 'Bulut',
    source: 'seed',
  },
]

function words(value: string): string[] {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
}

function onboardedClients(): Client[] {
  return listClients().map((row) => {
    let aliases: string[] = []
    try {
      const parsed: unknown = JSON.parse(row.aliases_json)
      if (Array.isArray(parsed)) aliases = parsed.filter((alias): alias is string => typeof alias === 'string')
    } catch {
      aliases = []
    }
    return {
      name: row.name,
      aliases,
      pricePerLeadPence: row.price_per_lead_pence,
      billingEmail: row.billing_email,
      accountOwner: row.account_owner,
      source: 'intake',
    }
  })
}

export function allClients(): Client[] {
  return [...CLIENTS, ...onboardedClients()]
}

export function findClient(name: string): Client | null {
  const nameWords = words(name)
  if (!nameWords.length) return null
  return allClients().find((client) =>
    client.name.toLowerCase() === name.trim().toLowerCase()
    || client.aliases.some((alias) => nameWords.includes(alias)),
  ) ?? null
}
