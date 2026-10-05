import { useEffect, useRef, useState } from 'react'
import { speakUi } from '../../lib/audio'
import { t } from '../../lib/i18n'
import { ANIMALS, SCENES, STARS_PER_ANIMAL, animalsEarned, sceneAt, useStars } from '../../lib/stars'

const STEP = 104 // horizontal distance between stations
const HEIGHT = 230
const NODES = SCENES.length + 1 // the start and every station

const x = (i: number) => 60 + i * STEP
const y = (i: number) => HEIGHT / 2 + Math.sin(i * 0.95) * 44

/** Position along the road for a (fractional) station number. */
function at(p: number): { x: number; y: number } {
  const i = Math.min(NODES - 1, Math.max(0, Math.floor(p)))
  const f = Math.min(1, p - i)
  const j = Math.min(NODES - 1, i + 1)
  return { x: x(i) + (x(j) - x(i)) * f, y: y(i) + (y(j) - y(i)) * f }
}

/**
 * The journey: a winding road with a station every 10 stars. The traveler walks along it
 * as stars are earned; the animals of the stations already reached walk behind (tap one!).
 */
export function JourneyMap() {
  const { stars } = useStars()
  const scroller = useRef<HTMLDivElement>(null)
  const [wiggle, setWiggle] = useState<number | null>(null)

  const progress = Math.min(NODES - 1, stars / STARS_PER_ANIMAL)
  const reached = animalsEarned(stars)
  const me = at(progress)
  const width = x(NODES - 1) + 70

  // Bring the traveler to the middle of the view.
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollTo({ left: Math.max(0, me.x - el.clientWidth / 2), behavior: 'smooth' })
  }, [me.x])

  const road = Array.from({ length: NODES }, (_, i) => `${i ? 'L' : 'M'}${x(i)},${y(i)}`).join(' ')
  const walked = `M${x(0)},${y(0)} ` + Array.from({ length: Math.floor(progress) }, (_, k) => `L${x(k + 1)},${y(k + 1)}`).join(' ') + ` L${me.x},${me.y}`

  // The last few animals walk behind the traveler.
  const followers = ANIMALS.slice(0, reached).slice(-4)

  return (
    <div className="journey" ref={scroller} dir="ltr" aria-label={t('המסע שלי')}>
      <svg width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`}>
        <path d={road} className="road-bed" />
        <path d={road} className="road-future" />
        <path d={walked} className="road-walked" />
        {Array.from({ length: NODES }, (_, i) => {
          const passed = i <= reached
          const last = i === NODES - 1
          return (
            <g key={i} className={passed ? 'station passed' : 'station'} transform={`translate(${x(i)},${y(i)})`}>
              <circle r={last ? 30 : 24} />
              <text className="scene" textAnchor="middle" dy={last ? '0.38em' : '0.36em'} fontSize={last ? 34 : 26}>
                {sceneAt(i)}
              </text>
            </g>
          )
        })}
        {followers.map((a, k) => {
          const pos = at(Math.max(0, progress - 0.32 * (followers.length - k)))
          const index = reached - followers.length + k
          return (
            <text
              key={a.emoji}
              x={pos.x}
              y={pos.y - 26}
              textAnchor="middle"
              fontSize={30}
              className={wiggle === index ? 'follower wiggle' : 'follower'}
              onClick={() => {
                setWiggle(index)
                void speakUi(t(a.name) + '!')
                window.setTimeout(() => setWiggle(null), 900)
              }}
            >
              {a.emoji}
            </text>
          )
        })}
        <text x={me.x} y={me.y - 28} textAnchor="middle" fontSize={40} className="traveler">
          🧒
        </text>
      </svg>
    </div>
  )
}
