/**
 * dsh-voice-greeting — DSH startup greeting / shutdown farewell.
 *
 * Host-side Cordis plugin.  The WAV files are pre-generated, so startup is
 * instant even when the TTS service is cold.  The settings page reads and
 * writes a small JSON section through /api/dsh-voice-greeting.
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { createHash } from 'node:crypto'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import z from '@deepseek-ai/schemastery'

const PKG_DIR = dirname(fileURLToPath(import.meta.url))
const WIN_PLAYER = join(PKG_DIR, 'scripts', 'play-wav.ps1')
const DATA_FILE = process.env.DSH_VOICE_DATA_FILE || join(dirname(dirname(PKG_DIR)), 'dsh-voice-greeting.json')
const AUDIO_DIR = join(dirname(DATA_FILE), 'dsh-voice-greeting-audio')
const CACHE_DIR = join(dirname(DATA_FILE), 'dsh-voice-greeting-cache')
const NS = 'dsh-voice-greeting'
const API = '/api/dsh-voice-greeting'
const DRY = process.env.DSH_VOICE_GREETING_DRY === '1'

export const name = 'dsh-voice-greeting'
export const inject = ['webServer']

const ConfigSchema = z.object({
  enabled: z.boolean().default(true),
  startupAudio: z.string().default(''),
  shutdownAudio: z.string().default(''),
  shutdownServiceUrl: z.string().default(''),
  outputDevice: z.string().default(''),
  volume: z.number().default(100),
  fadeInMs: z.number().default(30),
  fadeOutMs: z.number().default(80),
})

export const Config = ConfigSchema

function log(...args) {
  console.log('[dsh-voice-greeting]', ...args)
}

export function expandPath(value) {
  if (typeof value !== 'string' || value.trim() === '') return ''
  let p = value.trim()
  // Windows「复制文件地址」会带一对引号；浏览器粘贴时也可能带引号。
  // 不去掉会被当作相对路径，最终拼到 DSH 的 release 目录下。
  if (p.length >= 2 &&
      ((p.startsWith('"') && p.endsWith('"')) || (p.startsWith("'") && p.endsWith("'")))) {
    p = p.slice(1, -1).trim()
    if (!p) return ''
  }

  const sep = String.fromCharCode(92)
  if (p === '~' || p.startsWith('~/') || p.startsWith('~' + sep)) {
    p = join(homedir(), p.slice(1))
  }
  return isAbsolute(p) ? p : resolve(p)
}

function parseWav(buffer) {
  if (buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('不是 RIFF/WAVE 文件')
  }
  let fmt = null
  let data = null
  let off = 12
  while (off + 8 <= buffer.length) {
    const id = buffer.toString('ascii', off, off + 4)
    const size = buffer.readUInt32LE(off + 4)
    const body = off + 8
    if (id === 'fmt ' && body + 16 <= buffer.length) {
      fmt = {
        format: buffer.readUInt16LE(body),
        channels: buffer.readUInt16LE(body + 2),
        sampleRate: buffer.readUInt32LE(body + 4),
        blockAlign: buffer.readUInt16LE(body + 12),
        bits: buffer.readUInt16LE(body + 14),
      }
    } else if (id === 'data') {
      data = { offset: body, size: Math.min(size, buffer.length - body) }
      break
    }
    off = body + size + (size % 2)
  }
  if (!fmt || !data) throw new Error('WAV 缺少 fmt 或 data 块')
  if (fmt.format !== 1) throw new Error(`编码格式 ${fmt.format} 不是 PCM`)
  if (fmt.bits !== 16) throw new Error(`位深 ${fmt.bits} 不是 16bit PCM`)
  if (fmt.channels !== 1 && fmt.channels !== 2) throw new Error('只支持单声道或立体声')
  if (!fmt.sampleRate || !fmt.blockAlign) throw new Error('WAV fmt 信息不完整')
  return { fmt, data }
}

export function inspectWav(file) {
  try {
    const buf = readFileSync(file)
    const { fmt, data } = parseWav(buf)
    return { ok: true, info: { ...fmt, duration: data.size / fmt.blockAlign / fmt.sampleRate } }
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) }
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export function prepareWav(file, volume = 100, fadeInMs = 0, fadeOutMs = 0) {
  const raw = readFileSync(file)
  const { fmt, data } = parseWav(raw)
  const frameCount = Math.floor(data.size / fmt.blockAlign)
  if (frameCount <= 0) throw new Error('WAV 没有音频帧')
  const volumeGain = clamp(Number(volume) || 0, 0, 100) / 100
  const fadeInFrames = Math.max(0, Math.floor(fmt.sampleRate * Math.max(0, Number(fadeInMs) || 0) / 1000))
  const fadeOutFrames = Math.max(0, Math.floor(fmt.sampleRate * Math.max(0, Number(fadeOutMs) || 0) / 1000))
  const out = Buffer.from(raw)
  for (let i = 0; i < frameCount; i++) {
    let env = 1
    if (fadeInFrames > 0 && i < fadeInFrames) env = Math.min(env, i / fadeInFrames)
    if (fadeOutFrames > 0 && i >= frameCount - fadeOutFrames) {
      env = Math.min(env, (frameCount - 1 - i) / fadeOutFrames)
    }
    const gain = volumeGain * env
    for (let ch = 0; ch < fmt.channels; ch++) {
      const at = data.offset + (i * fmt.channels + ch) * 2
      const sample = raw.readInt16LE(at)
      out.writeInt16LE(clamp(Math.round(sample * gain), -32768, 32767), at)
    }
  }
  const key = createHash('sha1')
    .update(file).update(String(statSync(file).mtimeMs))
    .update(`${volumeGain}|${fadeInFrames}|${fadeOutFrames}`).digest('hex').slice(0, 16)
  mkdirSync(CACHE_DIR, { recursive: true })
  const cached = join(CACHE_DIR, `${key}.wav`)
  writeFileSync(cached, out)
  return cached
}

function playFile(file, label, sync = false, cfg = {}) {
  const path = expandPath(file)
  if (!path) return false
  if (!existsSync(path)) {
    log(`${label} audio not found:`, path)
    return false
  }
  let prepared
  try {
    prepared = prepareWav(path, cfg.volume ?? 100, cfg.fadeInMs ?? 0, cfg.fadeOutMs ?? 0)
  } catch (error) {
    log(`${label} invalid wav:`, path, String(error?.message ?? error))
    return false
  }
  if (DRY) return true
  if (process.platform === 'win32') {
    const args = ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-File', WIN_PLAYER, '-Path', prepared]
    if (cfg.outputDevice) args.push('-Device', String(cfg.outputDevice))
    if (sync) {
      const result = spawnSync('powershell.exe', args, { timeout: 20000, windowsHide: true, encoding: 'utf8' }); if (result.error || result.status !== 0) { log(`${label} play failed:`, String(result.error?.message || result.stderr || `exit ${result.status}`)); return false }
    } else {
      const child = spawn('powershell.exe', args, { detached: true, stdio: 'ignore', windowsHide: true })
      child.unref()
    }
    return true
  }
  const cmd = process.platform === 'darwin' ? 'afplay' : (process.env.DSH_VOICE_PLAYER || 'paplay')
  if (sync) {
    spawnSync(cmd, [prepared], { timeout: 6000, stdio: 'ignore' })
  } else {
    const child = spawn(cmd, [prepared], { detached: true, stdio: 'ignore' })
    child.unref()
  }
  return true
}

function postShutdown(url) {
  if (!url || DRY) return
  try {
    if (process.platform === 'win32') {
      const safe = String(url).replace(/'/g, "''")
      spawnSync('powershell.exe', [
        '-NoProfile', '-Command',
        `try { Invoke-WebRequest -Uri '${safe}' -Method Post -TimeoutSec 2 | Out-Null } catch {}`
      ], { timeout: 3000, windowsHide: true, stdio: 'ignore' })
    } else {
      spawnSync('curl', ['-sS', '-X', 'POST', '--max-time', '2', String(url)], { timeout: 3000, stdio: 'ignore' })
    }
  } catch {}
}

function json(res, status, value) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(value))
}

function readBody(req) {
  return new Promise((resolveBody) => {
    let data = ''
    req.on('data', (chunk) => { data += String(chunk) })
    req.on('end', () => {
      try { resolveBody(JSON.parse(data || '{}')) } catch { resolveBody(null) }
    })
    req.on('error', () => resolveBody(null))
  })
}

function readRawBody(req) {
  return new Promise((resolveBody) => {
    const chunks = []
    req.on('data', (chunk) => { chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)) })
    req.on('end', () => resolveBody(Buffer.concat(chunks)))
    req.on('error', () => resolveBody(Buffer.alloc(0)))
  })
}

function loopbackAllowed(req) {
  const raw = String(req.socket?.remoteAddress || '').toLowerCase()
  if (raw === '::1') return true
  const ip = raw.startsWith('::ffff:') ? raw.slice(7) : raw
  const parts = ip.split('.')
  return parts.length === 4 && parts[0] === '127'
    && parts.every((n) => /^\d{1,3}$/.test(n) && Number(n) <= 255)
}

export function apply(ctx, config = {}) {
  const readStored = () => {
    try {
      const raw = JSON.parse(readFileSync(DATA_FILE, 'utf8'))
      return raw !== null && typeof raw === 'object' ? raw : {}
    } catch { return {} }
  }
  const readConfig = () => ConfigSchema({ ...config, ...readStored() })
  const saveConfig = async (patch) => {
    const next = ConfigSchema({ ...readConfig(), ...patch })
    mkdirSync(dirname(DATA_FILE), { recursive: true })
    writeFileSync(DATA_FILE, JSON.stringify(next, null, 2), 'utf8')
    return next
  }

  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    const cfg = readConfig()
    if (!cfg.enabled) return
    playFile(cfg.shutdownAudio, 'shutdown', true, cfg)
    postShutdown(cfg.shutdownServiceUrl)
  }

  const initial = readConfig()
  if (initial.enabled) playFile(initial.startupAudio, 'startup', false, initial)

  const state = () => {
    const cfg = readConfig()
    return {
      ok: true,
      config: cfg,
      exists: {
        startup: Boolean(cfg.startupAudio && existsSync(expandPath(cfg.startupAudio))),
        shutdown: Boolean(cfg.shutdownAudio && existsSync(expandPath(cfg.shutdownAudio))),
        startupWav: cfg.startupAudio ? inspectWav(expandPath(cfg.startupAudio)) : null,
        shutdownWav: cfg.shutdownAudio ? inspectWav(expandPath(cfg.shutdownAudio)) : null,
      },
    }
  }

  const handler = async (req, res) => {
    if (!loopbackAllowed(req)) { json(res, 403, { ok: false, error: 'loopback-only' }); return }
    try {
      if (req.method === 'GET') { json(res, 200, state()); return }
      if (req.method !== 'POST') { json(res, 405, { ok: false, error: 'method not allowed' }); return }
      const body = await readBody(req)
      const patch = {}
      if (typeof body?.enabled === 'boolean') patch.enabled = body.enabled
      for (const key of ['startupAudio', 'shutdownAudio', 'shutdownServiceUrl', 'outputDevice']) {
        if (typeof body?.[key] === 'string') patch[key] = body[key].trim()
      }
      if (Number.isFinite(Number(body?.volume))) patch.volume = clamp(Number(body.volume), 0, 100)
      if (Number.isFinite(Number(body?.fadeInMs))) patch.fadeInMs = clamp(Number(body.fadeInMs), 0, 2000)
      if (Number.isFinite(Number(body?.fadeOutMs))) patch.fadeOutMs = clamp(Number(body.fadeOutMs), 0, 2000)
      if (Object.keys(patch).length > 0) await saveConfig(patch)
      json(res, 200, state())
    } catch (error) {
      json(res, 500, { ok: false, error: String(error?.message ?? error) })
    }
  }

  const preview = async (req, res) => {
    if (!loopbackAllowed(req)) { json(res, 403, { ok: false, error: 'loopback-only' }); return }
    if (req.method !== 'POST') { json(res, 405, { ok: false, error: 'method not allowed' }); return }
    try {
      const body = await readBody(req)
      const kind = body?.kind === 'shutdown' ? 'shutdown' : 'startup'
      const cfg = readConfig()
      if (Number.isFinite(Number(body?.volume))) cfg.volume = clamp(Number(body.volume), 0, 100)
      if (Number.isFinite(Number(body?.fadeInMs))) cfg.fadeInMs = clamp(Number(body.fadeInMs), 0, 2000)
      if (Number.isFinite(Number(body?.fadeOutMs))) cfg.fadeOutMs = clamp(Number(body.fadeOutMs), 0, 2000)
      const supplied = typeof body?.path === 'string' ? body.path.trim() : ''
      const path = supplied || (kind === 'shutdown' ? cfg.shutdownAudio : cfg.startupAudio)
      const resolved = expandPath(path)
      if (!path) { json(res, 400, { ok: false, error: '音频路径为空' }); return }
      if (!resolved || !existsSync(resolved)) {
        json(res, 400, { ok: false, error: `音频文件不存在：${resolved || path}`, path: resolved || path }); return
      }
      const wav = inspectWav(resolved)
      if (!wav.ok) {
        json(res, 400, { ok: false, error: `不是有效的 PCM WAV：${wav.error}`, path: resolved }); return
      }
      if (!playFile(path, `preview-${kind}`, true, cfg)) {
        json(res, 400, { ok: false, error: `音频播放失败，请检查输出设备${cfg.outputDevice ? `「${cfg.outputDevice}」` : ''}与文件权限`, path: resolved }); return
      }
      json(res, 200, { ok: true, path: resolved })
    } catch (error) {
      json(res, 500, { ok: false, error: String(error?.message ?? error) })
    }
  }

  const devices = async (req, res) => {
    if (!loopbackAllowed(req)) { json(res, 403, { ok: false, error: 'loopback-only' }); return }
    if (req.method !== 'GET') { json(res, 405, { ok: false, error: 'method not allowed' }); return }
    if (process.platform !== 'win32') { json(res, 200, { ok: true, devices: [] }); return }
    try {
      const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', WIN_PLAYER, '-ListDevices'], { timeout: 10000, windowsHide: true, encoding: 'utf8' })
      if (result.error || result.status !== 0) throw new Error(String(result.error?.message || result.stderr || `exit ${result.status}`))
      const text = String(result.stdout || '').replace(/^\uFEFF/, '').trim()
      let list = text ? JSON.parse(text) : []
      if (!Array.isArray(list)) list = [list]
      json(res, 200, { ok: true, devices: list.map((item) => ({ id: String(item.id || ''), name: String(item.name || '') })).filter((item) => item.id && item.name) })
    } catch (error) {
      json(res, 500, { ok: false, error: String(error?.message ?? error) })
    }
  }


  const upload = async (req, res) => {
    if (!loopbackAllowed(req)) { json(res, 403, { ok: false, error: 'loopback-only' }); return }
    if (req.method !== 'POST') { json(res, 405, { ok: false, error: 'method not allowed' }); return }
    try {
      const kind = String(req.headers?.['x-dvg-kind'] || 'startup').toLowerCase() === 'shutdown' ? 'shutdown' : 'startup'
      const body = await readRawBody(req)
      if (body.length === 0) { json(res, 400, { ok: false, error: '空文件' }); return }
      parseWav(body)
      mkdirSync(AUDIO_DIR, { recursive: true })
      const path = join(AUDIO_DIR, kind + '.wav')
      writeFileSync(path, body)
      await saveConfig({ [kind === 'shutdown' ? 'shutdownAudio' : 'startupAudio']: path })
      json(res, 200, { ...state(), path })
    } catch (error) {
      json(res, 400, { ok: false, error: String(error?.message ?? error) })
    }
  }

  try {
    ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: API, handler }), 'dsh-voice-greeting: api')
    ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: API + '/preview', handler: preview }), 'dsh-voice-greeting: preview')
    ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: API + '/devices', handler: devices }), 'dsh-voice-greeting: devices')
    ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: API + '/upload', handler: upload }), 'dsh-voice-greeting: upload')
  } catch (error) {
    log('web route mount failed:', String(error?.message ?? error))
  }

  try { ctx.effect(() => () => cleanup(), 'dsh-voice-greeting: lifecycle') } catch {}
  try { ctx.on('dispose', cleanup) } catch {}
  process.once('exit', cleanup)
  process.once('SIGINT', () => { cleanup(); process.exit(0) })
  process.once('SIGTERM', () => { cleanup(); process.exit(0) })
}
