import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Document, Font, Page, QrCode, StyleSheet, Text, View } from '@formepdf/react'
import { renderDocument } from '@formepdf/core'
import type { PricedLine } from '../policy/decide'

const FONT_DIRECTORY = join(import.meta.dir, '../../../assets/fonts')

function registerFont(family: string, file: string, fontWeight: number): void {
  Font.register({ family, fontWeight, src: new Uint8Array(readFileSync(join(FONT_DIRECTORY, file))) })
}

registerFont('Amiamie', 'Amiamie-Light.ttf', 300)
registerFont('Amiamie', 'Amiamie-Regular.ttf', 400)
registerFont('Amiamie', 'Amiamie-Black.ttf', 900)
registerFont('GeistMono', 'GeistMono-Regular.ttf', 400)
registerFont('GeistMono', 'GeistMono-Medium.ttf', 500)

const INK = '#17221d'
const MUTED = '#69756f'
const ACCENT = '#147a57'
const ACCENT_SOFT = '#e8f4ee'
const BORDER = '#dfe5e1'
const SURFACE = '#f4f6f5'

const CLAUSE_TEXT: Record<string, string> = {
  P1: 'Bill only from a client message with an explicit commitment.',
  P2: 'Prices come only from the rate card.',
  P3: 'Discounts need a remembered agreement, capped at 15%.',
  P4: 'Auto-send up to £1,000. Above that, one account-owner approval.',
  P5: 'Known clients only.',
  P6: 'One invoice per commitment message.',
  P7: 'Reminders at most once per 24 hours, never after a dispute.',
}

const styles = StyleSheet.create({
  page: { fontFamily: 'Amiamie', fontSize: 9.5, color: INK, lineHeight: 1.45 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 36 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  brandDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: ACCENT },
  brandName: { fontFamily: 'GeistMono', fontSize: 13, fontWeight: 500 },
  brandMeta: { fontSize: 8.5, color: MUTED, marginTop: 6 },
  title: { fontSize: 30, fontWeight: 300, letterSpacing: -0.6, textAlign: 'right' },
  number: { fontFamily: 'GeistMono', fontSize: 9, color: MUTED, textAlign: 'right', marginTop: 4 },
  meta: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: BORDER, borderBottomWidth: 1, borderBottomColor: BORDER, paddingTop: 14, paddingBottom: 14, marginBottom: 28 },
  metaCol: { flex: 1 },
  metaColWide: { flex: 1.6 },
  label: { fontFamily: 'GeistMono', fontSize: 7, color: MUTED, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 5 },
  metaValue: { fontSize: 10 },
  metaMuted: { fontSize: 9, color: MUTED },
  amountDue: { fontSize: 18, fontWeight: 400, color: ACCENT, letterSpacing: -0.3 },
  tableHead: { flexDirection: 'row', paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: INK },
  row: { flexDirection: 'row', paddingTop: 11, paddingBottom: 11, borderBottomWidth: 1, borderBottomColor: BORDER },
  cellDescription: { flex: 3.4, paddingRight: 12 },
  cellNumber: { flex: 1, textAlign: 'right', fontFamily: 'GeistMono', fontSize: 9 },
  cellHeadNumber: { flex: 1, textAlign: 'right' },
  lineTitle: { fontSize: 10.5 },
  lineNote: { fontSize: 8.5, color: MUTED, marginTop: 2 },
  discount: { color: ACCENT },
  totals: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16 },
  totalsBox: { width: 230 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 5, paddingBottom: 5 },
  totalValue: { width: 90, textAlign: 'right', fontFamily: 'GeistMono', fontSize: 9 },
  grandRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 10, paddingBottom: 10, paddingLeft: 12, paddingRight: 12, borderRadius: 8, backgroundColor: INK },
  grandLabel: { color: '#ffffff', fontSize: 10 },
  grandValue: { color: '#ffffff', fontFamily: 'GeistMono', fontSize: 12, fontWeight: 500 },
  pay: { flexDirection: 'row', gap: 18, marginTop: 34, padding: 18, borderRadius: 12, backgroundColor: SURFACE, alignItems: 'center' },
  payText: { flex: 1 },
  payTitle: { fontSize: 13, marginBottom: 4 },
  payBody: { fontSize: 9, color: MUTED },
  why: { marginTop: 22, paddingTop: 14, borderTopWidth: 1, borderTopColor: BORDER },
  quote: { fontSize: 11, fontWeight: 300, marginBottom: 8 },
  chips: { flexDirection: 'row', gap: 5, flexWrap: 'wrap' },
  chip: { backgroundColor: ACCENT_SOFT, borderRadius: 8, paddingTop: 2, paddingBottom: 2, paddingLeft: 7, paddingRight: 7 },
  chipText: { fontFamily: 'GeistMono', fontSize: 7.5, color: ACCENT },
  footer: { position: 'absolute', bottom: -28, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7.5, color: MUTED },
  appendixTitle: { fontSize: 24, fontWeight: 300, letterSpacing: -0.4, marginBottom: 4 },
  appendixLede: { fontSize: 9.5, color: MUTED, marginBottom: 26 },
  evidence: { flexDirection: 'row', paddingTop: 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: BORDER },
  evidenceKey: { width: 110 },
  evidenceValue: { flex: 1 },
  bigQuote: { fontSize: 15, fontWeight: 300, lineHeight: 1.35, letterSpacing: -0.2 },
  clause: { flexDirection: 'row', gap: 8, marginBottom: 6, alignItems: 'flex-start' },
  math: { fontFamily: 'GeistMono', fontSize: 9.5 },
  stamp: { marginTop: 28, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: BORDER, fontSize: 8.5, color: MUTED },
})

export interface PdfInvoice {
  invoiceId: string
  issuedAt: Date
  dueInDays: number
  client: { name: string; email: string }
  totalPence: number
  lines: PricedLine[]
  paymentUrl?: string
  stripeInvoiceId?: string
}

function pounds(amountPence: number): string {
  return `£${(amountPence / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function day(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function invoiceNumber(invoice: PdfInvoice): string {
  return `TAL-${invoice.issuedAt.getFullYear()}-${invoice.invoiceId.replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase()}`
}

function grossPence(line: PricedLine): number {
  return line.quantity * line.unitPricePence
}

function Chip({ label }: { label: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipText}>{label}</Text>
    </View>
  )
}

function InvoicePage({ invoice }: { invoice: PdfInvoice }) {
  const number = invoiceNumber(invoice)
  const dueAt = new Date(invoice.issuedAt.getTime() + invoice.dueInDays * 86_400_000)
  const subtotal = invoice.lines.reduce((sum, line) => sum + grossPence(line), 0)
  const discount = subtotal - invoice.totalPence
  const clauses = [...new Set(invoice.lines.flatMap((line) => line.clauses))]

  return (
    <Page size="A4" margin={[48, 52, 64, 52]} style={styles.page}>
      <View style={styles.header}>
        <View>
          <View style={styles.brand}>
            <View style={styles.brandDot} />
            <Text style={styles.brandName}>tally</Text>
          </View>
          <Text style={styles.brandMeta}>Tally Leads Ltd · London · billing@tally.dev</Text>
        </View>
        <View>
          <Text style={styles.title}>Invoice</Text>
          <Text style={styles.number}>{number}</Text>
        </View>
      </View>

      <View style={styles.meta}>
        <View style={styles.metaColWide}>
          <Text style={styles.label}>Billed to</Text>
          <Text style={styles.metaValue}>{invoice.client.name}</Text>
          <Text style={styles.metaMuted}>{invoice.client.email}</Text>
        </View>
        <View style={styles.metaCol}>
          <Text style={styles.label}>Issued</Text>
          <Text style={styles.metaValue}>{day(invoice.issuedAt)}</Text>
        </View>
        <View style={styles.metaCol}>
          <Text style={styles.label}>Due</Text>
          <Text style={styles.metaValue}>{day(dueAt)}</Text>
          <Text style={styles.metaMuted}>{invoice.dueInDays}-day terms</Text>
        </View>
        <View style={styles.metaCol}>
          <Text style={styles.label}>Amount due</Text>
          <Text style={styles.amountDue}>{pounds(invoice.totalPence)}</Text>
        </View>
      </View>

      <View style={styles.tableHead}>
        <Text style={{ ...styles.label, ...styles.cellDescription, marginBottom: 0 }}>Description</Text>
        <Text style={{ ...styles.label, ...styles.cellHeadNumber, marginBottom: 0 }}>Qty</Text>
        <Text style={{ ...styles.label, ...styles.cellHeadNumber, marginBottom: 0 }}>Unit</Text>
        <Text style={{ ...styles.label, ...styles.cellHeadNumber, marginBottom: 0 }}>Amount</Text>
      </View>
      {invoice.lines.map((line, index) => {
        const lineDiscount = grossPence(line) - line.totalPence
        return (
          <View key={`${line.description}-${index}`}>
            <View style={styles.row}>
              <View style={styles.cellDescription}>
                <Text style={styles.lineTitle}>{line.description}</Text>
                <Text style={styles.lineNote}>Verified contacts, delivered as CSV once paid</Text>
              </View>
              <Text style={styles.cellNumber}>{line.quantity}</Text>
              <Text style={styles.cellNumber}>{pounds(line.unitPricePence)}</Text>
              <Text style={styles.cellNumber}>{pounds(grossPence(line))}</Text>
            </View>
            {lineDiscount > 0 && (
              <View style={styles.row}>
                <View style={styles.cellDescription}>
                  <Text style={{ ...styles.lineTitle, ...styles.discount }}>
                    Agreed discount ({Math.round((lineDiscount / grossPence(line)) * 100)}%)
                  </Text>
                  <Text style={styles.lineNote}>{line.memoryFact}</Text>
                </View>
                <Text style={styles.cellNumber} />
                <Text style={styles.cellNumber} />
                <Text style={{ ...styles.cellNumber, ...styles.discount }}>−{pounds(lineDiscount)}</Text>
              </View>
            )}
          </View>
        )
      })}

      <View style={styles.totals}>
        <View style={styles.totalsBox}>
          <View style={styles.totalRow}>
            <Text>Subtotal</Text>
            <Text style={styles.totalValue}>{pounds(subtotal)}</Text>
          </View>
          {discount > 0 && (
            <View style={styles.totalRow}>
              <Text>Agreed discount</Text>
              <Text style={{ ...styles.totalValue, ...styles.discount }}>−{pounds(discount)}</Text>
            </View>
          )}
          <View style={styles.totalRow}>
            <Text>VAT (0%)</Text>
            <Text style={styles.totalValue}>{pounds(0)}</Text>
          </View>
          <View style={styles.grandRow}>
            <Text style={styles.grandLabel}>Total due (GBP)</Text>
            <Text style={styles.grandValue}>{pounds(invoice.totalPence)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.pay}>
        <View style={styles.payText}>
          <Text style={styles.payTitle}>Pay by card or bank transfer</Text>
          <Text style={styles.payBody}>
            Scan the code or open the secure Stripe payment page. The lead list is delivered as soon as the payment clears.
          </Text>
          {invoice.stripeInvoiceId && (
            <Text style={{ ...styles.payBody, fontFamily: 'GeistMono', marginTop: 6 }}>{invoice.stripeInvoiceId}</Text>
          )}
        </View>
        {invoice.paymentUrl && <QrCode data={invoice.paymentUrl} size={74} color={INK} />}
      </View>

      <View style={styles.why}>
        <Text style={styles.label}>Why this invoice</Text>
        <Text style={styles.quote}>“{invoice.lines[0]?.quote ?? ''}”</Text>
        <View style={styles.chips}>
          {clauses.map((clause) => <Chip key={clause} label={clause} />)}
        </View>
      </View>

      <View style={styles.footer}>
        <Text>Raised by Tally from a client commitment. Every amount was decided by policy code.</Text>
        <Text>{number} · page 1 of 2</Text>
      </View>
    </Page>
  )
}

function EvidencePage({ invoice }: { invoice: PdfInvoice }) {
  const number = invoiceNumber(invoice)
  return (
    <Page size="A4" margin={[48, 52, 64, 52]} style={styles.page}>
      <View style={styles.header}>
        <View style={styles.brand}>
          <View style={styles.brandDot} />
          <Text style={styles.brandName}>tally</Text>
        </View>
        <Text style={styles.number}>{number} · evidence</Text>
      </View>
      <Text style={styles.appendixTitle}>Why we billed this.</Text>
      <Text style={styles.appendixLede}>
        Each line traces back to the client's own words, what we remember agreeing, and the policy that allowed it.
      </Text>

      {invoice.lines.map((line, index) => {
        const lineDiscount = grossPence(line) - line.totalPence
        return (
          <View key={`${line.description}-${index}`}>
            <View style={styles.evidence}>
              <View style={styles.evidenceKey}><Text style={styles.label}>Client said</Text></View>
              <View style={styles.evidenceValue}><Text style={styles.bigQuote}>“{line.quote}”</Text></View>
            </View>
            <View style={styles.evidence}>
              <View style={styles.evidenceKey}><Text style={styles.label}>We remembered</Text></View>
              <View style={styles.evidenceValue}><Text style={styles.metaValue}>{line.memoryFact}</Text></View>
            </View>
            <View style={styles.evidence}>
              <View style={styles.evidenceKey}><Text style={styles.label}>Calculation</Text></View>
              <View style={styles.evidenceValue}>
                <Text style={styles.math}>
                  {line.quantity} × {pounds(line.unitPricePence)} = {pounds(grossPence(line))}
                </Text>
                {lineDiscount > 0 && (
                  <Text style={styles.math}>
                    − {pounds(lineDiscount)} agreed discount = {pounds(line.totalPence)}
                  </Text>
                )}
              </View>
            </View>
            <View style={styles.evidence}>
              <View style={styles.evidenceKey}><Text style={styles.label}>Policy</Text></View>
              <View style={styles.evidenceValue}>
                {line.clauses.map((clause) => (
                  <View key={clause} style={styles.clause}>
                    <Chip label={clause} />
                    <Text style={{ flex: 1 }}>{CLAUSE_TEXT[clause] ?? clause}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        )
      })}

      <Text style={styles.stamp}>
        The language model only read the message and wrote this explanation. The price, the discount, the approval and the Stripe call were made by code, and each step is in the audit ledger under {invoice.invoiceId}.
      </Text>

      <View style={styles.footer}>
        <Text>Stripe test mode. No real money moves.</Text>
        <Text>{number} · page 2 of 2</Text>
      </View>
    </Page>
  )
}

export async function renderInvoicePdf(invoice: PdfInvoice): Promise<string> {
  const document = (
    <Document title={`Invoice ${invoiceNumber(invoice)}`} author="Tally">
      <InvoicePage invoice={invoice} />
      <EvidencePage invoice={invoice} />
    </Document>
  )
  const bytes = await renderDocument(document)
  const outputDirectory = join(process.cwd(), 'out')
  await mkdir(outputDirectory, { recursive: true })
  const outputPath = join(outputDirectory, `${invoice.invoiceId}.pdf`)
  await writeFile(outputPath, bytes)
  return outputPath
}
