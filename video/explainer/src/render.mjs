// Render contract: headless Chromium steps t = n/fps, calls window.seek(t), and pipes PNG frames
// into ffmpeg (libx264, crf 16, yuv420p). Usage:
//   node render.mjs --aspect 16x9 --out ../out/video_16x9.mp4 [--fps 60] [--from 0 --to 75] [--rm]
//   node render.mjs --frame 30.0 --png /tmp/f.png      (one still, for verification)
import { createRequire } from 'node:module'
import { spawn, execSync } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const requireGlobal = createRequire(execSync('npm root -g').toString().trim() + '/')
const { chromium } = requireGlobal('playwright')
const TIMELINE = createRequire(import.meta.url)('./timeline.js')

const here = dirname(fileURLToPath(import.meta.url))
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true'])
  return acc
}, []))
const aspect = args.aspect || '16x9'
const sizes = { '16x9': [1920, 1080], '9x16': [1080, 1920], '1x1': [1080, 1080] }
const [w, h] = sizes[aspect]
const fps = Number(args.fps || TIMELINE.fps)
const from = Number(args.from || 0)
const to = Number(args.to || TIMELINE.duration)
const url = `file://${resolve(here, 'index.html')}?aspect=${aspect}${args.rm ? '&rm=1' : ''}`

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--disable-gpu', '--hide-scrollbars', '--font-render-hinting=none', '--disable-lcd-text'] })
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
await page.goto(url)
await page.evaluate(() => document.fonts.ready)
await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))
const cdp = await page.context().newCDPSession(page)

async function frame(t) {
  await page.evaluate(t => { window.seek(t) }, t)
  await page.evaluate(() => new Promise(r => requestAnimationFrame(r)))
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  return Buffer.from(data, 'base64')
}

if (args.stills) {
  // --stills "2,10,16" --dir /path : one PNG per listed time, for reading the beats
  mkdirSync(resolve(args.dir), { recursive: true })
  for (const ts of args.stills.split(',')) {
    const png = await frame(Number(ts))
    writeFileSync(resolve(args.dir, `t${Number(ts).toFixed(1).padStart(5, '0')}_${aspect}.png`), png)
  }
  console.log(`wrote ${args.stills.split(',').length} stills to ${args.dir}`)
  await browser.close()
  process.exit(0)
}

if (args.frame) {
  const png = await frame(Number(args.frame))
  mkdirSync(dirname(resolve(args.png)), { recursive: true })
  writeFileSync(resolve(args.png), png)
  console.log(`wrote ${args.png} (${png.length} bytes) at t=${args.frame}`)
  await browser.close()
  process.exit(0)
}

const out = resolve(args.out || `../out/video_${aspect}.mp4`)
mkdirSync(dirname(out), { recursive: true })
const ff = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-vcodec', 'png', '-i', '-', '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] })
const n0 = Math.round(from * fps), n1 = Math.round(to * fps)
const started = Date.now()
for (let n = n0; n < n1; n++) {
  const png = await frame(n / fps)
  if (!ff.stdin.write(png)) await new Promise(r => ff.stdin.once('drain', r))
  if (n % (fps * 5) === 0) console.log(`frame ${n}/${n1} t=${(n / fps).toFixed(2)} ${((Date.now() - started) / 1000).toFixed(0)}s`)
}
ff.stdin.end()
await new Promise((res, rej) => ff.on('close', code => code === 0 ? res() : rej(new Error(`ffmpeg exit ${code}`))))
await browser.close()
console.log(`rendered ${out} (${n1 - n0} frames at ${fps} fps, ${aspect})`)
