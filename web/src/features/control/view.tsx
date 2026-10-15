import * as stylex from '@stylexjs/stylex'
import { Section } from '../../components/ui/page'
import { Text } from '../../components/ui/text'
import { content } from '../../components/ui/content.stylex'
import { keyModeLabel } from './api'
import { styles } from './control.stylex'
import { useControlStatus } from './use-control-status'

export function Control() {
  const { status, error } = useControlStatus()
  const pill = status
    ? <span role="status" {...stylex.props(content.status)}>{status.paused ? 'Paused · kill switch on' : 'Active'}</span>
    : null

  return (
    <Section title="Guardrails" description="A restricted Stripe key and a kill switch bound what the agent can do" tools={pill}>
      <div {...stylex.props(content.card, content.stack)}>
        {error ? <p role="alert" {...stylex.props(content.error)}>{error}</p> : null}
        {status ? (
          <>
            <div {...stylex.props(content.evidenceGrid)}>
              <div {...stylex.props(content.evidence)}>
                <Text role="label">Stripe key</Text>
                <Text role="compact">{keyModeLabel[status.keyMode]}</Text>
              </div>
              <div {...stylex.props(content.evidence)}>
                <Text role="label">Restricted key scopes</Text>
                <ul aria-label="Restricted key scopes" {...stylex.props(content.clauseList, styles.scopes)}>
                  {status.scopes.map((scope) => <li key={scope.resource} {...stylex.props(content.tag)}>{scope.resource} · {scope.access}</li>)}
                </ul>
              </div>
            </div>
            <Text role="body">Even a prompt-injected agent cannot refund, pay out or create charges.</Text>
            <Text role="compact">Send /pause in any channel to stop billing and sourcing. Only the account owner can /resume.</Text>
          </>
        ) : null}
      </div>
    </Section>
  )
}
