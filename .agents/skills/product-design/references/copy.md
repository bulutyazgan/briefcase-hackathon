# Copy

Load for: Copy mode, accessible names, interface language.

Scope: in-product interface language. For landing-page case rules, follow `DESIGN.md` §Labels and copy. Content edits for outbound and blog copy belong to the cf0-voice stack in the company vault.

## Verbs

- **rule/verb-noun-destructive** — `proposed`
  - Scope: destructive and consequential CTAs.
  - Rule: Verb + Noun, naming the object. Never "Confirm", "OK", "Submit", or a bare verb on a destructive action.
  - Why: the button label is the last thing that the user reads before an irreversible act. It must name what happens.
  - Examples — Bad: "Confirm" on "Delete task". Good: "Delete task".
  - Source: Vercel product-design pattern, adopted for cf0.

- **rule/canonical-verbs** — `proposed`
  - Scope: all action labels.
  - Rule: one verb for each concept across the product (see `glossary.md`). Do not pair `Remove`/`Delete`/`Cancel` for the same operation on different surfaces.
  - Why: consistency lets users transfer knowledge between surfaces.

## Casing (rule/copy-case-by-surface — `accepted`)

Follow `DESIGN.md` §Labels and copy for the landing-page and web-app case split.

- See `DESIGN.md` §Labels and copy for the eyebrow ban.
- Do not add "successfully" padding ("Task deleted", not "Successfully deleted").
- Use the present participle for in-flight progress ("Deleting…").
- Use numerals, not spelled-out numbers ("3 properties").

## Accessible names

- Every icon-only control has an accessible name. When both a visible label and an accessible name exist, they match.
- Accessible names describe function, not appearance ("Close dialog", not "X").

## Process boundary

Copy mode edits user-facing language and directly required JSX only. Report structural problems that you find during a copy pass. Do not fix them silently.
