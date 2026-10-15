import * as stylex from '@stylexjs/stylex'
import { useEffect, useState } from 'react'
import { fetchOpportunities, type OpportunityEvidence, type OpportunityView } from './api'
import { styles } from './opportunities.stylex'

type Column = 'Spotted' | 'Offered' | 'Accepted' | 'Billed'

const columns: Column[] = ['Spotted', 'Offered', 'Accepted', 'Billed']

function columnFor(opportunity: OpportunityView): Column | null {
  if (opportunity.invoiceId) return 'Billed'
  if (opportunity.status === 'accepted') return 'Accepted'
  if (opportunity.status === 'offered') return 'Offered'
  if (opportunity.status === 'spotted') return 'Spotted'
  return null
}

function formatMoney(amountPence: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amountPence / 100)
}

function evidenceText(evidence: OpportunityEvidence): string {
  if (evidence.kind === 'cadence') return `Memory: “${evidence.facts.join('; ')}” (${evidence.daysSince} days ago)`
  if (evidence.kind === 'channel') return `Channel: “${evidence.quote}”`
  return `Signal: ${evidence.count} target accounts with funding news this month`
}

function Card({ opportunity }: { opportunity: OpportunityView }) {
  const clauses = [...new Set([...opportunity.clauses, ...opportunity.gateEvents.map((event) => event.clause)])].filter(Boolean)
  return (
    <article {...stylex.props(styles.card)} aria-label={`Opportunity ${opportunity.id}`}>
      <p {...stylex.props(styles.client)}>{opportunity.clientName}</p>
      <p {...stylex.props(styles.amount)}>{formatMoney(opportunity.pricePence)}</p>
      <p {...stylex.props(styles.rationale)}>{opportunity.quantity} {opportunity.service}: {opportunity.rationale}</p>
      <p {...stylex.props(styles.evidence)}>{evidenceText(opportunity.evidence)}</p>
      <div {...stylex.props(styles.clauses)}>
        {clauses.map((clause) => <span key={clause} {...stylex.props(styles.clause)}>{clause}</span>)}
      </div>
      <p {...stylex.props(styles.meta)}>
        {opportunity.id}{opportunity.invoiceId ? ` · invoice ${opportunity.invoiceId}` : ''}
        {opportunity.status === 'offered' && opportunity.expiresAt ? ` · expires ${opportunity.expiresAt.slice(0, 10)}` : ''}
      </p>
    </article>
  )
}

export function Opportunities() {
  const [opportunities, setOpportunities] = useState<OpportunityView[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const next = await fetchOpportunities()
        if (active) {
          setOpportunities(next)
          setError('')
        }
      } catch (loadError) {
        if (active) setError(String(loadError))
      }
    }
    void load()
    const timer = window.setInterval(() => void load(), 2000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [])

  const closed = opportunities.filter((opportunity) => columnFor(opportunity) === null)
  return (
    <div>
      {error && <p role="alert">{error}</p>}
      <div {...stylex.props(styles.board)}>
        {columns.map((column) => {
          const cards = opportunities.filter((opportunity) => columnFor(opportunity) === column)
          return (
            <section key={column} {...stylex.props(styles.column)} aria-label={`${column} opportunities`}>
              <h2 {...stylex.props(styles.columnTitle)}>
                <span>{column}</span>
                <span {...stylex.props(styles.count)}>{cards.length}</span>
              </h2>
              {cards.length
                ? cards.map((opportunity) => <Card key={opportunity.id} opportunity={opportunity} />)
                : <p {...stylex.props(styles.empty)}>Nothing here yet.</p>}
            </section>
          )
        })}
      </div>
      {closed.length > 0 && (
        <p {...stylex.props(styles.meta)}>
          Closed: {closed.map((opportunity) => `${opportunity.id} (${opportunity.status})`).join(', ')}
        </p>
      )}
    </div>
  )
}
