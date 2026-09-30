// Content edits from the settings page. Every write needs the parent code (checked by RLS).
import { LETTERS, NIKUD, hasNikud, parseWord, stripNikud } from '../data/hebrew'
import { getContent, refreshContent } from './content'
import { Group, removeAudio, supabase, uploadAudio } from './supabase'

function db() {
  if (!supabase) throw new Error('אין חיבור לשרת')
  return supabase
}

function check<T extends { error: { message: string } | null }>(res: T): T {
  if (res.error) throw new Error(res.error.message)
  return res
}

// --- Syllable recordings ----------------------------------------------------

export async function saveSyllableRecording(letterId: number, nikudId: number, blob: Blob) {
  const letter = LETTERS.find((l) => l.id === letterId)!
  const nikud = NIKUD.find((n) => n.id === nikudId)!
  const path = await uploadAudio('syllables', `${letter.key}_${nikud.key}`, blob)
  const existing = getContent().recordings.find(
    (r) => r.source === 'storage' && r.letter_id === letterId && r.nikud_id === nikudId,
  )
  if (existing) {
    check(await db().from('recordings').update({ audio_path: path }).eq('id', existing.id))
    await removeAudio(existing.audio_path)
  } else {
    check(
      await db()
        .from('recordings')
        .insert({ letter_id: letterId, nikud_id: nikudId, audio_path: path, source: 'storage' }),
    )
  }
  await refreshContent()
}

export async function deleteSyllableRecording(letterId: number, nikudId: number) {
  const existing = getContent().recordings.find(
    (r) => r.source === 'storage' && r.letter_id === letterId && r.nikud_id === nikudId,
  )
  if (!existing) return
  check(await db().from('recordings').delete().eq('id', existing.id))
  await removeAudio(existing.audio_path)
  await refreshContent()
}

// --- Groups and words ---------------------------------------------------------

/** One item per line (or separated by commas); blank lines ignored. */
export function splitLines(text: string): string[] {
  return text
    .split(/[\n,،]+/)
    .map((l) => l.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
}

export type LineCheck = { text: string; preview: string; warning: string | null }

export function checkLine(text: string): LineCheck {
  const syllables = text.split(' ').flatMap(parseWord)
  let warning: string | null = null
  if (!syllables.length) warning = 'אין אותיות עבריות'
  else if (!hasNikud(text)) warning = 'בלי ניקוד'
  else if (syllables.some((s) => !s.vowel && s.text.length === 1)) warning = 'אות בלי ניקוד'
  return { text, preview: syllables.map((s) => s.text).join('·'), warning }
}

function wordRow(groupId: string, text: string, sortOrder: number) {
  return {
    group_id: groupId,
    text,
    plain_text: stripNikud(text),
    syllables: text.split(' ').flatMap(parseWord),
    difficulty: Math.min(3, Math.max(1, text.split(' ').flatMap(parseWord).length)),
    sort_order: sortOrder,
  }
}

export async function createGroup(name: string, lines: string[]) {
  const groups = getContent().groups
  const sortOrder = groups.length ? Math.max(...groups.map((g) => g.sort_order)) + 1 : 1
  const { data } = check(
    await db().from('word_groups').insert({ name, sort_order: sortOrder }).select('id').single(),
  )
  const unique = [...new Set(lines)]
  if (unique.length)
    check(await db().from('words').insert(unique.map((t, i) => wordRow(data!.id, t, i + 1))))
  await refreshContent()
}

/** Rename and set the words; words that stay keep their recordings. */
export async function updateGroup(group: Group, name: string, lines: string[]) {
  const unique = [...new Set(lines)]
  if (name !== group.name) check(await db().from('word_groups').update({ name }).eq('id', group.id))

  const removed = group.words.filter((w) => !unique.includes(w.text))
  if (removed.length) {
    check(await db().from('words').delete().in('id', removed.map((w) => w.id)))
    for (const w of removed) await removeAudio(w.audio_path)
  }
  const added = unique
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => !group.words.some((w) => w.text === t))
  if (added.length) check(await db().from('words').insert(added.map(({ t, i }) => wordRow(group.id, t, i + 1))))
  for (const w of group.words) {
    const i = unique.indexOf(w.text)
    if (i >= 0 && w.sort_order !== i + 1)
      check(await db().from('words').update({ sort_order: i + 1 }).eq('id', w.id))
  }
  await refreshContent()
}

export async function deleteGroup(group: Group) {
  check(await db().from('word_groups').delete().eq('id', group.id))
  for (const w of group.words) await removeAudio(w.audio_path)
  await refreshContent()
}

export async function moveGroup(group: Group, direction: -1 | 1) {
  const groups = getContent().groups
  const i = groups.findIndex((g) => g.id === group.id)
  const other = groups[i + direction]
  if (!other) return
  check(await db().from('word_groups').update({ sort_order: other.sort_order }).eq('id', group.id))
  check(await db().from('word_groups').update({ sort_order: group.sort_order }).eq('id', other.id))
  await refreshContent()
}

export async function saveWordRecording(wordId: string, oldPath: string | null, blob: Blob) {
  const path = await uploadAudio('words', wordId, blob)
  check(await db().from('words').update({ audio_path: path }).eq('id', wordId))
  await removeAudio(oldPath)
  await refreshContent()
}

export async function deleteWordRecording(wordId: string, path: string | null) {
  check(await db().from('words').update({ audio_path: null }).eq('id', wordId))
  await removeAudio(path)
  await refreshContent()
}

// --- Praise clips ------------------------------------------------------------

export async function addPraiseClip(blob: Blob) {
  const path = await uploadAudio('praise', 'praise', blob)
  check(await db().from('praise_clips').insert({ audio_path: path }))
  await refreshContent()
}

export async function deletePraiseClip(id: string, path: string) {
  check(await db().from('praise_clips').delete().eq('id', id))
  await removeAudio(path)
  await refreshContent()
}
