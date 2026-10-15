// Seeded client list. P5: a client is known only if it is in this list.
// P2: each client's price list lives here and nowhere else.

export interface Client {
  name: string
  // Lowercase words that identify the client in a message author or extracted name.
  aliases: string[]
  pricePerLeadPence: number
  billingEmail: string
  accountOwner: string
}

export const CLIENTS: readonly Client[] = [
  {
    name: 'Northwind Capital',
    aliases: ['northwind'],
    pricePerLeadPence: 400,
    billingEmail: 'billing+northwind@example.com',
    accountOwner: 'Bulut',
  },
  {
    name: 'Acme Ventures',
    aliases: ['acme'],
    pricePerLeadPence: 500,
    billingEmail: 'billing+acme@example.com',
    accountOwner: 'Bulut',
  },
  {
    name: 'Globex Partners',
    aliases: ['globex'],
    pricePerLeadPence: 400,
    billingEmail: 'billing+globex@example.com',
    accountOwner: 'Bulut',
  },
]

function words(value: string): string[] {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
}

export function findClient(name: string): Client | null {
  const nameWords = words(name)
  if (!nameWords.length) return null
  return CLIENTS.find((client) =>
    client.name.toLowerCase() === name.trim().toLowerCase()
    || client.aliases.some((alias) => nameWords.includes(alias)),
  ) ?? null
}
