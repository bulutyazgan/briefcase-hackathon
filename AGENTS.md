# Tally

- Read `PLAN.md` before changing product behavior.
- Load the matching skill in `.agents/skills/` before design or code:
  `software-design` for modules and services, `product-design` for web UI,
  `stylex-authoring` for StyleX, `base-framework` for feature boundaries,
  `prototype` for throwaway experiments, and `motion` for animation.
- Features live in `web/src/features/<name>/` and
  `server/src/features/<name>/`.
- Give durable state one writer: `server/src/features/ledger`.
- Name files and folders by function. Put vendor code under `providers/`.
- Do not use `any` or `as` casts, except `as const`. Do not use default exports.
- Use kebab-case file names.
- Use StyleX longhands and tokens from `web/src/tokens/tokens.stylex.ts`.
  Do not use Tailwind or CSS frameworks.
- The LLM extracts and explains. Code decides and executes.
- Never commit secrets. Use Stripe test keys only.
- Comments are allowed when they add useful context. There are no static-analysis
  gates for this prototype.
