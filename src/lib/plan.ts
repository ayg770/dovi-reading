import { NIKUD } from '../data/hebrew'
import { Stage, UNITS, Unit } from '../data/curriculum'
import { createGroup } from './admin'
import { ensureContent } from './content'
import { t } from './i18n'
import { UnitProgress, setCurrentGroup } from './supabase'

const nikudName = (id: number | null) => {
  const n = NIKUD.find((x) => x.id === id)
  return n ? t(n.name) : ''
}

export function stageName(stage: Stage): string {
  if (stage.nikudId) return nikudName(stage.nikudId)
  if (stage.key === 'mixed') return t('כל התנועות יחד')
  if (stage.key === 'closed') return t('שווא והברות סגורות')
  return t('טקסטים')
}

export function stageTitle(stage: Stage): string {
  return t('שלב {n}: {name}', { n: stage.n, name: stageName(stage) })
}

export function unitTitle(u: Unit): string {
  const base = u.nikudId ? nikudName(u.nikudId) : u.stage === 9 ? t('כל התנועות יחד') : u.stage === 10 ? t('מילים') : t('טקסטים')
  const kind =
    u.kind === 'singles' ? t('הברות בודדות') : u.kind === 'pairs' ? t('שתי הברות') : u.kind === 'triples' ? t('שלוש הברות') : u.kind === 'words' ? '' : t('קריאת תהילים וטקסטים')
  const part = u.parts > 1 ? ` (${u.part})` : ''
  return `${base}${kind && u.kind !== 'texts' ? ' · ' + kind : u.kind === 'texts' ? ' · ' + kind : ''}${part}`
}

/** Copy a unit into the user's own groups (once) and make it the current group; returns the group id. */
export async function installUnit(u: Unit): Promise<string> {
  const content = await ensureContent()
  const have = content.groups.find((g) => g.unit_code === u.code)
  if (have) {
    await setCurrentGroup(have.id)
    return have.id
  }
  const id = await createGroup(`${t('שלב {n}: {name}', { n: u.stage, name: unitTitle(u) })}`, u.items, 'words', u.code)
  await setCurrentGroup(id)
  return id
}

export type UnitStatus = 'new' | 'going' | 'done'

export function statusOf(p: UnitProgress | undefined): UnitStatus {
  if (!p) return 'new'
  if (p.done) return 'done'
  return p.sessions > 0 ? 'going' : 'new'
}

/** The first unit that is not done: where the next lesson goes. */
export function nextUnit(progress: UnitProgress[]): Unit | null {
  return UNITS.find((u) => u.kind !== 'texts' && !progress.find((p) => p.unit_code === u.code)?.done) ?? null
}

export const accuracy = (p: UnitProgress | undefined) => (p && p.total ? Math.round((p.correct / p.total) * 100) : null)
