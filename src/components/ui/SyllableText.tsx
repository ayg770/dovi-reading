import type { WordSyllable } from '../../data/hebrew'

/** A word split into its syllables, with one of them lit (slow, syllable-by-syllable reading). */
export function SyllableText({ syllables, active }: { syllables: WordSyllable[]; active: number | null }) {
  return (
    <>
      {syllables.map((s, i) => (
        <span key={i} className={i === active ? 'syl-lit on' : 'syl-lit'}>
          {s.text}
        </span>
      ))}
    </>
  )
}
