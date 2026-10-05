import { SupabaseClient, createClient } from '@supabase/supabase-js'
import type { Pronunciation, WordSyllable } from '../data/hebrew'
import { Account, currentAccount } from './account'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

/** Headers must be Latin-1, and the code may be Hebrew: send it as base64 of its UTF-8 bytes. */
function encodeHeader(code: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(code)))
}

function makeClient(account: Account | null): SupabaseClient | null {
  if (!url || !key) return null
  return createClient(url, key, {
    // No Supabase Auth: the user is identified by the two headers below.
    auth: { persistSession: false, autoRefreshToken: false, storageKey: 'dovi' },
    global: account
      ? { headers: { 'x-user-id': account.id, 'x-user-code': encodeHeader(account.code) } }
      : undefined,
  })
}

/**
 * The client in use. It carries the current user's id and code, which the database
 * checks (current_user_id()) before showing or changing any of that user's rows.
 * null when env vars are missing.
 */
export const supabase: SupabaseClient | null = makeClient(currentAccount())

// ---------------------------------------------------------------------------
// Accounts

const ERRORS: Record<string, string> = {
  'name taken': 'השם הזה כבר תפוס, נסו שם אחר',
  'name must be 1-40 characters': 'צריך שם (עד 40 תווים)',
  'code must be at least 4 characters': 'הקוד צריך להיות לפחות 4 תווים',
}

function message(error: { message: string }): string {
  return ERRORS[error.message] ?? error.message
}

/** Create a user; returns their id, or throws a message to show. */
export async function createUser(name: string, code: string, pronunciation: Pronunciation): Promise<string> {
  if (!supabase) throw new Error('אין חיבור לשרת')
  const { data, error } = await supabase.rpc('create_user', {
    p_name: name,
    p_code: code,
    p_pronunciation: pronunciation,
  })
  if (error) throw new Error(message(error))
  return data as string
}

/** The user's id if the name and code match, else null. */
export async function loginUser(name: string, code: string): Promise<string | null> {
  if (!supabase) throw new Error('אין חיבור לשרת')
  const { data, error } = await supabase.rpc('login_user', { p_name: name, p_code: code })
  if (error) throw new Error(message(error))
  return (data as string | null) ?? null
}

export async function changeCode(newCode: string): Promise<void> {
  if (!supabase) throw new Error('אין חיבור לשרת')
  const { error } = await supabase.rpc('change_code', { p_new_code: newCode })
  if (error) throw new Error(message(error))
}

// ---------------------------------------------------------------------------
// The current user

export type Learner = {
  id: string
  name: string
  pronunciation: Pronunciation
  current_group_id: string | null
  stars: number
}

let learnerPromise: Promise<Learner | null> | null = null

export function getLearner(): Promise<Learner | null> {
  learnerPromise ??= (async () => {
    const account = currentAccount()
    if (!supabase || !account) return null
    const { data, error } = await supabase
      .from('users')
      .select('id, name, pronunciation, current_group_id, stars')
      .eq('id', account.id)
      .maybeSingle()
    if (error) console.warn('supabase: could not load user', error)
    return data ?? null
  })()
  return learnerPromise
}

export async function getLearnerId(): Promise<string | null> {
  return currentAccount()?.id ?? null
}

function forgetLearner() {
  learnerPromise = null
}

export async function updateProfile(fields: { name?: string; pronunciation?: Pronunciation }) {
  const userId = await getLearnerId()
  if (!supabase || !userId) throw new Error('אין חיבור לשרת')
  const { error } = await supabase.from('users').update(fields).eq('id', userId)
  forgetLearner()
  if (error) throw new Error(error.message.includes('users_name_key') ? ERRORS['name taken'] : error.message)
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
  pronunciation: Pronunciation
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
    supabase.from('recordings').select('id, letter_id, nikud_id, audio_path, source, pronunciation'),
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

/** Temporary links for private recordings, valid for `hours`. */
export async function signAudio(paths: string[], hours = 12): Promise<Record<string, string>> {
  if (!supabase || !paths.length) return {}
  const { data, error } = await supabase.storage
    .from(AUDIO_BUCKET)
    .createSignedUrls(paths, hours * 3600)
  if (error) console.warn('supabase: could not sign recordings', error)
  const out: Record<string, string> = {}
  for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl
  return out
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
  const userId = await getLearnerId()
  if (!userId) throw new Error('אין משתמש מחובר')
  // Each user's files live under their own id; the storage policy checks it.
  const path = `${userId}/${folder}/${name}-${Date.now()}.${extensionFor(type)}`
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
