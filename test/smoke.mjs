import { resolve } from 'node:path'
import { apply, expandPath, name } from '../index.js'

const absolute = resolve('startup.wav')
if (expandPath(`"${absolute}"`) !== absolute) throw new Error('quoted absolute path was not normalized')
if (expandPath(`  '${absolute}'  `) !== absolute) throw new Error('single-quoted path was not normalized')
if (expandPath('') !== '') throw new Error('empty path should stay empty')

process.env.DSH_VOICE_GREETING_DRY = '1'
const cleanups = []
const ctx = {
  effect(fn) { const d = fn(); if (typeof d === 'function') cleanups.push(d) },
  on(event, fn) { if (event === 'dispose') cleanups.push(fn) },
}
apply(ctx, { startupAudio: 'startup.wav', shutdownAudio: 'shutdown.wav' })
if (name !== 'dsh-voice-greeting') throw new Error('bad plugin name')
for (const fn of cleanups) fn()
console.log('smoke ok')
