// The one TIMELINE. Every beat, caption, cue and camera move in the film reads from here.
// Times in seconds. Nothing on screen or in the audio is timed anywhere else.
const TIMELINE = {
  fps: 60,
  duration: 75,
  size: { w: 1920, h: 1080 },
  scenes: [
    { id: 'S1', t0: 0, t1: 8, name: 'Question', anchor: 'A client asks in chat.', teaches: 'The request arrives where the client already is; the usual next step is a form and a wait.' },
    { id: 'S2', t0: 8, t1: 13, name: 'Reads', anchor: 'Tally reads the thread.', teaches: 'The message is the request. The quote is kept as evidence.' },
    { id: 'S3', t0: 13, t1: 18, name: 'Recalls', anchor: 'It recalls the client and the deal.', teaches: 'CRM, dated memory and the price list are what it knows.' },
    { id: 'S4', t0: 18, t1: 26, name: 'Split', anchor: 'The model reads and asks.\nCode decides and pays.', teaches: 'The split that makes it safe, inside a written policy with limits.' },
    { id: 'S5', t0: 26, t1: 34, name: 'Bills', anchor: 'Code checks the policy and bills.', teaches: 'Clauses checked, a Stripe invoice created, no dashboard touched.' },
    { id: 'S6', t0: 34, t1: 42, name: 'Reply', anchor: 'The reply and the PDF, in the same chat.', teaches: 'The client never leaves the conversation.' },
    { id: 'S7', t0: 42, t1: 50, name: 'Receipt', anchor: 'Every pound has a receipt.', teaches: 'Why this amount: the words, the fact, the clause.' },
    { id: 'S8', t0: 50, t1: 56, name: 'Note', anchor: 'Staff get a note, not a ticket.', teaches: 'The books stay right without a queue.' },
    { id: 'S9', t0: 56, t1: 67, name: 'Turn', anchor: 'Above the limits, a human approves.', teaches: 'Change one variable: a limit is crossed, code stops and asks. One word pauses everything.' },
    { id: 'S10', t0: 67, t1: 75, name: 'Payoff', anchor: 'Said. Done. Billed.', teaches: 'The opening message read correctly, plus one next step.' },
  ],
  // Voice lines double as burned-in captions and as captions.srt. t1 is replaced by the measured
  // length of each spoken line in captions-timing.json when the voice has been generated.
  captions: [
    { id: 'c01', t0: 0.6, t1: 3.2, text: 'Your client asks for a change, in chat.' },
    { id: 'c02', t0: 3.6, t1: 7.6, text: 'Usually this is where the form, the queue and the wait begin.' },
    { id: 'c03', t0: 8.4, t1: 12.4, text: 'Tally reads the thread instead. The message is the request.' },
    { id: 'c04', t0: 13.4, t1: 17.8, text: 'It finds the client in your CRM and recalls their deal and your price list.' },
    { id: 'c05', t0: 18.4, t1: 22.0, text: 'The part that makes this safe: the model reads and asks.' },
    { id: 'c06', t0: 22.2, t1: 25.6, text: 'Code decides and pays, inside a written policy.' },
    { id: 'c07', t0: 26.4, t1: 29.8, text: 'Code checks the clauses and creates the Stripe invoice:' },
    { id: 'c08', t0: 30.0, t1: 33.6, text: 'five thousand pounds, yearly, due in seven days.' },
    { id: 'c09', t0: 34.4, t1: 39.6, text: 'The client gets the reply and the PDF in the same chat. They never left it.' },
    { id: 'c10', t0: 42.4, t1: 47.6, text: 'Every pound carries a receipt: their words, the remembered fact, the clause.' },
    { id: 'c11', t0: 50.4, t1: 54.6, text: 'Your team gets a note, not a ticket. The books stay right.' },
    { id: 'c12', t0: 56.4, t1: 60.2, text: 'Now change one thing. A dispute crosses a written limit.' },
    { id: 'c13', t0: 60.4, t1: 63.4, text: 'Code stops and asks a human, in the same chat.' },
    { id: 'c14', t0: 63.8, t1: 66.2, text: 'One word pauses everything.' },
    { id: 'c15', t0: 67.4, t1: 69.6, text: 'Said. Done. Billed.' },
    { id: 'c16', t0: 70.0, t1: 74.4, text: 'The conversation is the contract. The agent is the back office.' },
  ],
  // Sound cues. Only actions that carry meaning get one.
  cues: [
    { t: 0.6, kind: 'pop' },      // client message arrives
    { t: 3.4, kind: 'form' },     // the usual next step rises (dull)
    { t: 8.6, kind: 'read' },     // reading sweep
    { t: 13.6, kind: 'dock' },    // CRM
    { t: 15.0, kind: 'dock' },    // memory
    { t: 16.4, kind: 'dock' },    // price list
    { t: 18.6, kind: 'motif' },   // the key idea
    { t: 22.4, kind: 'dock' },    // policy
    { t: 27.0, kind: 'tick' }, { t: 27.8, kind: 'tick' }, { t: 28.6, kind: 'tick' }, // P2 P5 P8
    { t: 30.2, kind: 'confirm' }, // invoice created
    { t: 35.0, kind: 'pop' },     // reply
    { t: 37.4, kind: 'pop' },     // PDF lands
    { t: 43.0, kind: 'read' },    // evidence reveals
    { t: 51.0, kind: 'dock' },    // staff note
    { t: 53.2, kind: 'dock' },    // books
    { t: 56.8, kind: 'pop' },     // dispute arrives
    { t: 59.4, kind: 'hold' },    // above the limit, code stops
    { t: 62.0, kind: 'confirm' }, // owner taps approve
    { t: 64.2, kind: 'hold' },    // /pause
    { t: 67.6, kind: 'motif' },   // payoff
  ],
  // Procedural bed: tempo-locked, one motif that returns on the key idea.
  bed: { bpm: 72, root: 146.83 /* D3 */, motif: [0, 4, 7, 12] /* D F# A D, semitones */ },
}

if (typeof module !== 'undefined') module.exports = TIMELINE
if (typeof window !== 'undefined') window.TIMELINE = TIMELINE
