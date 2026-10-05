// Lists every text used with t() (and the animal / nikud names) and fails if one has no
// Russian translation in src/lib/ru.ts. Run: node scripts/check-i18n.mjs [--list]
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) ? [p] : []
  })
}

const keys = new Set()
const files = walk('src')
for (const f of files) {
  if (f.endsWith('lib/i18n.ts') || f.endsWith('ru.ts')) continue
  const s = readFileSync(f, 'utf8')
  for (const m of s.matchAll(/\bt\(\s*'((?:[^'\\\n]|\\.)*)'/g)) keys.add(m[1].replace(/\\'/g, "'"))
  for (const m of s.matchAll(/\bt\(\s*"((?:[^"\\\n]|\\.)*)"/g)) keys.add(m[1])
  for (const m of s.matchAll(/\bt\(\s*`([^`$]*)`/g)) keys.add(m[1])
  // names shown through t(x.name): animals and nikud (not the letter names)
  let scope = ''
  if (f.endsWith('stars.ts')) scope = s
  if (f.endsWith('data/hebrew.ts')) {
    scope = s.slice(s.indexOf('export const NIKUD:'), s.indexOf('export const SYLLABLE_LETTERS'))
    scope += s.slice(s.indexOf('export const NIKUD_KEYBOARD'), s.indexOf('type Unit'))
  }
  for (const m of scope.matchAll(/name:\s*'([^']*[\u05D0-\u05EA][^']*)'/g)) keys.add(m[1])
}
// error keys returned by errorKey()
for (const m of readFileSync('src/lib/supabase.ts', 'utf8').matchAll(/return '([^']*[א-ת][^']*)'/g)) keys.add(m[1])

const ru = readFileSync('src/lib/ru.ts', 'utf8')
const have = new Set([...ru.matchAll(/^\s*'((?:[^'\\\n]|\\.)*)':/gm)].map((m) => m[1].replace(/\\'/g, "'")))
const missing = [...keys].filter((k) => !have.has(k))
const unused = [...have].filter((k) => !keys.has(k))
if (process.argv.includes('--list')) console.log([...keys].join('\n'))
console.log(`${keys.size} texts, ${missing.length} without Russian, ${unused.length} unused entries`)
for (const k of missing) console.log('MISSING:', k)
for (const k of unused) console.log('UNUSED:', k)
process.exit(missing.length ? 1 : 0)
