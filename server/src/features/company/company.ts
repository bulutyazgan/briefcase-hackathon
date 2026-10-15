import { readFileSync } from 'node:fs'
import { listEventsByStep, recordEvent } from '../ledger/store'
import { searchCogneeDataset, storeInCogneeDataset } from '../memory/memory'

const COMPANY_NAME = 'Brightline Studio'
export const COMPANY_DATASET = 'company-profile'
const COMPANY_MARKDOWN = new URL('../../../seed/company.md', import.meta.url)
const LEARN_SUMMARY = 'Learned Brightline Studio into Cognee (dataset company-profile).'

type LearnResult = { stored: 'cognee' | 'file' }

let learning: Promise<LearnResult> | null = null

export function readCompanyKnowledge(): string {
  return readFileSync(COMPANY_MARKDOWN, 'utf8')
}

export function learnCompany(): Promise<LearnResult> {
  if (learning) return learning
  learning = (async () => {
    let stored: LearnResult['stored'] = 'file'
    try {
      if (await storeInCogneeDataset(COMPANY_DATASET, readCompanyKnowledge())) stored = 'cognee'
    } catch {
      stored = 'file'
    }
    recordEvent({
      id: crypto.randomUUID(),
      message_id: 'company',
      step: 'company_learned',
      summary: LEARN_SUMMARY,
      data_json: JSON.stringify({ stored }),
      policy_clause: null,
    })
    return { stored }
  })().finally(() => {
    learning = null
  })
  return learning
}

export async function companyStatus(): Promise<{
  name: string
  markdown: string
  dataset: string
  learnedAt: string | null
  cogneeHits: string[]
  stored: 'cognee' | 'file'
}> {
  let cogneeHits: string[] = []
  let stored: 'cognee' | 'file' = 'file'
  try {
    const hits = await searchCogneeDataset(COMPANY_DATASET, 'services, prices and terms', {
      topK: 5,
      timeoutMs: 4000,
    })
    if (hits !== null) {
      cogneeHits = hits
      stored = 'cognee'
    }
  } catch {
    stored = 'file'
  }
  return {
    name: COMPANY_NAME,
    markdown: readCompanyKnowledge(),
    dataset: COMPANY_DATASET,
    learnedAt: listEventsByStep('company_learned').at(-1)?.created_at ?? null,
    cogneeHits,
    stored,
  }
}
