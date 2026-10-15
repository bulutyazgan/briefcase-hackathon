import { useEffect, useState } from 'react'
import * as stylex from '@stylexjs/stylex'
import { fetchControlStatus, keyModeLabel, type ControlStatus } from './api'
import { styles } from './control.stylex'

export function Control() {
  const [status, setStatus] = useState<ControlStatus | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    const load = () => {
      fetchControlStatus()
        .then((next) => { if (alive) { setStatus(next); setError('') } })
        .catch((reason: unknown) => { if (alive) setError(String(reason)) })
    }
    load()
    const timer = setInterval(load, 3000)
    return () => { alive = false; clearInterval(timer) }
  }, [])

  return (
    <section {...stylex.props(styles.panel)} aria-labelledby="control-title">
      <header {...stylex.props(styles.header)}>
        <h2 id="control-title" {...stylex.props(styles.title)}>Guardrails</h2>
        {status && (
          <span role="status" {...stylex.props(styles.pill, status.paused ? styles.paused : styles.active)}>
            {status.paused ? 'Paused · kill switch on' : 'Active'}
          </span>
        )}
      </header>
      {error && <p role="alert" {...stylex.props(styles.row, styles.warning)}>{error}</p>}
      {status && (
        <>
          <p {...stylex.props(styles.row)}>
            Stripe key: <span {...stylex.props(styles.strong, status.keyMode !== 'restricted' && styles.warning)}>
              {keyModeLabel[status.keyMode]}
            </span>
          </p>
          <ul {...stylex.props(styles.scopes)} aria-label="Restricted key scopes">
            {status.scopes.map((scope) => (
              <li key={scope.resource} {...stylex.props(styles.scope)}>{scope.resource} · {scope.access}</li>
            ))}
          </ul>
          <p {...stylex.props(styles.claim)}>
            Even a prompt-injected agent cannot refund, pay out or create charges.
          </p>
          <p {...stylex.props(styles.row)}>
            Send <span {...stylex.props(styles.strong)}>/pause</span> in any channel to stop billing and sourcing.
            Only the account owner can <span {...stylex.props(styles.strong)}>/resume</span>.
          </p>
        </>
      )}
    </section>
  )
}
