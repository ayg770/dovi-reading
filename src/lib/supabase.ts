import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

/** null when env vars are missing — the games still work, they just don't save. */
export const supabase = url && key ? createClient(url, key) : null

export const LEARNER_NAME = 'דובי'

let userIdPromise: Promise<string | null> | null = null

export function getLearnerId(): Promise<string | null> {
  userIdPromise ??= (async () => {
    if (!supabase) return null
    const { data, error } = await supabase
      .from('users')
      .select('id')
      .eq('name', LEARNER_NAME)
      .limit(1)
      .maybeSingle()
    if (error) console.warn('supabase: could not load learner', error)
    return data?.id ?? null
  })()
  return userIdPromise
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
