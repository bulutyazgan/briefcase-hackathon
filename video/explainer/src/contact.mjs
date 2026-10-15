// Contact sheet: one still per scene (at each scene's midpoint) tiled 5 x 2, from the page itself.
// Usage: node contact.mjs ../contact.png
import { createRequire } from 'node:module'
import { execFileSync, execSync } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const requireGlobal = createRequire(execSync('npm root -g').toString().trim() + '/')
const { chromium } = requireGlobal('playwright')
const TIMELINE = createRequire(import.meta.url)('./timeline.js')
const out = resolve(process.argv[2] || '../contact.png')
const tmp = resolve(here, '../out/contact-frames'); mkdirSync(tmp, { recursive: true })

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--disable-gpu', '--hide-scrollbars', '--font-render-hinting=none'] })
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
await page.goto(`file://${resolve(here, 'index.html')}`)
await page.evaluate(() => document.fonts.ready)
const cdp = await page.context().newCDPSession(page)
const files = []
for (const [i, sc] of TIMELINE.scenes.entries()) {
  const t = (sc.t0 + sc.t1) / 2
  await page.evaluate(t => window.seek(t), t)
  await page.evaluate(() => new Promise(r => requestAnimationFrame(r)))
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' })
  const f = resolve(tmp, `${String(i).padStart(2, '0')}.png`)
  writeFileSync(f, Buffer.from(data, 'base64'))
  files.push({ f, label: `${sc.id} ${sc.t0}-${sc.t1}s ${sc.name}` })
}
await browser.close()
// Label each frame and tile.
const inputs = files.flatMap(x => ['-i', x.f])
const label = files.map((x, i) => `[${i}]scale=768:432,drawbox=x=0:y=392:w=768:h=40:color=white@0.92:t=fill,drawtext=text='${x.label.replace(/'/g, '')}':x=12:y=404:fontsize=20:fontcolor=0x171717[f${i}]`).join(';')
const stack = `${files.map((_, i) => `[f${i}]`).join('')}xstack=inputs=${files.length}:layout=0_0|768_0|1536_0|2304_0|3072_0|0_432|768_432|1536_432|2304_432|3072_432[out]`
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', `${label};${stack}`, '-map', '[out]', '-frames:v', '1', out])
console.log(`wrote ${out}`)
