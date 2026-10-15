// Vite config for e2e runs: the web app's own config, with the /api proxy
// pointed at the harness's API port so a developer's `bun run dev` on :8787
// (or another agent's server) can keep running alongside.
import base from '../../web/vite.config'

const apiBase = process.env.E2E_API_BASE ?? 'http://127.0.0.1:8797'
const webRoot = new URL('../../web', import.meta.url).pathname

// Vite requires a default export from a config file.
export default (env: Parameters<typeof base>[0]) => {
  const resolved = base(env)
  return {
    ...resolved,
    root: webRoot,
    server: { ...resolved.server, proxy: { '/api': apiBase, '/health': apiBase } },
  }
}
