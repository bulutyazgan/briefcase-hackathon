import { findClient } from '../clients/clients'
import { reply } from '../channels/channel'
import { recordEvent, type ChannelMessage } from '../ledger/store'
import { BUYER_AGENT_AUTHOR, money } from './policy'

const UPSELL_LEADS = 200

// Tally's side of the agent-to-agent negotiation: a fixed, price-list counter-offer, only to an agent buyer.
export async function offerUpsellToAgentBuyer(message: ChannelMessage, clientName: string): Promise<void> {
  if (message.author !== BUYER_AGENT_AUTHOR) return
  const client = findClient(clientName)
  if (!client) return
  const pricePence = UPSELL_LEADS * client.pricePerLeadPence
  await reply(message, `Add ${UPSELL_LEADS} more leads for ${money(pricePence)}?`)
  recordEvent({
    id: crypto.randomUUID(),
    message_id: message.id,
    step: 'upsell_offer',
    summary: `Offered ${UPSELL_LEADS} more leads at the price list (${money(pricePence)}) to the buyer agent.`,
    data_json: JSON.stringify({ leads: UPSELL_LEADS, pricePence }),
    policy_clause: 'P2',
  })
}
