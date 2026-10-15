// Loaded with `bun --preload` when the harness starts the server. The current
// billing code calls `new Stripe(key)` without a host, so STRIPE_API_BASE would
// be ignored. This plugin rewrites the Stripe SDK's default host/port/protocol
// at load time so every client points at STRIPE_API_BASE. Product code is
// untouched; delete this once billing.ts passes STRIPE_API_BASE to the SDK.
import { plugin } from 'bun'

const base = process.env.STRIPE_API_BASE

if (base) {
  const url = new URL(base)
  const port = url.port || (url.protocol === 'https:' ? '443' : '80')
  const protocol = url.protocol.replace(':', '')
  plugin({
    name: 'tally-e2e-stripe-base',
    setup(build) {
      build.onLoad({ filter: /stripe[\\/](esm|cjs)[\\/]stripe\.core\.js$/ }, async (args) => {
        const source = await Bun.file(args.path).text()
        const contents = source
          .replace("const DEFAULT_HOST = 'api.stripe.com';", `const DEFAULT_HOST = ${JSON.stringify(url.hostname)};`)
          .replace("const DEFAULT_PORT = '443';", `const DEFAULT_PORT = ${JSON.stringify(port)};`)
          .replace("protocol: props.protocol || 'https',", `protocol: props.protocol || ${JSON.stringify(protocol)},`)
        if (contents === source) throw new Error('stripe-base-preload: Stripe SDK defaults not found; update the patch.')
        return { contents, loader: 'js' }
      })
    },
  })
}
