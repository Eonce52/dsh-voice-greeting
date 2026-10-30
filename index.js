/**
 * dsh-voice-greeting — DSH startup greeting / shutdown farewell.
 *
 * Host-side Cordis plugin.  The WAV files are pre-generated, so startup is
 * instant even when the TTS service is cold.  The settings page reads and
 * writes a small JSON section through /api/dsh-voice-greeting.
 */
import { spawn, spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { createHash } from 'node:crypto'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import z from '@deepseek-ai/schemastery'

const PKG_DIR = dirname(fileURLToPath(import.meta.url))
const WIN_PLAYER = join(PKG_DIR, 'scripts', 'play-wav.ps1')
const SHUTDOWN_WATCHER_VBS = join(PKG_DIR, 'scripts', 'shutdown-watch.vbs')
const WSCRIPT_EXE = join(process.env.WINDIR || 'C:\\Windows', 'System32', 'wscript.exe')
export function findProfileRoot(start) {
  let dir = start
  for (let i = 0; i < 9; i++) {
    const packageFile = join(dir, 'package.json')
    if (existsSync(join(dir, 'cordis.patch.yml')) && existsSync(packageFile)) {
      try {
        const pkg = JSON.parse(readFileSync(packageFile, 'utf8'))
        if (pkg && pkg.dsh && pkg.dsh.profile) return dir
      } catch {}
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  const fallbackProfile = process.env.DSH_HOME
    ? join(process.env.DSH_HOME, 'profiles', process.env.DSH_PROFILE || 'web-desktop')
    : join(homedir(), '.dsh', 'profiles', 'web-desktop')
  return existsSync(fallbackProfile) ? fallbackProfile : dirname(dirname(start))
}
const PROFILE_DIR = findProfileRoot(PKG_DIR)
const DATA_FILE = process.env.DSH_VOICE_DATA_FILE || join(PROFILE_DIR, 'dsh-voice-greeting.json')
const AUDIO_DIR = join(dirname(DATA_FILE), 'dsh-voice-greeting-audio')
const CACHE_DIR = join(dirname(DATA_FILE), 'dsh-voice-greeting-cache')
const VOICE_LOG_FILE = join(dirname(DATA_FILE), 'dsh-voice-greeting-play.log')
const WATCHDOG_PID_FILE = join(dirname(DATA_FILE), 'dsh-voice-greeting-watchdog.pid')
const SHUTDOWN_MARKER = join(dirname(DATA_FILE), 'dsh-voice-greeting-shutdown.marker')
// 本地 TTS 服务：DSH 启动时拉起（模型随 DSH 加载），DSH 关闭时由
// shutdownServiceUrl 打 /shutdown 卸载。路径可用环境变量覆盖。
const TTS_PYTHON = process.env.DSH_VOICE_TTS_PYTHON || 'D:\\GPT-SoVITS\\runtime\\python.exe'
const TTS_SERVER = process.env.DSH_VOICE_TTS_SERVER || 'D:\\GPT-SoVITS\\voice_server.py'
const TTS_HEALTH = process.env.DSH_VOICE_TTS_HEALTH || 'http://127.0.0.1:9880/health'
const NS = 'dsh-voice-greeting'
const API = '/api/dsh-voice-greeting'
const DRY = process.env.DSH_VOICE_GREETING_DRY === '1'
const MAX_UPLOAD_BYTES = 64 * 1024 * 1024
const MAX_CACHE_FILES = 128
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
const SUPPORTED_EXTS = new Set(['.wav', '.mp3', '.m4a', '.aac', '.flac', '.ogg', '.opus', '.wma', '.aiff', '.aif', '.mp4', '.m4v', '.mov', '.mkv', '.webm'])
const ffmpegPathCache = new Map()

export const name = 'dsh-voice-greeting'
/** webServer is optional: non-web hosts still get startup/shutdown playback. */
export const inject = []

const ConfigSchema = z.object({
  enabled: z.boolean().default(true),
  startupAudio: z.string().default(''),
  startupAudios: z.array(z.string()).default([]),
  shutdownAudio: z.string().default(''),
  shutdownAudios: z.array(z.string()).default([]),
  shutdownServiceUrl: z.string().default(''),
  outputDevice: z.string().default(''),
  volume: z.number().default(100),
  fadeInMs: z.number().default(30),
  fadeOutMs: z.number().default(80),
  startupBlocking: z.boolean().default(false),
  warmTts: z.boolean().default(true),
  watchdogEnabled: z.boolean().default(true),
  ffmpegPath: z.string().default(''),
  ttsPython: z.string().default(''),
  ttsServer: z.string().default(''),
  ttsHealth: z.string().default(''),
})

export const Config = ConfigSchema

function log(...args) {
  console.log('[dsh-voice-greeting]', ...args)
}

function runtimeLog(...args) {
  try {
    mkdirSync(dirname(VOICE_LOG_FILE), { recursive: true })
    appendFileSync(VOICE_LOG_FILE, `${new Date().toISOString()} [host] ${args.map(String).join(' ')}\n`, 'utf8')
  } catch {}
}

function readJsonObject(file) {
  try {
    const value = JSON.parse(readFileSync(file, 'utf8'))
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch { return null }
}

function writeJsonAtomic(file, value) {
  mkdirSync(dirname(file), { recursive: true })
  const temp = `${file}.tmp`
  const backup = `${file}.bak`
  writeFileSync(temp, JSON.stringify(value, null, 2), 'utf8')
  if (existsSync(file)) {
    try { writeFileSync(backup, readFileSync(file)) } catch {}
  }
  renameSync(temp, file)
}

function pruneCache() {
  try {
    if (!existsSync(CACHE_DIR)) return
    const now = Date.now()
    const files = readdirSync(CACHE_DIR, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.wav$/i.test(entry.name))
      .map((entry) => {
        const path = join(CACHE_DIR, entry.name)
        let mtime = 0
        try { mtime = statSync(path).mtimeMs } catch {}
        return { path, mtime }
      })
      .sort((a, b) => b.mtime - a.mtime)
    for (let i = 0; i < files.length; i++) {
      if (i >= MAX_CACHE_FILES || (files[i].mtime > 0 && now - files[i].mtime > CACHE_MAX_AGE_MS)) {
        try { unlinkSync(files[i].path) } catch {}
      }
    }
  } catch {}
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
        tag: buffer.readUInt16LE(body),
        format: buffer.readUInt16LE(body) === 0xfffe && body + 40 <= buffer.length ? buffer.readUInt16LE(body + 24) : buffer.readUInt16LE(body),
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
  if (fmt.format !== 1 && fmt.format !== 3) throw new Error(`编码格式 ${fmt.format} 不受支持`)
  if (fmt.format === 1 && ![8, 16, 24, 32].includes(fmt.bits)) throw new Error(`PCM 位深 ${fmt.bits} 不受支持`)
  if (fmt.format === 3 && ![32, 64].includes(fmt.bits)) throw new Error(`浮点位深 ${fmt.bits} 不受支持`)
  if (fmt.channels !== 1 && fmt.channels !== 2) throw new Error('只支持单声道或立体声')
  if (!fmt.sampleRate || !fmt.blockAlign) throw new Error('WAV fmt 信息不完整')
  return { fmt, data }
}

function wavSampleToInt16(buffer, at, fmt) {
  if (fmt.format === 3) {
    const value = fmt.bits === 64 ? buffer.readDoubleLE(at) : buffer.readFloatLE(at)
    return Math.max(-32768, Math.min(32767, Math.round(Math.max(-1, Math.min(1, value)) * 32767)))
  }
  if (fmt.bits === 8) return (buffer.readUInt8(at) - 128) << 8
  if (fmt.bits === 16) return buffer.readInt16LE(at)
  if (fmt.bits === 24) return buffer.readIntLE(at, 3) >> 8
  if (fmt.bits === 32) return buffer.readInt32LE(at) >> 16
  throw new Error(`PCM 位深 ${fmt.bits} 不受支持`)
}

function wavToPcm16(buffer, parsed) {
  const { fmt, data } = parsed
  const channels = fmt.channels
  const sampleRate = fmt.sampleRate
  const sampleBytes = Math.floor(fmt.bits / 8)
  const frames = Math.floor(data.size / fmt.blockAlign)
  const outSize = frames * channels * 2
  const out = Buffer.alloc(44 + outSize)
  out.write('RIFF', 0, 'ascii')
  out.writeUInt32LE(36 + outSize, 4)
  out.write('WAVE', 8, 'ascii')
  out.write('fmt ', 12, 'ascii')
  out.writeUInt32LE(16, 16)
  out.writeUInt16LE(1, 20)
  out.writeUInt16LE(channels, 22)
  out.writeUInt32LE(sampleRate, 24)
  out.writeUInt32LE(sampleRate * channels * 2, 28)
  out.writeUInt16LE(channels * 2, 32)
  out.writeUInt16LE(16, 34)
  out.write('data', 36, 'ascii')
  out.writeUInt32LE(outSize, 40)
  for (let frame = 0; frame < frames; frame++) {
    for (let channel = 0; channel < channels; channel++) {
      const srcAt = data.offset + frame * fmt.blockAlign + channel * sampleBytes
      out.writeInt16LE(wavSampleToInt16(buffer, srcAt, fmt), 44 + (frame * channels + channel) * 2)
    }
  }
  return out
}


export function inspectWav(file) {
  try {
    const buf = readFileSync(file)
    const { fmt, data } = parseWav(buf)
    return { ok: true, info: { ...fmt, pcm16: fmt.format === 1 && fmt.bits === 16, duration: data.size / fmt.blockAlign / fmt.sampleRate } }
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) }
  }
}

export function findFfmpeg(override = '') {
  const explicit = String(override || '').trim()
  if (explicit) {
    const path = expandPath(explicit)
    if (path && existsSync(path)) return path
  }
  const cacheKey = '__auto__'
  if (ffmpegPathCache.has(cacheKey)) return ffmpegPathCache.get(cacheKey)
  const candidates = [
    process.env.DSH_VOICE_FFMPEG,
    join(PKG_DIR, 'bin', 'ffmpeg.exe'),
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links', 'ffmpeg.exe') : '',
    process.env.ProgramFiles ? join(process.env.ProgramFiles, 'ffmpeg', 'bin', 'ffmpeg.exe') : '',
    process.env['ProgramFiles(x86)'] ? join(process.env['ProgramFiles(x86)'], 'ffmpeg', 'bin', 'ffmpeg.exe') : '',
    process.env.ProgramData ? join(process.env.ProgramData, 'chocolatey', 'bin', 'ffmpeg.exe') : '',
    process.env.USERPROFILE ? join(process.env.USERPROFILE, 'scoop', 'shims', 'ffmpeg.exe') : '',
    'C:/ffmpeg/bin/ffmpeg.exe',
  ].filter(Boolean)
  for (const candidate of candidates) {
    if (existsSync(candidate)) { ffmpegPathCache.set(cacheKey, candidate); return candidate }
  }
  try {
    const found = spawnSync('where.exe', ['ffmpeg.exe'], { timeout: 5000, windowsHide: true, encoding: 'utf8' })
    const first = String(found.stdout || '').split(/\r?\n/).map((line) => line.trim()).find(Boolean)
    if (first && existsSync(first)) { ffmpegPathCache.set(cacheKey, first); return first }
  } catch {}
  ffmpegPathCache.set(cacheKey, null)
  return null
}

function decodeToWav(file, ffmpeg) {
  const stat = statSync(file)
  const key = createHash('sha1').update(file).update(String(stat.mtimeMs)).update(String(stat.size)).update(ffmpeg).digest('hex').slice(0, 16)
  const cached = join(CACHE_DIR, `decoded-${key}.wav`)
  if (existsSync(cached)) return cached
  mkdirSync(CACHE_DIR, { recursive: true })
  const temp = cached + '.tmp.wav'
  const result = spawnSync(ffmpeg, [
    '-y', '-hide_banner', '-nostdin', '-loglevel', 'error',
    '-i', file, '-vn', '-sn', '-dn', '-ar', '44100', '-ac', '2', '-c:a', 'pcm_s16le', temp,
  ], { timeout: 30000, windowsHide: true, encoding: 'utf8' })
  if (result.error || result.status !== 0 || !existsSync(temp)) {
    try { unlinkSync(temp) } catch {}
    throw new Error(String(result.error?.message || result.stderr || `ffmpeg exit ${result.status}`))
  }
  renameSync(temp, cached)
  return cached
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export function prepareWav(file, volume = 100, fadeInMs = 0, fadeOutMs = 0) {
  const original = readFileSync(file)
  let raw = original
  let parsed = parseWav(raw)
  if (!(parsed.fmt.format === 1 && parsed.fmt.bits === 16)) {
    raw = wavToPcm16(original, parsed)
    parsed = parseWav(raw)
  }
  const { fmt, data } = parsed
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

export function preparePlayableWav(file, cfg = {}) {
  const wav = inspectWav(file)
  let source = file
  if (!wav.ok) {
    const ffmpeg = findFfmpeg(cfg.ffmpegPath)
    if (!ffmpeg) throw new Error(String(file).toLowerCase().endsWith('.wav') ? `WAV 无法解码：${wav.error}` : `不是 PCM WAV（${wav.error}）；当前格式需要 ffmpeg`)
    source = decodeToWav(file, ffmpeg)
  }
  return prepareWav(source, cfg.volume ?? 100, cfg.fadeInMs ?? 0, cfg.fadeOutMs ?? 0)
}

function audioInfo(file, cfg = {}) {
  const wav = inspectWav(file)
  if (wav.ok) return wav
  const ffmpeg = findFfmpeg(cfg.ffmpegPath)
  if (!ffmpeg) return { ok: false, error: `不是 PCM WAV（${wav.error}）；非 WAV 格式需要 ffmpeg` }
  try {
    return inspectWav(decodeToWav(file, ffmpeg))
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) }
  }
}

export function withPlaylists(config) {
  const next = { ...config }
  for (const kind of ['startup', 'shutdown']) {
    const listKey = kind === 'startup' ? 'startupAudios' : 'shutdownAudios'
    const singleKey = kind === 'startup' ? 'startupAudio' : 'shutdownAudio'
    let list = Array.isArray(next[listKey]) ? next[listKey].map((item) => String(item || '').trim()).filter(Boolean) : []
    const single = String(next[singleKey] || '').trim()
    if (list.length === 0 && single) list = [single]
    next[listKey] = [...new Set(list)]
  }
  return next
}

export function audioCandidates(config, kind) {
  const listKey = kind === 'startup' ? 'startupAudios' : 'shutdownAudios'
  const singleKey = kind === 'startup' ? 'startupAudio' : 'shutdownAudio'
  const list = Array.isArray(config[listKey]) ? config[listKey].map((item) => String(item || '').trim()).filter(Boolean) : []
  if (list.length > 0) return [...new Set(list)]
  const single = String(config[singleKey] || '').trim()
  return single ? [single] : []
}

export function pickRandomAudio(config, kind, lastPick) {
  const list = audioCandidates(config, kind)
  if (list.length === 0) return ''
  let picked
  if (list.length === 1) {
    picked = list[0]
  } else {
    const previous = lastPick[kind]
    const pool = list.filter((item) => item !== previous)
    picked = (pool.length > 0 ? pool : list)[Math.floor(Math.random() * (pool.length > 0 ? pool.length : list.length))]
  }
  lastPick[kind] = picked
  return picked
}

function isProcessAlive(pid) {
  if (!Number.isFinite(Number(pid)) || Number(pid) <= 0) return false
  try { process.kill(Number(pid), 0); return true } catch { return false }
}

function playFile(file, label, sync = false, cfg = {}, waitDeviceMs = 0) {
  const path = expandPath(file)
  if (!path) return false
  if (!existsSync(path)) {
    log(`${label} audio not found:`, path)
    return false
  }
  let prepared
  try {
    prepared = preparePlayableWav(path, cfg)
  } catch (error) {
    log(`${label} invalid audio:`, path, String(error?.message ?? error))
    return false
  }
  if (DRY) { runtimeLog(label, 'dry-run', prepared); return true }
  const info = inspectWav(prepared)
  const durationMs = info.ok ? Math.round((info.info?.duration || 0) * 1000) : 0
  const syncTimeoutMs = clamp(durationMs + Math.max(0, Number(waitDeviceMs) || 0) + 4000, 3000, 30000)
  if (process.platform === 'win32') {
    const args = ['-NoProfile', '-WindowStyle', 'Hidden', '-STA', '-ExecutionPolicy', 'Bypass', '-File', WIN_PLAYER, '-Path', prepared, '-LogPath', VOICE_LOG_FILE, '-WaitDeviceMs', String(waitDeviceMs)]
    runtimeLog(label, sync ? 'spawn' : 'async-spawn', cfg.outputDevice || 'default', path)
    if (cfg.outputDevice) args.push('-Device', String(cfg.outputDevice))
    if (sync) {
      const result = spawnSync('powershell.exe', args, { timeout: syncTimeoutMs, windowsHide: true, encoding: 'utf8' }); if (result.error || result.status !== 0) { log(`${label} play failed:`, String(result.error?.message || result.stderr || `exit ${result.status}`)); runtimeLog(label, 'sync-failed', String(result.error?.message || result.stderr || `exit ${result.status}`)); return false }; runtimeLog(label, 'sync-ok')
    } else {
      const child = spawn('powershell.exe', args, { detached: true, stdio: 'ignore', windowsHide: true })
      child.on('error', (error) => runtimeLog(label, 'spawn-error', String(error?.message ?? error)))
      child.on('exit', (code, signal) => runtimeLog(label, 'player-exit', code, signal))
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

/**
 * DSH 启动即把本地 GPT-SoVITS 模型拉起来（隐藏窗口，不阻塞问候音）。
 * 带上 VOICE_OWNER_PID，服务端会盯着 DSH 进程：DSH 一没，显存立刻还回去。
 */
function ttsPaths(cfg = {}) {
  return {
    python: expandPath(String(cfg.ttsPython || '').trim() || TTS_PYTHON),
    server: expandPath(String(cfg.ttsServer || '').trim() || TTS_SERVER),
    health: String(cfg.ttsHealth || '').trim() || TTS_HEALTH,
  }
}

function warmTtsServer(cfg = {}) {
  if (process.platform !== 'win32' || DRY) return
  if (cfg.warmTts === false) { runtimeLog('warm-skip', 'disabled by settings'); return }
  if (process.env.DSH_VOICE_TTS_WARM === '0') { runtimeLog('warm-skip', 'disabled by env'); return }
  const tts = ttsPaths(cfg)
  if (!existsSync(tts.python) || !existsSync(tts.server)) {
    runtimeLog('warm-skip', 'tts files missing', tts.server)
    return
  }
  try {
    const safe = tts.health.replace(/'/g, "''")
    const probe = spawnSync('powershell.exe', ['-NoProfile', '-Command', `try { if ((Invoke-RestMethod -Uri '${safe}' -TimeoutSec 2).ok) { 'RUNNING' } else { 'DOWN' } } catch { 'DOWN' }`], { timeout: 6000, windowsHide: true, encoding: 'utf8' })
    if (probe && probe.status === 0 && String(probe.stdout || '').includes('RUNNING')) {
      // 已经在跑就只记录，不重复拉起
      runtimeLog('warm', 'already-running')
      return
    }
  } catch {}
  try {
    const child = spawn(tts.python, [tts.server], {
      cwd: dirname(tts.server),
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: { ...process.env, VOICE_OWNER_PID: String(process.pid) },
    })
    child.on('error', (error) => runtimeLog('warm-error', String(error?.message ?? error)))
    // 秒退一般是别的实例已经在跑（锁文件冲突），记一笔方便排查
    child.on('exit', (code) => runtimeLog('warm-exit', code))
    child.unref()
    runtimeLog('warm', 'spawned', process.pid)
  } catch (error) {
    runtimeLog('warm-error', String(error?.message ?? error))
  }
}

function ttsStatus(cfg = {}) {
  const tts = ttsPaths(cfg)
  return {
    configured: cfg.warmTts !== false && process.env.DSH_VOICE_TTS_WARM !== '0',
    supported: process.platform === 'win32',
    python: expandPath(tts.python),
    server: expandPath(tts.server),
    health: tts.health,
    filesPresent: existsSync(expandPath(tts.python)) && existsSync(expandPath(tts.server)),
  }
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

function readBody(req, limit = 256 * 1024) {
  return new Promise((resolveBody, rejectBody) => {
    let data = ''
    let size = 0
    req.on('data', (chunk) => {
      size += Buffer.byteLength(chunk)
      if (size > limit) { rejectBody(new Error(`请求体超过 ${Math.round(limit / 1024)}KB 限制`)); req.destroy(); return }
      data += String(chunk)
    })
    req.on('end', () => {
      try { resolveBody(JSON.parse(data || '{}')) } catch { resolveBody(null) }
    })
    req.on('error', (error) => rejectBody(error))
  })
}

function readRawBody(req, limit = MAX_UPLOAD_BYTES) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += buffer.length
      if (size > limit) { rejectBody(new Error(`音频文件超过 ${Math.round(limit / 1024 / 1024)}MB 限制`)); req.destroy(); return }
      chunks.push(buffer)
    })
    req.on('end', () => resolveBody(Buffer.concat(chunks)))
    req.on('error', (error) => rejectBody(error))
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
  const readStored = () => readJsonObject(DATA_FILE) ?? readJsonObject(`${DATA_FILE}.bak`) ?? {}
  const readConfig = () => withPlaylists(ConfigSchema({ ...config, ...readStored() }))
  const saveConfig = async (patch) => {
    const next = withPlaylists(ConfigSchema({ ...readConfig(), ...patch }))
    writeJsonAtomic(DATA_FILE, next)
    return next
  }
  const lastPick = { startup: '', shutdown: '' }

  let watchdogPid = 0
  function stopShutdownWatcher() {
    if (process.platform !== 'win32') return
    let oldPid = Number(watchdogPid) || 0
    try {
      if (!(oldPid > 0) && existsSync(WATCHDOG_PID_FILE)) oldPid = Number(readFileSync(WATCHDOG_PID_FILE, 'utf8')) || 0
    } catch {}
    if (oldPid > 0) {
      try { spawnSync('powershell.exe', ['-NoProfile', '-Command', `$p=Get-CimInstance Win32_Process -Filter "ProcessId=${oldPid}"; if ($p -and $p.CommandLine -like '*shutdown-watch*') { Stop-Process -Id ${oldPid} -Force }`], { timeout: 8000, windowsHide: true, stdio: 'ignore' }) } catch {}
    }
    watchdogPid = 0
    try { unlinkSync(WATCHDOG_PID_FILE) } catch {}
  }

  function startShutdownWatcher(cfg) {
    if (process.platform !== 'win32') return
    if (cfg.watchdogEnabled === false) { runtimeLog('watchdog-skip', 'disabled by settings'); return }
    if (audioCandidates(cfg, 'shutdown').length === 0) return
    try {
      stopShutdownWatcher()
      const selectedShutdown = pickRandomAudio(cfg, 'shutdown', lastPick)
      const shutdownSource = expandPath(selectedShutdown)
      if (!shutdownSource || !existsSync(shutdownSource)) { runtimeLog('watchdog-skip', 'missing audio', shutdownSource || selectedShutdown || cfg.shutdownAudio); return }
      runtimeLog('watchdog-selected', selectedShutdown)
      let audio
      try {
        audio = preparePlayableWav(shutdownSource, cfg)
      } catch (error) {
        runtimeLog('watchdog-skip', 'prepare failed', String(error?.message ?? error))
        return
      }
      const device = String(cfg.outputDevice || '').replace(/"/g, '')
      if (!existsSync(SHUTDOWN_WATCHER_VBS)) { runtimeLog('watchdog-skip', 'vbs watcher missing', SHUTDOWN_WATCHER_VBS); return }
      let pid = 0
      const q = (value) => `"${String(value).replace(/"/g, '')}"`
      const cmd = `${q(WSCRIPT_EXE)} //nologo ${q(SHUTDOWN_WATCHER_VBS)} ${process.pid} ${q(WIN_PLAYER)} ${q(audio)} ${q(device)} ${q(VOICE_LOG_FILE)} ${q(SHUTDOWN_MARKER)}`
      try {
        const safe = cmd.replace(/'/g, "''")
        const ps = `$r=Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine='${safe}'}; Write-Output $r.ProcessId`
        const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', ps], { timeout: 10000, windowsHide: true, encoding: 'utf8' })
        pid = Number(String(result.stdout || '').trim()) || 0
        if (!(pid > 0)) runtimeLog('watchdog-wmi-failed', String(result.stderr || result.stdout || result.error?.message || 'no pid'))
      } catch (error) {
        runtimeLog('watchdog-wmi-error', String(error?.message ?? error))
      }
      if (!(pid > 0)) {
        try {
          const child = spawn(WSCRIPT_EXE, ['//nologo', SHUTDOWN_WATCHER_VBS, String(process.pid), WIN_PLAYER, audio, device, VOICE_LOG_FILE, SHUTDOWN_MARKER], { detached: true, stdio: 'ignore', windowsHide: true })
          child.on('error', (error) => runtimeLog('watchdog-direct-error', String(error?.message ?? error)))
          child.unref()
          pid = Number(child.pid) || 0
          runtimeLog('watchdog-direct-fallback', pid)
        } catch (error) {
          runtimeLog('watchdog-direct-failed', String(error?.message ?? error))
        }
      }
      if (pid > 0) {
        watchdogPid = pid
        writeFileSync(WATCHDOG_PID_FILE, String(pid), 'utf8')
        runtimeLog('watchdog-started', pid)
      } else {
        runtimeLog('watchdog-failed', 'no usable watcher process')
      }
    } catch (error) {
      runtimeLog('watchdog-error', String(error?.message ?? error))
    }
  }



  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    const cfg = readConfig()
    if (!cfg.enabled) return
    runtimeLog('cleanup', `watchdogPid=${watchdogPid} playing-fallback`)
    const selectedShutdown = pickRandomAudio(cfg, 'shutdown', lastPick)
    const played = playFile(selectedShutdown, 'shutdown', true, cfg)
    if (played) {
      try { writeFileSync(SHUTDOWN_MARKER, new Date().toISOString(), 'utf8') } catch {}
    }
    postShutdown(cfg.shutdownServiceUrl)
  }

  pruneCache()
  const initial = readConfig()
  if (initial.enabled) {
    try { unlinkSync(SHUTDOWN_MARKER) } catch {}
    const selectedStartup = pickRandomAudio(initial, 'startup', lastPick)
    const blocking = initial.startupBlocking === true
    runtimeLog('apply', blocking ? 'startup blocking-start' : 'startup async-start', selectedStartup, initial.outputDevice || 'default')
    warmTtsServer(initial)
    // 先起看守，再放启动音：即使启动阶段被强杀，关闭音也有兜底。
    startShutdownWatcher(initial)
    playFile(selectedStartup, 'startup', blocking, initial, 8000)
  }

  let webServerMounted = false
  const state = () => {
    const cfg = readConfig()
    const startupList = audioCandidates(cfg, 'startup')
    const shutdownList = audioCandidates(cfg, 'shutdown')
    const firstStartup = startupList.find((item) => existsSync(expandPath(item))) || ''
    const firstShutdown = shutdownList.find((item) => existsSync(expandPath(item))) || ''
    const ffmpegPath = findFfmpeg(cfg.ffmpegPath)
    const tts = ttsStatus(cfg)
    const warnings = []
    if (startupList.length === 0) warnings.push('启动音未配置，当前启动时保持静音')
    if (shutdownList.length === 0) warnings.push('关闭音未配置，当前关闭时保持静音')
    if (!ffmpegPath && [...startupList, ...shutdownList].some((item) => !/\.wav$/i.test(item))) warnings.push('列表含非 WAV 音频，但未找到 ffmpeg')
    if (tts.configured && !tts.filesPresent) warnings.push('TTS 预热已开启，但 Python 或服务脚本不存在')

    return {
      ok: true,
      version: '0.3.9',
      platform: process.platform,
      webServer: webServerMounted,
      paths: {
        profile: PROFILE_DIR,
        data: DATA_FILE,
        audio: AUDIO_DIR,
        cache: CACHE_DIR,
        log: VOICE_LOG_FILE,
      },
      ffmpeg: { ok: Boolean(ffmpegPath), path: ffmpegPath || '', configured: Boolean(String(cfg.ffmpegPath || '').trim()) },
      tts,
      watchdog: {
        enabled: cfg.watchdogEnabled !== false,
        running: Number(watchdogPid) > 0,
        pid: Number(watchdogPid) || 0,
      },
      config: cfg,
      counts: { startup: startupList.length, shutdown: shutdownList.length },
      warnings,
      exists: {
        startup: Boolean(firstStartup),
        shutdown: Boolean(firstShutdown),
        startupWav: firstStartup ? audioInfo(expandPath(firstStartup), cfg) : null,
        shutdownWav: firstShutdown ? audioInfo(expandPath(firstShutdown), cfg) : null,
      },
    }
  }

  const handler = async (req, res) => {
    if (!loopbackAllowed(req)) { json(res, 403, { ok: false, error: 'loopback-only' }); return }
    try {
      if (req.method === 'GET') { json(res, 200, state()); return }
      if (req.method !== 'POST') { json(res, 405, { ok: false, error: 'method not allowed' }); return }
      const body = await readBody(req)
      if (body === null) { json(res, 400, { ok: false, error: 'JSON 格式无效' }); return }
      const patch = {}
      for (const key of ['enabled', 'startupBlocking', 'warmTts', 'watchdogEnabled']) {
        if (typeof body?.[key] === 'boolean') patch[key] = body[key]
      }
      for (const key of ['startupAudio', 'shutdownAudio', 'shutdownServiceUrl', 'outputDevice', 'ffmpegPath', 'ttsPython', 'ttsServer', 'ttsHealth']) {
        if (typeof body?.[key] === 'string') patch[key] = body[key].trim()
      }
      if (Array.isArray(body?.startupAudios)) {
        patch.startupAudios = body.startupAudios.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim()).slice(0, 100)
        patch.startupAudio = ''
      }
      if (Array.isArray(body?.shutdownAudios)) {
        patch.shutdownAudios = body.shutdownAudios.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim()).slice(0, 100)
        patch.shutdownAudio = ''
      }

      if (Number.isFinite(Number(body?.volume))) patch.volume = clamp(Number(body.volume), 0, 100)
      if (Number.isFinite(Number(body?.fadeInMs))) patch.fadeInMs = clamp(Number(body.fadeInMs), 0, 2000)
      if (Number.isFinite(Number(body?.fadeOutMs))) patch.fadeOutMs = clamp(Number(body.fadeOutMs), 0, 2000)
      if (Object.keys(patch).length > 0) await saveConfig(patch)
      const saved = readConfig()
      const watchdogChanged = Object.prototype.hasOwnProperty.call(patch, 'shutdownAudios') ||
        Object.prototype.hasOwnProperty.call(patch, 'shutdownAudio') ||
        Object.prototype.hasOwnProperty.call(patch, 'watchdogEnabled') ||
        Object.prototype.hasOwnProperty.call(patch, 'outputDevice')
      if (watchdogChanged) {
        stopShutdownWatcher()
        if (saved.enabled && saved.watchdogEnabled !== false) startShutdownWatcher(saved)
      }
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
      const list = audioCandidates(cfg, kind)
      const path = supplied || list[0] || ''
      const resolved = expandPath(path)
      if (!path) { json(res, 400, { ok: false, error: '音频路径为空' }); return }
      if (!resolved || !existsSync(resolved)) {
        json(res, 400, { ok: false, error: `音频文件不存在：${resolved || path}`, path: resolved || path }); return
      }
      const wav = audioInfo(resolved, cfg)
      if (!wav.ok) {
        json(res, 400, { ok: false, error: `音频无法解码：${wav.error}`, path: resolved }); return
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


  const openDataDir = async (req, res) => {
    if (!loopbackAllowed(req)) { json(res, 403, { ok: false, error: 'loopback-only' }); return }
    if (req.method !== 'POST') { json(res, 405, { ok: false, error: 'method not allowed' }); return }
    try {
      const dir = dirname(DATA_FILE)
      mkdirSync(dir, { recursive: true })
      const command = process.platform === 'win32' ? 'explorer.exe' : (process.platform === 'darwin' ? 'open' : 'xdg-open')
      const child = spawn(command, [dir], { detached: true, stdio: 'ignore', windowsHide: true })
      child.on('error', (error) => runtimeLog('open-dir-error', String(error?.message ?? error)))
      child.unref()
      json(res, 200, { ok: true, path: dir })
    } catch (error) {
      json(res, 500, { ok: false, error: String(error?.message ?? error) })
    }
  }

  const clearCache = async (req, res) => {
    if (!loopbackAllowed(req)) { json(res, 403, { ok: false, error: 'loopback-only' }); return }
    if (req.method !== 'POST') { json(res, 405, { ok: false, error: 'method not allowed' }); return }
    let removed = 0
    try {
      if (existsSync(CACHE_DIR)) {
        for (const entry of readdirSync(CACHE_DIR, { withFileTypes: true })) {
          if (entry.isFile() && /\.wav$/i.test(entry.name)) {
            try { unlinkSync(join(CACHE_DIR, entry.name)); removed++ } catch {}
          }
        }
      }
      pruneCache()
      json(res, 200, { ...state(), removed })
    } catch (error) {
      json(res, 500, { ok: false, error: String(error?.message ?? error) })
    }
  }

  const upload = async (req, res) => {
    if (!loopbackAllowed(req)) { json(res, 403, { ok: false, error: 'loopback-only' }); return }
    if (req.method !== 'POST') { json(res, 405, { ok: false, error: 'method not allowed' }); return }
    try {
      const kind = String(req.headers?.['x-dvg-kind'] || 'startup').toLowerCase() === 'shutdown' ? 'shutdown' : 'startup'
      const ext = String(req.headers?.['x-dvg-ext'] || '.wav').toLowerCase()
      if (!SUPPORTED_EXTS.has(ext)) { json(res, 400, { ok: false, error: `不支持的音频格式：${ext}` }); return }
      const body = await readRawBody(req)
      if (body.length === 0) { json(res, 400, { ok: false, error: '空文件' }); return }

      mkdirSync(AUDIO_DIR, { recursive: true })
      const digest = createHash('sha1').update(body).digest('hex').slice(0, 16)
      const path = join(AUDIO_DIR, `${kind}-${digest}${ext}`)
      if (!existsSync(path)) {
        const temp = path + '.tmp'
        writeFileSync(temp, body)
        try {
          preparePlayableWav(temp, readConfig())
        } catch (error) {
          try { unlinkSync(temp) } catch {}
          throw new Error(`无法识别音频格式：${String(error?.message ?? error)}`)
        }
        renameSync(temp, path)
      }
      const cfg = readConfig()
      const listKey = kind === 'shutdown' ? 'shutdownAudios' : 'startupAudios'
      const singleKey = kind === 'shutdown' ? 'shutdownAudio' : 'startupAudio'
      const nextList = [...new Set([...audioCandidates(cfg, kind), path])].slice(-100)
      await saveConfig({ [listKey]: nextList, [singleKey]: '' })
      json(res, 200, { ...state(), path })
    } catch (error) {
      json(res, 400, { ok: false, error: String(error?.message ?? error) })
    }
  }

  const mountWebServer = (scope) => {
    const server = scope?.webServer
    if (!server || typeof server.register !== 'function') throw new Error('webServer service is unavailable')
    const routes = [
      ['api', API, handler],
      ['preview', API + '/preview', preview],
      ['devices', API + '/devices', devices],
      ['upload', API + '/upload', upload],
      ['open-dir', API + '/open-dir', openDataDir],
      ['clear-cache', API + '/clear-cache', clearCache],
    ]
    let mounted = 0
    for (const [label, path, routeHandler] of routes) {
      try {
        scope.effect(() => server.register({ kind: 'exact', path, handler: routeHandler }), `dsh-voice-greeting: ${label}`)
        mounted++
      } catch (error) {
        log(`web route ${label} mount failed:`, String(error?.message ?? error))
      }
    }
    webServerMounted = mounted > 0
  }

  if (typeof ctx.inject === 'function') {
    try {
      ctx.inject(['webServer'], (scope) => {
        try { mountWebServer(scope) } catch (error) { log('web route mount failed:', String(error?.message ?? error)) }
      })
    } catch (error) {
      if (ctx.webServer) mountWebServer(ctx)
      else log('web route mount failed:', String(error?.message ?? error))
    }
  } else if (ctx.webServer) {
    try { mountWebServer(ctx) } catch (error) { log('web route mount failed:', String(error?.message ?? error)) }
  }

  try { ctx.effect(() => () => cleanup(), 'dsh-voice-greeting: lifecycle') } catch {}
  try { ctx.on('dispose', cleanup) } catch {}
  process.once('exit', cleanup)
  process.once('SIGINT', () => { cleanup(); process.exit(0) })
  process.once('SIGTERM', () => { cleanup(); process.exit(0) })
}
