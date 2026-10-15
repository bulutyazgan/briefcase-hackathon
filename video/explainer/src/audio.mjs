// Renders the procedural bed and cues (audio.html) through headless Chromium to ../out/bed.wav,
// mixes the voice lines on top at the measured times, normalises to -16 LUFS / -1.5 dBTP
// (two-pass loudnorm) and writes ../out/mix.wav plus captions.srt from the same timing.
import { createRequire } from 'node:module'
import { execFileSync, execSync } from 'node:child_process'
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const requireGlobal = createRequire(execSync('npm root -g').toString().trim() + '/')
const { chromium } = requireGlobal('playwright')
const TIMELINE = createRequire(import.meta.url)('./timeline.js')
const timing = JSON.parse(readFileSync(resolve(here, 'captions-timing.json'), 'utf8'))
const out = resolve(here, '../out'); mkdirSync(out, { recursive: true })

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const page = await browser.newPage()
await page.goto(`file://${resolve(here, 'audio.html')}`)
const b64 = await page.evaluate(() => window.renderAudio())
writeFileSync(resolve(out, 'bed.wav'), Buffer.from(b64, 'base64'))
await browser.close()
console.log('bed.wav rendered')

// Voice track: each fitted line delayed to its t0, summed.
const inputs = [], delays = []
timing.forEach((c, i) => { inputs.push('-i', resolve(here, c.file)); delays.push(`[${i + 1}]adelay=${Math.round(c.t0 * 1000)}|${Math.round(c.t0 * 1000)}[v${i}]`) })
const voiceMix = `${delays.join(';')};${timing.map((_, i) => `[v${i}]`).join('')}amix=inputs=${timing.length}:normalize=0[voice]`
const filter = `${voiceMix};[voice]volume=1.9[vo];[0]volume=1.0[bed];[bed][vo]amix=inputs=2:normalize=0:duration=first[mix]`
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', resolve(out, 'bed.wav'), ...inputs, '-filter_complex', filter, '-map', '[mix]', '-ar', '48000', '-ac', '2', resolve(out, 'premix.wav')])
console.log('premix.wav mixed')

// Two-pass loudnorm to -16 LUFS integrated, -1.5 dBTP.
const stderr = execSync(`ffmpeg -hide_banner -i "${resolve(out, 'premix.wav')}" -af loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json -f null - 2>&1`).toString()
const json = JSON.parse(stderr.slice(stderr.lastIndexOf('{')))
const ln = `loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=${json.input_i}:measured_TP=${json.input_tp}:measured_LRA=${json.input_lra}:measured_thresh=${json.input_thresh}:offset=${json.target_offset}:linear=true:print_format=summary`
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', resolve(out, 'premix.wav'), '-af', ln, '-ar', '48000', resolve(out, 'mix.wav')])
const check = execSync(`ffmpeg -hide_banner -i "${resolve(out, 'mix.wav')}" -af ebur128=peak=true -f null - 2>&1 | tail -12`).toString()
console.log(check)

// captions.srt from the same timing.
const ts = s => { const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = Math.floor(s % 60), ms = Math.round((s - Math.floor(s)) * 1000); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms).padStart(3, '0')}` }
const srt = timing.map((c, i) => `${i + 1}\n${ts(c.t0)} --> ${ts(c.t1)}\n${c.text}\n`).join('\n')
writeFileSync(resolve(here, '../captions.srt'), srt)
console.log(`captions.srt: ${timing.length} cues`)
