import { SupabaseClient, createClient } from '@supabase/supabase-js'
import type { WordSyllable } from '../data/hebrew'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

const PARENT_CODE_KEY = 'dovi-parent-code'

/** Headers must be Latin-1, and the code may be Hebrew: send it as base64 of its UTF-8 bytes. */
function encodeHeader(code: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(code)))
}

function makeClient(parentCode?: string | null): SupabaseClient | null {
  if (!url || !key) return null
  return createClient(url, key, {
    // No login: skip the auth machinery (and the warning about several auth clients).
    auth: { persistSession: false, autoRefreshToken: false, storageKey: parentCode ? 'dovi-parent' : 'dovi' },
    global: parentCode ? { headers: { 'x-parent-code': encodeHeader(parentCode) } } : undefined,
  })
}

function storedParentCode(): string | null {
  try {
    return sessionStorage.getItem(PARENT_CODE_KEY)
  } catch {
    return null
  }
}

/**
 * The client in use. After the parent enters their code it carries the code in the
 * x-parent-code header, which the database checks before allowing content edits.
 * null when env vars are missing — the games still work, they just don't save.
 */
export let supabase: SupabaseClient | null = makeClient(storedParentCode())

export function isParentUnlocked(): boolean {
  return !!storedParentCode()
}

export async function parentCodeExists(): Promise<boolean> {
  if (!supabase) return false
  const { data } = await supabase.rpc('parent_pin_exists')
  return !!data
}

/** Checks the code, and if right, switches to a client that sends it. */
export async function unlockParent(code: string): Promise<boolean> {
  if (!supabase) return false
  const { data } = await supabase.rpc('check_parent_pin', { pin: code })
  if (!data) return false
  try {
    sessionStorage.setItem(PARENT_CODE_KEY, code)
  } catch {
    // private mode: stays unlocked until reload
  }
  supabase = makeClient(code)
  return true
}

/** First-time setup, or change (then the current code must already be unlocked). */
export async function setParentCode(code: string): Promise<string | null> {
  if (!supabase) return 'אין חיבור לשרת'
  const { error } = await supabase.rpc('set_parent_pin', { new_pin: code })
  if (error) return error.message
  await unlockParent(code)
  return null
}

export function lockParent() {
  try {
    sessionStorage.removeItem(PARENT_CODE_KEY)
  } catch {
    // ignore
  }
  supabase = makeClient(null)
}

// ---------------------------------------------------------------------------
// Learner

export const LEARNER_NAME = 'דובי'

export type Learner = { id: string; current_group_id: string | null; stars: number }

let learnerPromise: Promise<Learner | null> | null = null

export function getLearner(): Promise<Learner | null> {
  learnerPromise ??= (async () => {
    if (!supabase) return null
    const { data, error } = await supabase
      .from('users')
      .select('id, current_group_id, stars')
      .eq('name', LEARNER_NAME)
      .limit(1)
      .maybeSingle()
    if (error) console.warn('supabase: could not load learner', error)
    return data ?? null
  })()
  return learnerPromise
}

export async function getLearnerId(): Promise<string | null> {
  return (await getLearner())?.id ?? null
}

function forgetLearner() {
  learnerPromise = null
}

export type ProgressRow = { letter_id: number; nikud_id: number; attempts: number; correct: number }

export async function loadProgress(): Promise<ProgressRow[]> {
  const userId = await getLearnerId()
  if (!supabase || !userId) return []
  const { data, error } = await supabase
    .from('progress')
    .select('letter_id, nikud_id, attempts, correct')
    .eq('user_id', userId)
  if (error) console.warn('supabase: could not load progress', error)
  return data ?? []
}

export async function startSession(gameType: string): Promise<string | null> {
  const userId = await getLearnerId()
  if (!supabase || !userId) return null
  const { data, error } = await supabase
    .from('game_sessions')
    .insert({ user_id: userId, game_type: gameType })
    .select('id')
    .single()
  if (error) console.warn('supabase: could not start session', error)
  return data?.id ?? null
}

export async function recordAnswer(letterId: number, nikudId: number, correct: boolean) {
  const userId = await getLearnerId()
  if (!supabase || !userId) return
  const { error } = await supabase.rpc('record_answer', {
    p_user: userId,
    p_letter: letterId,
    p_nikud: nikudId,
    p_correct: correct,
  })
  if (error) console.warn('supabase: could not record answer', error)
}

export async function finishSession(
  sessionId: string | null,
  total: number,
  correct: number,
  details: unknown[],
) {
  if (!supabase || !sessionId) return
  const { error } = await supabase
    .from('game_sessions')
    .update({
      finished_at: new Date().toISOString(),
      total_questions: total,
      correct_answers: correct,
      details,
    })
    .eq('id', sessionId)
  if (error) console.warn('supabase: could not finish session', error)
}

/** Add stars to the learner; returns the new total, or null offline. */
export async function addStars(count: number): Promise<number | null> {
  const userId = await getLearnerId()
  if (!supabase || !userId) return null
  const { data, error } = await supabase.rpc('add_stars', { p_user: userId, p_count: count })
  if (error) console.warn('supabase: could not add stars', error)
  return typeof data === 'number' ? data : null
}

/** Save answers as the game goes, so a game left in the middle still shows what happened. */
export async function saveSessionDetails(
  sessionId: string | null,
  total: number,
  correct: number,
  details: unknown[],
) {
  if (!supabase || !sessionId) return
  const { error } = await supabase
    .from('game_sessions')
    .update({ total_questions: total, correct_answers: correct, details })
    .eq('id', sessionId)
  if (error) console.warn('supabase: could not save answers', error)
}

/** Move the learner to the group after `fromGroupId`; returns its id, or null at the last group. */
export async function advanceGroup(fromGroupId: string): Promise<string | null> {
  const userId = await getLearnerId()
  if (!supabase || !userId) return null
  const { data, error } = await supabase.rpc('advance_group', { p_user: userId, p_from: fromGroupId })
  if (error) console.warn('supabase: could not advance group', error)
  forgetLearner()
  return data ?? null
}

export async function setCurrentGroup(groupId: string | null): Promise<string | null> {
  const userId = await getLearnerId()
  if (!supabase || !userId) return 'אין חיבור לשרת'
  const { error } = await supabase
    .from('users')
    .update({ current_group_id: groupId })
    .eq('id', userId)
  forgetLearner()
  return error?.message ?? null
}

// ---------------------------------------------------------------------------
// Content: groups, words, recordings, praise clips

export type Word = {
  id: string
  group_id: string
  text: string
  plain_text: string
  syllables: WordSyllable[]
  audio_path: string | null
  sort_order: number
}

export type Group = { id: string; name: string; sort_order: number; words: Word[] }

export type Recording = {
  id: string
  letter_id: number
  nikud_id: number | null
  audio_path: string
  source: 'static' | 'storage'
}

export type PraiseClip = { id: string; audio_path: string }

export type Content = {
  groups: Group[]
  recordings: Recording[]
  praise: PraiseClip[]
}

export async function loadContent(): Promise<Content> {
  const empty: Content = { groups: [], recordings: [], praise: [] }
  if (!supabase) return empty
  const [groups, words, recordings, praise] = await Promise.all([
    supabase.from('word_groups').select('id, name, sort_order').order('sort_order'),
    supabase
      .from('words')
      .select('id, group_id, text, plain_text, syllables, audio_path, sort_order')
      .order('sort_order'),
    supabase.from('recordings').select('id, letter_id, nikud_id, audio_path, source'),
    supabase.from('praise_clips').select('id, audio_path').order('created_at'),
  ])
  for (const r of [groups, words, recordings, praise])
    if (r.error) console.warn('supabase: could not load content', r.error)
  return {
    groups: (groups.data ?? []).map((g) => ({
      ...g,
      words: (words.data ?? []).filter((w) => w.group_id === g.id),
    })),
    recordings: recordings.data ?? [],
    praise: praise.data ?? [],
  }
}

export const AUDIO_BUCKET = 'audio'

export function storageUrl(path: string): string {
  if (!supabase) return ''
  return supabase.storage.from(AUDIO_BUCKET).getPublicUrl(path).data.publicUrl
}

function extensionFor(type: string): string {
  if (type.includes('mp4') || type.includes('m4a') || type.includes('aac')) return 'm4a'
  if (type.includes('ogg')) return 'ogg'
  if (type.includes('mpeg') || type.includes('mp3')) return 'mp3'
  if (type.includes('wav')) return 'wav'
  return 'webm'
}

/** Upload a recording; returns the storage path. */
export async function uploadAudio(folder: string, name: string, blob: Blob): Promise<string> {
  if (!supabase) throw new Error('אין חיבור לשרת')
  const type = blob.type.split(';')[0] || 'audio/webm'
  const path = `${folder}/${name}-${Date.now()}.${extensionFor(type)}`
  const { error } = await supabase.storage
    .from(AUDIO_BUCKET)
    .upload(path, blob, { contentType: type, upsert: true })
  if (error) throw new Error(error.message)
  return path
}

export async function removeAudio(path: string | null | undefined) {
  if (!supabase || !path) return
  const { error } = await supabase.storage.from(AUDIO_BUCKET).remove([path])
  if (error) console.warn('supabase: could not remove file', error)
}
