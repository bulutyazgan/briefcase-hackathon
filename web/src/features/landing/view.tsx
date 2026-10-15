import { useEffect, useState } from 'react'
import * as stylex from '@stylexjs/stylex'
import { Button, ButtonLink } from '../../components/ui/button'
import { GitHubLogo } from '../../components/ui/github-logo'
import { Closing, Page, Opening, Section } from '../../components/ui/page'
import { StatStrip } from '../../components/ui/stat-strip'
import { Text } from '../../components/ui/text'
import { content } from '../../components/ui/content.stylex'
import { TallyLogo } from '../../components/ui/tally-logo'
import { Link, navigate } from '../../router'
import { styles } from './landing.stylex'

const steps = [
  ['01', 'Hear the commitment', 'Read the client’s words and keep the exact quote as evidence.'],
  ['02', 'Recall the agreement', 'Use dated client facts to apply remembered rates, terms and discounts.'],
  ['03', 'Check the policy', 'Code decides the price, approval path and whether the commitment can be billed.'],
  ['04', 'Collect and deliver', 'Create a Stripe invoice, then deliver the work when payment is confirmed.'],
] as const

const clauses = [
  ['P1', 'Bill only from explicit client commitments.'],
  ['P2', 'Use the rate card for every price.'],
  ['P3', 'Apply only remembered discounts, up to 15%.'],
  ['P4', 'Request approval above £1,000.'],
  ['P5', 'Bill known clients only.'],
  ['P6', 'Create one invoice per commitment.'],
  ['P7', 'Limit reminders and respect disputes.'],
] as const

// The demo film plays in a dialog under the title: the fastest way to see what the agent does.
function DemoDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div {...stylex.props(styles.demoBackdrop)} onClick={onClose} role="presentation">
      <div {...stylex.props(styles.demoDialog)} role="dialog" aria-modal="true" aria-label="How Tally works" onClick={(event) => event.stopPropagation()}>
        <div {...stylex.props(styles.demoHeader)}>
          <Text role="heading16">Said. Done. Billed. A client's chat message becomes a correct invoice, in 75 seconds</Text>
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
        <video {...stylex.props(styles.demoVideo)} poster="/demo/tally-demo-poster.png" controls autoPlay playsInline>
          <source src="/demo/tally-demo.webm" type="video/webm" />
          <source src="/demo/tally-demo.mp4" type="video/mp4" />
        </video>
      </div>
    </div>
  )
}

export function Landing() {
  const [demoOpen, setDemoOpen] = useState(false)
  return (
    <div {...stylex.props(styles.root)}>
      <nav aria-label="Site navigation" {...stylex.props(styles.nav)}>
        <Link to="/" {...stylex.props(styles.brand)}><TallyLogo size={20} />Tally</Link>
        <div {...stylex.props(styles.links)}><a href="#how" {...stylex.props(styles.navLink)}>How it works</a><a href="#policy" {...stylex.props(styles.navLink)}>Policy</a><Link to="/app/inbox" {...stylex.props(content.link)}>Open the inbox</Link><ButtonLink variant="secondary" href="https://github.com/lnv-louis/tally" target="_blank" rel="noreferrer"><GitHubLogo size={16} />See on GitHub</ButtonLink></div>
      </nav>
      <div {...stylex.props(styles.content)}>
        <Page>
          <div {...stylex.props(styles.hero)}>
            <Opening title="PostHog for finance and customer service." lede="Remove the paperwork between yes and paid. One agent in the client chat onboards, sells, invoices and follows up, and every pound is explained." tools={<><Button variant="primary" onClick={() => setDemoOpen(true)}>See how it works</Button><Button variant="secondary" onClick={() => navigate('/app/inbox')}>Explore Tally</Button></>} />
            <div {...stylex.props(styles.heroCard)}>
              <Text role="label">A client commitment</Text>
              <div {...stylex.props(styles.message)}>“Let’s kick off Q4. 300 fintech CFO leads in London, same deal as last time.”</div>
              <div {...stylex.props(styles.reply)}>300 leads at £4 each, less the remembered 10% discount. £1,080 is ready for approval under P4.</div>
              <div {...stylex.props(content.row)}><Text role="compact">Stripe invoice</Text><span {...stylex.props(styles.money)}>£1,080.00</span></div>
            </div>
          </div>
          <StatStrip items={[
            { label: 'Policy clauses', value: '7', mono: true },
            { label: 'Lead rate', value: '£4', mono: true },
            { label: 'Approval limit', value: '£1,000', mono: true },
          ]} />
          <Section title="From a client message to a paid invoice" description="A clear path from agreement to delivery" >
            <div id="how" {...stylex.props(styles.steps)}>{steps.map(([number, title, body]) => <article key={number} {...stylex.props(styles.step)}><span {...stylex.props(styles.stepNumber)}>{number}</span><Text role="heading16" as="h3">{title}</Text><Text role="compact">{body}</Text></article>)}</div>
          </Section>
          <Section title="Every amount has a source" description="The invoice carries the evidence behind its total">
            <div {...stylex.props(content.card)}>
              <div {...stylex.props(styles.evidence)}><Text role="label">Client quote</Text><Text role="compact">300 fintech CFO leads in London</Text></div>
              <div {...stylex.props(styles.evidence)}><Text role="label">Memory</Text><Text role="compact">Agreed 10% off orders over 200 leads</Text></div>
              <div {...stylex.props(styles.evidence)}><Text role="label">Arithmetic</Text><span {...stylex.props(styles.money)}>300 × £4.00 − 10% = £1,080.00</span></div>
              <div {...stylex.props(styles.evidence)}><Text role="label">Policy</Text><Text role="compact">P1, P2, P3 and P4</Text></div>
            </div>
          </Section>
          <Section title="Autonomy inside a written policy" description="Billing decisions follow seven rules">
            <div id="policy" {...stylex.props(styles.policyGrid)}>{clauses.map(([id, clause]) => <div key={id} {...stylex.props(styles.policyItem)}><span {...stylex.props(content.clause)}>{id}</span><Text role="compact">{clause}</Text></div>)}</div>
          </Section>
          <Closing>Every invoice keeps the client’s words, the remembered agreement and the policy decision together.</Closing>
        </Page>
      </div>
      {demoOpen && <DemoDialog onClose={() => setDemoOpen(false)} />}
    </div>
  )
}
