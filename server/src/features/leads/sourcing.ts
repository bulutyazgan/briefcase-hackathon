import type { Lead } from './leads'

// Contract between the agent loop and whoever sources leads (Treg, Firecrawl, seed).
// The loop decides and approves first, then calls a Sourcer, then bills exactly `leads.length`.

export interface SourcedLead extends Lead {
  id: string
  // Internal only: never shown to the client (invoice, PDF, channel replies).
  provider: string
  costMicro: number
}

export interface SourcingRequest {
  orderId: string
  icp: string
  signals: string[]
  quantity: number
  // P9: total sourcing spend cap for the order, in micro-USD (Treg's unit).
  maxTotalCostMicro: number
}

export interface SourcingCall {
  endpointId: string
  accepted: boolean
  reason: string
  costMicro: number
  clauses: string[]
}

export interface SourcingResult {
  leads: SourcedLead[]
  costMicro: number
  calls: SourcingCall[]
  source: 'treg' | 'firecrawl' | 'seed'
}

export type Sourcer = (request: SourcingRequest) => Promise<SourcingResult>
