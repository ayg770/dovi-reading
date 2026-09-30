import { useEffect, useRef, useState } from 'react'
import { sfx } from '../../lib/audio'
import {
  ANIMALS,
  STARS_PER_ANIMAL,
  animalsEarned,
  dismissNewAnimal,
  nextAnimal,
  useStars,
} from '../../lib/stars'
import { Confetti } from './Confetti'

/**
 * The fixed row of stars: total, ten slots filling toward the next animal
 * (shown as a silhouette until earned), and the newest animal earned.
 */
export function StarBar() {
  const { stars, loaded, newAnimal } = useStars()
  const [pop, setPop] = useState(false)
  const prev = useRef(stars)

  // A little bounce whenever a star is added.
  useEffect(() => {
    if (loaded && stars > prev.current) {
      setPop(true)
      const t = setTimeout(() => setPop(false), 600)
      prev.current = stars
      return () => clearTimeout(t)
    }
    prev.current = stars
  }, [stars, loaded])

  const inRow = stars % STARS_PER_ANIMAL
  const next = nextAnimal(stars)
  const earned = animalsEarned(stars)
  const last = earned ? ANIMALS[earned - 1] : null

  return (
    <>
      <div className={pop ? 'star-bar pop' : 'star-bar'} aria-label={`${stars} כוכבים`}>
        <span className="star-total">
          ⭐<b>{stars}</b>
        </span>
        <span className="star-slots">
          {Array.from({ length: STARS_PER_ANIMAL }, (_, i) => (
            <span key={i} className={i < inRow ? 'slot on' : 'slot'}>
              {i < inRow ? '⭐' : ''}
            </span>
          ))}
        </span>
        {next ? (
          <span className="star-next" title="החיה הבאה">
            {next.emoji}
          </span>
        ) : (
          <span className="star-next earned">🏆</span>
        )}
        {last && <span className="star-last">{last.emoji}</span>}
      </div>
      {newAnimal && <NewAnimal emoji={newAnimal.emoji} onClose={dismissNewAnimal} />}
    </>
  )
}

function NewAnimal({ emoji, onClose }: { emoji: string; onClose: () => void }) {
  useEffect(() => {
    sfx.finish()
    const t = setTimeout(onClose, 5000)
    return () => clearTimeout(t)
  }, [onClose])
  return (
    <div className="new-animal" onClick={onClose}>
      <Confetti fire={1} big />
      <div className="new-animal-card">
        <span className="new-animal-emoji">{emoji}</span>
        <span className="new-animal-stars">⭐⭐⭐</span>
      </div>
    </div>
  )
}

/** All the animals: earned ones in color, the rest as silhouettes. */
export function AnimalCollection() {
  const { stars } = useStars()
  const earned = animalsEarned(stars)
  return (
    <div className="collection" aria-label="האוסף שלי">
      {ANIMALS.map((a, i) => (
        <span key={a.emoji} className={i < earned ? 'col-animal on' : 'col-animal'} title={i < earned ? a.name : ''}>
          {a.emoji}
        </span>
      ))}
    </div>
  )
}
