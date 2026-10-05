import { useEffect, useState } from 'react'
import { BASIC_NIKUD_IDS } from '../data/hebrew'
import { ensureContent } from './content'
import { Item, groupItems, pairSyllableItems, randomSyllableItems } from './items'
import { Selection, roundsOf, windowItems } from './selection'

/**
 * The things a game plays: a window of the chosen group (only items with at least
 * `minSyllables` syllables), or made-up syllables / syllable pairs when single syllables
 * were chosen (or the group has nothing suitable).
 */
export function useGameItems(
  selection: Selection,
  game: string,
  opts: { minSyllables?: number; fallback: 'singles' | 'pairs' },
): { items: Item[] | null; groupName: string | null } {
  const [state, setState] = useState<{ items: Item[] | null; groupName: string | null }>({ items: null, groupName: null })

  useEffect(() => {
    void ensureContent().then((content) => {
      const rounds = roundsOf(selection)
      const group = selection.kind === 'group' ? content.groups.find((g) => g.id === selection.groupId) : null
      const usable = group ? groupItems(group).filter((i) => i.syllables.length >= (opts.minSyllables ?? 1)) : []
      if (group && usable.length) {
        setState({ items: windowItems(usable, `${group.id}:${game}`, rounds), groupName: group.name })
        return
      }
      const nikudIds = selection.kind === 'singles' ? selection.nikudIds : BASIC_NIKUD_IDS
      const count = rounds || 10
      setState({
        items: opts.fallback === 'pairs' ? pairSyllableItems(count, nikudIds) : randomSyllableItems(count, nikudIds),
        groupName: null,
      })
    })
  }, [selection, game])

  return state
}
