import { useEffect, useState } from 'react'
import { isReadOnlyMode } from '../../app-state'
import { Button } from '../../components/ui/button'
import { Opening, Page, Section } from '../../components/ui/page'
import { SkeletonBar, SkeletonSwap } from '../../components/ui/skeleton'
import { StatStrip } from '../../components/ui/stat-strip'
import { Text } from '../../components/ui/text'

interface CompanyStatus {
  name: string
  markdown: string
  dataset: string
  learnedAt: string | null
  cogneeHits?: string[]
  stored?: 'cognee' | 'file'
}

function isCompanyStatus(value: unknown): value is CompanyStatus {
  return typeof value === 'object' && value !== null && 'markdown' in value && typeof value.markdown === 'string' && 'name' in value && typeof value.name === 'string'
}

async function requestCompany(method: 'GET' | 'POST'): Promise<CompanyStatus> {
  if (method === 'POST' && isReadOnlyMode()) throw new Error('This demo is read-only.')
  const response = await fetch(method === 'GET' ? '/api/company' : '/api/company/learn', { method })
  const body: unknown = await response.json()
  if (!response.ok || !isCompanyStatus(body)) throw new Error('Company data is not available.')
  return body
}

function sectionsOf(markdown: string): { title: string; lines: string[] }[] {
  return markdown.split(/\n(?=## )/).slice(1).map((block) => {
    const [heading = '', ...rest] = block.split('\n')
    return { title: heading.replace(/^##\s*/, ''), lines: rest.map((line) => line.replace(/^-\s*/, '').trim()).filter(Boolean) }
  })
}

export function Company({ readOnly }: { readOnly: boolean }) {
  const [status, setStatus] = useState<CompanyStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [learning, setLearning] = useState(false)

  useEffect(() => {
    requestCompany('GET').then(setStatus, (cause: unknown) => setError(cause instanceof Error ? cause.message : 'Company data is not available.'))
  }, [])

  async function learn() {
    if (readOnly) return
    setLearning(true)
    try {
      setStatus(await requestCompany('POST'))
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Learning failed.')
    } finally {
      setLearning(false)
    }
  }

  const sections = status ? sectionsOf(status.markdown) : []
  const hits = status?.cogneeHits ?? []
  return (
    <Page>
      <Opening
        title={status?.name ?? 'Company'}
        lede="What Tally knows about the business it sells for. Onboarded once, held in Cognee, recalled in every client chat."
        tools={readOnly ? undefined : <Button onClick={learn} disabled={learning}>{learning ? 'Learning…' : 'Re-learn into Cognee'}</Button>}
      />
      <StatStrip items={[
        { label: 'Memory', value: status ? `Cognee · ${status.dataset}` : '—' },
        { label: 'Last learned', value: status?.learnedAt ? new Date(status.learnedAt).toLocaleString('en-GB') : 'Not yet', mono: true },
        { label: 'Live Cognee hits', value: hits.length, mono: true },
      ]} />
      {error ? <Text role="compact">{error}</Text> : null}
      <SkeletonSwap loading={!status && !error} skeleton={<Section title="Loading company"><SkeletonBar width="lg" /><SkeletonBar width="md" /><SkeletonBar width="sm" /></Section>}>
        {sections.map((section) => (
          <Section key={section.title} title={section.title}>
            {section.lines.map((line) => <Text key={line}>{line}</Text>)}
          </Section>
        ))}
        <Section title="Recalled from Cognee" description="A live search of the company dataset, the same recall Tally uses in chat">
          {hits.length > 0 ? hits.map((hit, index) => <Text key={`${index}-${hit.slice(0, 24)}`} role="compact">{hit}</Text>) : <Text role="compact">No live Cognee results yet. Tally uses the onboarded file until Cognee answers.</Text>}
        </Section>
      </SkeletonSwap>
    </Page>
  )
}
