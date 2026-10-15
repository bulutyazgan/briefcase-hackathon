import * as stylex from '@stylexjs/stylex'
import { styles } from './landing.stylex'

const REPO_URL = 'https://github.com/cf0-enterprise/briefcase-hackathon'

const STEPS = [
  { title: 'Hears the yes', body: 'Tally reads client threads in Slack and email. It acts only on a clear commitment, and it keeps the exact quote.' },
  { title: 'Remembers the deal', body: 'Client memory holds what each client agreed, promised and disputed. "Same deal as last time" means something.' },
  { title: 'Decides in code', body: 'Rate card, discount cap and approval limit are policy, not prompts. The model never picks a price.' },
  { title: 'Bills in Stripe', body: 'A real invoice, a PDF with the evidence attached, and delivery of the work as soon as it is paid.' },
]

const POLICY = [
  ['P1', 'Bill only from an explicit client commitment.'],
  ['P2', 'Prices come from the rate card only.'],
  ['P3', 'Discounts only if remembered as agreed, never above 15%.'],
  ['P4', 'Auto-send up to £1,000. Above that, one approval.'],
  ['P5', 'Known clients only. Unknown means ask, not bill.'],
  ['P6', 'One invoice per commitment.'],
  ['P7', 'Never chase a disputed line.'],
] as const

const CHANNELS = ['Slack', 'Email', 'Stripe', 'Memory', 'Web research', 'Simulator']

export function Landing() {
  return (
    <div {...stylex.props(styles.root)}>
      <section {...stylex.props(styles.hero)}>
        <div aria-hidden="true" {...stylex.props(styles.heroGlow)} />
        <nav {...stylex.props(styles.nav)}>
          <span {...stylex.props(styles.navBrand)}>
            <span aria-hidden="true" {...stylex.props(styles.navDot)} />
            tally
          </span>
          <span {...stylex.props(styles.navLinks)}>
            <a href="#how" {...stylex.props(styles.navLink)}>How it works</a>
            <a href="#policy" {...stylex.props(styles.navLink)}>Policy</a>
          </span>
          <a href="/app" {...stylex.props(styles.navCta)}>Open Tally</a>
        </nav>

        <div {...stylex.props(styles.heroGrid)}>
          <div>
            <h1 {...stylex.props(styles.heroTitle)}>
              Meet Tally,
              <br />
              the agent that bills what clients already agreed.
            </h1>
            <p {...stylex.props(styles.heroLede)}>
              Work gets agreed in chat and never invoiced. Tally hears the yes, prices it by your policy and raises the Stripe invoice, with every pound explained.
            </p>
            <div {...stylex.props(styles.heroActions)}>
              <a href="/app" {...stylex.props(styles.pillLight)}>See it bill</a>
              <a href={REPO_URL} {...stylex.props(styles.pillGlass)}>Read the code</a>
            </div>
          </div>

          <div {...stylex.props(styles.glassCard)}>
            <p {...stylex.props(styles.cardLabel)}>#northwind-campaigns</p>
            <div {...stylex.props(styles.bubble)}>
              <span {...stylex.props(styles.bubbleAuthor)}>Priya · Northwind</span>
              Let's kick off Q4. 300 fintech CFO leads in London, same deal as last time.
            </div>
            <div {...stylex.props(styles.bubble, styles.bubbleTally)}>
              <span {...stylex.props(styles.bubbleAuthor)}>Tally</span>
              300 leads × £4, less the 10% agreed on 12 Aug. Invoice £1,080 is ready. It needs one approval under P4.
            </div>
            <div {...stylex.props(styles.invoiceChip)}>
              <span>INV-0042 · Stripe</span>
              <span {...stylex.props(styles.invoiceAmount)}>£1,080.00</span>
            </div>
          </div>
        </div>
      </section>

      <main {...stylex.props(styles.main)}>
        <section id="how" {...stylex.props(styles.section)}>
          <h2 {...stylex.props(styles.sectionTitle)}>Tally hears it, prices it, bills it, and shows its work.</h2>
          <div {...stylex.props(styles.steps)}>
            {STEPS.map((step, index) => (
              <article key={step.title} {...stylex.props(styles.step)}>
                <span {...stylex.props(styles.stepIndex)}>0{index + 1}</span>
                <h3 {...stylex.props(styles.stepTitle)}>{step.title}</h3>
                <p {...stylex.props(styles.stepBody)}>{step.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section {...stylex.props(styles.section)}>
          <div {...stylex.props(styles.panel)}>
            <div>
              <h2 {...stylex.props(styles.sectionTitle)}>Every pound explained.</h2>
              <p {...stylex.props(styles.panelBody)}>
                Ask "why did you bill £1,080?" in any channel. Tally answers from its ledger: the client's words, the remembered deal, and the policy clause it relied on.
              </p>
            </div>
            <div {...stylex.props(styles.evidence)}>
              <div {...stylex.props(styles.evidenceRow)}>
                <span {...stylex.props(styles.evidenceKey)}>Quote</span>
                <span>"300 fintech CFO leads in London, same deal as last time."</span>
              </div>
              <div {...stylex.props(styles.evidenceRow)}>
                <span {...stylex.props(styles.evidenceKey)}>Memory</span>
                <span>2026-08-12 · agreed 10% off orders over 200 leads</span>
              </div>
              <div {...stylex.props(styles.evidenceRow)}>
                <span {...stylex.props(styles.evidenceKey)}>Policy</span>
                <span {...stylex.props(styles.clauses)}>
                  {['P1', 'P2', 'P3', 'P4'].map((clause) => (
                    <span key={clause} {...stylex.props(styles.clause)}>{clause}</span>
                  ))}
                </span>
              </div>
              <div {...stylex.props(styles.evidenceRow)}>
                <span {...stylex.props(styles.evidenceKey)}>Amount</span>
                <span {...stylex.props(styles.mono)}>300 × £4.00 − 10% = £1,080.00</span>
              </div>
            </div>
          </div>
        </section>

        <section id="policy" {...stylex.props(styles.section, styles.split)}>
          <h2 {...stylex.props(styles.sectionTitle)}>Autonomy, inside a written policy.</h2>
          <ol {...stylex.props(styles.policyList)}>
            {POLICY.map(([id, text]) => (
              <li key={id} {...stylex.props(styles.policyItem)}>
                <span {...stylex.props(styles.clause)}>{id}</span>
                <span>{text}</span>
              </li>
            ))}
          </ol>
        </section>

        <section {...stylex.props(styles.section, styles.split)}>
          <h2 {...stylex.props(styles.sectionTitle)}>Tally works where your clients talk.</h2>
          <div {...stylex.props(styles.channels)}>
            {CHANNELS.map((channel) => (
              <span key={channel} {...stylex.props(styles.channel)}>{channel}</span>
            ))}
          </div>
        </section>

        <section {...stylex.props(styles.closing)}>
          <h2 {...stylex.props(styles.closingTitle)}>Stop leaving agreed work unbilled.</h2>
          <div {...stylex.props(styles.heroActions, styles.closingActions)}>
            <a href="/app" {...stylex.props(styles.pillDark)}>Open Tally</a>
            <a href={REPO_URL} {...stylex.props(styles.pillOutline)}>GitHub</a>
          </div>
        </section>
      </main>

      <footer {...stylex.props(styles.footer)}>
        <span>Tally · Stripe x Briefcase AI FinTech Hackathon, London 2026</span>
        <span>Stripe test mode only. No real money moves.</span>
      </footer>
    </div>
  )
}
