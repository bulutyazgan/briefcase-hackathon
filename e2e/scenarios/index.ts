import type { Scenario } from '../support/harness'
import { acmeAutoSend } from './acme-auto-send'
import { northwindMainStory } from './northwind-main-story'
import { pauseBlocksBilling } from './pause-blocks-billing'
import { replaySafety } from './replay-safety'
import { tregSourcing } from './treg-sourcing'
import { unknownSenderRefused } from './unknown-sender-refused'

// Order matters only for readability: run.ts resets the ledger and mocks between scenarios.
export const scenarios: Scenario[] = [
  northwindMainStory,
  unknownSenderRefused,
  replaySafety,
  pauseBlocksBilling,
  acmeAutoSend,
  tregSourcing,
]
